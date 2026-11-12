/**
 * The Qoder lane: one account, one loopback endpoint, one provider.
 *
 * Qoder's gateway speaks COSY (RSA + AES session keys, an MD5 request
 * signature, and a custom base64 alphabet), which is why the transport is a
 * vendored, small, zero-dependency proxy rather than code re-derived here. The
 * dock owns only what the market console needs:
 *
 * - credential discovery (the IDE's `auth.v1.dat`, decrypted with its own
 *   Electron keychain entry; no token ever leaves the host),
 * - a catalog merged across Qoder's surfaces so QoDuck (`app` → `lmodel`) is
 *   visible beside the chat models,
 * - free/enabled facts for the sidebar, and
 * - lifecycle: an ephemeral loopback port per run, closed with the plugin.
 *
 * The model wire format is OpenAI-compatible, so the same loopback adapter the
 * WorkBuddy lane uses serves this one too.
 *
 * @module dsh-model-dock/qoder
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  checkin,
  configureAuthFile,
  getModelsLive,
  importFromIDE,
  initSession,
  loadAuth,
  saveAuth,
  serve as serveProxy,
} from './qoder-proxy.js'

/** Whether the Qoder desktop app is present on this machine. */
function qoderDesktopInstalled() {
  try {
    const home = homedir()
    if (process.platform === 'darwin') {
      return ['/Applications/Qoder.app', join(home, 'Applications/Qoder.app')].some(path => existsSync(path))
        || existsSync(join(home, 'Library/Application Support/com.qoder.app.stable'))
    }
    if (process.platform === 'win32') {
      const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
      const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
      const roaming = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
      return [
        join(local, 'Programs', 'Qoder', 'Qoder.exe'),
        join(programFiles, 'Qoder', 'Qoder.exe'),
        join(roaming, 'com.qoder.app.stable'),
      ].some(path => existsSync(path))
    }
  } catch {
    // An unreadable candidate is not a match.
  }
  return false
}

/** Reasoning levels the gateway understands; anything else is dropped. */
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

/** Output ceiling the proxy forwards when a caller names none. */
const DEFAULT_MAX_OUTPUT_TOKENS = 32768

/** One Qoder account's lane runtime. */
export class QoderLane {
  constructor(options) {
    this.logger = options.logger
    this.dataDir = options.dataDir
    this.onChange = options.onChange
    /**
     * Called every time the lane becomes ready. The host registers the adapter
     * here rather than once around the first `start()` promise, so a lane that
     * failed early can still come up after a desktop re-import.
     */
    this.onReady = options.onReady
    this.authFile = join(this.dataDir, '.qoder-auth.json')
    this.settingsFile = join(this.dataDir, '.qoder-settings.json')
    /**
     * Optional token bypass for machines where the macOS keychain prompt never
     * appears (or the user does not want to grant it). One line, same token
     * `QODER_TOKEN` accepts; the lane then never calls `security` for import.
     */
    this.tokenFile = join(this.dataDir, '.qoder-token')
    this.models = []
    this.fetchedAt = 0
    this.error = undefined
    this.user = undefined
    this.importedFromDesktop = false
    this.starting = undefined
    this.handle = undefined
    this.key = undefined
    this.disabled = new Set()
    /** Whether paid models join the picker (default: free only). */
    this.showPaidModels = false
    /** Daily campaign check-in; opt-in, persisted per profile. */
    this.autoCheckin = false
    this.lastCheckinDate = ''
    this.lastCheckinStatus = ''
    this.lastCheckinMessage = ''
    this.lastCheckinAt = 0
    this.checkinRunning = false
    this.checkinTimer = undefined
    this.refreshTimer = undefined
    this.refreshing = false
    this.catalogSource = 'unknown'
    this.catalogError = undefined
    this.readSettings()
  }

  /** The catalog interface the loopback adapter consumes. */
  get catalog() {
    return { current: () => this.enabledModels() }
  }

  /** Base URL pi-ai appends `/chat/completions` to. */
  get baseUrl() {
    return this.handle?.baseUrl
  }

  /** The per-process bearer the loopback proxy requires. */
  get token() {
    return this.key
  }

  readSettings() {
    try {
      const parsed = JSON.parse(readFileSync(this.settingsFile, 'utf8'))
      if (Array.isArray(parsed?.disabledModels)) {
        this.disabled = new Set(parsed.disabledModels.filter(id => typeof id === 'string'))
      }
      this.showPaidModels = parsed?.showPaidModels === true
      this.autoCheckin = parsed?.autoCheckin === true
      this.lastCheckinDate = typeof parsed?.lastCheckinDate === 'string' ? parsed.lastCheckinDate : ''
      this.lastCheckinStatus = typeof parsed?.lastCheckinStatus === 'string' ? parsed.lastCheckinStatus : ''
      this.lastCheckinMessage = typeof parsed?.lastCheckinMessage === 'string' ? parsed.lastCheckinMessage : ''
      this.lastCheckinAt = Number.isFinite(parsed?.lastCheckinAt) ? parsed.lastCheckinAt : 0
    } catch {
      // A missing or unreadable settings file is the default state, not an error.
    }
  }

  saveSettings() {
    try {
      mkdirSync(dirname(this.settingsFile), { recursive: true })
      writeFileSync(this.settingsFile, JSON.stringify({
        disabledModels: [...this.disabled],
        showPaidModels: this.showPaidModels,
        autoCheckin: this.autoCheckin,
        lastCheckinDate: this.lastCheckinDate,
        lastCheckinStatus: this.lastCheckinStatus,
        lastCheckinMessage: this.lastCheckinMessage,
        lastCheckinAt: this.lastCheckinAt,
      }, null, 2), { mode: 0o600 })
    } catch (error) {
      this.logger?.warn?.('dsh-model-dock: could not save Qoder model settings', error)
    }
  }

  /** The free subset, used for counts and the default picker filter. */
  freeModels() {
    return this.models.filter(model => model.billing?.free === true)
  }

  /**
   * What the picker may publish: free only until "show paid" is on.
   *
   * This is the same contract as WorkBuddy: the visible set is a setting, not
   * a hard filter, so the panel can list paid rows (with their rate) while the
   * model picker stays free-only until the user opts in.
   */
  visibleModels() {
    return this.showPaidModels ? this.models : this.freeModels()
  }

  /**
   * Panel-facing model rows: every catalog row, free or paid.
   *
   * The card filters with `showPaidModels` client-side, exactly like the
   * WorkBuddy lanes, so toggling the switch does not need a new catalog fetch.
   */
  panelModels() {
    return this.models.map(model => ({
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      supportsImages: model.supportsImages === true,
      free: model.billing?.free === true,
      rate: model.billing?.credits,
      rateUnknown: false,
      badges: model.billing?.badges ?? [],
      efforts: model.reasoning?.supportedEfforts ?? [],
      enabled: !this.disabled.has(model.id),
    }))
  }

  /** Catalog entries the adapter publishes, with disabled models removed. */
  enabledModels() {
    return this.visibleModels().filter(model => !this.disabled.has(model.id))
  }

  /**
   * Bring the lane up: adopt or import the IDE credential, initialize the COSY
   * session, start the loopback proxy, then read the live catalog.
   */
  start() {
    if (this.starting === undefined) {
      this.starting = this.startInternal().then(
        started => {
          // Never cache a failure: a transient keychain prompt, a desktop app
          // that was not running yet, or an offline boot must not disable the
          // lane for the rest of the session.
          if (!started) this.starting = undefined
          return started
        },
        error => {
          this.starting = undefined
          throw error
        },
      )
    }
    return this.starting
  }

  async startInternal() {
    this.error = undefined
    configureAuthFile(this.authFile)
    try {
      if (loadAuth()?.token === undefined && existsSync(this.tokenFile)) {
        try {
          const token = readFileSync(this.tokenFile, 'utf8').trim()
          if (token !== '') {
            saveAuth({ token, refreshToken: '' })
            this.importedFromDesktop = false
          }
        } catch (error) {
          this.logger?.warn?.('dsh-model-dock: could not read .qoder-token', error)
        }
      }
      if (loadAuth()?.token === undefined) {
        // 没装 Qoder 桌面端就不要再碰钥匙串和 IDE 数据目录：为一个不存在的
        // 客户端弹系统授权框毫无意义，而且 start() 失败后每次状态刷新都会重试，
        // 于是一路弹下去。手动「使用桌面版登录」仍会走 importFromIDE。
        if (!qoderDesktopInstalled()) return false
        const imported = importFromIDE()
        saveAuth({ ...imported, ideToken: imported.token, ideRefreshToken: imported.refreshToken })
        this.importedFromDesktop = true
      }
    } catch (error) {
      this.error = `Qoder 桌面版登录态读取失败：${error instanceof Error ? error.message : String(error)}`
      this.logger?.warn?.('dsh-model-dock: Qoder credential import failed', error)
      return false
    }

    try {
      this.user = await initSession()
    } catch (error) {
      this.error = `Qoder 登录态不可用：${error instanceof Error ? error.message : String(error)}`
      this.logger?.warn?.('dsh-model-dock: Qoder session init failed', error)
      return false
    }

    this.key = randomBytes(24).toString('hex')
    try {
      this.handle = await serveProxy(0, '127.0.0.1', this.key)
    } catch (error) {
      this.error = `Qoder 本地通道启动失败：${error instanceof Error ? error.message : String(error)}`
      this.logger?.warn?.('dsh-model-dock: Qoder loopback failed', error)
      return false
    }

    await this.refresh()
    this.onReady?.()
    if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer)
    this.refreshTimer = setInterval(() => void this.refresh(), 30 * 60_000)
    this.refreshTimer.unref?.()
    // Check-in is a background courtesy: never block lane readiness on it.
    void this.autoCheckinIfDue()
    if (this.checkinTimer !== undefined) clearInterval(this.checkinTimer)
    this.checkinTimer = setInterval(() => void this.autoCheckinIfDue(), 6 * 60 * 60_000)
    this.checkinTimer.unref?.()
    return true
  }

  /** Re-read the upstream catalog and publish the result to the panel. */
  async refresh() {
    if (this.refreshing) return
    this.refreshing = true
    try {
      // getModelsLive throws on an upstream failure, so the compiled-in
      // two-model fallback can never be published as a live catalog.
      const catalog = await getModelsLive(true)
      this.models = catalog.map(model => this.toModelInfo(model))
      this.fetchedAt = Date.now()
      this.catalogSource = 'live'
      this.catalogError = undefined
      this.error = undefined
    } catch (error) {
      this.catalogError = error instanceof Error ? error.message : String(error)
      this.catalogSource = 'error'
      this.logger?.warn?.('dsh-model-dock: Qoder catalog refresh failed', error)
    } finally {
      this.refreshing = false
    }
    this.onChange?.()
  }

  /** Normalize one upstream catalog row into the shape the adapter consumes. */
  toModelInfo(model) {
    const efforts = Array.isArray(model.efforts)
      ? model.efforts.filter(effort => EFFORTS.has(effort))
      : []
    const defaultEffort = typeof model.default_effort === 'string' && EFFORTS.has(model.default_effort)
      ? model.default_effort
      : undefined
    const price = Number.isFinite(model.price_factor) ? model.price_factor : 1
    return {
      id: model.key,
      name: model.display_name,
      contextWindow: model.max_input_tokens || 200_000,
      maxTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      supportsImages: model.supports_images === true,
      billing: {
        credits: `x${price.toFixed(2)}`,
        free: model.is_free === true,
        ...(model.is_free === true ? { badges: ['限时免费'] } : {}),
      },
      reasoning: {
        supports: model.is_reasoning === true,
        supportedEfforts: efforts,
        ...(defaultEffort === undefined ? {} : { defaultEffort }),
        // The proxy accepts `off` on the wire, but pi-ai's thinking levels do
        // not map it for this gateway reliably; keep the control to explicit
        // efforts and let the upstream default stand.
        canDisableThinking: false,
      },
    }
  }

  /** Set one model's visibility in the DSH picker. */
  setModelEnabled(id, enabled) {
    if (!this.models.some(model => model.id === id)) return false
    if (enabled) this.disabled.delete(id)
    else this.disabled.add(id)
    this.saveSettings()
    this.onChange?.()
    return true
  }

  /** Toggle every visible model at once. */
  setAllEnabled(enabled) {
    this.disabled = enabled ? new Set() : new Set(this.visibleModels().map(model => model.id))
    this.saveSettings()
    this.onChange?.()
  }

  /** Enable or disable the once-a-day campaign check-in. */
  setAutoCheckin(enabled) {
    const next = enabled === true
    if (this.autoCheckin === next) return false
    this.autoCheckin = next
    this.saveSettings()
    this.onChange?.()
    if (next) void this.autoCheckinIfDue()
    return true
  }

  /** Local calendar day, so "once a day" follows the user's clock. */
  todayKey() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  /**
   * Claim today's campaign benefit, if any.
   *
   * The upstream campaign API is idempotent (`replayed` / `already_claimed`),
   * so a retry after a crash cannot double-claim.
   */
  async checkIn() {
    if (this.user === undefined) return { ok: false, error: 'Qoder 未登录' }
    if (this.checkinRunning) return { ok: false, error: '签到正在进行中' }
    this.checkinRunning = true
    try {
      const result = await checkin()
      const message = result.status === 'claimed'
        ? `签到成功${result.amount ? ` +${result.amount}` : ''}`
        : result.status === 'already_claimed' ? '今天已经签到过了' : '当前没有可领取的签到活动'
      this.lastCheckinStatus = result.status
      this.lastCheckinMessage = message
      this.lastCheckinAt = Date.now()
      if (result.status === 'claimed' || result.status === 'already_claimed') {
        this.lastCheckinDate = this.todayKey()
      }
      this.saveSettings()
      this.onChange?.()
      return { ok: true, status: result.status, message, amount: result.amount }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.lastCheckinStatus = 'error'
      this.lastCheckinMessage = message
      this.lastCheckinAt = Date.now()
      this.saveSettings()
      this.onChange?.()
      return { ok: false, error: message }
    } finally {
      this.checkinRunning = false
    }
  }

  /** Run at most once per local day, only when the user opted in. */
  async autoCheckinIfDue() {
    if (this.autoCheckin !== true || this.user === undefined || this.checkinRunning) return
    if (this.lastCheckinDate === this.todayKey()) return
    await this.checkIn()
  }

  /** Include paid Qoder models in the picker, or hide them again. */
  setShowPaidModels(enabled) {
    const next = enabled === true
    if (this.showPaidModels === next) return false
    this.showPaidModels = next
    this.saveSettings()
    this.onChange?.()
    return true
  }

  /** Re-import the IDE session after the desktop app rotated it. */
  async reimport() {
    try {
      configureAuthFile(this.authFile)
      // Explicit click: give the macOS keychain prompt time to appear and be
      // answered. Startup imports keep the short 5s bound.
      const imported = importFromIDE({ timeoutMs: 60_000 })
      saveAuth({ ...(loadAuth() ?? {}), ...imported, ideToken: imported.token, ideRefreshToken: imported.refreshToken })
      this.importedFromDesktop = true
      // The lane may have failed to start before the desktop app was logged
      // in. Restart it (onReady then registers the adapter) instead of merely
      // refreshing a session that has no loopback behind it.
      this.starting = undefined
      const started = await this.start()
      if (!started) return { ok: false, error: this.error ?? 'Qoder 本地通道未能启动' }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Panel status document. */
  status() {
    const signedIn = this.user !== undefined && this.handle !== undefined
    const credentialSourceAvailable = () => {
      if (qoderDesktopInstalled()) return true
      try {
        return (loadAuth()?.token ?? '') !== ''
      } catch {
        return false
      }
    }
    return {
      displayName: 'Qoder',
      chipText: this.showPaidModels ? '免费 + 付费' : '限时免费',
      auth: {
        state: signedIn ? 'signed-in' : 'signed-out',
        ...(this.user?.name === undefined ? {} : { nickname: this.user.name }),
        ...(signedIn ? { domain: 'qoder.sh' } : {}),
      },
      // The credential is the desktop app's own session; on macOS the dock can
      // always re-import it, which is what the panel's button offers.
      desktopAvailable: process.platform === 'darwin' || process.platform === 'win32',
      installed: qoderDesktopInstalled(),
      importedFromDesktop: this.importedFromDesktop,
      showPaidModels: this.showPaidModels,
      checkin: {
        auto: this.autoCheckin,
        running: this.checkinRunning,
        ...(this.lastCheckinDate === '' ? {} : { lastDate: this.lastCheckinDate }),
        ...(this.lastCheckinStatus === '' ? {} : { status: this.lastCheckinStatus }),
        ...(this.lastCheckinMessage === '' ? {} : { message: this.lastCheckinMessage }),
        ...(this.lastCheckinAt === 0 ? {} : { at: this.lastCheckinAt }),
      },
      // 没装桌面端、也没有现成令牌时，「找不到登录文件」是预期状态而不是故障，
      // 不该在面板上渲染成红色错误（那样每台没装 Qoder 的机器都会一直报红）。
      ...(this.error === undefined || !credentialSourceAvailable() ? {} : { error: this.error }),
      catalog: {
        source: this.catalogSource,
        fetchedAt: this.fetchedAt || undefined,
        ...(this.catalogError === undefined ? {} : { error: this.catalogError }),
        models: this.panelModels(),
      },
      credits: null,
      creditsError: null,
    }
  }

  /**
   * Close and bring the lane up again (repair action).
   *
   * Clears the cached start promise and the session identity so `start()`
   * really re-imports, re-mints and re-binds a loopback instead of returning
   * the old, dead handle.
   */
  async restart() {
    await this.close()
    this.starting = undefined
    this.user = undefined
    this.handle = undefined
    this.error = undefined
    return this.start()
  }

  /** Stop the loopback proxy; called from the plugin's effect teardown. */
  async close() {
    if (this.checkinTimer !== undefined) {
      clearInterval(this.checkinTimer)
      this.checkinTimer = undefined
    }
    if (this.refreshTimer !== undefined) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = undefined
    }
    const handle = this.handle
    this.handle = undefined
    if (handle === undefined) return
    try {
      await handle.close()
    } catch {
      // A server that is already gone is not a teardown failure.
    }
  }
}

