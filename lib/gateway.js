/**
 * Local OpenAI-compatible gateway.
 *
 * The lanes already speak OpenAI through their loopback shims; this server is
 * a stable, user-facing front door for other tools (Cline/Roo/Continue/OpenAI
 * SDK, and — via a later Anthropic adapter — Claude Code). It binds 127.0.0.1
 * only and requires a generated bearer key; the lane shims keep their own
 * per-process secrets, so no upstream token is ever exposed here.
 *
 * Model ids are namespaced as `<provider>/<model>` (for example
 * `safe_workbuddy/hy4free`), because the same model id can exist in several
 * lanes.
 *
 * @module dsh-model-dock/gateway
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { anthropicError, streamAnthropic, toAnthropicMessage, toOpenAIChat } from './anthropic.js'

const CONFIG_FILENAME = 'gateway.json'
const DEFAULT_PORT = 18666
const MAX_BODY = 8 * 1024 * 1024

function sameSecret(presented, expected) {
  if (typeof presented !== 'string' || expected === '') return false
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

function json(res, status, body, extra = {}) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    ...extra,
  })
  res.end(text)
}

function openAiError(res, status, message, type = 'invalid_request_error') {
  json(res, status, { error: { message, type, code: status } })
}

async function readBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY) return undefined
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Some shims always stream (the Qwen bridge), even when the caller asked for
 * `stream:false`. Merge their SSE chunks into one OpenAI completion object so
 * both the OpenAI and Anthropic non-stream surfaces stay non-stream.
 */
async function aggregateOpenAiSse(stream) {
  let buffer = ''
  let id = ''
  let model = ''
  let created = Math.floor(Date.now() / 1000)
  let content = ''
  let reasoning = ''
  let finishReason = null
  let usage = null
  const tools = new Map()
  const decoder = new TextDecoder()
  const consume = (raw) => {
    for (const line of raw.split(/\r?\n/u)) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '' || data === '[DONE]') continue
      let chunk
      try { chunk = JSON.parse(data) } catch { continue }
      if (typeof chunk.id === 'string' && chunk.id !== '') id = chunk.id
      if (typeof chunk.model === 'string' && chunk.model !== '') model = chunk.model
      if (Number.isFinite(chunk.created)) created = chunk.created
      if (chunk.usage !== undefined && chunk.usage !== null) usage = chunk.usage
      const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined
      if (choice === undefined) continue
      const delta = choice.delta ?? {}
      if (typeof delta.content === 'string') content += delta.content
      if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content
      for (const call of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        const key = Number.isInteger(call.index) ? call.index : 0
        let entry = tools.get(key)
        if (entry === undefined) {
          entry = { id: call.id ?? '', type: 'function', function: { name: '', arguments: '' } }
          tools.set(key, entry)
        }
        if (typeof call.id === 'string' && call.id !== '') entry.id = call.id
        if (typeof call.function?.name === 'string' && call.function.name !== '') entry.function.name = call.function.name
        if (typeof call.function?.arguments === 'string') entry.function.arguments += call.function.arguments
      }
      if (typeof choice.finish_reason === 'string' && choice.finish_reason !== '') finishReason = choice.finish_reason
    }
  }
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true })
    let split
    while ((split = buffer.search(/\r?\n\r?\n/u)) !== -1) {
      const raw = buffer.slice(0, split)
      buffer = buffer.slice(split).replace(/^\r?\n\r?\n/u, '')
      consume(raw)
    }
  }
  if (buffer.trim() !== '') consume(buffer)
  const message = { role: 'assistant', content }
  if (reasoning !== '') message.reasoning_content = reasoning
  if (tools.size > 0) message.tool_calls = [...tools.values()]
  return {
    id: id || `chatcmpl-${Date.now().toString(36)}`,
    object: 'chat.completion',
    created,
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason ?? (tools.size > 0 ? 'tool_calls' : 'stop'),
    }],
    usage: usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  }
}

/** A model list row for `/v1/models`. */
function modelRow(provider, model) {
  return {
    id: `${provider}/${model.id}`,
    object: 'model',
    created: 0,
    owned_by: provider,
    provider,
    name: model.name,
    display_name: model.name,
    free: model.billing?.free === true,
    rate: model.billing?.credits ?? model.billing?.rate,
    context_window: model.contextWindow,
  }
}

function anthropicErrorResponse(res, status, type, message) {
  json(res, status, anthropicError(type, message))
}

export class LocalGateway {
  /**
   * @param {object} options
   * @param {string} options.dataDir Plugin data directory.
   * @param {() => Array<object>} options.lanes Lane descriptors: provider,
   *   displayName, models(), baseUrl(), token().
   * @param {() => void} [options.onChange] Called whenever the status changes.
   * @param {object} [options.logger]
   */
  constructor(options) {
    this.dataDir = options.dataDir
    this.lanes = options.lanes
    this.onChange = options.onChange
    this.logger = options.logger
    this.configPath = join(this.dataDir, CONFIG_FILENAME)
    this.server = undefined
    this.error = undefined
    this.config = this.readConfig()
    if (this.config.key === '') {
      this.config.key = randomBytes(32).toString('hex')
      this.saveConfig()
    }
  }

  readConfig() {
    let parsed
    try {
      parsed = JSON.parse(readFileSync(this.configPath, 'utf8'))
    } catch {
      parsed = undefined
    }
    const port = Number(parsed?.port)
    return {
      version: 1,
      enabled: parsed?.enabled === true,
      port: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_PORT,
      key: typeof parsed?.key === 'string' && parsed.key !== '' ? parsed.key : '',
    }
  }

  saveConfig() {
    try {
      mkdirSync(dirname(this.configPath), { recursive: true })
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), { mode: 0o600 })
    } catch (error) {
      this.logger?.warn?.('dsh-model-dock: could not save gateway config', error)
    }
  }

  status() {
    return {
      enabled: this.config.enabled,
      running: this.server !== undefined,
      port: this.config.port,
      key: this.config.key,
      endpoint: `http://127.0.0.1:${this.config.port}/v1`,
      ...(this.error === undefined ? {} : { error: this.error }),
      models: this.modelRows().length,
      modelList: this.modelRows(),
    }
  }

  modelRows() {
    const rows = []
    for (const lane of this.lanes()) {
      let models = []
      try {
        models = lane.models() ?? []
      } catch {
        models = []
      }
      for (const model of models) {
        if (typeof model?.id !== 'string' || model.id === '') continue
        rows.push(modelRow(lane.provider, model))
      }
    }
    return rows
  }

  resolve(requested) {
    const lanes = this.lanes()
    const slash = requested.indexOf('/')
    if (slash > 0) {
      const provider = requested.slice(0, slash)
      const modelId = requested.slice(slash + 1)
      const lane = lanes.find(entry => entry.provider === provider)
      return lane === undefined ? undefined : { lane, modelId }
    }
    const matches = []
    for (const lane of lanes) {
      for (const model of lane.models() ?? []) {
        if (model.id === requested) matches.push({ lane, modelId: requested })
      }
    }
    return matches.length === 1 ? matches[0] : undefined
  }

  async setEnabled(enabled) {
    this.config.enabled = enabled === true
    this.saveConfig()
    if (this.config.enabled) await this.start()
    else await this.stop()
    this.onChange?.()
    return this.status()
  }

  async setPort(port) {
    const next = Number(port)
    if (!Number.isInteger(next) || next < 1024 || next > 65535) {
      return { ok: false, error: '端口必须在 1024-65535 之间' }
    }
    const wasRunning = this.server !== undefined
    if (wasRunning) await this.stop()
    this.config.port = next
    this.saveConfig()
    if (wasRunning || this.config.enabled) await this.start()
    this.onChange?.()
    return { ok: this.error === undefined, ...this.status() }
  }

  regenerateKey() {
    this.config.key = randomBytes(32).toString('hex')
    this.saveConfig()
    this.onChange?.()
    return this.status()
  }

  async start() {
    if (this.server !== undefined) return
    this.error = undefined
    const server = createServer((req, res) => {
      void this.handle(req, res).catch(error => {
        this.logger?.warn?.('dsh-model-dock: gateway request failed', error)
        if (!res.headersSent) openAiError(res, 500, error instanceof Error ? error.message : String(error), 'server_error')
        else res.end()
      })
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.config.port, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve()
      })
    }).catch(error => {
      this.error = error instanceof Error ? error.message : String(error)
      this.logger?.warn?.('dsh-model-dock: gateway listen failed', error)
    })
    if (this.error === undefined) {
      this.server = server
      this.logger?.info?.(`dsh-model-dock: local API listening on http://127.0.0.1:${this.config.port}/v1`)
    }
    this.onChange?.()
  }

  async stop() {
    const server = this.server
    this.server = undefined
    if (server === undefined) return
    await new Promise(resolve => {
      server.close(() => resolve())
      server.closeAllConnections?.()
    })
    this.onChange?.()
  }

  async close() {
    await this.stop()
  }

  allowed(req) {
    const header = req.headers.authorization
    const bearer = typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
      ? header.slice(7).trim()
      : ''
    const apiKey = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'].trim() : ''
    return sameSecret(bearer, this.config.key) || sameSecret(apiKey, this.config.key)
  }

  async handle(req, res) {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-headers', 'authorization, content-type, x-api-key')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/health') {
      json(res, 200, { ok: true, service: 'dsh-model-dock-gateway' })
      return
    }
    if (!this.allowed(req)) {
      if (url.pathname.startsWith('/v1/messages')) anthropicErrorResponse(res, 401, 'authentication_error', 'invalid API key')
      else openAiError(res, 401, 'invalid API key', 'authentication_error')
      return
    }
    if (req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/models')) {
      json(res, 200, { object: 'list', data: this.modelRows() })
      return
    }
    if (req.method === 'POST' && (url.pathname === '/v1/chat/completions' || url.pathname === '/chat/completions')) {
      await this.chat(req, res)
      return
    }
    if (req.method === 'POST' && url.pathname === '/v1/messages') {
      await this.anthropicChat(req, res)
      return
    }
    if (req.method === 'POST' && url.pathname === '/v1/messages/count_tokens') {
      await this.countTokens(req, res)
      return
    }
    if (url.pathname.startsWith('/v1/messages')) {
      anthropicErrorResponse(res, 404, 'not_found_error', `not found: ${url.pathname}`)
      return
    }
    openAiError(res, 404, `not found: ${url.pathname}`, 'not_found')
  }

  async countTokens(req, res) {
    const raw = await readBody(req)
    if (raw === undefined) {
      anthropicErrorResponse(res, 413, 'request_too_large', 'request body too large')
      return
    }
    let body
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      anthropicErrorResponse(res, 400, 'invalid_request_error', 'request body is not JSON')
      return
    }
    const text = JSON.stringify(body)
    // Rough estimate; Claude Code only uses it for its own budgeting.
    json(res, 200, { input_tokens: Math.max(1, Math.ceil(text.length / 4)) })
  }

  async anthropicChat(req, res) {
    const raw = await readBody(req)
    if (raw === undefined) {
      anthropicErrorResponse(res, 413, 'request_too_large', 'request body too large')
      return
    }
    let input
    try {
      input = JSON.parse(raw.toString('utf8'))
    } catch {
      anthropicErrorResponse(res, 400, 'invalid_request_error', 'request body is not JSON')
      return
    }
    if (typeof input?.model !== 'string' || input.model === '') {
      anthropicErrorResponse(res, 400, 'invalid_request_error', 'model is required')
      return
    }
    const resolved = this.resolve(input.model)
    if (resolved === undefined) {
      const available = this.modelRows().slice(0, 30).map(row => row.id).join(', ')
      anthropicErrorResponse(res, 404, 'not_found_error',
        `unknown model ${input.model}. Set ANTHROPIC_MODEL to one of: ${available}`)
      return
    }
    const baseUrl = resolved.lane.baseUrl()
    const token = resolved.lane.token()
    if (baseUrl === undefined || token === undefined) {
      anthropicErrorResponse(res, 503, 'api_error', `lane ${resolved.lane.provider} is not ready`)
      return
    }
    const openaiBody = toOpenAIChat(input)
    openaiBody.model = resolved.modelId
    let upstream
    try {
      upstream = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: input.stream === true ? 'text/event-stream' : 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(openaiBody),
      })
    } catch (error) {
      anthropicErrorResponse(res, 502, 'api_error',
        `upstream request failed: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (upstream.status !== 200) {
      const text = await upstream.text().catch(() => '')
      let message = text.slice(0, 2000)
      try {
        const parsed = JSON.parse(text)
        message = parsed?.error?.message ?? parsed?.message ?? message
      } catch {
        // Keep the raw text.
      }
      anthropicErrorResponse(res, upstream.status, upstream.status === 401 ? 'authentication_error' : 'api_error',
        message || `upstream HTTP ${upstream.status}`)
      return
    }
    if (input.stream !== true) {
      const contentType = upstream.headers.get('content-type') ?? ''
      if (contentType.includes('text/event-stream') && upstream.body !== null) {
        const document = await aggregateOpenAiSse(upstream.body)
        json(res, 200, toAnthropicMessage(document, input.model))
        return
      }
      const document = await upstream.json()
      json(res, 200, toAnthropicMessage(document, input.model))
      return
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    if (upstream.body === null) {
      res.end()
      return
    }
    const estimatedInput = Math.max(1, Math.ceil(JSON.stringify(input).length / 4))
    await streamAnthropic(upstream.body, res, input.model, estimatedInput)
  }

  async chat(req, res) {
    const raw = await readBody(req)
    if (raw === undefined) {
      openAiError(res, 413, 'request body too large')
      return
    }
    let body
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      openAiError(res, 400, 'request body is not JSON')
      return
    }
    if (typeof body?.model !== 'string' || body.model === '') {
      openAiError(res, 400, 'model is required')
      return
    }
    const resolved = this.resolve(body.model)
    if (resolved === undefined) {
      openAiError(res, 404, `unknown model ${body.model}; use <provider>/<model> from GET /v1/models`, 'model_not_found')
      return
    }
    const baseUrl = resolved.lane.baseUrl()
    const token = resolved.lane.token()
    if (baseUrl === undefined || token === undefined) {
      openAiError(res, 503, `lane ${resolved.lane.provider} is not ready`, 'service_unavailable')
      return
    }
    let upstream
    try {
      upstream = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: typeof req.headers.accept === 'string' ? req.headers.accept : '*/*',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...body, model: resolved.modelId }),
      })
    } catch (error) {
      openAiError(res, 502, `upstream request failed: ${error instanceof Error ? error.message : String(error)}`, 'upstream_error')
      return
    }
    if (upstream.status !== 200) {
      const text = await upstream.text().catch(() => '')
      openAiError(res, upstream.status, text.slice(0, 2000) || `upstream HTTP ${upstream.status}`, 'upstream_error')
      return
    }
    const contentType = upstream.headers.get('content-type') ?? ''
    if (upstream.body === null) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end('{}')
      return
    }
    if (contentType.includes('text/event-stream') && body.stream !== true) {
      const document = await aggregateOpenAiSse(upstream.body)
      json(res, 200, document)
      return
    }
    if (!contentType.includes('text/event-stream')) {
      const text = await upstream.text()
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(text)
      return
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    const reader = upstream.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!res.write(Buffer.from(value))) {
          await new Promise(resolve => res.once('drain', resolve))
        }
      }
    } catch {
      // A client that disconnects mid-stream is not a server error.
    } finally {
      res.end()
    }
  }
}
