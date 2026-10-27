#!/usr/bin/env node
/**
 * 36 号 · 疾病概要三件套同步进 public/
 *
 * 为什么要有这个脚本：概要数据如果抄一份进 public/，两份迟早会漂移——原型里改了链接、
 * 产品页还是旧的（或反过来）。这里把「唯一来源」钉死：
 *   - primer.js / primer.css：starter 的模式件（`STARTER_DIR`，取不到时退到 prototypes/v0.4）
 *   - primer-data.js：本仓原型 prototypes/v0.4/primer-data.js
 * 生成物一律写进 public/，`--check` 只比对不写（给 npm run check 当闸门用）。
 *
 * 用法：
 *   node scripts/build-primer-data.mjs           # 同步
 *   node scripts/build-primer-data.mjs --check   # 只比对，不一致退出码 1
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const CHECK = process.argv.includes('--check')

const PROTO = join(ROOT, 'prototypes', 'v0.4')
/* starter 不在本仓里：优先环境变量，其次与本项目同级的 xyb-workbench-starter，都不在就用原型里的副本 */
const STARTER = process.env.STARTER_DIR
  ? resolve(process.env.STARTER_DIR)
  : resolve(ROOT, '..', 'xyb-workbench-starter')

const patternDir = existsSync(join(STARTER, 'assets', 'patterns'))
  ? join(STARTER, 'assets', 'patterns')
  : PROTO

const pair = [
  { from: join(patternDir, 'disease-primer.js'), to: join(ROOT, 'public', 'primer.js'), label: '模式 disease-primer.js' },
  { from: join(patternDir, 'disease-primer.css'), to: join(ROOT, 'public', 'primer.css'), label: '样式 disease-primer.css' },
]

/* 数据文件加一行出处说明：看到 public 里这份的人要知道去哪儿改 */
const HEADER = [
  '/* 本文件由 scripts/build-primer-data.mjs 从 prototypes/v0.4/primer-data.js 同步生成，不要手改。',
  ' * 改内容请改原型那份后重跑：node scripts/build-primer-data.mjs',
  ' */',
  '',
].join('\n')

const dataSrc = join(PROTO, 'primer-data.js')
if (!existsSync(dataSrc)) {
  console.log(`✗ 找不到原型数据 ${dataSrc}`)
  process.exit(2)
}
const dataBody = readFileSync(dataSrc, 'utf8')

let bad = 0
const report = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) bad++
}

for (const p of pair) {
  if (!existsSync(p.from)) { report(p.label, false, `源缺失 ${p.from}`); continue }
  const body = readFileSync(p.from, 'utf8')
  const target = existsSync(p.to) ? readFileSync(p.to, 'utf8') : null
  if (CHECK) { report(`${p.label} 与源一致`, target === body); continue }
  if (target !== body) writeFileSync(p.to, body)
  report(`${p.label} → public/${p.to.split('/').pop()}`, true, `${body.length} 字节`)
}

const dataTarget = existsSync(join(ROOT, 'public', 'primer-data.js'))
  ? readFileSync(join(ROOT, 'public', 'primer-data.js'), 'utf8')
  : null
const want = HEADER + dataBody
if (CHECK) {
  report('public/primer-data.js 与原型同源', dataTarget === want)
} else {
  if (dataTarget !== want) writeFileSync(join(ROOT, 'public', 'primer-data.js'), want)
  report('public/primer-data.js ← prototypes/v0.4', true, `${want.length} 字节`)
}

if (bad) { console.log(`\n✗ 36 号概要同步：${bad} 项不一致（重跑 node scripts/build-primer-data.mjs）`); process.exit(1) }
console.log(CHECK ? '\n✓ 36 号概要三件套与来源一致' : '\n✓ 已同步')
