# Changelog

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
