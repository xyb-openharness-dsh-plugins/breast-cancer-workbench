/**
 * 指南出处层（dsh/guideline.js）单测，G1。
 *
 * 钉四类边界：
 * 1. 元信息可溯：文档 id / 版本 / sha256 与 guidebooks/manifest.json 对得上；
 * 2. 摘录纪律：每条 ≤200 字、有页码、**不含处置类词**（建议/应/推荐使用/暂停用药…）；
 * 3. 分级口径：中性粒只对 2/3/4 级给结论，1.5–2.0 之间返回 `needs-lln`（不拿通用下限糊一级）；
 * 4. 不越权：hgb/plt 是指南的关注线/定义线，**不是 G1–G4**；未知指标返回 null。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  GUIDELINE_META, guidelineRef, guidelineNote, guidelineCoveredCodes,
  guidelineNotesMap, cbcsView, refLabel,
} from '../dsh/guideline.js'

const manifest = JSON.parse(readFileSync(new URL('../guidebooks/manifest.json', import.meta.url), 'utf8'))
const refsDoc = JSON.parse(readFileSync(new URL('../assets/reference/guideline/refs.json', import.meta.url), 'utf8'))

test('元信息：文档 id / 版本 / sha256 与 guidebooks/manifest.json 一致', () => {
  const doc = manifest.documents.find((d) => d.id === GUIDELINE_META.id)
  assert.ok(doc, 'manifest 里必须有这份指南')
  assert.equal(GUIDELINE_META.version, doc.version)
  assert.equal(GUIDELINE_META.sha256, doc.sha256)
  assert.match(GUIDELINE_META.short, /CBCS/)
  assert.match(GUIDELINE_META.disclaimer, /不是/)
})

test('摘录纪律：每条都有页码、≤200 字、不含处置类措辞', () => {
  const banned = ['建议', '应该', '必须', '推荐使用', '暂停用药', '需要治疗', '无需就医', '可以停药', '治愈率']
  for (const [code, ref] of Object.entries(refsDoc.refs)) {
    assert.ok(Number(ref.page) > 0, `${code} 必须有页码`)
    assert.ok(ref.excerpt.length <= 200, `${code} 摘录须 ≤200 字，实际 ${ref.excerpt.length}`)
    for (const w of banned) {
      assert.ok(!ref.excerpt.includes(w), `${code} 摘录里不能出现「${w}」`)
    }
  }
})

test('出处短标签：文档短名 + 页码（有表号时带表号）', () => {
  assert.equal(refLabel(guidelineRef('anc')), 'CBCS 2025 · P227 表 10.10')
  assert.equal(refLabel(guidelineRef('hgb')), 'CBCS 2025 · P219')
  assert.equal(refLabel(null), '')
})

test('覆盖项与说明：anc/hgb/plt 有条目，wbc 只有说明（指南未单列）', () => {
  assert.deepEqual(guidelineCoveredCodes().sort(), ['anc', 'hgb', 'plt'])
  assert.equal(guidelineRef('wbc'), null)
  assert.match(guidelineNote('wbc'), /未单列/)
})

test('×ULN 六项的说明写的是「指南怎么写」，不是「暂不启用」', () => {
  const notes = guidelineNotesMap()
  // v0.12.0 起 alt/ast/alp/tbil/cr/qtc 都能给级（须带化验单参考上限），
  // 说明不能再写「未结构化 / 暂不启用」——那会让界面声称一个已经不成立的能力缺口。
  for (const code of ['alt', 'ast', 'alp', 'tbil', 'cr', 'qtc']) {
    assert.ok(notes[code], `${code} 必须有说明，否则说明块里静默缺项`)
    assert.ok(!/暂不启用|未结构化/.test(notes[code]), `${code} 的说明过期了：${notes[code]}`)
  }
  // 分级表在 10.10，且表标题限定于 CDK4/6；10.5 只有 R 值分型，不能当分级引
  assert.match(notes.alt, /10\.10/)
  assert.match(notes.alt, /CDK4\/6/)
  assert.match(notes.alt, /P222/)
  assert.match(notes.alp, /没有给 ALP 的 G1–G4/)
  assert.match(notes.tbil, /P228/)
  assert.match(notes.qtc, /最高到 3 级/)
})

test('登记一致性：refs / cadence / manifest 是同一份文档、同一版、同一校验和', () => {
  const cadence = JSON.parse(readFileSync(new URL('../assets/reference/guideline/cadence.json', import.meta.url), 'utf8'))
  const doc = manifest.documents.find((d) => d.id === 'caca-cbcs-2025')
  for (const [name, d] of [['refs.json', refsDoc.document], ['cadence.json', cadence.document]]) {
    assert.equal(d.id, doc.id, `${name} 的 id 不一致`)
    assert.equal(d.version, doc.version, `${name} 的版本不一致`)
    assert.equal(d.published, doc.published, `${name} 的发布日期不一致`)
    assert.equal(d.sha256, doc.sha256, `${name} 的校验和不一致`)
  }
})

test('中性粒：2/3/4 级按指南绝对阈值，1.5–2.0 之间要化验单下限', () => {
  assert.equal(cbcsView('anc', 1.4).grade, 2)
  assert.equal(cbcsView('anc', 0.9).grade, 3)
  assert.equal(cbcsView('anc', 0.4).grade, 4)
  const needLln = cbcsView('anc', 1.7)
  assert.equal(needLln.kind, 'needs-lln')
  assert.equal(needLln.grade, null)
  assert.match(needLln.text, /下限/)
  assert.equal(cbcsView('anc', 2.4), null, '明显正常时不占版面')
})

test('血红蛋白与血小板：是指南的线，不是分级', () => {
  const hgb = cbcsView('hgb', 108)
  assert.equal(hgb.kind, 'focus')
  assert.equal(hgb.grade, null)
  assert.match(hgb.text, /不是分级/)
  const plt = cbcsView('plt', 88)
  assert.equal(plt.kind, 'focus')
  assert.match(plt.text, /不是分级/)
  assert.equal(cbcsView('plt', 88).page, 220)
  // 明显正常的值不该被"这条线"占版面（与 CTCAE 同一观察窗口）
  assert.equal(cbcsView('plt', 230), null)
  assert.equal(cbcsView('hgb', 132), null)
})

test('不越权：未知指标、非数值、空值一律 null', () => {
  assert.equal(cbcsView('ca153', 30), null)
  assert.equal(cbcsView('wbc', 3.2), null)
  assert.equal(cbcsView('anc', 'abc'), null)
  assert.equal(cbcsView('anc', null), null)
})
