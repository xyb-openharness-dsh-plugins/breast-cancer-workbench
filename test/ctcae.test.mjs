/**
 * CTCAE v5.0 分级对照（dsh/ctcae.js）单测。
 *
 * 钉两类边界：
 * 1. 阈值边界必须与 assets/reference/ctcae/ 的官方 PDF 一致（±一点都不能漂）；
 * 2. 「分级是对照不是诊断」的产品边界：无定义的指标返回 null、正常值不给级、
 *    贫血最多 3 级（G4 无数值界限，留给治疗团队）、每条结果都带来源可溯。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  CTCAE_META, CTCAE_GRADE_LABELS, ctcaeGrade, ctcaeCoveredCodes, ctcaeInfo,
} from '../dsh/ctcae.js'
import { marrowSuppression } from '../dsh/readmodels.js'

test('元信息：版本 5.0、发布日期与本地 PDF 位置', () => {
  assert.equal(CTCAE_META.version, '5.0')
  assert.equal(CTCAE_META.published, '2017-11-27')
  assert.match(CTCAE_META.sourceUrl, /cancer\.gov/)
  assert.ok(existsSync(new URL(`../${CTCAE_META.localPdf}`, import.meta.url)), '本地 PDF 必须存在')
  assert.match(CTCAE_META.disclaimer, /不是诊断/)
})

test('只覆盖血液学四项；其他指标（含标志物）一律 null', () => {
  assert.deepEqual(ctcaeCoveredCodes().sort(), ['anc', 'hgb', 'plt', 'wbc'])
  for (const code of ['ca153', 'cea', 'alt', 'cr', 'weight', 'arm_diff', 'lvef', 'drain_vol']) {
    assert.equal(ctcaeGrade(code, 123), null, `${code} 不该有对照`)
  }
})

test('中性粒细胞绝对值：CTCAE v5.0 边界逐个钉住', () => {
  // G1 <LLN–1.5（本地 LLN≈2.0，近似）；G2 <1.5–1.0；G3 <1.0–0.5；G4 <0.5
  assert.equal(ctcaeGrade('anc', 2.0).grade, null, '达到下限不算')
  assert.equal(ctcaeGrade('anc', 1.9).grade, 1)
  assert.equal(ctcaeGrade('anc', 1.5).grade, 1, '等于 G2 上界仍算 G1（区间左闭右开）')
  assert.equal(ctcaeGrade('anc', 1.4).grade, 2)
  assert.equal(ctcaeGrade('anc', 1.0).grade, 2)
  assert.equal(ctcaeGrade('anc', 0.9).grade, 3)
  assert.equal(ctcaeGrade('anc', 0.5).grade, 3)
  assert.equal(ctcaeGrade('anc', 0.4).grade, 4)
  const g3 = ctcaeGrade('anc', 0.8)
  assert.equal(g3.term, '中性粒细胞减少')
  assert.equal(g3.band, '0.5–<1 10⁹/L')
  assert.equal(g3.approx, true, '没有个人 LLN，必须标近似')
  assert.match(g3.note, /通用下限/)
})

test('白细胞：G3 从 2.0 开始，G4 低于 1.0', () => {
  assert.equal(ctcaeGrade('wbc', 3.6).grade, null)
  assert.equal(ctcaeGrade('wbc', 3.2).grade, 1)
  assert.equal(ctcaeGrade('wbc', 2.5).grade, 2)
  assert.equal(ctcaeGrade('wbc', 1.5).grade, 3)
  assert.equal(ctcaeGrade('wbc', 0.9).grade, 4)
})

test('血红蛋白单位换算：g/L 阈值 = CTCAE(g/dL) × 10；最多 3 级', () => {
  assert.equal(ctcaeGrade('hgb', 120).grade, null)
  assert.equal(ctcaeGrade('hgb', 110).grade, 1)
  assert.equal(ctcaeGrade('hgb', 90).grade, 2)
  assert.equal(ctcaeGrade('hgb', 75).grade, 3, '<80 g/L 是 G3')
  assert.equal(ctcaeGrade('hgb', 40).grade, 3, 'G4 无数值界限，本地最多给 3 级')
  const g3 = ctcaeGrade('hgb', 70)
  // G4 无数值界限，G3 是"低于 80 g/L"，没有下界——不能写成 80–<80
  assert.equal(g3.band, '<80 g/L')
  assert.equal(ctcaeGrade('anc', 0.8).band, '0.5–<1 10⁹/L', '有 G4 界限的仍给闭开区间')
})

test('血小板：G2/G3/G4 = 75/50/25', () => {
  assert.equal(ctcaeGrade('plt', 130).grade, null)
  assert.equal(ctcaeGrade('plt', 100).grade, 1)
  assert.equal(ctcaeGrade('plt', 60).grade, 2)
  assert.equal(ctcaeGrade('plt', 30).grade, 3)
  assert.equal(ctcaeGrade('plt', 20).grade, 4)
})

test('非数字与 undefined 安全返回 null', () => {
  assert.equal(ctcaeGrade('anc', NaN), null)
  assert.equal(ctcaeGrade('anc', undefined), null)
  assert.equal(ctcaeGrade('anc', 'abc'), null)
})

test('读模型透传：metricCards 的 ctcae 字段只出现在有定义且有数据的卡上', async () => {
  const { Workbench } = await import('../dsh/workbench.js')
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { homedir } = await import('node:os')
  const root = await mkdtemp(join(homedir(), '.xyb-ctcae-'))
  try {
    const dir = join(root, '资料')
    const { workbench } = await Workbench.openWorkspace({ dir, create: true, subjectName: '测试' })
    workbench.addObservation({ metricCode: 'anc', occurredOn: '2026-10-01', value: 0.8 })
    workbench.addObservation({ metricCode: 'ca153', occurredOn: '2026-10-01', value: 18.6 })
    const cards = workbench.metrics().cards
    const anc = cards.find((c) => c.code === 'anc')
    const ca = cards.find((c) => c.code === 'ca153')
    assert.equal(anc.ctcae.grade, 3)
    assert.equal(anc.ctcae.term, '中性粒细胞减少')
    assert.equal(ca.ctcae, null, '标志物不透传分级字段')
    // 元信息随 metrics() 透传，前端显示来源与免责用
    assert.equal(workbench.metrics().ctcae.version, '5.0')
    workbench.store.close()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('分级标签齐备', () => {
  assert.deepEqual(Object.keys(CTCAE_GRADE_LABELS).sort(), ['1', '2', '3', '4'])
  assert.equal(ctcaeInfo().version, CTCAE_META.version)
})

/* ---------------- 骨髓抑制：表达面 + 指标面 ---------------- */

async function withStore(fn) {
  const { Workbench } = await import('../dsh/workbench.js')
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { homedir } = await import('node:os')
  const root = await mkdtemp(join(homedir(), '.xyb-marrow-'))
  try {
    const { workbench } = await Workbench.openWorkspace({ dir: join(root, '资料'), create: true, subjectName: '测试' })
    const out = fn(workbench, workbench.requireSubject())
    workbench.store.close()
    return out
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('骨髓抑制：只有感受、没有指标时不成提醒（不拿感受去猜指标）', async () => {
  const r = await withStore((wb, id) => {
    wb.store.addSymptom({ subjectId: id, code: 'dizziness', level: 2, occurredOn: '2026-10-16' })
    return marrowSuppression(wb.store, id)
  })
  assert.equal(r.symptoms.length, 1)
  assert.equal(r.labs.length, 0)
  assert.equal(r.paired, false)
  assert.equal(r.labsOnly, false)
  assert.equal(r.highestGrade, null)
})

test('骨髓抑制：只有指标有级、没记相关感受时是 labsOnly，不弹看板提醒', async () => {
  const r = await withStore((wb, id) => {
    wb.store.addObservation({ subjectId: id, metricCode: 'anc', observedOn: '2026-10-16', value: 0.8 })
    wb.store.addSymptom({ subjectId: id, code: 'arm_heaviness', level: 2, occurredOn: '2026-10-16' })
    return marrowSuppression(wb.store, id)
  })
  assert.equal(r.paired, false)
  assert.equal(r.labsOnly, true, '上肢沉重不属于骨髓抑制的表达面，不该算进来')
  assert.equal(r.labs[0].grade, 3)
})

test('骨髓抑制：感受与指标都记录了才 paired；感受按码去重，指标按级降序', async () => {
  const r = await withStore((wb, id) => {
    wb.store.addSymptom({ subjectId: id, code: 'dizziness', level: 2, occurredOn: '2026-10-16' })
    wb.store.addSymptom({ subjectId: id, code: 'dizziness', level: 1, occurredOn: '2026-10-10' })
    wb.store.addSymptom({ subjectId: id, code: 'fatigue', level: 2, occurredOn: '2026-10-15' })
    wb.store.addObservation({ subjectId: id, metricCode: 'anc', observedOn: '2026-10-16', value: 0.8 })
    wb.store.addObservation({ subjectId: id, metricCode: 'wbc', observedOn: '2026-10-16', value: 2.6 })
    wb.store.addObservation({ subjectId: id, metricCode: 'plt', observedOn: '2026-10-16', value: 190 })
    return marrowSuppression(wb.store, id)
  })
  assert.equal(r.paired, true)
  assert.equal(r.labsOnly, false)
  assert.deepEqual(r.symptoms.map((s) => s.code).sort(), ['dizziness', 'fatigue'], '同一码只留最近一条')
  assert.equal(r.symptoms.find((s) => s.code === 'dizziness').level, 2, '取最近一条（10-16）')
  assert.deepEqual(r.labs.map((l) => l.code), ['anc', 'wbc'], '190 的血小板在正常区间，不进列表')
  assert.equal(r.highestGrade, 3)
  assert.equal(r.labs[0].term, '中性粒细胞减少')
  assert.equal(r.ctcae.version, '5.0')
  assert.match(r.note, /不推断因果/)
  assert.match(r.disclaimer, /不是诊断/)
})

test('看板 overview 透传 marrow 字段', async () => {
  const r = await withStore((wb, id) => {
    wb.store.addSymptom({ subjectId: id, code: 'fatigue', level: 1, occurredOn: '2026-10-15' })
    wb.store.addObservation({ subjectId: id, metricCode: 'hgb', observedOn: '2026-10-15', value: 92 })
    return wb.overview()
  })
  assert.equal(r.marrow.paired, true)
  assert.equal(r.marrow.labs[0].code, 'hgb')
  assert.equal(r.marrow.labs[0].grade, 2)
})
