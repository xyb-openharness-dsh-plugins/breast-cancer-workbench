#!/usr/bin/env node
/**
 * 把公益 MinerU Key 写进 `dsh/mineru-public.json`（随包发布用）。
 *
 * 只从 `.secrets/mineru.json` 或环境变量 `MINERU_PUBLIC_TOKEN` 读取；
 * Key 不写进源码、文档或 git。生成物已在 `.gitignore` 里，
 * `package.json` 的 `files` 含 `dsh/`，所以打出来的 tgz 会带上它。
 *
 * 用法：
 *   node scripts/inject-mineru-public.mjs   生成
 *   npm run pack:release                    生成 → npm pack → 删除生成物
 */
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const secretFile = join(root, '.secrets', 'mineru.json')
const target = join(root, 'dsh', 'mineru-public.json')

let token = process.env.MINERU_PUBLIC_TOKEN?.trim() || ''
if (!token) {
  try {
    token = JSON.parse(readFileSync(secretFile, 'utf8'))?.token?.trim() || ''
  } catch {
    /* 没配：下面统一报错 */
  }
}
if (!token) {
  console.error('✗ 没有可写入的公益 Key：先写 .secrets/mineru.json，或设置 MINERU_PUBLIC_TOKEN')
  process.exit(1)
}

writeFileSync(target, `${JSON.stringify({ token }, null, 2)}\n`, { mode: 0o600 })
chmodSync(target, 0o600)
console.log('✓ 已写入 dsh/mineru-public.json（随包公益 Key，不进 git）')
