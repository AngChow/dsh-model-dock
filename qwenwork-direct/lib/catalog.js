/**
 * 千问办公的**实时模型目录**（`chat-modes-v2` 数据源）。
 *
 * ## 为什么需要它
 *
 * 早期版本把目录写死在 `models.js` 里（3 个模型：`pro` / `flash` /
 * `qwen3.8-max-preview`），那是从某一次 App 日志里抄下来的快照。上游一改
 * 目录，插件就和千问办公 App 对不上：App 里多出来的 `frontier-1`
 * （Qwen4-Max 预览版）进不了 DSH，`qwen3.8-max-preview` 的倍率也还停在旧值
 * `x1.10`（真机实测已是 `x1.80`）。模型和倍率都不一样，用户看到的就是两套
 * 目录。
 *
 * ## 真机实测的契约（2026-11-12，QwenWorkCN 桌面版）
 *
 *   GET https://gateway.qwenwork.cn/api/desktop/chat-modes
 *   Authorization: Bearer <桌面版 auth-v2.dat 里的 token>
 *   X-QwenWork-Version / Release-Version / Build / Platform / Arch / Channel
 *   → 200 {"schema_version":2,"catalog":[...],"subtask_routing":{...}}
 *
 * 响应里的 `catalog[]` 就是 App 模型选择器的数据源，每条带：
 *
 *   - `key`                 上游 `model_config.key`（`flash` / `pro` /
 *                           `frontier-1` / `qwen3.8-max-preview`）
 *   - `i18n.display_name`   选择器里的名字（`{zh:"标准",en:"Standard"}`）
 *   - `i18n.description`    副标题
 *   - `price_factor`        **倍率**（0.1 / 1 / 0.4 / 1.8）
 *   - `is_default`          默认模型（当前是 `flash`，不是 `pro`）
 *   - `is_vl`               是否多模态（`pro` 为 false，其余为 true）
 *   - `is_reasoning`        是否思考模型（当前全部为 true）
 *   - `max_input_tokens`    输入上限（1000000）
 *   - `promotion` / `badges` 促销（`frontier-1` 当前「限时2折」）
 *
 * 这条端点是**无签名**的普通 OpenAPI GET（实测 200）；需要 COSY/WASM 签名的
 * 是另一条 `/algo/api/v2/model/list`（实测 403 `Signature invalid`），本模块
 * 不走那条。
 *
 * 目录拉不到不是错误：`models.js` 里仍有一份与实测一致的静态回退，插件在
 * 离线/令牌过期时照常注册 provider，只是把来源标成 `fallback`。
 *
 * @module dsh-model-dock/qwenwork-direct/catalog
 */

import { DEFAULT_BASE_URL } from './auth.js';
import { buildHeaders } from './rest.js';
import { DISPLAY_NAME_IDS, MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS } from './models.js';

/** 模型目录端点（与桌面版 `DesktopChatModesV2CatalogProvider` 同一个）。 */
export const CHAT_MODES_PATH = '/api/desktop/chat-modes';

/** 桌面版自己的超时是 15s，这里保持一致。 */
export const CATALOG_TIMEOUT_MS = 15_000;

/** 取第一个非空字符串。 */
function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * 从 `{zh, en}` 这类多语言对象里取文案（优先中文，与 App 的中文界面一致）。
 *
 * @param {unknown} value
 * @returns {string | undefined}
 */
export function pickLocalized(value) {
  if (typeof value === 'string') return nonEmpty(value);
  if (value === null || typeof value !== 'object') return undefined;
  const direct = nonEmpty(value.zh) ?? nonEmpty(value.en);
  if (direct !== undefined) return direct;
  for (const candidate of Object.values(value)) {
    const text = nonEmpty(candidate);
    if (text !== undefined) return text;
  }
  return undefined;
}

/** 取第一个正数（`price_factor` 允许 0，此处只用于 token 上限）。 */
function firstPositive(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) return Math.round(candidate);
  }
  return undefined;
}

/** 取 `context_config` 里 `is_default` 的那个档位的 token 数。 */
function defaultTierTokens(config) {
  if (config === null || typeof config !== 'object') return undefined;
  for (const tier of Object.values(config)) {
    if (tier === null || typeof tier !== 'object') continue;
    if (tier.is_default === true || tier.isDefault === true) {
      const tokens = firstPositive(tier.token_count, tier.tokenCount);
      if (tokens !== undefined) return tokens;
    }
  }
  return undefined;
}

/** 读促销：`promotion.active === true` 时才生效，文案取 `badge`/`labels`。 */
function promotionOf(mode) {
  const promotion = mode?.promotion;
  if (promotion === null || typeof promotion !== 'object') return undefined;
  if (promotion.active !== true) return undefined;
  const label = pickLocalized(promotion.badge) ?? pickLocalized(promotion.labels);
  return label === undefined ? undefined : { label, ruleId: nonEmpty(promotion.rule_id) };
}

/** 把 `badges[]` 收敛成纯文案（去重、保序）。 */
function badgeLabels(mode) {
  const labels = [];
  const list = Array.isArray(mode?.badges) ? mode.badges : [];
  for (const badge of list) {
    const label = pickLocalized(badge?.labels) ?? pickLocalized(badge?.label) ?? nonEmpty(badge?.text);
    if (label !== undefined && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

/**
 * 把一条上游 `catalog[]` 记录归一化成插件内部的模型条目。
 *
 * 字段名与 `models.js` 的静态目录保持一致，这样 `catalog.current()`、
 * 状态卡片、shim 的能力查询都只认一种形状。
 *
 * @param {any} mode
 * @returns {object | undefined}
 */
export function normalizeMode(mode) {
  const key = nonEmpty(mode?.key);
  if (key === undefined) return undefined;

  const name = pickLocalized(mode?.i18n?.display_name) ?? nonEmpty(mode?.display_name) ?? key;
  const description = pickLocalized(mode?.i18n?.description) ?? nonEmpty(mode?.description);
  const price = typeof mode?.price_factor === 'number' && Number.isFinite(mode.price_factor)
    ? mode.price_factor
    : undefined;
  const contextWindow = firstPositive(
    mode?.max_input_tokens,
    defaultTierTokens(mode?.context_config ?? mode?.contextConfig),
  ) ?? MAX_INPUT_TOKENS;

  const promotion = promotionOf(mode);
  const badges = badgeLabels(mode);
  if (promotion !== undefined && !badges.includes(promotion.label)) badges.push(promotion.label);

  return {
    id: key,
    // 有些宿主（pi 的选择器）只渲染 id；`flash` 历史上对外叫 `qwen3.8-flash`，
    // 保留这个别名，已持久化的模型选择不会失效（请求侧由 normalizeModelKey 换回 key）。
    displayNameId: DISPLAY_NAME_IDS[key],
    shortName: name,
    ...(description === undefined ? {} : { description }),
    ...(price === undefined ? {} : { billingRate: price }),
    supportsImages: mode?.is_vl === true,
    isReasoning: mode?.is_reasoning !== false,
    contextWindow,
    maxTokens: MAX_OUTPUT_TOKENS,
    ...(mode?.is_default === true ? { isDefault: true } : {}),
    ...(mode?.frontier === true ? { frontier: true } : {}),
    ...(promotion === undefined ? {} : { promotion }),
    badges,
    source: 'live',
  };
}

/**
 * 解析一条 `chat-modes` 响应。
 *
 * @param {any} payload
 * @returns {object[]} 归一化后的模型列表（保持上游顺序，默认模型在前）
 */
export function normalizeChatModes(payload) {
  const catalog = payload?.catalog;
  if (!Array.isArray(catalog)) {
    throw new Error('千问办公模型目录响应缺少 catalog 数组');
  }
  const models = [];
  for (const mode of catalog) {
    const model = normalizeMode(mode);
    if (model !== undefined) models.push(model);
  }
  if (models.length === 0) {
    throw new Error('千问办公模型目录为空');
  }
  return models;
}

/**
 * 拉取实时模型目录。
 *
 * 不复用 `rest.js` 的 `apiGet()`：它把 401/403 包装成 `QwenAuthError`，而这里
 * 需要把「目录拉不到」和「车道本身不可用」区分开（前者只是回退静态目录）。
 *
 * @param {{
 *   token: string,
 *   baseUrl?: string,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   platform?: string,
 *   arch?: string,
 *   appMode?: string,
 * }} options
 * @returns {Promise<{ models: object[], fetchedAt: number, status: number }>}
 */
export async function fetchChatModesCatalog(options) {
  const token = nonEmpty(options?.token);
  if (token === undefined) throw new Error('没有可用的千问办公访问令牌');

  const baseUrl = nonEmpty(options?.baseUrl) ?? DEFAULT_BASE_URL;
  const doFetch = options?.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? CATALOG_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await doFetch(`${baseUrl}${CHAT_MODES_PATH}`, {
      method: 'GET',
      headers: {
        ...buildHeaders(token, options?.platform, options?.arch),
        // 桌面版每个请求都带 App 模式；目录不需要分模式，固定 standard。
        'x-qwenwork-app-mode': nonEmpty(options?.appMode) ?? 'standard',
      },
      signal: controller.signal,
    });
  } catch (error) {
    const reason = controller.signal.aborted ? `超时（${timeoutMs}ms）` : (error instanceof Error ? error.message : String(error));
    throw new Error(`千问办公模型目录请求失败：${reason}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`千问办公模型目录鉴权失败（HTTP ${response.status}）：登录态可能已过期`);
  }
  if (!response.ok) {
    throw new Error(`千问办公模型目录请求失败（HTTP ${response.status}）`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('千问办公模型目录响应不是合法 JSON');
  }

  return { models: normalizeChatModes(payload), fetchedAt: Date.now(), status: response.status };
}
