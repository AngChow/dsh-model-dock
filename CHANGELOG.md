# Changelog

## 0.8.8 — fork

### 新增

- `tools/check-keychain.mjs` + `npm run check:keychain`：守卫脚本，禁止包里出现
  `Chrome Safe Storage` / `Chromium Safe Storage` 服务名或 Chrome 用户目录引用
  （上游 0.7.8 的回退项）。用 0.7.8 实测可命中两处，用当前版本与已安装副本均为干净。
- README 增加排障说明：钥匙串弹窗里写的是哪条条目就是哪条，
  `QwenWorkCN Safe Storage` 属正常首次授权，`Chrome Safe Storage` 说明装的是旧版本。

## 0.8.7 — fork

### 修复

- **Qoder 国内版通道重载后丢路由**：`cn/index.js` 用一次性的 `ctx.get("webServer")`
  取服务，插件热重载时 webServer 还没就绪就拿不到，且被 `catch {}` 静默吞掉，
  于是 `/plugins/dsh-model-dock/qoder-cn/status` 变 404，面板显示「通道未加载」。
  改为和宿主入口一致的 `ctx.inject(["webServer"], …)` 延迟注入。
- **未安装 Qoder / Qoder 国内版时仍然报红**：未装桌面端、也没有现成令牌时，
  「找不到登录文件」是预期状态。`lib/qoder.js` 的 `status()` 现在只在真正有凭据
  来源（已装 App 或已有令牌）时才带 `error`；`cn` 的状态路由在 `detected: false`
  时不再回错误文本。

## 0.8.6 — fork

### 修复

- 面板顶部与 shell 右上角悬浮层（如「自选行情」浮动条）重叠：主区域内容是从顶部
  铺下来的，`.md-page` 原来只有 `28px` 上内边距，标题行和右上角悬浮层叠在一起。
  上内边距提到 `56px`（窄屏 `52px`），标题与右上角按钮组整体下移。

## 0.8.5 — fork

### 改名

- 界面名称由「安全模型坞 / Secure Model Dock」改为「待薅的羊毛 / Freebie Dock」。
  改动点：`package.json` 的 `displayName`、`client.js` 的 `L.panel`、
  `locale/{zh,en}.json` 的 `meta.title`、`lib/repair.js` 里自动修复提示词的插件自称。
  包名、provider id（`safe_*`）、路由前缀均未改动，已装环境无需改配置。

### 文档

- README 增加「本地安装与更新」：源码目录即安装源、pnpm 用硬链接所以改完要重装、
  宿主侧改动用 entry 开关热重载、客户端改动刷新页面、钥匙串授权与 token 回写说明。

## 0.8.4 — fork

基于上游 `dsh-model-dock@0.8.3`（sun，MIT）。

### 移除

- **整块删除「上报问题」功能**。删掉的内容：
  - `lib/index.js`：`DEFAULT_REPORT_URL` / `DEFAULT_REPORT_TOKEN`、`REPORT_URL_ENV` /
    `REPORT_TOKEN_ENV` / `REPORT_CONFIG_FILENAME` / `REPORT_UPLOAD_TIMEOUT_MS`、
    `normalizeReportUrl()`、`reportEndpoint()`、`sanitizeForReport()`、
    `scrubReportText()`、`summarizeLane()`、`reportHandler`、`report` 路由键与
    `POST /plugins/dsh-model-dock/report` 注册。
  - `client.js`：`REPORT_PATH`、`sendReport()`、`reporting` 状态，以及面板上
    「上报错误」「一键上报这个错误」「上报这次失败」三个按钮与对应文案。
- 移除动机：上游把收集地址以明文 `http://<裸 IP>` 编译进包内，与其自身注释
  （"Empty by default so a stock install is inert"）和 README 的配置说明矛盾，
  属于默认开启的外发通道。

### 保留

- 「诊断」按钮：仅把各车道状态 JSON 复制到剪贴板，不联网。
- 其余能力未改动：三条车道（WorkBuddy / Qoder 国际版与国内版 / 千问办公）、
  实时模型目录、自动修复、本地 OpenAI/Anthropic 兼容网关。
