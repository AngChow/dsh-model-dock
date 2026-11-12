/**
 * dsh-model-dock — host half.
 *
 * Registers a `workbuddy` and a `workbuddy-ai` LLM provider whose models are
 * served by the WorkBuddy desktop products (CN: `copilot.tencent.com`;
 * international: `www.workbuddy.ai`).
 *
 * The upstream is a closed, client-shaped API: it gates on the User-Agent, it
 * refuses a body whose first message is not a system prompt, it rejects the
 * OpenAI-only `store` field, it accepts `tool_choice` only in its string form,
 * it answers `stream: true` only, and it wants a whole family of attribution
 * headers. None of that can live in the profile config, so the plugin owns the
 * wire format through a loopback shim: pi-ai speaks plain OpenAI-completions
 * to the shim, and the shim speaks WorkBuddy to the gateway.
 *
 * The credential is the plugin's own: a device-authorization login, obtained
 * by the settings card, refreshed on demand. Nothing is read out of the
 * desktop app's own state, so the plugin works whether or not that app is
 * installed.
 *
 * @module dsh-model-dock
 */
import { execFile } from 'node:child_process'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { WorkBuddyCredentialStore, WorkBuddyLoginClient, readJsonFile, writeJsonAtomic } from './auth.js'
import { WorkBuddyCatalog, fallbackFor } from './catalog.js'
import { createWorkBuddyAdapter } from './adapter.js'
import { createWorkBuddyShim } from './shim.js'
import { WorkBuddyUpstreamClient, modelWithCurrentPromotion, prepareChatBody, prepareInternationalChatBody, realmOf, regionOf } from './upstream.js'
import { readDesktopCredential, readDesktopSessionSummary, findDesktopExecutable } from './atrest.js'
import { discoverProfileDir, workbuddyPluginDataDir, workbuddyStateDir } from './paths.js'
import { checkForUpdate, updateSpecFrom } from './updates.js'
import { MODEL_IDENTITIES, PROVIDER_IDS, SAFE_PREFIX, isOwnProviderId } from './ids.js'
import { WORKBUDDY_VARIANTS, variantFor } from './variants.js'
import { LocalGateway } from './gateway.js'
import { QoderLane } from './qoder.js'
import { REPAIR_SYSTEM_PROMPT, buildRepairUserMessage, parseRepairDecision } from './repair.js'

export const name = 'llm-model-dock'
export const inject = ['llm']

/**
 * The version the card shows, read from the package manifest.
 *
 * A second literal beside `package.json` drifts the moment one is bumped and
 * the other is not, and the card then reports a version the installed files do
 * not have. Reading the manifest keeps the two the same by construction; the
 * fallback covers a host that loads this module from outside a package.
 */
const PLUGIN_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  } catch {
    return '0.0.0'
  }
})()

/** How often the model catalog is refreshed from the upstream. */
const CATALOG_REFRESH_MS = 30 * 60_000

/** How often the credit balance is refreshed for the card. */
const CREDITS_REFRESH_MS = 5 * 60_000

/** Base path of this plugin's same-origin card routes. */
const ROUTE_BASE = '/plugins/dsh-model-dock'

/**
 * Desktop clients the dock knows how to discover, including the ones whose
 * model lane is not wired yet.
 *
 * Detection is a cheap `existsSync` over the platform's install locations, so
 * the panel can say "Qoder is installed, its lane is next" without pretending
 * the lane already works. The WorkBuddy rows are served by the runtime itself;
 * their availability is reported per variant as `desktopAvailable`.
 */
const KNOWN_CLIENTS = [
  {
    id: 'qoder',
    name: 'Qoder',
    lane: 'planned',
    candidates: () => {
      const home = homedir()
      if (process.platform === 'darwin') return [join('/Applications', 'Qoder.app'), join(home, 'Applications', 'Qoder.app')]
      if (process.platform === 'win32') {
        return [
          join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'Qoder', 'Qoder.exe'),
          join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Qoder', 'Qoder.exe'),
        ]
      }
      return [join(home, '.local', 'share', 'applications', 'qoder.desktop')]
    },
  },
]

/** Installed clients among {@link KNOWN_CLIENTS}. */
function detectKnownClients() {
  return KNOWN_CLIENTS.map(client => ({
    id: client.id,
    name: client.name,
    lane: client.lane,
    installed: client.candidates().some(path => {
      try {
        return existsSync(path)
      } catch {
        return false
      }
    }),
  }))
}

/**
 * Per-process control keys, minted once so a fiber hot-reload does not 403 the
 * open card.
 */
let processKeys
function controlKeys() {
  processKeys ??= {
    login: randomBytes(24).toString('hex'),
    models: randomBytes(24).toString('hex'),
    auth: randomBytes(24).toString('hex'),
    update: randomBytes(24).toString('hex'),
    probe: randomBytes(24).toString('hex'),
    repair: randomBytes(24).toString('hex'),
    gateway: randomBytes(24).toString('hex'),
  }
  return processKeys
}

/**
 * The guard every state-changing card route shares: a loopback Host and
 * Origin, plus the in-process key the card receives with its status document.
 *
 * Loopback alone is *not* authentication — any local process can address
 * `127.0.0.1`, and these routes write a credential to disk.
 */
function routeGuard(req, key) {
  const host = req.headers.host
  if (typeof host !== 'string' || !/^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(host)) return false
  const origin = req.headers.origin
  if (origin !== undefined && !/^https?:\/\/(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(String(origin))) return false
  const presented = req.headers['x-dsh-model-dock-key']
  if (typeof presented !== 'string') return false
  const a = Buffer.from(presented)
  const b = Buffer.from(key)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Read a route body with a hard ceiling. */
async function readRouteBody(req, limit = 65536) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > limit) return undefined
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Strip token-like content from a message before it reaches the browser. */
function safeMessage(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[redacted token]')
    .replace(/(\b(?:code|token|pat)=)[^&\s]+/giu, '$1[redacted]')
    .slice(0, 500)
}

/** Keychain items each macOS lane may hold its Chromium Safe Storage key in. */
const execFileAsync = promisify(execFile)

const MAC_KEYCHAIN_SERVICES = {
  qoder: ['Qoder App Safe Storage'],
  'qoder-cn': ['Qoder CN App Safe Storage', 'Qoder CN Safe Storage', 'Qoder App Safe Storage', 'Qoder Safe Storage'],
  qwenwork: ['QwenWorkCN Safe Storage', 'QwenWork Safe Storage', 'QwenWorkDev Safe Storage', 'QwenWorkCanary Safe Storage'],
}

/**
 * Explicit, user-clicked keychain authorization.
 *
 * The startup probes stay bounded (5s) so a suppressed prompt cannot block
 * plugin activation. This one waits 60s because a human is looking at the
 * dialog; success also adds `/usr/bin/security` to the item's ACL, so later
 * reads no longer prompt. The retrieved password is discarded here — the lane
 * reads it again itself.
 */
async function authorizeMacKeychain(provider) {
  const services = MAC_KEYCHAIN_SERVICES[provider]
  if (services === undefined) return { ok: false, error: '这个车道不使用钥匙串' }
  let lastError = ''
  for (const service of services) {
    try {
      // Async on purpose: a 60s system prompt must not freeze the host's
      // event loop (status polls, other lanes) while the human answers it.
      await execFileAsync('security', ['find-generic-password', '-s', service, '-w'], {
        encoding: 'utf8',
        timeout: 60_000,
      })
      return { ok: true, service }
    } catch (error) {
      if (error?.code === 'ETIMEDOUT' || error?.signal === 'SIGTERM') {
        return {
          ok: false,
          error: `等待钥匙串授权超时：系统没有弹出「${service}」授权窗口。请在终端执行 security find-generic-password -s "${service}" -w 并点「始终允许」。`,
        }
      }
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  return { ok: false, error: `钥匙串授权失败：${lastError || '没有找到可用条目'}` }
}

/**
 * One variant's whole runtime: credential store, catalog, upstream client,
 * shim, and adapter.
 *
 * The pieces are per variant rather than per plugin because the two products
 * disagree about almost everything: which upstream realm a credential belongs
 * to, which catalog document answers, which chat path is served, and which
 * credential file is written. Sharing one instance would mean every one of
 * those decisions carried a variant parameter.
 */
class VariantRuntime {
  /**
   * @param {object} variant The variant descriptor.
   * @param {object} options Constructor dependencies.
   */
  constructor(variant, options) {
    this.variant = variant
    this.logger = options.logger
    this.dataDir = options.dataDir
    this.stateDir = options.stateDir
    this.client = options.client
    this.login = options.login
    this.onChange = options.onChange
    /** Pending login attempts, keyed by the upstream's state string. */
    this.attempts = new Map()

    this.catalog = new WorkBuddyCatalog({ region: variant.region, initial: fallbackFor(variant.region) })
    this.store = new WorkBuddyCredentialStore({
      variant,
      refresh: credential => this.client.refreshToken(credential),
    })
    this.settings = readJsonFile(join(this.dataDir, variant.settingsFilename)) ?? {}
    if (Array.isArray(this.settings.disabledModels)) this.catalog.setDisabledModels(this.settings.disabledModels)
    if (this.settings.useMaximumContextWindow === true) this.catalog.setUseMaximumContextWindow(true)
    // The picker starts free-only: a paid row is useful only after the user
    // opts in, and a fresh install should never accidentally bill a request.
    this.showPaidModels = this.settings.showPaidModels === true
    this.credits = undefined
    this.creditsError = undefined
    /**
     * Whether the upstream has refused this credential since the last
     * successful call.
     *
     * The desktop app rotates its own session behind the plugin's back, so a
     * stored token can go stale while the card still reads "signed in". The
     * upstream saying so is the only reliable signal, and the card needs it:
     * without it the user sees a stale badge and an unexplained 401.
     */
    this.sessionStale = false
    /**
     * The upstream's own explanation while it has this account restricted.
     *
     * A restriction is not a dead session: the credential is valid and
     * re-authenticating changes nothing (measured 2026-11-08 — a token minted
     * seconds earlier was refused, and the official desktop app was refused on
     * the same account). Only an appeal lifts it, so the card says that
     * instead of offering the "import the desktop session" fix.
     */
    this.accountRestricted = undefined
  }

  /** Record that the upstream refused the stored credential. */
  markSessionStale() {
    if (this.sessionStale) return
    this.sessionStale = true
    this.onChange?.()
  }

  /** Forget a stale-session mark, after a call the upstream accepted. */
  markSessionFresh() {
    if (!this.sessionStale) return
    this.sessionStale = false
    this.onChange?.()
  }

  /** Record that the upstream restricted this account, keeping its own words. */
  markAccountRestricted(reason) {
    if (this.accountRestricted === reason) return
    this.accountRestricted = reason
    this.onChange?.()
  }

  /** Forget a restriction mark, after a call the upstream accepted. */
  markAccountFresh() {
    if (this.accountRestricted === undefined) return
    this.accountRestricted = undefined
    this.onChange?.()
  }

  /** The saved-catalog path for this variant. */
  catalogPath() {
    return join(this.stateDir, this.variant.catalogFilename)
  }

  /** The settings path for this variant. */
  settingsPath() {
    return join(this.dataDir, this.variant.settingsFilename)
  }

  /** Persist the settings this variant owns. */
  saveSettings() {
    writeJsonAtomic(this.settingsPath(), {
      version: 1,
      disabledModels: this.catalog.disabledModels(),
      useMaximumContextWindow: this.catalog.useMaximumContextWindow === true,
      showPaidModels: this.showPaidModels === true,
    })
  }

  /**
   * Seed the catalog from the account's last successful live list, so a
   * restart serves the same roster the account actually had.
   */
  seedFromSavedCatalog() {
    const saved = readJsonFile(this.catalogPath())
    if (!Array.isArray(saved?.models) || saved.models.length === 0) return
    this.catalog.set(saved.models, 'saved', saved.fetchedAtMs)
  }

  /**
   * Refresh the model catalog from the upstream.
   *
   * The three-level degradation is explicit: a successful fetch becomes
   * `live`, a failure leaves whatever was in force (saved or fallback) and
   * records the reason, so the card can say which one the user is looking at.
   */
  async refreshCatalog() {
    try {
      const credential = await this.store.resolve()
      const models = await this.client.fetchModels(credential)
      // The rows are stored RAW: a promotion is re-derived on every read
      // (it is time-boxed, so a cached "Free now" must stop claiming itself
      // when the window closes). Applying it here as well would layer the
      // badge on twice — once by the fetch and once by every read.
      this.catalog.set(models, 'live', Date.now())
      this.catalog.lastError = undefined
      writeJsonAtomic(this.catalogPath(), {
        version: 1,
        fetchedAtMs: this.catalog.fetchedAtMs,
        models,
      })
      this.onChange?.()
      return true
    } catch (error) {
      this.catalog.lastError = safeMessage(error)
      this.logger?.warn?.(`dsh-model-dock: ${this.variant.displayName} catalog refresh failed`, error)
      return false
    }
  }

  /** Refresh the credit balance for the card. */
  async refreshCredits() {
    try {
      const credential = await this.store.resolve()
      this.credits = await this.client.fetchCredits(credential)
      this.creditsError = undefined
    } catch (error) {
      this.creditsError = safeMessage(error)
    }
  }

  /**
   * The status document this variant contributes to the card.
   *
   * Never throws: a status read must never be the thing that breaks the card.
   */
  /**
   * The rows the DSH model picker may list for this variant.
   *
   * Catalog membership is the picker's only source, so filtering here is what
   * makes "free only" true end to end; the panel still receives the full
   * catalog in {@link status} so it can show what is being hidden.
   */
  adapterModels() {
    const models = this.catalog.all()
    return this.showPaidModels === true ? models : models.filter(model => model.billing?.free === true)
  }

  /** Persist the picker's free-only choice. */
  setShowPaidModels(enabled) {
    this.showPaidModels = enabled === true
    this.settings.showPaidModels = this.showPaidModels
    this.saveSettings()
  }

  async status() {
    const auth = await this.store.status()
    const desktopExecutable = findDesktopExecutable()
    // `catalog.all()` already re-derives the current promotion; applying it a
    // second time here would repeat its badge.
    const disabled = this.catalog.disabledModels()
    const models = this.catalog.all().map(current => ({
      id: current.id,
      name: current.name,
      contextWindow: current.contextWindow,
      maxTokens: current.maxTokens,
      defaultContextWindow: current.defaultContextWindow,
      supportedContextWindows: current.supportedContextWindows,
      supportsImages: current.supportsImages === true,
      free: current.billing?.free === true,
      rate: current.billing?.rateUnknown === true ? null : current.billing?.credits,
      rateUnknown: current.billing?.rateUnknown === true,
      badges: current.billing?.badges ?? [],
      efforts: current.reasoning?.supportedEfforts ?? [],
      enabled: !disabled.includes(current.id),
    }))
    return {
      provider: this.variant.id,
      displayName: this.variant.displayName,
      appName: this.variant.appName,
      region: this.variant.region,
      signInUrl: this.variant.signInUrl,
      // Whether the desktop app is installed, so the card can offer the
      // one-click import. The check is a few `existsSync` calls — it never
      // spawns the app, so it is cheap enough for a status poll.
      // `desktopAvailable` only says the platform supports the import path;
      // `installed` is the app-bundle probe the card uses to mark a channel
      // "未安装" without hiding it.
      desktopAvailable: desktopExecutable !== undefined,
      installed: desktopExecutable !== undefined,
      auth: { ...auth, sessionStale: this.sessionStale, accountRestricted: this.accountRestricted },
      // Why the automatic desktop import did not happen, when it was tried.
      ...(this.desktopError === undefined ? {} : { desktopError: this.desktopError }),
      catalog: {
        source: this.catalog.source,
        fetchedAt: this.catalog.fetchedAtMs,
        error: this.catalog.lastError,
        models,
      },
      credits: this.credits ?? null,
      creditsError: this.creditsError ?? null,
      useMaximumContextWindow: this.catalog.useMaximumContextWindow === true,
      showPaidModels: this.showPaidModels === true,
    }
  }
}

/**
 * Start the providers: one runtime, one shim and one adapter per variant.
 *
 * An empty catalog hides the model group in DSH's picker, which is how a
 * provider with nothing to serve disappears without touching registration.
 */
export async function apply(ctx, config = {}) {
  const dataDir = workbuddyPluginDataDir()
  const stateDir = workbuddyStateDir()
  // The profile whose lockfile records this installed copy. Discovered once at
  // startup: it is the manifest-and-link resolution `paths.js` already performs
  // for the data directory, and it cannot change while this process runs.
  const profileDir = discoverProfileDir()
  const client = new WorkBuddyUpstreamClient()
  const login = new WorkBuddyLoginClient()
  const { login: loginKey, models: modelsKey, auth: authKey, update: updateKey, probe: probeKey, repair: repairKey, gateway: gatewayKey } = controlKeys()

  const runtimes = new Map()
  const adapters = new Map()
  const shims = new Map()
  const disposers = []

  // The Qoder lane is independent of the WorkBuddy runtimes: its credential,
  // catalog and loopback transport all belong to that product. It publishes
  // the same loopback-adapter shape, so a catalog change invalidates it the
  // same way.
  let qoderAdapter
  let qoderAdapterError
  /** The id the Qoder adapter actually owns; see registerQoderAdapter. */
  let qoderProviderId = PROVIDER_IDS.qoder
  const qoder = new QoderLane({
    logger: ctx.logger,
    dataDir,
    onChange: () => refresh(),
  })

  /** Re-snapshot every adapter after a catalog change. */
  const refresh = () => {
    for (const built of adapters.values()) built.invalidate()
    qoderAdapter?.invalidate()
    ctx.emit('llm/adapters-updated')
  }

  for (const variant of WORKBUDDY_VARIANTS) {
    const runtime = new VariantRuntime(variant, {
      logger: ctx.logger,
      dataDir,
      stateDir,
      client,
      login,
      onChange: refresh,
    })
    runtime.seedFromSavedCatalog()
    // A variant with no credential shows no models at all: offering the
    // compiled-in roster to a signed-out user would advertise models that can
    // only fail.
    const auth = await runtime.store.status()
    runtime.catalog.setVisible(auth.state === 'signed-in')
    runtimes.set(variant.id, runtime)

    // The shim speaks to the upstream; the adapter speaks to the shim.
    const shim = createWorkBuddyShim({
      store: runtime.store,
      client,
      catalog: runtime.catalog,
      logger: ctx.logger,
      prepareBody: (raw, options) => (variant.region === 'global'
        ? prepareInternationalChatBody(raw, options)
        : prepareChatBody(raw, options)),
      defaultEffortFor: id => runtime.catalog.current().find(entry => entry.id === id)?.reasoning?.defaultEffort,
      // The upstream refusing the stored credential is the only trustworthy
      // signal that the session was rotated away; the card turns it into a
      // visible hint instead of a stale "signed in" badge.
      onSessionDead: () => {
        runtime.markSessionStale()
        // The desktop app owns the session and rotates it behind our back, so
        // re-adopt the *same account* automatically. Without this, a machine
        // whose desktop app refreshed its token shows a permanent 401 until
        // the user finds the "import" button.
        void adoptDesktopSession(runtime, true)
      },
      // A restriction is a different failure with a different fix, so it gets
      // its own mark rather than sharing the stale-session one.
      onAccountRestricted: reason => runtime.markAccountRestricted(reason),
      onSessionFresh: () => {
        runtime.markSessionFresh()
        // An accepted call also proves a restriction is gone (an appeal, or a
        // restriction the upstream lifted on its own), so the warning must not
        // outlive the condition it describes.
        runtime.markAccountFresh()
      },
      // `DSH_WORKBUDDY_DUMP_BODY=/tmp/wb-body.json` records the exact request
      // this process sends, which is the only way to tell a body-shape refusal
      // from a credential one.
      ...process.env['DSH_WORKBUDDY_DUMP_BODY'] === undefined
        ? {}
        : { dumpBodyPath: process.env['DSH_WORKBUDDY_DUMP_BODY'] },
    })
    shims.set(variant.id, shim)

    const built = createWorkBuddyAdapter({
      shim,
      // The picker reads this view, not the raw catalog: free-only by default.
      catalog: { current: () => runtime.adapterModels() },
      providerId: variant.id,
      displayName: variant.displayName,
      // The identity every model of this route advertises. It is shared across
      // the two regions on purpose — see `modelIdentityKeysOf`.
      modelIdentity: variant.modelIdentity,
      // Lazy service lookup: the adapter asks for the host's attachment
      // service only when a request actually carries an image.
      resolveAttachments: () => ctx.get('attachments'),
    })
    adapters.set(variant.id, built)
  }

  // Stable local OpenAI-compatible front door for other tools. It proxies to
  // the same loopback shims the DSH adapters use, so tools, streaming and
  // reasoning effort keep the lanes' existing wire handling.
  const gateway = new LocalGateway({
    dataDir,
    logger: ctx.logger,
    onChange: refresh,
    lanes: () => {
      const lanes = []
      for (const [id, shim] of shims) {
        const runtime = runtimes.get(id)
        lanes.push({
          provider: id,
          displayName: runtime?.variant.displayName ?? id,
          // The gateway lists every model the lane serves, including paid
          // ones the DSH picker may hide: external tools choose explicitly.
          models: () => runtime?.catalog.all() ?? [],
          baseUrl: () => shim.baseUrl(),
          token: () => shim.token(),
        })
      }
      lanes.push({
        provider: qoderProviderId,
        displayName: 'Qoder',
        models: () => qoder.models,
        baseUrl: () => qoder.baseUrl,
        token: () => qoder.token,
      })
      const qwenLane = globalThis.__dshModelDockQwenLane
      if (qwenLane !== undefined) lanes.push(qwenLane)
      return lanes
    },
  })
  if (gateway.status().enabled) void gateway.start()
  ctx.effect(() => () => {
    void gateway.close()
  })

  // Register synchronously, before any await: the headless host starts its
  // first turn the moment the fiber is ready and does not await an async setup
  // continuation, so an adapter registered after an `await` loses the race.
  for (const [id, built] of adapters) {
    try {
      const releaseAdapter = ctx.llm.registerAdapter([id], built.adapter)
      disposers.push(releaseAdapter)
    } catch (error) {
      ctx.logger?.error?.(`dsh-model-dock: registerAdapter failed for ${id}`, error)
    }
  }
  try {
    const releaseDirectory = ctx.llm.registerConfigurableProviders([
      ...WORKBUDDY_VARIANTS.map(variant => ({
        provider: variant.id,
        displayName: variant.displayName,
        settingsNs: ctx.fiber?.entry?.options?.id ?? variant.id,
        settingsPath: [],
        declared: false,
      })),
      {
        provider: qoderProviderId,
        displayName: 'Qoder',
        settingsNs: ctx.fiber?.entry?.options?.id ?? qoderProviderId,
        settingsPath: [],
        declared: false,
      },
    ])
    disposers.push(releaseDirectory)
  } catch (error) {
    ctx.logger?.error?.('dsh-model-dock: registerConfigurableProviders failed', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // A disposer that throws must not stop the others.
      }
    }
  })

  // Qoder comes up asynchronously: reading its IDE credential and minting the
  // gateway session costs a couple of round trips, and the WorkBuddy routes
  // must not wait for them. Once its loopback proxy is listening, the adapter
  // is registered and the picker gains the Qoder group.
  const registerQoderAdapter = () => {
    if (qoderAdapter !== undefined) return
    // Provider ids are global to the host. Another dock (自由模型坞) also
    // registers a `qoder` provider, and whichever loads second used to lose
    // the id silently — the lane looked signed in while every call was answered
    // by the other plugin's unconfigured Qoder ("未配置凭据，请先登录").
    // Try the canonical id first, then fall back to ids nobody else claims.
    for (const candidate of [PROVIDER_IDS.qoder, `${PROVIDER_IDS.qoder}-dock`, `${PROVIDER_IDS.qoder}-alt`]) {
      try {
        const built = createWorkBuddyAdapter({
          shim: {
            baseUrl: () => qoder.baseUrl,
            token: () => qoder.token,
          },
          catalog: qoder.catalog,
          providerId: candidate,
          displayName: 'Qoder',
          modelIdentity: MODEL_IDENTITIES.qoder,
          // Qoder's proxy owns the per-model effort default (the catalog's
          // thinking_config differs model by model). A provider-wide default
          // would be rejected by pi-ai before the request for any model that
          // does not list that level.
          reasoningDefault: false,
          resolveAttachments: () => ctx.get('attachments'),
        })
        disposers.push(ctx.llm.registerAdapter([candidate], built.adapter))
        qoderAdapter = built
        qoderProviderId = candidate
        qoderAdapterError = undefined
        if (candidate !== PROVIDER_IDS.qoder) {
          ctx.logger?.warn?.(`dsh-model-dock: provider "${PROVIDER_IDS.qoder}" is taken; Qoder lane registered as "${candidate}"`)
        }
        refresh()
        return
      } catch (error) {
        qoderAdapterError = safeMessage(error)
        if (!/already registered/iu.test(qoderAdapterError)) break
      }
    }
    ctx.logger?.error?.('dsh-model-dock: Qoder adapter registration failed', qoderAdapterError)
  }
  // The lane calls this every time it reaches the ready state, including a
  // retry after a failed boot or a desktop re-import — a lane that failed once
  // must not stay invisible in the picker for the rest of the session.
  qoder.onReady = registerQoderAdapter
  void qoder.start()

  ctx.effect(() => () => {
    void qoder.close()
  })

  /**
   * Adopt the desktop app's session on a cold start when this plugin has no
   * credential of its own.
   *
   * This is what makes the dock zero-configuration: a user who already signed
   * in to WorkBuddy on this machine does not have to sign in a second time,
   * and the first catalog fetch after the import is the "which models are free
   * right now" check the dock reports. Only a matching region is adopted, so
   * an international install never borrows a CN credential.
   */
  async function adoptDesktopSession(runtime, stale = false) {
    try {
      if (stale) {
        // Cooldown: the upstream can refuse several requests in a row, and
        // asking the desktop app for its key payload is not free.
        const now = Date.now()
        if (now - (runtime.lastDesktopRetryAt ?? 0) < 5 * 60_000) return
        runtime.lastDesktopRetryAt = now
      }
      const auth = await runtime.store.status()
      if (!stale && auth.state === 'signed-in') return
      const credential = await readDesktopCredential()
      if (credential === undefined) return
      const region = regionOf(credential.domain)
      if (region !== runtime.variant.region) return
      if (stale) {
        // Never silently switch accounts because a session went stale; only
        // refresh the same account the plugin was already using.
        const current = await runtime.store.current().catch(() => undefined)
        if (current?.accessToken === credential.accessToken) return
        if (current?.uid !== undefined && credential.uid !== undefined && current.uid !== credential.uid) return
      }
      await runtime.store.save({ ...credential, region })
      runtime.markSessionFresh()
      runtime.catalog.setVisible(true)
      refresh()
      ctx.logger?.info?.(`dsh-model-dock: adopted the ${runtime.variant.appName} desktop session`)
    } catch (error) {
      // Keep the reason for the panel: "no desktop session" and "the app is
      // installed but its credential could not be read" need different fixes.
      runtime.desktopError = error instanceof Error ? error.message : String(error)
      ctx.logger?.debug?.('dsh-model-dock: desktop session adoption skipped', error)
    }
  }

  // The first catalog fetch runs in the background: serving starts on the
  // saved/built-in roster and upgrades to the live list when it lands. The
  // desktop adoption runs first so that first fetch already uses a credential
  // when the machine has one.
  for (const runtime of runtimes.values()) {
    void adoptDesktopSession(runtime).then(() => runtime.refreshCatalog()).then(() => refresh())
    void runtime.refreshCredits()
  }  // When the listen event lands (including the ephemeral-port fallback), the
  // descriptors' embedded baseUrl may have changed — re-snapshot them.
  for (const shim of shims.values()) {
    void shim.ready.then(up => {
      if (up) refresh()
    })
  }

  ctx.effect(() => {
    const timer = setInterval(() => {
      for (const runtime of runtimes.values()) {
        void runtime.refreshCatalog().then(() => refresh())
        void runtime.refreshCredits()
      }
    }, CATALOG_REFRESH_MS)
    timer.unref?.()
    return () => clearInterval(timer)
  })

  //#region card routes
  /**
   * The last update report plus when it was taken.
   *
   * A `git ls-remote` costs a round trip, and the card polls its status for
   * unrelated reasons (credits, catalog), so the answer is cached for a while
   * and refreshed only when the user asks or the cache ages out. Both callers
   * share one in-flight promise: two panels opening at once must not launch two
   * checks.
   */
  const updateCache = { report: undefined, at: 0, inFlight: undefined }
  const UPDATE_TTL_MS = 6 * 60 * 60 * 1000

  async function updateReport(profileDir, force) {
    const fresh = updateCache.report !== undefined && Date.now() - updateCache.at < UPDATE_TTL_MS
    if (fresh && force !== true) return updateCache.report
    if (updateCache.inFlight !== undefined) return updateCache.inFlight
    updateCache.inFlight = (async () => {
      try {
        // The profile that hosts this plugin, not the one the card happens to
        // be drawn in: the two are the same for a normal install, and the
        // discovered directory is the one whose lockfile records this copy.
        const report = await checkForUpdate(profileDir)
        updateCache.report = report
        updateCache.at = Date.now()
        return report
      } finally {
        updateCache.inFlight = undefined
      }
    })()
    return updateCache.inFlight
  }

  const updateHandler = async (req, res) => {
    if (req.method !== 'GET' || !routeGuard(req, updateKey)) {
      res.statusCode = req.method === 'GET' ? 403 : 405
      res.end()
      return
    }
    let report
    try {
      report = await updateReport(profileDir, new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('refresh') === '1')
    } catch (error) {
      report = { state: 'unknown', reason: safeMessage(error) }
    }
    // No key is echoed here: this route only *reads*, and the install it
    // enables goes through the plugin manager's own remote service, which
    // carries its own authorization. Returning a control key would hand any
    // reader of the card a credential it does not need.
    const spec = updateSpecFrom(report)
    const body = JSON.stringify({
      ...report,
      ...spec === undefined ? {} : { targetSpec: spec },
    })
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(body)
  }


  /**
   * One tiny round trip through the exact route DSH uses, for the panel's
   * "test" action.
   *
   * It goes through `ctx.llm.stream`, not through the shim's private socket,
   * so a green answer proves the whole chain: adapter registration, the shim's
   * wire rewrite, the stored credential, and the upstream. The prompt is kept
   * to a few tokens; free models cost nothing and paid ones cost a rounding
   * error, which is the point of a connection check.
   */
  /**
   * One real call through the exact route DSH uses.
   *
   * Shared by the panel's "test" action and the repair loop so both prove the
   * same chain: adapter registration → shim → stored credential → upstream.
   */
  async function probeModel(provider, model) {
    let reply = ''
    let failure
    const stream = ctx.llm.stream({
      provider,
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly: OK' }] }],
      maxTokens: 256,
    })
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') reply += chunk.text
      if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
        failure = chunk.reason.failure
      }
    }
    if (failure !== undefined) throw new Error(failure.message ?? 'the model call failed')
    return reply.trim()
  }

  const probeHandler = async (req, res) => {
    if (req.method !== 'POST' || !routeGuard(req, probeKey)) {
      res.statusCode = req.method === 'POST' ? 403 : 405
      res.end()
      return
    }
    const text = await readRouteBody(req, 8192)
    let action
    try {
      action = JSON.parse(text ?? '')
    } catch {
      res.statusCode = 400
      res.end()
      return
    }
    const provider = typeof action?.provider === 'string' ? action.provider : ''
    const model = typeof action?.model === 'string' ? action.model : ''
    const known = provider === qoderProviderId
      ? qoder.status().auth.state === 'signed-in'
      : provider === PROVIDER_IDS.qoderCn || provider === PROVIDER_IDS.qwenwork
        ? ctx.llm.listProviders().some(entry => entry.id === provider)
        : runtimes.has(provider)
    if (!known || model === '') {
      res.statusCode = 400
      res.end()
      return
    }
    try {
      const reply = await probeModel(provider, model)
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: true, model, reply: reply.slice(0, 200) }))
    } catch (error) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: false, model, error: safeMessage(error) }))
    }
  }

  //#region auto repair
  /**
   * One-click repair jobs.
   *
   * A job is deliberately bounded: one initial probe, a short deterministic
   * ladder (re-import the desktop session, restart the loopback, refresh the
   * catalog), then at most three model-chosen actions from a closed allowlist.
   * The model never executes anything itself — it only names an action the
   * host already implements.
   */
  const repairJobs = new Map()
  const REPAIR_MODEL_TTL_MS = 60_000
  const REPAIR_MAX_ROUNDS = 3
  const REPAIR_DEADLINE_MS = 180_000
  let repairModelCache

  function laneProviderId(laneKey) {
    if (laneKey === 'qoder') return qoderProviderId
    if (laneKey === 'qoder-cn') return PROVIDER_IDS.qoderCn
    if (laneKey === 'qwenwork') return PROVIDER_IDS.qwenwork
    return laneKey
  }

  /** Accept only http(s) and normalize an OpenAI-compatible base URL to `/v1`. */
  function normalizeOpenAiBase(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') return undefined
    let url
    try {
      url = new URL(raw.trim())
    } catch {
      return undefined
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    let path = url.pathname.replace(/\/+$/u, '')
    if (path === '') path = '/v1'
    else if (!path.endsWith('/v1')) path = `${path}/v1`
    url.pathname = path
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/+$/u, '')
  }

  /**
   * A local OpenAI-compatible runtime (Ollama, LM Studio, llama.cpp), used
   * only when no DSH provider can serve as the repair model.
   */
  async function discoverLocalRepairModel() {
    for (const baseUrl of ['http://127.0.0.1:11434/v1', 'http://127.0.0.1:1234/v1']) {
      try {
        const response = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(1200) })
        if (!response.ok) continue
        const document = await response.json().catch(() => null)
        const id = document?.data?.[0]?.id
        if (typeof id === 'string' && id !== '') return { kind: 'openai', baseUrl, model: id, apiKey: '' }
      } catch {
        // Not running, or not this shape: try the next well-known port.
      }
    }
    return undefined
  }

  /** List an OpenAI-compatible endpoint's models and take the first one. */
  async function openAiFirstModel(baseUrl, apiKey) {
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: apiKey === '' ? {} : { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000),
      })
      if (!response.ok) return undefined
      const document = await response.json().catch(() => null)
      const id = document?.data?.[0]?.id
      return typeof id === 'string' && id !== '' ? id : undefined
    } catch {
      return undefined
    }
  }

  /**
   * The model that thinks about a broken lane.
   *
   * Config wins, then a short list of providers known to be independent of
   * this plugin, then any provider that answers `listModels` with at least one
   * row. Our own `safe_` lanes are skipped: asking a broken lane to repair
   * itself is the one thing that cannot work.
   */
  async function resolveRepairModel() {
    if (repairModelCache !== undefined && Date.now() - repairModelCache.at < REPAIR_MODEL_TTL_MS) {
      return repairModelCache.value
    }
    const config = readJsonFile(join(workbuddyPluginDataDir(), 'repair-config.json'))
    const envBaseUrl = process.env.DSH_MODEL_DOCK_REPAIR_BASE_URL
    const envApiKey = process.env.DSH_MODEL_DOCK_REPAIR_API_KEY
    const rawBaseUrl = typeof envBaseUrl === 'string' && envBaseUrl.trim() !== ''
      ? envBaseUrl
      : (config !== undefined && config !== null && typeof config.baseUrl === 'string' ? config.baseUrl : undefined)
    if (typeof rawBaseUrl === 'string' && rawBaseUrl.trim() !== '') {
      const baseUrl = normalizeOpenAiBase(rawBaseUrl)
      if (baseUrl !== undefined) {
        const apiKey = typeof envApiKey === 'string' && envApiKey !== ''
          ? envApiKey
          : (typeof config?.apiKey === 'string' ? config.apiKey : '')
        const wanted = typeof config?.model === 'string' && config.model !== '' ? config.model : undefined
        const model = wanted ?? await openAiFirstModel(baseUrl, apiKey)
        if (model !== undefined) {
          const value = { kind: 'openai', baseUrl, model, apiKey }
          repairModelCache = { at: Date.now(), value }
          return value
        }
      }
    }
    const configured = (() => {
      const provider = process.env.DSH_MODEL_DOCK_REPAIR_PROVIDER
      const model = process.env.DSH_MODEL_DOCK_REPAIR_MODEL
      if (typeof provider === 'string' && provider.trim() !== '') return { provider: provider.trim(), model: model?.trim() }
      if (config !== undefined && config !== null && typeof config.provider === 'string' && config.provider !== '') {
        return { provider: config.provider, model: typeof config.model === 'string' ? config.model : undefined }
      }
      return undefined
    })()
    const candidates = []
    if (configured !== undefined) candidates.push(configured)
    const available = ctx.llm.listProviders().map(provider => provider.id)
    for (const id of ['deepseek-official', 'deepseek-account', 'free-model-dock-region', 'free-model-dock']) {
      if (available.includes(id)) candidates.push({ provider: id })
    }
    for (const id of available) candidates.push({ provider: id })
    for (const candidate of candidates) {
      if (typeof candidate.provider !== 'string' || candidate.provider === '') continue
      if (isOwnProviderId(candidate.provider) || candidate.provider.startsWith(SAFE_PREFIX)) continue
      let models
      try {
        models = await ctx.llm.listModels(candidate.provider)
      } catch {
        continue
      }
      if (!Array.isArray(models) || models.length === 0) continue
      const ids = models.map(model => model.id)
      const value = {
        provider: candidate.provider,
        model: typeof candidate.model === 'string' && ids.includes(candidate.model) ? candidate.model : ids[0],
      }
      repairModelCache = { at: Date.now(), value }
      return value
    }
    const local = await discoverLocalRepairModel()
    repairModelCache = { at: Date.now(), value: local }
    return local
  }

  /** A compact, credential-free snapshot of the lane for the repair prompt. */
  async function laneSnapshot(laneKey) {
    if (laneKey === 'qoder') {
      const status = qoder.status()
      return {
        auth: status.auth,
        error: status.error,
        catalogError: status.catalog?.error,
        models: (status.catalog?.models ?? []).map(model => model.id),
      }
    }
    const runtime = runtimes.get(laneKey)
    if (runtime !== undefined) {
      const status = await runtime.status()
      return {
        auth: status.auth,
        error: status.error,
        catalogError: status.catalog?.error,
        desktopError: status.desktopError,
        models: (status.catalog?.models ?? []).map(model => model.id),
      }
    }
    let models = []
    try {
      models = (await ctx.llm.listModels(laneProviderId(laneKey))).map(model => model.id)
    } catch {
      // The lane's own status is unavailable; the probe will report the error.
    }
    return { auth: { state: 'unknown' }, models }
  }

  /** Run one probe and record it on the job. */
  async function repairProbe(job) {
    if (typeof job.forcedModel === 'string' && job.forcedModel !== '') {
      const step = { at: Date.now(), kind: 'probe', state: 'running', text: `测试 ${job.providerId} / ${job.forcedModel}` }
      job.steps.push(step)
      try {
        const reply = await probeModel(job.providerId, job.forcedModel)
        step.state = 'ok'
        step.detail = reply.slice(0, 120)
        return { ok: true, model: job.forcedModel, reply }
      } catch (error) {
        const message = safeMessage(error)
        step.state = 'fail'
        step.detail = message
        return { ok: false, model: job.forcedModel, error: message }
      }
    }
    let models
    try {
      models = await ctx.llm.listModels(job.providerId)
    } catch (error) {
      const message = safeMessage(error)
      job.steps.push({ at: Date.now(), kind: 'probe', state: 'fail', text: '读取模型列表失败', detail: message })
      return { ok: false, error: message }
    }
    const usable = (models ?? []).filter(model => model !== null && typeof model.id === 'string' && model.id !== '')
    if (usable.length === 0) {
      const error = '这个车道当前没有可调用的模型（上游可能已经没有免费模型）'
      job.steps.push({ at: Date.now(), kind: 'probe', state: 'fail', text: '没有可测试的模型', detail: error })
      return { ok: false, error, noModel: true }
    }
    const model = usable[0].id
    job.model = model
    const step = { at: Date.now(), kind: 'probe', state: 'running', text: `测试 ${job.providerId} / ${model}` }
    job.steps.push(step)
    try {
      const reply = await probeModel(job.providerId, model)
      step.state = 'ok'
      step.detail = reply.slice(0, 120)
      return { ok: true, model, reply }
    } catch (error) {
      const message = safeMessage(error)
      step.state = 'fail'
      step.detail = message
      return { ok: false, model, error: message }
    }
  }

  /** Execute one allowlisted action; never throws into the job loop. */
  async function repairAct(job, action, args = {}) {
    try {
      if (action === 'wait') {
        const seconds = Number.isFinite(Number(args.seconds)) ? Math.min(Math.max(Number(args.seconds), 1), 10) : 3
        await new Promise(resolve => setTimeout(resolve, seconds * 1000))
        return { ok: true, detail: `等待 ${seconds}s` }
      }
      if (action === 'stop' || action === 'open-login') return { ok: true, stop: true }
      if (job.laneKey === 'qoder') {
        if (action === 'reimport-desktop') return await qoder.reimport()
        if (action === 'restart-lane') return { ok: await qoder.restart() }
        if (action === 'refresh-catalog') {
          await qoder.refresh()
          return { ok: true }
        }
      }
      const runtime = runtimes.get(job.laneKey)
      if (runtime !== undefined) {
        if (action === 'reimport-desktop') return await importDesktopFor(runtime, { sameAccountOnly: true })
        if (action === 'refresh-catalog') {
          await runtime.refreshCatalog()
          await runtime.refreshCredits()
          return { ok: true }
        }
        if (action === 'restart-lane') return { ok: false, error: 'WorkBuddy 车道没有可重启的本地代理' }
      }
      return { ok: false, error: `${job.laneKey} 不支持动作 ${action}` }
    } catch (error) {
      return { ok: false, error: safeMessage(error) }
    }
  }

  /** Ask the repair model for one decision, with a hard timeout. */
  async function askRepairModel(job, lastProbe) {
    const model = await resolveRepairModel()
    if (model === undefined) return undefined
    const snapshot = await laneSnapshot(job.laneKey)
    const diagnostics = {
      lane: job.laneKey,
      providerId: job.providerId,
      pluginVersion: PLUGIN_VERSION,
      platform: process.platform,
      auth: snapshot.auth,
      laneError: snapshot.error,
      catalogError: snapshot.catalogError,
      desktopError: snapshot.desktopError,
      availableModels: snapshot.models,
      lastProbe: { ok: lastProbe.ok === true, model: lastProbe.model, error: lastProbe.error },
      allowedActions: job.laneKey === 'qoder'
        ? ['reimport-desktop', 'restart-lane', 'refresh-catalog', 'wait', 'open-login', 'stop']
        : runtimes.has(job.laneKey)
          ? ['reimport-desktop', 'refresh-catalog', 'wait', 'open-login', 'stop']
          : ['wait', 'open-login', 'stop'],
      attempts: job.steps
        .filter(step => step.kind === 'action' || step.kind === 'model')
        .slice(-8)
        .map(step => ({ kind: step.kind, text: step.text, state: step.state, detail: step.detail })),
    }
    if (model.kind === 'openai') {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 45_000)
      try {
        const response = await fetch(`${model.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...model.apiKey === '' ? {} : { authorization: `Bearer ${model.apiKey}` },
          },
          body: JSON.stringify({
            model: model.model,
            temperature: 0,
            max_tokens: 700,
            stream: false,
            messages: [
              { role: 'system', content: REPAIR_SYSTEM_PROMPT },
              { role: 'user', content: buildRepairUserMessage(diagnostics) },
            ],
          }),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`本地模型 HTTP ${response.status}`)
        const document = await response.json()
        const content = document?.choices?.[0]?.message?.content ?? ''
        return {
          model: { kind: 'openai', provider: 'local', model: model.model },
          decision: parseRepairDecision(content),
          raw: content,
        }
      } finally {
        clearTimeout(timer)
      }
    }
    let text = ''
    let failure
    const stream = ctx.llm.stream({
      provider: model.provider,
      model: model.model,
      messages: [
        { role: 'system', content: [{ type: 'text', text: REPAIR_SYSTEM_PROMPT }] },
        { role: 'user', content: [{ type: 'text', text: buildRepairUserMessage(diagnostics) }] },
      ],
      maxTokens: 700,
    })
    const consume = (async () => {
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') text += chunk.text
        if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
          failure = chunk.reason.failure
        }
      }
    })()
    consume.catch(() => {})
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('修复模型响应超时')), 45_000).unref?.()
    })
    await Promise.race([consume, timeout])
    if (failure !== undefined) throw new Error(failure.message ?? '修复模型调用失败')
    return { model, decision: parseRepairDecision(text), raw: text }
  }

  function finishRepair(job, success, hint) {
    job.state = 'done'
    job.success = success === true
    job.finishedAt = Date.now()
    if (hint !== undefined && hint !== '') job.hint = hint
    job.steps.push({
      at: Date.now(),
      kind: 'result',
      state: success === true ? 'ok' : 'fail',
      text: success === true ? '修复完成，车道已可用' : '自动修复未成功',
      detail: job.hint,
    })
    ctx.logger?.info?.(`dsh-model-dock: repair ${job.id} ${success === true ? 'succeeded' : 'failed'}`)
  }

  async function runRepairJob(job) {
    try {
      let probe = await repairProbe(job)
      if (probe.ok === true) {
        finishRepair(job, true)
        return
      }
      if (probe.noModel === true) {
        const snapshot = await laneSnapshot(job.laneKey)
        const hiddenPaid = job.laneKey === 'qoder' && qoder.showPaidModels !== true && qoder.models.length > 0
        const hint = hiddenPaid
          ? 'Qoder 的付费模型当前被隐藏；在面板打开「显示付费模型」后再试。'
          : snapshot.auth?.state === 'signed-in'
            ? '已连接，但上游当前没有可调用的免费模型；等上游恢复免费额度后再试，或改用其他车道。'
            : '这个车道还没有连接/登录；请先在对应的桌面客户端登录，或在面板上点「使用桌面版登录」。'
        finishRepair(job, false, hint)
        return
      }

      // Deterministic ladder: cheap, predictable, and enough for the common
      // "desktop rotated its session" and "loopback died" cases.
      const ladder = job.laneKey === 'qoder'
        ? ['reimport-desktop', 'restart-lane', 'refresh-catalog']
        : runtimes.has(job.laneKey)
          ? ['reimport-desktop', 'refresh-catalog']
          : []
      for (const action of ladder) {
        if (Date.now() - job.startedAt > REPAIR_DEADLINE_MS) break
        const outcome = await repairAct(job, action)
        job.steps.push({
          at: Date.now(),
          kind: 'action',
          state: outcome?.ok === false ? 'fail' : 'ok',
          text: `固定修复：${action}`,
          detail: outcome?.error,
        })
        if (outcome?.stop === true) break
        probe = await repairProbe(job)
        if (probe.ok === true) {
          finishRepair(job, true)
          return
        }
      }

      // Model-guided rounds for everything the ladder did not cover.
      let modelTried = false
      let modelFailure
      for (let round = 0; round < REPAIR_MAX_ROUNDS; round += 1) {
        if (Date.now() - job.startedAt > REPAIR_DEADLINE_MS) break
        let asked
        try {
          asked = await askRepairModel(job, probe)
        } catch (error) {
          modelFailure = safeMessage(error)
          job.steps.push({ at: Date.now(), kind: 'model', state: 'fail', text: '修复模型调用失败', detail: modelFailure })
          break
        }
        if (asked === undefined) break
        modelTried = true
        job.modelInfo = asked.model
        job.steps.push({
          at: Date.now(),
          kind: 'model',
          state: 'ok',
          text: asked.decision.diagnosis || `建议：${asked.decision.action}`,
          detail: `${asked.model.provider}/${asked.model.model} → ${asked.decision.action}`,
        })
        if (asked.decision.action === 'stop') {
          finishRepair(job, false, asked.decision.hint || '没有可安全执行的修复动作了，请点击「一键上报」把诊断发回。')
          return
        }
        if (asked.decision.action === 'open-login') {
          finishRepair(job, false, asked.decision.hint || '请先在桌面客户端完成登录，再点一次「测试」。')
          return
        }
        const outcome = await repairAct(job, asked.decision.action, asked.decision.args)
        job.steps.push({
          at: Date.now(),
          kind: 'action',
          state: outcome?.ok === false ? 'fail' : 'ok',
          text: `执行：${asked.decision.action}`,
          detail: outcome?.error,
        })
        probe = await repairProbe(job)
        if (probe.ok === true) {
          finishRepair(job, true)
          return
        }
      }

      finishRepair(job, false, modelFailure !== undefined
        ? `修复模型调用失败：${modelFailure}`
        : modelTried
          ? '修复模型也没能恢复这条车道，请点击「一键上报」把完整诊断发回。'
          : '没有找到可用的本地模型，已按固定顺序修复但仍失败；请点击「一键上报」。')
    } catch (error) {
      finishRepair(job, false, safeMessage(error))
    }
  }

  function startRepairJob(laneKey, forcedModel) {
    const running = [...repairJobs.values()].find(job => job.state === 'running')
    if (running !== undefined) return { error: '已有修复任务在进行', jobId: running.id }
    const job = {
      id: randomUUID(),
      laneKey,
      providerId: laneProviderId(laneKey),
      ...(typeof forcedModel === 'string' && forcedModel !== '' ? { forcedModel } : {}),
      state: 'running',
      success: false,
      steps: [],
      startedAt: Date.now(),
    }
    repairJobs.set(job.id, job)
    if (repairJobs.size > 10) {
      const oldest = [...repairJobs.values()].sort((a, b) => a.startedAt - b.startedAt).slice(0, repairJobs.size - 10)
      for (const stale of oldest) repairJobs.delete(stale.id)
    }
    void runRepairJob(job)
    return { job }
  }

  const repairHandler = async (req, res) => {
    if (!routeGuard(req, repairKey)) {
      res.statusCode = req.method === 'GET' || req.method === 'POST' ? 403 : 405
      res.end()
      return
    }
    if (req.method === 'GET') {
      const id = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('id') ?? ''
      const job = repairJobs.get(id)
      if (job === undefined) {
        res.statusCode = 404
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(job))
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }
    const text = await readRouteBody(req, 8192)
    let body
    try {
      body = JSON.parse(text ?? '')
    } catch {
      res.statusCode = 400
      res.end()
      return
    }
    const laneKey = typeof body?.provider === 'string' ? body.provider : ''
    const known = laneKey === 'qoder' || laneKey === 'qoder-cn' || laneKey === 'qwenwork' || runtimes.has(laneKey)
    if (!known) {
      res.statusCode = 400
      res.end()
      return
    }
    const forcedModel = typeof body?.model === 'string' ? body.model : undefined
    const started = startRepairJob(laneKey, forcedModel)
    if (started.error !== undefined) {
      res.writeHead(409, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(started))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ jobId: started.job.id }))
  }
  //#endregion

  const gatewayHandler = async (req, res) => {
    if (req.method !== 'POST' || !routeGuard(req, gatewayKey)) {
      res.statusCode = req.method === 'POST' ? 403 : 405
      res.end()
      return
    }
    const text = await readRouteBody(req, 8192)
    let action
    try {
      action = JSON.parse(text ?? '')
    } catch {
      res.statusCode = 400
      res.end()
      return
    }
    let result
    if (action?.action === 'set-enabled' && typeof action.enabled === 'boolean') {
      result = await gateway.setEnabled(action.enabled)
    } else if (action?.action === 'set-port') {
      result = await gateway.setPort(action.port)
    } else if (action?.action === 'regenerate-key') {
      result = gateway.regenerateKey()
    } else {
      res.statusCode = 400
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(result))
  }

  const statusHandler = (req, res) => {
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end()
      return
    }
    const host = req.headers.host
    if (typeof host !== 'string' || !/^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(host)) {
      res.statusCode = 403
      res.end()
      return
    }
    const origin = req.headers.origin
    if (origin !== undefined && !/^https?:\/\/(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(String(origin))) {
      res.statusCode = 403
      res.end()
      return
    }
    void (async () => {
      const variants = {}
      for (const [id, runtime] of runtimes) variants[id] = await runtime.status()
      // The panel needs the desktop session's region, not its identity: the
      // uid would put an account identifier in a document any local process
      // can read from this loopback route.
      const desktop = readDesktopSessionSummary()
      delete desktop.uid
      // The picker's own answer, not the catalog's: proves that the free-only
      // filter reached the model list DSH renders.
      const visibleModels = {}
      for (const provider of new Set([PROVIDER_IDS.workbuddy, PROVIDER_IDS.workbuddyGlobal, qoderProviderId, PROVIDER_IDS.qoderCn, PROVIDER_IDS.qwenwork])) {
        try {
          visibleModels[provider] = (await ctx.llm.listModels(provider)).map(model => model.id)
        } catch {
          // A provider that is not mounted yet simply has no list.
        }
      }
      const payload = JSON.stringify({
        status: 'ok',
        version: PLUGIN_VERSION,
        platform: process.platform,
        arch: process.arch,
        variants,
        qoder: { ...qoder.status(), providerId: qoderProviderId },
        // What the sidebar panel needs beyond the two WorkBuddy lanes: the
        // other desktop clients the dock found on this machine, so it can show
        // them as detected-but-not-wired instead of omitting them silently.
        dock: { clients: detectKnownClients(), desktop },
        // Read-only diagnostics for the panel: whether DSH actually sees the
        // two routes this plugin registered. It is the only same-origin way to
        // distinguish "the catalog is empty" from "the adapter never mounted".
        llm: (() => {
          try {
            return {
              providers: ctx.llm.listProviders().map(provider => ({ id: provider.id, name: provider.name })),
              configurable: ctx.llm.listConfigurableProviders().map(entry => entry.provider),
              models: visibleModels,
              qoderAdapter: { registered: qoderAdapter !== undefined, error: qoderAdapterError },
            }
          } catch (error) {
            return { error: safeMessage(error) }
          }
        })(),
        loginKey,
        modelsKey,
        authKey,
        probeKey,
        repairKey,
        gatewayKey,
        gateway: gateway.status(),
        // The update route reads only, but it is still guarded like every
        // other card route: the key travels with the status document the card
        // already fetches, which is how `loginKey`/`modelsKey` reach it too.
        updateKey,
      })
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(payload)
    })().catch(error => {
      ctx.logger?.warn?.('dsh-model-dock: status route failed', error)
      if (!res.headersSent) {
        res.statusCode = 500
        res.end()
      }
    })
  }

  const loginHandler = async (req, res) => {
    if (req.method !== 'POST' || !routeGuard(req, loginKey)) {
      res.statusCode = req.method === 'POST' ? 403 : 405
      res.end()
      return
    }
    const text = await readRouteBody(req)
    let action
    try {
      action = JSON.parse(text ?? '')
    } catch {
      res.statusCode = 400
      res.end()
      return
    }
    const provider = typeof action?.provider === 'string' ? action.provider : ''
    const runtime = runtimes.get(provider)
    if (runtime === undefined) {
      res.statusCode = 400
      res.end()
      return
    }
    try {
      if (action?.action === 'begin') {
        const attempt = await login.begin(runtime.variant.region)
        runtime.attempts.set(attempt.state, { startedAtMs: Date.now() })
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ status: 'pending', authUrl: attempt.authUrl, state: attempt.state }))
        return
      }
      if (action?.action === 'poll') {
        const state = typeof action.state === 'string' ? action.state : ''
        const attempt = runtime.attempts.get(state)
        if (attempt === undefined) {
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ status: 'pending' }))
          return
        }
        const outcome = await login.poll({ state, authUrl: '', region: runtime.variant.region })
        if (outcome.status !== 'complete') {
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ status: 'pending' }))
          return
        }
        login.forget(state)
        runtime.attempts.delete(state)
        const { tokens, account } = outcome
        const region = tokens.domain === '' ? runtime.variant.region : (tokens.domain.endsWith('workbuddy.ai') ? 'global' : 'cn')
        const credential = {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAtMs: Date.now() + (tokens.expiresInSec > 0 ? tokens.expiresInSec * 1000 : 0),
          domain: tokens.domain,
          region,
          uid: account.uid,
          ...account.enterpriseId === undefined ? {} : { enterpriseId: account.enterpriseId },
          ...account.nickname === undefined ? {} : { nickname: account.nickname },
          source: 'login',
        }
        await runtime.store.save(credential)
        // A fresh sign-in is a new credential. The stale mark described the
        // OLD one, so it must not survive the replacement — otherwise the card
        // keeps advising a re-import the user just performed, and only a
        // successful generation clears it. (An account restriction is
        // deliberately kept: it belongs to the account, not the credential.)
        runtime.markSessionFresh()
        runtime.catalog.setVisible(true)
        await runtime.refreshCatalog()
        await runtime.refreshCredits()
        refresh()
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ status: 'complete' }))
        return
      }
      if (action?.action === 'cancel') {
        const state = typeof action.state === 'string' ? action.state : ''
        login.forget(state)
        runtime.attempts.delete(state)
        res.statusCode = 204
        res.end()
        return
      }
      res.statusCode = 400
      res.end()
    } catch (error) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ status: 'error', error: safeMessage(error) }))
    }
  }

  const modelsHandler = async (req, res) => {
    if (req.method !== 'POST' || !routeGuard(req, modelsKey)) {
      res.statusCode = req.method === 'POST' ? 403 : 405
      res.end()
      return
    }
    const text = await readRouteBody(req)
    let action
    try {
      action = JSON.parse(text ?? '')
    } catch {
      res.statusCode = 400
      res.end()
      return
    }
    const provider = typeof action?.provider === 'string' ? action.provider : ''
    if (action?.action === 'authorize-keychain') {
      if (process.platform !== 'darwin') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: false, error: '只有 macOS 需要钥匙串授权' }))
        return
      }
      const result = await authorizeMacKeychain(provider)
      if (result.ok === true && provider === 'qoder') {
        const outcome = await qoder.reimport()
        result.imported = outcome.ok === true
        if (outcome.ok !== true) result.importError = outcome.error
      }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(result))
      return
    }
    if (provider === 'qoder') {
      if (action?.action === 'set-model' && typeof action.model === 'string' && typeof action.enabled === 'boolean') {
        if (!qoder.setModelEnabled(action.model, action.enabled)) {
          res.statusCode = 400
          res.end()
          return
        }
        res.statusCode = 204
        res.end()
        return
      }
      if (action?.action === 'set-all' && typeof action.enabled === 'boolean') {
        qoder.setAllEnabled(action.enabled)
        res.statusCode = 204
        res.end()
        return
      }
      if (action?.action === 'set-show-paid' && typeof action.enabled === 'boolean') {
        qoder.setShowPaidModels(action.enabled)
        res.statusCode = 204
        res.end()
        return
      }
      if (action?.action === 'checkin') {
        const outcome = await qoder.checkIn()
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify(outcome))
        return
      }
      if (action?.action === 'set-auto-checkin' && typeof action.enabled === 'boolean') {
        qoder.setAutoCheckin(action.enabled)
        res.statusCode = 204
        res.end()
        return
      }
      if (action?.action === 'refresh') {
        await qoder.refresh()
        res.statusCode = 204
        res.end()
        return
      }
      res.statusCode = 400
      res.end()
      return
    }
    const runtime = runtimes.get(provider)
    if (runtime === undefined) {
      res.statusCode = 400
      res.end()
      return
    }
    if (action?.action === 'set-model' && typeof action.model === 'string' && typeof action.enabled === 'boolean') {
      // One model, one new state. The card never sends a list derived from a
      // snapshot of the page: a snapshot is stale the moment the catalog
      // refreshes, and a complement computed from a stale one can disable
      // every model but the one that was clicked.
      const known = new Set(runtime.catalog.all().map(model => model.id))
      if (!known.has(action.model)) {
        res.statusCode = 400
        res.end()
        return
      }
      const next = new Set(runtime.catalog.disabledModels())
      if (action.enabled) next.delete(action.model)
      else next.add(action.model)
      const list = [...next]
      runtime.catalog.setDisabledModels(list)
      runtime.settings.disabledModels = list
      runtime.saveSettings()
      refresh()
      res.statusCode = 204
      res.end()
      return
    }
    if (action?.action === 'set-all' && typeof action.enabled === 'boolean') {
      const list = action.enabled ? [] : runtime.catalog.all().map(model => model.id)
      runtime.catalog.setDisabledModels(list)
      runtime.settings.disabledModels = list
      runtime.saveSettings()
      refresh()
      res.statusCode = 204
      res.end()
      return
    }
    if (action?.action === 'set-disabled' && Array.isArray(action.models)) {
      // Kept for compatibility with an older card. The list is the set of
      // models to KEEP, and the server turns it into the disabled set — the
      // card never gets to name a list of things to remove.
      const known = new Set(runtime.catalog.all().map(model => model.id))
      const keep = new Set(action.models.filter(id => typeof id === 'string' && known.has(id)))
      const next = [...known].filter(id => !keep.has(id))
      runtime.catalog.setDisabledModels(next)
      runtime.settings.disabledModels = next
      runtime.saveSettings()
      refresh()
      res.statusCode = 204
      res.end()
      return
    }
    if (action?.action === 'set-show-paid' && typeof action.enabled === 'boolean') {
      runtime.setShowPaidModels(action.enabled)
      refresh()
      res.statusCode = 204
      res.end()
      return
    }
    if (action?.action === 'set-max-window' && typeof action.enabled === 'boolean') {
      runtime.catalog.setUseMaximumContextWindow(action.enabled)
      runtime.settings.useMaximumContextWindow = action.enabled
      runtime.saveSettings()
      refresh()
      res.statusCode = 204
      res.end()
      return
    }
    if (action?.action === 'refresh') {
      await runtime.refreshCatalog()
      await runtime.refreshCredits()
      refresh()
      res.statusCode = 204
      res.end()
      return
    }
    res.statusCode = 400
    res.end()
  }


  /**
   * Adopt the desktop app's session for one WorkBuddy variant.
   *
   * Shared by the card's "import" action and the repair loop; the failure
   * sentences are the ones the card shows, so "the app is signed in to the
   * other edition" stays distinguishable from "no desktop session".
   */
  async function importDesktopFor(runtime, options = {}) {
    try {
      const credential = await readDesktopCredential()
      if (credential === undefined) return { ok: false, error: 'no desktop session found' }
      const region = regionOf(credential.domain)
      if (region !== runtime.variant.region) {
        return {
          ok: false,
          error: `the desktop app is signed in to ${region === 'global' ? 'WorkBuddy AI' : 'WorkBuddy (CN)'}, not ${runtime.variant.appName}`,
        }
      }
      if (options.sameAccountOnly === true) {
        const current = await runtime.store.current().catch(() => undefined)
        if (current?.uid !== undefined && credential.uid !== undefined && current.uid !== credential.uid) {
          return { ok: false, error: '桌面 App 当前登录的是另一个账号；自动修复不会替你切换账号' }
        }
      }
      await runtime.store.save({ ...credential, region })
      // The import replaced the credential, so the stale mark no longer
      // describes what is stored. Without this the card keeps showing "the
      // desktop app rotated its session" immediately after the user did
      // exactly what that message asked for. (The account-restriction mark
      // stays: re-importing cannot lift a restriction.)
      runtime.markSessionFresh()
      runtime.catalog.setVisible(true)
      await runtime.refreshCatalog()
      await runtime.refreshCredits()
      refresh()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: safeMessage(error) }
    }
  }

  const authHandler = async (req, res) => {
    if (req.method !== 'POST' || !routeGuard(req, authKey)) {
      res.statusCode = req.method === 'POST' ? 403 : 405
      res.end()
      return
    }
    const text = await readRouteBody(req)
    let action
    try {
      action = JSON.parse(text ?? '')
    } catch {
      res.statusCode = 400
      res.end()
      return
    }
    const provider = typeof action?.provider === 'string' ? action.provider : ''
    if (provider === 'qoder') {
      if (action?.action === 'import-desktop') {
        const outcome = await qoder.reimport()
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify(outcome))
        return
      }
      res.statusCode = 400
      res.end()
      return
    }
    const runtime = runtimes.get(provider)
    if (runtime === undefined) {
      res.statusCode = 400
      res.end()
      return
    }
    if (action?.action === 'logout') {
      await runtime.store.logout()
      runtime.catalog.setVisible(false)
      runtime.credits = undefined
      refresh()
      res.statusCode = 204
      res.end()
      return
    }
    if (action?.action === 'import-desktop') {
      const outcome = await importDesktopFor(runtime)
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(outcome))
      return
    }
    res.statusCode = 400
    res.end()
  }
  //#endregion

  // Card routes on the host web server (same-origin for the browser half).
  // Deferred injection: a headless host without the webServer service simply
  // never runs this callback, and the model channel keeps working.
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const a = webCtx.webServer.register({ kind: 'exact', path: `${ROUTE_BASE}/status`, handler: statusHandler })
      const b = webCtx.webServer.register({ kind: 'exact', path: `${ROUTE_BASE}/login`, handler: loginHandler })
      const c = webCtx.webServer.register({ kind: 'exact', path: `${ROUTE_BASE}/models`, handler: modelsHandler })
      const d = webCtx.webServer.register({ kind: 'exact', path: `${ROUTE_BASE}/auth`, handler: authHandler })
      const e = webCtx.webServer.register({ kind: 'exact', path: `${ROUTE_BASE}/update`, handler: updateHandler })
      const f = webCtx.webServer.register({ kind: 'exact', path: `${ROUTE_BASE}/probe`, handler: probeHandler })
      const g = webCtx.webServer.register({ kind: 'exact', path: `${ROUTE_BASE}/repair`, handler: repairHandler })
      const h = webCtx.webServer.register({ kind: 'exact', path: `${ROUTE_BASE}/gateway`, handler: gatewayHandler })
      return () => {
        a()
        b()
        c()
        d()
        e()
        f()
        g()
        h()
      }
    }, 'dsh-model-dock: web routes')
  })

  ctx.effect(() => async () => {
    for (const shim of shims.values()) {
      try {
        await shim.close()
      } catch {
        // A shim that fails to close cleanly must not block the teardown.
      }
    }
  })
}

export default { name, inject, apply }

// Internal surfaces exported for tests and CLI use.
export {
  VariantRuntime,
  WORKBUDDY_VARIANTS,
  controlKeys,
  fallbackFor,
  prepareChatBody,
  prepareInternationalChatBody,
  realmOf,
  safeMessage,
  variantFor,
}
