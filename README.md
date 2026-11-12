# 待薅的羊毛 · Freebie Dock

> 本地维护分支。上游原名「安全模型坞 / Secure Model Dock」（`dsh-model-dock`），
> 包名、provider id（`safe_*`）和路由均未改动，只换了界面上的名字。

把本机 AI 桌面客户端里**当前免费**的模型汇总到 DeepSeek Harness 的侧边栏里：自动发现、实时判断免费状态、一键开关，然后直接在 DSH 的模型选择器里调用。

已支持：

| 客户端 | 车道 | 当前免费模型（示例） |
|---|---|---|
| WorkBuddy（国际版 / 国内版） | `safe_workbuddy-global` / `safe_workbuddy` | Hy3、Hy4（按上游倍率实时判断） |
| Qoder 国际版 | `safe_qoder` | QoDuck（`lmodel`，`is_free` / 倍率 x0.00） |
| Qoder 国内版 | `safe_qoder-cn` | QoDuck（同样按 `price_factor` 判断免费） |
| 千问办公（QwenWork） | `safe_qwenwork` | 账号实时目录里的全部模型（标准 / 高级 / Qwen4-Max 预览版 / Qwen3.8-Max…，**付费车道，不过滤**） |

Qoder 默认只发布**免费模型**，和 WorkBuddy 一样有「显示付费模型」开关：打开后，上游目录里的付费模型（Auto / Efficient / Ultimate / Qwen / DeepSeek / Kimi / GLM 等）也会进入 DSH 模型选择器，按上游倍率标注。默认档位不再写死 `max`，而是按每个模型 `thinking_config` 声明的 `efforts` 收敛到它实际支持的档位；没有声明档位的模型按“不开思考”发送。

千问办公是**付费模型车道**：它走的是**无状态的模型网关**（`agent_chat_generation` + COSY 签名），不是 ACP 会话。插件在本机起一个回环桥，把每次 Chat Completions 直接转发成网关请求，因此：

- **不会在千问办公里生成任何会话**；
- 没有 agent 会话的沙箱启动开销，首字明显更快；
- 每次请求都带完整上下文，DSH 的工具调用/历史不会被会话状态吞掉。

它列出账号实时目录里的全部模型，不做免费/付费过滤。目录**不是写死的**：车道启动时拉一次 `GET /api/desktop/chat-modes`（和千问办公 App 的模型选择器同一个数据源），此后每 30 分钟、以及面板打开时超过 5 分钟没刷新就再拉一次。

- 模型名取上游 `i18n.display_name`（标准 / 高级 / Qwen4-Max 预览版 / Qwen3.8-Max），
- **倍率取上游 `price_factor`**（`x0.10` / `x1.00` / `x0.40` / `x1.80`），促销标签（如 Qwen4-Max 预览版的「限时2折」）一并带给选择器和面板；
- 是否支持图片取 `is_vl`（`高级` 是纯文本），是否思考取 `is_reasoning`。

拉不到目录（令牌过期、断网、企业网关策略）时保留上一份可用目录，并把来源标成 `fallback`（内置回退表，内容与真机实测一致）；车道本身照常注册，不会因为一次目录请求失败就把模型选择器清空。

> 旧版本把目录写死成 3 个模型（`pro` / `flash` / `qwen3.8-max-preview`，`qwen3.8-max-preview` 的倍率还停在 `x1.10`），上游一改就和 App 对不上（缺 `frontier-1`、倍率差一截）。这就是 0.7.6 改成实时目录的原因。

## 它怎么工作

```
WorkBuddy / Qoder 桌面客户端（已登录）
        │  各自的本地登录态（只在内存中解封）
        ▼
DSH 插件（本机）── 拉取实时模型目录 ──▶ 判断哪些倍率是 x0.00（免费）
        │
        ├── 侧边栏「待薅的羊毛」：免费模型清单 / 开关 / 刷新 / 测试
        └── DSH 模型选择器：WorkBuddy / WorkBuddy AI / Qoder 三个 provider
```

Qoder 的网关是 COSY 协议（RSA + AES 会话密钥、MD5 请求签名、自定义 base64）。国际版与国内版分别跑一条只监听 `127.0.0.1` 的转接层，把 Qoder 的流式响应转成 OpenAI 兼容格式；国内版网关是 `gateway.qoder.com.cn`，国际版是 `api2.qoder.sh`。真实令牌不会交给 DSH 的模型适配器。

- **配置尽量少**：装好插件后，如果本机 WorkBuddy 桌面版已登录，插件会在启动时自动采用它的登录态——不用再登录一次，也不用填 API Key。
- **每次启动都检查**：启动时（以及每 30 分钟）拉取上游实时模型目录，免费标记直接来自上游倍率，活动结束会自动消失，不会挂一个过期的“免费”。
- **凭据不出本机**：令牌只在宿主进程内使用，侧边栏和设置卡片只会看到账号昵称与域。
- **千问办公登录态复用**：读取桌面客户端的 `auth-v2.dat`；macOS 用钥匙串里的 `QwenWorkCN Safe Storage` 口令（PBKDF2 + AES-128-CBC），Windows 用 DPAPI + AES-256-GCM。读不到时可用 `QWENWORK_TOKEN` 或设置里的令牌兜底。
- **Qoder 登录态复用**：自动读取桌面版 `auth.v1.dat`，不需要再登录。macOS 用钥匙串里的 `Qoder App Safe Storage`（AES-128-CBC），Windows 用 Chromium OSCrypt（DPAPI 保护的 AES-256-GCM，经 PowerShell 解一次密钥后缓存）；国际版与国内版分别扫描 `com.qoder.app.*` / `com.qodercn.app.*`。桌面版轮换会话后，面板上点一次「使用桌面版登录」即可重新导入。
- **默认只显示免费模型**：WorkBuddy 与 Qoder 的模型选择器默认只列出免费模型；面板或设置里的「显示付费模型」开关（默认关闭、按客户端持久化）打开后，付费模型才会进入选择器并按上游倍率标注。

## 使用

1. 在 DSH 里安装本插件（`plugin_manager` → `install_bundle`，目标为本目录）。
2. 左侧栏出现「待薅的羊毛」图标，点开即可看到：
   - 已连接的客户端与账号；
   - 当前免费模型（名称、ID、上下文窗口）；
   - 每行勾选控制是否出现在 DSH 的模型选择器里。
3. 面板上的「测试」会用当前车道的第一个免费模型发一次极小的真实请求，绿灯表示整条链路（适配器 → 本机回环 → 上游）都通了。
4. 在 DSH 的模型选择器里切到 `WorkBuddy` / `WorkBuddy AI` / `Qoder` 分组即可使用。默认只有免费模型；需要付费模型时，打开该车道的「显示付费模型」开关。

> 面板**始终列出全部支持渠道**：WorkBuddy（国际版 / 国内版）、Qoder（国际版 / 国内版）、千问办公。本机没有安装的渠道不会被隐藏，而是标为「未安装」并给出安装/登录提示，方便用户知道插件支持哪些客户端。

> 安装后如果侧边栏还没出现，刷新一次页面（客户端面板需要重新加载）；宿主侧改动用插件管理器的启用/停用切换即可热重载，不必重启 App。

如果侧边栏显示“未连接”，但本机 WorkBuddy 已登录，点一次「使用桌面版登录」即可；也可以到 **设置 → 插件设置 → WorkBuddy** 里走设备授权登录。

## 命名与冲突

本插件注册到 DSH 的所有 provider id 都带 `safe_` 前缀，避免和其它插件（尤其是「自由模型坞」自带的 Qoder 渠道）抢同一个 id：

| 车道 | provider id |
|---|---|
| WorkBuddy | `safe_workbuddy` |
| WorkBuddy AI | `safe_workbuddy-global` |
| Qoder 国际版 | `safe_qoder` |
| Qoder 国内版 | `safe_qoder-cn` |
| 千问办公 | `safe_qwenwork` |

模型身份（`modelIdentity`）同样是 `safe_` 前缀。面板、测试、自动修复都按真实注册的 id 走；如果 `safe_qoder` 仍被占用，会再退到 `safe_qoder-dock`，并把实际 id 写进 `/status` 的 `qoder.providerId`。

> 升级到 0.7.0 后，DSH 里旧的 `workbuddy` / `qoder` 模型选择不会自动迁移，需要在模型选择器里重新选一次带 `safe_` 的分组。

宿主自带的 `@earendil-works/pi-ai` 版本由 DSH/薪灵决定，可能是 1.3.x，也可能是更早的构建。插件会按 `api/openai-completions.lazy` → `api/openai-completions` → 包根导出 → 直接 dist 文件逐级解析，不绑定单一子路径；如果宿主仍然缺少 OpenAI-completions 实现，导入会给出明确的诊断而不是只报 `ERR_PACKAGE_PATH_NOT_EXPORTED`。

## 自动修复

面板每条车道都有「自动修复」；「测试」失败后也会出现该按钮。点击后由宿主执行一个有边界的修复任务：

1. 先做一次真实测试；
2. 失败则按固定阶梯修：重新导入桌面登录态 → 重启本地转接层 → 刷新模型目录；
3. 仍失败才调用一个**可用的本地模型**做决策：模型只能从白名单里选一个动作（`reimport-desktop` / `restart-lane` / `refresh-catalog` / `wait` / `open-login` / `stop`），宿主执行后重新测试；
4. 最多 3 轮模型决策、总时长 3 分钟；成功即停，失败给出原因，诊断可由面板「诊断」按钮复制到本机剪贴板。

模型只“选动作”，不执行任何命令、不改文件、不接触凭据；错误文本即使包含提示注入，也只能在固定动作里浪费一轮。

修复模型的选择顺序：

1. 环境变量 `DSH_MODEL_DOCK_REPAIR_PROVIDER` / `DSH_MODEL_DOCK_REPAIR_MODEL`；
2. `<profile>/.dsh-model-dock/repair-config.json`：
   - DSH 里的模型：`{ "provider": "deepseek-account", "model": "deepseek-flash" }`；
   - 本机 OpenAI 兼容运行时（Ollama / LM Studio / llama.cpp）：`{ "baseUrl": "http://127.0.0.1:11434", "model": "qwen2.5:7b" }`（`baseUrl` 可省略 `/v1`，插件会补；也可用环境变量 `DSH_MODEL_DOCK_REPAIR_BASE_URL` / `DSH_MODEL_DOCK_REPAIR_API_KEY`）；
3. 自动挑选：优先 `deepseek-official` / `deepseek-account` / 自由模型坞，然后任意有模型且不属于本插件的 provider；
4. 都没有时探测本机 `127.0.0.1:11434`（Ollama）与 `127.0.0.1:1234`（LM Studio）的 `/v1/models`，取第一个模型。

找不到可用模型时，仍会执行固定阶梯；面板会说明“没有可用的本地模型”。

如果车道本身没有可调用模型（例如上游的免费模型下线了），自动修复会直接说明“上游当前没有免费模型”，而不是反复重试。

## 自动签到

Qoder 车道支持每日签到积分活动（上游的 `CLAIM_BENEFIT` 活动）。Qoder 卡片上：

- 「签到」：手动领取今天的活动奖励；
- 「每天自动签到」：默认关闭，按 profile 持久化；打开后每天第一次连接/启动时尝试一次，之后每 6 小时检查一次；
- 状态显示上次签到日期和结果（已领取 / 今天已签到 / 暂无活动 / 失败）；
- 上游领取接口是幂等的（`replayed` / `already_claimed`），重复调用不会重复领取。

目前只有 Qoder 有可用的签到活动接口；其他渠道没有对应 API 时不会显示签到控件。

## 本地 API

把坞里的模型以 **OpenAI 兼容接口** 暴露给本机工具（Cline / Roo / Continue / OpenAI SDK 等）。面板底部有「本地 API」卡片：

- 启用开关、端口、API Key、复制地址/Key、重新生成 Key；
- 默认关闭；启用后只监听 `127.0.0.1:<port>/v1`，必须带 `Authorization: Bearer <key>`；
- `GET /v1/models`，`POST /v1/chat/completions`（支持 `stream: true`）；
- 模型名格式 `<provider>/<model>`，例如 `safe_workbuddy-global/hy4free`、`safe_qoder/qfmodel`；
- 请求直接转发到各车道已有的回环 shim，工具调用、推理档位、流式行为与 DSH 内一致；
- Key 保存在 `<profile>/.dsh-model-dock/gateway.json`（0600），只保存在本机。

示例：

```bash
curl http://127.0.0.1:18666/v1/models \
  -H "Authorization: Bearer <key>"

curl http://127.0.0.1:18666/v1/chat/completions \
  -H "Authorization: Bearer <key>" \
  -H "content-type: application/json" \
  -d '{"model":"safe_workbuddy-global/hy4free","messages":[{"role":"user","content":"hi"}]}'
```

OpenAI SDK 的 `base_url` 设为 `http://127.0.0.1:18666/v1` 即可。

网关同时支持 **Anthropic `/v1/messages`**（Claude Code / Anthropic SDK）：

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:18666
export ANTHROPIC_AUTH_TOKEN=<key>
export ANTHROPIC_MODEL=safe_workbuddy-global/hy4free
```

`/v1/messages` 支持流式、文本和 `tool_use` / `tool_result` 转换；`/v1/messages/count_tokens` 返回估算值。`/v1/models` 与面板「模型清单」会列出所有模型（含付费），带展示名、倍率和 `<provider>/<model>` 全名。

## 本仓库的改动（相对上游 v0.8.3）

这是 **AngChow 维护的本地分支**，基于上游 `dsh-model-dock@0.8.3`（作者 sun，MIT）修改。

唯一的功能性改动：**整块移除了「上报问题」功能**。

- 删掉面板上的「上报错误」「一键上报这个错误」「上报这次失败」三个入口；
- 删掉宿主侧 `POST /plugins/dsh-model-dock/report` 路由、`reportHandler`、脱敏函数
  （`sanitizeForReport` / `scrubReportText` / `summarizeLane`）与 `reportKey`；
- 删掉编译进包里的默认收集地址与 `x-report-token`
  （上游写在 `lib/index.js` 的 `DEFAULT_REPORT_URL` / `DEFAULT_REPORT_TOKEN`，
  是一个明文 HTTP 的裸 IP），以及 `DSH_MODEL_DOCK_REPORT_URL` /
  `DSH_MODEL_DOCK_REPORT_TOKEN` / `report-config.json` 三条配置路径；
- 保留「诊断」按钮（只把车道状态复制到剪贴板，不联网），排障时仍可用。

结果：本包内不再存在任何向第三方发送数据的代码路径。上游原有的其它能力
（WorkBuddy / Qoder 国际版与国内版 / 千问办公三条车道、自动修复、本地
OpenAI 兼容网关）保持不变。

界面名称改为「待薅的羊毛 / Freebie Dock」（`package.json` 的 `displayName`、
`client.js` 的 `L.panel`、`locale/*.json` 的 `meta.title`、自动修复提示词里的
插件自称）。包名 `dsh-model-dock`、provider id `safe_*`、路由 `/plugins/dsh-model-dock/*`
都没变，所以已装环境升级时不需要改配置。

## 本地安装与更新

约定：**这个仓库的源码目录就是安装源**，不使用 tgz。

```bash
git clone https://github.com/AngChow/dsh-model-dock.git ~/workspace_codex/dsh-model-dock
```

在 DSH 里装（插件管理器的 `install_bundle`，目标为本目录）：

```
file:/Users/<你>/workspace_codex/dsh-model-dock
```

### 改完代码怎么让本地生效

pnpm 是把文件**硬链接**进 profile 的，不是软链，所以改源码**不会**自动生效：

```bash
# 两种方式，任选其一
# 1) 在 DSH 插件面板里对该插件重新安装 / 重装一次
# 2) 命令行：
cd ~/.dsh/profiles/<profile>     # 例如 desktop
pnpm install
```

然后：

- **宿主侧改动**（`lib/`、`qwenwork*/`、`cn/`）→ 在插件管理器里把对应 entry
  关一次再打开即可热重载，不必重启 App；
- **客户端改动**（`client.js`、`locale/`）→ 刷新页面。
- 改了 `package.json` 的 `version` 而没动代码时也要重装一次，否则面板显示的仍是旧版本号。

### 千问办公车道需要一次钥匙串授权

macOS 上 `QwenWorkCN Safe Storage` 这条目默认只授权给千问办公自己，DSH 宿主进程
直接读会被拒（表现为 `Keychain item "QwenWorkCN Safe Storage" unavailable`，
目录退回 fallback）。在面板里点「授权钥匙串」并在系统弹窗点「始终允许」，或手动：

```bash
security find-generic-password -s "QwenWorkCN Safe Storage" -w
```

授权后把该车道关一次再打开（`include:llm-qwenwork`）让它重新读凭据，状态里
`catalogSource` 会从 `fallback` 变成 `live`。

本包只读取各客户端自己的钥匙串条目（千问办公 `QwenWorkCN Safe Storage`、
Qoder 各自的 `* Safe Storage`），不读取 Chrome 的 Safe Storage。可以在源码目录用
`npm run check:keychain` 核对这一点（命中即退出码 1）。

> 注意：插件的 token 续期会**回写** `~/Library/Application Support/QwenWorkCN/auth-v2.dat`
> （上游千问办公的 refresh token 用过即轮换，不回写就会失效）。用插件时建议退出
> 千问办公桌面端，避免两边同时刷新、互相把对方的 refresh token 作废。

## 关于免费

免费状态完全取决于上游当期政策（例如 WorkBuddy 的 Hy3 / Hy4 限时免费活动）。本插件不提供账号、不附带额度，只把你自己的账号里**此刻免费**的模型整理出来。

## 致谢与许可

本插件的 WorkBuddy 接入层基于 [sixzjd/dsh-workbuddy-connect](https://github.com/sixzjd/dsh-workbuddy-connect)（MIT）改编；Qoder 国际版转接层基于 [Doone-skser/wb-proxy](https://github.com/Doone-skser/wb-proxy) 的 `qoder-proxy`（MIT），国内版基于 [marsma-101/dsh-qoder-connect](https://github.com/marsma-101/dsh-qoder-connect)（MIT）；千问办公的网关翻译/COSY 签名基于 [xiao-hans/pi-provider-qwenwork](https://github.com/xiao-hans/pi-provider-qwenwork)（MIT），桌面登录态读取基于 [tang-bugu/dsh-connect-qwenwork](https://github.com/tang-bugu/dsh-connect-qwenwork)（MIT）。见 [NOTICE.md](./NOTICE.md)。许可证：MIT。
