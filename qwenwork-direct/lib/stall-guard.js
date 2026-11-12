/**
 * 「宣告了下一步却没调工具就收工」的判定与续跑提示（转发自 ./stall-detector.js）。
 *
 * 实测故障模式（2026-10-28/29，pi 与 DSH 各一个 SunmiScanner 会话）：
 * qwen3.8-flash 偶尔输出「……整份重写干净：」「先把 X 改成 Y，再编译上机：」
 * 之后直接以 finish_reason=stop 收尾，没有任何工具调用。上游计费的输出 token
 * 与可见内容吻合，说明不是 shim 吞了工具调用，而是模型自己停了；agent 循环
 * 看到 stop + 无工具调用就判定回合完成，用户只能手动发「继续」。
 *
 * 权威判定器位于 ./stall-detector.js（与 dsh-qwen-connect 0.2.1 同源）。
 *
 * @module pi-provider-qwenwork/stall-guard
 */

import { CONTINUE_PROMPT, detectStall, looksLikeAbandonedStep } from './stall-detector.js';

/** 同一条用户输入之后最多自动续跑的次数，防止模型反复宣告时无限循环。 */
export const MAX_AUTO_CONTINUES = 2;

export { CONTINUE_PROMPT, detectStall, looksLikeAbandonedStep };
