# Changelog

## 0.8.10 — fork

版本号递增（无代码改动）。相对 0.8.9 只改了 `package.json` 的 `version`。

## 0.8.9 — fork

### 修复

钥匙串授权框反复弹（千问办公车道）：

- **主密钥进程内缓存**（`qwenwork/desktop-auth.js`）。token 会轮换，但 `os_crypt`
  主密钥只在 App 重建钥匙串条目时才变。之前每条聊天请求（`chat-shim.js` 每请求
  调一次 `getCredential()`）和每次 `/status` 刷新都要去钥匙串重取；现在每次启动
  最多读一次，只有解密失败才失效重取。
- **先探存在性再读密码**：`security find-generic-password -s NAME`（只读属性，
  不触发授权框）确认条目存在后再 `-w`。条目不存在直接跳过——没装的客户端不会再
  因为候选名单被逐个 `-w` 而弹框。
- **授权失败即止**：条目存在但 `-w` 被拒/超时后不再换下一个候选名（上游写法最多
  会连弹 4 个框）。`-w` 超时 5s → 20s，给人留出点击时间。
- **没装 Qoder 就不再碰它的钥匙串**：`lib/qoder.js` 调 `importFromIDE()` 之前先判断
  桌面端是否存在；`start()` 失败后会随每次状态刷新重试，之前会一路弹。
- **Qoder CN** 的 `ensureMacKey()` 同样改为先探后读、失败即止。

实测（用假的 `security` 统计调用）：条目不存在 → 4 次属性探测、**0 次** `-w`；
条目存在但被拒 → 1 次探测 + **1 次** `-w` 后停止；同一目录连续读 3 次 → 只有首次
访问钥匙串。

## 0.8.8 — fork

### 新增

- `tools/check-keychain.mjs` + `npm run check:keychain`：守卫脚本，禁止包里出现
  `Chrome Safe Storage` / `Chromium Safe Storage` 服务名或 Chrome 用户目录引用
  （上游 0.7.8 的回退项）。用 0.7.8 实测可命中两处，用当前版本与已安装副本均为干净。
- README 在「钥匙串授权」小节补一句：本包只读各客户端自己的 Safe Storage 条目，
  不读 Chrome 的，可用上面这个脚本核对。

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
