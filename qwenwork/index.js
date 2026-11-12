/**
 * `dsh-model-dock/qwenwork` 的包入口。
 *
 * 千问办公车道本身在 `../qwenwork-direct/index.js`（Cordis 用那条 patch 行加载），
 * 这里只把**桌面登录态读取**作为公共能力再导出：它被 `qwenwork-direct` 与
 * 上层的诊断/修复路径共用，单独作为一个入口更不容易被误当成「车道」。
 *
 * package.json 的 `exports["./qwenwork"]` 指向本文件，因此它必须存在——此前
 * 该入口指向一个不存在的 `index.js`，任何 `import 'dsh-model-dock/qwenwork'`
 * 都会直接报 ERR_MODULE_NOT_FOUND。
 *
 * @module dsh-model-dock/qwenwork
 */

export * from './desktop-auth.js';
