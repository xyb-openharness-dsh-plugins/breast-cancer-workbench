/**
 * 资料导入与草稿核对（M2 第一段）。
 *
 * 对应 [DATA-FLOW-SPEC](../docs/DATA-FLOW-SPEC.md) §2 的 ①–⑤，四条不能省的规矩：
 * 1. **原件去重靠 sha256**：同一档案同一哈希只建一条 `document`，重复导入返回原记录与首次导入时间；
 * 2. **解析失败不产生候选**：`document.status='parse_failed'` 时 `addCandidate` 直接拒绝，
 *    原件仍在列表里，可重试或手工录入（A2）；
 * 3. **候选是待核对项，不是事实**：`candidate` 只在用户接受后写 `record` + 具体事实表，
 *    接受只表示"录入"，不表示临床审核（`record.reviewed_by` 保持 NULL）；
 * 4. **候选去重靠 UNIQUE(document_id, field, value_text)**：同文档同字段同值合并，不产生两条。
 *
 * 另一条边界：候选不接受"结论"类字段，也不写 `viewpoint`——看法是用户的话，不是从报告里提的。
 */
import { randomUUID } from 'node:crypto'
import { MineruClient } from './mineru.js'
import { extractCandidates } from './labparse.js'

const nowIso = () => new Date().toISOString()
const newId = (prefix) => `${prefix}_${randomUUID()}`

export const DOCUMENT_KINDS = [
  'pathology', 'imaging', 'lab', 'discharge', 'prescription', 'rehab_advice', 'other',
]

/** 已实现入库映射的字段命名空间；其余（病理/分子）在 M2 第二段接。 */
export const SUPPORTED_NAMESPACES = ['metric', 'treatment']

export const CANDIDATE_ACTIONS = ['accept', 'edit', 'reject', 'needs_review']

export class ImportError extends Error {
  constructor(code, message, detail = null) {
    super(message)
    this.name = 'ImportError'
    this.code = code
    this.detail = detail
  }
}

const SHA256_RE = /^[a-f0-9]{64}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 真日期（能排除 2026-02-31 这种"格式对、日子不对"）。 */
function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * 医疗事件日期校验。上限是"今天"（不接受未来日期），下限 1940-01-01。
 * 这里只做**常识边界**，不做"与出生年份比对"——档案可能没填出生年，不能凭空推断。
 */
export function assertMedicalDate(value, label = '日期') {
  if (!isRealDate(value)) {
    throw new ImportError('BAD_DATE', `${label}必须是 YYYY-MM-DD 的真实日期，收到：${value ?? '(空)'}`)
  }
  const today = new Date().toISOString().slice(0, 10)
  if (value > today) throw new ImportError('FUTURE_DATE', `${label}不能晚于今天（${today}），收到：${value}`)
  if (value < '1940-01-01') throw new ImportError('IMPLAUSIBLE_DATE', `${label}早于 1940-01-01，请核对：${value}`)
  return value
}

function parseField(field) {
  if (typeof field !== 'string' || !field.includes(':')) {
    throw new ImportError('BAD_FIELD', `字段名要写成 <命名空间>:<键>，例如 metric:ca153，收到：${field ?? '(空)'}`)
  }
  const index = field.indexOf(':')
  const namespace = field.slice(0, index)
  const key = field.slice(index + 1)
  if (!key) throw new ImportError('BAD_FIELD', `字段缺少键名：${field}`)
  if (!SUPPORTED_NAMESPACES.includes(namespace)) {
    throw new ImportError(
      'UNSUPPORTED_FIELD',
      `字段命名空间「${namespace}」还没有入库映射（当前支持：${SUPPORTED_NAMESPACES.join(' / ')}）`,
      { field },
    )
  }
  return { namespace, key }
}

/** 原件相对路径：不许绝对路径、不许 .. 上跳（原件必须留在工作区目录内）。 */
function assertSafeStoragePath(storagePath) {
  if (typeof storagePath !== 'string' || !storagePath.trim()) {
    throw new ImportError('UNSAFE_PATH', '原件路径不能为空')
  }
  if (storagePath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(storagePath)) {
    throw new ImportError('UNSAFE_PATH', `原件路径必须是工作区内的相对路径，收到绝对路径：${storagePath}`)
  }
  if (storagePath.split(/[\\/]/).includes('..')) {
    throw new ImportError('UNSAFE_PATH', `原件路径不能跳出工作区：${storagePath}`)
  }
}

export class ImportService {
  constructor(store) {
    this.store = store
    this.db = store.db
  }

  /* ---------- ① 导入原件 ---------- */

  /**
   * 导入一份原件。同一档案同一 sha256 → 返回已存在的文档，`duplicate: true`，
   * **不改**它的状态、不新建 parse_job（重复导入不该让已解析的材料退回未解析）。
   */
  importDocument({
    subjectId, kind, filename, sha256, storagePath,
    mime = null, bytes = null, pageCount = null, reportDate = null,
  }) {
    if (!subjectId) throw new ImportError('NO_SUBJECT', '导入必须指定所属档案')
    if (!DOCUMENT_KINDS.includes(kind)) {
      throw new ImportError('BAD_KIND', `资料类型只能是：${DOCUMENT_KINDS.join(' / ')}`)
    }
    if (!filename?.trim()) throw new ImportError('BAD_FILENAME', '文件名不能为空')
    if (!SHA256_RE.test(String(sha256 ?? ''))) {
      throw new ImportError('BAD_HASH', 'sha256 必须是 64 位小写十六进制（用它判重，不能留空）')
    }
    assertSafeStoragePath(storagePath)
    // 报告日期可空（不是每份原件都写得清），但给了就必须是真日期。
    if (reportDate !== null) assertMedicalDate(reportDate, '报告/采样日期')

    const existing = this.db
      .prepare('SELECT * FROM document WHERE subject_id = ? AND sha256 = ?')
      .get(subjectId, sha256)
    if (existing) {
      // 重复导入不改状态；只有在原来没日期、这次带了日期时补一次（补日期不会让结论失真）。
      if (reportDate && !existing.report_date) {
        this.db.prepare('UPDATE document SET report_date = ? WHERE id = ?').run(reportDate, existing.id)
        this.#logDocument(existing.id, 'backfill_date', { report_date: null }, { report_date: reportDate })
        return {
          document: this.db.prepare('SELECT * FROM document WHERE id = ?').get(existing.id),
          duplicate: true,
          importedAt: existing.imported_at,
          dateBackfilled: true,
        }
      }
      return { document: existing, duplicate: true, importedAt: existing.imported_at, dateBackfilled: false }
    }

    const id = newId('doc')
    const importedAt = nowIso()
    this.store.withTransaction(() => {
      this.db.prepare(`INSERT INTO document
        (id, subject_id, kind, filename, mime, bytes, sha256, page_count, imported_at, storage_path, status, report_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stored', ?)`)
        .run(id, subjectId, kind, filename.trim(), mime, bytes, sha256, pageCount, importedAt, storagePath, reportDate)
      this.#logDocument(id, 'create', null, { filename, sha256, kind, report_date: reportDate })
    })
    return {
      document: this.db.prepare('SELECT * FROM document WHERE id = ?').get(id),
      duplicate: false,
      importedAt,
      dateBackfilled: false,
    }
  }

  documentsFor(subjectId) {
    return this.db.prepare('SELECT * FROM document WHERE subject_id = ? ORDER BY imported_at DESC').all(subjectId)
  }

  /* ---------- ② 解析（可失败） ---------- */

  /** 排队并立即进入 running（一期是本地同步解析，没有真正的队列，但状态机照建）。 */
  startParse(documentId, { engine = null } = {}) {
    const doc = this.#document(documentId)
    if (doc.status === 'parsed') {
      throw new ImportError('ALREADY_PARSED', '该材料已解析成功，不需要重复解析；要重来请先归档旧结果')
    }
    const running = this.db
      .prepare("SELECT * FROM parse_job WHERE document_id = ? AND status IN ('queued','running')")
      .get(documentId)
    if (running) return running

    const id = newId('pj')
    this.db.prepare(`INSERT INTO parse_job (id, document_id, status, engine, started_at)
      VALUES (?, ?, 'running', ?, ?)`).run(id, documentId, engine, nowIso())
    return this.db.prepare('SELECT * FROM parse_job WHERE id = ?').get(id)
  }

  finishParse(jobId, { engine = null } = {}) {
    const job = this.#job(jobId)
    if (job.status !== 'running' && job.status !== 'queued') {
      throw new ImportError('JOB_CLOSED', `解析任务已是 ${job.status}，不能再置为成功`)
    }
    this.store.withTransaction(() => {
      this.db.prepare("UPDATE parse_job SET status='succeeded', finished_at=?, engine=COALESCE(?, engine) WHERE id=?")
        .run(nowIso(), engine, jobId)
      this.db.prepare("UPDATE document SET status='parsed' WHERE id=?").run(job.document_id)
    })
    return this.db.prepare('SELECT * FROM parse_job WHERE id = ?').get(jobId)
  }

  /** 失败：任务留在列表里带原因，原件保留，**不产生任何候选**。 */
  failParse(jobId, { errorCode = 'parse_error', errorText = null } = {}) {
    const job = this.#job(jobId)
    if (job.status !== 'running' && job.status !== 'queued') {
      throw new ImportError('JOB_CLOSED', `解析任务已是 ${job.status}，不能再置为失败`)
    }
    this.store.withTransaction(() => {
      this.db.prepare(`UPDATE parse_job SET status='failed', finished_at=?, error_code=?, error_text=? WHERE id=?`)
        .run(nowIso(), errorCode, errorText, jobId)
      this.db.prepare("UPDATE document SET status='parse_failed' WHERE id=?").run(job.document_id)
    })
    return this.db.prepare('SELECT * FROM parse_job WHERE id = ?').get(jobId)
  }

  jobsFor(documentId) {
    return this.db.prepare('SELECT * FROM parse_job WHERE document_id = ? ORDER BY started_at DESC').all(documentId)
  }

  /**
   * 走 MinerU 解析一份已导入的原件：申请上传 → 上传 → 轮询 → 取 `full.md` → 生成候选。
   *
   * 事务边界：候选写入、`document` 置 `parsed`、`parse_job` 置 `succeeded` 在同一次提交里；
   * 任何一步抛错都整体回滚并走 `failParse`——**不留下半份候选**，也**不让失败的原件变成已解析**（A2）。
   *
   * @param {object} opts
   * @param {string} opts.documentId
   * @param {Buffer|Uint8Array} opts.bytes 原件字节（读文件由调用方/文件层负责）
   * @param {string} [opts.filename] 不给就用已登记的 `document.filename`
   * @param {MineruClient} [opts.client] 注入客户端（单测用假 fetch）
   * @param {object} [opts.options] 透传给 MinerU 的解析参数（语言、公式、表格、页范围、轮询间隔）
   */
  async parseWithMineru({ documentId, bytes, filename = null, client = null, token = null, options = {} }) {
    const doc = this.#document(documentId)
    const job = this.startParse(documentId, { engine: 'mineru' })
    try {
      const mineru = client ?? new MineruClient({ token })
      const result = await mineru.parse({
        bytes,
        filename: filename ?? doc.filename,
        dataId: doc.id,
        ...options,
      })
      const extracted = extractCandidates({
        markdown: result.markdown,
        contentList: result.contentList,
        extraAliases: this.#userAliases(),
      })

      const inserted = this.store.withTransaction(() => {
        this.finishParse(job.id, { engine: 'mineru' })
        if (extracted.reportDate && !doc.report_date) {
          this.db.prepare('UPDATE document SET report_date = ? WHERE id = ?').run(extracted.reportDate, doc.id)
        }
        if (result.pages) {
          this.db.prepare('UPDATE document SET page_count = ? WHERE id = ?').run(result.pages, doc.id)
        }
        let count = 0
        for (const item of extracted.items) {
          const { merged } = this.addCandidate({
            documentId,
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
        job: this.db.prepare('SELECT * FROM parse_job WHERE id = ?').get(job.id),
        document: this.#document(documentId),
        batchId: result.batchId,
        pages: result.pages ?? null,
        reportDate: extracted.reportDate,
        inserted,
        warnings: extracted.warnings,
        markdown: result.markdown,
      }
    } catch (error) {
      try {
        this.failParse(job.id, {
          errorCode: error.code ?? 'parse_error',
          errorText: error.message,
        })
      } catch {
        /* 任务已被并发关闭时保持原状，不掩盖真正的解析错误 */
      }
      throw error
    }
  }

  /** 用户在设置里加的别名（`metric_definition.aliases_json`），没配就是空表。 */
  #userAliases() {
    const out = {}
    for (const row of this.db.prepare('SELECT code, aliases_json FROM metric_definition').all()) {
      try {
        const list = JSON.parse(row.aliases_json ?? '[]')
        if (Array.isArray(list) && list.length) out[row.code] = list
      } catch {
        /* 坏 JSON 当没配，不阻断解析 */
      }
    }
    return out
  }

  /* ---------- ③ 生成候选 ---------- */

  /**
   * 新增一个待核对候选。`value_text` 是原文抄下来的字面值（必须有），
   * `value_num` 是解析出的数（有就存，没有就留给用户核对时补）。
   * `occurredOn` 是这条候选所属医疗事件的日期；解析器读得到就带上，读不到留空（核对时再问）。
   */
  addCandidate({
    documentId, field, valueText = null, valueNum = null, unit = null,
    method = null, pageRef = null, bbox = null, confidence = null, occurredOn = null,
  }) {
    parseField(field)
    if (!documentId) {
      throw new ImportError(
        'NO_DOCUMENT',
        '候选必须挂在某份材料下：candidate 表没有 subject_id，脱离材料就无法判定属于谁（手工补录请直接写事实层）',
      )
    }
    const doc = this.#document(documentId)
    if (doc.status !== 'parsed') {
      throw new ImportError('PARSE_REQUIRED', `材料当前是 ${doc.status}，解析成功后才能生成候选（A2）`, { documentId })
    }
    const text = valueText === null || valueText === undefined ? '' : String(valueText).trim()
    if (!text) throw new ImportError('EMPTY_VALUE', '候选必须带原文值（valueText），不能只留数字')
    if (occurredOn !== null) assertMedicalDate(occurredOn, '候选的医疗事件日期')

    const dup = this.db
      .prepare('SELECT * FROM candidate WHERE document_id = ? AND field = ? AND value_text = ?')
      .get(documentId, field, text)
    if (dup) return { candidate: dup, merged: true }

    const id = newId('cand')
    this.db.prepare(`INSERT INTO candidate
      (id, document_id, field, value_text, value_num, unit, method, page_ref, bbox_json, confidence, status, occurred_on)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .run(id, documentId, field, text, valueNum, unit, method, pageRef,
        bbox ? JSON.stringify(bbox) : null, confidence, occurredOn)
    return { candidate: this.db.prepare('SELECT * FROM candidate WHERE id = ?').get(id), merged: false }
  }

  candidatesFor(documentId) {
    return this.db.prepare('SELECT * FROM candidate WHERE document_id = ? ORDER BY field, value_text').all(documentId)
  }

  /* ---------- ④ 草稿视图（读取时算，不落库） ---------- */

  /**
   * 待核对草稿：按材料分组，附带**读取时计算的**问题清单。
   * 问题不写进库：规则改了，历史候选的判定应跟着改，而不是留着旧结论。
   */
  draftFor(subjectId) {
    const documents = this.documentsFor(subjectId)
    const ids = documents.map((d) => d.id)
    const placeholders = ids.length ? ids.map(() => '?').join(',') : "''"
    const rows = ids.length
      // 带上已接受事实的日期：接受时日期写在 record 上，候选自己的 occurred_on 仍是空。
      // 不加这一列，草稿列表与「与 Agent 讨论」就会把已入库的事实显示成"日期未填"。
      ? this.db.prepare(`SELECT c.*, r.occurred_on AS record_occurred_on FROM candidate c
          LEFT JOIN record r ON r.id = c.record_id
          WHERE c.document_id IN (${placeholders})
          ORDER BY c.field, c.value_text`).all(...ids)
      : []

    const conflictKeys = new Set()
    const group = new Map()
    for (const c of rows) {
      if (!group.has(c.field)) group.set(c.field, new Set())
      group.get(c.field).add(c.value_text)
    }
    for (const [field, values] of group) if (values.size > 1) conflictKeys.add(field)

    const withIssues = (row, doc) => {
      // record_occurred_on 只是查询用的连接列，不往接口里带（候选的形状保持原样）
      const { record_occurred_on: recordDate, ...c } = row
      const issues = this.#issues(c, conflictKeys.has(c.field))
      return {
        candidate: c,
        fileName: doc?.filename ?? null,
        // 建议日期：候选自带 > 已入库事实的日期 > 材料报告日期 > 空
        // （界面这时必须让用户填，不许拿导入时间顶）
        suggestedDate: c.occurred_on ?? recordDate ?? doc?.report_date ?? null,
        issues,
        canAutoAccept: issues.length === 0,
      }
    }

    const byDocument = documents.map((doc) => {
      const list = rows.filter((c) => c.document_id === doc.id).map((c) => withIssues(c, doc))
      return {
        document: doc,
        reportDate: doc.report_date ?? null,
        jobs: this.jobsFor(doc.id),
        candidates: list,
        counts: countByStatus(list),
      }
    })

    const all = rows.map((c) => withIssues(c, documents.find((d) => d.id === c.document_id)))
    return { documents: byDocument, counts: countByStatus(all) }
  }

  /** 单条候选的问题（只报"需要人看一眼"的，不把正常值也列成问题）。 */
  #issues(c, conflict = false) {
    const issues = []
    const { namespace, key } = parseField(c.field)
    if (namespace === 'metric') {
      let def = null
      try {
        def = this.store.metric(key)
      } catch {
        issues.push({ code: 'unknown_metric', text: `指标「${key}」不在字典里，无法入库` })
      }
      if (def && def.unit && def.unit !== '—' && !c.unit) {
        issues.push({ code: 'unit_missing', text: `缺单位（字典口径：${def.unit}）` })
      }
      if (c.value_num === null && !Number.isFinite(Number(c.value_text))) {
        issues.push({ code: 'value_not_number', text: `「${c.value_text}」不是数字，需手工填` })
      }
    }
    if (namespace === 'treatment' && !c.value_text?.trim()) {
      issues.push({ code: 'missing_name', text: '缺治疗名称' })
    }
    if (conflict) {
      issues.push({ code: 'conflict', text: '同一份材料里这个字段有多个不同值，需你判断哪个对' })
    }
    if (c.confidence !== null && c.confidence < 0.6) {
      issues.push({ code: 'low_confidence', text: `解析把握度低（${Math.round(c.confidence * 100)}%），建议对照原文` })
    }
    return issues
  }

  /* ---------- ⑤ 逐项核对 → 写事实层 ---------- */

  /**
   * 决定一条候选。accept/edit 会把事实写进 record + observation/treatment_event，
   * 并把 record_id 回填到候选；reject/needs_review 只改状态。
   *
   * `occurredOn` 必须显式给：原件与候选都没有"医疗事件日期"字段（见 docs/DATA-FLOW-SPEC §10），
   * 这里**不猜**——报告日期、采样日期、出院日期不是一回事。
   */
  decideCandidate({ candidateId, action, decidedBy = 'patient', occurredOn = null, patch = null }) {
    if (!CANDIDATE_ACTIONS.includes(action)) {
      throw new ImportError('BAD_ACTION', `动作只能是：${CANDIDATE_ACTIONS.join(' / ')}`)
    }
    if (!['patient', 'caregiver', 'clinician'].includes(decidedBy)) {
      throw new ImportError('BAD_ACTOR', 'decided_by 只能是 patient / caregiver / clinician')
    }
    const c = this.db.prepare('SELECT * FROM candidate WHERE id = ?').get(candidateId)
    if (!c) throw new ImportError('NO_CANDIDATE', `候选不存在：${candidateId}`)
    if (!['pending', 'needs_review'].includes(c.status)) {
      throw new ImportError('TERMINAL', `这条候选已经是 ${c.status}，不能重复决定`, { candidateId })
    }

    if (action === 'reject' || action === 'needs_review') {
      this.db.prepare('UPDATE candidate SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?')
        .run(action === 'reject' ? 'rejected' : 'needs_review', nowIso(), decidedBy, candidateId)
      return { candidate: this.db.prepare('SELECT * FROM candidate WHERE id = ?').get(candidateId), record: null, fact: null }
    }

    if (action === 'edit' && (!patch || Object.keys(patch).length === 0)) {
      throw new ImportError('EMPTY_EDIT', '选了「修改后接受」就必须给出改了什么')
    }
    const merged = { ...c, ...(patch ?? {}) }
    // 日期优先级：本次显式传入 > 候选自带（解析时从原件读到的） > 报错
    const resolvedDate = occurredOn ?? merged.occurred_on ?? merged.occurredOn ?? null
    if (!resolvedDate) {
      throw new ImportError(
        'DATE_REQUIRED',
        '这条记录缺「发生日期」：原件里没读到、候选上也没有。请填一次——不要用导入时间顶替（两者不是一回事）',
        { candidateId },
      )
    }
    const date = assertMedicalDate(resolvedDate, '这次记录的发生日期')

    const { namespace, key } = parseField(merged.field)
    const document = this.#document(c.document_id)
    const subjectId = document.subject_id
    const sourceKind = 'report_transcription'

    return this.store.withTransaction(() => {
      const record = this.store.addRecord({
        subjectId,
        kind: namespace === 'metric' ? 'lab' : 'treatment',
        occurredOn: date,
        sourceKind,
        sourceDocumentId: document.id,
        note: `来自待核对候选 ${c.id}${c.page_ref ? ` · ${c.page_ref}` : ''}`,
      })
      const fact = namespace === 'metric'
        ? this.#writeMetric(merged, key, record, subjectId)
        : this.#writeTreatment(merged, key, record, subjectId)

      this.db.prepare(`UPDATE candidate SET status = ?, decided_at = ?, decided_by = ?, record_id = ?,
        value_text = ?, value_num = ?, unit = ? WHERE id = ?`)
        .run(action === 'edit' ? 'edited' : 'accepted', nowIso(), decidedBy, record.id,
          merged.value_text, merged.value_num, merged.unit, candidateId)

      return {
        candidate: this.db.prepare('SELECT * FROM candidate WHERE id = ?').get(candidateId),
        record,
        fact,
      }
    })
  }

  /**
   * 一份材料一次收下（化验单通常整页同一个采样日期）。
   * 日期优先级：候选自带 > 本次传入 > 材料的报告日期；三者都没有就**不猜**，
   * 该条留在 pending 并在 `skipped` 里报 `date_missing`。
   * 有问题的候选同样**不静默跳过**：留下并回传原因，等单条核对。
   */
  acceptDocumentCandidates({ documentId, occurredOn = null, decidedBy = 'patient' }) {
    if (occurredOn !== null) assertMedicalDate(occurredOn, '这次记录的发生日期')
    const doc = this.#document(documentId)
    const draft = this.draftFor(doc.subject_id)
    const entry = draft.documents.find((d) => d.document.id === documentId)
    if (!entry) throw new ImportError('NO_DOCUMENT', `材料不存在：${documentId}`)

    const accepted = []
    const skipped = []
    for (const item of entry.candidates) {
      const c = item.candidate
      if (!['pending', 'needs_review'].includes(c.status)) continue
      if (item.issues.length > 0) {
        skipped.push({ candidateId: c.id, field: c.field, reasons: item.issues.map((i) => i.code) })
        continue
      }
      const date = c.occurred_on ?? occurredOn ?? doc.report_date ?? null
      if (!date) {
        skipped.push({ candidateId: c.id, field: c.field, reasons: ['date_missing'] })
        continue
      }
      accepted.push(this.decideCandidate({ candidateId: c.id, action: 'accept', decidedBy, occurredOn: date }).record)
    }
    return { accepted, skipped }
  }

  #writeMetric(merged, code, record, subjectId) {
    const def = this.store.metric(code)
    const value = Number(merged.value_num ?? merged.value_text)
    if (!Number.isFinite(value)) {
      throw new ImportError('VALUE_NOT_NUMBER', `「${merged.value_text}」不是数字，入库前请改成数值`)
    }
    return this.store.addObservation({
      subjectId,
      metricCode: code,
      observedOn: record.occurred_on,
      value,
      unit: merged.unit ?? def.unit,
      labMethod: merged.method ?? null,
      recordId: record.id,
    })
  }

  #writeTreatment(merged, kind, record, subjectId) {
    if (!merged.value_text?.trim()) throw new ImportError('MISSING_NAME', '治疗事件必须有名称')
    return this.store.addTreatment({
      subjectId,
      kind,
      name: merged.value_text.trim(),
      actualStart: record.occurred_on,
      status: merged.treatmentStatus ?? 'completed',
      recordId: record.id,
    })
  }

  #document(id) {
    const doc = this.db.prepare('SELECT * FROM document WHERE id = ?').get(id)
    if (!doc) throw new ImportError('NO_DOCUMENT', `材料不存在：${id}`)
    return doc
  }

  #job(id) {
    const job = this.db.prepare('SELECT * FROM parse_job WHERE id = ?').get(id)
    if (!job) throw new ImportError('NO_JOB', `解析任务不存在：${id}`)
    return job
  }

  #logDocument(documentId, action, before, after) {
    this.db.prepare(`INSERT INTO change_log (id, entity, entity_id, action, actor_role, before_json, after_json, at)
      VALUES (?, 'document', ?, ?, 'patient', ?, ?, ?)`)
      .run(newId('log'), documentId, action, before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null, nowIso())
  }
}

function countByStatus(list) {
  const counts = { pending: 0, accepted: 0, edited: 0, rejected: 0, needs_review: 0 }
  for (const item of list) {
    const status = item.candidate ? item.candidate.status : item.status
    if (status in counts) counts[status] += 1
  }
  return counts
}

/** 手工补录（无原件）走这里：先建记录，再落事实，不经过候选。 */
export function addManualObservation(store, { subjectId, metricCode, occurredOn, value, unit = null, labMethod = null, note = null }) {
  assertMedicalDate(occurredOn, '记录日期')
  const def = store.metric(metricCode)
  return store.withTransaction(() => {
    const record = store.addRecord({ subjectId, kind: 'lab', occurredOn, sourceKind: 'patient_reported', note })
    const fact = store.addObservation({
      subjectId, metricCode, observedOn: occurredOn,
      value: Number(value), unit: unit ?? def.unit, labMethod, recordId: record.id,
    })
    return { record, fact }
  })
}

export function createImportService(store) {
  return new ImportService(store)
}
