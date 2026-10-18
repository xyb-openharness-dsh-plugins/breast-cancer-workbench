/**
 * 指标字典与测量协议种子（M1）。
 *
 * 来源：docs/BREAST-DOMAIN.md §3「指标字典 v0.2」与「臂围四点位」的候选口径。
 * 这里只落**字典**（code / 名称 / 单位 / 分类 / 可比性），不含任何界面排序、默认选中项或演示数据。
 *
 * 三条约束：
 * 1. 种子幂等：`INSERT OR IGNORE`，重复执行不重复插入，也不覆盖已改过的行；
 * 2. 改口径 = 发新版本（version+1），不原地改老行（SCHEMA-SPEC §8.2）；
 * 3. 可比性必须显式写，不靠默认值：`lab_method` / `measure_protocol` / `none`。
 */

export const DICTIONARY_VERSION = 1
export const EFFECTIVE_FROM = '2026-10-17'

/** 18 项指标（BREAST-DOMAIN §3.1–§3.6）。dec = 显示小数位，不参与计算。 */
export const METRICS = [
  // 3.1 肿瘤标志物：只作随访回顾，不提供"升高=复发"判断
  { code: 'ca153', name: 'CA15-3', unit: 'U/mL', category: 'tumor_marker', dec: 1, comparable_by: 'lab_method' },
  { code: 'cea', name: 'CEA', unit: 'ng/mL', category: 'tumor_marker', dec: 1, comparable_by: 'lab_method' },
  // 3.2 血液学（化疗期重点）
  { code: 'wbc', name: '白细胞', unit: '10⁹/L', category: 'cbc', dec: 2, comparable_by: 'lab_method' },
  { code: 'anc', name: '中性粒细胞绝对值', unit: '10⁹/L', category: 'cbc', dec: 2, comparable_by: 'lab_method' },
  { code: 'hgb', name: '血红蛋白', unit: 'g/L', category: 'cbc', dec: 0, comparable_by: 'lab_method' },
  { code: 'plt', name: '血小板', unit: '10⁹/L', category: 'cbc', dec: 0, comparable_by: 'lab_method' },
  // 3.3 生化
  { code: 'alt', name: 'ALT', unit: 'U/L', category: 'chemistry', dec: 0, comparable_by: 'lab_method' },
  { code: 'cr', name: '肌酐', unit: 'μmol/L', category: 'chemistry', dec: 0, comparable_by: 'lab_method' },
  // 3.4 器官功能与骨健康（只在治疗暴露背景下看）
  { code: 'lvef', name: 'LVEF', unit: '%', category: 'cardiac_bone', dec: 0, comparable_by: 'lab_method' },
  { code: 'bmd_ls', name: '腰椎骨密度 T 值', unit: '—', category: 'cardiac_bone', dec: 1, comparable_by: 'lab_method' },
  // 3.5 体成分与营养
  { code: 'weight', name: '体重', unit: 'kg', category: 'nutrition', dec: 1, comparable_by: 'none' },
  { code: 'bmi', name: 'BMI', unit: 'kg/m²', category: 'nutrition', dec: 1, comparable_by: 'none', value_type: 'numeric', note: '计算值，界面需标注' },
  // 3.6 康复测量（本项目核心；显示名用「上肢」，不用「肩」，D15）
  { code: 'arm_diff', name: '患健侧臂围差（最大值）', unit: 'cm', category: 'rehab', dec: 1, comparable_by: 'measure_protocol' },
  { code: 'arm_vol_diff', name: '患健侧体积差', unit: '%', category: 'rehab', dec: 1, comparable_by: 'measure_protocol' },
  { code: 'arm_flex', name: '患侧上肢前屈', unit: '°', category: 'rehab', dec: 0, comparable_by: 'measure_protocol' },
  { code: 'arm_abd', name: '患侧上肢外展', unit: '°', category: 'rehab', dec: 0, comparable_by: 'measure_protocol' },
  { code: 'grip', name: '患侧握力', unit: 'kg', category: 'rehab', dec: 1, comparable_by: 'measure_protocol' },
  { code: 'drain_vol', name: '引流量', unit: 'mL/日', category: 'drainage', dec: 0, comparable_by: 'measure_protocol' },
]

/** 测量协议：体位、点位、测量者决定测量值能否互比。 */
export const PROTOCOLS = [
  {
    id: 'proto_arm_circ_4pt_v1',
    code: 'arm_circ_4pt',
    version: 1,
    label: '坐位·双臂自然下垂·四点位',
    posture: '坐位，双臂自然下垂，避免屈肘',
    side_order: 'paired',
    points: ['wrist', 'forearm_mid', 'above_elbow_10', 'below_axilla_10'],
    assessor_required: 1,
    note: '四点位为候选口径，需康复科确认；点位不同不得与旧序列连线',
  },
  {
    id: 'proto_arm_flexion_v1',
    code: 'arm_flexion',
    version: 1,
    label: '坐位·主动前屈（肩关节）',
    posture: '坐位，躯干直立，主动前屈，记录是否辅助',
    side_order: 'affected_first',
    points: null,
    assessor_required: 1,
    note: '测量者不同需在界面上标注',
  },
  {
    id: 'proto_grip_v1',
    code: 'grip',
    version: 1,
    label: '坐位·握力计·患侧',
    posture: '坐位，肘屈 90°，同一握力计',
    side_order: 'affected_first',
    points: null,
    assessor_required: 0,
    note: '换握力计视为方法变更，不连线',
  },
]

/**
 * 幂等写入字典与协议。返回本次实际新增的行数（重复执行应为 0）。
 * 不覆盖已有行：改口径必须发新 version。
 */
export function seedDictionary(db) {
  const insertMetric = db.prepare(`INSERT OR IGNORE INTO metric_definition
    (code, version, name, unit, category, value_type, dec, comparable_by, aliases_json, effective_from, supersedes, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const insertProtocol = db.prepare(`INSERT OR IGNORE INTO measure_protocol
    (id, code, version, label, posture, side_order, points_json, assessor_required, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)

  let inserted = 0
  db.exec('BEGIN')
  try {
    for (const m of METRICS) {
      const r = insertMetric.run(
        m.code, DICTIONARY_VERSION, m.name, m.unit, m.category,
        m.value_type ?? 'numeric', m.dec, m.comparable_by,
        JSON.stringify(m.aliases ?? []), EFFECTIVE_FROM, null, m.note ?? null,
      )
      inserted += r.changes
    }
    for (const p of PROTOCOLS) {
      const r = insertProtocol.run(
        p.id, p.code, p.version, p.label, p.posture ?? null, p.side_order ?? null,
        p.points ? JSON.stringify(p.points) : null, p.assessor_required ?? 1, p.note ?? null,
      )
      inserted += r.changes
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw new Error(`字典种子写入失败：${error.message}`)
  }
  return { inserted }
}
