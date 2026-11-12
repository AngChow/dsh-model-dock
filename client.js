window.__ModuleLoader__.load({
  id: "dsh-model-dock",
  factory: (require) => {
    const React = require("react");
    const h = React.createElement;
    window.__WB_ERR__ = window.__WB_ERR__ || [];
    const note = (where, error) => {
      try {
        window.__WB_ERR__.push(where + ": " + String((error && error.stack) || error));
      } catch {}
    };

    /** Host routes (literal here and in the host half: the two bundles build independently). */
    const BASE = "/plugins/dsh-model-dock";
    const STATUS_PATH = `${BASE}/status`;
    const LOGIN_PATH = `${BASE}/login`;
    const MODELS_PATH = `${BASE}/models`;
    const AUTH_PATH = `${BASE}/auth`;
    const UPDATE_PATH = `${BASE}/update`;
    const PROBE_PATH = `${BASE}/probe`;
    const REPAIR_PATH = `${BASE}/repair`;
    const GATEWAY_PATH = `${BASE}/gateway`;
    const CN_STATUS_PATH = `${BASE}/qoder-cn/status`;
    const CN_REFRESH_PATH = `${BASE}/qoder-cn/refresh`;
    const QWEN_STATUS_PATH = `${BASE}/qwenwork/status`;
    const QWEN_RESTART_PATH = `${BASE}/qwenwork/restart`;

    const zh = {
      title: "WorkBuddy",
      subtitle: "接入 WorkBuddy 模型（国际版 / 国内版）。",
      signIn: "登录 WorkBuddy",
      importDesktop: "从桌面 App 导入",
      signInHint: "点击后在新标签页打开 WorkBuddy 授权页，完成登录后回到这里。",
      waiting: "等待授权中…",
      openLogin: "打开授权页面",
      signedIn: "已登录",
      signedOut: "未登录",
      logout: "退出登录",
      nickname: "账号",
      expires: "凭据有效期",
      domain: "域",
      catalog: "模型目录",
      catalogLive: "实时列表",
      catalogSaved: "上次保存的列表",
      catalogFallback: "内置列表",
      catalogUpdated: "更新于",
      catalogError: "最近刷新失败：",
      refresh: "刷新目录",
      refreshing: "刷新中…",
      models: "模型开关",
      modelsHint: "关闭的模型从 DSH 模型选择器中隐藏。",
      search: "搜索模型 / ID",
      enableAll: "全部开启",
      disableAll: "全部关闭",
      freeTag: "免费",
      rateTag: "倍率",
      ctxTag: "上下文",
      imgTag: "图片",
      effortTag: "推理",
      showPaid: "在模型选择器中显示付费模型",
      showPaidHint: "默认关闭：只有免费模型会出现在 DSH 的模型选择器里。",
      maxWindow: "使用上游声明的最大上下文窗口",
      maxWindowHint: "关闭时按上游的默认窗口发送请求（如 300K），开启时按最大窗口（如 1M）。",
      credits: "额度",
      creditsNone: "暂无额度信息",
      creditsRemain: "剩余",
      creditsTotal: "总量",
      creditsUnlimited: "不限",
      creditsEnd: "到期",
      creditsError: "额度读取失败：",
      identity: "客户端身份",
      errorLoad: "无法读取连接器状态",
      retry: "重试",
      failed: "操作失败",
      signedOutHint: "登录后才会出现模型分组。",
      sessionStale: "上游拒绝了这份凭据：桌面 App 换过会话了。点「从桌面 App 导入」重新接入，或重新登录。",
      updateTitle: "插件更新",
      updateCheck: "检查更新",
      updateChecking: "检查中…",
      updateAvailable: "有新版本",
      updateCurrent: "已是最新",
      updateApply: "更新到此版本",
      updateRunning: "正在更新…",
      updateLocalCopy: "这个安装来自本地目录，没有可比较的远程仓库。",
      updateUnknown: "暂时查不到远程状态：",
      updateHint: "git 版本可以在这里一键检查并更新到上游最新提交；DSH 自己只给官方插件显示「更新」。",
      updateDone: "已更新，重启 App 后生效。",
      accountRestricted: "上游已限制这个账号（不是凭据问题，重新登录或重新导入都无效）。只有申诉才能解除：在 WorkBuddy 里提交反馈。",
      tabGlobal: "国际版",
      tabCN: "国内版",
      panel: "安全模型坞",
      panelSub: "本机 AI 桌面客户端里当前免费的模型，自动发现，直接在 DSH 里用。",
      dockRefresh: "立即检查",
      dockChecking: "检查中…",
      dockFreeCount: "个免费模型",
      dockConnected: "个已连接客户端",
      dockLastCheck: "上次检查",
      dockFree: "免费",
      dockNoFree: "当前没有免费模型",
      dockGateway: "本地 API",
      dockGatewaySub: "把坞里的模型以 OpenAI 兼容接口暴露给本机工具（Cline / Roo / Continue / OpenAI SDK）。只监听 127.0.0.1，需要 Key。",
      dockGatewayEnable: "启用本地 API",
      dockGatewayEndpoint: "接口地址",
      dockGatewayKey: "API Key",
      dockGatewayShow: "显示",
      dockGatewayHide: "隐藏",
      dockGatewayCopy: "复制",
      dockGatewayRegenerate: "重新生成",
      dockGatewayPort: "端口",
      dockGatewaySave: "保存",
      dockGatewayModels: "个模型",
      dockGatewayRunning: "运行中",
      dockGatewayStopped: "未启用",
      dockGatewayCopied: "已复制",
      dockGatewayHint: "模型名格式：<provider>/<model>，例如 safe_workbuddy-global/hy4free。",
      dockGatewayError: "本地 API 失败",
      dockGatewayClaude: "同时支持 OpenAI 与 Anthropic：OpenAI 用 /v1；Claude Code 用 ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN + ANTHROPIC_MODEL。",
      dockGatewayCopyClaude: "复制 Claude Code 配置",
      dockGatewayAnthropic: "Anthropic",
      dockGatewayModelsTitle: "模型清单",
      dockGateway: "Local API",
      dockGatewaySub: "Expose the docked models as an OpenAI-compatible API to local tools (Cline / Roo / Continue / OpenAI SDK). Binds 127.0.0.1 only and requires a key.",
      dockGatewayEnable: "Enable local API",
      dockGatewayEndpoint: "Endpoint",
      dockGatewayKey: "API key",
      dockGatewayShow: "Show",
      dockGatewayHide: "Hide",
      dockGatewayCopy: "Copy",
      dockGatewayRegenerate: "Regenerate",
      dockGatewayPort: "Port",
      dockGatewaySave: "Save",
      dockGatewayModels: "models",
      dockGatewayRunning: "running",
      dockGatewayStopped: "disabled",
      dockGatewayCopied: "Copied",
      dockGatewayHint: "Model ids are <provider>/<model>, e.g. safe_workbuddy-global/hy4free.",
      dockGatewayError: "Local API error",
      dockGatewayClaude: "Both OpenAI and Anthropic: OpenAI uses /v1; Claude Code uses ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN + ANTHROPIC_MODEL.",
      dockGatewayCopyClaude: "Copy Claude Code config",
      dockGatewayAnthropic: "Anthropic",
      dockGatewayModelsTitle: "Models",
      dockCatalogLive: "模型目录实时",
      dockCatalogUpdated: "更新于",
      dockCatalogFailed: "模型目录刷新失败",
      dockCatalogChecking: "模型目录读取中",
      dockCheckin: "签到",
      dockCheckinRunning: "签到中…",
      dockAutoCheckin: "每天自动签到",
      dockAutoCheckinHint: "每天第一次连接时自动领取 Qoder 的签到积分；活动由上游提供。",
      dockCheckinLast: "上次签到",
      dockCheckinClaimed: "已领取",
      dockCheckinAlready: "今天已签到",
      dockCheckinNone: "暂无签到活动",
      dockCheckinError: "签到失败",
      dockCatalogLive: "Live catalog",
      dockCatalogUpdated: "updated",
      dockCatalogFailed: "Catalog refresh failed",
      dockCatalogChecking: "Reading catalog",
      dockCheckin: "Check in",
      dockCheckinRunning: "Checking in…",
      dockAutoCheckin: "Daily auto check-in",
      dockAutoCheckinHint: "Claims Qoder's daily campaign benefit on the first connection of each day; availability is upstream-controlled.",
      dockCheckinLast: "Last check-in",
      dockCheckinClaimed: "claimed",
      dockCheckinAlready: "already claimed today",
      dockCheckinNone: "no campaign right now",
      dockCheckinError: "check-in failed",
      dockKeychain: "授权钥匙串",
      dockKeychainHint: "点一下会等待 macOS 钥匙串弹窗；请在系统窗口里点「始终允许」，授权后会自动重试连接。",
      dockKeychainOk: "钥匙串已授权，正在重试连接…",
      dockKeychain: "Authorize Keychain",
      dockKeychainHint: "Waits for the macOS Keychain prompt; click “Always Allow” there and the lane reconnects.",
      dockKeychainOk: "Keychain authorized — retrying the connection…",
      dockSignInQwen: "已检测到千问办公桌面版，但还没读到登录态；打开千问办公完成登录后刷新即可。这个车道会列出账号套餐可路由的全部模型（付费车道）。",
      dockSignInFirst: "连接这个客户端后会自动发现免费模型。",
      dockImport: "使用桌面版登录",
      dockRefreshLane: "刷新目录",
      dockConnectedChip: "已连接",
      dockSignedOutChip: "未连接",
      dockStale: "上游已经轮换了会话，请再点一次「使用桌面版登录」。",
      dockPlanned: "下一步",
      dockQoderNote: "已检测到 Qoder，它的免费 QoDuck 车道是下一个接入对象。",
      dockFoot: "免费状态取自上游实时倍率；每次启动和每 30 分钟自动检查。凭据只留在本机。",
      dockFailed: "操作失败，请重试",
      dockShowAll: "显示付费模型",
      dockShowAllHint: "默认只显示免费模型；开启后付费模型也会进入模型选择器。",
      dockModelsCount: "个模型",
      dockPaid: "付费",
      dockQwenHint: "千问办公的模型按账号套餐路由；这里不区分免费/付费。",
      dockDiag: "诊断",
      dockDiagCopied: "诊断信息已复制，可发给开发者排查",
      dockModelsHint: "勾选的模型会出现在 DSH 的模型选择器里。",
      dockDetected: "已检测到",
      dockEnabledCount: "个已启用",
      dockDesktopOther: "桌面版当前登录的是另一个版本；这个车道可以在设置里单独登录。",
      dockTest: "测试",
      dockTesting: "测试中…",
      dockTestOk: "连接正常",
      dockTestFail: "测试失败",
      dockNotInstalled: "未安装",
      dockUnavailableChip: "通道未加载",
      dockInstallWorkbuddy: "未检测到 WorkBuddy 桌面版；可以先点「登录 WorkBuddy」用浏览器授权，或安装桌面版后点「从桌面 App 导入」。",
      dockInstallQoder: "未检测到 Qoder 桌面版；安装并登录后会自动接入，或配置 QODER_TOKEN。",
      dockInstallQoderCn: "未检测到 Qoder 国内版桌面程序；安装并登录后会自动接入。",
      dockInstallQwen: "未检测到千问办公桌面版；安装并登录后会自动接入。",
      dockLaneUnavailable: "这个通道没有加载成功；请到插件管理器确认对应入口已启用。",
      dockInstalledNoApp: "未检测到桌面版，当前使用已有登录态。",
      dockChannels: "支持渠道：WorkBuddy（国际版 / 国内版）、Qoder（国际版 / 国内版）、千问办公。未安装的渠道也会列在这里，标为「未安装」。",       dockRepair: "自动修复",
      dockRepairing: "修复中…",
      dockRepairRunning: "正在自动修复，请稍候…",
      dockRepairOk: "修复成功，车道已可用",
      dockRepairFail: "自动修复未完成",
      dockRepairNoModel: "没有可用的本地模型，已按固定顺序修复",     };
    const en = {
      title: "WorkBuddy",
      subtitle: "WorkBuddy models (Global / CN) in DSH.",
      signIn: "Sign in to WorkBuddy",
      importDesktop: "Import from the desktop app",
      signInHint: "Opens the WorkBuddy authorization page in a new tab; come back here when it is done.",
      waiting: "waiting for authorization…",
      openLogin: "Open the authorization page",
      signedIn: "Signed in",
      signedOut: "Signed out",
      logout: "Sign out",
      nickname: "Account",
      expires: "Credential expires",
      domain: "Domain",
      catalog: "Model catalog",
      catalogLive: "live list",
      catalogSaved: "saved list",
      catalogFallback: "built-in list",
      catalogUpdated: "updated",
      catalogError: "last refresh failed: ",
      refresh: "Refresh catalog",
      refreshing: "Refreshing…",
      models: "Model toggles",
      modelsHint: "Disabled models are hidden from DSH's model picker.",
      search: "search models / id",
      enableAll: "Enable all",
      disableAll: "Disable all",
      freeTag: "free",
      rateTag: "rate",
      ctxTag: "ctx",
      imgTag: "image",
      effortTag: "reasoning",
      showPaid: "Show paid models in the model picker",
      showPaidHint: "Off by default: only free models reach DSH's model picker.",
      maxWindow: "Use the upstream's maximum context window",
      maxWindowHint: "Off sends the upstream's default window (e.g. 300K); on sends the largest one (e.g. 1M).",
      credits: "Quota",
      creditsNone: "No quota information yet",
      creditsRemain: "remaining",
      creditsTotal: "total",
      creditsUnlimited: "unlimited",
      creditsEnd: "expires",
      creditsError: "Could not read the quota: ",
      identity: "client identity",
      errorLoad: "Cannot read connector status",
      retry: "Retry",
      failed: "Action failed",
      signedOutHint: "The model group appears after you sign in.",
      sessionStale: "The upstream refused this credential — the desktop app rotated its session. Press “Import from the desktop app” again, or sign in once more.",
      updateTitle: "Plugin update",
      updateCheck: "Check for updates",
      updateChecking: "Checking…",
      updateAvailable: "Update available",
      updateCurrent: "Up to date",
      updateApply: "Update to this commit",
      updateRunning: "Updating…",
      updateLocalCopy: "This install comes from a local path, so there is no remote to compare with.",
      updateUnknown: "Cannot read the remote right now: ",
      updateHint: "For a git install this checks upstream and updates to its latest commit in one click; DSH itself only shows Update for official plugins.",
      updateDone: "Updated. Restart the app to load it.",
      accountRestricted: "The upstream has restricted this account — this is not a credential problem, so signing in or importing again will not help. Only an appeal lifts it: submit feedback in WorkBuddy.",
      tabGlobal: "Global",
      tabCN: "China",
      panel: "Secure Model Dock",
      panelSub: "Free models from the AI desktop clients on this machine, discovered automatically and ready in DSH.",
      dockRefresh: "Check now",
      dockChecking: "Checking…",
      dockFreeCount: "free models",
      dockConnected: "clients connected",
      dockLastCheck: "last check",
      dockFree: "free",
      dockNoFree: "No free model right now",
      dockSignInQwen: "QwenWork desktop was detected, but its session has not been read yet. Open QwenWork, sign in, then refresh; this lane lists every tier your plan can route (paid lane).",
      dockSignInFirst: "Connect this client to discover its free models.",
      dockImport: "Use the desktop sign-in",
      dockRefreshLane: "Refresh catalog",
      dockConnectedChip: "connected",
      dockSignedOutChip: "not connected",
      dockStale: "The upstream rotated this session. Import the desktop sign-in again.",
      dockPlanned: "next up",
      dockQoderNote: "Qoder detected — its free QoDuck lane is the next one to wire.",
      dockFoot: "Free status comes from the upstream's live rate; checked at every start and every 30 minutes. Credentials stay on this machine.",
      dockFailed: "The action failed — try again",
      dockShowAll: "Show paid models",
      dockShowAllHint: "Free models only by default; turn this on to let paid models into the picker too.",
      dockModelsCount: "models",
      dockPaid: "paid",
      dockQwenHint: "QwenWork routes whichever tiers your plan allows; no free/paid split here.",
      dockDiag: "Diagnostics",
      dockDiagCopied: "Diagnostics copied — send it to the plugin author",
      dockModelsHint: "Checked models appear in DSH's model picker.",
      dockDetected: "Detected",
      dockEnabledCount: "enabled",
      dockDesktopOther: "The desktop app is signed in to the other edition; this lane can sign in separately in Settings.",
      dockTest: "Test",
      dockTesting: "Testing…",
      dockTestOk: "connection ok",
      dockTestFail: "test failed",
      dockNotInstalled: "not installed",
      dockUnavailableChip: "lane unavailable",
      dockInstallWorkbuddy: "WorkBuddy desktop app not found. Use “Sign in to WorkBuddy” for the browser flow, or install the app and use “Import from the desktop app”.",
      dockInstallQoder: "Qoder desktop app not found. Install and sign in, or configure QODER_TOKEN.",
      dockInstallQoderCn: "Qoder CN desktop app not found. Install and sign in to connect it.",
      dockInstallQwen: "QwenWork desktop app not found. Install and sign in to connect it.",
      dockLaneUnavailable: "This lane did not load; check that its entry is enabled in the plugin manager.",
      dockInstalledNoApp: "Desktop app not detected; using the existing session.",
      dockChannels: "Supported: WorkBuddy (Global / CN), Qoder (Global / CN), QwenWork. Channels that are not installed are still listed, marked “not installed”.",       dockRepair: "Auto-repair",
      dockRepairing: "Repairing…",
      dockRepairRunning: "Repairing automatically, please wait…",
      dockRepairOk: "Repaired — the lane works again",
      dockRepairFail: "Auto-repair did not finish",
      dockRepairNoModel: "No local model available; tried the fixed ladder",     };
    const L = typeof navigator !== "undefined" && /^zh/i.test(navigator.language || "") ? zh : en;

    const css = `
      .wb-card{border:.5px solid var(--dsw-alias-border-l2,#dedee3);border-radius:var(--dsw-radius-panel,12px);background:var(--dsw-alias-bg-layer-1,#fff);overflow:hidden}
      .wb-head{display:flex;align-items:center;gap:10px;width:100%;padding:14px 16px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .wb-head:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f1f3)}
      .wb-title{font-size:14px;font-weight:600}
      .wb-sub{color:var(--dsw-alias-label-secondary,#74747c);font-size:12px;margin-top:2px}
      .wb-chev{margin-left:auto;color:var(--dsw-alias-label-tertiary,#9a9aa3);transition:transform .15s}
      .wb-chev.wb-open{transform:rotate(90deg)}
      .wb-tabs{display:flex;gap:4px;padding:3px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,#f1f1f3);width:fit-content}
      .wb-tab{display:flex;align-items:center;gap:6px;height:28px;padding:0 12px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#74747c);font:inherit;font-size:13px;cursor:pointer}
      .wb-tab:hover{color:var(--dsw-alias-label-primary,#25252a)}
      .wb-tab[aria-selected="true"]{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#25252a);box-shadow:0 .5px 2px rgba(0,0,0,.08)}
      .wb-dot{width:7px;height:7px;border-radius:99px;background:var(--dsw-alias-label-tertiary,#9a9aa3);flex:none}
      .wb-dot.wb-dot-on{background:var(--dsw-alias-state-success-primary,#2f9e44)}
      .wb-dot.wb-dot-load{background:var(--dsw-alias-state-warning-primary,#d98416)}
      .wb-body{padding:2px 16px 16px;display:flex;flex-direction:column;gap:14px}
      .wb-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .wb-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#74747c)}
      .wb-badge{font-size:11px;padding:2px 8px;border-radius:99px;border:.5px solid var(--dsw-alias-border-l2,#dedee3);color:var(--dsw-alias-label-secondary,#74747c);white-space:nowrap}
      .wb-badge.wb-good{color:var(--dsw-alias-state-business-primary,#4176e6);border-color:currentColor}
      .wb-badge.wb-free{color:var(--dsw-alias-state-success-primary,#2f9e44);border-color:currentColor}
      .wb-input,.wb-button{height:30px;padding:0 10px;color:var(--dsw-alias-label-primary,#25252a);background:var(--dsw-alias-bg-layer-1,#fff);border:.5px solid var(--dsw-alias-border-l4,#d4d6db);border-radius:var(--dsw-radius-md,8px);font:inherit;font-size:13px}
      .wb-input{flex:1;min-width:160px}
      .wb-update-action{display:inline-flex;align-items:center;gap:8px;min-width:0}
      .wb-update-note{color:var(--dsw-alias-label-tertiary,#9a9aa3);font-size:12.5px;line-height:18px;white-space:nowrap}
      .wb-update-note-info{color:var(--dsw-alias-state-business-primary,#4176e6)}
      @media (max-width:720px){.wb-update-note{display:none}}
      .wb-button{cursor:pointer;white-space:nowrap}
      .wb-button:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f1f3)}
      .wb-button:disabled{opacity:.5;cursor:default}
      .wb-button.wb-primary{background:var(--dsw-alias-state-business-primary,#4176e6);border-color:transparent;color:#fff}
      .wb-button.wb-primary:hover{filter:brightness(1.05)}
      .wb-note{font-size:11px;color:var(--dsw-alias-label-tertiary,#9a9aa3);line-height:1.5}
      .wb-error{font-size:12px;color:var(--dsw-alias-state-error-primary,#bd4747)}
      .wb-models{display:flex;flex-direction:column;gap:2px;max-height:280px;overflow:auto;border:.5px solid var(--dsw-alias-border-l2,#dedee3);border-radius:var(--dsw-radius-md,8px);padding:6px}
      .wb-model{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;font-size:13px;flex-wrap:nowrap;min-width:0}
      .wb-model:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f1f3)}
      .wb-model input{accent-color:var(--dsw-alias-state-business-primary,#4176e6);flex:none}
      .wb-model-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wb-model-id{flex:0 1 auto;min-width:0;max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#9a9aa3);font-size:11px}
      .wb-model .wb-badge{flex:none}
      .wb-quota{display:flex;flex-direction:column;gap:6px}
      .wb-quota-row{display:flex;align-items:center;gap:8px;font-size:12px}
      .wb-bar{flex:1;height:6px;border-radius:99px;background:var(--dsw-alias-border-l2,#dedee3);overflow:hidden}
      .wb-bar span{display:block;height:100%;background:var(--dsw-alias-state-business-primary,#4176e6)}
      .wb-check{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary,#74747c);cursor:pointer}
      .wb-check input{accent-color:var(--dsw-alias-state-business-primary,#4176e6)}
      .wb-link{color:var(--dsw-alias-state-business-primary,#4176e6);text-decoration:none;cursor:pointer}
      @media(prefers-reduced-motion:reduce){.wb-chev{transition:none}}
    `;

    const timeText = (ms) => {
      if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return ""
      const d = new Date(ms)
      return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    }

    /** 200,000 tokens reads as 200K, 1,048,576 as 1M — never 195K or 1024K. */
    const ctxText = (n) => {
      if (!Number.isFinite(n) || n <= 0) return ""
      if (n >= 1e6) return `${Math.round(n / 1e5) / 10}M`
      return `${Math.round(n / 1e3)}K`
    }

    const isStatus = (value) => typeof value === "object" && value !== null && !Array.isArray(value) && value.status === "ok"

    /** One row of the model list: the toggle, the name, the id, and its badges. */
    function modelRow(m, rowOptions) {
      const { busy, setModelEnabled } = rowOptions
      return h("label", { key: m.id, className: "wb-model" },
        h("input", {
          type: "checkbox",
          checked: m.enabled !== false,
          disabled: busy,
          onChange: (e) => {
            // The toggle names ONE model and its new state; it never sends a
            // list derived from a snapshot of the page. A snapshot is stale
            // the moment the catalog refreshes, and a complement computed from
            // a stale one can disable every model but the one clicked.
            void setModelEnabled(m.id, e.target.checked)
          },
        }),
        h("span", { className: "wb-model-name", title: m.name }, m.name),
        h("span", { className: "wb-model-id", title: m.id }, m.id),
        m.free ? h("span", { className: "wb-badge wb-free" }, L.freeTag) : null,
        m.rate ? h("span", { className: "wb-badge" }, `${L.rateTag} ${m.rate}`) : null,
        m.rateUnknown ? h("span", { className: "wb-badge" }, "—") : null,
        m.contextWindow ? h("span", { className: "wb-badge" }, `${L.ctxTag} ${ctxText(m.contextWindow)}`) : null)
    }

    /**
     * One variant's section: sign-in, catalog, model toggles, quota.
     *
     * The status document carries both variants and belongs to the card
     * shell, so switching tabs never refetches and never loses the other
     * variant's data.
     */
    function VariantSection(props) {
      const { provider, status, load, loading } = props
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [query, setQuery] = React.useState("")
      const [login, setLogin] = React.useState(null)
      const mounted = React.useRef(true)
      React.useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false }
      }, [])

      const variant = status?.variants?.[provider]

      const post = React.useCallback(async (path, body, key) => {
        setBusy(true)
        setNotice(null)
        try {
          const res = await fetch(path, {
            method: "POST",
            headers: { "content-type": "application/json", "x-dsh-model-dock-key": key ?? "" },
            body: JSON.stringify(body),
          })
          if (!res.ok) throw new Error(String(res.status))
          await load()
          return true
        } catch {
          setNotice(L.failed)
          return false
        } finally {
          setBusy(false)
        }
      }, [load])

      /** Begin the device-authorization flow and start polling for its outcome. */
      const beginLogin = React.useCallback(async () => {
        setBusy(true)
        setNotice(null)
        try {
          const res = await fetch(LOGIN_PATH, {
            method: "POST",
            headers: { "content-type": "application/json", "x-dsh-model-dock-key": status?.loginKey ?? "" },
            body: JSON.stringify({ action: "begin", provider }),
          })
          if (!res.ok) throw new Error(String(res.status))
          const doc = await res.json()
          if (!mounted.current) return
          if (doc?.status === "pending" && doc.authUrl) setLogin({ url: doc.authUrl, state: doc.state })
          else setNotice(doc?.error ?? L.failed)
        } catch {
          if (mounted.current) setNotice(L.failed)
        } finally {
          if (mounted.current) setBusy(false)
        }
      }, [provider, status])

      /** Adopt the session the WorkBuddy desktop app is already signed in to. */
      const importDesktop = React.useCallback(async () => {
        setBusy(true)
        setNotice(null)
        try {
          const res = await fetch(AUTH_PATH, {
            method: "POST",
            headers: { "content-type": "application/json", "x-dsh-model-dock-key": status?.authKey ?? "" },
            body: JSON.stringify({ action: "import-desktop", provider }),
          })
          if (!res.ok) throw new Error(String(res.status))
          const doc = await res.json()
          if (!mounted.current) return
          if (doc?.ok === true) await load()
          else setNotice(doc?.error ?? L.failed)
        } catch {
          if (mounted.current) setNotice(L.failed)
        } finally {
          if (mounted.current) setBusy(false)
        }
      }, [provider, status, load])

      /** Poll the pending attempt until the human finishes in the browser. */
      React.useEffect(() => {
        if (!login) return undefined
        let cancelled = false
        const timer = setInterval(async () => {
          try {
            const res = await fetch(LOGIN_PATH, {
              method: "POST",
              headers: { "content-type": "application/json", "x-dsh-model-dock-key": status?.loginKey ?? "" },
              body: JSON.stringify({ action: "poll", provider, state: login.state }),
            })
            if (!res.ok) throw new Error(String(res.status))
            const doc = await res.json()
            if (cancelled || !mounted.current) return
            if (doc?.status === "complete") {
              setLogin(null)
              await load()
            } else if (doc?.status === "error") {
              setLogin(null)
              setNotice(doc.error ?? L.failed)
            }
          } catch {
            // A transient poll failure is not a failed login: keep polling.
          }
        }, 2500)
        return () => { cancelled = true; clearInterval(timer) }
      }, [login, provider, status, load])

      const auth = variant?.auth
      const catalog = variant?.catalog
      const models = Array.isArray(catalog?.models) ? catalog.models : []
      const shown = query.trim() === "" ? models : models.filter((m) => `${m.name} ${m.id}`.toLowerCase().includes(query.trim().toLowerCase()))
      // Both mutations name what they change, never a list derived from the
      // page: the server owns the catalog and computes the rest.
      const setModelEnabled = (model, enabled) => post(MODELS_PATH, { action: "set-model", provider, model, enabled }, status?.modelsKey)
      const setAllEnabled = (enabled) => post(MODELS_PATH, { action: "set-all", provider, enabled }, status?.modelsKey)
      const credits = variant?.credits
      const creditAccounts = Array.isArray(credits?.accounts) ? credits.accounts : []
      const creditTotal = credits?.totalSize ?? creditAccounts.reduce((sum, a) => sum + (Number(a.size) || 0), 0)

      return h(React.Fragment, null,
        h("div", null,
          h("div", { className: "wb-row" },
            h("span", { className: "wb-label" }, auth?.state === "signed-in" ? L.signedIn : L.signedOut),
            h("span", { className: `wb-badge${auth?.state === "signed-in" ? " wb-good" : ""}` },
              auth?.state === "signed-in" ? (auth.nickname ?? variant?.appName) : L.signedOut),
            auth?.state === "signed-in"
              ? h(React.Fragment, null,
                  h("button", { type: "button", className: "wb-button", disabled: busy, onClick: () => void post(AUTH_PATH, { action: "logout", provider }, status.authKey) }, L.logout),
                  // The desktop app re-signs in behind the plugin's back and
                  // rotates its own session, so adopting that session again has
                  // to stay reachable while signed in — otherwise a rotated
                  // credential can only be replaced by signing out first.
                  variant?.desktopAvailable === true
                    ? h("button", { type: "button", className: "wb-button", disabled: busy, onClick: () => void importDesktop() }, L.importDesktop)
                    : null)
              : h(React.Fragment, null,
                  h("button", { type: "button", className: "wb-button wb-primary", disabled: busy, onClick: () => void beginLogin() }, L.signIn),
                  variant?.desktopAvailable === true
                    ? h("button", { type: "button", className: "wb-button", disabled: busy, onClick: () => void importDesktop() }, L.importDesktop)
                    : null)),
          auth?.state === "signed-in" ? h("div", { className: "wb-note", style: { marginTop: 4 } },
            [auth.domain ? `${L.domain}: ${auth.domain}` : null, auth.expiresAt ? ` · ${L.expires}: ${timeText(auth.expiresAt)}` : null].filter(Boolean).join("")) : null,
          auth?.accountRestricted ? h("div", { className: "wb-error", style: { marginTop: 4 } },
            L.accountRestricted,
            h("div", { className: "wb-note", style: { marginTop: 2 } }, String(auth.accountRestricted))) : null,
          auth?.sessionStale === true && !auth?.accountRestricted ? h("div", { className: "wb-error", style: { marginTop: 4 } }, L.sessionStale) : null,
          auth?.state !== "signed-in" ? h("div", { className: "wb-note", style: { marginTop: 4 } }, L.signedOutHint) : null,
          auth?.reason ? h("div", { className: "wb-error", style: { marginTop: 4 } }, auth.reason) : null,
          login ? h("div", { className: "wb-row", style: { marginTop: 8 } },
            h("span", { className: "wb-note" }, L.waiting),
            h("a", { className: "wb-link", href: login.url, target: "_blank", rel: "noreferrer" }, L.openLogin)) : null),
        variant?.auth?.state === "signed-in" ? h("div", null,
          h("div", { className: "wb-row" },
            h("span", { className: "wb-label" }, L.catalog),
            h("span", { className: `wb-badge${catalog.source === "live" ? " wb-good" : ""}` },
              catalog.source === "live" ? L.catalogLive : catalog.source === "saved" ? L.catalogSaved : L.catalogFallback,
              catalog.fetchedAt ? ` · ${L.catalogUpdated} ${timeText(catalog.fetchedAt)}` : ""),
            h("button", { type: "button", className: "wb-button", disabled: busy || loading, onClick: () => void post(MODELS_PATH, { action: "refresh", provider }, status.modelsKey) }, loading ? L.refreshing : L.refresh)),
          catalog.error ? h("div", { className: "wb-error", style: { marginTop: 4 } }, L.catalogError + catalog.error) : null,
          h("div", { className: "wb-row", style: { marginTop: 6 } },
            h("label", { className: "wb-check" },
              h("input", {
                type: "checkbox",
                checked: variant?.useMaximumContextWindow === true,
                disabled: busy,
                onChange: (e) => void post(MODELS_PATH, { action: "set-max-window", provider, enabled: e.target.checked }, status.modelsKey),
              }),
              h("span", null, L.maxWindow)),
            h("span", { className: "wb-note" }, L.maxWindowHint)),
          h("div", { className: "wb-row", style: { marginTop: 6 } },
            h("label", { className: "wb-check" },
              h("input", {
                type: "checkbox",
                checked: variant?.showPaidModels === true,
                disabled: busy,
                onChange: (e) => void post(MODELS_PATH, { action: "set-show-paid", provider, enabled: e.target.checked }, status.modelsKey),
              }),
              h("span", null, L.showPaid)),
            h("span", { className: "wb-note" }, L.showPaidHint)),
          h("div", { className: "wb-row", style: { marginTop: 10 } },
            h("span", { className: "wb-label" }, L.models),
            h("input", { className: "wb-input", style: { maxWidth: 180, marginLeft: "auto" }, placeholder: L.search, value: query, onChange: (e) => setQuery(e.target.value) })),
          h("div", { className: "wb-note", style: { margin: "4px 0 6px" } }, L.modelsHint),
          h("div", { className: "wb-models" },
            shown.length === 0
              ? h("div", { className: "wb-note" }, "—")
              : shown.map((m) => modelRow(m, { busy, setModelEnabled }))),
          h("div", { className: "wb-row", style: { marginTop: 6 } },
            h("button", { type: "button", className: "wb-button", disabled: busy, onClick: () => void setAllEnabled(true) }, L.enableAll),
            h("button", { type: "button", className: "wb-button", disabled: busy, onClick: () => void setAllEnabled(false) }, L.disableAll))) : null,
        variant?.auth?.state === "signed-in" ? h("div", null,
          h("div", { className: "wb-row" },
            h("span", { className: "wb-label" }, L.credits),
            variant?.creditsError ? h("span", { className: "wb-badge" }, L.creditsError + variant.creditsError) : null),
          credits && creditAccounts.length > 0 ? h("div", { className: "wb-quota", style: { marginTop: 6 } },
            creditAccounts.map((a, i) => {
              const size = Number(a.size) || 0
              const remain = Number(a.remain) || 0
              const pct = size > 0 ? Math.max(0, Math.min(100, Math.round((remain / size) * 100))) : 0
              return h("div", { key: `${a.packageName}-${i}`, className: "wb-quota-row" },
                h("span", { style: { minWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: a.packageName }, a.packageName),
                h("span", { className: "wb-bar" }, h("span", { style: { width: `${pct}%` } })),
                h("span", { style: { whiteSpace: "nowrap" } }, `${remain} / ${size}`),
                a.packageEndTime ? h("span", { className: "wb-note" }, `${L.creditsEnd} ${a.packageEndTime}`) : null)
            }),
            creditTotal > 0 ? h("div", { className: "wb-note" }, `${L.creditsTotal}: ${creditTotal}`) : null)
            : credits ? h("div", { className: "wb-note" }, L.creditsNone) : null) : null,
        notice ? h("div", { className: "wb-error" }, notice) : null)
    }

    /**
     * The one card for both WorkBuddy editions.
     *
     * One panel with a variant tab, the way the Qoder connector does it: the
     * two editions share a card, a header and a status poll, and only the
     * section under the active tab differs.
     */
    function WorkBuddyCard() {
      const [open, setOpen] = React.useState(false)
      const [active, setActive] = React.useState("safe_workbuddy-global")
      const [status, setStatus] = React.useState(null)
      const [loadError, setLoadError] = React.useState(null)
      const [loading, setLoading] = React.useState(false)
      const mounted = React.useRef(true)
      React.useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false }
      }, [])

      const load = React.useCallback(async () => {
        setLoading(true)
        try {
          const res = await fetch(STATUS_PATH, { headers: { accept: "application/json" } })
          if (!res.ok) throw new Error(String(res.status))
          const doc = await res.json()
          if (!mounted.current) return
          if (isStatus(doc)) { setStatus(doc); setLoadError(null) }
          else setLoadError(L.errorLoad)
        } catch {
          if (mounted.current) setLoadError(L.errorLoad)
        } finally {
          if (mounted.current) setLoading(false)
        }
      }, [])

      // The status is cheap (it reads the cached catalog and the stored
      // credential — never the upstream), and the collapsed header shows the
      // sign-in state, so it is loaded whether the card is open or not.
      React.useEffect(() => {
        void load()
        const timer = setInterval(() => void load(), 60_000)
        return () => clearInterval(timer)
      }, [load])

      const variant = status?.variants?.[active]
      /** A tab's dot: green when that edition is signed in, amber while loading. */
      const dotClass = v => (v?.auth?.state === "signed-in" ? "wb-dot wb-dot-on" : status === null ? "wb-dot wb-dot-load" : "wb-dot")

      return h("div", { className: "wb-card" },
        h("style", null, css),
        h("button", { type: "button", className: "wb-head", onClick: () => setOpen((v) => !v), "aria-expanded": open },
          h("span", null,
            h("span", { className: "wb-title" }, L.title),
            h("div", { className: "wb-sub" }, L.subtitle)),
          variant?.auth?.state === "signed-in"
            ? h("span", { className: "wb-badge wb-good" }, variant.auth.nickname ?? variant.displayName)
            : status
              ? h("span", { className: "wb-badge" }, L.signedOut)
              : null,
          h("span", { className: `wb-chev${open ? " wb-open" : ""}`, "aria-hidden": "true" }, "›")),
        open ? h("div", { className: "wb-body" },
          h("div", { className: "wb-tabs", role: "tablist", "aria-label": L.title },
            h("button", { type: "button", role: "tab", className: "wb-tab", "aria-selected": active === "safe_workbuddy-global", onClick: () => setActive("safe_workbuddy-global") },
              h("span", { className: dotClass(status?.variants?.["safe_workbuddy-global"]), "aria-hidden": "true" }),
              h("span", null, L.tabGlobal)),
            h("button", { type: "button", role: "tab", className: "wb-tab", "aria-selected": active === "safe_workbuddy", onClick: () => setActive("safe_workbuddy") },
              h("span", { className: dotClass(status?.variants?.["safe_workbuddy"]), "aria-hidden": "true" }),
              h("span", null, L.tabCN))),
          loadError && !status ? h("div", { className: "wb-error" }, loadError, " ", h("button", { type: "button", className: "wb-button", onClick: () => void load() }, L.retry)) : null,
          status ? h(VariantSection, { provider: active, status, load, loading }) : h("div", { className: "wb-note" }, loading ? "…" : "—")) : null)
    }


    /** The sidebar entry id; the matching `main` key opens this panel. */
    const PANEL_ID = "model-dock";
    const PANEL_ORDER = 15;
    /** Lane order in the panel: international first, then CN. */
    const DOCK_LANES = ["safe_workbuddy-global", "safe_workbuddy"];

    /** Sidebar glyph: a hub with three satellites, drawn at the rail's size. */
    function DockIcon({ size = 20 }) {
      return h("svg", {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": "true",
        focusable: "false",
      },
        h("path", {
          d: "M12 12 6.2 7.1M12 12l5.8-4.9M12 12v5.6",
          stroke: "currentColor",
          strokeWidth: 1.7,
          strokeLinecap: "round",
        }),
        h("circle", { cx: 12, cy: 12, r: 2.5, fill: "currentColor" }),
        h("circle", { cx: 5.4, cy: 6.2, r: 1.8, stroke: "currentColor", strokeWidth: 1.6 }),
        h("circle", { cx: 18.6, cy: 6.2, r: 1.8, stroke: "currentColor", strokeWidth: 1.6 }),
        h("circle", { cx: 12, cy: 19.4, r: 1.8, stroke: "currentColor", strokeWidth: 1.6 }),
      );
    }

    const dockCss = `
      .md-page{height:100%;overflow:auto;padding:28px 32px 44px;color:var(--dsw-alias-label-primary,#1f2329);background:var(--dsw-alias-bg-base,#fff)}
      .md-wrap{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
      .md-hero{display:flex;align-items:flex-start;gap:14px}
      .md-logo{width:44px;height:44px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:13px;color:#fff;background:linear-gradient(135deg,#5b6cff,#22c3d6);box-shadow:0 6px 18px rgba(59,91,255,.22)}
      .md-h1{font-size:22px;font-weight:650;margin:0;letter-spacing:-.01em;line-height:1.25}
      .md-sub{margin:4px 0 0;font-size:13px;line-height:1.55;color:var(--dsw-alias-label-secondary,#6b7078)}
      .md-spacer{margin-left:auto}
      .md-btn{height:30px;padding:0 12px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l4,#d4d6db);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
      .md-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f1f3)}
      .md-btn:disabled{opacity:.5;cursor:default}
      .md-btn.md-primary{background:var(--dsw-alias-brand-primary,#3b5bff);border-color:transparent;color:#fff}
      .md-btn.md-primary:hover{filter:brightness(1.05)}
      .md-gateway{border:.5px solid var(--dsw-alias-border-l2,#e3e4e8);border-radius:14px;background:var(--dsw-alias-bg-layer-2,#f7f7f9);padding:16px;display:flex;flex-direction:column;gap:10px}
      .md-gateway-head{display:flex;align-items:center;gap:8px}
      .md-gw-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .md-gw-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:var(--dsw-alias-bg-layer-1,#fff);border:.5px solid var(--dsw-alias-border-l2,#e3e4e8);padding:4px 8px;border-radius:6px;word-break:break-all}
      .md-gw-models summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7078)}
      .md-gw-model-list{max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:5px;margin-top:6px}
      .md-gw-model{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}
      .md-gw-input{height:30px;width:96px;padding:0 8px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l4,#d4d6db);background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;font-size:13px}
      .md-repair{border:.5px solid var(--dsw-alias-border-l2,#e3e4e8);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#f7f7f9);padding:10px 12px;display:flex;flex-direction:column;gap:4px;max-height:240px;overflow:auto}
      .md-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .md-stat{border:.5px solid var(--dsw-alias-border-l2,#e3e4e8);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);padding:12px 14px;min-width:0}
      .md-stat b{display:block;font-size:21px;font-weight:650;line-height:1.2;letter-spacing:-.01em}
      .md-stat span{display:block;margin-top:2px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
      .md-lanes{display:flex;flex-direction:column;gap:12px}
      .md-lane{border:.5px solid var(--dsw-alias-border-l2,#e3e4e8);border-radius:14px;background:var(--dsw-alias-bg-layer-1,#fff);padding:16px 16px 14px;display:flex;flex-direction:column;gap:10px}
      .md-lane.md-lane-planned{background:var(--dsw-alias-bg-layer-2,#f7f7f9);border-style:dashed}
      .md-lane.md-lane-missing{background:var(--dsw-alias-bg-layer-2,#f7f7f9);border-style:dashed}
      .md-dot.md-off{background:#c4c8cf}
      .md-lane-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .md-app{width:30px;height:30px;border-radius:9px;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;background:linear-gradient(135deg,#2f6bff,#7b5cff)}
      .md-lane-title{font-size:15px;font-weight:600;letter-spacing:-.005em}
      .md-chip{font-size:11px;line-height:18px;padding:0 8px;border-radius:99px;border:.5px solid var(--dsw-alias-border-l2,#e3e4e8);color:var(--dsw-alias-label-secondary,#6b7078)}
      .md-state{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7078)}
      .md-dot{width:7px;height:7px;border-radius:99px;background:var(--dsw-alias-label-tertiary,#9a9aa3);flex:none}
      .md-dot.md-on{background:var(--dsw-alias-state-success-primary,#2f9e44);box-shadow:0 0 0 3px rgba(47,158,68,.13)}
      .md-dot.md-warn{background:var(--dsw-alias-state-warn-primary,#d98416)}
      .md-meta{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#8a8f98)}
      .md-note{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary,#6b7078)}
      .md-error{font-size:12px;color:var(--dsw-alias-state-error-primary,#bd4747)}
      .md-models{display:flex;flex-direction:column;gap:2px;border:.5px solid var(--dsw-alias-border-l1,#ebebee);border-radius:10px;padding:5px}
      .md-model{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;font-size:13px;min-width:0;cursor:pointer}
      .md-model:hover{background:var(--dsw-alias-interactive-bg-hover,#f4f4f6)}
      .md-model input{accent-color:var(--dsw-alias-brand-primary,#3b5bff);flex:none;margin:0}
      .md-model-check{width:13px;height:13px;flex:none;display:inline-block}
      .md-model-name{font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}
      .md-model-id{color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
      .md-tag{margin-left:auto;flex:none;font-size:11px;line-height:18px;padding:0 7px;border-radius:99px;border:.5px solid var(--dsw-alias-border-l2,#e3e4e8);color:var(--dsw-alias-label-secondary,#6b7078)}
      .md-tag.md-free{color:var(--dsw-alias-state-success-primary,#2f9e44);border-color:currentColor;background:rgba(47,158,68,.07);font-weight:600;margin-left:0}
      .md-tag + .md-tag{margin-left:0}
      .md-model .md-tag:first-of-type{margin-left:auto}
      .md-lane-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .md-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7078);cursor:pointer;margin-left:auto}
      .md-check input{accent-color:var(--dsw-alias-brand-primary,#3b5bff)}
      .md-foot{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8a8f98);border-top:.5px solid var(--dsw-alias-border-l1,#ebebee);padding-top:14px}
      .md-skeleton{height:96px;border-radius:14px;border:.5px solid var(--dsw-alias-border-l1,#ebebee);background:linear-gradient(100deg,var(--dsw-alias-bg-layer-1,#fff) 30%,var(--dsw-alias-bg-layer-2,#f4f4f6) 50%,var(--dsw-alias-bg-layer-1,#fff) 70%);background-size:220% 100%;animation:md-shimmer 1.4s linear infinite}
      @keyframes md-shimmer{from{background-position:120% 0}to{background-position:-120% 0}}
      @media (prefers-reduced-motion:reduce){.md-skeleton{animation:none}}
      @media (max-width:720px){.md-page{padding:20px 16px 32px}.md-stats{grid-template-columns:1fr 1fr}}
    `;

    /** One lane's free-model list; paid rows appear only when asked for. */
    function dockModelRow(model, props) {
      const { busy, onToggle, readOnly } = props;
      const Wrapper = readOnly === true ? "div" : "label";
      return h(Wrapper, { key: model.id, className: "md-model", title: model.id },
        readOnly === true
          ? h("span", { className: "md-model-check", "aria-hidden": "true" })
          : h("input", {
              type: "checkbox",
              checked: model.enabled !== false,
              disabled: busy,
              onChange: (event) => onToggle(model.id, event.target.checked),
            }),
        h("span", { className: "md-model-name" }, model.name),
        h("span", { className: "md-model-id" }, model.id),
        model.free ? h("span", { className: "md-tag md-free" }, L.dockFree) : null,
        model.contextWindow ? h("span", { className: "md-tag" }, ctxText(model.contextWindow)) : null,
        !model.free && model.rate ? h("span", { className: "md-tag" }, model.rate) : null,
        // 上游促销（如 Qwen4-Max 预览版「限时2折」）：倍率旁边如实标出来。
        Array.isArray(model.badges)
          ? model.badges.map((badge) => h("span", { key: badge, className: "md-tag" }, badge))
          : null,
        !model.free && model.rateUnknown ? h("span", { className: "md-tag" }, "—") : null,
      );
    }

    /**
     * The left-rail console: every known desktop client, the free models each
     * one currently exposes, and the two things a user actually does here —
     * connect the client, and choose which models DSH offers.
     */
    function DockPanel() {
      const [status, setStatus] = React.useState(null);
      const [cnStatus, setCnStatus] = React.useState(null);
      const [qwenStatus, setQwenStatus] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [notice, setNotice] = React.useState(null);
      const [probe, setProbe] = React.useState(null);
      const [probing, setProbing] = React.useState(false);
      const [repair, setRepair] = React.useState(null);
      const [gatewayKeyVisible, setGatewayKeyVisible] = React.useState(false);
      const [gatewayPort, setGatewayPort] = React.useState("");
      const alive = React.useRef(true);
      React.useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);

      const load = React.useCallback(async (quiet) => {
        if (quiet !== true) setBusy(true);
        try {
          const [res, cnRes, qwenRes] = await Promise.all([
            fetch(STATUS_PATH, { headers: { accept: "application/json" } }),
            fetch(CN_STATUS_PATH, { headers: { accept: "application/json" } }).catch(() => null),
            fetch(QWEN_STATUS_PATH, { headers: { accept: "application/json" } }).catch(() => null),
          ]);
          if (!res.ok) throw new Error(String(res.status));
          const doc = await res.json();
          let cnDoc = null;
          if (cnRes !== null && cnRes.ok) {
            try { cnDoc = await cnRes.json(); } catch { cnDoc = null; }
          }
          let qwenDoc = null;
          if (qwenRes !== null && qwenRes.ok) {
            try { qwenDoc = await qwenRes.json(); } catch { qwenDoc = null; }
          }
          if (alive.current && isStatus(doc)) {
            setStatus(doc);
            setCnStatus(cnDoc);
            setQwenStatus(qwenDoc);
            setNotice(null);
          }
        } catch {
          if (alive.current && quiet !== true) setNotice(L.dockFailed);
        } finally {
          if (alive.current && quiet !== true) setBusy(false);
        }
      }, []);

      React.useEffect(() => {
        if (status?.gateway?.port !== undefined) setGatewayPort(String(status.gateway.port));
      }, [status?.gateway?.port]);

      React.useEffect(() => {
        void load(true);
        const timer = setInterval(() => void load(true), 60_000);
        return () => clearInterval(timer);
      }, [load]);

      // The Qoder lane initializes after the plugin mounts (it mints a gateway
      // session and starts a loopback proxy), so the first status document can
      // legitimately say "not connected". Re-read shortly after instead of
      // making the user wait for the next minute tick.
      React.useEffect(() => {
        const qoder = status?.qoder;
        if (qoder === undefined || qoder === null) return undefined;
        if (qoder.auth?.state === "signed-in" || qoder.catalog?.error !== undefined) return undefined;
        const retry = setTimeout(() => void load(true), 3_000);
        return () => clearTimeout(retry);
      }, [status, load]);

      const post = React.useCallback(async (path, body, key) => {
        setBusy(true);
        setNotice(null);
        try {
          const res = await fetch(path, {
            method: "POST",
            headers: { "content-type": "application/json", "x-dsh-model-dock-key": key ?? "" },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(String(res.status));
          const doc = res.status === 204 ? null : await res.json();
          await load(true);
          // The host reports adopt/login failures in a 200 body (`{ok:false,
          // error}`); showing that sentence is the difference between "it
          // failed" and "the desktop app is signed in to the other edition".
          if (doc !== null && doc.ok === false && typeof doc.error === "string" && doc.error !== "") {
            setNotice(doc.error);
          }
          return doc;
        } catch {
          if (alive.current) setNotice(L.dockFailed);
          return null;
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [load]);

      const gatewayAction = React.useCallback(async (action, extra) => {
        const doc = await post(GATEWAY_PATH, { action, ...extra }, status?.gatewayKey);
        if (doc !== null && doc.ok === false && typeof doc.error === "string" && doc.error !== "") {
          setNotice(doc.error);
        }
        return doc;
      }, [post, status]);

      const copyText = React.useCallback(async (text) => {
        try {
          await navigator.clipboard.writeText(text);
          setNotice(L.dockGatewayCopied);
        } catch {
          setNotice(text);
        }
      }, []);

      const variants = status?.variants ?? {};
      const lanes = DOCK_LANES.map((id) => ({ id, lane: variants[id] })).filter((entry) => entry.lane !== undefined);
      // Qoder is a single-account lane; it joins the same renderer so the
      // free models, toggles, refresh and test actions behave identically.
      if (status?.qoder !== undefined && status.qoder !== null) lanes.push({ id: "qoder", lane: status.qoder });
      // Qoder CN runs in its own host row (different data directories and
      // gateway), so its state arrives on a second loopback route and is
      // merged into the same lane renderer.
      // Only surface the CN lane on a machine that has (or had) the CN app;
      // an unrelated macOS install should not grow a second "not connected"
      // Qoder row.
      // Always show the CN lane: a missing desktop app must not hide the
      // channel (users need to know it exists). `installed` drives the card's
      // "未安装" state; `unavailable` distinguishes a lane that failed to load.
      const cnDetected = cnStatus !== null && cnStatus !== undefined
        && (cnStatus.detected === true || cnStatus.state === "signed-in");
      const cnFree = (Array.isArray(cnStatus?.models) ? cnStatus.models : [])
        .filter((model) => model.priceFactor === 0);
      lanes.push({
        id: "qoder-cn",
        lane: {
          providerId: typeof cnStatus?.provider === "string" && cnStatus.provider !== "" ? cnStatus.provider : "safe_qoder-cn",
          displayName: "Qoder CN",
          chipText: "国内版",
          installed: cnDetected,
          unavailable: cnStatus === null || cnStatus === undefined,
          auth: {
            state: cnStatus?.state === "signed-in" ? "signed-in" : "signed-out",
            ...(typeof cnStatus?.name === "string" && cnStatus.name !== "" ? { nickname: cnStatus.name } : {}),
            // Only surface the raw "no credential" text once the app is
            // actually detected: on a not-installed machine the card's install
            // hint is the useful message, not a red decryption error.
            ...(cnDetected && typeof cnStatus?.reason === "string" && cnStatus.reason !== "" ? { reason: cnStatus.reason } : {}),
          },
          desktopAvailable: false,
          readOnly: true,
          catalog: {
            source: "live",
            models: cnFree.map((model) => ({
              id: model.id,
              name: model.name,
              contextWindow: model.contextWindow,
              maxTokens: model.maxTokens,
              supportsImages: false,
              free: true,
              rate: "x0.00",
              badges: [],
              efforts: [],
              enabled: true,
            })),
          },
        },
      });
      const clients = Array.isArray(status?.dock?.clients) ? status.dock.clients : [];
      const desktop = status?.dock?.desktop;

      const testLane = React.useCallback(async (provider, modelIds) => {
        const model = modelIds[0];
        if (model === undefined) return;
        setProbing(true);
        setProbe(null);
        try {
          const res = await fetch(PROBE_PATH, {
            method: "POST",
            headers: { "content-type": "application/json", "x-dsh-model-dock-key": status?.probeKey ?? "" },
            body: JSON.stringify({ provider, model }),
          });
          if (!res.ok) throw new Error(String(res.status));
          const doc = await res.json();
          if (alive.current) setProbe({ provider, ok: doc?.ok === true, text: doc?.ok === true ? String(doc.reply ?? "") : String(doc?.error ?? "") });
        } catch {
          if (alive.current) setProbe({ provider, ok: false, text: "" });
        } finally {
          if (alive.current) setProbing(false);
        }
      }, [status]);

      // QwenWork is a paid lane. Like the CN lane it is always listed; the
      // `installed` flag only changes the card's note and actions.
      const qwenDetected = qwenStatus !== null && qwenStatus !== undefined
        && (qwenStatus.detected === true || qwenStatus.credential !== undefined);
      const qwenCredential = qwenStatus?.credential;
      const qwenExpired = qwenCredential?.expired === true;
      lanes.push({
        id: "qwenwork",
        lane: {
          providerId: "safe_qwenwork",
          displayName: "千问办公",
          chipText: L.dockPaid,
          installed: qwenDetected,
          unavailable: qwenStatus === null || qwenStatus === undefined,
          auth: {
            state: qwenCredential !== undefined && qwenExpired !== true ? "signed-in" : "signed-out",
            ...(typeof qwenCredential?.displayName === "string" && qwenCredential.displayName !== "" ? { nickname: qwenCredential.displayName } : {}),
            ...(qwenDetected && typeof (qwenStatus?.lastError ?? qwenStatus?.credentialError) === "string"
              && (qwenStatus?.lastError ?? qwenStatus?.credentialError) !== ""
              ? { reason: qwenStatus?.lastError ?? qwenStatus?.credentialError }
              : {}),
          },
          desktopAvailable: false,
          readOnly: true,
          allModels: true,
          error: qwenStatus?.bridge?.error,
          catalog: {
            // live = 从上游 /api/desktop/chat-modes 拉到的实时目录；
            // fallback = 拉取失败时的内置回退（内容同样是实测值，但会过期）。
            source: qwenStatus?.catalogSource === "live" ? "live" : "fallback",
            fetchedAt: qwenStatus?.catalogFetchedAt,
            models: (Array.isArray(qwenStatus?.catalog) ? qwenStatus.catalog : []).map((model) => ({
              id: model.id,
              name: model.name,
              contextWindow: model.contextWindow,
              maxTokens: model.maxTokens,
              // 能力/倍率都照上游目录走：pro 是纯文本，其余支持图片；
              // 倍率来自 price_factor，不再写死。
              supportsImages: model.supportsImages === true,
              free: model.priceFactor === 0,
              priceFactor: typeof model.priceFactor === "number" ? model.priceFactor : undefined,
              isDefault: model.isDefault === true,
              rate: typeof model.priceFactor === "number" ? `x${model.priceFactor.toFixed(2)}` : undefined,
              badges: Array.isArray(model.badges) ? model.badges : [],
              efforts: [],
              enabled: true,
            })),
          },
        },
      });

      // Stats are computed AFTER every lane is appended: QwenWork is pushed
      // below the other lanes, and counting before it made a connected Qwen
      // lane invisible in the "已连接" total (2 instead of 3).
      const connectedLanes = lanes.filter((entry) => entry.lane.auth?.state === "signed-in");
      const models = connectedLanes.flatMap((entry) => (Array.isArray(entry.lane.catalog?.models) ? entry.lane.catalog.models : []));
      const freeModels = models.filter((model) => model.free === true);
      const connected = connectedLanes.length;
      const lastCheck = connectedLanes.reduce((latest, entry) => Math.max(latest, Number(entry.lane.catalog?.fetchedAt) || 0), 0);

      /** Copy the lane state (no tokens) for offline troubleshooting. */
      const copyDiagnostics = React.useCallback(async () => {
        const report = {
          version: status?.version,
          platform: status?.platform,
          arch: status?.arch,
          workbuddy: status?.variants,
          qoder: status?.qoder,
          qoderCn: cnStatus,
          qwenwork: qwenStatus,
        };
        const text = JSON.stringify(report, null, 2);
        try {
          await navigator.clipboard.writeText(text);
          setNotice(L.dockDiagCopied);
        } catch {
          try {
            const area = document.createElement("textarea");
            area.value = text;
            document.body.appendChild(area);
            area.select();
            document.execCommand("copy");
            area.remove();
            setNotice(L.dockDiagCopied);
          } catch {
            setNotice(text.slice(0, 400));
          }
        }
      }, [status, cnStatus, qwenStatus]);

      /**
       * Start the host-side repair job and follow it until it finishes.
       *
       * The job is bounded on the host (probe → fixed ladder → at most three
       * model-chosen allowlisted actions); this side only renders progress.
       */
      const startRepair = React.useCallback(async (provider) => {
        if (status === null || repair?.running === true) return;
        setRepair({ provider, job: null, running: true });
        setNotice(null);
        try {
          const res = await fetch(REPAIR_PATH, {
            method: "POST",
            headers: { "content-type": "application/json", "x-dsh-model-dock-key": status?.repairKey ?? "" },
            body: JSON.stringify({ provider }),
          });
          const doc = await res.json().catch(() => null);
          if (!res.ok || doc === null || typeof doc.jobId !== "string") {
            setNotice(doc !== null && typeof doc.error === "string" ? doc.error : L.dockRepairFail);
            setRepair(null);
            return;
          }
          for (;;) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            if (!alive.current) return;
            const poll = await fetch(`${REPAIR_PATH}?id=${encodeURIComponent(doc.jobId)}`, {
              headers: { "x-dsh-model-dock-key": status?.repairKey ?? "" },
            });
            if (!poll.ok) break;
            const job = await poll.json();
            if (!alive.current) return;
            setRepair({ provider, job, running: job.state === "running" });
            if (job.state !== "running") {
              if (job.success === true) setProbe(null);
              await load(true);
              break;
            }
          }
        } catch {
          if (alive.current) setNotice(L.dockRepairFail);
        } finally {
          if (alive.current) {
            setRepair((current) => (current === null ? null : { ...current, running: false }));
          }
        }
      }, [status, repair, load]);

      /**
       * Explicit macOS Keychain grant: the only path that may wait for a
       * system prompt. Startup reads stay bounded; this one waits 60s and then
       * retries the lane (Qoder imports, CN/Qwen re-read on the status reload).
       */
      const authorizeKeychain = React.useCallback(async (provider) => {
        const doc = await post(AUTH_PATH, { action: "authorize-keychain", provider }, status?.authKey);
        if (doc?.ok === true) {
          setNotice(doc.imported === false && typeof doc.importError === "string" && doc.importError !== ""
            ? `${L.dockKeychainOk} · ${doc.importError}`
            : L.dockKeychainOk);
        } else if (doc !== null && typeof doc?.error === "string" && doc.error !== "") {
          setNotice(doc.error);
        }
      }, [post, status]);

      const refreshAll = React.useCallback(async () => {
        setBusy(true);
        try {
          for (const entry of lanes) {
            if (entry.lane.auth?.state !== "signed-in") continue;
            if (entry.id === "qoder-cn" || entry.id === "qwenwork") {
              await fetch(entry.id === "qwenwork" ? QWEN_RESTART_PATH : CN_REFRESH_PATH, { method: "POST" }).catch(() => undefined);
              continue;
            }
            await post(MODELS_PATH, { action: "refresh", provider: entry.id }, status?.modelsKey);
          }
          await load(true);
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [lanes, post, status]);

      const checkinText = (checkin) => {
        if (checkin === null || checkin === undefined) return "";
        if (checkin.running === true) return L.dockCheckinRunning;
        switch (checkin.status) {
          case "claimed": return L.dockCheckinClaimed;
          case "already_claimed": return L.dockCheckinAlready;
          case "no_campaign": return L.dockCheckinNone;
          case "error": return `${L.dockCheckinError}${checkin.message ? ` · ${checkin.message}` : ""}`;
          default: return checkin.message ?? "";
        }
      };

      const renderLane = (entry) => {
        const lane = entry.lane;
        // The host may have registered the Qoder lane under a fallback id when
        // another plugin already owns "qoder"; probes must address that id.
        const providerId = typeof lane.providerId === "string" && lane.providerId !== "" ? lane.providerId : entry.id;
        const auth = lane.auth ?? {};
        const signedIn = auth.state === "signed-in";
        const laneModels = Array.isArray(lane.catalog?.models) ? lane.catalog.models : [];
        const laneFree = laneModels.filter((model) => model.free === true);
        const showPaid = lane.showPaidModels === true;
        const shown = lane.allModels === true ? laneModels : (showPaid ? laneModels : laneFree);
        // Qoder now exposes paid models behind the same switch as WorkBuddy; test
        // what the picker actually shows, not only the free subset.
        const testable = lane.allModels === true ? shown : entry.id === "qoder" ? shown : laneFree;
        // `installed` is undefined on an older host status: treat that as
        // "unknown, don't flag it" rather than as a missing app.
        const installed = lane.installed !== false;
        const unavailable = lane.unavailable === true;
        const missing = installed === false && signedIn !== true;
        const installHint = entry.id === "qoder"
          ? L.dockInstallQoder
          : entry.id === "qoder-cn"
            ? L.dockInstallQoderCn
            : entry.id === "qwenwork"
              ? L.dockInstallQwen
              : L.dockInstallWorkbuddy;
        const stateClass = signedIn
          ? "md-dot md-on"
          : missing
            ? "md-dot md-off"
            : auth.sessionStale === true ? "md-dot md-warn" : "md-dot";
        return h("section", { key: entry.id, className: missing ? "md-lane md-lane-missing" : "md-lane" },
          h("div", { className: "md-lane-head" },
            h("span", { className: "md-app", "aria-hidden": "true" }, entry.id === "qwenwork" ? "千" : entry.id.startsWith("qoder") ? "Q" : "W"),
            h("span", { className: "md-lane-title" }, lane.displayName ?? entry.id),
            h("span", { className: "md-chip" }, lane.chipText ?? (lane.region === "global" ? L.tabGlobal : L.tabCN)),
            h("span", { className: "md-state" },
              h("span", { className: stateClass, "aria-hidden": "true" }),
              signedIn
                ? L.dockConnectedChip
                : unavailable
                  ? L.dockUnavailableChip
                  : installed === false ? L.dockNotInstalled : L.dockSignedOutChip)),
          signedIn
            ? h("div", { className: "md-meta" },
                [auth.nickname, auth.domain].filter(Boolean).join(" · "),
                lane.catalog?.fetchedAt ? ` · ${L.dockLastCheck} ${timeText(lane.catalog.fetchedAt)}` : "")
            : h("div", { className: "md-note" },
                unavailable
                  ? L.dockLaneUnavailable
                  : installed === false
                    ? installHint
                    : entry.id === "qwenwork" ? L.dockSignInQwen : L.dockSignInFirst),
          signedIn && installed === false
            ? h("div", { className: "md-note" }, L.dockInstalledNoApp)
            : null,
          entry.id === "qoder" && lane.checkin !== undefined
            && (lane.checkin.lastDate !== undefined || lane.checkin.status !== undefined)
            ? h("div", { className: lane.checkin.status === "error" ? "md-error" : "md-meta" },
                `${L.dockCheckinLast} ${lane.checkin.lastDate ?? "—"} · ${checkinText(lane.checkin)}`)
            : null,
          entry.id === "qoder" && lane.catalog !== undefined
            ? h("div", { className: lane.catalog.error !== undefined ? "md-error" : "md-meta" },
                lane.catalog.error !== undefined
                  ? `${L.dockCatalogFailed} · ${lane.catalog.error}`
                  : lane.catalog.source === "live"
                    ? `${L.dockCatalogLive}${lane.catalog.fetchedAt === undefined ? "" : ` · ${L.dockCatalogUpdated} ${new Date(lane.catalog.fetchedAt).toLocaleTimeString()}`}`
                    : L.dockCatalogChecking)
            : null,
          auth.sessionStale === true ? h("div", { className: "md-error" }, L.dockStale) : null,
          typeof auth.reason === "string" && auth.reason !== "" ? h("div", { className: "md-error" }, auth.reason) : null,
          lane.error !== undefined && lane.error !== null ? h("div", { className: "md-error" }, String(lane.error)) : null,
          lane.desktopError !== undefined && lane.desktopError !== null ? h("div", { className: "md-error" }, String(lane.desktopError)) : null,
          auth.sessionStale === true
            || (typeof auth.reason === "string" && auth.reason !== "")
            || (lane.error !== undefined && lane.error !== null)
            || (lane.desktopError !== undefined && lane.desktopError !== null)
            ? h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
                h("button", {
                  type: "button",
                  className: "md-btn",
                  disabled: repair?.running === true,
                  onClick: () => void startRepair(entry.id),
                }, repair?.provider === entry.id && repair.running === true ? L.dockRepairing : L.dockRepair))
            : null,
          signedIn
            ? h("div", { className: "md-models" },
                shown.length === 0
                  ? h("div", { className: "md-note", style: { padding: "6px 8px" } }, L.dockNoFree)
                  : shown.map((model) => dockModelRow(model, {
                      busy,
                      readOnly: lane.readOnly === true,
                      onToggle: (id, enabled) => void post(MODELS_PATH, { action: "set-model", provider: entry.id, model: id, enabled }, status?.modelsKey),
                    })))
            : null,
          h("div", { className: "md-lane-actions" },
            signedIn
              ? h("button", {
                  type: "button",
                  className: "md-btn",
                  disabled: busy,
                  onClick: () => {
                    if (entry.id === "qoder-cn" || entry.id === "qwenwork") {
                      setBusy(true);
                      const path = entry.id === "qwenwork" ? QWEN_RESTART_PATH : CN_REFRESH_PATH;
                      void fetch(path, { method: "POST" })
                        .then(() => load(true))
                        .catch(() => setNotice(L.dockFailed))
                        .finally(() => { if (alive.current) setBusy(false); });
                      return;
                    }
                    void post(MODELS_PATH, { action: "refresh", provider: entry.id }, status?.modelsKey);
                  },
                }, L.dockRefreshLane)
              : null,
            signedIn && testable.length > 0
              ? h("button", {
                  type: "button",
                  className: "md-btn",
                  disabled: busy || probing,
                  onClick: () => {
                    const ids = testable.filter((model) => model.enabled !== false).map((model) => model.id);
                    // 千问办公：优先测账号的默认模型，其次倍率最低的那个。目录随时会变，
                    // 不能再写死某个 id（曾经写死 qwen3.8-flash，目录一换就测不到）。
                    const cheapest = entry.id === "qwenwork"
                      ? [...testable]
                          .filter((model) => model.enabled !== false)
                          .sort((a, b) => Number(b.isDefault === true) - Number(a.isDefault === true)
                            || (a.priceFactor ?? Number.POSITIVE_INFINITY) - (b.priceFactor ?? Number.POSITIVE_INFINITY))
                          .map((model) => model.id)
                      : ids;
                    void testLane(providerId, cheapest);
                  },
                }, probing ? L.dockTesting : L.dockTest)
              : null,
            signedIn && entry.id === "qoder"
              ? h("button", {
                  type: "button",
                  className: "md-btn",
                  disabled: busy,
                  onClick: () => void post(MODELS_PATH, { action: "checkin", provider: "qoder" }, status?.modelsKey),
                }, busy ? L.dockCheckinRunning : L.dockCheckin)
              : null,
            signedIn
              ? h("button", {
                  type: "button",
                  className: "md-btn",
                  disabled: busy || repair?.running === true,
                  onClick: () => void startRepair(entry.id),
                }, repair?.provider === entry.id && repair.running === true ? L.dockRepairing : L.dockRepair)
              : null,
            status?.platform === "darwin" && lane.installed === true
              && (entry.id === "qoder" || entry.id === "qoder-cn" || entry.id === "qwenwork")
              ? h("button", {
                  type: "button",
                  className: "md-btn",
                  disabled: busy,
                  title: L.dockKeychainHint,
                  onClick: () => void authorizeKeychain(entry.id),
                }, L.dockKeychain)
              : null,
            (!signedIn || auth.sessionStale === true) && lane.installed === true
              && (entry.id === "qoder" || desktop?.region === undefined || desktop.region === lane.region)
              ? h("button", { type: "button", className: "md-btn md-primary", disabled: busy, onClick: () => void post(AUTH_PATH, { action: "import-desktop", provider: entry.id }, status?.authKey) }, L.dockImport)
              : null,
            !signedIn && entry.id.startsWith("safe_workbuddy")
              && desktop?.region !== undefined && desktop.region !== lane.region
              ? h("span", { className: "md-meta" }, L.dockDesktopOther)
              : null,
            signedIn && entry.id === "qoder"
              ? h("label", { className: "md-check", title: L.dockAutoCheckinHint },
                  h("input", {
                    type: "checkbox",
                    checked: lane.checkin?.auto === true,
                    disabled: busy,
                    onChange: (event) => void post(MODELS_PATH, { action: "set-auto-checkin", provider: "qoder", enabled: event.target.checked }, status?.modelsKey),
                  }),
                  h("span", null, L.dockAutoCheckin))
              : null,
            signedIn && (entry.id.startsWith("safe_workbuddy") || entry.id === "qoder")
              ? h("label", { className: "md-check", title: L.dockShowAllHint },
                  h("input", {
                    type: "checkbox",
                    checked: showPaid,
                    disabled: busy,
                    onChange: (event) => void post(MODELS_PATH, { action: "set-show-paid", provider: entry.id, enabled: event.target.checked }, status?.modelsKey),
                  }),
                  h("span", null, L.dockShowAll))
              : null),
          signedIn
            ? h(React.Fragment, null,
                h("div", { className: "md-meta" }, `${lane.allModels === true || (entry.id === "qoder" && showPaid) ? `${shown.length} ${L.dockModelsCount}` : `${laneFree.length} ${L.dockFreeCount}`} · ${shown.filter((model) => model.enabled !== false).length}/${shown.length} ${L.dockEnabledCount}`),
                h("div", { className: "md-meta" }, lane.allModels === true ? L.dockQwenHint : L.dockModelsHint))
            : null,
          probe !== null && probe.provider === providerId
            ? h("div", { className: probe.ok ? "md-meta" : "md-error" },
                `${probe.ok ? L.dockTestOk : L.dockTestFail}${probe.text !== "" ? ` · ${probe.text}` : ""}`,
                !probe.ok
                  ? h("div", { style: { marginTop: "6px", display: "flex", gap: "8px", flexWrap: "wrap" } },
                      h("button", {
                        type: "button",
                        className: "md-btn",
                        disabled: repair?.running === true,
                        onClick: () => void startRepair(entry.id),
                      }, repair?.provider === entry.id && repair.running === true ? L.dockRepairing : L.dockRepair))
                  : null)
            : null,
          repair !== null && repair.provider === entry.id
            ? h("div", { className: "md-repair" },
                h("div", { className: repair.job?.success === true ? "md-meta" : "md-error" },
                  repair.running === true
                    ? L.dockRepairRunning
                    : repair.job?.success === true ? L.dockRepairOk : L.dockRepairFail),
                repair.job?.modelInfo !== undefined && repair.job.modelInfo !== null
                  ? h("div", { className: "md-meta" }, `修复模型：${repair.job.modelInfo.provider} / ${repair.job.modelInfo.model}`)
                  : null,
                (repair.job?.steps ?? []).map((step, index) => h("div", {
                  key: `${index}-${step.at ?? 0}`,
                  className: step.state === "fail" ? "md-error" : "md-meta",
                }, `${step.text}${step.detail ? ` · ${step.detail}` : ""}`)),
                repair.job?.hint ? h("div", { className: "md-meta" }, repair.job.hint) : null)
            : null);
      };

      const renderPlanned = (client) => h("section", { key: client.id, className: "md-lane md-lane-planned" },
        h("div", { className: "md-lane-head" },
          h("span", { className: "md-app", "aria-hidden": "true" }, "Q"),
          h("span", { className: "md-lane-title" }, client.name),
          h("span", { className: "md-chip" }, client.installed ? L.dockDetected : "—"),
          h("span", { className: "md-state" }, h("span", { className: "md-dot", "aria-hidden": "true" }), L.dockPlanned)),
        h("div", { className: "md-note" }, L.dockQoderNote));

      const gatewayOrigin = status?.gateway === undefined
        ? ""
        : status.gateway.endpoint.replace(/\/v1$/u, "");
      const firstGatewayModel = (status?.gateway?.modelList ?? []).find((row) => row.free === true)?.id
        ?? status?.gateway?.modelList?.[0]?.id
        ?? "";
      const claudeCodeConfig = status?.gateway === undefined
        ? ""
        : `ANTHROPIC_BASE_URL=${gatewayOrigin}\nANTHROPIC_AUTH_TOKEN=${status.gateway.key}\nANTHROPIC_MODEL=${firstGatewayModel}`;

      return h("div", { className: "md-page" },
        h("style", null, dockCss),
        h("div", { className: "md-wrap" },
          h("div", { className: "md-hero" },
            h("span", { className: "md-logo", "aria-hidden": "true" }, h(DockIcon, { size: 24 })),
            h("div", null,
              h("h1", { className: "md-h1" }, L.panel),
              h("p", { className: "md-sub" }, L.panelSub)),
            h("span", { className: "md-spacer" }),
            h("button", { type: "button", className: "md-btn", onClick: () => void copyDiagnostics() }, L.dockDiag),
            h("button", { type: "button", className: "md-btn md-primary", disabled: busy, onClick: () => void refreshAll() }, busy ? L.dockChecking : L.dockRefresh)),
          h("div", { className: "md-stats" },
            h("div", { className: "md-stat" }, h("b", null, String(freeModels.length)), h("span", null, L.dockFreeCount)),
            h("div", { className: "md-stat" }, h("b", null, String(connected)), h("span", null, L.dockConnected)),
            h("div", { className: "md-stat" }, h("b", null, lastCheck > 0 ? timeText(lastCheck) : "—"), h("span", null, L.dockLastCheck))),
          status === null
            ? h("div", { className: "md-skeleton" })
            : h("div", { className: "md-lanes" },
                lanes.map(renderLane),
                clients.filter((client) => client.id !== "qoder" || status.qoder === undefined).map(renderPlanned)),
          status?.gateway !== undefined
            ? h("section", { className: "md-gateway" },
                h("div", { className: "md-gateway-head" },
                  h("span", { className: "md-lane-title" }, L.dockGateway),
                  h("span", { className: "md-chip" }, status.gateway.running ? L.dockGatewayRunning : L.dockGatewayStopped),
                  h("span", { className: status.gateway.running ? "md-dot md-on" : "md-dot", "aria-hidden": "true" })),
                h("p", { className: "md-sub" }, L.dockGatewaySub),
                h("label", { className: "md-check" },
                  h("input", {
                    type: "checkbox",
                    checked: status.gateway.enabled === true,
                    disabled: busy,
                    onChange: (event) => void gatewayAction("set-enabled", { enabled: event.target.checked }),
                  }),
                  h("span", null, L.dockGatewayEnable)),
                h("div", { className: "md-gw-row" },
                  h("span", { className: "md-meta" }, L.dockGatewayEndpoint),
                  h("code", { className: "md-gw-code" }, status.gateway.endpoint),
                  h("button", { type: "button", className: "md-btn", onClick: () => void copyText(status.gateway.endpoint) }, L.dockGatewayCopy)),
                h("div", { className: "md-gw-row" },
                  h("span", { className: "md-meta" }, L.dockGatewayKey),
                  h("code", { className: "md-gw-code" },
                    gatewayKeyVisible === true
                      ? status.gateway.key
                      : `${"•".repeat(16)}${status.gateway.key.slice(-4)}`),
                  h("button", { type: "button", className: "md-btn", onClick: () => setGatewayKeyVisible((value) => !value) }, gatewayKeyVisible ? L.dockGatewayHide : L.dockGatewayShow),
                  h("button", { type: "button", className: "md-btn", onClick: () => void copyText(status.gateway.key) }, L.dockGatewayCopy),
                  h("button", { type: "button", className: "md-btn", disabled: busy, onClick: () => void gatewayAction("regenerate-key") }, L.dockGatewayRegenerate)),
                h("div", { className: "md-gw-row" },
                  h("span", { className: "md-meta" }, L.dockGatewayPort),
                  h("input", {
                    className: "md-gw-input",
                    type: "number",
                    min: 1024,
                    max: 65535,
                    value: gatewayPort,
                    onChange: (event) => setGatewayPort(event.target.value),
                  }),
                  h("button", { type: "button", className: "md-btn", disabled: busy, onClick: () => void gatewayAction("set-port", { port: Number(gatewayPort) }) }, L.dockGatewaySave),
                  h("span", { className: "md-meta" }, `${status.gateway.models} ${L.dockGatewayModels}`)),
                h("div", { className: "md-meta" }, L.dockGatewayHint),
                h("div", { className: "md-meta" }, L.dockGatewayClaude),
                h("div", { className: "md-gw-row" },
                  h("span", { className: "md-meta" }, L.dockGatewayAnthropic),
                  h("code", { className: "md-gw-code" }, gatewayOrigin),
                  h("button", { type: "button", className: "md-btn", onClick: () => void copyText(gatewayOrigin) }, L.dockGatewayCopy),
                  h("button", { type: "button", className: "md-btn", onClick: () => void copyText(claudeCodeConfig) }, L.dockGatewayCopyClaude)),
                h("details", { className: "md-gw-models" },
                  h("summary", null, `${L.dockGatewayModelsTitle} · ${status.gateway.models}`),
                  h("div", { className: "md-gw-model-list" },
                    (status.gateway.modelList ?? []).map((row) => h("div", { key: row.id, className: "md-gw-model" },
                      h("code", { className: "md-gw-code" }, row.id),
                      h("span", { className: "md-meta" }, row.name ?? ""),
                      h("span", { className: "md-chip" }, row.free === true ? L.dockFree : (row.rate ?? L.dockPaid)))))),
                status.gateway.error !== undefined
                  ? h("div", { className: "md-error" }, `${L.dockGatewayError}: ${status.gateway.error}`)
                  : null)
            : null,
          notice !== null ? h("div", { className: "md-error" }, notice) : null,
          h("p", { className: "md-foot" }, L.dockChannels),
          h("p", { className: "md-foot" }, L.dockFoot)));
    }

    /**
     * Join the shared 《插件设置》 block with the same rendezvous protocol the
     * sibling connect plugins use: wait for the host's `settings.section`,
     * attach to the existing container when one is registered, otherwise
     * register it (falling back to attaching when a sibling wins the race).
     */
    const SHARED_SECTION_SLOT = "settings.section"
    const SHARED_SECTION_ID = "plugin-settings"
    const SHARED_SECTION_ORDER = 900
    const SHARED_ITEM_SLOT = "plugin-settings.item"
    const SHARED_ITEM_ID = "dsh-model-dock"
    const SHARED_SECTION_LABEL = "插件设置"

    function PluginSettingsSection(props) {
      return h("ul", {
        style: { display: "flex", flexDirection: "column", gap: 6, padding: 0, listStyle: "none" },
      }, props.renderSlot(SHARED_ITEM_SLOT, {}))
    }

    /** The package name this card belongs to, as the plugin page reports it. */
    const PACKAGE_NAME = "dsh-model-dock";

    /**
     * The per-process control key for the update route.
     *
     * Read from the status document, the same place `authKey` and `modelsKey`
     * come from, and cached for the page's lifetime: it is minted once per host
     * process, and a failed read is retried rather than remembered as "no key"
     * (which would render as a permanent 403).
     */
    let updateKeyPromise;
    function updateKeyOf() {
      updateKeyPromise ??= fetch(STATUS_PATH)
        .then((res) => (res.ok ? res.json() : undefined))
        .then((doc) => {
          const key = doc?.updateKey;
          return typeof key === "string" && key !== "" ? key : undefined;
        })
        .catch(() => {
          updateKeyPromise = undefined;
          return undefined;
        });
      return updateKeyPromise;
    }

    /**
     * The contribution to the plugin page's own detail actions.
     *
     * DSH offers an "Update" button only for the official on-demand catalog —
     * `updateAvailable()` in the plugin page requires an `installTarget`, and
     * the manager derives that from `OFFICIAL_ON_DEMAND_CATALOG` alone, so a
     * community bundle installed from `github:…` never gets one however far
     * behind it is. The page does declare `plugins.detail.actions` for exactly
     * this situation, so this card supplies the missing button for its own
     * package and nothing else.
     *
     * Installing stays the manager's job: `ctx.remote.pluginManager` owns the
     * profile lock, the pnpm run and the reload lifecycle, so this never writes
     * to the profile itself.
     */
    function UpdateActions({ subject, L, manager }) {
      const pkg = subject?.kind === "bundle" ? subject.pkg : undefined
      const mine = pkg?.name === PACKAGE_NAME && pkg?.installed === true;
      const [report, setReport] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [message, setMessage] = React.useState(null);
      const alive = React.useRef(true);
      React.useEffect(() => () => { alive.current = false; }, []);

      const check = React.useCallback(async (force) => {
        setBusy(true);
        setMessage(null);
        try {
          // The route is guarded like every other card route, and the key
          // arrives with the status document the card already fetches — so it
          // is read here rather than assumed absent (this component does not
          // receive the settings card's `status` prop).
          const key = await updateKeyOf();
          const res = await fetch(`${UPDATE_PATH}${force ? "?refresh=1" : ""}`, {
            headers: key === undefined ? {} : { "x-dsh-model-dock-key": key },
          });
          if (!res.ok) throw new Error(String(res.status));
          const doc = await res.json();
          if (alive.current) setReport(doc);
        } catch (error) {
          if (alive.current) setReport({ state: "unknown", reason: String(error?.message ?? error) });
        } finally {
          if (alive.current) setBusy(false);
        }
      }, []);

      // Only the package's own page pays for a network round trip, and only
      // once: the host caches the answer for six hours anyway.
      React.useEffect(() => {
        if (mine && report === null && !busy) void check(false);
      }, [mine, report, busy, check]);

      const apply = React.useCallback(async () => {
        if (report?.targetSpec === undefined) return;
        setBusy(true);
        setMessage(null);
        try {
          await reinstallThroughManager(manager, report.targetSpec);
          if (alive.current) setMessage(L.updateDone);
        } catch (error) {
          if (alive.current) setMessage(String(error?.message ?? error));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [report, manager, L]);

      // Nothing to say on another package's page.
      if (!mine) return null;

      const state = report?.state;
      // The page's own Update control is `Button variant="outline" size="sm"`
      // with the refresh glyph; an available version is offered as `primary`.
      // Matching both keeps this action reading as part of the page.
      const behind = state === "behind";
      return h("span", { className: "wb-update-action" },
        h("button", {
          type: "button",
          style: {
            height: 30,
            padding: "0 12px",
            borderRadius: 8,
            border: behind ? "0.5px solid transparent" : "0.5px solid var(--dsw-alias-border-l4,#d4d6db)",
            background: behind ? "var(--dsw-alias-brand-primary,#3b5bff)" : "var(--dsw-alias-bg-layer-1,#fff)",
            color: behind ? "#fff" : "var(--dsw-alias-label-primary,#1f2329)",
            font: "inherit",
            fontSize: 13,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.5 : 1,
          },
          disabled: busy,
          title: behind ? (report.targetSpec ?? undefined) : undefined,
          "aria-label": behind ? L.updateApply : L.updateCheck,
          onClick: () => void (behind ? apply() : check(true)),
        }, busy ? (behind ? L.updateRunning : L.updateChecking) : (behind ? L.updateApply : L.updateCheck)),
        // The badge carries the same meaning the page's own "Update available"
        // tag does, so it is rendered as text beside the action rather than as
        // a second control.
        behind ? h("span", { className: "wb-update-note wb-update-note-info" }, L.updateAvailable) : null,
        state === "current" ? h("span", { className: "wb-update-note" }, L.updateCurrent) : null,
        message !== null ? h("span", { className: "wb-update-note" }, message) : null,
        state === "local-copy" ? h("span", { className: "wb-update-note" }, L.updateLocalCopy) : null,
        state === "unknown" ? h("span", { className: "wb-update-note" }, `${L.updateUnknown}${report.reason ?? ""}`) : null,
      );
    }

    /**
     * Reinstall this package at `spec` through the plugin manager.
     *
     * `installBundle` refuses a package that is already present
     * (`already-installed`), so an update is a removal followed by an install
     * pinned to the commit the check resolved — the same pair the page's own
     * official Update button performs, on the same remote service. Doing it
     * here rather than in the host half is deliberate: the manager owns the
     * profile lock, the pnpm run and the reload lifecycle, and reaching it over
     * the remote keeps that ownership in one place.
     */
    async function reinstallThroughManager(manager, spec) {
      if (manager === undefined) throw new Error("the plugin manager service is unavailable");
      const removed = await manager.removeBundle(PACKAGE_NAME);
      if (removed?.ok !== true) throw new Error(removed?.error?.message ?? "the manager refused to remove the package");
      const installed = await manager.installBundle(spec, {});
      if (installed?.ok !== true) throw new Error(installed?.error?.message ?? "the manager refused to install the package");
    }

    // `remote.pluginManager` is the service the plugin page itself injects; a
    // card that wants the page's own Update behaviour has to ask for the same
    // namespace rather than reaching for a global.
    const inject = ["slots", "remote.pluginManager"]

    function apply(ctx) {
      // The left-rail console. The icon id is also the `main` key, so the
      // sidebar button and the panel it opens are one registration concept:
      // the shell owns the button, and this module owns what it shows.
      try {
        const disposeIcon = ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
          name: "sidebar.panellist",
          id: PANEL_ID,
          order: PANEL_ORDER,
          label: () => L.panel,
        }, DockIcon))
        const disposePanel = ctx.slots.inject("main", () => ctx.slots.register({
          name: "main",
          key: PANEL_ID,
        }, DockPanel))
        ctx.effect(() => () => {
          try { disposePanel?.(); } catch (error) { note("panel-dispose", error); }
          try { disposeIcon?.(); } catch (error) { note("icon-dispose", error); }
        }, "dsh-model-dock: sidebar console")
      } catch (error) {
        console.error("[dsh-model-dock] could not register the sidebar console:", error)
        note("sidebar", error)
      }

      try {
        ctx.slots.inject(SHARED_SECTION_SLOT, () => {
          try {
            let disposeContainer
            if (!ctx.slots.entries(SHARED_SECTION_SLOT).some((entry) => entry.options?.id === SHARED_SECTION_ID)) {
              try {
                disposeContainer = ctx.slots.register({
                  name: SHARED_SECTION_SLOT,
                  id: SHARED_SECTION_ID,
                  order: SHARED_SECTION_ORDER,
                  label: () => SHARED_SECTION_LABEL,
                  children: { [SHARED_ITEM_SLOT]: { kind: "list", scope: "root" } },
                }, PluginSettingsSection)
              } catch (error) {
                console.error("[dsh-model-dock] shared plugin-settings block lost the race; attaching to the winner:", error)
                note("container", error)
              }
            }
            const disposeItem = ctx.slots.inject(SHARED_ITEM_SLOT, () => ctx.slots.register({
              name: SHARED_ITEM_SLOT,
              id: SHARED_ITEM_ID,
              order: 50,
            }, () => h(WorkBuddyCard)))
            return () => {
              disposeItem()
              disposeContainer?.()
            }
          } catch (error) {
            console.error("[dsh-model-dock] could not register the settings item:", error)
            note("section-inject", error)
          }
        })
        // The plugin page's per-package action row. Registered separately and
        // defensively: a host without this slot (an older page, or a surface
        // that never opens the page) must still get the settings card above.
        try {
          const manager = ctx.get("remote.pluginManager")
          const disposeActions = ctx.slots.inject("plugins.detail.actions", () => ctx.slots.register({
            name: "plugins.detail.actions",
            id: `${PACKAGE_NAME}-update`,
            order: 10,
          }, (props) => h(UpdateActions, { ...props, L, manager })))
          ctx.effect(() => () => {
            disposeActions?.()
          }, "dsh-model-dock: plugin page actions")
        } catch (error) {
          console.error("[dsh-model-dock] could not register the plugin page actions:", error)
          note("detail-actions", error)
        }
      } catch (error) {
        console.error("[dsh-model-dock] could not register the settings card:", error)
        note("apply", error)
      }
    }

    return { inject, apply }
  },
})
