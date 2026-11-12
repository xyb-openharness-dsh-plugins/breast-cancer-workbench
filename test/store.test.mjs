import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { openStore } from '../dsh/store.js'
import { migrate, migrationFiles, sha256 } from '../dsh/migrate.js'
import { METRICS, PROTOCOLS, seedDictionary } from '../dsh/dictionary.js'

function fresh() {
  const store = openStore()
  const ws = store.createWorkspace({ name: '测试工作区' })
  const subject = store.createSubject({ workspaceId: ws.id, displayName: '化名', laterality: 'left' })
  return { store, ws, subject }
}

test('迁移把 25 张表、27 个索引建出来，README 说明不能算数', () => {
  const { store } = fresh()
  const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_version'").all()
  const indexes = store.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all()
  assert.equal(tables.length, 25)
  assert.equal(indexes.length, 27)
  assert.ok(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").get())
  assert.equal(store.db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
  store.close()
})

test('迁移幂等：第二次执行不再建表；已执行文件被改过会被拦下', () => {
  const db = new DatabaseSync(':memory:')
  const first = migrate(db)
  assert.deepEqual(first.executed, ['0001_initial.sql', '0002_candidate_dates.sql', '0003_subject_is_demo.sql'])
  const second = migrate(db)
  assert.deepEqual(second.executed, [])
  assert.equal(second.applied.length, 3)  // 0001 + 0002 + 0003

  db.prepare("UPDATE schema_version SET checksum = 'deadbeef' WHERE version = 1").run()
  assert.throws(() => migrate(db), /冻结后被改动/)
  db.close()
})

test('迁移文件按编号排序，命名不合规直接报错', () => {
  assert.deepEqual(migrationFiles(), ['0001_initial.sql', '0002_candidate_dates.sql', '0003_subject_is_demo.sql'])
})

test('0002 补的两列存在、可空、格式受 CHECK 约束', () => {
  const { store } = fresh()
  const docCols = store.db.prepare('PRAGMA table_info(document)').all().map((c) => c.name)
  const candCols = store.db.prepare('PRAGMA table_info(candidate)').all().map((c) => c.name)
  assert.ok(docCols.includes('report_date'))
  assert.ok(candCols.includes('occurred_on'))
  const notnull = store.db.prepare('PRAGMA table_info(candidate)').all().find((c) => c.name === 'occurred_on')
  assert.equal(notnull.notnull, 0, 'occurred_on 必须可空，老数据不能被迫填一个假日期')
  // 空表上 UPDATE 不会触发 CHECK，必须真插一行才能证明约束在生效。
  // 注意 CHECK 只验**格式**（四位-两位-两位）；2026-02-31 这种"格式对、日子不对"由 JS 的
  // assertMedicalDate 拦，SQLite 的 GLOB 判不了月长，这条边界写在 import.js 的单测里。
  assert.throws(
    () => store.db.prepare("INSERT INTO candidate (id, field, value_text, occurred_on) VALUES ('c_probe','metric:wbc','4.2','2026-2-3')").run(),
    /CHECK constraint failed/,
  )
  store.db.prepare("INSERT INTO candidate (id, field, value_text, occurred_on) VALUES ('c_ok','metric:wbc','4.2',NULL)").run()
  assert.ok(store.db.prepare("SELECT id FROM candidate WHERE id='c_ok'").get(), '没日期也必须能存（老数据与读不到日期的原件）')
  store.close()
})

test('字典种子：22 项指标 + 3 个协议，重复执行不新增', () => {
  const { store } = fresh()
  const metrics = store.db.prepare('SELECT COUNT(*) AS n FROM metric_definition').get().n
  const protocols = store.db.prepare('SELECT COUNT(*) AS n FROM measure_protocol').get().n
  assert.equal(metrics, 22)
  assert.equal(metrics, METRICS.length)
  assert.equal(protocols, PROTOCOLS.length)
  assert.equal(seedDictionary(store.db).inserted, 0, '重复写入必须是 0 行')
  store.close()
})

test('看法不是结论：写入恒为 0，传结论参数报错，绕过接口也会被库拒绝', () => {
  const { store, subject } = fresh()
  const vp = store.addViewpoint({ subjectId: subject.id, text: '我担心复发', recordedOn: '2026-10-17' })
  assert.equal(vp.is_conclusion, 0)
  assert.throws(
    () => store.addViewpoint({ subjectId: subject.id, text: 'x', recordedOn: '2026-10-17', isConclusion: 1 }),
    /恒为 0/,
  )
  assert.throws(
    () => store.db.prepare(`INSERT INTO viewpoint (id, subject_id, text, speaker_role, recorded_on, is_conclusion)
      VALUES ('vp_x', ?, '绕过接口', 'patient', '2026-10-17', 1)`).run(subject.id),
    /CHECK constraint failed/,
  )
  store.close()
})

test('角色只有 patient / caregiver，doctor 会被库拒绝', () => {
  const { store, ws } = fresh()
  assert.throws(
    () => store.db.prepare(`INSERT INTO subject (id, workspace_id, role, display_name, created_at)
      VALUES ('sub_x', ?, 'doctor', '医生', '2026-10-17T00:00:00Z')`).run(ws.id),
    /CHECK constraint failed/,
  )
  store.close()
})

test('更正链：新增版本、旧版 superseded、历史可取、审计有记录', () => {
  const { store, subject } = fresh()
  const v1 = store.addRecord({ subjectId: subject.id, kind: 'lab', occurredOn: '2026-09-01' })
  const v2 = store.supersedeRecord(v1.id, { occurredOn: '2026-09-02', note: '日期记错，更正' })

  assert.equal(v2.version, 2)
  assert.equal(v2.supersedes_id, v1.id)
  const old = store.db.prepare('SELECT * FROM record WHERE id = ?').get(v1.id)
  assert.equal(old.status, 'superseded')
  assert.equal(old.occurred_on, '2026-09-01', '旧值必须原样保留，不能被覆盖')

  const current = store.currentRecords(subject.id)
  assert.equal(current.length, 1)
  assert.equal(current[0].id, v2.id)

  assert.deepEqual(store.recordHistory(v2.id).map((r) => r.version), [1, 2])
  assert.equal(store.changesFor('record', v2.id).length, 1)
  assert.equal(store.changesFor('record', v2.id)[0].action, 'supersede')

  assert.throws(() => store.supersedeRecord(v2.id, { version: 9 }), /不能改这些字段/)
  assert.throws(() => store.supersedeRecord(v2.id, { subject_id: 'other' }), /不能改这些字段/)
  store.close()
})

test('已被取代的记录不能再更正（不会出现分叉链）', () => {
  const { store, subject } = fresh()
  const v1 = store.addRecord({ subjectId: subject.id, kind: 'note', occurredOn: '2026-09-10' })
  store.supersedeRecord(v1.id, { note: 'v2' })
  assert.throws(() => store.supersedeRecord(v1.id, { note: 'v3' }), /只有 accepted/)
  store.close()
})

test('四点位：差值写入时算、最大差读取时算，缺健侧不生成差值', () => {
  const { store, subject } = fresh()
  const set = store.addArmSet({
    subjectId: subject.id,
    measuredOn: '2026-10-15',
    points: [
      { point: 'wrist', affected: 17.2, healthy: 16.1 },
      { point: 'forearm_mid', affected: 23.5, healthy: 21.6 },
      { point: 'above_elbow_10', affected: 28.4, healthy: 26.2 },
      { point: 'below_axilla_10', affected: 32.1, healthy: 29.9 },
    ],
  })
  assert.deepEqual(set.points.map((p) => p.derived), [1.1, 1.9, 2.2, 2.2])
  assert.equal(set.maxDiff, 2.2)
  assert.equal(store.latestArmDiff(subject.id).maxDiff, 2.2)

  const partial = store.addArmSet({
    subjectId: subject.id,
    measuredOn: '2026-10-16',
    points: [{ point: 'wrist', affected: 17.4, healthy: null }],
  })
  assert.equal(partial.points[0].derived, null)
  assert.equal(partial.maxDiff, null, '缺健侧时最大差为 NULL，而不是 0 或插值')
  store.close()
})

test('四点位：侧别未声明就拒绝写，不猜患侧', () => {
  const store = openStore()
  const ws = store.createWorkspace()
  const subject = store.createSubject({ workspaceId: ws.id, displayName: '未声明侧别' })
  assert.throws(
    () => store.addArmSet({ subjectId: subject.id, measuredOn: '2026-10-15', points: [{ point: 'wrist', affected: 17, healthy: 16 }] }),
    /未声明患侧/,
  )
  const left = store.createSubject({ workspaceId: ws.id, displayName: '左侧', laterality: 'left' })
  assert.throws(() => store.addArmSet({ subjectId: left.id, measuredOn: '2026-10-15', points: [] }), /至少记录一个点位/)
  assert.throws(
    () => store.addArmSet({ subjectId: left.id, measuredOn: '2026-10-15', points: Array.from({ length: 5 }, (_, i) => ({ point: `p${i}`, affected: 20, healthy: 19 })) }),
    /最多 4 个点/,
  )
  store.close()
})

test('检验值：不在字典里的指标写不进去（外键兜底）', () => {
  const { store, subject } = fresh()
  const obs = store.addObservation({ subjectId: subject.id, metricCode: 'ca153', observedOn: '2026-10-01', value: 22.4 })
  assert.equal(obs.unit, 'U/mL', '单位取字典，不靠调用方猜')
  assert.throws(
    () => store.addObservation({ subjectId: subject.id, metricCode: 'not_a_metric', observedOn: '2026-10-01', value: 1 }),
    /不在字典里/,
  )
  store.close()
})

test('老库升级：已执行 0001 的库只补 0002，不重建表、不改旧数据', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL, checksum TEXT NOT NULL)`)
  const sql = readFileSync(new URL('../schema/0001_initial.sql', import.meta.url), 'utf8')
  db.exec(sql)
  db.prepare('INSERT INTO schema_version (version, name, applied_at, checksum) VALUES (1, ?, ?, ?)')
    .run('0001_initial.sql', '2026-10-17', sha256(sql))
  db.prepare("INSERT INTO workspace (id, name, schema_version, created_at) VALUES ('ws_old', '老库', '0001', '2026-10-17T00:00:00Z')").run()

  const result = migrate(db)
  assert.deepEqual(result.executed, ['0002_candidate_dates.sql', '0003_subject_is_demo.sql'], '只执行新增的迁移')
  const cols = db.prepare('PRAGMA table_info(candidate)').all().map((c) => c.name)
  assert.ok(cols.includes('occurred_on'))
  assert.equal(db.prepare("SELECT name FROM workspace WHERE id='ws_old'").get().name, '老库', '旧数据原样保留')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_version').get().n, 3)  // 0001 + 0002 + 0003
  db.close()
})
