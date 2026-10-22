/**
 * 指南出处层（G1，2026-10-22 引入，用户定则）。
 *
 * 三条边界：
 * 1. **只做出处，不做判定**。这里给的是"指南哪一页、原文怎么写"，不是"你该怎么办"；
 *    处置类条文（G-CSF 预防、输血阈值、暂停治疗）一律不进本模块。
 * 2. **主标准仍是 CTCAE v5.0**（用户 2026-10-22 定）。指南口径只在卡片背面并列一行，
 *    两套不一致时**不取严、不合并**——把两个级都摆出来，判断留给读者与治疗团队。
 * 3. **指南的 1 级起点是「本实验室正常下限」**，本地没有结构化 LLN，所以中性粒细胞只对
 *    2/3/4 级给结论；落在 1.5–2.0 之间的值返回 `needs-lln`，界面写"需化验下限"，
 *    不拿成人通用下限去糊一个级出来。
 *
 * 数据源：assets/reference/guideline/refs.json（随包分发，只有页码 + ≤200 字摘录）。
 * 全文在仓库 guidebooks/，**不进 npm 包**（版权约束见 guidebooks/README.md）。
 */

import REFS_DOC from '../assets/reference/guideline/refs.json' with { type: 'json' }

export const GUIDELINE_META = Object.freeze({
  ...REFS_DOC.document,
  disclaimer: '指南出处只说明"原文在第几页怎么写"，不是对你这份记录的判断；分级主口径仍是 CTCAE v5.0。',
})

/** 出处元信息（读模型直接透传，前端不重复定义文档名与版本）。 */
export function guidelineMeta() {
  return { ...GUIDELINE_META }
}

/** 该指标有没有指南出处条目（没有不代表不重要，可能只是指南未单列）。 */
export function guidelineRef(code) {
  return REFS_DOC.refs[code] ?? null
}

/** 指南对这个指标的补充说明（用于"为什么这项没有指南对照"）。 */
export function guidelineNote(code) {
  return REFS_DOC.notes?.[code] ?? null
}

/** 全部补充说明（读模型一次给前端，避免逐条问）。 */
export function guidelineNotesMap() {
  return { ...(REFS_DOC.notes ?? {}) }
}

export function guidelineCoveredCodes() {
  return Object.keys(REFS_DOC.refs)
}

/**
 * 指南口径对照。返回 null 表示"这条值不值得摆出来"（正常范围内的中性粒不显示）；
 * 返回 `{ kind:'grade'|'needs-lln'|'focus' }` 表示可以并列一行。
 *
 * 注意：**不做取严**，也不改写 CTCAE 的级；调用方必须把两者分两行显示。
 */
export function cbcsView(code, value) {
  const ref = REFS_DOC.refs[code]
  // 注意：Number(null) === 0、Number('') === 0，会静默算成"4 级"。空值必须先挡掉。
  if (value === null || value === undefined || value === '') return null
  const v = Number(value)
  if (!ref || !Number.isFinite(v)) return null

  if (ref.kind === 'grade') {
    const { cuts, unit } = ref
    if (v >= 2.0) return null // 与 CTCAE 的通用下限同一窗口：明显正常时不占版面
    if (v < cuts.g4) return gradeView(code, ref, 4, `<${cuts.g4}${unit}`)
    if (v < cuts.g3) return gradeView(code, ref, 3, `${cuts.g4}–<${cuts.g3}${unit}`)
    if (v < cuts.g2) return gradeView(code, ref, 2, `${cuts.g3}–<${cuts.g2}${unit}`)
    return {
      code,
      kind: 'needs-lln',
      grade: null,
      short: '需化验下限',
      text: `指南口径：1 级的起点是「本实验室正常下限」，本机没有记录这个下限（P${ref.page}）`,
      page: ref.page,
      refId: `${REFS_DOC.document.id}:P${ref.page}`,
    }
  }

  if (ref.kind === 'focus') {
    // 只在"值得对照"的窗口内出现，与 CTCAE 的观察窗口一致（hgb<120、plt<125）：
    // 血小板 230 这种明显正常的值不该被一条"<100 才算 CTIT"的说明占版面。
    const windowTop = code === 'hgb' ? 120 : 125
    if (v >= windowTop) return null
    const isHgb = code === 'hgb'
    return {
      code,
      kind: 'focus',
      grade: null,
      short: isHgb ? '关注线' : '定义线',
      text: isHgb
        ? `指南关注线：Hb ≤110 g/L 或较前降 ≥20 g/L（P${ref.page}）· 不是分级`
        : `指南定义线：<100×10⁹/L；10/75/100 在原文里是干预分层（P${ref.page}）· 不是分级`,
      page: ref.page,
      refId: `${REFS_DOC.document.id}:P${ref.page}`,
    }
  }

  return null
}

function gradeView(code, ref, grade, band) {
  return {
    code,
    kind: 'grade',
    grade,
    band,
    short: `${grade} 级`,
    text: `指南口径：${grade} 级（${band}，P${ref.page}）`,
    page: ref.page,
    refId: `${REFS_DOC.document.id}:P${ref.page}`,
  }
}

/** 出处短标签，例：`CBCS 2025 · P227 表 10.10`。 */
export function refLabel(ref) {
  if (!ref) return ''
  const table = ref.table ? ` ${ref.table}` : ''
  return `${REFS_DOC.document.short} · P${ref.page}${table}`
}
