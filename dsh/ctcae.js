/**
 * CTCAE v5.0 分级对照（2026-10-20 引入，用户定则）。
 *
 * 原则（沉淀于 starter docs/23-METRIC-GRADING-AND-ALERTS.md）：
 * 1. 有国际分级标准的指标，**直接用该标准**做分级对照，不自己发明"轻/中/重"；
 * 2. 分级是**对照**不是诊断——它只是把记录值放进国际通行的客观区间，处置由治疗团队判断；
 * 3. 只对标准里有**绝对阈值**的指标启用通用近似；ALT/AST/ALP/胆红素/肌酐这类「×ULN」型
 *    （2026-10-22 G3 起）**只在这张化验单自带参考上限时**才对照，没有就返回 `needsUln`，
 *    不用成人通用上限去凑倍数——血红蛋白的通用下限跨实验室差异小，转氨酶上限差异大，
 *    用通用值一除就能把 2 级说成 1 级；
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

/**
 * 「×ULN」型（G3，2026-10-22 引入）：阈值写成「是化验单参考上限的几倍」。
 *
 * 只有**化验单自带参考上限**（`observation.ref_high`）时才能对照；没有就返回 `needsUln`，
 * 绝不用「成人通用上限」凑一个倍数——ALT 的 ULN 各实验室从 40 到 55 U/L 都有，
 * 差 1.4 倍，拿通用值一除就能把 G2 说成 G1。这是与 LLN 近似不同的地方：
 * 血红蛋白通用下限跨实验室差异小（120±5），转氨酶上限差异大，近似不安全。
 *
 * `cuts`：g1/g2/g3 是**该级的上界倍数**（ratio ≤ g1 → 1 级；≤ g2 → 2 级；≤ g3 → 3 级；> g3 → 4 级）。
 * 原文还有「基线异常时按 ×基线分级」的分支（ALT/AST/ALP/胆红素/肌酐都有），
 * 本地没有「基线值」这个概念，**只做基线正常分支**，并在 note 里写出来。
 */
const ULN_EVENTS = {
  alt: {
    term: '丙氨酸氨基转移酶升高', unit: 'U/L',
    cuts: { g1: 3.0, g2: 5.0, g3: 20.0 },
  },
  ast: {
    term: '天冬氨酸氨基转移酶升高', unit: 'U/L',
    cuts: { g1: 3.0, g2: 5.0, g3: 20.0 },
  },
  alp: {
    term: '碱性磷酸酶升高', unit: 'U/L',
    cuts: { g1: 2.5, g2: 5.0, g3: 20.0 },
  },
  tbil: {
    term: '总胆红素升高', unit: 'μmol/L',
    cuts: { g1: 1.5, g2: 3.0, g3: 10.0 },
  },
  cr: {
    term: '肌酐升高', unit: 'μmol/L',
    cuts: { g1: 1.5, g2: 3.0, g3: 6.0 },
  },
}

/**
 * 「绝对阈值」型：不需要 ULN，直接按数值分级。目前只有 QTc（ms）。
 *
 * 两处原文分支本地没有数据，故不采用：
 * 1. G3 还有「较基线增加 >60 ms」这一支——本地没有基线校正，只有绝对值；
 * 2. G4 的定义是尖端扭转型室速 / 多形性室速 / 严重心律失常症状，本地没有这份记录，
 *    所以最高只到 G3（`maxGrade: 3`），不拿数值硬凑 G4。
 */
const ABS_EVENTS = {
  qtc: {
    term: 'QT 间期延长（校正后）', unit: 'ms', maxGrade: 3,
    bands: { g1: [450, 480], g2: [481, 500], g3: [501, null] },
    note: '只按绝对值；原文「较基线增加 >60ms」与 G4 的心律失常定义本地没有数据，未采用',
  },
}


/** 分级兜底上限：贫血等无 G4 数值界限的条目最多给到 G3。 */
const GRADE_LABELS = { 1: '1 级', 2: '2 级', 3: '3 级', 4: '4 级' }

/**
 * 对照一个值。返回：
 *   null                       —— 该指标没有 CTCAE 对照定义
 *   { grade: null }            —— 有定义但值在正常区间内（无分级）
 *   { grade: null, needsUln }  —— ×ULN 型但没拿到化验单参考上限（不猜倍数）
 *   { grade, band, approx, ... } —— 有分级；approx=true 表示用了通用下限而非个人化验单范围
 *
 * `opts.uln` 是**这次化验单自带的参考上限**（`observation.ref_high`）；没有就传 null。
 */
export function ctcaeGrade(code, value, opts = {}) {
  const def = LOW_EVENTS[code] ?? ULN_EVENTS[code] ?? ABS_EVENTS[code]
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

  if (ULN_EVENTS[code]) {
    const uln = Number(opts.uln)
    if (!Number.isFinite(uln) || uln <= 0) {
      return {
        code,
        term: def.term,
        grade: null,
        band: null,
        approx: false,
        needsUln: true,
        note: 'CTCAE 这一项按「×化验单参考上限」分级；本地没有这份化验单的参考上限',
      }
    }
    const ratio = v / uln
    if (ratio <= 1) return { code, term: def.term, grade: null, band: null, approx: false, ratio: 1, uln, note: '未超过参考上限，无分级' }
    let grade = 4
    if (ratio <= def.cuts.g3) grade = 3
    if (ratio <= def.cuts.g2) grade = 2
    if (ratio <= def.cuts.g1) grade = 1
    return {
      code,
      term: def.term,
      grade,
      band: ulnBand(def, grade),
      approx: false,
      ratio,
      uln,
      note: '按这张化验单的参考上限折算；原文「基线异常时按 ×基线分级」本地没有基线值，未采用',
    }
  }

  if (ABS_EVENTS[code]) {
    // QTc 只有 ms 一种写法；< 100 多半是把秒（0.46）填进了 ms 栏，不替用户换算。
    if (v < 100) {
      return { code, term: def.term, grade: null, band: null, approx: false, needsUnit: true, note: '数值看起来不是毫秒（QTc 通常 350–550 ms），请核对单位' }
    }
    let grade = null
    for (const [key, [lo, hi]] of Object.entries(def.bands)) {
      if (v >= lo && (hi === null || v <= hi)) { grade = Number(key.slice(1)); break }
    }
    if (grade === null) {
      return v < 450
        ? { code, term: def.term, grade: null, band: null, approx: false, note: '在正常区间内，无分级' }
        : { code, term: def.term, grade: def.maxGrade, band: `>${def.bands.g3[0]} ${def.unit}`, approx: false, note: def.note }
    }
    return { code, term: def.term, grade, band: absBand(def, grade), approx: false, note: def.note }
  }

  return null
}

/** 该级在 CTCAE 表里的「×ULN」区间文案（如 ">3.0–5.0 ×ULN"）。 */
function ulnBand(def, grade) {
  const f = (x) => Number(x).toFixed(1)
  switch (grade) {
    case 1: return `>1.0–${f(def.cuts.g1)} ×ULN`
    case 2: return `>${f(def.cuts.g1)}–${f(def.cuts.g2)} ×ULN`
    case 3: return `>${f(def.cuts.g2)}–${f(def.cuts.g3)} ×ULN`
    case 4: return `>${f(def.cuts.g3)} ×ULN`
    default: return null
  }
}

/** QTc 的区间文案（ms）。 */
function absBand(def, grade) {
  if (grade === 3) return `≥${def.bands.g3[0]} ${def.unit}`
  const [lo, hi] = def.bands[`g${grade}`]
  return `${lo}–${hi} ${def.unit}`
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

/** 哪些指标有对照（前端渲染徽章用）。**只含「降低」类**：骨髓抑制那一页的两列并置靠它，
 *  把转氨酶混进去会让"骨髓抑制"那组多出无关指标。全量用 `ctcaeAllCodes()`。 */
export function ctcaeCoveredCodes() {
  return Object.keys(LOW_EVENTS)
}

/** 全部有对照的指标（含 ×ULN 类与绝对阈值类）。 */
export function ctcaeAllCodes() {
  return [...Object.keys(LOW_EVENTS), ...Object.keys(ULN_EVENTS), ...Object.keys(ABS_EVENTS)]
}

/** 需要化验单参考上限才能分级的指标（前端据此提示"补参考上限"）。 */
export function ctcaeUlnCodes() {
  return Object.keys(ULN_EVENTS)
}

/** 展示用元信息（读模型直接透传，前端不重复定义）。 */
export function ctcaeInfo() {
  return { ...CTCAE_META }
}
