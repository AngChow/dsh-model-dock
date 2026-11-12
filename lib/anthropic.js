/**
 * Anthropic Messages ↔ OpenAI Chat Completions conversion.
 *
 * Claude Code (and the Anthropic SDK) speak `/v1/messages`; the lanes speak
 * OpenAI chat completions through their loopback shims. This module converts
 * the request, the non-streaming response, and the streaming SSE event
 * sequence (text + tool_use), so the gateway can serve both protocols on the
 * same port and key.
 *
 * @module dsh-model-dock/anthropic
 */

function blocksOf(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return Array.isArray(content) ? content : []
}

function textOf(content) {
  return blocksOf(content)
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
}

function openAiContent(content) {
  const parts = []
  let hasImage = false
  for (const block of blocksOf(content)) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push({ type: 'text', text: block.text })
    } else if (block?.type === 'image' && block.source?.type === 'base64' && typeof block.source.data === 'string') {
      hasImage = true
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${block.source.media_type ?? 'image/png'};base64,${block.source.data}` },
      })
    }
  }
  if (!hasImage) return parts.map(part => part.text).join('')
  return parts
}

function toolResultText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(block => block?.type === 'text' && typeof block.text === 'string')
      .map(block => block.text)
      .join('')
  }
  return ''
}

function parseArguments(value) {
  if (typeof value !== 'string' || value === '') return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function openAiToolChoice(choice) {
  if (choice === undefined || choice === null) return undefined
  if (choice.type === 'auto') return 'auto'
  if (choice.type === 'any') return 'required'
  if (choice.type === 'none') return 'none'
  if (choice.type === 'tool' && typeof choice.name === 'string') {
    return { type: 'function', function: { name: choice.name } }
  }
  return undefined
}

/**
 * Convert an Anthropic Messages request into an OpenAI chat-completions body.
 * The caller replaces `model` with the resolved lane model id.
 */
export function toOpenAIChat(input) {
  const messages = []
  const system = textOf(input.system)
  if (system !== '') messages.push({ role: 'system', content: system })

  for (const message of Array.isArray(input.messages) ? input.messages : []) {
    if (message?.role === 'user') {
      const content = openAiContent(message.content)
      const hasContent = Array.isArray(content) ? content.length > 0 : content !== ''
      if (hasContent) messages.push({ role: 'user', content })
      for (const block of blocksOf(message.content)) {
        if (block?.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue
        messages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: toolResultText(block.content) })
      }
    } else if (message?.role === 'assistant') {
      let text = ''
      const toolCalls = []
      for (const block of blocksOf(message.content)) {
        if (block?.type === 'text' && typeof block.text === 'string') text += block.text
        else if (block?.type === 'tool_use' && typeof block.name === 'string') {
          toolCalls.push({
            id: typeof block.id === 'string' ? block.id : `toolu_${toolCalls.length}`,
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
          })
        }
      }
      if (text !== '' || toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: text,
          ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
        })
      }
    }
  }

  const tools = (Array.isArray(input.tools) ? input.tools : [])
    .filter(tool => typeof tool?.name === 'string')
    .map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: typeof tool.description === 'string' ? tool.description : '',
        parameters: tool.input_schema ?? { type: 'object', properties: {} },
      },
    }))

  const body = {
    messages,
    max_tokens: Number.isFinite(input.max_tokens) ? input.max_tokens : 4096,
    stream: input.stream === true,
  }
  if (tools.length > 0) body.tools = tools
  const toolChoice = openAiToolChoice(input.tool_choice)
  if (toolChoice !== undefined) body.tool_choice = toolChoice
  if (Number.isFinite(input.temperature)) body.temperature = input.temperature
  if (Number.isFinite(input.top_p)) body.top_p = input.top_p
  if (Array.isArray(input.stop_sequences) && input.stop_sequences.length > 0) body.stop = input.stop_sequences
  return body
}

function stopReasonOf(finishReason, hasTools) {
  if (hasTools) return 'tool_use'
  if (finishReason === 'length') return 'max_tokens'
  return 'end_turn'
}

/** Convert an OpenAI chat-completion object into an Anthropic message. */
export function toAnthropicMessage(openai, model) {
  const choice = Array.isArray(openai?.choices) ? openai.choices[0] : undefined
  const message = choice?.message ?? {}
  const content = []
  if (typeof message.content === 'string' && message.content !== '') {
    content.push({ type: 'text', text: message.content })
  }
  for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    content.push({
      type: 'tool_use',
      id: typeof call.id === 'string' ? call.id : `toolu_${content.length}`,
      name: call.function?.name ?? '',
      input: parseArguments(call.function?.arguments),
    })
  }
  if (content.length === 0) content.push({ type: 'text', text: '' })
  return {
    id: typeof openai?.id === 'string' ? openai.id : `msg_${Date.now().toString(36)}`,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stopReasonOf(choice?.finish_reason, content.some(block => block.type === 'tool_use')),
    stop_sequence: null,
    usage: {
      input_tokens: Number.isFinite(openai?.usage?.prompt_tokens) ? openai.usage.prompt_tokens : 0,
      output_tokens: Number.isFinite(openai?.usage?.completion_tokens) ? openai.usage.completion_tokens : 0,
    },
  }
}

export function anthropicError(type, message) {
  return { type: 'error', error: { type, message } }
}

/**
 * Stream an OpenAI SSE response as the Anthropic event sequence.
 *
 * Text becomes one text block; every OpenAI tool_call becomes a tool_use block
 * with `input_json_delta` fragments. The caller has already written the HTTP
 * 200/SSE headers.
 */
export async function streamAnthropic(upstream, res, model, inputTokens = 0) {
  const id = `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  let started = false
  let nextIndex = 0
  let textIndex = -1
  let textOpen = false
  const tools = new Map()
  let finishReason = null
  let outputTokens = 0

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  const start = () => {
    if (started) return
    started = true
    send('message_start', {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: inputTokens, output_tokens: 0 },
      },
    })
  }
  const openText = () => {
    if (textOpen) return
    textIndex = nextIndex
    nextIndex += 1
    textOpen = true
    send('content_block_start', { type: 'content_block_start', index: textIndex, content_block: { type: 'text', text: '' } })
  }
  const closeBlocks = () => {
    if (textOpen) {
      send('content_block_stop', { type: 'content_block_stop', index: textIndex })
      textOpen = false
    }
    for (const entry of [...tools.values()].sort((a, b) => a.index - b.index)) {
      send('content_block_stop', { type: 'content_block_stop', index: entry.index })
    }
    tools.clear()
  }

  let buffer = ''
  const decoder = new TextDecoder()
  const consumeEvent = (raw) => {
    for (const line of raw.split(/\r?\n/u)) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '' || data === '[DONE]') continue
      let chunk
      try {
        chunk = JSON.parse(data)
      } catch {
        continue
      }
      if (Number.isFinite(chunk.usage?.completion_tokens)) outputTokens = chunk.usage.completion_tokens
      const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined
      if (choice === undefined) continue
      start()
      const delta = choice.delta ?? {}
      if (typeof delta.content === 'string' && delta.content !== '') {
        openText()
        send('content_block_delta', {
          type: 'content_block_delta',
          index: textIndex,
          delta: { type: 'text_delta', text: delta.content },
        })
      }
      for (const call of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        const key = Number.isInteger(call.index) ? call.index : 0
        let entry = tools.get(key)
        if (entry === undefined) {
          entry = {
            index: nextIndex,
            id: typeof call.id === 'string' && call.id !== '' ? call.id : `toolu_${key}`,
            name: call.function?.name ?? '',
          }
          nextIndex += 1
          tools.set(key, entry)
          send('content_block_start', {
            type: 'content_block_start',
            index: entry.index,
            content_block: { type: 'tool_use', id: entry.id, name: entry.name, input: {} },
          })
        }
        if (typeof call.function?.name === 'string' && entry.name === '') entry.name = call.function.name
        if (typeof call.function?.arguments === 'string' && call.function.arguments !== '') {
          send('content_block_delta', {
            type: 'content_block_delta',
            index: entry.index,
            delta: { type: 'input_json_delta', partial_json: call.function.arguments },
          })
        }
      }
      if (typeof choice.finish_reason === 'string' && choice.finish_reason !== '') finishReason = choice.finish_reason
    }
  }

  try {
    for await (const chunk of upstream) {
      buffer += decoder.decode(chunk, { stream: true })
      let split
      while ((split = buffer.search(/\r?\n\r?\n/u)) !== -1) {
        const raw = buffer.slice(0, split)
        buffer = buffer.slice(split).replace(/^\r?\n\r?\n/u, '')
        consumeEvent(raw)
      }
    }
    if (buffer.trim() !== '') consumeEvent(buffer)
    start()
    // Anthropic clients expect at least one content block; a reasoning-only
    // finish (max_tokens before any visible text) would otherwise be empty.
    if (!textOpen && tools.size === 0) openText()
    const hadTools = tools.size > 0
    closeBlocks()
    send('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: stopReasonOf(finishReason, hadTools), stop_sequence: null },
      usage: { output_tokens: outputTokens },
    })
    send('message_stop', { type: 'message_stop' })
    res.end()
  } catch {
    closeBlocks()
    send('error', anthropicError('api_error', 'upstream stream failed'))
    res.end()
  }
}
