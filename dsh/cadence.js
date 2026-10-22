/**
 * 随访节奏层（G2，2026-10-22）。
 *
 * 它只做一件事：把指南 P208 表 9.5、P209 表 9.6 的**时间间隔**搬到界面上，
 * 和你自己的手术日期摆在一起。三条边界，写在这里防止以后被"顺手加功能"破坏：
 *
 * 1. **只算节点，不排计划**。输出的是"按 3 个月一次，下一个节点落在哪天"，
 *    不是"你应该在哪天去复查"。界面用词一律是「参考节点」。
 * 2. **不发提醒、不弹通知**（用户 2026-10-22 定）。节点只可以转成「想问医生的问题」
 *    或「我自己安排的待办」——要不要记、记成什么，由用户按。
 * 3. **不做分期判断**。分期没记录就只给通用节奏并写明「未按分期调整」；
 *    注 b 的放宽只在分期落在原文列举范围内时**并列一行提示**，绝不自动改主节奏。
 *
 * 弹性带（`GRACE_DAYS`）是工作台的显示约定，**不是指南内容**，凡出现都标注来源。
 * 数据源：assets/reference/guideline/cadence.json（随包分发，只含间隔与短摘录）。
 */

import CADENCE from '../assets/reference/guideline/cadence.json' with { type: 'json' }

const DAY_MS = 86400000
const MONTH_DAYS = 30.4375

/** 工作台自定的"临近"带宽：距参考节点 ±30 天。指南原文没有这个数。 */
export const GRACE_DAYS = 30

export const CADENCE_META = Object.freeze({
  ...CADENCE.document,
  graceDays: GRACE_DAYS,
  graceNote: '±30 天是工作台的显示带宽，不是指南内容；指南只写间隔。',
})

export function cadenceMeta() {
  return { ...CADENCE_META }
}

/** 解析 YYYY-MM-DD 成 UTC 毫秒；非法值返回 null（不做"今天"兜底，兜底会伪造节点）。 */
export function parseDay(iso) {
  if (typeof iso !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isFinite(t) ? t : null
}

export function fmtDay(ms) {
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * 加 n 个月。月末夹取：1 月 31 日 + 1 个月 = 2 月末（而不是滑到 3 月 3 日）。
 * 直接用 setMonth 会溢出到下个月，所以先算目标月末再取 min。
 */
export function addMonths(iso, n) {
  const t = parseDay(iso)
  if (t === null) return null
  const d = new Date(t)
  const day = d.getUTCDate()
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return fmtDay(target.getTime())
}

/** 两个日期相差多少个月（按 30.4375 天折算，只用于分档，不用于精确天数）。 */
export function monthsBetween(fromISO, toISO) {
  const a = parseDay(fromISO)
  const b = parseDay(toISO)
  if (a === null || b === null) return null
  return (b - a) / DAY_MS / MONTH_DAYS
}

/** 术后第几段节奏。分期不影响这里——分期只影响"要不要并列注 b"。 */
export function phaseFor(monthsSinceSurgery) {
  if (!Number.isFinite(monthsSinceSurgery) || monthsSinceSurgery < 0) return null
  return CADENCE.phases.find((p) => monthsSinceSurgery >= p.fromMonths
    && (p.toMonths === null || monthsSinceSurgery < p.toMonths)) ?? null
}

/**
 * 下一个/上一个参考节点。
 *
 * 节点 = 手术日 + k × 间隔（k = 1,2,3…），所以它是一个日历格，不依赖"上次复查记在哪"。
 * 这样即使一次都没记过复查，也能说出按指南节奏该看哪几个日期——但界面只说"参考"。
 */
export function checkpoints({ surgeryDate, today, intervalMonths }) {
  const s = parseDay(surgeryDate)
  const t = parseDay(today)
  if (s === null || t === null || !Number.isFinite(intervalMonths) || intervalMonths <= 0) return null
  if (t < s) return { beforeSurgery: true, daysUntilSurgery: Math.round((s - t) / DAY_MS) }

  // k 最多算到 100 年，够用且不会死循环（interval 最小 3 个月 → 400 个节点）。
  let k = 1
  let nextMs = null
  while (k <= 400) {
    const iso = addMonths(surgeryDate, k * intervalMonths)
    const ms = parseDay(iso)
    if (ms === null) return null
    if (ms > t) { nextMs = ms; break }
    k += 1
  }
  if (nextMs === null) return null

  const prevISO = k === 1 ? null : addMonths(surgeryDate, (k - 1) * intervalMonths)
  const daysUntil = Math.round((nextMs - t) / DAY_MS)
  const daysSincePrev = prevISO ? Math.round((t - parseDay(prevISO)) / DAY_MS) : null
  const prevState = daysSincePrev === null ? null : daysSincePrev <= GRACE_DAYS ? 'near' : 'past'
  const nextState = daysUntil <= GRACE_DAYS ? 'near' : 'later'
  return {
    beforeSurgery: false,
    index: k,
    // 下一个节点永远在将来，所以它的 state 只可能是 later / near；
    // "已过"描述的是**上一个**节点——那才是"你可能晚了"的那一格。
    next: { date: fmtDay(nextMs), index: k, daysUntil, state: nextState, stateLabel: STATE_LABELS[nextState] },
    previous: prevISO
      ? { date: prevISO, index: k - 1, daysSince: daysSincePrev, state: prevState, stateLabel: STATE_LABELS[prevState] }
      : null,
  }
}

export const STATE_LABELS = {
  later: '还没到参考节点',
  near: '在参考节点附近（±30 天）',
  past: '已过参考节点',
}

/**
 * 从治疗记录推"在用什么/用过什么"。**只按名称关键词粗匹配**：
 * 匹配不到就不出标签（界面写"未记录"），绝不因为"化疗"两个字就假设用了蒽环。
 */
export function treatmentTags(treatments = []) {
  const tags = {}
  const unmatched = []
  for (const tx of treatments) {
    const name = String(tx.name ?? '')
    let hit = false
    for (const [tag, rule] of Object.entries(CADENCE.tagRules)) {
      if (!new RegExp(rule.pattern, 'i').test(name)) continue
      hit = true
      const state = tx.status === 'ongoing' ? 'ongoing' : 'past'
      // ongoing 优先：同时有一条已停的方案和一条在用的，取 in-use 的那个状态。
      if (!tags[tag] || (tags[tag] === 'past' && state === 'ongoing')) {
        tags[tag] = { state, label: rule.label, by: name, treatmentId: tx.id }
      }
    }
    if (!hit) unmatched.push({ treatmentId: tx.id, name, kind: tx.kind })
  }
  return { tags, unmatched }
}

/** 这条检查项是否适用于当前标签。`when` 为空 = 所有人。 */
export function checkApplies(check, tags) {
  if (!check.when) return true
  return check.when.tags.some((t) => Boolean(tags[t]))
}

/**
 * 适用检查项 + 无法匹配的项。分三堆：
 * - `routine`：常规检查，节奏跟着表 9.5；
 * - `special`：有适用人群的，命中标签才出；
 * - `unavailable`：指南列了、但本地没有结构化字段去判断你是否属于该人群（如淋巴结枚数）。
 */
export function applicableChecks(tags = {}) {
  const routine = []
  const special = []
  const unavailable = []
  const whenNeeded = []
  for (const c of CADENCE.checks) {
    if (c.unavailable) { unavailable.push(c); continue }
    if (!checkApplies(c, tags)) continue
    if (c.freq.kind === 'when_needed') { whenNeeded.push(c); continue }
    if (c.group === 'routine') routine.push(c)
    else special.push(c)
  }
  return { routine, special, whenNeeded, unavailable }
}

/** 分期只看两件事：有没有记录；是否落在注 b 列举的"可酌情放宽"范围内。 */
export function stageRelax(stageText) {
  const text = String(stageText ?? '').trim()
  if (!text) return { known: false, relax: 'none' }
  if (/Tis|pT1mic|^0\s*期|^0期|^Stage\s*0$/i.test(text)) return { known: true, relax: 'listed' }
  // I 期：注意 "IIA" 不能算 I 期，所以用负向先行断言排除紧随的 I。
  if (/^I(?![IV])(\s|期|A|B|C|$)/.test(text)) return { known: true, relax: 'partial' }
  return { known: true, relax: 'none' }
}

/**
 * 组装随访卡。不给结论，只摆四件事：指南节奏、我术后多久、下一个参考节点、适用检查项。
 * 缺手术日期时**不猜**，返回 `{ missing: 'surgery' }`，界面说明为什么不显示节点。
 */
export function buildFollowupPlan({ treatments = [], diagnoses = [], today }) {
  const meta = cadenceMeta()
  const { tags, unmatched } = treatmentTags(treatments)

  const surgeries = treatments
    .filter((t) => t.kind === 'surgery' && (t.actualStart || t.actualEnd))
    .map((t) => ({ ...t, date: t.actualStart ?? t.actualEnd }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const surgery = surgeries[0] ?? null

  const stageText = diagnoses.map((x) => x.stageText).filter(Boolean).sort().pop() ?? null
  const stage = stageRelax(stageText)
  const checks = applicableChecks(tags)

  if (!surgery) {
    return {
      meta,
      missing: 'surgery',
      stage: { text: stageText, ...stage },
      tags,
      unmatched,
      checks,
      plan: null,
      relaxHint: null,
    }
  }

  const months = monthsBetween(surgery.date, today)
  const phase = phaseFor(months)
  const checkpointsOut = phase ? checkpoints({ surgeryDate: surgery.date, today, intervalMonths: phase.intervalMonths }) : null

  // 注 b 只在"分期确实落在原文列举范围"时并列一行；不改主节奏。
  const relaxHint = phase && phase.id === 'y0_2' && stage.relax !== 'none'
    ? {
      page: CADENCE.relax.page,
      note: CADENCE.relax.note,
      intervalMonths: CADENCE.relax.intervalMonths,
      kind: stage.relax,
      text: stage.relax === 'listed'
        ? '你的分期在指南注 b 列举的范围内（0 期 / pT1micN0 等），原文写「可酌情延长」，例如 2 年内每 6 个月一次。'
        : '你的分期是 I 期，指南注 b 里「部分 I 期」可酌情放宽，是否适用要由治疗团队判断。',
      quote: CADENCE.relax.quote,
      disclaimer: CADENCE.relax.disclaimer,
    }
    : null

  return {
    meta,
    missing: null,
    surgery: { date: surgery.date, name: surgery.name, monthsSince: months === null ? null : Math.floor(months) },
    stage: { text: stageText, ...stage },
    tags,
    unmatched,
    checks,
    plan: phase ? {
      phaseId: phase.id,
      phaseLabel: phase.label,
      intervalMonths: phase.intervalMonths,
      page: phase.page,
      table: phase.table,
      quote: phase.quote,
      checkpoints: checkpointsOut,
    } : null,
    relaxHint,
  }
}
