/**
 * 本机数据层（M1）。只做"能安全写入与读出"的最小集合，不含界面、不含派生视图渲染。
 *
 * 四条契约在这里落地（G3 已签认：都按 A）：
 * 1. 看法不是结论：`addViewpoint` 不接收结论参数，写库恒为 `is_conclusion = 0`（库层还有 CHECK 兜底）；
 * 2. 四点位可缺测：`addArmSet` 允许 1–4 个点位，缺健侧值时 `derived_diff_num` 为 NULL，不插值、不补 0；
 * 3. 更正不覆盖：`supersedeRecord` 新增一行并把旧行标 `superseded`，不改历史值；
 * 4. 事实四层不合并：这里只写 `record` 及其下游 `observation` / `measurement`，候选层与原件层各有自己的表。
 */
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { migrate } from './migrate.js'
import { seedDictionary } from './dictionary.js'

const nowIso = () => new Date().toISOString()
const newId = (prefix) => `${prefix}_${randomUUID()}`
const round3 = (n) => Math.round(n * 1000) / 1000

const IMMUTABLE_RECORD_FIELDS = ['id', 'subject_id', 'version', 'status', 'supersedes_id', 'recorded_at']

export class Store {
  #depth = 0

  constructor(db) {
    this.db = db
  }

  close() {
    this.db.close()
  }

  /**
   * 嵌套安全的事务：只有最外层真正 BEGIN/COMMIT。
   * 导入核对时"写事实层 + 改候选状态"必须同生共死，而 addRecord 自己也开事务，
   * 直接嵌套会报 "cannot start a transaction within a transaction"。
   */
  withTransaction(fn) {
    if (this.#depth === 0) this.db.exec('BEGIN')
    this.#depth += 1
    try {
      const result = fn()
      this.#depth -= 1
      if (this.#depth === 0) this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.#depth = 0
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  /* ---------- 空间与主体 ---------- */

  createWorkspace({ name = '我的资料', settings = {} } = {}) {
    const row = { id: newId('ws'), name, schema_version: '0001', created_at: nowIso(), settings_json: JSON.stringify(settings) }
    this.db.prepare('INSERT INTO workspace (id, name, schema_version, created_at, settings_json) VALUES (?, ?, ?, ?, ?)')
      .run(row.id, row.name, row.schema_version, row.created_at, row.settings_json)
    return row
  }

  createSubject({ workspaceId, displayName, role = 'patient', birthYear = null, sex = 'unknown', laterality = 'unknown', menopause = null }) {
    if (!workspaceId) throw new Error('缺少 workspaceId：档案必须挂在明确的工作区下')
    const row = {
      id: newId('sub'), workspace_id: workspaceId, role, display_name: displayName,
      birth_year: birthYear, sex, laterality, menopause, created_at: nowIso(),
    }
    this.db.prepare(`INSERT INTO subject
      (id, workspace_id, role, display_name, birth_year, sex, laterality, menopause, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(row.id, row.workspace_id, row.role, row.display_name, row.birth_year, row.sex, row.laterality, row.menopause, row.created_at)
    return row
  }

  getSubject(id) {
    return this.db.prepare('SELECT * FROM subject WHERE id = ?').get(id) ?? null
  }

  /** 声明的患侧；没声明时返回 null（不做推断）。 */
  affectedSide(subjectId) {
    const s = this.getSubject(subjectId)
    if (!s) throw new Error(`档案不存在：${subjectId}`)
    return s.laterality === 'left' || s.laterality === 'right' ? s.laterality : null
  }

  /* ---------- 看法（不是结论） ---------- */

  addViewpoint({ subjectId, text, speakerRole = 'patient', aboutCode = null, recordedOn, isPrivate = false, isConclusion }) {
    if (isConclusion !== undefined) {
      throw new Error('看法不接受"结论"参数：viewpoint.is_conclusion 恒为 0（SPEC §5.4 / D16）')
    }
    if (!text?.trim()) throw new Error('看法不能为空')
    const id = newId('vp')
    this.db.prepare(`INSERT INTO viewpoint
      (id, subject_id, text, speaker_role, about_code, recorded_on, is_conclusion, is_private)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
      .run(id, subjectId, text.trim(), speakerRole, aboutCode, recordedOn, isPrivate ? 1 : 0)
    return this.db.prepare('SELECT * FROM viewpoint WHERE id = ?').get(id)
  }

  listViewpoints(subjectId, { includePrivate = true } = {}) {
    const sql = `SELECT * FROM viewpoint WHERE subject_id = ? AND withdrawn_at IS NULL
      ${includePrivate ? '' : 'AND is_private = 0'} ORDER BY recorded_on DESC`
    return this.db.prepare(sql).all(subjectId)
  }

  /* ---------- 记录与更正链 ---------- */

  addRecord({
    subjectId, kind, occurredOn, sourceKind = 'patient_reported',
    sourceDocumentId = null, note = null, recordedAt = nowIso(),
  }) {
    const id = newId('rec')
    const snapshot = { id, subject_id: subjectId, kind, occurred_on: occurredOn, recorded_at: recordedAt, source_kind: sourceKind, status: 'accepted', version: 1, supersedes_id: null, note }
    this.withTransaction(() => {
      this.db.prepare(`INSERT INTO record
        (id, subject_id, kind, occurred_on, recorded_at, source_kind, source_document_id, status, version, supersedes_id, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', 1, NULL, ?)`)
        .run(id, subjectId, kind, occurredOn, recordedAt, sourceKind, sourceDocumentId, note)
      this.#logChange('record', id, 'create', null, snapshot)
    })
    return this.db.prepare('SELECT * FROM record WHERE id = ?').get(id)
  }

  currentRecords(subjectId) {
    return this.db.prepare(`SELECT * FROM record
      WHERE subject_id = ? AND status = 'accepted' ORDER BY occurred_on DESC, recorded_at DESC`).all(subjectId)
  }

  /** 一条记录所在的完整链，按 version 升序（旧 → 新）。 */
  recordHistory(recordId) {
    const chain = []
    let cursor = this.db.prepare('SELECT * FROM record WHERE id = ?').get(recordId)
    if (!cursor) throw new Error(`记录不存在：${recordId}`)
    while (cursor) {
      chain.push(cursor)
      cursor = cursor.supersedes_id
        ? this.db.prepare('SELECT * FROM record WHERE id = ?').get(cursor.supersedes_id)
        : null
    }
    return chain.reverse()
  }

  /**
   * 更正：新增一版并把旧版置 `superseded`。禁止原地改历史值。
   * changes 只能改内容字段（occurred_on / kind / source_kind / note / reviewed_by …）。
   */
  supersedeRecord(recordId, changes = {}) {
    const bad = Object.keys(changes).filter((k) => IMMUTABLE_RECORD_FIELDS.includes(k))
    if (bad.length) throw new Error(`更正不能改这些字段：${bad.join(', ')}（要改就新增版本）`)

    const old = this.db.prepare('SELECT * FROM record WHERE id = ?').get(recordId)
    if (!old) throw new Error(`记录不存在：${recordId}`)
    if (old.status !== 'accepted') throw new Error(`只有 accepted 的记录可以更正，当前是 ${old.status}`)

    const next = { ...old, ...changes, version: old.version + 1, supersedes_id: recordId, status: 'accepted', recorded_at: nowIso() }
    const newRecordId = newId('rec')
    this.withTransaction(() => {
      this.db.prepare(`UPDATE record SET status = 'superseded' WHERE id = ?`).run(recordId)
      this.db.prepare(`INSERT INTO record
        (id, subject_id, kind, occurred_on, recorded_at, source_kind, source_document_id, status, version, supersedes_id, reviewed_by, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?)`)
        .run(newRecordId, next.subject_id, next.kind, next.occurred_on, next.recorded_at, next.source_kind,
          next.source_document_id, next.version, recordId, next.reviewed_by, next.note)
      this.#logChange('record', newRecordId, 'supersede', old, { ...next, id: newRecordId })
    })
    return this.db.prepare('SELECT * FROM record WHERE id = ?').get(newRecordId)
  }

  /* ---------- 检验值 ---------- */

  addObservation({
    subjectId, metricCode, metricVersion = 1, observedOn, value, unit = null,
    labMethod = null, refLow = null, refHigh = null, flag = null, recordId = null,
  }) {
    const def = this.metric(metricCode, metricVersion)
    const id = newId('obs')
    /* 方法留空一律存 NULL：'' 与 NULL 在"可比性跟方法走"的判断里是同一个意思，
     * 存成两种值会让序列凭空多断一段（A10）。 */
    const method = typeof labMethod === 'string' && labMethod.trim() ? labMethod.trim() : null
    this.db.prepare(`INSERT INTO observation
      (id, subject_id, metric_code, metric_version, record_id, observed_on, value_num, unit, lab_method, ref_low, ref_high, flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, subjectId, metricCode, metricVersion, recordId, observedOn, value, unit ?? def.unit, method, refLow, refHigh, flag)
    return this.db.prepare('SELECT * FROM observation WHERE id = ?').get(id)
  }

  metric(code, version = null) {
    const row = version
      ? this.db.prepare('SELECT * FROM metric_definition WHERE code = ? AND version = ?').get(code, version)
      : this.db.prepare('SELECT * FROM metric_definition WHERE code = ? ORDER BY version DESC LIMIT 1').get(code)
    if (!row) throw new Error(`指标不在字典里：${code}${version ? ` v${version}` : ''}`)
    return row
  }

  /* ---------- 四点位臂围 ---------- */

  /**
   * 一次测量 = arm_set 1 行 + 每个点位 1 行 measurement。
   * points: [{ point, affected, healthy }]，healthy 可缺（缺测就不算差值）。
   */
  addArmSet({
    subjectId, measuredOn, points, protocolId = 'proto_arm_circ_4pt_v1',
    assessorRole = 'patient', recordId = null, metricCode = 'arm_diff', metricVersion = 1, note = null,
  }) {
    const side = this.affectedSide(subjectId)
    if (!side) {
      throw new Error('档案未声明患侧（laterality=unknown），无法判定患健侧；请先在档案里选左或右')
    }
    if (!Array.isArray(points) || points.length === 0) throw new Error('至少记录一个点位')
    if (points.length > 4) throw new Error('四点位最多 4 个点')

    const def = this.metric(metricCode, metricVersion)
    const setName = newId('arm')
    const rows = points.map((p) => {
      const affected = Number(p.affected)
      if (!Number.isFinite(affected)) throw new Error(`点位 ${p.point} 的患侧值不是数字`)
      const paired = p.healthy === null || p.healthy === undefined ? null : Number(p.healthy)
      if (paired !== null && !Number.isFinite(paired)) throw new Error(`点位 ${p.point} 的健侧值不是数字`)
      return {
        id: newId('meas'),
        point: p.point,
        side,
        value: affected,
        paired,
        derived: paired === null ? null : round3(affected - paired),
        unit: p.unit ?? def.unit,
      }
    })

    this.withTransaction(() => {
      this.db.prepare(`INSERT INTO arm_set (id, subject_id, measured_on, protocol_id, assessor_role, record_id, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(setName, subjectId, measuredOn, protocolId, assessorRole, recordId, note)
      const insert = this.db.prepare(`INSERT INTO measurement
        (id, subject_id, set_id, metric_code, metric_version, record_id, measured_on, point, side,
         value_num, unit, paired_value_num, derived_diff_num, protocol_id, assessor_role, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      for (const r of rows) {
        insert.run(r.id, subjectId, setName, metricCode, metricVersion, recordId, measuredOn, r.point, r.side,
          r.value, r.unit, r.paired, r.derived, protocolId, assessorRole, null)
      }
    })

    return { id: setName, maxDiff: this.armSetMaxDiff(setName), points: rows }
  }

  /** 一次测量的最大差值：读取时算，不落库；没有成对值时为 null。 */
  armSetMaxDiff(setId) {
    const row = this.db.prepare('SELECT MAX(derived_diff_num) AS max_diff FROM measurement WHERE set_id = ?').get(setId)
    return row?.max_diff ?? null
  }

  /** 最近一次四点位测量的最大差，供看板/趋势头部使用。 */
  latestArmDiff(subjectId) {
    const set = this.db.prepare('SELECT * FROM arm_set WHERE subject_id = ? ORDER BY measured_on DESC, rowid DESC LIMIT 1').get(subjectId)
    if (!set) return null
    return { measuredOn: set.measured_on, setId: set.id, maxDiff: this.armSetMaxDiff(set.id) }
  }

  /* ---------- 阶段 / 治疗 / 症状（M2 主线要用到的最小写入） ---------- */

  /** 阶段是用户自己声明的，不是系统推断的；换阶段是新增一行，不覆盖历史。 */
  addStage({ subjectId, stage, declaredOn, source = 'self_declared', note = null }) {
    const id = newId('stg')
    this.db.prepare(`INSERT INTO subject_stage (id, subject_id, stage, declared_on, source, note)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, subjectId, stage, declaredOn, source, note)
    return this.db.prepare('SELECT * FROM subject_stage WHERE id = ?').get(id)
  }

  stagesFor(subjectId) {
    return this.db.prepare('SELECT * FROM subject_stage WHERE subject_id = ? ORDER BY declared_on').all(subjectId)
  }

  /**
   * 治疗事件。计划与实际分开存（A13：完成一项安排不自动生成治疗事件）。
   * `status='completed'` 时只看 actualStart/actualEnd，不看 planned。
   */
  addTreatment({
    subjectId, kind, name, laterality = 'na', axillaryProcedure = null, radiationField = null,
    plannedStart = null, plannedEnd = null, actualStart = null, actualEnd = null,
    status = 'planned', recordId = null, note = null,
  }) {
    const id = newId('tx')
    this.db.prepare(`INSERT INTO treatment_event
      (id, subject_id, kind, name, laterality, axillary_procedure, radiation_field,
       planned_start, planned_end, actual_start, actual_end, status, record_id, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, subjectId, kind, name, laterality, axillaryProcedure, radiationField,
        plannedStart, plannedEnd, actualStart, actualEnd, status, recordId, note)
    return this.db.prepare('SELECT * FROM treatment_event WHERE id = ?').get(id)
  }

  treatmentsFor(subjectId) {
    return this.db.prepare(`SELECT * FROM treatment_event WHERE subject_id = ?
      ORDER BY COALESCE(actual_start, planned_start)`).all(subjectId)
  }

  /** 症状强度 0–3，是主观强度，不是分级诊断。`is_private` 的记录不进趋势与导出（A12）。 */
  addSymptom({
    subjectId, code, level, occurredOn, bodySide = 'na', note = null,
    subjectRole = 'patient', isPrivate = false, recordId = null,
  }) {
    if (!Number.isInteger(level) || level < 0 || level > 3) throw new Error('症状强度只能是 0–3 的整数')
    const id = newId('sym')
    this.db.prepare(`INSERT INTO symptom_entry
      (id, subject_id, record_id, code, level, occurred_on, body_side, note, subject_role, is_private)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, subjectId, recordId, code, level, occurredOn, bodySide, note, subjectRole, isPrivate ? 1 : 0)
    return this.db.prepare('SELECT * FROM symptom_entry WHERE id = ?').get(id)
  }

  symptomsFor(subjectId, { includePrivate = true } = {}) {
    const sql = `SELECT * FROM symptom_entry WHERE subject_id = ?
      ${includePrivate ? '' : 'AND is_private = 0'} ORDER BY occurred_on DESC`
    return this.db.prepare(sql).all(subjectId)
  }

  /* ---------- 审计 ---------- */

  #logChange(entity, entityId, action, before, after, actorRole = 'patient') {
    this.db.prepare(`INSERT INTO change_log (id, entity, entity_id, action, actor_role, before_json, after_json, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId('log'), entity, entityId, action, actorRole,
        before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, nowIso())
  }

  changesFor(entity, entityId) {
    return this.db.prepare('SELECT * FROM change_log WHERE entity = ? AND entity_id = ? ORDER BY at').all(entity, entityId)
  }
}

/**
 * 打开本机库。`:memory:` 用于测试；真实文件由调用方传入**用户选定的资料目录**下的路径，
 * 这里不猜路径、不自动建目录（A21/A22：拒绝主目录，不静默建目录）。
 */
export function openStore({ file = ':memory:', seed = true, runMigration = true } = {}) {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA foreign_keys = ON')
  if (runMigration) migrate(db)
  if (seed) seedDictionary(db)
  return new Store(db)
}
