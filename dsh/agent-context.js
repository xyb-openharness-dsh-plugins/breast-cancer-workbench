/**
 * 「与 Agent 讨论」的上下文草稿（AGENT-PANE-DESIGN §3 第 3 条）。
 *
 * 作用：把某一页当前**真实存在**的记录整理成一段可读文本，交给原生会话的草稿框。
 * 三条不可让步：
 *
 * 1. **只抄记录，不做解释**。文里出现的每个数值、日期、方法都来自读模型；缺的地方
 *    直接写"记录里没有"，不补、不推测、不算比率。
 * 2. **核对 ≠ 审核**。草稿核对页只带已接受/已修改接受的事实；未核对候选**只报条数、
 *    不带值**——把候选写进草稿等于替 AI 背书未核实的数据。
 * 3. **私密默认不带**（D39 fail-closed）。私密看法不进草稿，除非调用方显式
 *    `includePrivate: true`；界面上是先看预览再逐项勾选。
 *
 * 组装出的文本固定带「请你怎么用 / 请不要」两段，边界写在上下文里，不指望用户记得。
 *
 * 这个模块**不写库、不调宿主**：纯函数式地读 → 拼文本，单测可直接断言。
 */

/** 能做「与 Agent 讨论」的页面。我的关注（试验线索）一期没有真实数据，不提供入口。 */
export const AGENT_SCOPES = Object.freeze(['timeline', 'prep', 'draft'])

export const AGENT_SCOPE_LABELS = Object.freeze({
  timeline: '病情一图秀',
  prep: '就诊准备',
  draft: '整理草稿 / 核对',
})

/** 一屏能看完的量：超了就截断并写明"共 N 项"。 */
const MAX_POINTS = 6
const MAX_TREATMENTS = 5
const MAX_QUESTIONS = 8
const MAX_TASKS = 6
const MAX_VIEWPOINTS = 4
const MAX_FACTS = 20
const MAX_PROMPT = 8000

const ASK = [
  '只根据上面列出的内容整理；记录里没有的，直接说「记录里没有」，不要替我补全。',
  '把同一段时间的记录排成对照表时，标明日期、单位与检测方法；方法变了的地方不要连起来比。',
  '可以指出哪些地方需要向治疗团队确认，并帮我把它们写成问句。',
]
const AVOID = [
  '不下诊断，不判断复发或疗效，不评价某个值是"好"还是"坏"。',
  '不给用药、停药、换药或剂量的意见。',
  '不把我的"看法"当成医生结论，也不要顺着它下判断。',
]

const pad = (n) => String(n).padStart(2, '0')
const day = (iso) => (iso ? String(iso).slice(0, 10).replace(/-/g, '.') : '—')
const stamp = (date) => `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`

export function fmtValue(value, dec = 1) {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return dec === 0 ? String(Math.round(n)) : n.toFixed(dec)
}

/** 缺项 → 统一收口成一句话，避免同一件事在 prompt 里说三遍。 */
function pushGap(gaps, text) {
  if (text && !gaps.includes(text)) gaps.push(text)
}

/* ---------------- 各页的块 ---------------- */

function timelineBlocks(wb, codes, gaps) {
  const metrics = wb.metrics()
  const grades = new Map((metrics.cards ?? []).map((c) => [c.code, c.ctcae]))
  const all = metrics.series ?? []
  const picked = codes.length
    ? all.filter((s) => codes.includes(s.code))
    : all.filter((s) => s.hasData).slice(0, 4)

  const lines = []
  for (const s of picked) {
    const unit = s.unit && s.unit !== '—' ? `，${s.unit}` : ''
    const method = s.latest?.method ? `，方法：${s.latest.method}` : ''
    if (!s.hasData) {
      lines.push(`· ${s.name}${unit}：还没有任何记录（不画成 0，也不代表正常）`)
      pushGap(gaps, `${s.name} 没有任何记录`)
      continue
    }
    const pts = s.points.slice(-MAX_POINTS)
    const head = s.points.length > MAX_POINTS ? `（最近 ${MAX_POINTS} 次，共 ${s.points.length} 次）` : `（共 ${s.points.length} 次）`
    lines.push(`· ${s.name}${unit}${method}${head}`)
    lines.push(`  ${pts.map((p) => `${day(p.date)} ${fmtValue(p.value, s.dec)}`).join('、')}`)
    if (s.segments && s.segments.length > 1) {
      const broken = s.segments.slice(1).map((seg) => day(seg.points?.[0]?.date ?? seg.start ?? null))
      lines.push(`  ⚠ 检测方法/单位在 ${broken.join('、')} 发生变化，前后不可直接比较（图上在这些位置断开）`)
    }
    if (s.points.length === 1) lines.push('  只有 1 次记录，看不出趋势。')
    const c = grades.get(s.code)
    if (c?.grade) {
      const meta = metrics.ctcae ?? {}
      lines.push(`  最新值对照 CTCAE v${meta.version ?? '5.0'} 为 ${c.grade} 级${c.band ? `（${c.band}）` : ''}${c.approx ? '，按通用下限近似' : ''}——这是区间对照，不是诊断。`)
    }
  }
  if (!picked.length) {
    return { key: 'metrics', label: '指标序列', lines: ['· 这一版还没有任何指标记录。'], note: null }
  }

  const treatments = wb.clinical().treatments ?? []
  const treatLines = treatments.slice(-MAX_TREATMENTS).reverse().map((t) =>
    `· ${day(t.start)}${t.end && t.end !== t.start ? `—${day(t.end)}` : ''} ${t.kindLabel ?? t.kind}：${t.name}（${t.isActual ? '实际接受' : '计划'}）`)
  if (treatments.length > MAX_TREATMENTS) treatLines.push(`· ……另有 ${treatments.length - MAX_TREATMENTS} 条更早的记录`)

  const blocks = [
    { key: 'metrics', label: '指标序列', lines },
    { key: 'treatments', label: '治疗与时间节点', lines: treatLines.length ? treatLines : ['· 没有治疗记录。'], note: '用来对照"某段时间里在做什么"，不据此推断指标变化的原因。' },
  ]

  const arm = wb.arm?.()
  if (arm?.latest) {
    const pts = (arm.latest.points ?? []).filter((p) => p.diff !== null && p.diff !== undefined)
    if (pts.length) {
      blocks.push({
        key: 'arm',
        label: '上肢四点位（最近一次）',
        lines: [
          `· ${day(arm.latest.measuredOn)}，${arm.latest.assessorLabel ?? '本人'}测量，方法：${arm.latest.protocolLabel ?? '未注明'}`,
          `  ${pts.map((p) => `${p.label} ${fmtValue(p.diff, 1)} cm`).join('、')}`,
        ],
        note: '差值只按记录呈现；单点不连线，缺健侧时不出差值。',
      })
    }
  }

  return blocks
}

function prepBlocks(wb, includePrivate, gaps, excluded) {
  const blocks = []
  const questions = (wb.questions().list ?? []).filter((q) => q.status !== 'dropped')
  const qLines = questions.slice(0, MAX_QUESTIONS).map((q, i) =>
    `${i + 1}. ${q.text}${q.kind === 'view' ? '（我的看法 / 担心，不是结论）' : ''}${q.version > 1 ? `（第 ${q.version} 版）` : ''}`)
  if (questions.length > MAX_QUESTIONS) qLines.push(`……另有 ${questions.length - MAX_QUESTIONS} 项`)
  blocks.push({ key: 'questions', label: '想问的事', lines: qLines.length ? qLines : ['· 问题清单还是空的。'] })

  const tasks = (wb.tasks().list ?? []).filter((t) => t.status === 'open')
  const tLines = tasks.slice(0, MAX_TASKS).map((t) =>
    `· ${t.dueOn ? day(t.dueOn) : '没有日期'} ${t.title}（${t.kindLabel ?? t.kind}）`)
  if (tasks.length > MAX_TASKS) tLines.push(`……另有 ${tasks.length - MAX_TASKS} 项`)
  blocks.push({ key: 'tasks', label: '还没完成的安排', lines: tLines.length ? tLines : ['· 没有未完成的安排。'] })

  const all = wb.viewpoints().list ?? []
  const visible = all.filter((v) => includePrivate || !v.isPrivate).slice(0, MAX_VIEWPOINTS)
  const hidden = all.filter((v) => v.isPrivate).length
  if (hidden && !includePrivate) {
    excluded.push({ label: `${hidden} 条私密看法`, reason: '默认不带入；要带请在预览里勾选' })
  }
  blocks.push({
    key: 'viewpoints',
    label: '我自己记下的看法',
    lines: visible.length
      ? visible.map((v) => `· ${day(v.recordedOn)} ${v.speakerLabel}：${v.text}${v.isPrivate ? '（私密，本次已勾选带入）' : ''}`)
      : ['· 没有可带入的看法。'],
    note: '看法只用来说明"我在担心什么"，不是医生结论，也不作为事实。',
  })

  const graded = (wb.metrics().cards ?? []).filter((c) => c.ctcae?.grade >= 2)
  if (graded.length) {
    blocks.push({
      key: 'graded',
      label: '最近指标里达到对照 2 级及以上的',
      lines: graded.map((c) => `· ${c.name} ${fmtValue(c.latest?.value, c.dec)} ${c.unit ?? ''}（${day(c.latest?.date)}，对照 ${c.ctcae.grade} 级）`),
      note: '列出来是为了提醒"可以问"，不是提示处理方式。',
    })
  }

  const pending = wb.overview()?.documents?.pendingCandidates ?? 0
  if (pending) pushGap(gaps, `还有 ${pending} 项整理结果没有核对，未纳入这份上下文`)

  return blocks
}

function draftBlocks(wb, gaps) {
  const draft = wb.draft()
  const metricNames = new Map((wb.metrics().series ?? []).map((s) => [s.code, s.name]))
  const fieldLabel = (field) => {
    const [ns, key] = String(field).split(':')
    if (ns === 'metric') return metricNames.get(key) ?? key
    if (ns === 'treatment') return `治疗：${key}`
    return field
  }

  const facts = []
  let pendingCount = 0
  for (const entry of draft.documents ?? []) {
    for (const item of entry.candidates ?? []) {
      const c = item.candidate
      if (c.status === 'pending' || c.status === 'needs_review') { pendingCount += 1; continue }
      if (c.status !== 'accepted' && c.status !== 'edited') continue
      const value = c.value_num !== null && c.value_num !== undefined ? fmtValue(c.value_num, 2) : (c.value_text ?? '')
      const unit = c.unit ? ` ${c.unit}` : ''
      const when = item.suggestedDate ? day(item.suggestedDate) : '日期未填'
      facts.push(`· ${when} ${fieldLabel(c.field)}：${value}${unit}（来源：${entry.document?.filename ?? '材料'}；${c.status === 'edited' ? '修改后接受' : '已接受'}）`)
    }
  }
  if (pendingCount) pushGap(gaps, `另有 ${pendingCount} 项待核对，**未纳入**这份上下文（候选未经你确认，不当作事实）`)

  if (!facts.length) {
    return { blocks: [], ready: false, reason: '还没有已接受的事实。先在上面的表格里逐项确认，再带来讨论。' }
  }
  return {
    ready: true,
    blocks: [{
      key: 'facts',
      label: '已核对并进入档案的事实',
      lines: facts.slice(0, MAX_FACTS).concat(facts.length > MAX_FACTS ? [`……另有 ${facts.length - MAX_FACTS} 项`] : []),
      note: '这里的"已接受"只表示转录核对过，不等于医学审核。',
    }],
  }
}

/* ---------------- 组装 ---------------- */

function assemble({ label, blocks, gaps, excluded, ask = ASK, avoid = AVOID, now = new Date() }) {
  const lines = [`【上下文｜小粉宝工作台 · ${label}】`, `整理时间：${stamp(now)}（本机记录，不含任何远程数据）`, '']
  blocks.forEach((block, i) => {
    lines.push(`${i + 1}. ${block.label}`)
    lines.push(...block.lines)
    if (block.note) lines.push(`（${block.note}）`)
    lines.push('')
  })
  if (gaps.length) {
    lines.push('缺项（先看清楚再问）：')
    lines.push(...gaps.map((g) => `· ${g}`))
    lines.push('')
  }
  if (excluded.length) {
    lines.push('这次没有带入的内容：')
    lines.push(...excluded.map((e) => `· ${e.label}——${e.reason}`))
    lines.push('')
  }
  lines.push('请你怎么用：')
  lines.push(...ask.map((a, i) => `${i + 1}. ${a}`))
  lines.push('请不要：')
  lines.push(...avoid.map((a) => `· ${a}`))

  let prompt = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (prompt.length > MAX_PROMPT) prompt = `${prompt.slice(0, MAX_PROMPT)}\n\n（上下文过长，后面已截断；完整内容在左侧页面里。）`
  return prompt
}

/**
 * 生成一页的上下文草稿。
 *
 * @param {object} wb Workbench 实例（用它的公开读模型，不碰 db）
 * @param {string} scope `timeline` / `prep` / `draft`
 * @param {{codes?: string[], includePrivate?: boolean, now?: Date}} [options]
 */
export function buildAgentContext(wb, scope, { codes = [], includePrivate = false, now = new Date() } = {}) {
  if (!AGENT_SCOPES.includes(scope)) {
    throw new Error(`不支持的上下文范围：${scope}（可用：${AGENT_SCOPES.join(' / ')}）`)
  }
  const label = AGENT_SCOPE_LABELS[scope]
  const gaps = []
  const excluded = []

  let blocks = []
  if (scope === 'timeline') blocks = timelineBlocks(wb, codes.filter((c) => typeof c === 'string').slice(0, 4), gaps, excluded)
  else if (scope === 'prep') blocks = prepBlocks(wb, includePrivate, gaps, excluded)
  else {
    const out = draftBlocks(wb, gaps)
    blocks = out.blocks
    if (!out.ready) {
      return { scope, label, ready: false, reason: out.reason, blocks: [], gaps, excluded, prompt: '', lineCount: 0 }
    }
  }

  if (!blocks.length || blocks.every((b) => !b.lines.length)) {
    return { scope, label, ready: false, reason: '这一页还没有可带入的记录。', blocks: [], gaps, excluded, prompt: '', lineCount: 0 }
  }

  const prompt = assemble({ label, blocks, gaps, excluded, now })
  return {
    scope,
    label,
    ready: true,
    reason: null,
    blocks,
    gaps,
    excluded,
    prompt,
    lineCount: prompt.split('\n').length,
  }
}
