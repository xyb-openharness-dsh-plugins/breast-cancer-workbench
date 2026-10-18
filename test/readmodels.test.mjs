/**
 * 读模型（`dsh/readmodels.js`）单测。
 *
 * 这一层的价值全在**读取时算、不落库**这条口径上，所以测试集中在三件事：
 * 1. 可比性跟方法走：换了检验方法，曲线要断开，不能拼成一条（A10）；
 * 2. 派生值只算不存：差值是读出来的，库里没有这一列；
 * 3. 导出文本的形状：四个分区、免责说明、私密内容默认不在。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { openStore } from '../dsh/store.js'
import {
  metricSeries, metricCards, armHistory, armSeries, documentCounts, documentList,
  viewpointList, exportFingerprint, hashOf, renderVisitMarkdown, subjectState, exportHistory,
} from '../dsh/readmodels.js'

function setup({ laterality = 'right' } = {}) {
  const store = openStore({ file: ':memory:' })
  const workspace = store.createWorkspace({ name: '读模型测试' })
  const subject = store.createSubject({ workspaceId: workspace.id, displayName: '测试', laterality })
  const obs = (day, value, { method = null, unit = 'U/mL', code = 'ca153' } = {}) => {
    const record = store.addRecord({ subjectId: subject.id, kind: 'lab', occurredOn: day, sourceKind: 'patient_reported' })
    return store.addObservation({
      subjectId: subject.id, metricCode: code, observedOn: day, value, unit, labMethod: method, recordId: record.id,
    })
  }
  return { store, subject, obs }
}

/* ---------------- 可比性 ---------------- */

test('换了检验方法：序列断成两段，不把两种方法的数拼成一条线', () => {
  const { store, subject, obs } = setup()
  obs('2026-05-01', 20, { method: '电化学发光' })
  obs('2026-06-01', 21, { method: '电化学发光' })
  obs('2026-07-01', 19, { method: '化学发光' })

  const series = metricSeries(store, subject.id).find((s) => s.code === 'ca153')
  assert.equal(series.segments.length, 2)
  assert.deepEqual(series.segments.map((g) => g.points.length), [2, 1])
  assert.equal(series.segments[0].method, '电化学发光')
  assert.equal(series.segments[1].method, '化学发光')
});

test('方法缺失只有一种表示：NULL 与空串归成同一段，不产生碎段', () => {
  const { store, subject, obs } = setup()
  obs('2026-05-01', 20, { method: null })
  obs('2026-06-01', 21, { method: '' })
  obs('2026-07-01', 22, { method: '  ' })

  const series = metricSeries(store, subject.id).find((s) => s.code === 'ca153')
  assert.equal(series.segments.length, 1, '三种"没写方法"应该是一段')
  assert.equal(series.segments[0].points.length, 3)
  assert.equal(series.segments[0].method, null)
});

test('方法变了又变回来：按出现顺序分段，不做排序合并', () => {
  const { store, subject, obs } = setup()
  obs('2026-05-01', 20, { method: 'A' })
  obs('2026-06-01', 21, { method: 'B' })
  obs('2026-07-01', 22, { method: 'A' })
  const series = metricSeries(store, subject.id).find((s) => s.code === 'ca153')
  assert.deepEqual(series.segments.map((g) => g.method), ['A', 'B', 'A'])
  assert.equal(series.segments.length, 3)
});

test('指标卡只取最新一点，delta 是"最新 − 前一次"（同方法内才有意义）', () => {
  const { store, subject, obs } = setup()
  obs('2026-07-01', 20)
  obs('2026-08-01', 21)
  obs('2026-09-01', 18.6)

  const card = metricCards(store, subject.id).find((c) => c.code === 'ca153')
  assert.equal(card.hasData, true)
  assert.equal(card.latest.value, 18.6)
  assert.equal(card.latest.date, '2026-09-01')
  assert.equal(card.delta, -2.4)
  assert.equal(card.dec, 1, '保留位数跟字典走')
});

test('没有数据的指标：hasData 为 false，latest 为空，不补 0', () => {
  const { store, subject } = setup()
  const cards = metricCards(store, subject.id)
  assert.equal(cards.length, 18)
  for (const c of cards) {
    assert.equal(c.hasData, false)
    assert.equal(c.latest, null)
    assert.equal(c.delta, null)
  }
});

/* ---------------- 上肢 ---------------- */

test('四点位：缺健侧的点不进最大差值，差值不写 0', () => {
  const { store, subject } = setup()
  store.addArmSet({
    subjectId: subject.id,
    measuredOn: '2026-09-12',
    points: [
      { point: 'wrist', affected: 16.2, healthy: null },
      { point: 'forearm_mid', affected: 24.1, healthy: 22.0 },
      { point: 'above_elbow_10', affected: 30.5, healthy: 27.0 },
    ],
    assessorRole: 'patient',
  })
  const arm = armHistory(store, subject.id)
  assert.equal(arm.count, 1)
  const set = arm.sets[0]
  assert.equal(set.points.find((p) => p.point === 'wrist').diff, null)
  assert.equal(arm.latest.maxDiff, 3.5, '只在有健侧的点里取最大差')
  assert.equal(set.maxDiff, 3.5)
});

test('两次测量之间给出"较上次"的差，第一次没有可比对象时为 null', () => {
  const { store, subject } = setup()
  store.addArmSet({
    subjectId: subject.id, measuredOn: '2026-08-01',
    points: [{ point: 'forearm_mid', affected: 23.5, healthy: 22.0 }], assessorRole: 'patient',
  })
  store.addArmSet({
    subjectId: subject.id, measuredOn: '2026-09-12',
    points: [{ point: 'forearm_mid', affected: 24.1, healthy: 22.0 }], assessorRole: 'patient',
  })
  const arm = armHistory(store, subject.id)
  assert.equal(arm.count, 2)
  assert.ok(Math.abs(arm.delta - 0.6) < 1e-9)
  const series = armSeries(store, subject.id)
  assert.equal(series.length, 2, '每次测量一个点')
  assert.ok(Math.abs(series[1].value - 2.1) < 1e-9, '序列画的是"最大差"，不是某一个点位')
});

/* ---------------- 派生值不落库 ---------------- */

test('库里没有 diff / delta 这类列：派生值只在读取时算', () => {
  const { store } = setup()
  const columnsOf = (table) => store.db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  assert.ok(!columnsOf('arm_measurement').some((c) => /diff|delta/i.test(c)), '臂围差不能存成列')
  assert.ok(!columnsOf('observation').some((c) => /delta|change/i.test(c)), '变化值不能存成列')
  assert.ok(columnsOf('observation').includes('lab_method'), '方法要存，因为可比性靠它')
});

/* ---------------- 材料统计 ---------------- */

test('材料计数按状态分开，解析失败的单独数出来', () => {
  const { store, subject } = setup()
  const add = (status, name) => {
    store.db.prepare(`INSERT INTO document (id, subject_id, kind, filename, sha256, bytes, imported_at, storage_path, status)
      VALUES (?, ?, 'lab', ?, ?, 1, ?, ?, ?)`)
      .run(`doc_${name}`, subject.id, name, `${name}`.padEnd(64, '0'), new Date().toISOString(), `documents/${name}`, status)
  }
  add('stored', 'a.txt')
  add('parsed', 'b.txt')
  add('parse_failed', 'c.txt')

  const counts = documentCounts(documentList(store, subject.id))
  assert.equal(counts.total, 3)
  assert.equal(counts.parsed, 1)
  assert.equal(counts.failed, 1)
  assert.equal(counts.unparsed, 1)
});

/* ---------------- 导出文本与指纹 ---------------- */

test('导出 Markdown：四个分区、差值免责、私密看法默认不出现', () => {
  const { store, subject } = setup()
  store.addViewpoint({ subjectId: subject.id, text: '公开的一句', speakerRole: 'patient', recordedOn: '2026-09-10', isPrivate: false })
  store.addViewpoint({ subjectId: subject.id, text: '只想自己看的一句', speakerRole: 'patient', recordedOn: '2026-09-10', isPrivate: true })

  const state = subjectState(store, subject.id)
  const md = renderVisitMarkdown({
    subject: state,
    stageLabel: state.stage?.label ?? null,
    generatedAt: '2026-10-17',
    questions: [],
    viewpoints: viewpointList(store, subject.id),
    metrics: [],
    arm: null,
    treatments: [],
    documents: [],
  })
  for (const heading of ['一、', '二、', '三、', '四、']) assert.ok(md.includes(heading), `缺分区 ${heading}`)
  assert.ok(md.includes('不是医生结论'))
  assert.ok(md.includes('公开的一句'))
  assert.ok(!md.includes('只想自己看的一句'), '私密看法默认不出现在导出里')
});

test('导出指纹：数据不变则指纹不变，新增一条记录就变', () => {
  const { store, subject, obs } = setup()
  obs('2026-09-01', 20)
  const a = hashOf(exportFingerprint(store, subject.id))
  const b = hashOf(exportFingerprint(store, subject.id))
  assert.equal(a, b, '同样的数据要得到同样的指纹')
  assert.match(a, /^[0-9a-f]{12,64}$/, '是十六进制摘要，便于比对')

  obs('2026-09-12', 18.6)
  const c = hashOf(exportFingerprint(store, subject.id))
  assert.notEqual(c, a, '数据变了指纹要变，导出结果才能标"已过时"')
});

test('导出历史按时间倒序，最新一次排在最前面', () => {
  const { store, subject } = setup()
  const insert = (id, at) => store.db.prepare(`INSERT INTO export_job
    (id, subject_id, format, scope_json, file_path, content_hash, created_at)
    VALUES (?, ?, 'md', '{}', NULL, 'h', ?)`).run(id, subject.id, at)
  insert('exp_1', '2026-09-01T00:00:00.000Z')
  insert('exp_2', '2026-09-12T00:00:00.000Z')
  const list = exportHistory(store, subject.id)
  assert.equal(list.length, 2)
  assert.equal(list[0].id, 'exp_2')
});

/* ---------------- 档案 ---------------- */

test('档案状态：阶段只有码与标签，不是"诊断结论"', () => {
  const { store, subject } = setup()
  store.addStage({ subjectId: subject.id, stage: 'endocrine', declaredOn: '2026-05-01', source: 'self_declared' })
  const state = subjectState(store, subject.id)
  assert.equal(state.stage.code, 'endocrine')
  assert.equal(state.stage.label, '内分泌治疗')
  assert.equal(state.lateralityLabel, '右')
  assert.equal(JSON.stringify(state).includes('诊断'), false, '档案里不写"诊断"这类措辞')
});
