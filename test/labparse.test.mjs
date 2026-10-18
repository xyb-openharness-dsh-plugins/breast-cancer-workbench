/**
 * 解析结果 → 候选（`dsh/labparse.js`）单测。
 *
 * 这一层的风险不是"能不能抽出来"，而是**抽错了还装得像真的**：
 * 把参考范围当结果、把 CRP 当肌酐、把 `<0.5` 折成 0.5、给没单位的数编一个单位。
 * 每条边界的反例都在下面。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { extractCandidates, extractReportDate, normalizeUnit, METRIC_ALIASES } from '../dsh/labparse.js'

const fields = (items) => items.map((i) => i.field).sort()

test('markdown 表格：按单元格取值，单位从右侧列读，把握度高', () => {
  const md = [
    '| 项目 | 结果 | 参考范围 | 单位 |',
    '| --- | --- | --- | --- |',
    '| CA15-3 | 18.6 | 0-25 | U/mL |',
    '| 血红蛋白 | 112 | 115-150 | g/L |',
  ].join('\n')
  const { items, warnings } = extractCandidates({ markdown: md })
  const ca = items.find((i) => i.field === 'metric:ca153')
  assert.equal(ca.valueText, '18.6')
  assert.equal(ca.valueNum, 18.6)
  assert.equal(ca.unit, 'U/mL')
  assert.equal(ca.confidence, 0.9)
  assert.ok(!warnings.some((w) => w.includes('认不出')), '认出来了就不该报没认出')

  const hgb = items.find((i) => i.field === 'metric:hgb')
  assert.equal(hgb.valueNum, 112)
  assert.equal(hgb.unit, 'g/L')
})

test('参考范围不能被当成结果：普通行取"指标名后面第一个数"', () => {
  const { items } = extractCandidates({ markdown: '白细胞 4.2 3.5-9.5 10^9/L' })
  const wbc = items.find((i) => i.field === 'metric:wbc')
  assert.equal(wbc.valueNum, 4.2, '取到 4.2，不是 3.5')
  assert.equal(wbc.unit, '10⁹/L', '10^9/L 要归一成 10⁹/L')
})

test('拉丁别名要词边界：CRP 不会被当成肌酐（Cr）', () => {
  const { items } = extractCandidates({ markdown: 'CRP 5.0 mg/L' })
  assert.deepEqual(items, [], '不该凭两个字母就产一条肌酐候选')
  assert.ok(!fields(items).includes('metric:cr'))
})

test('不等式不折成数字：<0.5 保留原文，valueNum 留空等人工判断', () => {
  const { items } = extractCandidates({ markdown: 'CA15-3 ＜0.5 U/mL' })
  const ca = items.find((i) => i.field === 'metric:ca153')
  assert.equal(ca.valueText, '＜0.5')
  assert.equal(ca.valueNum, null, '折成 0.5 就等于替用户下结论')
})

test('单位读不清就留空（草稿页会标 unit_missing），不猜单位', () => {
  const { items } = extractCandidates({ markdown: '白细胞 4.2' })
  const wbc = items.find((i) => i.field === 'metric:wbc')
  assert.equal(wbc.unit, null)
  assert.equal(wbc.confidence, 0.7, '没单位的把握度要低于有单位的')
})

test('日期：优先带标签的行，中文与连字符写法都认', () => {
  assert.equal(extractReportDate('采样时间：2026年9月28日 09:20'), '2026-09-28')
  assert.equal(extractReportDate('报告日期 2026/9/8'), '2026-09-08')
  // 不是真日期就不认（2026-02-31 格式对、日子不对）
  assert.equal(extractReportDate('采样时间：2026-02-31'), null)
  assert.equal(extractReportDate('没有日期的一段文字'), null)
})

test('content_list 走页码：候选带"第 N 页"，表格 HTML 也能读', () => {
  const contentList = [
    { type: 'text', page_idx: 0, text: '检验报告单\n采样时间：2026年9月28日' },
    {
      type: 'table',
      page_idx: 2,
      table_body: '<table><tr><td>项目</td><td>结果</td><td>单位</td></tr><tr><td>CA15-3</td><td>18.6</td><td>U/mL</td></tr></table>',
    },
  ]
  const { items, reportDate } = extractCandidates({ markdown: 'ignored', contentList })
  assert.equal(reportDate, '2026-09-28')
  assert.equal(items.length, 1)
  assert.equal(items[0].pageRef, '第 3 页', 'page_idx 从 0 起，展示要 +1')
})

test('检测方法要带上（可比性靠它）：电化学发光 → ECLIA', () => {
  const { items } = extractCandidates({ markdown: 'CA15-3 18.6 U/mL 电化学发光法' })
  assert.equal(items[0].method, 'ECLIA')
  const clia = extractCandidates({ markdown: 'CEA 2.1 ng/mL 化学发光法' })
  assert.equal(clia.items[0].method, 'CLIA')
})

test('同一字段同一值重复出现只留一条（把握度更高的那条）', () => {
  const { items } = extractCandidates({
    markdown: ['白细胞 4.2', '白细胞 4.2 10^9/L'].join('\n'),
  })
  const wbc = items.filter((i) => i.field === 'metric:wbc')
  assert.equal(wbc.length, 1)
  assert.equal(wbc[0].unit, '10⁹/L')
  assert.equal(wbc[0].confidence, 0.85)
})

test('用户自定义别名能生效（设置里加的别名走 extraAliases，不改内置词表）', () => {
  const before = METRIC_ALIASES.weight.length
  const { items } = extractCandidates({ markdown: '称重 64.2 kg', extraAliases: { weight: ['称重'] } })
  assert.equal(items[0].field, 'metric:weight')
  assert.equal(items[0].valueNum, 64.2)
  assert.equal(METRIC_ALIASES.weight.length, before, '内置词表不能被子类调用改掉')
})

test('认不出就空手而归，并明说原因（不硬凑候选）', () => {
  const { items, warnings } = extractCandidates({ markdown: '这是一份出院小结，只有一段叙述文字。' })
  assert.deepEqual(items, [])
  assert.ok(warnings.some((w) => w.includes('没认出任何字典内指标')))
  assert.ok(warnings.some((w) => w.includes('日期')))
})

test('单位归一：常见几种写法收敛到字典口径', () => {
  assert.equal(normalizeUnit('×10⁹/L'), '10⁹/L')
  assert.equal(normalizeUnit('umol/L'), 'μmol/L')
  assert.equal(normalizeUnit('U/ml'), 'U/mL')
  assert.equal(normalizeUnit('kg/m2'), 'kg/m²')
  assert.equal(normalizeUnit('mL/d'), 'mL/日')
  assert.equal(normalizeUnit('furlong'), null)
  assert.equal(normalizeUnit(''), null)
})

/* ---------- 真实 MinerU 输出形态（2026-10-17 实测踩到的坑） ---------- */

test('整张表塞进一个单元格时按位置对齐：第 i 个指标配第 i 个数、第 i 个单位', () => {
  // 这是 MinerU 解析本地 PDF 后的真实形态：三列，每列里装着 8 项内容
  const html = '<table><tr><td>Item CA15-3 CEA WBC HGB PLT ALT Creatinine LVEF</td>'
    + '<td>Result 18.6 2.1 4.2 112 180 31 62 62</td>'
    + '<td>Unit U/mL ng/mL 10^9/L g/L 10^9/L U/L umol/L %</td></tr></table>'
  const { items } = extractCandidates({ markdown: html })
  const by = Object.fromEntries(items.map((i) => [i.field, i]))

  assert.equal(items.length, 8, '八项都要抽出来')
  assert.deepEqual(
    Object.fromEntries(Object.entries(by).map(([k, v]) => [k, [v.valueNum, v.unit]])),
    {
      'metric:ca153': [18.6, 'U/mL'],
      'metric:cea': [2.1, 'ng/mL'],
      'metric:wbc': [4.2, '10⁹/L'],
      'metric:hgb': [112, 'g/L'],
      'metric:plt': [180, '10⁹/L'],
      'metric:alt': [31, 'U/L'],
      'metric:cr': [62, 'μmol/L'],
      'metric:lvef': [62, '%'],
    },
    '以前这里会给 8 个指标都写上 18.6，是最危险的一种错',
  )
})

test('指标数与数值数对不上就整行放弃，不按位置硬配', () => {
  const md = '| Item CA15-3 CEA WBC | 18.6 2.1 | U/mL ng/mL |'
  const { items } = extractCandidates({ markdown: md })
  assert.deepEqual(items, [], '少一个数就整行不产候选，交给人看原文')
})

test('markdown 里的 HTML 表格（含跨行）能转成表格行再解析', () => {
  const md = [
    '检验报告单',
    '<table>',
    '<tr><td>项目</td><td>结果</td><td>单位</td></tr>',
    '<tr><td>CA15-3</td><td>18.6</td><td>U/mL</td></tr>',
    '</table>',
  ].join('\n')
  const { items } = extractCandidates({ markdown: md })
  assert.equal(items.length, 1)
  assert.equal(items[0].field, 'metric:ca153')
  assert.equal(items[0].valueNum, 18.6)
  assert.equal(items[0].unit, 'U/mL')
})
