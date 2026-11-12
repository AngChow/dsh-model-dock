#!/usr/bin/env node
/**
 * 守卫脚本：本包只允许读取**各客户端自己**的钥匙串条目。
 *
 * 背景：上游 0.7.8 及更早版本在 macOS 上把 `Chrome Safe Storage` 当作
 * `macOsCryptKey()` 的兜底候选。那个条目是 Chromium 系加密**全部** cookie
 * 与保存密码的主密钥，读到它等于拿到 Chrome 密码库的钥匙，而且会弹系统授权框。
 * 0.8.3 已经删掉，本仓库沿用；这个脚本用来防止它被合并回来。
 *
 * 用法：node tools/check-keychain.mjs            # 在源码目录里跑
 *      node tools/check-keychain.mjs <目录>     # 检查任意安装目录
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SKIP_DIR = new Set(['node_modules', '.git', 'assets', 'docs'])
// 只扫代码与配置：文档/变更日志里正当讨论这条目名不算问题。
const SCAN_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.json', '.yml', '.yaml'])
// 只匹配**被当作钥匙串服务名引用的字面量**，注释里提到 "Chromium Safe Storage"
// 这种算法描述不算问题。
const BAD = [
  { re: /['"`]Chrome Safe Storage['"`]/u, why: 'Chrome 的 Safe Storage 主密钥（可解 Chrome 密码库）' },
  { re: /['"`]Chromium Safe Storage['"`]/u, why: 'Chromium 的 Safe Storage 主密钥' },
  { re: /Google\/Chrome|Google\\\\Chrome/u, why: 'Chrome 用户数据目录' },
]

const root = process.argv[2] ?? new URL('..', import.meta.url).pathname

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name) || name.endsWith('.tgz')) continue
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) yield* walk(path)
    else if (st.isFile() && st.size < 4 * 1024 * 1024) {
      const dot = name.lastIndexOf('.')
      if (dot !== -1 && SCAN_EXT.has(name.slice(dot))) yield path
    }
  }
}

let problems = 0
const self = new URL(import.meta.url).pathname

for (const file of walk(root)) {
  if (file === self) continue
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const { re, why } of BAD) {
    const match = re.exec(text)
    if (match === null) continue
    problems += 1
    const line = text.slice(0, match.index).split('\n').length
    console.error(`✗ ${file}:${line} 命中 ${match[0]}（${why}）`)
  }
}

if (problems > 0) {
  console.error(`\n发现 ${problems} 处禁止的 Chrome 钥匙串引用，请删除后重试。`)
  process.exit(1)
}
console.log(`✓ 未发现 Chrome Safe Storage / Chrome 用户目录引用（扫描目录：${root}）`)
