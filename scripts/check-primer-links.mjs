#!/usr/bin/env node
/**
 * 36 号 §2.5 · 疾病概要链接复核
 *
 * 干嘛用：primer-data.js 里的每一条指南链接都必须真的能打开。写了链接不验，等于没写
 * （原件那列变成装饰）。这个脚本把数据文件里出现的所有 https 链接抓出来，逐个发 HEAD/GET，
 * 只认 2xx/3xx；拿不到就 FAIL 并给出是哪一段、哪一条。
 *
 * 用法：
 *   node scripts/check-primer-links.mjs                      # 默认查 prototypes/v0.3
 *   node scripts/check-primer-links.mjs --dir prototypes/v0.3 --timeout 30000
 *   node scripts/check-primer-links.mjs --list                # 只列不查（离线时看清单）
 *
 * 退出码：0 全可达；1 有不可达或发现 http:// / javascript: 混进来；2 数据文件缺失。
 * 注意：中国大陆网络下 nccn.org / iarc.who.int 偶发超时，脚本会用代理环境变量重试一次
 *      （http_proxy / https_proxy）。仍失败时按「未取得原件」口径处理，不要改小超时糊过去。
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const args = process.argv.slice(2)
const argOf = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const DIR = resolve(ROOT, argOf('--dir', 'prototypes/v0.4'))
const TIMEOUT = Number(argOf('--timeout', 25000))
const LIST_ONLY = args.includes('--list')
const FILE = join(DIR, 'primer-data.js')

if (!existsSync(FILE)) {
  console.log(`找不到 ${FILE}：这一仓还没有 36 号疾病概要数据。`)
  process.exit(2)
}

/* 数据文件是给浏览器用的 IIFE，直接把 window 换成假的跑一遍最稳（不 eval 手写解析） */
const sandbox = { window: {}, document: undefined }
vm.createContext(sandbox)
vm.runInContext(await readFile(FILE, 'utf8'), sandbox)
const data = sandbox.window.DISEASE_PRIMER
if (!data) { console.log('primer-data.js 跑完没有 window.DISEASE_PRIMER'); process.exit(2) }

const found = [] // {where, kind, url, text}
const badScheme = []
const scan = (val, where, kind, text) => {
  if (val == null) return
  if (typeof val === 'string') {
    if (/^http:\/\//i.test(val) || /^javascript:/i.test(val)) badScheme.push({ where, kind, url: val })
    else if (/^https:\/\//i.test(val)) found.push({ where, kind, url: val, text: text || '' })
    return
  }
  if (Array.isArray(val)) return val.forEach((v) => scan(v, where, kind, text))
  if (typeof val === 'object') {
    if (typeof val.url === 'string') scan(val.url, where, kind, val.text)
    if (typeof val.secondaryUrl === 'string') scan(val.secondaryUrl, where, `${kind}.secondaryUrl`, val.text)
    if (typeof val.text === 'string' && val.url) return // 已按 cell 处理
  }
}

for (const s of data.sections || []) {
  (s.sources || []).forEach((src, i) => {
    scan(src.url, `${s.id}.sources[${i}]`, 'url', `${src.org} · ${src.doc}`)
    scan(src.secondaryUrl, `${s.id}.sources[${i}]`, 'secondaryUrl', `${src.org} · ${src.doc}`)
  })
  const rows = s.table?.rows || []
  rows.forEach((row, ri) => row.forEach((cell, ci) => {
    if (cell && typeof cell === 'object') scan(cell.url, `${s.id}.table.row${ri}.col${ci}`, 'cell', cell.text)
  }))
}

const uniq = new Map()
for (const f of found) if (!uniq.has(f.url)) uniq.set(f.url, f)

if (badScheme.length) {
  console.log(`\n✗ 出现非 https 链接（§2.5 只接受 https）：`)
  for (const b of badScheme) console.log(`  - ${b.where} ${b.kind}: ${b.url}`)
}

/* 没有任何链接却标了 original:true 的来源行 —— 这才是 §2.5 要抓的「纯文字已取得」 */
const silentOriginal = []
for (const s of data.sections || []) {
  (s.sources || []).forEach((src, i) => {
    if (src.original && !src.url && !src.nolink) silentOriginal.push(`${s.id}.sources[${i}] ${src.org} · ${src.doc}`)
    if (!src.original && !src.secondaryUrl && !src.nolink) silentOriginal.push(`${s.id}.sources[${i}] ${src.org} · ${src.doc}（缺 secondaryUrl）`)
  })
}

console.log(`数据文件：${FILE.replace(ROOT + '/', '')}`)
console.log(`链接总数：${found.length} 条，去重后 ${uniq.size} 条`)
if (LIST_ONLY) {
  for (const [url, f] of uniq) console.log(`  ${f.where}  ${url}`)
  process.exit(badScheme.length || silentOriginal.length ? 1 : 0)
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
async function probe(url) {
  /* 先 HEAD，很多出版方对 HEAD 回 405，再退回 GET（只读前 4KB，不下整份 PDF） */
  for (const method of ['HEAD', 'GET']) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT)
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: ac.signal, headers: { 'user-agent': UA, range: method === 'GET' ? 'bytes=0-4096' : '' } })
      clearTimeout(timer)
      if (res.ok || (res.status >= 300 && res.status < 400)) return { ok: true, status: res.status, type: res.headers.get('content-type') || '' }
      if (method === 'GET') return { ok: false, status: res.status, type: res.headers.get('content-type') || '' }
    } catch (e) {
      clearTimeout(timer)
      if (method === 'GET') return { ok: false, status: 0, error: String(e.name || e.message) }
    }
  }
  return { ok: false, status: 0 }
}

const results = []
for (const [url, f] of uniq) {
  const r = await probe(url)
  results.push({ ...f, url, ...r })
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(r.status).padEnd(3)}  ${f.where}  ${f.text || ''}`)
  if (!r.ok) console.log(`      ${url}`)
}

const fails = results.filter((r) => !r.ok)
console.log(`\n  ${results.length - fails.length}/${results.length} 可达${fails.length ? ` · ${fails.length} 不可达` : ''}${silentOriginal.length ? ` · ${silentOriginal.length} 条来源缺链接` : ''}\n`)
if (silentOriginal.length) {
  console.log('来源行缺链接（§2.5 要求：已取得→url，未取得→secondaryUrl，图书等无公开链接→nolink + note）：')
  for (const s of silentOriginal) console.log(`  - ${s}`)
  console.log('')
}
process.exit(fails.length || badScheme.length || silentOriginal.length ? 1 : 0)
