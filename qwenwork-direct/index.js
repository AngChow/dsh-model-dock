/**
 * 千问办公（QwenWork）— direct gateway lane.
 *
 * Unlike the ACP agent protocol, the model gateway is **stateless**: one
 * `agent_chat_generation` request per chat completion, no QwenWork
 * conversation is created, and the full message history is forwarded every
 * time. That is both faster (no sandbox start) and invisible in the QwenWork
 * UI, which is why the market bridges use it.
 *
 * The COSY signing and OpenAI translation are vendored from
 * `pi-provider-qwenwork`; this module only owns:
 *   - credential discovery (shared with the ACP lane's desktop-auth reader),
 *   - the loopback HTTP server and its bearer,
 *   - provider registration and the status/restart routes the dock panel uses.
 *
 * @module dsh-model-dock/qwenwork-direct
 */
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { createChatShimHandler } from './lib/chat-shim.js'
import { FALLBACK_QWENWORK_MODELS, formatRate } from './lib/models.js'
import { fetchChatModesCatalog } from './lib/catalog.js'
import { MODEL_IDENTITIES, PROVIDER_IDS } from '../lib/ids.js'
import { readCredential, diagnoseDesktop, lastCredentialFailure } from '../qwenwork/desktop-auth.js'
import { createWorkBuddyAdapter } from '../lib/adapter.js'

export const name = 'llm-qwenwork-direct'
export const inject = ['llm']

/** Panel status/restart routes (same-origin, loopback only). */
const STATUS_PATH = '/plugins/dsh-model-dock/qwenwork/status'
const RESTART_PATH = '/plugins/dsh-model-dock/qwenwork/restart'

/**
 * 实时目录的刷新节奏。
 *
 * 千问办公的模型目录跟着上游活动走（`frontier-1` 的「限时2折」、新模型上线、
 * 倍率调整）。写死的目录正是这次「模型和倍率都和 App 不一样」的根因，所以
 * 车道启动后主动拉一次，此后每 30 分钟一次；面板打开（`/status`）时超过
 * 5 分钟没刷新也会顺手补一次。拉取失败**不覆盖**上一份可用目录。
 */
const CATALOG_REFRESH_MS = 30 * 60 * 1000
const CATALOG_STALE_MS = 5 * 60 * 1000
/** 失败后的重试间隔：面板每轮询一次就重打上游会把它当异常流量。 */
const CATALOG_RETRY_MS = 60 * 1000


function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(payload) })
  res.end(payload)
}

function isLoopback(req) {
  const address = req.socket?.remoteAddress ?? ''
  if (!(address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1')) return false
  const host = String(req.headers.host ?? '').split(':')[0].replace(/^\[|\]$/g, '')
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

export async function apply(ctx) {
  const state = {
    server: undefined,
    port: 0,
    key: randomBytes(32).toString('hex'),
    credential: undefined,
    error: undefined,
    detected: Array.isArray(diagnoseDesktop().userDataDirs) && diagnoseDesktop().userDataDirs.some(entry => entry.exists === true),
    /** 当前生效的目录：启动时是静态回退，拉取成功后整体替换为上游实时目录。 */
    models: FALLBACK_QWENWORK_MODELS,
    catalogSource: 'fallback',
    catalogFetchedAt: 0,
    catalogAttemptAt: 0,
    catalogError: undefined,
    catalogPromise: undefined,
  }

  const logger = {
    info: (...args) => ctx.logger?.info?.('dsh-model-dock/qwenwork:', ...args),
    warn: (...args) => ctx.logger?.warn?.('dsh-model-dock/qwenwork:', ...args),
    error: (...args) => ctx.logger?.error?.('dsh-model-dock/qwenwork:', ...args),
  }

  /**
   * In-process hand-off to the local API gateway (lib/index.js).
   *
   * The Qwen shim is owned by this separate plugin row, so the gateway cannot
   * reach its ephemeral port/key through the normal lane registry. Both rows
   * live in the same host process; publishing a tiny live descriptor is enough
   * and never leaves the process.
   */
  const publishGatewayLane = () => {
    globalThis.__dshModelDockQwenLane = {
      provider: PROVIDER_IDS.qwenwork,
      displayName: '千问办公',
      models: () => state.models.map(model => ({
        id: model.displayNameId ?? model.id,
        name: model.shortName ?? model.displayNameId ?? model.id,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        billing: {
          free: model.billingRate === 0,
          credits: Number.isFinite(model.billingRate) ? `x${model.billingRate.toFixed(2)}` : undefined,
        },
      })),
      baseUrl: () => state.server === undefined ? undefined : `http://127.0.0.1:${state.port}`,
      token: () => state.key,
    };
  };

  /** One credential read per request; the shim caches the signer per token. */
  const getDocument = async () => {
    const credential = readCredential()
    if (credential === undefined) throw new Error('未找到千问办公登录态：请先打开 QwenWork 桌面版并登录')
    state.credential = credential
    state.error = undefined
    return credential.document
  }

  /**
   * 图片模态只在宿主真的提供持久化附件服务时才声明。
   *
   * `dsh-llm-pi-ai` 对「描述符声明 image 但没有 `resolveAttachments`」的请求
   * 会直接抛 `pi-ai image input requires the durable attachment service`，
   * 连纯文本对话都会失败；所以声明与能力必须一起给（见 models.js 的说明）。
   */
  const imagesEnabled = () => {
    try {
      return ctx.get?.('attachments') !== undefined
    } catch {
      return false
    }
  }

  /**
   * 选择器/面板共用的目录视图（`dsh-model-dock/adapter` 的契约）。
   *
   * 每次调用都读 `state.models`，因此目录刷新后 `invalidate()` 一跑，模型
   * 选择器立刻跟着变；倍率来自上游 `price_factor`，不再写死。
   */
  const catalog = {
    current: () => state.models.map(model => ({
      id: model.displayNameId ?? model.id,
      name: model.shortName ?? model.displayNameId ?? model.id,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      supportsImages: imagesEnabled() && model.supportsImages === true,
      billing: {
        credits: formatRate(model.billingRate),
        free: model.billingRate === 0,
        badges: model.badges ?? [],
      },
      reasoning: { supports: false },
    })),
  }

  /** 目录签名：只在真的变了时才重建 provider（避免无谓的 adapters-updated）。 */
  const catalogSignature = models => models
    .map(model => `${model.id}:${model.billingRate}:${model.supportsImages === true ? 1 : 0}`)
    .join('|')

  let built

  /**
   * 拉取实时目录。
   *
   * 失败时保留上一份可用目录：令牌过期/断网不该让模型选择器清空，面板会
   * 通过 `catalogError` 如实说明「目录是旧的」。
   */
  const refreshCatalog = (options = {}) => {
    const now = Date.now()
    const fresh = state.catalogFetchedAt !== 0 && now - state.catalogFetchedAt <= CATALOG_STALE_MS
    const recentlyTried = state.catalogAttemptAt !== 0 && now - state.catalogAttemptAt < CATALOG_RETRY_MS
    if (options.force !== true && (fresh || recentlyTried)) return Promise.resolve(state.models)
    if (state.catalogPromise !== undefined) return state.catalogPromise
    state.catalogAttemptAt = now

    state.catalogPromise = (async () => {
      try {
        const credential = readCredential()
        const token = credential?.document?.token
        if (typeof token !== 'string' || token === '') {
          throw new Error('没有可用的千问办公访问令牌：请先打开 QwenWork 桌面版并登录')
        }
        state.credential = credential
        const { models } = await fetchChatModesCatalog({ token })
        const changed = catalogSignature(models) !== catalogSignature(state.models)
        state.models = models
        state.catalogSource = 'live'
        state.catalogFetchedAt = Date.now()
        state.catalogError = undefined
        if (changed) {
          built?.invalidate()
          ctx.emit?.('llm/adapters-updated')
        }
        logger.info('模型目录已更新', models.map(model => `${model.id} x${model.billingRate}`).join(', '))
        return models
      } catch (error) {
        state.catalogError = error instanceof Error ? error.message : String(error)
        logger.warn('模型目录拉取失败，继续使用上一份目录：', state.catalogError)
        return state.models
      } finally {
        state.catalogPromise = undefined
      }
    })()
    return state.catalogPromise
  }

  /** Start (or restart) the loopback endpoint and return its origin. */
  const listen = async () => {
    if (state.server !== undefined) {
      await new Promise(resolve => state.server.close(() => resolve()))
      state.server.closeAllConnections?.()
    }
    state.key = randomBytes(32).toString('hex')
    // The shim captures its shared secret at construction, so it must be
    // rebuilt whenever the key is rotated (initial start and restart alike).
    const handler = createChatShimHandler({
      getCredential: getDocument,
      sharedSecret: state.key,
      // 实时目录：shim 用它在 `model_config` 里填 `is_vl` / `is_reasoning`，
      // 并把对外展示 id（如 `qwen3.8-flash`）换回上游 key（`flash`）。
      getModels: () => state.models,
      logger,
    })
    const server = createServer((req, res) => {
      if (!isLoopback(req)) {
        writeJson(res, 403, { error: { message: 'loopback only', type: 'forbidden' } })
        return
      }
      if (req.url === '/healthz') {
        writeJson(res, 200, { ok: true })
        return
      }
      void handler(req, res)
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    state.server = server
    state.port = server.address().port
    publishGatewayLane()
    return `http://127.0.0.1:${state.port}`
  }

  try {
    await listen()
  } catch (error) {
    state.error = `千问办公本地桥启动失败：${error instanceof Error ? error.message : String(error)}`
    logger.error(state.error)
    return
  }

  // The shim reads the key and origin through these getters, so a restart only
  // replaces the values and invalidates the model descriptors.
  const shim = {
    baseUrl: () => `http://127.0.0.1:${state.port}`,
    token: () => state.key,
  }

  try {
    built = createWorkBuddyAdapter({
      shim,
      catalog,
      providerId: PROVIDER_IDS.qwenwork,
      displayName: '千问办公 (QwenWork)',
      modelIdentity: MODEL_IDENTITIES.qwenwork,
      reasoningDefault: false,
      // 懒查宿主附件服务：声明了 image 模态的模型（flash / frontier-1 /
      // qwen3.8-max-preview）才能真正收到图片；没有该服务时 `imagesEnabled()`
      // 会把模态退回 text，不会让请求在 pi-ai 里直接失败。
      resolveAttachments: () => ctx.get?.('attachments'),
    })
    const release = ctx.llm.registerAdapter([PROVIDER_IDS.qwenwork], built.adapter)
    ctx.effect(() => () => {
      try { release() } catch { /* already gone */ }
      if (globalThis.__dshModelDockQwenLane?.provider === PROVIDER_IDS.qwenwork) {
        delete globalThis.__dshModelDockQwenLane
      }
      state.server?.close?.()
    })
  } catch (error) {
    state.error = `千问办公 provider 注册失败：${error instanceof Error ? error.message : String(error)}`
    logger.error(state.error)
    return
  }

  // 注册完再拉目录：headless 宿主可能在 fiber ready 的瞬间就开始第一轮，等目录
  // 回来再注册会丢掉这场竞速。拉到后 `invalidate()` 把新模型/倍率推给选择器。
  void refreshCatalog({ force: true })
  const catalogTimer = setInterval(() => { void refreshCatalog({ force: true }) }, CATALOG_REFRESH_MS)
  catalogTimer.unref?.()
  ctx.effect(() => () => clearInterval(catalogTimer))

  const statusDocument = () => {
    let credential
    try {
      credential = readCredential()
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error)
    }
    state.credential = credential
    const credentialError = credential === undefined ? lastCredentialFailure() : undefined
    return {
      version: 1,
      detected: state.detected,
      enabled: true,
      bridge: state.server === undefined
        ? { running: false, error: state.error }
        : { running: true, baseUrl: `http://127.0.0.1:${state.port}` },
      credential: credential === undefined ? undefined : credential.describe(),
      ...(credentialError === undefined || credentialError === '' ? {} : { credentialError }),
      // 面板看到的就是选择器正在用的那份目录（实时或回退），倍率来自上游
      // `price_factor`。`catalogSource` 让用户知道这份是不是实时拉到的。
      catalogSource: state.catalogSource,
      catalogFetchedAt: state.catalogFetchedAt === 0 ? undefined : state.catalogFetchedAt,
      catalogError: state.catalogError,
      catalog: state.models.map(model => ({
        id: model.displayNameId ?? model.id,
        upstreamKey: model.id,
        name: model.shortName ?? model.displayNameId ?? model.id,
        description: model.description,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        priceFactor: model.billingRate,
        isReasoning: model.isReasoning !== false,
        supportsImages: imagesEnabled() && model.supportsImages === true,
        isDefault: model.isDefault === true,
        ...(model.badges !== undefined && model.badges.length > 0 ? { badges: model.badges } : {}),
      })),
      lastError: state.error,
    }
  }

  ctx.inject(['webServer'], (webCtx) => {
    const webServer = webCtx.webServer
    if (webServer === undefined || typeof webServer.register !== 'function') return
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: STATUS_PATH,
      handler: (req, res) => {
        if (req.method !== 'GET') { writeJson(res, 405, { error: 'method not allowed' }); return }
        if (!isLoopback(req)) { writeJson(res, 403, { error: 'loopback only' }); return }
        // 面板打开就是一次「用户在看目录」的信号：目录超过 5 分钟没刷新就补一次，
        // 不阻塞这次响应（面板下一次轮询就能看到新目录）。
        void refreshCatalog()
        writeJson(res, 200, statusDocument())
      },
    }))
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: RESTART_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') { writeJson(res, 405, { error: 'method not allowed' }); return }
        if (!isLoopback(req)) { writeJson(res, 403, { error: 'loopback only' }); return }
        try {
          await listen()
          await refreshCatalog({ force: true })
          built.invalidate()
          ctx.emit?.('llm/adapters-updated')
          writeJson(res, 200, { ok: true, ...statusDocument() })
        } catch (error) {
          state.error = error instanceof Error ? error.message : String(error)
          writeJson(res, 500, { ok: false, error: state.error })
        }
      },
    }))
  })
}
