#!/usr/bin/env node
/**
 * 密钥扫描（防止把 Token 提交进仓库）。
 *
 * 背景：MinerU 的 Token 是 `sk-` 开头的长串，一旦写进源码或文档就会跟着 git 历史走。
 * 本脚本扫全部文本文件，命中就失败；`.secrets/` 与 `.gitignore` 里的目录跳过。
 *
 * 文件里确实需要写一个示例时，在同一行加注释 `secret-allow`。
 *
 * 用法：node scripts/check-secrets.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELF = resolve(fileURLToPath(import.meta.url))

const SKIP_DIRS = new Set(['.git', 'node_modules', '.secrets', 'coverage', 'tmp'])
const SKIP_FILES = new Set(['package-lock.json'])
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|zip|pdf|sqlite3?|sqlite-wal|sqlite-shm|tgz|woff2?|ttf|mp4|mov)$/i
const MAX_BYTES = 2 * 1024 * 1024

const RULES = [
  { id: 'mineru-token', re: /sk-[A-Za-z0-9]{24,}/g, what: 'MinerU / OpenAI 形态的 API Token' },
  { id: 'private-key', re: /-----BEGIN [A-Z ]{0,20}PRIVATE KEY-----/g, what: '私钥' },
  { id: 'aws-key', re: /AKIA[0-9A-Z]{16}/g, what: 'AWS Access Key' },
  { id: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{30,}/g, what: 'GitHub Token' },
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (stat.isFile()) {
      if (BINARY_EXT.test(name)) continue
      if (stat.size > MAX_BYTES) continue
      out.push(full)
    }
  }
  return out
}

const hits = []
let scanned = 0
for (const file of walk(root)) {
  if (resolve(file) === SELF) continue // 本文件里写着规则本身
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  scanned += 1
  const lines = text.split('\n')
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (line.includes('secret-allow')) continue
      rule.re.lastIndex = 0
      const m = rule.re.exec(line)
      if (!m) continue
      const value = m[0]
      hits.push({
        file: relative(root, file),
        line: i + 1,
        rule: rule.id,
        what: rule.what,
        preview: `${value.slice(0, 4)}…${value.slice(-2)}（${value.length} 字符）`,
      })
    }
  }
}

if (hits.length) {
  console.error(`✗ 发现 ${hits.length} 处疑似密钥（${scanned} 个文件已扫描）：`)
  for (const hit of hits) console.error(`  - ${hit.file}:${hit.line}  ${hit.what}  ${hit.preview}`)
  console.error('\nToken 只能放环境变量 MINERU_TOKEN 或 .secrets/mineru.json（已在 .gitignore 里）。')
  console.error('确实需要写在文件里做示例的，在同一行加注释 secret-allow。')
  process.exit(1)
}

const gitignore = readFileSync(join(root, '.gitignore'), 'utf8')
if (!gitignore.includes('.secrets/')) {
  console.error('✗ .gitignore 里没有 .secrets/，本地 Token 会被提交')
  process.exit(1)
}

console.log(`✓ 密钥检查通过（${scanned} 个文件，0 处命中；.secrets/ 已忽略）`)
