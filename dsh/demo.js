/**
 * 五套演示画像（G2-5.2）。**全部是模拟数据**，名称、日期、数值均为构造，不对应任何真实患者。
 *
 * 三条硬要求（来自 docs/DEMO-CHECKLIST.md §G2-5.2）：
 * 1. 每套都带 `[UI DEMO]` 标记，界面与导出都不能被误认为真实病历；
 * 2. 清理只删 **manifest 登记的工作区**，不按"名字看起来像 demo"判断；
 * 3. 每套至少留一处**故意为空**的字段，用来验空态——不留空的 demo 验不出空态 bug。
 *
 * DEMO-2 是例外：它存在的意义就是"几乎没有资料"，所以不做 ≥120 条的体量要求。
 * 其余四套按 ≥120 条观测/测量构造，用于验列表滚动与图表重绘。
 */
import { createHash } from 'node:crypto'
import { ImportService } from './import.js'

const fakeSha = (text) => createHash('sha256').update(`[UI DEMO] ${text}`).digest('hex')

export const DEMO_MARKER = '[UI DEMO]'
export const DEMO_AS_OF = '2026-10-17'

export const DEMO_DATASETS = [
  { id: 'DEMO-1', label: '全程完整', note: '左 / 改良根治 + 腋窝清扫 / 内分泌治疗；16 项指标齐全' },
  { id: 'DEMO-2', label: '新确诊、资料极少', note: '右 / 未手术 / 刚确诊；以空态为主' },
  { id: 'DEMO-3', label: '保乳 + 前哨淋巴结', note: '右 / 保乳 + SLNB / 放疗期间；臂围差长期 0.2–0.4' },
  { id: 'DEMO-4', label: '双侧 + 复发', note: '双侧 / 两次手术 / 复发后治疗；侧别歧义、指标断线' },
  { id: 'DEMO-5', label: '数据冲突 / 待核对', note: '左 / 根治 / 随访；同指标两法不同值、一条更正、一份待核对' },
]

/* ---------------- 确定性伪随机（保证每次生成同一套数据） ---------------- */

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedOf(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const DAY = 86400000
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const round = (n, dec) => Number(n.toFixed(dec))

/** 一条指标序列；同一条序列共用同一方法，保证可连线。 */
function series(store, subjectId, code, { start, stepDays, count, base, spread, dec = 1, unit = null, method = null, rnd, drift = 0 }) {
  let last = base
  for (let i = 0; i < count; i += 1) {
    last = base + drift * i + (rnd() - 0.5) * spread
    store.addObservation({
      subjectId,
      metricCode: code,
      observedOn: addDays(start, i * stepDays),
      value: round(last, dec),
      unit,
      labMethod: method,
    })
  }
}

function fourPointSet(store, subjectId, measuredOn, targetDiff, { rnd, base = 22 }) {
  const points = ['wrist', 'forearm_mid', 'above_elbow_10', 'below_axilla_10']
  const ratios = [0.62, 0.85, 1, 0.74]
  const healthy = points.map((_, i) => round(base + i * 2.4 + (rnd() - 0.5) * 0.4, 1))
  const rows = points.map((point, i) => ({
    point,
    affected: round(healthy[i] + targetDiff * ratios[i], 1),
    healthy: healthy[i],
  }))
  return store.addArmSet({ subjectId, measuredOn, points: rows })
}


/**
 * 演示用的"周围那些小记录"：看法、问题、待办、康复与营养条目。
 *
 * 为什么要有：v0.4.0 的界面里「我的关注」「收藏与回顾」「近期安排」都读这些表，
 * 演示画像如果只塞指标，这几个页面就是空的——空页面验不出界面 bug，也让人以为功能没做。
 * 全部是构造文本，带"（模拟）"字样，且 id 固定（同一套两次生成不产生额外差异）。
 */
function addExtras(store, subjectId, { views = [], questions = [], tasks = [], care = [] }) {
  const now = `${DEMO_AS_OF}T09:00:00.000Z`
  let n = 0
  for (const v of views) {
    n += 1
    store.db.prepare(`INSERT INTO viewpoint
      (id, subject_id, text, speaker_role, about_code, recorded_on, is_conclusion, is_private)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
      .run(`vp_${subjectId}_${n}`, subjectId, v.text, v.role ?? 'patient', v.about ?? null, v.on, v.private ? 1 : 0)
  }
  n = 0
  for (const q of questions) {
    n += 1
    store.db.prepare(`INSERT INTO question
      (id, subject_id, text, version, supersedes_id, kind, status, include_in_export, created_at, updated_at)
      VALUES (?, ?, ?, 1, NULL, ?, ?, ?, ?, ?)`)
      .run(`q_${subjectId}_${n}`, subjectId, q.text, q.kind ?? 'fact', q.status ?? 'open',
        q.includeInExport === false ? 0 : 1, q.createdAt ?? now, q.createdAt ?? now)
  }
  n = 0
  for (const task of tasks) {
    n += 1
    store.db.prepare(`INSERT INTO task
      (id, subject_id, title, detail, due_on, kind, owner_role, status, completed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'patient', ?, ?, ?)`)
      .run(`task_${subjectId}_${n}`, subjectId, task.title, task.detail ?? null, task.dueOn ?? null,
        task.kind ?? 'self', task.status ?? 'open', task.doneAt ?? null, now)
  }
  n = 0
  for (const c of care) {
    n += 1
    store.db.prepare(`INSERT INTO care_entry
      (id, subject_id, stage, kind, title, detail, source_kind, source_date, is_private, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(`care_${subjectId}_${n}`, subjectId, c.stage ?? null, c.kind, c.title, c.detail ?? null,
        c.sourceKind ?? 'patient_reported', c.on ?? null, c.private ? 1 : 0, now)
  }
}

/* ---------------- 各套画像 ---------------- */

function buildDemo1(store, { workspaceId, rnd }) {
  const subject = store.createSubject({
    workspaceId, displayName: '林女士（模拟）', role: 'patient',
    birthYear: 1972, sex: 'female', laterality: 'left', menopause: 'post',
  })
  store.addStage({ subjectId: subject.id, stage: 'endocrine', declaredOn: '2026-06-20' })

  const surgery = store.addTreatment({
    subjectId: subject.id, kind: 'surgery', name: '左乳改良根治 + 腋窝淋巴结清扫',
    laterality: 'left', axillaryProcedure: 'alnd',
    plannedStart: '2026-01-20', actualStart: '2026-01-20', actualEnd: '2026-01-20', status: 'completed',
    note: '模拟数据',
  })
  store.addTreatment({
    subjectId: subject.id, kind: 'chemo', name: 'EC ×4 → 紫杉醇 ×4',
    plannedStart: '2026-02-10', plannedEnd: '2026-07-07',
    actualStart: '2026-02-10', actualEnd: '2026-07-07', status: 'completed', note: '模拟数据',
  })
  store.addTreatment({
    subjectId: subject.id, kind: 'radio', name: '胸壁 + 锁骨上放疗 25 次',
    radiationField: '胸壁 + 锁骨上',
    plannedStart: '2026-06-15', plannedEnd: '2026-07-24',
    actualStart: '2026-06-15', actualEnd: '2026-07-24', status: 'completed', note: '模拟数据',
  })
  store.addTreatment({
    subjectId: subject.id, kind: 'endocrine', name: '来曲唑（计划 5 年）',
    plannedStart: '2026-06-20', actualStart: '2026-06-20', status: 'ongoing', note: '模拟数据',
  })

  // 化疗期血常规：4 项 × 12 次 = 48
  for (const [code, base, spread, dec] of [['wbc', 4.2, 2.6, 2], ['anc', 2.1, 1.8, 2], ['hgb', 112, 16, 0], ['plt', 190, 90, 0]]) {
    series(store, subject.id, code, { start: '2026-02-10', stepDays: 14, count: 12, base, spread, dec, rnd })
  }
  // 生化 2 × 8 = 16
  series(store, subject.id, 'alt', { start: '2026-02-24', stepDays: 21, count: 8, base: 28, spread: 18, dec: 0, rnd })
  series(store, subject.id, 'cr', { start: '2026-02-24', stepDays: 21, count: 8, base: 62, spread: 10, dec: 0, rnd })
  // 肿瘤标志物 2 × 6 = 12
  series(store, subject.id, 'ca153', { start: '2026-01-22', stepDays: 45, count: 6, base: 16, spread: 5, dec: 1, method: 'ECLIA', rnd })
  series(store, subject.id, 'cea', { start: '2026-01-22', stepDays: 45, count: 6, base: 2.1, spread: 0.8, dec: 1, method: 'ECLIA', rnd })
  // 心功能与骨健康 3 + 1
  series(store, subject.id, 'lvef', { start: '2026-01-12', stepDays: 120, count: 3, base: 65, spread: 3, dec: 0, method: '超声心动图', rnd })
  series(store, subject.id, 'bmd_ls', { start: '2026-07-30', stepDays: 1, count: 1, base: -1.3, spread: 0.2, dec: 1, method: 'DXA', rnd })
  // 体成分 2 × 12 = 24
  series(store, subject.id, 'weight', { start: '2026-02-10', stepDays: 14, count: 12, base: 63, spread: 1.6, dec: 1, drift: -0.15, rnd })
  series(store, subject.id, 'bmi', { start: '2026-02-10', stepDays: 14, count: 12, base: 24.4, spread: 0.6, dec: 1, drift: -0.05, rnd })
  // 术后引流 6
  series(store, subject.id, 'drain_vol', { start: '2026-01-21', stepDays: 1, count: 6, base: 55, spread: 30, dec: 0, rnd })
  // 康复测量 3 × 4 = 12
  series(store, subject.id, 'grip', { start: '2026-03-02', stepDays: 75, count: 4, base: 22, spread: 3, dec: 1, method: '握力计', rnd })
  series(store, subject.id, 'arm_flex', { start: '2026-03-02', stepDays: 75, count: 4, base: 158, spread: 10, dec: 0, method: '量角器', rnd })
  series(store, subject.id, 'arm_abd', { start: '2026-03-02', stepDays: 75, count: 4, base: 138, spread: 12, dec: 0, method: '量角器', rnd })

  for (const [date, diff] of [['2026-03-02', 0.8], ['2026-05-10', 1.4], ['2026-07-20', 1.9], ['2026-10-14', 2.2]]) {
    fourPointSet(store, subject.id, date, diff, { rnd })
  }

  store.addSymptom({ subjectId: subject.id, code: 'arm_heaviness', level: 2, occurredOn: '2026-10-14', bodySide: 'left', note: '下午和晚上更明显（模拟）' })
  store.addSymptom({ subjectId: subject.id, code: 'ai_joint', level: 2, occurredOn: '2026-10-14', note: '晨起手指僵硬约 20 分钟（模拟）' })
  store.addSymptom({ subjectId: subject.id, code: 'fatigue', level: 1, occurredOn: '2026-09-20', note: '模拟' })
  // 骨髓抑制的两个面（2026-10-20 定则）：表达上「头晕 + 疲乏」，指标上「中性粒细胞低」。
  // 序列是伪随机的，末点落在哪一级不保证；这里显式补最近一次血常规与一条头晕感受，
  // 让 CTCAE 对照徽章和看板提醒在演示数据里**稳定可见**——数值仍是构造值，不是真实病历。
  store.addSymptom({ subjectId: subject.id, code: 'dizziness', level: 2, occurredOn: '2026-10-16', note: '起身时明显（模拟）' })
  store.addObservation({ subjectId: subject.id, metricCode: 'anc', observedOn: '2026-10-16', value: 0.8, unit: '10⁹/L' })
  store.addObservation({ subjectId: subject.id, metricCode: 'wbc', observedOn: '2026-10-16', value: 2.6, unit: '10⁹/L' })

  // 一份已核对完的血常规：两条候选都已接受，草稿里不留待办
  const importer = new ImportService(store)
  const { document } = importer.importDocument({
    subjectId: subject.id, kind: 'lab', filename: '2026-09-28-血常规.pdf',
    sha256: fakeSha('DEMO-1 lab'), storagePath: 'docs/demo1-lab-20260928.pdf',
    mime: 'application/pdf', bytes: 182734, pageCount: 2,
  })
  const job = importer.startParse(document.id, { engine: 'demo' })
  importer.finishParse(job.id)
  for (const c of [
    { field: 'metric:wbc', valueText: '3.8', valueNum: 3.8, unit: '10⁹/L', method: '血细胞分析', pageRef: 'p1', confidence: 0.93 },
    { field: 'metric:ca153', valueText: '16.4', valueNum: 16.4, unit: 'U/mL', method: 'ECLIA', pageRef: 'p1', confidence: 0.9 },
  ]) importer.addCandidate({ documentId: document.id, ...c })
  importer.acceptDocumentCandidates({ documentId: document.id, occurredOn: '2026-09-28' })

  addExtras(store, subject.id, {
    views: [
      { text: '爬两层楼就喘，不知道是不是最近活动太少（模拟）', on: '2026-10-14', about: 'fatigue' },
      { text: '这条只想自己记着：担心复查结果（模拟）', on: '2026-10-15', private: true },
    ],
    questions: [
      { text: '骨密度这次要不要复查？（模拟）', kind: 'fact' },
      { text: '来曲唑还要吃多久，什么时候可以停？（模拟）', kind: 'fact' },
      { text: '手臂这些动作平时能不能做？（模拟）', kind: 'fact', status: 'asked' },
    ],
    tasks: [
      { title: '把上肢记录带去康复科（模拟）', dueOn: '2026-10-20', kind: 'hospital' },
      { title: '预约下一次复查（模拟）', dueOn: '2026-11-05', kind: 'hospital' },
      { title: '整理这次想问的三件事（模拟）', status: 'done', doneAt: '2026-10-16T10:00:00.000Z' },
    ],
    care: [
      { kind: 'rehab_advice', title: '康复科口头建议（模拟）', detail: '每次 10 分钟，以不引起明显酸胀为度；具体以治疗师当面意见为准', on: '2026-09-30', sourceKind: 'stored_advice' },
      { kind: 'nutrition', title: '进食：早餐加了一个鸡蛋（模拟）', detail: '化疗后第 3 天，胃口一般', on: '2026-10-12' },
      { kind: 'mind', title: '本人记录（模拟）', detail: '今天状态还行，晚上睡得早', on: '2026-10-13', private: true },
    ],
  })

  return {
    subject,
    gaps: ['放疗皮肤反应未记录', '生育与性健康未记录', '未做遗传咨询记录'],
    note: '16 项指标齐全，4 次四点位；故意留空：放疗皮肤、生育相关',
    surgery,
  }
}

function buildDemo2(store, { workspaceId, rnd }) {
  const subject = store.createSubject({
    workspaceId, displayName: '新确诊（模拟）', role: 'patient',
    birthYear: 1985, sex: 'female', laterality: 'right', menopause: 'pre',
  })
  store.addStage({ subjectId: subject.id, stage: 'newly_diagnosed', declaredOn: '2026-10-10' })
  // 只有一次术前检查；治疗、测量、文档全空——这就是这套画像要验的东西
  series(store, subject.id, 'ca153', { start: '2026-10-12', stepDays: 1, count: 1, base: 19, spread: 0.4, dec: 1, method: 'ECLIA', rnd })
  return {
    subject,
    gaps: ['无治疗记录', '无上肢测量', '无任何材料', '未选资料目录'],
    note: '空态画像：只有 1 次术前指标，其余全空',
  }
}

function buildDemo3(store, { workspaceId, rnd }) {
  const subject = store.createSubject({
    workspaceId, displayName: '保乳（模拟）', role: 'patient',
    birthYear: 1968, sex: 'female', laterality: 'right', menopause: 'post',
  })
  store.addStage({ subjectId: subject.id, stage: 'radiotherapy', declaredOn: '2026-06-01' })

  store.addTreatment({
    subjectId: subject.id, kind: 'surgery', name: '右乳保乳 + 前哨淋巴结活检',
    laterality: 'right', axillaryProcedure: 'slnb',
    plannedStart: '2026-05-06', actualStart: '2026-05-06', actualEnd: '2026-05-06', status: 'completed', note: '模拟数据',
  })
  store.addTreatment({
    subjectId: subject.id, kind: 'radio', name: '全乳放疗 25 次',
    radiationField: '全乳', plannedStart: '2026-06-01', plannedEnd: '2026-07-10',
    actualStart: '2026-06-01', actualEnd: '2026-07-10', status: 'completed', note: '模拟数据',
  })

  for (const [code, base, spread, dec] of [['wbc', 5.1, 1.8, 2], ['anc', 2.8, 1.2, 2], ['hgb', 121, 12, 0], ['plt', 210, 60, 0]]) {
    series(store, subject.id, code, { start: '2026-05-06', stepDays: 21, count: 10, base, spread, dec, rnd })
  }
  series(store, subject.id, 'alt', { start: '2026-05-06', stepDays: 28, count: 8, base: 24, spread: 12, dec: 0, rnd })
  series(store, subject.id, 'cr', { start: '2026-05-06', stepDays: 28, count: 8, base: 58, spread: 8, dec: 0, rnd })
  series(store, subject.id, 'ca153', { start: '2026-05-08', stepDays: 30, count: 10, base: 13, spread: 3, dec: 1, method: 'ECLIA', rnd })
  series(store, subject.id, 'cea', { start: '2026-05-08', stepDays: 30, count: 10, base: 1.8, spread: 0.5, dec: 1, method: 'ECLIA', rnd })
  series(store, subject.id, 'lvef', { start: '2026-05-06', stepDays: 120, count: 2, base: 66, spread: 2, dec: 0, method: '超声心动图', rnd })
  series(store, subject.id, 'bmd_ls', { start: '2026-08-01', stepDays: 1, count: 1, base: -0.6, spread: 0.1, dec: 1, method: 'DXA', rnd })
  series(store, subject.id, 'weight', { start: '2026-05-06', stepDays: 21, count: 10, base: 59, spread: 1.2, dec: 1, rnd })
  series(store, subject.id, 'bmi', { start: '2026-05-06', stepDays: 21, count: 10, base: 23.1, spread: 0.5, dec: 1, rnd })
  series(store, subject.id, 'grip', { start: '2026-06-01', stepDays: 30, count: 6, base: 24, spread: 2, dec: 1, method: '握力计', rnd })
  series(store, subject.id, 'arm_flex', { start: '2026-06-01', stepDays: 30, count: 6, base: 165, spread: 6, dec: 0, method: '量角器', rnd })
  series(store, subject.id, 'arm_abd', { start: '2026-06-01', stepDays: 30, count: 6, base: 150, spread: 8, dec: 0, method: '量角器', rnd })
  series(store, subject.id, 'drain_vol', { start: '2026-05-07', stepDays: 1, count: 3, base: 35, spread: 15, dec: 0, rnd })

  // 没有腋窝清扫 → 臂围差长期 0.2–0.4
  for (const [date, diff] of [
    ['2026-06-01', 0.2], ['2026-06-20', 0.3], ['2026-07-10', 0.2],
    ['2026-08-05', 0.4], ['2026-09-02', 0.3], ['2026-10-06', 0.2],
  ]) {
    fourPointSet(store, subject.id, date, diff, { rnd })
  }

  store.addSymptom({ subjectId: subject.id, code: 'skin_reaction', level: 1, occurredOn: '2026-06-25', bodySide: 'right', note: '照射区发红、发干（模拟）' })
  return {
    subject,
    gaps: ['无腋窝清扫记录', '无内分泌治疗记录'],
    note: '保乳 + SLNB，无腋窝清扫 → 臂围差长期 0.2–0.4',
  }
}

function buildDemo4(store, { workspaceId, rnd }) {
  const subject = store.createSubject({
    workspaceId, displayName: '双侧复发（模拟）', role: 'patient',
    birthYear: 1961, sex: 'female', laterality: 'bilateral', menopause: 'post',
  })
  store.addStage({ subjectId: subject.id, stage: 'metastatic', declaredOn: '2026-08-15' })

  store.addTreatment({
    subjectId: subject.id, kind: 'surgery', name: '左乳改良根治 + 腋窝清扫',
    laterality: 'left', axillaryProcedure: 'alnd',
    actualStart: '2024-03-11', actualEnd: '2024-03-11', status: 'completed', note: '模拟数据',
  })
  store.addTreatment({
    subjectId: subject.id, kind: 'surgery', name: '右乳改良根治 + 腋窝清扫',
    laterality: 'right', axillaryProcedure: 'alnd',
    actualStart: '2025-09-02', actualEnd: '2025-09-02', status: 'completed', note: '模拟数据',
  })
  store.addTreatment({
    subjectId: subject.id, kind: 'chemo', name: '多西他赛 + 卡铂',
    actualStart: '2026-08-20', status: 'ongoing', note: '模拟数据',
  })
  store.addTreatment({
    subjectId: subject.id, kind: 'targeted', name: '靶向治疗（模拟）',
    actualStart: '2026-08-20', status: 'ongoing', note: '模拟数据',
  })

  for (const [code, base, spread, dec] of [['wbc', 3.9, 2.2, 2], ['anc', 1.9, 1.4, 2], ['hgb', 104, 14, 0], ['plt', 175, 70, 0]]) {
    series(store, subject.id, code, { start: '2024-04-02', stepDays: 60, count: 10, base, spread, dec, rnd })
  }
  series(store, subject.id, 'alt', { start: '2024-04-02', stepDays: 60, count: 10, base: 32, spread: 16, dec: 0, rnd })
  series(store, subject.id, 'cr', { start: '2024-04-02', stepDays: 60, count: 10, base: 68, spread: 12, dec: 0, rnd })
  // 指标断线：同指标换了方法（前 5 次 ECLIA，后 5 次 CLIA），前后不可比
  series(store, subject.id, 'ca153', { start: '2024-04-02', stepDays: 90, count: 5, base: 22, spread: 6, dec: 1, method: 'ECLIA', rnd })
  series(store, subject.id, 'ca153', { start: '2025-09-10', stepDays: 90, count: 5, base: 34, spread: 8, dec: 1, method: 'CLIA', rnd })
  series(store, subject.id, 'cea', { start: '2024-04-02', stepDays: 90, count: 10, base: 3.2, spread: 1.4, dec: 1, method: 'ECLIA', rnd })
  series(store, subject.id, 'lvef', { start: '2024-03-20', stepDays: 210, count: 4, base: 61, spread: 5, dec: 0, method: '超声心动图', rnd })
  series(store, subject.id, 'bmd_ls', { start: '2024-06-01', stepDays: 420, count: 2, base: -1.8, spread: 0.3, dec: 1, method: 'DXA', rnd })
  series(store, subject.id, 'weight', { start: '2024-04-02', stepDays: 60, count: 10, base: 61, spread: 2.2, dec: 1, rnd })
  series(store, subject.id, 'bmi', { start: '2024-04-02', stepDays: 60, count: 10, base: 24.8, spread: 0.8, dec: 1, rnd })
  series(store, subject.id, 'grip', { start: '2026-08-20', stepDays: 14, count: 6, base: 17, spread: 3, dec: 1, method: '握力计', rnd })
  series(store, subject.id, 'arm_flex', { start: '2026-08-20', stepDays: 14, count: 6, base: 132, spread: 12, dec: 0, method: '量角器', rnd })
  series(store, subject.id, 'arm_abd', { start: '2026-08-20', stepDays: 14, count: 6, base: 118, spread: 14, dec: 0, method: '量角器', rnd })

  // 故意不建 arm_set：laterality='bilateral' 时无法判定患健侧，必须由用户先选侧（A9 的前置）
  store.addSymptom({ subjectId: subject.id, code: 'pain', level: 2, occurredOn: '2026-09-30', bodySide: 'bilateral', note: '模拟' })
  return {
    subject,
    gaps: ['侧别未细分：双侧档案无法判定患健侧，左上肢/右上肢需分别选侧', '无四点位测量（需先选侧）'],
    note: '双侧 + 两次手术 + 复发；ca153 疗法变更导致断线',
  }
}

function buildDemo5(store, { workspaceId, rnd }) {
  const subject = store.createSubject({
    workspaceId, displayName: '随访待核对（模拟）', role: 'patient',
    birthYear: 1970, sex: 'female', laterality: 'left', menopause: 'post',
  })
  store.addStage({ subjectId: subject.id, stage: 'followup', declaredOn: '2026-09-01' })

  store.addTreatment({
    subjectId: subject.id, kind: 'surgery', name: '左乳根治术',
    laterality: 'left', axillaryProcedure: 'alnd',
    actualStart: '2025-04-08', actualEnd: '2025-04-08', status: 'completed', note: '模拟数据',
  })
  store.addTreatment({
    subjectId: subject.id, kind: 'endocrine', name: '他莫昔芬（计划 5 年）',
    actualStart: '2025-05-20', status: 'ongoing', note: '模拟数据',
  })

  for (const [code, base, spread, dec] of [['wbc', 5.4, 1.4, 2], ['anc', 3.0, 0.9, 2], ['hgb', 126, 10, 0], ['plt', 225, 45, 0]]) {
    series(store, subject.id, code, { start: '2025-05-06', stepDays: 30, count: 8, base, spread, dec, rnd })
  }
  series(store, subject.id, 'alt', { start: '2025-05-06', stepDays: 30, count: 8, base: 22, spread: 10, dec: 0, rnd })
  series(store, subject.id, 'cr', { start: '2025-05-06', stepDays: 30, count: 8, base: 60, spread: 7, dec: 0, rnd })
  series(store, subject.id, 'ca153', { start: '2025-05-06', stepDays: 30, count: 11, base: 15, spread: 4, dec: 1, method: 'ECLIA', rnd })
  series(store, subject.id, 'cea', { start: '2025-05-06', stepDays: 30, count: 11, base: 1.9, spread: 0.6, dec: 1, method: 'ECLIA', rnd })
  series(store, subject.id, 'lvef', { start: '2025-04-20', stepDays: 180, count: 3, base: 64, spread: 3, dec: 0, method: '超声心动图', rnd })
  series(store, subject.id, 'bmd_ls', { start: '2025-06-01', stepDays: 400, count: 2, base: -1.1, spread: 0.2, dec: 1, method: 'DXA', rnd })
  series(store, subject.id, 'weight', { start: '2025-05-06', stepDays: 30, count: 10, base: 64, spread: 1.4, dec: 1, rnd })
  series(store, subject.id, 'bmi', { start: '2025-05-06', stepDays: 30, count: 10, base: 25.2, spread: 0.6, dec: 1, rnd })
  series(store, subject.id, 'grip', { start: '2025-05-20', stepDays: 20, count: 8, base: 21, spread: 2.5, dec: 1, method: '握力计', rnd })
  series(store, subject.id, 'arm_flex', { start: '2025-05-20', stepDays: 20, count: 8, base: 152, spread: 8, dec: 0, method: '量角器', rnd })
  series(store, subject.id, 'arm_abd', { start: '2025-05-20', stepDays: 20, count: 8, base: 134, spread: 9, dec: 0, method: '量角器', rnd })
  series(store, subject.id, 'drain_vol', { start: '2025-04-09', stepDays: 1, count: 2, base: 40, spread: 12, dec: 0, rnd })

  for (const [date, diff] of [['2025-06-10', 1.1], ['2026-01-15', 1.6], ['2026-09-08', 1.9]]) {
    fourPointSet(store, subject.id, date, diff, { rnd })
  }

  // 一条更正记录：体重先记 63.5，后更正为 64.2（新增版本，不覆盖）
  const original = store.addRecord({ subjectId: subject.id, kind: 'measurement', occurredOn: '2026-09-08', sourceKind: 'patient_reported', note: '模拟：记录时抄错' })
  store.addObservation({ subjectId: subject.id, metricCode: 'weight', observedOn: '2026-09-08', value: 63.5, unit: 'kg', recordId: original.id })
  const corrected = store.supersedeRecord(original.id, { note: '模拟：更正为 64.2（原 63.5 抄错）' })
  store.addObservation({ subjectId: subject.id, metricCode: 'weight', observedOn: '2026-09-08', value: 64.2, unit: 'kg', recordId: corrected.id })

  // 一份待核对材料：同字段两个不同值（方法不同）、缺单位、低把握度
  const importer = new ImportService(store)
  const lab = importer.importDocument({
    subjectId: subject.id, kind: 'lab', filename: '2026-09-28-复查化验.pdf',
    sha256: fakeSha('DEMO-5 lab'), storagePath: 'docs/demo5-lab-20260928.pdf',
    mime: 'application/pdf', bytes: 154332, pageCount: 1,
  })
  const labJob = importer.startParse(lab.document.id, { engine: 'demo' })
  importer.finishParse(labJob.id)
  for (const c of [
    { field: 'metric:ca153', valueText: '18.6', valueNum: 18.6, unit: 'U/mL', method: 'ECLIA', pageRef: 'p1', confidence: 0.91 },
    { field: 'metric:ca153', valueText: '24.1', valueNum: 24.1, unit: 'U/mL', method: 'CLIA', pageRef: 'p1 附页', confidence: 0.74 },
    { field: 'metric:alt', valueText: '31', valueNum: 31, unit: null, method: null, pageRef: 'p1', confidence: 0.86 },
    { field: 'metric:hgb', valueText: '118', valueNum: 118, unit: 'g/L', method: '血细胞分析', pageRef: 'p1', confidence: 0.42 },
    { field: 'treatment:endocrine', valueText: '他莫昔芬 20mg 每日', method: null, pageRef: 'p1', confidence: 0.8 },
  ]) importer.addCandidate({ documentId: lab.document.id, ...c })

  // 一份解析失败的材料：原件还在列表里，可重试，不产生候选
  const scan = importer.importDocument({
    subjectId: subject.id, kind: 'discharge', filename: '2026-08-30-出院记录-扫描件.jpg',
    sha256: fakeSha('DEMO-5 scan'), storagePath: 'docs/demo5-discharge-20260830.jpg',
    mime: 'image/jpeg', bytes: 2331120, pageCount: 1,
  })
  const scanJob = importer.startParse(scan.document.id, { engine: 'demo' })
  importer.failParse(scanJob.id, { errorCode: 'blurry_scan', errorText: '图像模糊，未能识别文字（模拟）' })

  return {
    subject,
    gaps: ['有一条记录已更正（旧版本保留）', '一份材料解析失败', '一份材料待核对：同字段两个不同值'],
    note: '数据冲突画像：同指标两法不同值 + 更正链 + 待核对材料',
  }
}

const BUILDERS = {
  'DEMO-1': buildDemo1,
  'DEMO-2': buildDemo2,
  'DEMO-3': buildDemo3,
  'DEMO-4': buildDemo4,
  'DEMO-5': buildDemo5,
}

/* ---------------- 写入 / 清理 ---------------- */

export function seedDemo(store, datasetId) {
  const def = DEMO_DATASETS.find((d) => d.id === datasetId)
  if (!def) throw new Error(`没有这套演示数据：${datasetId}`)
  const existing = listDemos(store).find((d) => d.datasetId === datasetId)
  if (existing) clearDemo(store, datasetId)

  const seededAt = new Date().toISOString()
  const workspace = store.createWorkspace({
    name: `${DEMO_MARKER} ${def.id} ${def.label}`,
    settings: { demo: { datasetId: def.id, marker: DEMO_MARKER, seededAt, label: def.label } },
  })
  const rnd = mulberry32(seedOf(def.id))
  const built = BUILDERS[def.id](store, { workspaceId: workspace.id, rnd })

  const count = (table) => store.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE subject_id = ?`).get(built.subject.id).n
  const counts = {
    observations: count('observation'),
    measurements: count('measurement'),
    treatments: count('treatment_event'),
    documents: count('document'),
    // 下面四项是 v0.4.0 才有的"周边记录"：界面里对应我的关注 / 收藏与回顾 / 近期安排
    viewpoints: count('viewpoint'),
    questions: count('question'),
    tasks: count('task'),
    care: count('care_entry'),
  }
  const manifest = {
    datasetId: def.id, marker: DEMO_MARKER, label: def.label, workspaceId: workspace.id,
    subjectId: built.subject.id, seededAt, counts, gaps: built.gaps, note: built.note,
  }
  store.db.prepare('UPDATE workspace SET settings_json = ? WHERE id = ?')
    .run(JSON.stringify({ demo: manifest }), workspace.id)
  return manifest
}

export function listDemos(store) {
  const rows = store.db.prepare('SELECT id, name, settings_json FROM workspace').all()
  const out = []
  for (const row of rows) {
    let demo = null
    try {
      demo = JSON.parse(row.settings_json)?.demo ?? null
    } catch {
      demo = null
    }
    if (demo?.marker === DEMO_MARKER && demo?.datasetId) out.push({ ...demo, workspaceName: row.name })
  }
  return out.sort((a, b) => a.datasetId.localeCompare(b.datasetId))
}

/**
 * 只删 manifest 登记过的那一个工作区（级联删掉它的档案与全部子表）。
 * 不按名字猜、不删"看起来像 demo"的库：名字里带 [UI DEMO] 但没 manifest 的，一律拒绝。
 */
export function clearDemo(store, datasetId) {
  const manifest = listDemos(store).find((d) => d.datasetId === datasetId)
  if (!manifest) throw new Error(`manifest 里没有 ${datasetId}，拒绝清理（避免误删真实数据）`)
  store.db.prepare('DELETE FROM workspace WHERE id = ?').run(manifest.workspaceId)
  return { datasetId, deletedWorkspaceId: manifest.workspaceId }
}

export function seedAllDemos(store) {
  return DEMO_DATASETS.map((d) => seedDemo(store, d.id))
}
