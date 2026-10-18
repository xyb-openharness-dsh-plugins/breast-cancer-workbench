/**
 * 工作台应用核心（M2/M3/M4 的本地实现）。
 *
 * 这一层只依赖 `node:sqlite` 与 `node:fs`，不依赖 HTTP，也不依赖 DSH 宿主：
 * 独立启动（`npm start`）与接入 DSH 时跑的是同一份逻辑，接线在 `dsh/server.js`。
 *
 * 三条不可让步的边界：
 * 1. **不静默建目录**：只有用户在界面上显式选择并确认后，`openWorkspace()` 才创建目录与库（A22）；
 * 2. **不猜路径**：工作区由调用方传入，拒绝根目录、用户主目录、桌面根目录（A21）；
 * 3. **私密记录默认不出**：心理与性健康内容只在心理页返回，导出必须显式选入（A12/A27）。
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, stat, access } from 'node:fs/promises'
import { constants as FS } from 'node:fs'
import { basename, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { openStore } from './store.js'
import { createImportService, ImportError, assertMedicalDate, DOCUMENT_KINDS } from './import.js'
import { extractCandidates } from './labparse.js'
import { resolveToken, maskToken } from './mineru.js'
import { seedDemo, listDemos, clearDemo, DEMO_DATASETS } from './demo.js'
import {
  overview, documentList, documentCounts, metricSeries, metricCards, armHistory, armSeries,
  symptomList, questionList, taskList, viewpointList, treatmentList, diagnosisList,
  careList, renderVisitMarkdown, exportFingerprint, hashOf, exportHistory,
  subjectState, STAGE_LABELS, CATEGORY, POINT_LABELS, ARM_POINTS,
  TREATMENT_KIND_LABELS, SYMPTOM_LABELS, TASK_KIND_LABELS, CARE_KIND_LABELS,
} from './readmodels.js'

const DB_NAME = 'pinkypal.sqlite'
const DOC_DIR = 'documents'
const ACTIVE_FILE = 'active.json'
const MAX_UPLOAD = 40 * 1024 * 1024

export class AppError extends Error {
  constructor(code, message, status = 400, detail = null) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.detail = detail
  }
}

/* ---------------- 路径校验 ---------------- */

/* `/tmp` 与 `/var` 也在内：临时目录会被系统清理，病历放在那里等于没有备份。
 * macOS 的 `os.tmpdir()` 落在 `/var/folders/…`，所以测试与试跑都不能用系统临时目录，
 * 要用主目录下的专用子目录（见 test/workbench.test.mjs）。 */
const SYSTEM_ROOTS = ['/System', '/Library', '/usr', '/bin', '/sbin', '/etc', '/private', '/var', '/tmp', '/dev', '/opt']

/**
 * 资料目录必须是一个"用户自己的、可写的子目录"。
 * 拒绝规则照 SPEC A22：根目录、用户主目录、桌面根目录、系统目录，以及 Windows 盘根。
 */
export function validateWorkspacePath(input, { home = homedir() } = {}) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new AppError('EMPTY_PATH', '请填写资料目录的完整路径', 400)
  }
  const raw = input.trim()
  if (!isAbsolute(raw)) {
    throw new AppError('RELATIVE_PATH', '需要绝对路径（例如 /Users/你的名字/Documents/PinkyPal）', 400)
  }
  const dir = resolve(raw)
  if (dir === sep || /^[a-zA-Z]:[\\/]?$/.test(dir)) {
    throw new AppError('ROOT_PATH', '不能把磁盘根目录当作资料目录', 400)
  }
  const homeDir = resolve(home)
  if (dir === homeDir) {
    throw new AppError('HOME_PATH', '不能直接用用户主目录；请在主目录下新建一个专用子目录', 400)
  }
  if (dir === resolve(homeDir, 'Desktop')) {
    throw new AppError('DESKTOP_PATH', '桌面根目录不适合放资料；请选桌面下的子目录或其它位置', 400)
  }
  if (SYSTEM_ROOTS.some((root) => dir === root || dir.startsWith(`${root}${sep}`))) {
    throw new AppError('SYSTEM_PATH', '系统目录不可写，也不该放个人资料', 400)
  }
  if (dir.length > 200) throw new AppError('PATH_TOO_LONG', '路径过长，换一个更短的目录', 400)
  return dir
}

const assertInside = (root, candidate) => {
  const rel = candidate.slice(root.length)
  return rel === '' || rel.startsWith(sep)
}

/* ---------------- 工作台 ---------------- */

export class Workbench {
  #dir
  #store
  #imports
  #subjectId
  #settings

  constructor({ dir, store, subjectId, settings }) {
    this.#dir = dir
    this.#store = store
    this.#imports = createImportService(store)
    this.#subjectId = subjectId
    this.#settings = settings ?? {}
  }

  get dir() { return this.#dir }
  get store() { return this.#store }
  get imports() { return this.#imports }
  get subjectId() { return this.#subjectId }

  /* ---------- 打开 / 创建 ---------- */

  /**
   * 打开（必要时创建）一个工作区。目录已存在时只补库；不存在时按用户确认创建。
   * 返回 `created`，供界面如实显示"刚刚新建"而不是假装一直在。
   */
  static async openWorkspace({ dir: inputDir, create = true, subjectName = '我' } = {}) {
    const dir = validateWorkspacePath(inputDir)
    let created = false
    try {
      const st = await stat(dir)
      if (!st.isDirectory()) throw new AppError('NOT_DIRECTORY', '这个路径不是文件夹', 400)
    } catch (error) {
      if (error instanceof AppError) throw error
      if (error.code !== 'ENOENT') throw error
      if (!create) throw new AppError('MISSING_DIR', '这个目录不存在；确认后可以新建', 404)
      await mkdir(dir, { recursive: true })
      created = true
    }
    try {
      await access(dir, FS.W_OK)
    } catch {
      throw new AppError('NOT_WRITABLE', '这个目录不可写，换一个位置', 400)
    }

    const file = join(dir, DB_NAME)
    const hadDb = await fileExists(file)
    const store = openStore({ file })
    const active = await readJson(join(dir, ACTIVE_FILE))
    let subjectId = active?.subjectId ?? null
    let subject = subjectId ? store.getSubject(subjectId) : null
    if (!subject) {
      subject = pickSubject(store)
      subjectId = subject?.id ?? null
    }
    if (!subject) {
      const workspace = store.createWorkspace({ name: subjectName, settings: {} })
      subject = store.createSubject({ workspaceId: workspace.id, displayName: subjectName, laterality: 'unknown' })
      subjectId = subject.id
      await writeJson(join(dir, ACTIVE_FILE), { subjectId })
    }

    const settings = await readJson(join(dir, 'settings.json')) ?? {}
    const wb = new Workbench({ dir, store, subjectId, settings })
    return { workbench: wb, created: created || !hadDb, subject }
  }

  /* ---------- 档案 ---------- */

  state() {
    const subject = subjectState(this.#store, this.#subjectId)
    return {
      ready: true,
      dir: this.#dir,
      subject,
      stages: Object.entries(STAGE_LABELS).map(([code, label]) => ({ code, label })),
      subjects: this.listSubjects(),
      demos: this.listDemoState(),
      settings: {
        mineruConsent: Boolean(this.#settings.mineruConsent),
        mineru: (() => {
          const token = resolveToken()
          return { configured: Boolean(token.token), source: token.source ?? null, masked: token.token ? maskToken(token.token) : null }
        })(),
      },
      capabilities: { mineru: true, localText: true },
    }
  }

  listSubjects() {
    const rows = this.#store.db.prepare(
      `SELECT s.* FROM subject s JOIN workspace w ON w.id = s.workspace_id ORDER BY s.created_at`,
    ).all()
    const demos = this.listDemoState()
    const demoBySubject = new Map(demos.map((d) => [d.subjectId, d]))
    return rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      laterality: r.laterality,
      active: r.id === this.#subjectId,
      demo: demoBySubject.get(r.id) ?? null,
    }))
  }

  setActiveSubject(subjectId) {
    const subject = this.#store.getSubject(subjectId)
    if (!subject) throw new AppError('NO_SUBJECT', '这个档案不存在', 404)
    this.#subjectId = subjectId
    writeJson(join(this.#dir, ACTIVE_FILE), { subjectId }).catch(() => {})
    return subjectState(this.#store, subjectId)
  }

  updateSubject({ displayName, laterality, birthYear } = {}) {
    const current = this.#store.getSubject(this.#subjectId)
    if (!current) throw new AppError('NO_SUBJECT', '档案不存在', 404)
    if (laterality && laterality !== current.laterality) {
      if (!['left', 'right', 'bilateral', 'unknown'].includes(laterality)) {
        throw new AppError('BAD_LATERALITY', '患侧只能是 left / right / bilateral / unknown', 400)
      }
      const measured = this.#store.db.prepare(
        'SELECT COUNT(*) AS n FROM arm_set WHERE subject_id = ?',
      ).get(this.#subjectId).n
      if (measured > 0) {
        throw new AppError(
          'LATERALITY_LOCKED',
          `已有 ${measured} 次上肢测量记录，改患侧会让已存的"患侧 − 健侧"含义翻转。要改请先确认这些记录仍成立`,
          409,
        )
      }
    }
    this.#store.db.prepare(
      `UPDATE subject SET display_name = COALESCE(?, display_name),
         laterality = COALESCE(?, laterality), birth_year = COALESCE(?, birth_year) WHERE id = ?`,
    ).run(
      displayName?.trim() || null,
      laterality ?? null,
      Number.isFinite(birthYear) ? birthYear : null,
      this.#subjectId,
    )
    return subjectState(this.#store, this.#subjectId)
  }

  setSettings(patch) {
    this.#settings = { ...this.#settings, ...patch }
    writeJson(join(this.#dir, 'settings.json'), this.#settings).catch(() => {})
    return this.#settings
  }

  /* ---------- 演示 ---------- */

  listDemoState() {
    const seeded = listDemos(this.#store)
    return DEMO_DATASETS.map((def) => {
      const hit = seeded.find((s) => s.datasetId === def.id)
      return {
        id: def.id,
        label: def.label,
        note: def.note,
        seeded: Boolean(hit),
        subjectId: hit?.subjectId ?? null,
        counts: hit?.counts ?? null,
        gaps: hit?.gaps ?? null,
      }
    })
  }

  seedDemo(datasetId, { activate = true } = {}) {
    const manifest = seedDemo(this.#store, datasetId)
    if (activate) this.setActiveSubject(manifest.subjectId)
    return { ...manifest, demos: this.listDemoState() }
  }

  clearDemo(datasetId) {
    const removed = clearDemo(this.#store, datasetId)
    const stillThere = this.#store.getSubject(this.#subjectId)
    if (!stillThere) {
      const next = pickSubject(this.#store)
      this.#subjectId = next?.id ?? null
      if (next) writeJson(join(this.#dir, ACTIVE_FILE), { subjectId: next.id }).catch(() => {})
    }
    return { ...removed, demos: this.listDemoState() }
  }

  /* ---------- 读模型 ---------- */

  requireSubject() {
    if (!this.#subjectId) throw new AppError('NO_SUBJECT', '还没有档案', 409)
    return this.#subjectId
  }

  overview() {
    const subjectId = this.requireSubject()
    return {
      ...overview(this.#store, subjectId),
      demos: this.listDemoState(),
      newestRecordAt: this.#store.db.prepare('SELECT MAX(recorded_at) AS at FROM record WHERE subject_id = ?').get(subjectId)?.at ?? null,
    }
  }

  metrics() {
    const subjectId = this.requireSubject()
    return {
      series: metricSeries(this.#store, subjectId),
      cards: metricCards(this.#store, subjectId),
      categories: Object.entries(CATEGORY).map(([code, meta]) => ({ code, ...meta })),
    }
  }

  arm() {
    const subjectId = this.requireSubject()
    return {
      ...armHistory(this.#store, subjectId),
      series: armSeries(this.#store, subjectId),
      pointLabels: POINT_LABELS,
      pointOrder: ARM_POINTS,
    }
  }

  symptoms({ includePrivate = false } = {}) {
    return { list: symptomList(this.#store, this.requireSubject(), { includePrivate }) }
  }

  questions() {
    return { list: questionList(this.#store, this.requireSubject()) }
  }

  tasks() {
    return { list: taskList(this.#store, this.requireSubject()), kinds: TASK_KIND_LABELS }
  }

  /** 本人的"我的关注"页：这里要看全（含私密），因为看的人就是记录的人。 */
  viewpoints() {
    return {
      list: viewpointList(this.#store, this.requireSubject(), { includePrivate: true }),
      privateNote: '标为私密的看法不会进一图秀、摘要与导出；导出时要逐次勾选。',
    }
  }

  documents() {
    const subjectId = this.requireSubject()
    const list = documentList(this.#store, subjectId)
    return { list, counts: documentCounts(list), kinds: DOCUMENT_KINDS }
  }

  draft() {
    const subjectId = this.requireSubject()
    const draft = this.#imports.draftFor(subjectId)
    return {
      ...draft,
      subjectId,
      labels: {
        metric: '检验指标',
        treatment: '治疗事件',
      },
    }
  }

  clinical() {
    const subjectId = this.requireSubject()
    return {
      treatments: treatmentList(this.#store, subjectId),
      treatmentKinds: TREATMENT_KIND_LABELS,
      diagnoses: diagnosisList(this.#store, subjectId),
      // 试验线索一期只做界面演示：不连真实登记库，也不生成匹配结论
      trials: {
        connected: false,
        note: '一期没有接入临床试验登记库；这里不显示真实研究，也不做入组资格判断。',
        sample: {
          id: 'SAMPLE-A',
          title: '示例条目（虚构，不是真实研究）',
          status: '未接入真实信息',
          criteria: '参与条件以登记原文与研究中心答复为准',
        },
      },
    }
  }

  care({ includePrivate = false } = {}) {
    const subjectId = this.requireSubject()
    const entries = careList(this.#store, subjectId, { includePrivate })
    return {
      entries,
      kinds: CARE_KIND_LABELS,
      drains: this.drainSeries(),
      symptoms: symptomList(this.#store, subjectId),
    }
  }

  /** 引流量：存在 observation(drain_vol)，value=0 表示当日拔管。 */
  drainSeries() {
    const subjectId = this.requireSubject()
    const rows = this.#store.db.prepare(
      `SELECT o.*, r.note AS r_note FROM observation o
       LEFT JOIN record r ON r.id = o.record_id
       WHERE o.subject_id = ? AND o.metric_code = 'drain_vol'
       ORDER BY o.observed_on DESC, o.rowid DESC`,
    ).all(subjectId)
    return rows.map((r) => ({
      id: r.id,
      date: r.observed_on,
      value: r.value_num,
      unit: r.unit,
      note: r.r_note ?? null,
      pulled: r.value_num === 0,
    }))
  }

  nutrition() {
    const subjectId = this.requireSubject()
    const weight = metricSeries(this.#store, subjectId).find((s) => s.code === 'weight') ?? null
    return {
      weight,
      entries: careList(this.#store, subjectId, { includePrivate: true, kinds: ['nutrition'] }),
    }
  }

  mind() {
    const subjectId = this.requireSubject()
    return {
      entries: careList(this.#store, subjectId, { includePrivate: true, kinds: ['mind'] }),
      privateNote: '这里的记录默认不进一图秀、摘要与导出；只有你逐次勾选才会进入分享。',
    }
  }

  exports() {
    return { list: exportHistory(this.#store, this.requireSubject()) }
  }

  /* ---------- 写动作 ---------- */

  setStage(stage) {
    if (!STAGE_LABELS[stage]) throw new AppError('BAD_STAGE', `阶段只能是：${Object.keys(STAGE_LABELS).join(' / ')}`, 400)
    const subjectId = this.requireSubject()
    const today = new Date().toISOString().slice(0, 10)
    const row = this.#store.addStage({ subjectId, stage, declaredOn: today })
    return { stage: { code: row.stage, label: STAGE_LABELS[row.stage], declaredOn: row.declared_on } }
  }

  addTask({ title, dueOn = null, kind = 'self', detail = null }) {
    if (!title?.trim()) throw new AppError('EMPTY_TITLE', '安排内容不能为空', 400)
    if (!TASK_KIND_LABELS[kind]) throw new AppError('BAD_TASK_KIND', '安排类型不对', 400)
    // 待办是"将要发生的事"，允许未来日期；这里只校验它是真日期
    if (dueOn) assertPlanDate(dueOn)
    const id = `task_${randomUUID()}`
    const now = new Date().toISOString()
    this.#store.db.prepare(`INSERT INTO task (id, subject_id, title, detail, due_on, kind, owner_role, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'patient', 'open', ?)`)
      .run(id, this.requireSubject(), title.trim(), detail, dueOn, kind, now)
    return { task: taskList(this.#store, this.requireSubject()).find((t) => t.id === id) }
  }

  toggleTask(taskId) {
    const row = this.#store.db.prepare('SELECT * FROM task WHERE id = ? AND subject_id = ?')
      .get(taskId, this.requireSubject())
    if (!row) throw new AppError('NO_TASK', '这条安排不存在', 404)
    if (row.status === 'open') {
      this.#store.db.prepare("UPDATE task SET status='done', completed_at=? WHERE id = ?")
        .run(new Date().toISOString(), taskId)
    } else {
      this.#store.db.prepare("UPDATE task SET status='open', completed_at=NULL WHERE id = ?").run(taskId)
    }
    // 完成待办不生成治疗事件（A13）：这里只动 task 表
    return { task: taskList(this.#store, this.requireSubject()).find((t) => t.id === taskId) }
  }

  addQuestion({ text, kind = 'fact' }) {
    if (!text?.trim()) throw new AppError('EMPTY_TEXT', '问题不能为空', 400)
    if (!['fact', 'view'].includes(kind)) throw new AppError('BAD_KIND', '问题类型只能是 fact / view', 400)
    const id = `q_${randomUUID()}`
    const now = new Date().toISOString()
    this.#store.db.prepare(`INSERT INTO question
      (id, subject_id, text, version, kind, status, include_in_export, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, 'open', 1, ?, ?)`)
      .run(id, this.requireSubject(), text.trim(), kind, now, now)
    return { question: questionList(this.#store, this.requireSubject()).find((q) => q.id === id) }
  }

  /** 改文本 = 新增一版（问题有版本，不原地覆盖）。 */
  updateQuestion(questionId, { text, status, includeInExport } = {}) {
    const current = this.#store.db.prepare(
      'SELECT * FROM question WHERE id = ? AND subject_id = ?',
    ).get(questionId, this.requireSubject())
    if (!current) throw new AppError('NO_QUESTION', '这个问题不存在', 404)
    const now = new Date().toISOString()

    if (text !== undefined && text.trim() && text.trim() !== current.text) {
      const nextId = `q_${randomUUID()}`
      this.#store.withTransaction(() => {
        this.#store.db.prepare("UPDATE question SET status = 'dropped', updated_at = ? WHERE id = ?")
          .run(now, questionId)
        this.#store.db.prepare(`INSERT INTO question
          (id, subject_id, text, version, supersedes_id, kind, status, include_in_export, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(nextId, this.requireSubject(), text.trim(), current.version + 1, questionId,
            current.kind, current.status === 'dropped' ? 'open' : current.status,
            includeInExport === undefined ? current.include_in_export : (includeInExport ? 1 : 0),
            current.created_at, now)
      })
      return { question: questionList(this.#store, this.requireSubject()).find((q) => q.id === nextId) }
    }

    const nextStatus = status ?? current.status
    if (!['open', 'asked', 'answered', 'dropped'].includes(nextStatus)) {
      throw new AppError('BAD_STATUS', '问题状态不合法', 400)
    }
    this.#store.db.prepare(
      'UPDATE question SET status = ?, include_in_export = ?, updated_at = ? WHERE id = ?',
    ).run(
      nextStatus,
      includeInExport === undefined ? current.include_in_export : (includeInExport ? 1 : 0),
      now, questionId,
    )
    return { question: questionList(this.#store, this.requireSubject()).find((q) => q.id === questionId) }
  }

  addViewpoint({ text, speakerRole = 'patient', recordedOn = null, isPrivate = false }) {
    if (!text?.trim()) throw new AppError('EMPTY_TEXT', '写一句话再保存', 400)
    const today = recordedOn ?? new Date().toISOString().slice(0, 10)
    assertDate(today, '记录日期')
    const row = this.#store.addViewpoint({
      subjectId: this.requireSubject(),
      text,
      speakerRole,
      recordedOn: today,
      isPrivate,
    })
    return {
      viewpoint: viewpointList(this.#store, this.requireSubject(), { includePrivate: true }).find((v) => v.id === row.id),
    }
  }

  withdrawViewpoint(viewpointId) {
    this.#store.db.prepare('UPDATE viewpoint SET withdrawn_at = ? WHERE id = ? AND subject_id = ?')
      .run(new Date().toISOString(), viewpointId, this.requireSubject())
    return { withdrawn: viewpointId }
  }

  addSymptom({ code, level, occurredOn, note = null, bodySide = 'na', isPrivate = false }) {
    if (!SYMPTOM_LABELS[code]) throw new AppError('BAD_SYMPTOM', '症状类型不在列表里', 400)
    assertDate(occurredOn, '症状日期')
    const row = this.#store.addSymptom({
      subjectId: this.requireSubject(), code, level: Number(level),
      occurredOn, note, bodySide, isPrivate,
    })
    return { symptom: symptomList(this.#store, this.requireSubject(), { includePrivate: true }).find((s) => s.id === row.id) }
  }

  addObservation({ metricCode, occurredOn, value, unit = null, method = null, note = null }) {
    assertDate(occurredOn, '记录日期')
    const num = Number(value)
    if (!Number.isFinite(num)) throw new AppError('NOT_A_NUMBER', '数值必须是数字', 400)
    const def = this.#store.metric(metricCode)
    const subjectId = this.requireSubject()
    const { record, fact } = this.#store.withTransaction(() => {
      const rec = this.#store.addRecord({ subjectId, kind: 'lab', occurredOn, sourceKind: 'patient_reported', note })
      const obs = this.#store.addObservation({
        subjectId, metricCode, observedOn: occurredOn, value: num,
        unit: unit ?? def.unit, labMethod: method, recordId: rec.id,
      })
      return { record: rec, fact: obs }
    })
    return {
      record: { id: record.id, occurredOn: record.occurred_on },
      observation: { id: fact.id, metricCode: fact.metric_code, value: fact.value_num, unit: fact.unit },
    }
  }

  /** 手工补录治疗事件。计划与实际分开存，来源标为本人补录。 */
  addTreatment({ kind, name, start = null, end = null, status = 'completed', axillary = null, note = null }) {
    if (!TREATMENT_KIND_LABELS[kind]) throw new AppError('BAD_KIND', '治疗类型不在列表里', 400)
    if (!name?.trim()) throw new AppError('EMPTY_NAME', '治疗名称不能为空', 400)
    if (!['planned', 'ongoing', 'completed', 'stopped', 'unknown'].includes(status)) {
      throw new AppError('BAD_STATUS', '治疗状态不合法', 400)
    }
    /* 计划中的治疗本来就排在未来；只有"已发生"的日期才不许晚于今天。
     * 两者用同一把尺子会把"下个月开始放疗"当成错误数据拒掉。 */
    const isPlan = status === 'planned'
    if (start) {
      if (isPlan) assertPlanDate(start); else assertDate(start, '开始日期')
    }
    if (end) {
      if (isPlan) assertPlanDate(end); else assertDate(end, '结束日期')
    }
    if (start && end && end < start) throw new AppError('BAD_RANGE', '结束日期不能早于开始日期', 400)
    if (status === 'completed' && !start) throw new AppError('START_REQUIRED', '已完成的治疗要填开始日期', 400)
    const row = this.#store.addTreatment({
      subjectId: this.requireSubject(),
      kind,
      name: name.trim(),
      axillaryProcedure: axillary || null,
      plannedStart: isPlan ? start : null,
      plannedEnd: isPlan ? end : null,
      actualStart: isPlan ? null : start,
      actualEnd: isPlan ? null : end,
      status,
      note,
    })
    return { treatment: treatmentList(this.#store, this.requireSubject()).find((t) => t.id === row.id) }
  }

  /** 四点位：允许 1–4 点；缺健侧就只记患侧，差值为 null（不补 0）。 */
  addArmSet({ measuredOn, points, assessorRole = 'patient', note = null }) {
    assertDate(measuredOn, '测量日期')
    if (!Array.isArray(points) || points.length === 0) {
      throw new AppError('NO_POINTS', '至少填一个点位', 400)
    }
    const clean = []
    for (const p of points) {
      if (!ARM_POINTS.includes(p.point)) {
        throw new AppError('BAD_POINT', `点位只能是：${ARM_POINTS.join(' / ')}`, 400)
      }
      const affected = Number(p.affected)
      if (!Number.isFinite(affected)) throw new AppError('BAD_VALUE', `${POINT_LABELS[p.point]}的患侧值不是数字`, 400)
      if (affected < 5 || affected > 80) throw new AppError('OUT_OF_RANGE', `${POINT_LABELS[p.point]}的患侧值看起来不像 cm 数（5–80）`, 400)
      let healthy = null
      if (p.healthy !== null && p.healthy !== undefined && p.healthy !== '') {
        healthy = Number(p.healthy)
        if (!Number.isFinite(healthy)) throw new AppError('BAD_VALUE', `${POINT_LABELS[p.point]}的健侧值不是数字`, 400)
        if (healthy < 5 || healthy > 80) throw new AppError('OUT_OF_RANGE', `${POINT_LABELS[p.point]}的健侧值看起来不像 cm 数（5–80）`, 400)
      }
      clean.push({ point: p.point, affected, healthy })
    }
    const seen = new Set()
    for (const p of clean) {
      if (seen.has(p.point)) throw new AppError('DUP_POINT', '同一个点位只填一次', 400)
      seen.add(p.point)
    }

    const subjectId = this.requireSubject()
    if (!this.#store.affectedSide(subjectId)) {
      throw new AppError('LATERALITY_REQUIRED', '档案还没声明患侧（左/右），先设置后才能算"患侧 − 健侧"', 409)
    }

    const set = this.#store.addArmSet({
      subjectId, measuredOn, points: clean,
      assessorRole: ['patient', 'caregiver', 'nurse', 'therapist', 'clinician', 'unknown'].includes(assessorRole)
        ? assessorRole : 'patient',
      note,
    })
    return { set: armHistory(this.#store, subjectId).sets.find((s) => s.id === set.id) ?? set }
  }

  addCare({ kind, title, detail = null, sourceDate = null, isPrivate = false, stage = null }) {
    if (!CARE_KIND_LABELS[kind]) throw new AppError('BAD_KIND', '记录类型不在列表里', 400)
    if (!title?.trim()) throw new AppError('EMPTY_TITLE', '标题不能为空', 400)
    if (sourceDate) assertDate(sourceDate, '记录日期')
    const id = `care_${randomUUID()}`
    this.#store.db.prepare(`INSERT INTO care_entry
      (id, subject_id, stage, kind, title, detail, source_kind, source_date, is_private, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, this.requireSubject(), stage, kind, title.trim(), detail, 'patient_reported',
        sourceDate, isPrivate ? 1 : 0, new Date().toISOString())
    return { entry: this.care({ includePrivate: true }).entries.find((e) => e.id === id) }
  }

  /** 引流：0 表示当日拔管；同一天多次不合并（每次一条）。 */
  addDrain({ date, value, note = null }) {
    assertDate(date, '引流日期')
    const num = Number(value)
    if (!Number.isFinite(num) || num < 0 || num > 2000) {
      throw new AppError('BAD_VOLUME', '引流量要填 0–2000 之间的毫升数', 400)
    }
    const subjectId = this.requireSubject()
    this.#store.withTransaction(() => {
      const record = this.#store.addRecord({
        subjectId, kind: 'measurement', occurredOn: date,
        sourceKind: 'patient_reported', note: note ?? (num === 0 ? '当日拔管' : null),
      })
      this.#store.addObservation({
        subjectId, metricCode: 'drain_vol', observedOn: date, value: num,
        unit: this.#store.metric('drain_vol').unit, recordId: record.id,
      })
    })
    return { drains: this.drainSeries() }
  }

  /* ---------- 导入与解析 ---------- */

  async importBytes({ bytes, filename, kind, reportDate = null, mime = null }) {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new AppError('EMPTY_FILE', '文件是空的', 400)
    }
    if (bytes.length > MAX_UPLOAD) throw new AppError('FILE_TOO_LARGE', '单份原件上限 40 MB', 413)
    if (!DOCUMENT_KINDS.includes(kind)) throw new AppError('BAD_KIND', `资料类型只能是：${DOCUMENT_KINDS.join(' / ')}`, 400)
    assertDate(reportDate, '报告日期')

    const safeName = sanitizeFilename(filename)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const docDir = join(this.#dir, DOC_DIR)
    await mkdir(docDir, { recursive: true })
    const ext = extname(safeName).toLowerCase().slice(0, 12)
    const storagePath = `${DOC_DIR}/${sha256}${ext}`
    const full = join(this.#dir, storagePath)
    if (!assertInside(this.#dir, full)) throw new AppError('UNSAFE_PATH', '原件路径越界', 400)
    await writeFile(full, bytes)

    const { document, duplicate, importedAt, dateBackfilled } = this.#imports.importDocument({
      subjectId: this.requireSubject(),
      kind, filename: safeName, sha256, storagePath,
      mime, bytes: bytes.length, reportDate,
    })
    return {
      document: documentList(this.#store, this.requireSubject()).find((d) => d.id === document.id),
      duplicate, importedAt, dateBackfilled,
    }
  }

  async parseDocument(documentId, { strategy = 'auto' } = {}) {
    const doc = this.#store.db.prepare('SELECT * FROM document WHERE id = ? AND subject_id = ?')
      .get(documentId, this.requireSubject())
    if (!doc) throw new AppError('NO_DOCUMENT', '材料不存在', 404)
    if (doc.status === 'parsed') throw new AppError('ALREADY_PARSED', '这份材料已经解析成功；要重来请先归档旧结果', 409)

    const full = join(this.#dir, doc.storage_path)
    if (!assertInside(this.#dir, full)) throw new AppError('UNSAFE_PATH', '原件路径越界', 400)
    const bytes = await readFile(full)
    const ext = extname(doc.filename).toLowerCase()
    const isText = ['.txt', '.md', '.markdown', '.csv'].includes(ext) || String(doc.mime ?? '').startsWith('text/')

    if (strategy === 'local' || (strategy === 'auto' && isText)) {
      return this.#parseLocal(doc, bytes)
    }
    if (!this.#settings.mineruConsent) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'PDF、图片与 Office 需要先在上传时勾选「允许上传到 MinerU 云端解析」；原件已保留，可稍后重试',
        409,
      )
    }
    return this.#parseWithMineru(doc, bytes)
  }

  async #parseLocal(doc, bytes) {
    const job = this.#imports.startParse(doc.id, { engine: 'local-text' })
    try {
      const text = bytes.toString('utf8')
      const extracted = extractCandidates({ markdown: text })
      const inserted = this.#store.withTransaction(() => {
        this.#imports.finishParse(job.id, { engine: 'local-text' })
        if (extracted.reportDate && !doc.report_date) {
          this.#store.db.prepare('UPDATE document SET report_date = ? WHERE id = ?').run(extracted.reportDate, doc.id)
        }
        let count = 0
        for (const item of extracted.items) {
          const { merged } = this.#imports.addCandidate({
            documentId: doc.id,
            field: item.field,
            valueText: item.valueText,
            valueNum: item.valueNum,
            unit: item.unit,
            method: item.method,
            pageRef: item.pageRef,
            confidence: item.confidence,
            occurredOn: extracted.reportDate,
          })
          if (!merged) count += 1
        }
        return count
      })
      return {
        engine: 'local-text',
        inserted,
        warnings: extracted.warnings ?? [],
        reportDate: extracted.reportDate ?? null,
        document: documentList(this.#store, this.requireSubject()).find((d) => d.id === doc.id),
      }
    } catch (error) {
      try {
        this.#imports.failParse(job.id, {
          errorCode: error.code ?? 'local_parse_error',
          errorText: error.message,
        })
      } catch { /* 任务已被关闭时保持原状 */ }
      throw error
    }
  }

  async #parseWithMineru(doc, bytes) {
    try {
      const result = await this.#imports.parseWithMineru({
        documentId: doc.id,
        bytes,
        filename: doc.filename,
        options: {},
      })
      return {
        engine: 'mineru',
        inserted: result.inserted,
        warnings: result.warnings ?? [],
        reportDate: result.reportDate ?? null,
        pages: result.pages ?? null,
        batchId: result.batchId ?? null,
        excerpt: result.markdown ? result.markdown.slice(0, 4000) : null,
        document: documentList(this.#store, this.requireSubject()).find((d) => d.id === doc.id),
      }
    } catch (error) {
      if (error?.code === 'NO_TOKEN' || error?.code === 'UNAUTHORIZED' || error?.code === 'TIMEOUT' || error?.code === 'TASK_FAILED') {
        throw new AppError(error.code, error.message, error.code === 'UNAUTHORIZED' ? 502 : 504)
      }
      throw error
    }
  }

  /** 原文对照：只读原件文本（文本类）；PDF 不给假文本，明确说需要解析器。 */
  async documentText(documentId) {
    const doc = this.#store.db.prepare('SELECT * FROM document WHERE id = ? AND subject_id = ?')
      .get(documentId, this.requireSubject())
    if (!doc) throw new AppError('NO_DOCUMENT', '材料不存在', 404)
    const full = join(this.#dir, doc.storage_path)
    if (!assertInside(this.#dir, full)) throw new AppError('UNSAFE_PATH', '原件路径越界', 400)
    const ext = extname(doc.filename).toLowerCase()
    if (!['.txt', '.md', '.markdown', '.csv'].includes(ext)) {
      return {
        available: false,
        reason: '这份原件不是纯文本，工作台不在本机渲染 PDF/图片；请用系统默认程序打开原件核对。',
        filename: doc.filename,
        storagePath: doc.storage_path,
      }
    }
    const text = await readFile(full, 'utf8')
    return { available: true, filename: doc.filename, text: text.slice(0, 200000) }
  }

  decideCandidate({ candidateId, action, occurredOn = null, patch = null }) {
    try {
      const result = this.#imports.decideCandidate({
        candidateId, action, occurredOn,
        decidedBy: 'patient',
        patch: normalizePatch(patch),
      })
      return {
        candidate: result.candidate,
        record: result.record ? { id: result.record.id, occurredOn: result.record.occurred_on } : null,
        draft: this.draft(),
      }
    } catch (error) {
      if (error instanceof ImportError) throw new AppError(error.code, error.message, 400, error.detail)
      throw error
    }
  }

  acceptDocument(documentId, { occurredOn = null } = {}) {
    try {
      const result = this.#imports.acceptDocumentCandidates({ documentId, occurredOn, decidedBy: 'patient' })
      return { ...result, draft: this.draft() }
    } catch (error) {
      if (error instanceof ImportError) throw new AppError(error.code, error.message, 400, error.detail)
      throw error
    }
  }

  /* ---------- 导出 ---------- */

  exportVisit({
    questionIds = null,
    metricCodes = null,
    includeArm = true,
    includeTreatments = true,
    includeDocuments = true,
    viewpointIds = null,
    includePrivateViewpoints = false,
  } = {}) {
    const subjectId = this.requireSubject()
    const subject = subjectState(this.#store, subjectId)
    const stageLabel = subject?.stage?.label ?? null

    const allQuestions = questionList(this.#store, subjectId)
    const chosen = questionIds
      ? allQuestions.filter((q) => questionIds.includes(q.id))
      : allQuestions.filter((q) => q.includeInExport)

    const views = viewpointList(this.#store, subjectId, { includePrivate: includePrivateViewpoints })
    const chosenViews = viewpointIds ? views.filter((v) => viewpointIds.includes(v.id)) : views

    const cards = metricCards(this.#store, subjectId)
    const pickedMetrics = cards
      .filter((m) => m.hasData && (metricCodes ? metricCodes.includes(m.code) : true))
      .map((m) => ({
        code: m.code, name: m.name, unit: m.unit, dec: m.dec,
        value: m.latest.value, date: m.latest.date, source: m.latest.source, delta: m.delta,
      }))

    const arm = includeArm ? armHistory(this.#store, subjectId) : null
    const treatments = includeTreatments
      ? treatmentList(this.#store, subjectId).filter((t) => t.isActual)
      : []
    const docs = includeDocuments
      ? documentList(this.#store, subjectId).filter((d) => d.status === 'parsed')
      : []

    const generatedAt = new Date().toISOString().slice(0, 10)
    const markdown = renderVisitMarkdown({
      subject, stageLabel, generatedAt,
      questions: chosen, viewpoints: chosenViews, metrics: pickedMetrics,
      arm, treatments, documents: docs,
    })

    const fingerprint = hashOf(exportFingerprint(this.#store, subjectId))
    const now = new Date().toISOString()
    const jobId = `exp_${randomUUID()}`
    const scope = {
      questionIds: chosen.map((q) => q.id),
      metricCodes: pickedMetrics.map((m) => m.code),
      viewpointIds: chosenViews.map((v) => v.id),
      includeArm: Boolean(includeArm),
      includeTreatments: Boolean(includeTreatments),
      includeDocuments: Boolean(includeDocuments),
    }
    this.#store.withTransaction(() => {
      this.#store.db.prepare(`INSERT INTO export_job
        (id, subject_id, format, scope_json, file_path, content_hash, created_at)
        VALUES (?, ?, 'md', ?, NULL, ?, ?)`)
        .run(jobId, subjectId, JSON.stringify(scope), fingerprint, now)
      this.#store.db.prepare(`INSERT INTO saved_result
        (id, subject_id, kind, title, snapshot_json, source_refs_json, created_at)
        VALUES (?, ?, 'question_set', ?, ?, ?, ?)`)
        .run(`saved_${randomUUID()}`, subjectId,
          `就诊准备 · ${generatedAt}`,
          JSON.stringify({ scope, markdown }),
          JSON.stringify(scope.questionIds), now)
    })

    const filename = `小粉宝-就诊准备-${generatedAt}.md`
    return {
      exportJob: { id: jobId, createdAt: now, scope },
      filename,
      markdown,
      counts: {
        questions: chosen.length,
        viewpoints: chosenViews.length,
        metrics: pickedMetrics.length,
        treatments: treatments.length,
        documents: docs.length,
      },
    }
  }

  savedResults() {
    const rows = this.#store.db.prepare(
      'SELECT * FROM saved_result WHERE subject_id = ? ORDER BY created_at DESC',
    ).all(this.requireSubject())
    return rows.map((r) => {
      let snapshot = null
      try { snapshot = JSON.parse(r.snapshot_json) } catch { snapshot = null }
      return {
        id: r.id, kind: r.kind, title: r.title, createdAt: r.created_at,
        staleAt: r.stale_at, staleReason: r.stale_reason,
        preview: snapshot?.markdown ? String(snapshot.markdown).slice(0, 400) : null,
      }
    })
  }
}

/* ---------------- 辅助 ---------------- */

function assertDate(value, label) {
  if (value === null || value === undefined || value === '') return value
  try {
    return assertMedicalDate(value, label)
  } catch (error) {
    if (error instanceof ImportError) throw new AppError(error.code, error.message, 400)
    throw error
  }
}

/** 安排日期允许未来（和"医疗事件已发生"是两回事）。 */
function assertPlanDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new AppError('BAD_DATE', '日期要写成 YYYY-MM-DD', 400)
  }
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new AppError('BAD_DATE', '这个日期不存在，请核对', 400)
  }
  if (value < '1940-01-01' || value > '2100-12-31') {
    throw new AppError('IMPLAUSIBLE_DATE', '日期超出可记录范围', 400)
  }
  return value
}

function sanitizeFilename(name) {
  const base = basename(String(name ?? '').replace(/\\/g, '/')).replace(/[\u0000-\u001f]/g, '')
  const trimmed = base.trim().slice(0, 120)
  return trimmed || '未命名材料'
}

/** 只允许改"内容"字段；数值字符串转数字，避免把 "12,5" 当字符串写进库。 */
function normalizePatch(patch) {
  if (!patch) return null
  const out = {}
  for (const key of ['value_text', 'valueText', 'unit', 'method', 'page_ref', 'pageRef']) {
    if (patch[key] !== undefined) {
      const target = key === 'valueText' ? 'value_text' : key === 'pageRef' ? 'page_ref' : key
      out[target] = patch[key] === null ? null : String(patch[key]).trim()
    }
  }
  if (patch.value_num !== undefined || patch.valueNum !== undefined) {
    const raw = patch.value_num ?? patch.valueNum
    const n = raw === null || raw === '' ? null : Number(String(raw).replace(',', '.'))
    if (n !== null && !Number.isFinite(n)) throw new AppError('NOT_A_NUMBER', '填的数值读不出数字', 400)
    out.value_num = n
  }
  if (out.value_text !== undefined) {
    const n = Number(String(out.value_text).replace(',', '.'))
    if (Number.isFinite(n) && n === n) {
      // 原文是数字时同时给出数值，避免"有字无数"再被拦一次
      if (out.value_num === undefined) out.value_num = n
    }
  }
  return out
}

function pickSubject(store) {
  const rows = store.db.prepare(
    `SELECT s.* FROM subject s JOIN workspace w ON w.id = s.workspace_id
     ORDER BY CASE WHEN w.name LIKE '[UI DEMO]%' THEN 1 ELSE 0 END, s.created_at`,
  ).all()
  return rows[0] ?? null
}

async function fileExists(path) {
  try { await stat(path); return true } catch { return false }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2))
}

export { MAX_UPLOAD, DB_NAME, DOC_DIR }
