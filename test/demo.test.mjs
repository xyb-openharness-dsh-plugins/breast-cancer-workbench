/**
 * 五套演示画像（G2-5.2）。验的是"边界画像是否真的存在"，不是"数据能不能插进去"：
 * 体量、故意留空、侧别歧义、更正链、待核对材料、manifest 清理、确定性。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { openStore } from '../dsh/store.js'
import {
  DEMO_DATASETS, DEMO_MARKER, seedDemo, seedAllDemos, listDemos, clearDemo,
} from '../dsh/demo.js'
import { ImportService } from '../dsh/import.js'

const rows = (store, subjectId) => store.db
  .prepare('SELECT (SELECT COUNT(*) FROM observation WHERE subject_id = ?) + (SELECT COUNT(*) FROM measurement WHERE subject_id = ?) AS n')
  .get(subjectId, subjectId).n

test('五套画像都能独立生成，manifest 各一条', () => {
  const store = openStore({ file: ':memory:' })
  const manifests = seedAllDemos(store)
  assert.equal(manifests.length, 5)
  assert.deepEqual(manifests.map((m) => m.datasetId).sort(), ['DEMO-1', 'DEMO-2', 'DEMO-3', 'DEMO-4', 'DEMO-5'])
  const listed = listDemos(store)
  assert.equal(listed.length, 5)
  for (const m of listed) {
    assert.equal(m.marker, DEMO_MARKER)
    assert.ok(m.workspaceName.startsWith(DEMO_MARKER), '工作区名必须带标记')
    assert.ok(m.subjectId)
  }
})

test('四套完整画像体量 ≥120 条观测/测量；DEMO-2 是刻意的空态', () => {
  const store = openStore({ file: ':memory:' })
  const manifests = seedAllDemos(store)
  const by = Object.fromEntries(manifests.map((m) => [m.datasetId, m]))
  for (const id of ['DEMO-1', 'DEMO-3', 'DEMO-4', 'DEMO-5']) {
    assert.ok(rows(store, by[id].subjectId) >= 120, `${id} 只有 ${rows(store, by[id].subjectId)} 条`)
  }
  const empty = by['DEMO-2']
  assert.ok(rows(store, empty.subjectId) <= 2)
  assert.equal(empty.counts.treatments, 0)
  assert.equal(empty.counts.measurements, 0)
  assert.equal(empty.counts.documents, 0)
})

test('每套至少留一处"故意为空"，并且写明了是什么', () => {
  const store = openStore({ file: ':memory:' })
  for (const m of seedAllDemos(store)) {
    assert.ok(Array.isArray(m.gaps) && m.gaps.length >= 1, `${m.datasetId} 没有记录留空项`)
  }
})

test('DEMO-1：16 项指标齐全、4 次四点位、治疗时间轴可对照', () => {
  const store = openStore({ file: ':memory:' })
  const m = seedDemo(store, 'DEMO-1')
  const codes = store.db.prepare('SELECT DISTINCT metric_code FROM observation WHERE subject_id = ?').all(m.subjectId).map((r) => r.metric_code)
  assert.ok(codes.length >= 16, `只覆盖 ${codes.length} 项指标`)
  const sets = store.db.prepare('SELECT COUNT(*) AS n FROM arm_set WHERE subject_id = ?').get(m.subjectId).n
  assert.equal(sets, 4)
  const latest = store.latestArmDiff(m.subjectId)
  assert.equal(latest.maxDiff, 2.2)
  const kinds = store.treatmentsFor(m.subjectId).map((t) => t.kind)
  assert.deepEqual(kinds, ['surgery', 'chemo', 'radio', 'endocrine'])
})

test('DEMO-2：只有 1 次指标、无治疗无测量无材料', () => {
  const store = openStore({ file: ':memory:' })
  const m = seedDemo(store, 'DEMO-2')
  assert.equal(rows(store, m.subjectId), 1)
  assert.equal(store.treatmentsFor(m.subjectId).length, 0)
  assert.equal(store.latestArmDiff(m.subjectId), null)
  assert.equal(store.getSubject(m.subjectId).laterality, 'right')
  assert.equal(store.stagesFor(m.subjectId)[0].stage, 'newly_diagnosed')
})

test('DEMO-3：保乳 + SLNB，臂围差长期 0.2–0.4，不出现腋窝清扫', () => {
  const store = openStore({ file: ':memory:' })
  const m = seedDemo(store, 'DEMO-3')
  const treatments = store.treatmentsFor(m.subjectId)
  assert.equal(treatments.find((t) => t.kind === 'surgery').axillary_procedure, 'slnb')
  assert.ok(!treatments.some((t) => t.axillary_procedure === 'alnd'))

  const diffs = store.db.prepare(`SELECT MAX(derived_diff_num) AS d FROM measurement
    WHERE subject_id = ? GROUP BY set_id`).all(m.subjectId).map((r) => r.d)
  assert.ok(diffs.length >= 6)
  for (const d of diffs) assert.ok(d >= 0.1 && d <= 0.5, `差值 ${d} 超出 0.2–0.4 画像`)
})

test('DEMO-4：双侧档案无法判患健侧时拒绝写四点位（不猜侧别）', () => {
  const store = openStore({ file: ':memory:' })
  const m = seedDemo(store, 'DEMO-4')
  assert.equal(store.getSubject(m.subjectId).laterality, 'bilateral')
  assert.equal(store.latestArmDiff(m.subjectId), null)
  assert.throws(
    () => store.addArmSet({ subjectId: m.subjectId, measuredOn: '2026-09-30', points: [{ point: 'wrist', affected: 20, healthy: 18 }] }),
    /未声明患侧/,
  )
  // 指标断线：ca153 两种方法，不能连线
  const methods = store.db.prepare("SELECT DISTINCT lab_method FROM observation WHERE subject_id = ? AND metric_code = 'ca153'")
    .all(m.subjectId).map((r) => r.lab_method).sort()
  assert.deepEqual(methods, ['CLIA', 'ECLIA'])
})

test('DEMO-5：更正链两版、一份解析失败、一份待核对且冲突可见', () => {
  const store = openStore({ file: ':memory:' })
  const m = seedDemo(store, 'DEMO-5')

  const weight = store.db.prepare(`SELECT record_id FROM observation WHERE subject_id = ?
    AND metric_code = 'weight' AND observed_on = '2026-09-08' ORDER BY rowid DESC LIMIT 1`).get(m.subjectId)
  assert.equal(store.recordHistory(weight.record_id).length, 2, '更正链应有两版')

  const docs = store.db.prepare('SELECT * FROM document WHERE subject_id = ?').all(m.subjectId)
  assert.equal(docs.length, 2)
  assert.ok(docs.some((d) => d.status === 'parse_failed'))
  const failed = docs.find((d) => d.status === 'parse_failed')
  assert.equal(new ImportService(store).candidatesFor(failed.id).length, 0, '解析失败不得产生候选')

  const draft = new ImportService(store).draftFor(m.subjectId)
  const codes = draft.documents.flatMap((d) => d.candidates.flatMap((c) => c.issues.map((i) => i.code)))
  assert.ok(codes.includes('conflict'))
  assert.ok(codes.includes('unit_missing'))
})

test('同一套重复生成不翻倍（覆盖而非追加）', () => {
  const store = openStore({ file: ':memory:' })
  const first = seedDemo(store, 'DEMO-1')
  const second = seedDemo(store, 'DEMO-1')
  assert.equal(listDemos(store).length, 1)
  assert.notEqual(second.subjectId, first.subjectId)
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM subject').get().n, 1, '旧档案应随旧工作区一起清掉')
})

test('清理只删 manifest 登记的那一套；名字像 demo 但没有 manifest 的一律不动', () => {
  const store = openStore({ file: ':memory:' })
  const m = seedDemo(store, 'DEMO-1')
  const fake = store.createWorkspace({ name: `${DEMO_MARKER} 手工伪造`, settings: {} })
  const fakeSubject = store.createSubject({ workspaceId: fake.id, displayName: '不该被删', laterality: 'left' })

  assert.throws(() => clearDemo(store, 'DEMO-9'), /manifest 里没有/)
  assert.equal(listDemos(store).length, 1)

  clearDemo(store, 'DEMO-1')
  assert.equal(listDemos(store).length, 0)
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM subject WHERE id = ?').get(m.subjectId).n, 0)
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM observation WHERE subject_id = ?').get(m.subjectId).n, 0)
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM subject WHERE id = ?').get(fakeSubject.id).n, 1, '伪造的没 manifest，不能被删')
})

test('确定性：同一套两次生成，序列完全一致', () => {
  const a = openStore({ file: ':memory:' })
  const b = openStore({ file: ':memory:' })
  const ma = seedDemo(a, 'DEMO-3')
  const mb = seedDemo(b, 'DEMO-3')
  const series = (store, subjectId) => store.db.prepare(`SELECT metric_code, observed_on, value_num FROM observation
    WHERE subject_id = ? ORDER BY metric_code, observed_on, rowid`).all(subjectId)
  assert.deepEqual(series(a, ma.subjectId), series(b, mb.subjectId))
})

test('DEMO-1 带齐"周边记录"：看法、问题、待办、康复条目都有，且私密项确实标了私密', () => {
  const store = openStore({ file: ':memory:' })
  const m = seedDemo(store, 'DEMO-1')

  assert.ok(m.counts.viewpoints >= 2, `看法只有 ${m.counts.viewpoints} 条`)
  assert.ok(m.counts.questions >= 2, `问题只有 ${m.counts.questions} 条`)
  assert.ok(m.counts.tasks >= 2, `待办只有 ${m.counts.tasks} 条`)
  assert.ok(m.counts.care >= 2, `康复/营养条目只有 ${m.counts.care} 条`)

  const priv = store.db.prepare('SELECT COUNT(*) AS n FROM viewpoint WHERE subject_id = ? AND is_private = 1').get(m.subjectId).n
  assert.ok(priv >= 1, '演示画像要留一条私密看法，用来验"默认不导出"')

  // 待办里要有一条未来日期的安排：它不该被当成"已发生的事实"拒掉
  const future = store.db.prepare('SELECT COUNT(*) AS n FROM task WHERE subject_id = ? AND due_on > ?').get(m.subjectId, '2026-10-17').n
  assert.ok(future >= 1, '没有未来日期的待办，验不出"安排 vs 已发生"的边界')

  // 康复建议必须带来源与日期（A11：只展示已存建议）
  const advice = store.db.prepare("SELECT * FROM care_entry WHERE subject_id = ? AND kind = 'rehab_advice'").get(m.subjectId)
  assert.ok(advice, '缺一条已存康复建议')
  assert.equal(advice.source_kind, 'stored_advice')
  assert.ok(advice.source_date, '已存建议必须带来源日期')
})

test('清理演示时，这些"周边记录"也一起删干净（不留孤儿）', () => {
  const store = openStore({ file: ':memory:' })
  const m = seedDemo(store, 'DEMO-1')
  clearDemo(store, 'DEMO-1')
  for (const table of ['viewpoint', 'question', 'task', 'care_entry']) {
    const n = store.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE subject_id = ?`).get(m.subjectId).n
    assert.equal(n, 0, `${table} 还有残留`)
  }
})
