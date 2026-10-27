/**
 * 36 号 v2 · 疾病概要（§2.5 指南原件可点）与看板状态卡（§2.6 四件结构）的契约测试。
 *
 * 这两块都住在前端源码里，靠渲染测试跑起来要整台浏览器；这里改测「结构契约」：
 * 数据里每条指南都得带 https 链接、源码里四件结构不能少、天数必须由 today() 派生而非常量。
 * 真实像素验收在 prototypes/v0.4 上跑 scripts/probe-disease-primer.mjs（P1–E0）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const root = new URL('../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')

const pages = read('public/js/pages-basic.js')
const appData = read('public/primer-data.js')
const protoData = read('prototypes/v0.4/primer-data.js')

/* 用 vm 取 window.DISEASE_PRIMER —— 数据文件是经典脚本，不是 ESM。 */
function primerData() {
  const window = {}
  vm.runInNewContext(appData, { window })
  return window.DISEASE_PRIMER
}

test('app 侧 primer 数据与原型同源（改内容只改原型那份，再跑 build-primer-data）', () => {
  // public 那份是 build-primer-data.mjs 生成的，头部多一段「不要手改」注释；比内容不比注释。
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[ \t]+$/gm, '').trim()
  assert.equal(strip(appData), strip(protoData), 'public/primer-data.js 与 prototypes/v0.4/primer-data.js 必须一致')
})

test('§2.5 · 指南表每一行「原件」列都可点，且只收 https', () => {
  const data = primerData()
  const evidence = data.sections.find((s) => s.id === 'evidence')
  assert.ok(evidence?.table?.rows?.length, '指南表不能为空')
  const column = evidence.table.head.indexOf('原件')
  assert.ok(column >= 0, '指南表必须有「原件」列')
  for (const row of evidence.table.rows) {
    const cell = row[column]
    assert.equal(typeof cell, 'object', `${row[0]} ${row[1]}：原件列必须是 {text,url} 对象`)
    assert.match(String(cell.url || ''), /^https:\/\//, `${row[0]} ${row[1]}：原件列缺 https 链接`)
    assert.ok(String(cell.text || '').trim(), `${row[0]} ${row[1]}：原件列缺说明文字`)
  }
})

test('§2.5 · 每段来源都标注「已取得原件 / 据二次来源」，且带 https 链接', () => {
  const data = primerData()
  for (const section of data.sections) {
    assert.ok(section.sources?.length, `${section.id}：段落必须标来源`)
    for (const source of section.sources) {
      if (source.nolink) continue
      const url = source.original ? source.url : source.secondaryUrl
      assert.match(String(url || ''), /^https:\/\//, `${section.id} · ${source.doc}：缺 https 链接`)
    }
  }
})

test('§2.6 · 看板首卡四件齐全，且 dashboard 真的渲染它', () => {
  assert.match(pages, /export function statusCard\(\)/, 'statusCard 必须导出，便于单独调用')
  // ① 卡头 eyebrow ② 大字天数 ③ 现状行 ④ 出口按钮排
  assert.match(pages, /sc-head[\s\S]{0,200}eyebrow/)
  assert.match(pages, /sc-day/)
  assert.match(pages, /sc-now/)
  assert.match(pages, /sc-actions/)
  // 主按钮进当前阶段核心页，副按钮打开疾病概要
  assert.match(pages, /data-primer-open/)
  // dashboard 的两条返回分支（有无资料）都要把状态卡放在首卡位
  const branches = pages.split('${statusCard()}').length - 1
  assert.equal(branches, 2, 'dashboard 的空态与常态两条分支都要渲染状态卡')
})

test('§2.6 · 天数由 today() 派生，不写死日期常量', () => {
  const start = pages.indexOf('export function statusCard()')
  const end = pages.indexOf('export function dashboard()')
  const body = pages.slice(start, end)
  assert.match(body, /today\(\)/, '必须取系统日期')
  assert.doesNotMatch(body, /20\d\d-\d\d-\d\d/, '状态卡里不能出现写死的日期')
  assert.match(body, /待初始化/, '没有锚点时要显示「待初始化」而不是编一个数字')
})

test('红线：状态卡与概要的医生口径出口仍在', () => {
  const data = primerData()
  const all = JSON.stringify(data)
  assert.match(all, /问你的医生|由治疗团队判断|不构成任何建议/, '概要必须保留「需要问你的医生」这类出口')
  for (const banned of ['建议治疗', '可能复发', '可以停药', '无需就医', '治愈率']) {
    assert.ok(!all.includes(banned), `概要数据里出现越界表述：${banned}`)
  }
  for (const banned of ['建议治疗', '可能复发', '可以停药', '无需就医', '治愈率']) {
    assert.ok(!pages.includes(banned), `状态卡源码里出现越界表述：${banned}`)
  }
})
