/**
 * 随访节奏层（dsh/cadence.js）单测，G2。
 *
 * 钉五类边界：
 * 1. 数据可溯：节奏表来自 P208/P209，每段都有页码；
 * 2. 节点是日历格：手术日 + k×间隔，月末夹取不溢出到下个月；
 * 3. **不猜**：没手术日期返回 missing，分期没记录只给通用节奏；
 * 4. 注 b 只并列提示，不自动把 3 个月改成 6 个月；
 * 5. 标签靠药名匹配，匹配不到不出标签（"化疗"两个字不等于用过蒽环）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CADENCE_META, GRACE_DAYS, addMonths, monthsBetween, phaseFor,
  checkpoints, treatmentTags, applicableChecks, stageRelax, buildFollowupPlan,
} from '../dsh/cadence.js'

const doc = JSON.parse(readFileSync(new URL('../assets/reference/guideline/cadence.json', import.meta.url), 'utf8'))

test('数据来源：三段节奏都有 P208 页码，检查项都有 P209 页码', () => {
  assert.equal(CADENCE_META.id, 'caca-cbcs-2025')
  for (const p of doc.phases) {
    assert.equal(p.page, 208)
    assert.ok(p.intervalMonths > 0)
  }
  const intervals = doc.phases.map((p) => p.intervalMonths)
  assert.deepEqual(intervals, [3, 6, 12])
  for (const c of doc.checks) {
    assert.match(String(c.page), /^20[89]$/, `${c.id} 页码应为 P208/P209`)
  }
})

test('加月份：月末夹取，不溢出到下个月', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonths('2026-01-15', 3), '2026-04-15')
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28')
  assert.equal(addMonths('2026-12-31', 2), '2027-02-28')
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28')
  assert.equal(addMonths('不是日期', 1), null)
})

test('相差月数：按 30.4375 天折算，非法输入返回 null', () => {
  assert.equal(Math.round(monthsBetween('2026-01-20', '2026-04-20')), 3)
  assert.equal(Math.round(monthsBetween('2026-01-20', '2026-07-20')), 6)
  assert.equal(monthsBetween(null, '2026-04-20'), null)
})

test('分档：按术后月数落到三段之一', () => {
  assert.equal(phaseFor(0).id, 'y0_2')
  assert.equal(phaseFor(23.9).id, 'y0_2')
  assert.equal(phaseFor(24).id, 'y3_5')
  assert.equal(phaseFor(59).id, 'y3_5')
  assert.equal(phaseFor(60).id, 'y5p')
  assert.equal(phaseFor(600).id, 'y5p')
  assert.equal(phaseFor(-1), null)
  assert.equal(phaseFor(null), null)
})

test('参考节点：手术日 + k×间隔，前后两个节点都给出', () => {
  // 2026-01-20 手术，3 个月一次；2026-10-22 当天（10-20 这一格刚过 2 天）
  const r = checkpoints({ surgeryDate: '2026-01-20', today: '2026-10-22', intervalMonths: 3 })
  assert.equal(r.beforeSurgery, false)
  assert.equal(r.previous.date, '2026-10-20')
  assert.equal(r.previous.daysSince, 2)
  assert.equal(r.previous.state, 'near')
  assert.equal(r.next.date, '2027-01-20')
  assert.equal(r.next.daysUntil, 90)
  assert.equal(r.next.state, 'later')
})

test('参考节点：还没到 / 已过，两档按 ±30 天带宽判定', () => {
  const later = checkpoints({ surgeryDate: '2026-01-20', today: '2026-09-01', intervalMonths: 3 })
  assert.equal(later.next.date, '2026-10-20')
  assert.equal(later.next.state, 'later')
  assert.ok(later.next.daysUntil > GRACE_DAYS)

  // 10-20 这一格已经过了 61 天，下一个 01-20 还差 31 天：两边都不在带宽内
  const past = checkpoints({ surgeryDate: '2026-01-20', today: '2026-12-20', intervalMonths: 3 })
  assert.equal(past.previous.date, '2026-10-20')
  assert.equal(past.previous.state, 'past')
  assert.equal(past.next.date, '2027-01-20')
  assert.equal(past.next.state, 'later')
})

test('参考节点：手术日未到不伪造节点', () => {
  const r = checkpoints({ surgeryDate: '2027-01-20', today: '2026-10-22', intervalMonths: 3 })
  assert.equal(r.beforeSurgery, true)
  assert.ok(r.daysUntilSurgery > 0)
})

test('标签：按药名匹配，状态区分在用/用过', () => {
  const { tags } = treatmentTags([
    { id: 't1', kind: 'surgery', name: '左乳保乳 + 前哨淋巴结活检', status: 'completed' },
    { id: 't2', kind: 'endocrine', name: '来曲唑（计划 5 年）', status: 'ongoing' },
    { id: 't3', kind: 'chemo', name: 'EC ×4 → 紫杉醇 ×4', status: 'completed' },
    { id: 't4', kind: 'targeted', name: '曲妥珠单抗', status: 'ongoing' },
  ])
  assert.equal(tags.breast_conserving.state, 'past')
  assert.equal(tags.ai.state, 'ongoing')
  assert.equal(tags.anthracycline.state, 'past') // 靠 EC 认出来的
  assert.equal(tags.antiher2.state, 'ongoing')
  assert.equal(tags.ici, undefined)
})

test('标签：只写「化疗」时不假设用了蒽环', () => {
  const { tags, unmatched } = treatmentTags([{ id: 't1', kind: 'chemo', name: '化疗', status: 'completed' }])
  assert.equal(tags.anthracycline, undefined)
  assert.equal(tags.antiher2, undefined)
  assert.equal(unmatched.length, 1)
  assert.equal(unmatched[0].name, '化疗')
})

test('检查项：常规 5 项始终在；特殊项命中标签才出', () => {
  const routineOnly = applicableChecks({})
  assert.equal(routineOnly.routine.length, 5)
  assert.equal(routineOnly.special.length, 1) // 只剩胸部 CT（所有人群）
  assert.ok(routineOnly.unavailable.some((c) => c.id === 'bone_scan'))

  const withIci = applicableChecks({ ici: { state: 'ongoing' } })
  assert.ok(withIci.special.some((c) => c.id === 'cardiac'))
  assert.ok(withIci.special.some((c) => c.id === 'ici_lab'))
})

test('分期：只判"有没有记录 / 是否落在注 b 范围"，不判轻重', () => {
  assert.deepEqual(stageRelax(null), { known: false, relax: 'none' })
  assert.equal(stageRelax('0 期').relax, 'listed')
  assert.equal(stageRelax('pT1micN0').relax, 'listed')
  assert.equal(stageRelax('IA 期').relax, 'partial')
  assert.equal(stageRelax('IIA 期').relax, 'none')
  assert.equal(stageRelax('IIIB').relax, 'none')
})

test('组装：没有手术日期时不猜，返回 missing', () => {
  const r = buildFollowupPlan({ treatments: [], diagnoses: [], today: '2026-10-22' })
  assert.equal(r.missing, 'surgery')
  assert.equal(r.plan, null)
  assert.equal(r.relaxHint, null)
})

test('组装：2 年内每 3 个月，且注 b 只并列提示、不改主节奏', () => {
  const r = buildFollowupPlan({
    treatments: [
      { id: 't1', kind: 'surgery', name: '左乳保乳', actualStart: '2026-01-20', status: 'completed' },
      { id: 't2', kind: 'endocrine', name: '来曲唑', status: 'ongoing' },
    ],
    diagnoses: [{ stageText: 'IA 期' }],
    today: '2026-10-22',
  })
  assert.equal(r.missing, null)
  assert.equal(r.plan.intervalMonths, 3) // 主节奏不动
  assert.equal(r.plan.checkpoints.previous.date, '2026-10-20')
  assert.equal(r.plan.checkpoints.next.date, '2027-01-20')
  assert.ok(r.relaxHint, 'I 期应给出注 b 提示')
  assert.equal(r.relaxHint.kind, 'partial')
  assert.match(r.relaxHint.text, /治疗团队判断/)
  assert.match(r.relaxHint.disclaimer, /不自动套用/)
})

test('组装：术后 6 年走每年一次，且不再给注 b 提示', () => {
  const r = buildFollowupPlan({
    treatments: [{ id: 't1', kind: 'surgery', name: '左乳改良根治', actualStart: '2020-03-10', status: 'completed' }],
    diagnoses: [{ stageText: 'IA 期' }],
    today: '2026-10-22',
  })
  assert.equal(r.plan.phaseId, 'y5p')
  assert.equal(r.plan.intervalMonths, 12)
  assert.equal(r.relaxHint, null)
})
