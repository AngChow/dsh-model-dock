/**
 * 验证 tool-call-index 归一化：用真实 sse.js 解析上游帧，再套一份
 * pi-ai `ensureToolCallBlock()` 的等价实现，看最终能不能拆成两个调用。
 *
 * 跑法：npm run check:tool-call-index
 */
import { parseQwenWorkFrame, encodeOpenAiChunk } from '../qwenwork-direct/lib/sse.js';
import { createToolCallIndexNormalizer } from '../qwenwork-direct/lib/tool-call-index.js';

/** 上游双层信封帧（body 是字符串化的 OpenAI choice）。 */
const upstreamFrame = (toolCalls, finish = null) =>
  JSON.stringify({
    body: JSON.stringify({
      choices: [{ delta: { tool_calls: toolCalls }, finish_reason: finish }],
    }),
  });

/**
 * pi-ai `openAICompletionsApi` 里 ensureToolCallBlock 的等价实现
 * （按 index 认块、id 只是兜底；name 只取第一次，arguments 累积拼接）。
 */
function assembleLikePiAi(deltas) {
  const byIndex = new Map();
  const byId = new Map();
  const blocks = [];
  for (const delta of deltas) {
    for (const call of delta.tool_calls ?? []) {
      const streamIndex = typeof call.index === 'number' ? call.index : undefined;
      let block = streamIndex !== undefined ? byIndex.get(streamIndex) : undefined;
      if (!block && call.id) block = byId.get(call.id);
      if (!block) {
        block = { id: call.id || '', name: '', partialArgs: '', streamIndex };
        if (streamIndex !== undefined) byIndex.set(streamIndex, block);
        if (call.id) byId.set(call.id, block);
        blocks.push(block);
      }
      if (streamIndex !== undefined && block.streamIndex === undefined) {
        block.streamIndex = streamIndex;
        byIndex.set(streamIndex, block);
      }
      if (call.id) byId.set(call.id, block);
      const name = call.function?.name ?? call.custom?.name;
      if (!block.name && name) block.name = name;
      if (typeof call.function?.arguments === 'string' && call.function.arguments !== '') {
        block.partialArgs += call.function.arguments;
      }
    }
  }
  return blocks.map((b) => ({ id: b.id, name: b.name, args: b.partialArgs }));
}

/** 把上游帧过一遍 shim 的处理链（parse → [归一化] → encode → 取回 delta）。 */
function throughShim(frames, { normalize }) {
  const runNormalize = normalize ? createToolCallIndexNormalizer() : (calls) => calls;
  const deltas = [];
  for (const frame of frames) {
    const parsed = parseQwenWorkFrame(frame);
    if (parsed.kind !== 'chunk' || parsed.delta?.tool_calls === undefined) continue;
    parsed.delta.tool_calls = runNormalize(parsed.delta.tool_calls);
    const chunk = encodeOpenAiChunk({ model: 'qwen4-max', id: 'chatcmpl-t', created: 0, delta: parsed.delta });
    // encodeOpenAiChunk 产出 "data: {...}\n\n"，取回 JSON 模拟 pi-ai 收到的 delta
    const payload = chunk.replace(/^data: /, '').trim();
    if (payload === '[DONE]') continue;
    deltas.push(JSON.parse(payload).choices[0].delta);
  }
  return deltas;
}

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`      expected ${e}\n      actual   ${a}`);
}

function parses(blocks) {
  return blocks.map((b) => {
    try {
      return { name: b.name, obj: JSON.parse(b.args) };
    } catch (err) {
      return { name: b.name, error: err.message };
    }
  });
}

// ── 事故现场复现（session-d2d349e5 turn 1）：两个调用，同一 index，各自一个完整分片 ──
const incident = [
  upstreamFrame([{ index: 0, id: 'toolu_A', type: 'function', function: { name: 'skill', arguments: '{"name": "dsh-doc"}' } }]),
  upstreamFrame([{ index: 0, id: 'toolu_B', type: 'function', function: { name: 'bash', arguments: '{"command": "ls -la ~/.dsh"}' } }], 'tool_calls'),
];

console.log('— 对照：不做归一化（复现线上 bug）');
const brokenBlocks = assembleLikePiAi(throughShim(incident, { normalize: false }));
check('对照：被并成一个块', brokenBlocks.length, 1);
check('对照：参数不是合法 JSON', typeof parses(brokenBlocks)[0].error, 'string');

console.log('— 修复：归一化后');
const fixedBlocks = assembleLikePiAi(throughShim(incident, { normalize: true }));
check('拆成两个调用', fixedBlocks.length, 2);
check('两个调用各自带对名字与参数', parses(fixedBlocks), [
  { name: 'skill', obj: { name: 'dsh-doc' } },
  { name: 'bash', obj: { command: 'ls -la ~/.dsh' } },
]);

// ── 参数分片流：每个调用被切成多片，且沿用同一个上游 index ──
const streamed = [
  upstreamFrame([{ index: 0, id: 'toolu_C', type: 'function', function: { name: 'grep', arguments: '' } }]),
  upstreamFrame([{ index: 0, id: 'toolu_C', function: { arguments: '{"pattern": ' } }]),
  upstreamFrame([{ index: 0, id: 'toolu_C', function: { arguments: '"max_retries"}' } }]),
  upstreamFrame([{ index: 0, id: 'toolu_D', type: 'function', function: { name: 'grep', arguments: '{"pattern": "HARD_' } }]),
  upstreamFrame([{ index: 0, id: 'toolu_D', function: { arguments: 'FILTER"}' } }], 'tool_calls'),
];
console.log('— 分片流 + 同 index');
check('两片调用分开且参数完整', parses(assembleLikePiAi(throughShim(streamed, { normalize: true }))), [
  { name: 'grep', obj: { pattern: 'max_retries' } },
  { name: 'grep', obj: { pattern: 'HARD_FILTER' } },
]);

// ── 合规上游：index 0/1 交错分片，必须原样不动 ──
const compliant = [
  upstreamFrame([{ index: 0, id: 'x1', type: 'function', function: { name: 'read', arguments: '{"file_path"' } }]),
  upstreamFrame([{ index: 1, id: 'x2', type: 'function', function: { name: 'glob', arguments: '{"pattern"' } }]),
  upstreamFrame([{ index: 0, id: 'x1', function: { arguments: ': "a.js"}' } }]),
  upstreamFrame([{ index: 1, id: 'x2', function: { arguments: ': "**/*.ts"}' } }], 'tool_calls'),
];
console.log('— 合规上游（恒等性）');
check('index 未被改写', throughShim(compliant, { normalize: true }).map((d) => d.tool_calls[0].index), [0, 1, 0, 1]);
check('两个调用各自正确', parses(assembleLikePiAi(throughShim(compliant, { normalize: true }))), [
  { name: 'read', obj: { file_path: 'a.js' } },
  { name: 'glob', obj: { pattern: '**/*.ts' } },
]);

// ── 单调用多分片（最常见路径）：不得被拆成多个 ──
const single = [
  upstreamFrame([{ index: 0, id: 's1', type: 'function', function: { name: 'bash', arguments: '' } }]),
  upstreamFrame([{ index: 0, id: 's1', function: { arguments: '{"command": "ls", ' } }]),
  upstreamFrame([{ index: 0, id: 's1', function: { arguments: '"description": "list"}' } }], 'tool_calls'),
];
console.log('— 单调用分片');
check('仍是一个调用', parses(assembleLikePiAi(throughShim(single, { normalize: true }))), [
  { name: 'bash', obj: { command: 'ls', description: 'list' } },
]);

// ── 无 id（或 id: "null"）+ 同 index：靠「完整 JSON 边界」拆开 ──
const noId = [
  upstreamFrame([{ index: 0, id: 'null', type: 'function', function: { name: 'llm_trace', arguments: '{"action": "status"}' } }]),
  upstreamFrame([{ index: 0, id: 'null', type: 'function', function: { name: 'llm_trace', arguments: '{"action": "list", "limit": 15}' } }], 'tool_calls'),
];
const missingId = noId.map((f) => {
  const parsed = JSON.parse(f);
  const inner = JSON.parse(parsed.body);
  delete inner.choices[0].delta.tool_calls[0].id;
  parsed.body = JSON.stringify(inner);
  return JSON.stringify(parsed);
});
console.log('— 上游不给 id（id 缺失）');
check('靠完整 JSON 边界拆成两个', parses(assembleLikePiAi(throughShim(missingId, { normalize: true }))), [
  { name: 'llm_trace', obj: { action: 'status' } },
  { name: 'llm_trace', obj: { action: 'list', limit: 15 } },
]);
const nullId = [
  upstreamFrame([{ index: 0, id: 'null', type: 'function', function: { name: 'llm_trace', arguments: '{"action": "status"}' } }]),
  upstreamFrame([{ index: 0, id: 'null', type: 'function', function: { name: 'llm_trace', arguments: '{"action": "list", "limit": 15}' } }], 'tool_calls'),
];
console.log('— 上游 id 写成字符串 "null"');
check('同样拆成两个', parses(assembleLikePiAi(throughShim(nullId, { normalize: true }))), [
  { name: 'llm_trace', obj: { action: 'status' } },
  { name: 'llm_trace', obj: { action: 'list', limit: 15 } },
]);

// ── 一次 delta 里就带两个调用（批量形态） ──
const batch = [
  upstreamFrame([
    { index: 0, id: 'b1', type: 'function', function: { name: 'read', arguments: '{"file_path": "a"}' } },
    { index: 0, id: 'b2', type: 'function', function: { name: 'read', arguments: '{"file_path": "b"}' } },
  ], 'tool_calls'),
];
console.log('— 同一 delta 内两个调用');
check('同一帧内也能拆开', parses(assembleLikePiAi(throughShim(batch, { normalize: true }))), [
  { name: 'read', obj: { file_path: 'a' } },
  { name: 'read', obj: { file_path: 'b' } },
]);

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
