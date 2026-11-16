# Changelog

## 0.8.12 — fork

### 修复

并行工具调用被并成一个，整轮以 `MALFORMED_RESPONSE` 中断（千问办公车道）：

- **现象**：模型一轮里发两个工具调用时，DSH 收到的是一个调用、参数是
  `{"name": "dsh-doc"}{"command": "ls -la ~/.dsh"}` 这种两段 JSON 粘在一起，
  `JSON.parse` 在第一个 `}` 后撞见 `{` → `MALFORMED_RESPONSE` → 该轮立即结束
  （该错误码不在默认重试列表，所以表现为「啪一下断掉」）。单工具轮不受影响，
  于是看起来像偶发。
- **根因**：上游把同一轮的多个 `tool_call` 分片都标成 `index: 0`，而 pi-ai 的
  `ensureToolCallBlock()` 按 OpenAI 规范用 `index` 认块——index 一命中就复用同一块，
  于是第二个调用的 `id`／`name` 被丢掉、`arguments` 被拼到第一个后面。
  shim 原本是「原样透传（含 index/id）」，等于把畸形 index 直接喂给下游。
- **修法**：新增 `qwenwork-direct/lib/tool-call-index.js`，在 shim 下发前把本请求的
  `tool_calls` 归一化成一一对应的 index。认槽顺序：①见过的 `id` 直接续写；
  ②上游 `index` 命中且该槽没被**另一个 id** 占用、参数也没收尾 → 续写；
  ③其余分配新槽（0、1、2…）。另加两条兜底：上游不给 `id` 或给字面量 `"null"`
  时补一个**本请求内唯一**的合成 id（pi-ai 在 index 未命中时会拿 id 兜底认块，
  两个调用共用 `"null"` 照样会被并回去）；槽累积参数已是完整 JSON 却又来非空分片
  时开新槽。
- **兼容性**：合规上游走**恒等路径**（index 本来一一对应、id 齐全时原对象返回），
  行为不变，只改写畸形流。

实测：新增 `npm run check:tool-call-index`，12 项自检全绿——含事故帧 1:1 复现
（不归一化 → 并成 1 块且 JSON 非法；归一化 → 2 块各自合法）、分片流 + 同 index、
合规上游 index 一字不改、单调用多分片不被误拆、id 缺失 / `id: "null"`、同一 delta
内两个调用。全机日志侧证据：3 个会话 6 次中断全部落在本车道，且本车道上从未出现过
「一轮 ≥2 个工具调用块」，同期 GLM 车道并行调用正常。

## 0.8.11 — fork

### 修复

「千问办公」整个分组从模型选择器里消失（报
`adapter returned invalid or duplicate model metadata for provider "safe_qwenwork"`）：

- **根因**：上游目录新增了 key 字面量为 `qwen3.8-flash` 的模型（「Qwen3.8-Flash」，x0.1），
  而 `flash`（「标准」，x0.1）的历史对外别名正是 `qwen3.8-flash`。两条目录映射成同一个
  对外 id，DSH 的 `listModels()` 判 `INVALID_CATALOG`，整条 `safe_qwenwork` 路由被摘掉——
  面板仍显示已连接，用户看到的是「模型都没了」。
- **别名让位真模型**（`qwenwork-direct/lib/catalog.js` 的 `releaseDisplayAliases()`）：
  上游既然下发了这个 key，就以它为准，`flash` 退回 `flash` 作对外 id；上游没有该 key 时
  别名照旧生效（已持久化的旧选择不失效）。
- **对外 id 去重兜底**（`dedupeModelIds()`）：上游重复下发同一个 key 时保留第一条，不再把整条
  路由拖成无效目录；`qwenwork-direct/index.js` 的目录视图与状态卡片也过一遍去重。

实测（2026-11-16 线上目录 13 条）：修正前重复 id `qwen3.8-flash` ×2 → 修正后 13 条目录
13 个唯一 id，`标准` = `flash`、`Qwen3.8-Flash` = `qwen3.8-flash` 各归各。

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
