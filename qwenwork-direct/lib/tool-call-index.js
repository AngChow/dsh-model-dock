/**
 * 工具调用 `index` 归一化：把「同一轮的多个 tool_call 塞进同一个 index」的
 * 上游畸形流改写成标准 OpenAI 形态，让下游按 index 认块时能拆成多个调用。
 *
 * ── 为什么必须做 ────────────────────────────────────────────────────
 * 上游（千问办公 gateway）实测会把一轮里的两个工具调用都以 `index: 0` 下发。
 * 而 pi-ai 的 `ensureToolCallBlock()` 是按 OpenAI 规范用 `index` 认块的：
 *
 *     const streamIndex = typeof toolCall.index === 'number' ? toolCall.index : undefined
 *     let block = toolCallBlocksByIndex.get(streamIndex)
 *     if (!block && toolCall.id) block = toolCallBlocksById.get(toolCall.id)
 *
 * `index` 一旦命中就不再新建块：第二个调用的 `id`／`name` 被丢掉，
 * `function.arguments` 直接拼到第一个调用后面，得到
 *
 *     {"name": "dsh-doc"}{"command": "ls -la ~/.dsh/"}
 *
 * 这种非法 JSON。DSH 侧 `JSON.parse` 在第一个 `}` 后撞见 `{` → 抛
 * `MALFORMED_RESPONSE` → 整轮立即中止（该错误码不在默认重试列表里，
 * 所以用户看到的是「啪一下断掉」，而不是自动重试）。
 *
 * 实测：全机 3 个会话 6 次中断全部落在本车道；这条车道上从未出现过
 * 「一轮 ≥2 个工具调用块」，而同期 GLM 车道并行调用正常 → 不能指望模型
 * 自己改成串行，只能在协议层把上游的畸形 index 修回来。
 *
 * ── 归一化规则 ─────────────────────────────────────────────────────
 * 每个 HTTP 请求一份状态（一次 assistant 回合 = 一次请求），按下述顺序认槽：
 *   1. 这个 `id` 见过 → 用它已占的槽（同一调用的后续参数分片）。
 *   2. 上游 `index` 见过、且该槽没被**另一个 id** 占用 → 续写同一槽。
 *   3. 其余情况分配新槽（0、1、2…）。
 *
 * 两条兜底，覆盖上游连 `id` 都不给（或给 `"null"`）的情况：
 *   - 槽已绑定的 `id` 与本片 `id` 不同 → 认为换了调用，开新槽。
 *   - 槽累积的参数已经是一段**完整 JSON**，却又来了非空分片 → 上一调用已收尾，
 *     开新槽。
 *   - 上游没给 `id`（或给字面量 `"null"`）时补一个**本请求内唯一**的合成 id：
 *     pi-ai 在 index 没命中的时候会拿 id 兜底认块，两个调用共用 `"null"` 照样会并。
 *
 * 关键性质：对**合规**上游是恒等的——分片 index 本就一一对应（0、1、2…）时，
 * 归一化后下发的 index 与原来相同，行为不变；只有畸形流被改写。
 *
 * @module dsh-model-dock/qwenwork-direct/tool-call-index
 */

/**
 * 判断一段累积文本是否已是完整 JSON。
 *
 * 只看两种廉价信号：结尾是 `}`／`]`，且能被 `JSON.parse` 吃下去。
 * 用来识别「上一个调用的参数已经收尾、后面这块属于新调用」。
 *
 * @param {string} text
 * @returns {boolean}
 */
function isCompleteJson(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed === '') return false;
  const last = trimmed[trimmed.length - 1];
  if (last !== '}' && last !== ']') return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * 取参数分片。上游走 `function.arguments`，少数形态用 `custom.input`。
 *
 * @param {any} call
 * @returns {string}
 */
function fragmentOf(call) {
  if (typeof call?.function?.arguments === 'string') return call.function.arguments;
  if (typeof call?.custom?.input === 'string') return call.custom.input;
  return '';
}

/**
 * 取可用作身份的 id。空串与字面量 `"null"` 都当「没有 id」——
 * 与 pi-ai 的判断口径一致（它也排除 `"null"`）。
 *
 * @param {any} call
 * @returns {string | null}
 */
function idOf(call) {
  const id = call?.id;
  return typeof id === 'string' && id !== '' && id !== 'null' ? id : null;
}

/**
 * 取上游给的 index；只接受有限的数字，其余一律当「没给」。
 *
 * @param {any} call
 * @returns {number | null}
 */
function indexOf(call) {
  return typeof call?.index === 'number' && Number.isFinite(call.index) ? call.index : null;
}

/**
 * 创建一份**单请求**的 index 归一化器。
 *
 * 状态不可跨请求复用：槽号 0、1、2… 是相对一次 assistant 回合的，
 * 复用到下一个请求会让 pi-ai 的块索引与上一轮的工具结果错位。
 *
 * @returns {(toolCalls: any[]) => any[]} 输入一批 `tool_calls` 分片，返回改写 index 后的新数组
 */
export function createToolCallIndexNormalizer() {
  /** @type {Map<string, number>} 上游 id → 槽号 */
  const slotById = new Map();
  /** @type {Map<number, number>} 上游 index → 槽号 */
  const slotByUpstreamIndex = new Map();
  /** @type {Array<{id: string | null, args: string, syntheticId: string}>} 槽号即数组下标 */
  const slots = [];
  // 合成 id 加一段随机前缀：同一请求内稳定、跨请求不重复（避免历史消息里 id 撞车）。
  const syntheticIdPrefix = `call_${Math.random().toString(36).slice(2, 8)}`;

  return function normalizeToolCallIndexes(toolCalls) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return toolCalls;

    return toolCalls.map((call) => {
      const id = idOf(call);
      const upstreamIndex = indexOf(call);
      const fragment = fragmentOf(call);

      /** @type {number | undefined} */
      let slot;
      // 1. 同 id 的后续分片：认 id 最可靠，直接续写。
      if (id !== null && slotById.has(id)) {
        slot = slotById.get(id);
      }
      // 2. 按上游 index 续写，前提是这一格没被另一个 id 占着、也没收尾。
      if (slot === undefined && upstreamIndex !== null && slotByUpstreamIndex.has(upstreamIndex)) {
        const candidate = slotByUpstreamIndex.get(upstreamIndex);
        const bound = slots[candidate];
        const takenByOtherId = bound?.id != null && id !== null && bound.id !== id;
        const alreadyComplete = bound !== undefined && fragment !== '' && isCompleteJson(bound.args);
        if (!takenByOtherId && !alreadyComplete) slot = candidate;
      }
      // 3. 其余：新调用，分配新槽。
      if (slot === undefined) {
        slot = slots.length;
        slots.push({ id: null, args: '', syntheticId: `${syntheticIdPrefix}_${slots.length}` });
      }

      const bound = slots[slot];
      if (id !== null) {
        bound.id = id;
        slotById.set(id, slot);
      }
      // 上游 index 永远指向**最近**占用它的那个槽：畸形流里它会被下一个调用覆盖，
      // 这正是我们需要的（后续无 id 分片跟着最近那个调用走）。
      if (upstreamIndex !== null) slotByUpstreamIndex.set(upstreamIndex, slot);
      bound.args += fragment;

      // 上游没给可用 id 时补一个合成 id：pi-ai 在 index 未命中时会拿 id 兜底认块，
      // 若两个调用都叫 `"null"`，光有正确的 index 也会被 id 这条路并回去。
      const outId = id ?? bound.syntheticId;

      // 恒等路径（合规上游、槽号本来就等于 index、id 也没缺）直接原对象返回，避免多一次拷贝。
      if (call.index === slot && call.id === outId) return call;
      const out = { ...call, index: slot };
      if (call.id !== undefined || id === null) out.id = outId;
      return out;
    });
  };
}
