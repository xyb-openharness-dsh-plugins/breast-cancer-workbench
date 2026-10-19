/**
 * CTCAE v5.0 分级对照（2026-10-20 引入，用户定则）。
 *
 * 原则（沉淀于 starter docs/23-METRIC-GRADING-AND-ALERTS.md）：
 * 1. 有国际分级标准的指标，**直接用该标准**做分级对照，不自己发明"轻/中/重"；
 * 2. 分级是**对照**不是诊断——它只是把记录值放进国际通行的客观区间，处置由治疗团队判断；
 * 3. 只对标准里有**绝对阈值**的指标启用。ALT/AST/肌酐等"×ULN"型需要化验单参考范围上限，
 *    本地没有结构化 ULN 之前**不启用也不近似**（近似只在"降低"类指标上有 LLN 一处，见下）；
 * 4. 阈值抄录自 assets/reference/ctcae/CTCAE_v5.0_Quick_Reference_5x7.pdf（NCI/CTEP，
 *    2017-11-27 出版），冲突时以 PDF 为准；单测 test/ctcae.test.mjs 钉住每个边界。
 *
 * 单位换算：CTCAE 用 g/dL，本项目血红蛋白用 g/L（1 g/dL = 10 g/L），阈值已换算并写明。
 * LLN（正常下限）没有个人化验单时用成人女性通用近似值，分级结果标 `approx: true`，
 * 界面必须带"按通用下限近似"字样；G4 在贫血上无数值界限（定义是"危及生命，需紧急处理"），
 * 本地只给到 G3，不给 G4——把"是否到 G4"留给治疗团队。
 */

export const CTCAE_META = Object.freeze({
  version: '5.0',
  published: '2017-11-27',
  publisher: 'U.S. Department of Health and Human Services · NCI/CTEP',
  sourceUrl: 'https://ctep.cancer.gov/protocoldevelopment/electronic_applications.htm',
  localPdf: 'assets/reference/ctcae/CTCAE_v5.0_Quick_Reference_5x7.pdf',
  disclaimer: '分级是把记录值对照 CTCAE v5.0 的客观区间，不是诊断、不是疗效判断；是否处理由治疗团队决定。',
})

/**
 * 「降低」类指标：值越低级数越高。
 * llfn = 正常下限（本地近似）；cuts.g2/g3/g4 = 进入该级的**上界**（低于它才算该级，
 * 高于等于上界则轻一级）。G1 = [cuts.g2, llfn)。
 */
const LOW_EVENTS = {
  wbc: {
    term: '白细胞减少', unit: '10⁹/L', llfn: 3.5,
    cuts: { g2: 3.0, g3: 2.0, g4: 1.0 },
  },
  anc: {
    term: '中性粒细胞减少', unit: '10⁹/L', llfn: 2.0,
    cuts: { g2: 1.5, g3: 1.0, g4: 0.5 },
  },
  // CTCAE 用 g/dL；本项目 g/L：G1 <LLN–100，G2 <100–80，G3 <80。G4 无数值界限，不标。
  hgb: {
    term: '贫血', unit: 'g/L', llfn: 120, maxGrade: 3,
    cuts: { g2: 100, g3: 80, g4: null },
  },
  plt: {
    term: '血小板减少', unit: '10⁹/L', llfn: 125,
    cuts: { g2: 75, g3: 50, g4: 25 },
  },
}

/** 「升高」类指标：值越高级数越高（当前为空——×ULN 型需个人参考范围上限，未结构化前不启用）。 */
const HIGH_EVENTS = {}

/** 分级兜底上限：贫血等无 G4 数值界限的条目最多给到 G3。 */
const GRADE_LABELS = { 1: '1 级', 2: '2 级', 3: '3 级', 4: '4 级' }

/**
 * 对照一个值。返回：
 *   null                       —— 该指标没有 CTCAE 对照定义
 *   { grade: null }            —— 有定义但值在正常区间内（无分级）
 *   { grade, band, approx, ... } —— 有分级；approx=true 表示用了通用下限而非个人化验单范围
 */
export function ctcaeGrade(code, value) {
  const def = LOW_EVENTS[code] ?? HIGH_EVENTS[code]
  if (!def) return null
  const v = Number(value)
  if (!Number.isFinite(v)) return null

  if (LOW_EVENTS[code]) {
    if (v >= def.llfn) return { code, term: def.term, grade: null, band: null, approx: false, note: '在对照下限内，无分级' }
    let grade = 1
    if (v < def.cuts.g4) grade = 4
    else if (v < def.cuts.g3) grade = 3
    else if (v < def.cuts.g2) grade = 2
    if (def.maxGrade && grade > def.maxGrade) grade = def.maxGrade
    const band = gradeBand(LOW_EVENTS[code], grade)
    return { code, term: def.term, grade, band, approx: true, note: '按成人通用下限近似；以化验单参考范围为准' }
  }
  // HIGH_EVENTS 留作将来：结构化 ULN 后在此补"值越高越重"的对称逻辑
  return null
}

/** 该级在 CTCAE 表里的数值区间文案（如 "0.5–<1.0 ×10⁹/L"），用于卡片悬停与翻面。 */
function gradeBand(def, grade) {
  const fmt = (x) => String(x)
  const { cuts, llfn } = def
  switch (grade) {
    case 1: return `${fmt(cuts.g2)}–<${fmt(llfn)} ${def.unit}`
    case 2: return `${fmt(cuts.g3)}–<${fmt(cuts.g2)} ${def.unit}`
    case 3: {
      // 贫血等 G4 无数值界限的条目：G3 是"低于 g3 上界"，没有下界，不能写成 g4–<g3
      if (cuts.g4 === null || cuts.g4 === undefined) return `<${fmt(cuts.g3)} ${def.unit}`
      return `${fmt(cuts.g4)}–<${fmt(cuts.g3)} ${def.unit}`
    }
    case 4: return cuts.g4 === null ? '无数值界限（由治疗团队判断）' : `<${fmt(cuts.g4)} ${def.unit}`
    default: return null
  }
}

export const CTCAE_GRADE_LABELS = GRADE_LABELS

/** 哪些指标有对照（前端渲染徽章用）。 */
export function ctcaeCoveredCodes() {
  return Object.keys(LOW_EVENTS)
}

/** 展示用元信息（读模型直接透传，前端不重复定义）。 */
export function ctcaeInfo() {
  return { ...CTCAE_META }
}
