/**
 * shim 诊断日志：把请求级时序写到固定文件，独立于 DSH 的日志体系。
 *
 * 为什么需要它：排查「长思考超时」时发现——DSH 的 ctx.logger 不落盘，
 * harness.log 里看不到我们 shim 的任何输出，等于**在黑暗里调试**。
 * 这份文件日志给出每次请求的完整时间线：
 *   进入 → 鉴权结果 → 响应头到达 → 首帧 → 流结束/失败（含原因）
 *
 * ⚠️ 只写一行 JSON、追加模式，上限 2MB（超过即截断重开），
 *    避免长期运行撑爆磁盘。诊断完成后可整体移除本模块。
 *
 * 本包固定写 pi-qwenwork-trace.log，姊妹包 dsh-qwen-connect 固定写它自己的
 * dsh-qwen-connect-trace.log。两边曾共用一个文件，而 DSH 宿主的活跃流量
 * 会在几十分钟内把本侧的事故记录轮转出上限（2026-10-29 踩到）。
 * 路径可用 QWEN_CONNECT_TRACE_PATH 覆盖（测试必须覆盖，否则故障注入的
 * 伪数据会混进真实排障日志）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * 当前诊断日志路径。每次调用时解析，测试可用 QWEN_CONNECT_TRACE_PATH
 * 把写入重定向到项目内临时目录，避免污染真实排障日志。
 */
export function traceLogPath() {
  return (
    process.env.QWEN_CONNECT_TRACE_PATH ||
    path.join(os.tmpdir(), 'pi-qwenwork-trace.log')
  );
}

const MAX_BYTES = 2 * 1024 * 1024;

/** 追加一行诊断日志；失败静默（诊断工具绝不能反过来弄挂对话）。 */
export function trace(event, data = {}) {
  const logPath = traceLogPath();
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_BYTES) {
      fs.writeFileSync(logPath, '', 'utf8');
    }
    const line =
      JSON.stringify({ t: new Date().toISOString(), source: 'pi-provider-qwenwork', pid: process.pid, event, ...data }) + '\n';
    fs.appendFileSync(logPath, line, 'utf8');
  } catch {
    /* 诊断日志绝不影响主流程 */
  }
}
