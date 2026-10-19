/**
 * 读模型（M2 第二段）。把库里的行整理成界面能直接渲染的形状。
 *
 * 三条口径，全部是**读取时算**，不落库：
 * 1. 派生值只算不存：臂围差、较前次变化、BMI、导出是否过时；
 * 2. 私密记录默认过滤：心理、性健康、生育相关（`is_private=1`）不进一图秀、摘要与导出（A12/A27）；
 * 3. 可比性跟方法走：同一指标的记录若 `lab_method` 变化，序列在这里**断开**，不被拼成一条线（A10）。
 *
 * 这里不判断病情，也不给处置：标签只描述"这是什么"，不描述"这是好还是坏"。
 *
 * 2026-10-20 起唯一的"客观对照"：CTCAE v5.0 分级（用户定则）——它不是判断，是国际标准
 * 的客观区间对照；实现与免责见 dsh/ctcae.js。
 */

import { ctcaeGrade, ctcaeInfo } from './ctcae.js'

/** 指标卡用的 CTCAE 对照；gradeCtcae 返回 null 表示该指标无定义，不透传字段。 */
function gradeCtcae(code, value) {
  const g = ctcaeGrade(code, value)
  return g && g.grade ? { grade: g.grade, band: g.band, term: g.term, approx: g.approx, note: g.note } : null
}

/** CTCAE 元信息（版本/来源/免责），前端渲染来源与免责用。 */
export function ctcaeMeta() {
  return ctcaeInfo()
}

export const STAGE_LABELS = {
  newly_diagnosed: '刚确诊',
  neoadjuvant: '术前治疗',
  post_op: '术后恢复',
  radiotherapy: '放疗期间',
  endocrine: '内分泌治疗',
  followup: '随访',
  metastatic: '复发后治疗',
}

export const CATEGORY = {
  tumor_marker: { label: '肿瘤标志物', color: '#c2416b', order: 1 },
  cbc: { label: '血常规', color: '#3f6f7e', order: 2 },
  chemistry: { label: '生化', color: '#a85a3c', order: 3 },
  cardiac_bone: { label: '心功能与骨健康', color: '#7c6aae', order: 4 },
  nutrition: { label: '营养与体重', color: '#2f7d6b', order: 5 },
  rehab: { label: '康复测量', color: '#a8410a', order: 6 },
  drainage: { label: '引流', color: '#8a6a4f', order: 7 },
}

export const POINT_LABELS = {
  wrist: '腕横纹',
  forearm_mid: '前臂中段',
  above_elbow_10: '肘上 10cm',
  below_axilla_10: '腋下 10cm',
}

export const ARM_POINTS = ['wrist', 'forearm_mid', 'above_elbow_10', 'below_axilla_10']

export const TREATMENT_KIND_LABELS = {
  surgery: '手术',
  chemo: '化疗',
  radio: '放疗',
  endocrine: '内分泌治疗',
  targeted: '靶向治疗',
  immuno: '免疫治疗',
  other: '其他治疗',
}

export const TREATMENT_STATUS_LABELS = {
  planned: '计划',
  ongoing: '进行中',
  completed: '已完成',
  stopped: '已停止',
  unknown: '状态待确认',
}

export const SYMPTOM_LABELS = {
  arm_heaviness: '上肢沉重',
  tightness: '紧绷',
  swelling: '肿胀',
  fatigue: '疲乏',
  hot_flash: '潮热 / 盗汗',
  joint_pain: '关节痛 / 僵硬',
  skin_rxn: '放疗区皮肤反应',
  le_symptom: '上肢沉重 / 紧绷',
  ai_joint: '关节痛 / 僵硬',
}

export const TASK_KIND_LABELS = {
  self: '本人安排',
  hospital: '医院安排',
  question_prep: '准备问题',
  followup: '随访',
}

export const CARE_KIND_LABELS = {
  wound: '伤口记录',
  drain_note: '引流记录',
  rehab_advice: '康复建议',
  nutrition: '营养记录',
  mind: '心理记录',
  daily: '日常记录',
  followup: '随访记录',
}

const SOURCE_KIND_LABELS = {
  report_transcription: '报告转录',
  patient_reported: '本人记录',
  caregiver_reported: '照护者记录',
  clinician_documented: '治疗团队文书',
  device_imported: '设备导入',
}

const ROLE_LABELS = { patient: '本人', caregiver: '照护者', clinician: '治疗团队' }

const num = (v, dec = 1) => (v === null || v === undefined ? null : Number(Number(v).toFixed(dec)))

/* ---------------- 档案与阶段 ---------------- */

export function subjectState(store, subjectId) {
  const subject = store.getSubject(subjectId)
  if (!subject) return null
  const stageRow = store.db.prepare(
    'SELECT * FROM subject_stage WHERE subject_id = ? ORDER BY declared_on DESC, rowid DESC LIMIT 1',
  ).get(subjectId)
  return {
    id: subject.id,
    displayName: subject.display_name,
    role: subject.role,
    roleLabel: ROLE_LABELS[subject.role] ?? subject.role,
    laterality: subject.laterality,
    lateralityLabel: { left: '左', right: '右', bilateral: '双侧', unknown: '未声明' }[subject.laterality] ?? '未声明',
    stage: stageRow
      ? { code: stageRow.stage, label: STAGE_LABELS[stageRow.stage] ?? stageRow.stage, declaredOn: stageRow.declared_on }
      : null,
    createdAt: subject.created_at,
  }
}

/* ---------------- 资料与核对进度 ---------------- */

export function documentList(store, subjectId) {
  const rows = store.db.prepare(
    'SELECT * FROM document WHERE subject_id = ? ORDER BY imported_at DESC',
  ).all(subjectId)
  const countFor = store.db.prepare(
    `SELECT status, COUNT(*) AS n FROM candidate
     WHERE document_id = ? GROUP BY status`,
  )
  return rows.map((doc) => {
    const counts = { pending: 0, accepted: 0, edited: 0, rejected: 0, needs_review: 0 }
    for (const row of countFor.all(doc.id)) counts[row.status] = row.n
    const jobs = store.db.prepare(
      'SELECT * FROM parse_job WHERE document_id = ? ORDER BY started_at DESC LIMIT 3',
    ).all(doc.id)
    const open = counts.pending + counts.needs_review
    return {
      id: doc.id,
      kind: doc.kind,
      filename: doc.filename,
      mime: doc.mime,
      bytes: doc.bytes,
      pageCount: doc.page_count,
      sha256: doc.sha256,
      importedAt: doc.imported_at,
      storagePath: doc.storage_path,
      status: doc.status,
      reportDate: doc.report_date ?? null,
      candidates: counts,
      pendingCandidates: open,
      lastJob: jobs[0] ?? null,
      // 界面上「已核对 / 待核对」只看有没有未处理的候选，不等于临床审核
      reviewState: doc.status === 'parse_failed'
        ? 'parse_failed'
        : open > 0
          ? 'pending'
          : doc.status === 'parsed'
            ? 'reviewed'
            : 'unparsed',
    }
  })
}

export function documentCounts(documents) {
  const out = {
    total: documents.length,
    parsed: 0, failed: 0, unparsed: 0,
    pendingCandidates: 0, pendingDocuments: 0,
  }
  for (const d of documents) {
    if (d.status === 'parsed') out.parsed += 1
    else if (d.status === 'parse_failed') out.failed += 1
    else out.unparsed += 1
    if (d.pendingCandidates > 0) {
      out.pendingCandidates += d.pendingCandidates
      out.pendingDocuments += 1
    }
  }
  return out
}

/* ---------------- 指标序列 ---------------- */

function metricDefinitions(store) {
  return store.db.prepare(
    'SELECT * FROM metric_definition ORDER BY category, code',
  ).all()
}

/**
 * 一个指标的全部记录，按日期升序；`segments` 按 lab_method 断开。
 * `source` 优先给能点回去的材料名，没有材料才写"本人记录"。
 */
export function metricSeries(store, subjectId, { includeEmpty = true } = {}) {
  const definitions = metricDefinitions(store)
  const obs = store.db.prepare(
    `SELECT o.*, d.filename AS doc_name, r.source_kind AS r_source_kind
     FROM observation o
     LEFT JOIN record r ON r.id = o.record_id
     LEFT JOIN document d ON d.id = r.source_document_id
     WHERE o.subject_id = ?
     ORDER BY o.observed_on ASC, o.rowid ASC`,
  ).all(subjectId)

  const byCode = new Map()
  for (const row of obs) {
    if (!byCode.has(row.metric_code)) byCode.set(row.metric_code, [])
    byCode.get(row.metric_code).push({
      id: row.id,
      date: row.observed_on,
      value: row.value_num,
      unit: row.unit,
      method: row.lab_method ?? null,
      recordId: row.record_id ?? null,
      source: row.doc_name ?? SOURCE_KIND_LABELS[row.r_source_kind] ?? '本人记录',
      flag: row.flag ?? null,
    })
  }

  const series = definitions
    .map((def) => {
      const points = byCode.get(def.code) ?? []
      if (!includeEmpty && !points.length) return null
      const meta = CATEGORY[def.category] ?? { label: def.category, color: '#7a6a70', order: 9 }
      return {
        code: def.code,
        name: def.name,
        unit: def.unit,
        dec: def.dec,
        category: def.category,
        categoryLabel: meta.label,
        color: meta.color,
        order: meta.order,
        comparableBy: def.comparable_by,
        valueType: def.value_type,
        note: def.note ?? null,
        points,
        segments: splitByMethod(points),
        latest: points.length ? points[points.length - 1] : null,
        previous: points.length > 1 ? points[points.length - 2] : null,
        hasData: points.length > 0,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh'))

  return series
}

/** 方法变了就断线；连续同方法才连成一段。 */
function splitByMethod(points) {
  const segments = []
  let current = null
  for (const p of points) {
    const key = String(p.method ?? '')
    if (!current || current.key !== key) {
      current = { key, method: p.method ?? null, points: [] }
      segments.push(current)
    }
    current.points.push(p)
  }
  return segments.map(({ key, ...rest }) => rest)
}

/** 指标卡：每项一条，含"较前次"的中性差值（不做好坏着色）。 */
export function metricCards(store, subjectId, { withCtcae = true } = {}) {
  return metricSeries(store, subjectId).map((s) => ({
    code: s.code,
    name: s.name,
    unit: s.unit,
    dec: s.dec,
    categoryLabel: s.categoryLabel,
    color: s.color,
    count: s.points.length,
    latest: s.latest,
    previous: s.previous,
    delta: s.latest && s.previous ? num(s.latest.value - s.previous.value, s.dec) : null,
    recent: s.points.slice(-6),
    note: s.note,
    hasData: s.hasData,
    breakCount: Math.max(0, s.segments.length - 1),
    // CTCAE v5.0 对照（2026-10-20 用户定则）：只对最新值给分级；分级是客观区间对照，
    // 不是诊断（disclaimer 随 ctcaeInfo 透传给前端，前端必须显示来源与免责）。
    ctcae: withCtcae && s.latest ? gradeCtcae(s.code, s.latest.value) : null,
  }))
}

/* ---------------- 上肢四点位 ---------------- */

export function armHistory(store, subjectId) {
  const sets = store.db.prepare(
    'SELECT * FROM arm_set WHERE subject_id = ? ORDER BY measured_on ASC, rowid ASC',
  ).all(subjectId)
  const measurements = store.db.prepare(
    `SELECT * FROM measurement WHERE subject_id = ? AND set_id IS NOT NULL
     ORDER BY measured_on ASC, rowid ASC`,
  ).all(subjectId)
  const protocol = (id) => store.db.prepare('SELECT * FROM measure_protocol WHERE id = ?').get(id)

  const list = sets.map((set) => {
    const rows = measurements.filter((m) => m.set_id === set.id)
    const proto = protocol(set.protocol_id)
    const points = rows.map((m) => ({
      point: m.point,
      label: POINT_LABELS[m.point] ?? m.point,
      side: m.side,
      value: m.value_num,
      paired: m.paired_value_num,
      diff: m.derived_diff_num,
      unit: m.unit,
    }))
    const diffs = points.map((p) => p.diff).filter((d) => d !== null && d !== undefined)
    return {
      id: set.id,
      measuredOn: set.measured_on,
      assessorRole: set.assessor_role,
      assessorLabel: { patient: '本人', caregiver: '本人 + 家属', nurse: '护士', therapist: '康复治疗师', clinician: '医生', unknown: '未注明' }[set.assessor_role] ?? set.assessor_role,
      protocolId: set.protocol_id,
      protocolLabel: proto?.label ?? null,
      protocolPoints: proto?.points_json ? JSON.parse(proto.points_json) : null,
      note: set.note ?? null,
      points,
      maxDiff: diffs.length ? num(Math.max(...diffs), 1) : null,
      filled: points.length,
    }
  })

  const withDiff = list.filter((s) => s.maxDiff !== null)
  const latest = withDiff.length ? withDiff[withDiff.length - 1] : null
  const previous = withDiff.length > 1 ? withDiff[withDiff.length - 2] : null
  return {
    sets: list.slice().reverse(),
    latest,
    previous,
    count: list.length,
    delta: latest && previous ? num(latest.maxDiff - previous.maxDiff, 1) : null,
  }
}

/** 臂围差进一图秀：每次测量取四点位最大值，单点不连线由前端处理。 */
export function armSeries(store, subjectId) {
  const history = armHistory(store, subjectId)
  return history.sets
    .filter((s) => s.maxDiff !== null)
    .map((s) => ({
      id: s.id,
      date: s.measuredOn,
      value: s.maxDiff,
      unit: 'cm',
      source: `上肢测量记录 · ${s.protocolLabel ?? '四点位'}`,
      method: s.protocolLabel,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/* ---------------- 症状、看法、问题、待办 ---------------- */

export function symptomList(store, subjectId, { includePrivate = false } = {}) {
  const rows = store.db.prepare(
    `SELECT * FROM symptom_entry WHERE subject_id = ?
     ${includePrivate ? '' : 'AND is_private = 0'}
     ORDER BY occurred_on DESC, rowid DESC`,
  ).all(subjectId)
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: SYMPTOM_LABELS[r.code] ?? r.code,
    level: r.level,
    occurredOn: r.occurred_on,
    bodySide: r.body_side,
    note: r.note,
    subjectRole: r.subject_role,
    isPrivate: Boolean(r.is_private),
  }))
}

/* 默认**不含**私密条目：默认开启等于让每个新调用点都漏一次（A12/A27）。
 * 本人自己的页面要看全，得显式传 `{ includePrivate: true }`。 */
export function viewpointList(store, subjectId, { includePrivate = false } = {}) {
  const rows = store.db.prepare(
    `SELECT * FROM viewpoint WHERE subject_id = ? AND withdrawn_at IS NULL
     ${includePrivate ? '' : 'AND is_private = 0'}
     ORDER BY recorded_on DESC, rowid DESC`,
  ).all(subjectId)
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    speakerRole: r.speaker_role,
    speakerLabel: ROLE_LABELS[r.speaker_role] ?? r.speaker_role,
    recordedOn: r.recorded_on,
    isPrivate: Boolean(r.is_private),
    // 界面固定标注，不依赖调用方记得写
    disclaimer: '这是一条看法，不是医生结论',
  }))
}

export function questionList(store, subjectId, { includeDropped = false } = {}) {
  const rows = store.db.prepare(
    `SELECT * FROM question WHERE subject_id = ?
     ${includeDropped ? '' : "AND status <> 'dropped'"}
     ORDER BY created_at ASC, rowid ASC`,
  ).all(subjectId)
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    kind: r.kind,
    version: r.version,
    status: r.status,
    includeInExport: Boolean(r.include_in_export),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export function taskList(store, subjectId, { includeDone = true } = {}) {
  const rows = store.db.prepare(
    `SELECT * FROM task WHERE subject_id = ?
     ${includeDone ? '' : "AND status = 'open'"}
     ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, COALESCE(due_on, '9999-12-31'), created_at`,
  ).all(subjectId)
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    detail: r.detail,
    dueOn: r.due_on,
    kind: r.kind,
    kindLabel: TASK_KIND_LABELS[r.kind] ?? r.kind,
    ownerRole: r.owner_role,
    status: r.status,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  }))
}

/* ---------------- 治疗与临床 ---------------- */

export function treatmentList(store, subjectId) {
  const rows = store.treatmentsFor(subjectId)
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    kindLabel: TREATMENT_KIND_LABELS[r.kind] ?? r.kind,
    name: r.name,
    laterality: r.laterality,
    axillaryProcedure: r.axillary_procedure,
    radiationField: r.radiation_field,
    plannedStart: r.planned_start,
    plannedEnd: r.planned_end,
    actualStart: r.actual_start,
    actualEnd: r.actual_end,
    status: r.status,
    statusLabel: TREATMENT_STATUS_LABELS[r.status] ?? r.status,
    start: r.actual_start ?? r.planned_start,
    end: r.actual_end ?? r.planned_end,
    isActual: Boolean(r.actual_start),
    note: r.note,
  }))
}

export function diagnosisList(store, subjectId) {
  const rows = store.db.prepare(
    'SELECT * FROM diagnosis_note WHERE subject_id = ? ORDER BY noted_on DESC',
  ).all(subjectId)
  return rows.map((r) => ({
    id: r.id,
    notedOn: r.noted_on,
    specimenSite: r.specimen_site,
    histology: r.histology,
    grade: r.grade,
    stageText: r.stage_text,
    er: r.er_status,
    pr: r.pr_status,
    her2: r.her2_status,
    ki67: r.ki67_percent,
    isTranscription: Boolean(r.is_transcription),
  }))
}

/* 与 viewpointList 同理：默认**不含**私密条目（D39）。营养与心理页看的是本人记录，
 * 在那两处显式传 `includePrivate: true`。 */
export function careList(store, subjectId, { includePrivate = false, kinds = null } = {}) {
  const rows = store.db.prepare(
    `SELECT * FROM care_entry WHERE subject_id = ?
     ${includePrivate ? '' : 'AND is_private = 0'}
     ORDER BY COALESCE(source_date, created_at) DESC, rowid DESC`,
  ).all(subjectId)
  return rows
    .filter((r) => !kinds || kinds.includes(r.kind))
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      kindLabel: CARE_KIND_LABELS[r.kind] ?? r.kind,
      stage: r.stage,
      title: r.title,
      detail: r.detail,
      sourceKind: r.source_kind,
      sourceLabel: SOURCE_KIND_LABELS[r.source_kind] ?? r.source_kind,
      sourceDate: r.source_date,
      isPrivate: Boolean(r.is_private),
      createdAt: r.created_at,
    }))
}

/* ---------------- 导出 ---------------- */

const fmt = (v, dec = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(dec))
const unitText = (unit) => (!unit || unit === '—' ? '' : unit)
const d10 = (d) => (d ? String(d).replace(/-/g, '.') : '—')

/**
 * 就诊准备 Markdown。分区固定：事实 / 派生 / 我的看法 / 想问的事。
 * 只写选入项；私密记录不进来；不写任何判断与处置。
 */
export function renderVisitMarkdown({
  subject, stageLabel, generatedAt,
  questions = [], viewpoints = [], metrics = [], arm = null, treatments = [], documents = [],
}) {
  const lines = []
  lines.push('# 就诊准备 · 小粉宝工作台')
  lines.push('')
  lines.push(`生成时间：${d10(generatedAt)}　档案：${subject?.displayName ?? '—'}${stageLabel ? `　当前阶段：${stageLabel}` : ''}`)
  lines.push('')
  lines.push('> 本文件由本人整理，用于和医生沟通。里面的数值与日期来自本人记录与报告转录，**不是诊断，也不代表治疗意见**；是否处理由治疗团队判断。')
  lines.push('')

  lines.push('## 一、事实：最近的记录')
  lines.push('')
  if (metrics.length) {
    lines.push('| 指标 | 最新值 | 日期 | 来源 |')
    lines.push('| --- | --- | --- | --- |')
    for (const m of metrics) {
      lines.push(`| ${m.name} | ${fmt(m.value, m.dec)} ${unitText(m.unit)} | ${d10(m.date)} | ${m.source ?? '本人记录'} |`)
    }
  } else {
    lines.push('（本次未选入指标）')
  }
  lines.push('')

  if (arm && arm.latest) {
    lines.push('### 上肢四点位测量')
    lines.push('')
    lines.push(`- 最近一次：${d10(arm.latest.measuredOn)}，四点位最大差值 ${fmt(arm.latest.maxDiff, 1)} cm（患侧 − 健侧）`)
    if (arm.previous) {
      lines.push(`- 前一次：${d10(arm.previous.measuredOn)}，${fmt(arm.previous.maxDiff, 1)} cm；两次相差 ${arm.delta > 0 ? '+' : ''}${fmt(arm.delta, 1)} cm`)
    }
    lines.push(`- 测量协议：${arm.latest.protocolLabel ?? '四点位'}；测量者：${arm.latest.assessorLabel}`)
    lines.push('- 口径说明：2cm 是提示进一步评估的常用参考线，不是诊断标准；不同协议、不同点位的数值不可直接比较。')
    lines.push('')
  }

  if (treatments.length) {
    lines.push('### 治疗行程（实际接受）')
    lines.push('')
    for (const t of treatments) {
      const span = t.start ? `${d10(t.start)}${t.end && t.end !== t.start ? ` — ${d10(t.end)}` : ''}` : '日期待确认'
      lines.push(`- ${t.kindLabel}：${t.name}（${span}）`)
    }
    lines.push('')
  }

  if (documents.length) {
    lines.push('### 本次引用的材料')
    lines.push('')
    for (const doc of documents) {
      lines.push(`- ${doc.filename}${doc.reportDate ? `（报告日期 ${d10(doc.reportDate)}）` : ''}`)
    }
    lines.push('')
  }

  lines.push('## 二、派生：和上次比')
  lines.push('')
  const deltas = metrics.filter((m) => m.delta !== null && m.delta !== undefined)
  if (deltas.length) {
    lines.push('下面只是两次记录相减，不表示好转或变差。')
    lines.push('')
    for (const m of deltas) {
      lines.push(`- ${m.name}：${m.delta > 0 ? '+' : ''}${fmt(m.delta, m.dec)} ${unitText(m.unit)}（较前次）`)
    }
  } else {
    lines.push('（本次没有可比较的两次记录）')
  }
  lines.push('')

  lines.push('## 三、我的看法与担心')
  lines.push('')
  lines.push('> 以下是我的看法与担心，**不是医生结论**，只作为一条信息供沟通参考。')
  lines.push('')
  if (viewpoints.length) {
    for (const v of viewpoints) {
      lines.push(`- ${v.text}（${d10(v.recordedOn)} · ${v.speakerLabel ?? '本人'}记录）`)
    }
  } else {
    lines.push('（本次无）')
  }
  lines.push('')

  lines.push('## 四、想问的事')
  lines.push('')
  const facts = questions.filter((q) => q.kind !== 'view')
  const views = questions.filter((q) => q.kind === 'view')
  if (facts.length) {
    facts.forEach((q, i) => lines.push(`${i + 1}. ${q.text}`))
  } else {
    lines.push('（本次未选入）')
  }
  if (views.length) {
    lines.push('')
    lines.push('另外，下面这些是我想说的感受，不是提问：')
    for (const q of views) lines.push(`- ${q.text}（我的看法 · 不是医生结论）`)
  }
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('小粉宝工作台只整理信息，不做诊断、不给处置建议；检查结果的含义与下一步安排请以治疗团队意见为准。')
  lines.push('')
  return lines.join('\n')
}

/** 导出快照指纹：用于判断"导出之后又有新记录"（A14 的读取时实现）。 */
export function exportFingerprint(store, subjectId) {
  const parts = []
  for (const row of store.db.prepare(
    `SELECT id, occurred_on, recorded_at FROM record
     WHERE subject_id = ? ORDER BY id`,
  ).all(subjectId)) parts.push(`r:${row.id}:${row.occurred_on}:${row.recorded_at}`)
  for (const row of store.db.prepare(
    'SELECT id FROM question WHERE subject_id = ? AND status <> \'dropped\' ORDER BY id',
  ).all(subjectId)) parts.push(`q:${row.id}`)
  for (const row of store.db.prepare(
    'SELECT id FROM viewpoint WHERE subject_id = ? AND withdrawn_at IS NULL ORDER BY id',
  ).all(subjectId)) parts.push(`v:${row.id}`)
  return parts.join('|')
}

export function exportHistory(store, subjectId) {
  const rows = store.db.prepare(
    'SELECT * FROM export_job WHERE subject_id = ? ORDER BY created_at DESC',
  ).all(subjectId)
  const current = exportFingerprint(store, subjectId)
  return rows.map((r) => {
    let scope = null
    try { scope = JSON.parse(r.scope_json) } catch { scope = null }
    return {
      id: r.id,
      format: r.format,
      createdAt: r.created_at,
      scope,
      contentHash: r.content_hash,
      // 只读时判断，不写库：导出之后的任何新记录都会让它变成"可能已过时"
      isStale: r.content_hash ? r.content_hash !== hashOf(current) : null,
    }
  })
}

export function hashOf(text) {
  // 这里只需要稳定指纹，不用于安全用途
  let h1 = 0x811c9dc5
  let h2 = 0x1000193
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}

/* ---------------- 看板 ---------------- */

export function overview(store, subjectId) {
  const subject = subjectState(store, subjectId)
  const documents = documentList(store, subjectId)
  const arm = armHistory(store, subjectId)
  const questions = questionList(store, subjectId)
  const tasks = taskList(store, subjectId)
  const metrics = metricCards(store, subjectId)
  const symptoms = symptomList(store, subjectId)
  const treatments = treatmentList(store, subjectId)

  const withData = metrics.filter((m) => m.hasData)
  const recent = withData
    .map((m) => ({
      code: m.code, name: m.name, unit: m.unit, dec: m.dec,
      value: m.latest.value, date: m.latest.date, source: m.latest.source,
      delta: m.delta, categoryLabel: m.categoryLabel, color: m.color,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 4)

  const newest = store.db.prepare(
    'SELECT MAX(recorded_at) AS at FROM record WHERE subject_id = ?',
  ).get(subjectId)
  const latestSymptom = symptoms[0] ?? null

  return {
    subject,
    documents: documentCounts(documents),
    arm,
    metrics: {
      total: metrics.length,
      withData: withData.length,
      seriesBreak: withData.filter((m) => m.breakCount > 0).length,
    },
    questions: {
      open: questions.filter((q) => q.status === 'open').length,
      selected: questions.filter((q) => q.includeInExport).length,
    },
    tasks: {
      open: tasks.filter((t) => t.status === 'open').length,
      list: tasks.filter((t) => t.status === 'open').slice(0, 4),
    },
    treatments: {
      total: treatments.length,
      ongoing: treatments.filter((t) => t.status === 'ongoing').length,
      actual: treatments.filter((t) => t.isActual).length,
    },
    symptoms: { total: symptoms.length, latest: latestSymptom },
    recent,
    newestRecordAt: newest?.at ?? null,
  }
}
