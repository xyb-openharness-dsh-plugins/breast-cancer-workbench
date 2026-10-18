/**
 * 解析结果 → 待核对候选（M2 的"机械部分"）。
 *
 * 只做**抄写**，不做判断：找到指标名 + 数字 + 单位，就产一条候选；读不准就降低把握度或干脆不产。
 * 三条不能越的线：
 * 1. 只认字典里的 18 项指标（不在字典里的名词不进候选，避免"报告里的所有字样都变成数据"）；
 * 2. 不推断结论：不产病理结论、不产"是否复发"、不写 `viewpoint`（那是用户的话）；
 * 3. 单位没读清就留空——草稿页会标 `unit_missing`，比替用户猜一个单位安全。
 *
 * 词表放在这里而不是 `metric_definition.aliases_json`：那张表留给用户在设置里加的别名（M4），
 * 内置词表是代码的一部分，可被单测盯着。
 */

/** 内置识别词表（拉丁名按词边界匹配，中文按包含匹配）。 */
export const METRIC_ALIASES = {
  ca153: ['CA15-3', 'CA153', 'CA 15-3', 'CA15－3', '糖类抗原15-3', '糖链抗原15-3'],
  cea: ['CEA', '癌胚抗原'],
  wbc: ['WBC', '白细胞计数', '白细胞'],
  anc: ['ANC', 'NEUT#', '中性粒细胞绝对值', '中性粒细胞计数', '中性粒细胞'],
  hgb: ['HGB', 'Hb', '血红蛋白'],
  plt: ['PLT', '血小板计数', '血小板'],
  alt: ['ALT', '谷丙转氨酶', '丙氨酸氨基转移酶'],
  cr: ['Creatinine', 'CREA', 'Scr', 'Cr', '肌酐', '血肌酐'],
  lvef: ['LVEF', '左室射血分数'],
  bmd_ls: ['腰椎骨密度', 'L1-L4 骨密度', '骨密度T值'],
  weight: ['体重'],
  bmi: ['BMI', '体质指数'],
  arm_diff: ['臂围差', '上肢周径差', '患健侧差值'],
  arm_vol_diff: ['体积差', '上肢体积差'],
  arm_flex: ['前屈', '前屈角度'],
  arm_abd: ['外展', '外展角度'],
  grip: ['握力'],
  drain_vol: ['引流量', '引流液量'],
}

/** 单位写法归一：报告里 `10^9/L`、`×10⁹/L`、`10*9/L` 是同一个单位。 */
const UNIT_ALIASES = new Map(Object.entries({
  '10^9/l': '10⁹/L', '10⁹/l': '10⁹/L', '10*9/l': '10⁹/L', '×10⁹/l': '10⁹/L', '10e9/l': '10⁹/L',
  'umol/l': 'μmol/L', 'µmol/l': 'μmol/L', 'μmol/l': 'μmol/L',
  'u/ml': 'U/mL', 'ng/ml': 'ng/mL', 'g/l': 'g/L', 'u/l': 'U/L',
  'kg/m2': 'kg/m²', 'kg/m²': 'kg/m²',
  'ml/日': 'mL/日', 'ml/d': 'mL/日', 'ml/day': 'mL/日', 'ml': 'mL/日',
  '%': '%', '°': '°', 'kg': 'kg', 'cm': 'cm',
}))

const DATE_PATTERNS = [
  /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/,
  /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/,
]
const DATE_LABELS = ['采样', '采集', '报告日期', '检验日期', '送检', '检测时间', '日期']
const METHOD_PATTERNS = [
  [/电化学发光|ECLIA/i, 'ECLIA'],
  [/微粒子化学发光|CMIA/i, 'CMIA'],
  [/化学发光|CLIA/i, 'CLIA'],
]
const NUMBER_RE = /([<>≤≥＜＞]?)\s*(\d+(?:\.\d+)?)/

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const pad = (n) => String(n).padStart(2, '0')

/** 从一段文字里找报告/采样日期，找不到就是 null（不拿文件名或导入时间凑）。 */
export function extractReportDate(text) {
  if (!text) return null
  const lines = String(text).split('\n')
  const head = lines.slice(0, 40)

  const pick = (line) => {
    for (const re of DATE_PATTERNS) {
      const m = line.match(re)
      if (!m) continue
      const iso = `${m[1]}-${pad(m[2])}-${pad(m[3])}`
      if (isRealDate(iso)) return iso
    }
    return null
  }

  // 先看带标签的行（采样时间 / 报告日期 …），再看前 40 行的第一个日期
  for (const line of head) {
    if (DATE_LABELS.some((label) => line.includes(label))) {
      const iso = pick(line)
      if (iso) return iso
    }
  }
  for (const line of head) {
    const iso = pick(line)
    if (iso) return iso
  }
  return null
}

/** 归一单位；认不出返回 null（宁缺勿猜）。 */
export function normalizeUnit(raw) {
  if (!raw) return null
  const key = String(raw).toLowerCase().replace(/\s+/g, '').replace(/^×/, '')
  return UNIT_ALIASES.get(key) ?? null
}

function detectMethod(text) {
  for (const [re, label] of METHOD_PATTERNS) {
    if (re.test(text)) return label
  }
  return null
}

/** 拉丁别名要词边界（防止 `Cr` 命中 `CRP`），中文别名直接包含匹配。 */
function matchesAlias(text, alias) {
  if (/^[A-Za-z0-9#\-⁹]+$/.test(alias)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, 'i').test(text)
  }
  return text.includes(alias)
}

/** 从一段文本里找"指标名后面的第一个数"。返回 {raw, num, sign} 或 null。 */
function readValueAfter(text, alias) {
  const idx = text.toLowerCase().indexOf(alias.toLowerCase())
  const tail = idx >= 0 ? text.slice(idx + alias.length) : text
  const m = tail.match(NUMBER_RE)
  if (!m) return null
  const sign = m[1] || ''
  const raw = `${sign}${m[2]}`
  // 不等式（<0.5、≥200）不折成数字：折了就等于替用户下结论，留给核对时填
  const num = sign ? null : Number(m[2])
  return { raw, num, sign }
}

/** 在一行里找单位（取最长的匹配，`mL/日` 不能被 `mL` 抢先）。 */
function readUnit(text) {
  const cleaned = text.replace(/\s+/g, '')
  const candidates = [...UNIT_ALIASES.keys()].sort((a, b) => b.length - a.length)
  for (const key of candidates) {
    if (cleaned.toLowerCase().includes(key)) return UNIT_ALIASES.get(key)
  }
  return null
}

/** markdown 表格行 → 单元格数组；不是表格行返回 null。 */
function tableCells(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null
  const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim())
  if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) return null // 分隔行
  return cells
}

/** MinerU 的 markdown 里表格常是 HTML：`<table><tr><td>…`，先转成 `| a | b |` 行。 */
export function htmlTableToRows(html) {
  const rows = String(html)
    .replace(/\r/g, '')
    .split(/<\/tr>/i)
    .map((row) => row.replace(/<[^>]+>/g, '\u0001').replace(/\u0001+/g, '\u0001'))
    .map((row) => row.replace(/^\u0001/, '').replace(/\u0001$/, '').split('\u0001').map((c) => c.trim()))
    .filter((cells) => cells.length > 1 && cells.some((c) => c !== ''))
  return rows.map((cells) => `| ${cells.join(' | ')} |`)
}

/** 一个单元格里出现的指标（按出现位置排序，同一指标只留最靠前的一处）。 */
function aliasHits(cell, aliases) {
  const lower = cell.toLowerCase()
  const hits = []
  for (const [code, list] of Object.entries(aliases)) {
    let best = -1
    for (const alias of list) {
      if (!matchesAlias(cell, alias)) continue
      const at = lower.indexOf(alias.toLowerCase())
      if (at >= 0 && (best < 0 || at < best)) best = at
    }
    if (best >= 0) hits.push({ code, at: best })
  }
  return hits.sort((a, b) => a.at - b.at)
}

/** 取一个单元格里所有数字（含不等式符号）。 */
function numbersIn(cell) {
  return [...String(cell).matchAll(/([<>≤≥＜＞]?)\s*(\d+(?:\.\d+)?)/g)].map((m) => {
    const sign = m[1] || ''
    return { raw: `${sign}${m[2]}`, num: sign ? null : Number(m[2]), sign }
  })
}

/** 拆分单位单元格：`U/mL ng/mL 10^9/L` → ['U/mL','ng/mL','10⁹/L']（认不出的丢掉）。 */
function unitsIn(cell) {
  return String(cell)
    .split(/\s+/)
    .map((token) => normalizeUnit(token))
    .filter(Boolean)
}

/**
 * 表格行 → 候选。
 *
 * 关键的一处坑（真实 MinerU 输出就是这么来的）：整张表可能被塞进**一个单元格**
 * —— `Item CA15-3 CEA WBC …` / `Result 18.6 2.1 4.2 …` / `Unit U/mL ng/mL …`。
 * 这时必须**按位置对齐**：第 i 个指标配第 i 个数、第 i 个单位。
 * 对不齐（指标数与数值数不一致）就整行放弃——宁可漏，也不能把 8 个指标都写成同一个数。
 */
function candidatesFromTable(cells, pageRef, aliases) {
  const labelIndex = cells.findIndex((cell) => aliasHits(cell, aliases).length > 0)
  if (labelIndex < 0) return []

  const labelCell = cells[labelIndex]
  const hits = aliasHits(labelCell, aliases)
  const valueIndex = cells.findIndex((cell, i) => i > labelIndex && numbersIn(cell).length > 0)
  if (valueIndex < 0) return []

  const values = numbersIn(cells[valueIndex])
  const unitCell = cells.slice(valueIndex + 1).join(' ')
  const units = unitsIn(unitCell)
  const unitFor = (i) => (units.length === values.length ? units[i] : units.length === 1 ? units[0] : null)

  if (hits.length === 1) {
    const [hit] = hits
    return [{
      field: `metric:${hit.code}`,
      valueText: values[0].raw,
      valueNum: values[0].num,
      unit: unitFor(0) ?? readUnit(unitCell),
      pageRef,
      confidence: 0.9,
      label: hit.code,
    }]
  }

  if (hits.length !== values.length) {
    // 指标数与数值数对不上：不按位置硬配，整行不产候选（这种行交给人看原文）
    return []
  }
  return hits.map((hit, i) => ({
    field: `metric:${hit.code}`,
    valueText: values[i].raw,
    valueNum: values[i].num,
    unit: unitFor(i),
    pageRef,
    confidence: units.length === values.length ? 0.9 : 0.8,
    label: hit.code,
  }))
}

/**
 * 一行 → 若干条候选。
 * 表格行按单元格对齐取数；普通行按"指标名后面第一个数"取。
 */
function candidatesFromLine(line, { pageRef = null, aliases }) {
  const cells = tableCells(line)
  if (cells) return candidatesFromTable(cells, pageRef, aliases)

  const out = []
  for (const [code, aliasList] of Object.entries(aliases)) {
    const hit = aliasList.find((alias) => matchesAlias(line, alias))
    if (!hit) continue
    const value = readValueAfter(line, hit)
    if (!value) continue
    const unit = readUnit(line)
    out.push({
      field: `metric:${code}`,
      valueText: value.raw,
      valueNum: value.num,
      unit,
      pageRef,
      confidence: unit ? 0.85 : 0.7,
      label: hit,
    })
  }
  return out
}

/** MinerU 的 content_list → 带页码的文本块；表格拼回成 markdown 表格行。 */
export function blocksFromContentList(contentList) {
  if (!Array.isArray(contentList)) return []
  const blocks = []
  for (const item of contentList) {
    const pageRef = Number.isInteger(item?.page_idx) ? `第 ${item.page_idx + 1} 页` : null
    if (item?.type === 'table' && typeof item.table_body === 'string') {
      blocks.push({ text: htmlTableToRows(item.table_body).join('\n'), pageRef })
      continue
    }
    if (typeof item?.text === 'string' && item.text.trim()) {
      blocks.push({ text: item.text, pageRef })
    }
  }
  return blocks
}

export function blocksFromMarkdown(markdown) {
  const lines = String(markdown ?? '').split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    // MinerU 的 markdown 里表格是 HTML，可能跨行：先拼完整再转成 `| a | b |`
    if (/<table/i.test(line)) {
      let html = line
      while (!/<\/table>/i.test(html) && i + 1 < lines.length) {
        i += 1
        html += `\n${lines[i]}`
      }
      blocks.push({ text: htmlTableToRows(html).join('\n'), pageRef: null })
      continue
    }
    if (line.trim()) blocks.push({ text: line, pageRef: null })
  }
  return blocks
}

/**
 * 主入口：把解析结果变成候选。
 * @returns {{reportDate: string|null, items: Array, warnings: string[]}}
 */
export function extractCandidates({ markdown = null, contentList = null, extraAliases = {}, pageRefs = true } = {}) {
  const aliases = { ...METRIC_ALIASES }
  for (const [code, list] of Object.entries(extraAliases ?? {})) {
    if (!Array.isArray(list) || list.length === 0) continue
    aliases[code] = [...new Set([...(aliases[code] ?? []), ...list])]
  }

  const blocks = contentList
    ? blocksFromContentList(contentList)
    : blocksFromMarkdown(markdown)
  if (blocks.length === 0) {
    return { reportDate: null, items: [], warnings: ['解析结果里没有可读文本块'] }
  }

  const warnings = []
  const reportDate = extractReportDate(
    contentList ? blocks.slice(0, 40).map((b) => b.text).join('\n') : markdown,
  )
  if (!reportDate) warnings.push('没有从原件里读到报告/采样日期（核对时需要你填一次）')

  const seen = new Map()
  for (const block of blocks) {
    const lines = block.text.split('\n')
    for (const line of lines) {
      const method = detectMethod(line)
      for (const item of candidatesFromLine(line, { pageRef: pageRefs ? block.pageRef : null, aliases })) {
        const key = `${item.field}\u0000${item.valueText}`
        const existing = seen.get(key)
        if (existing) {
          // 同一个值在多处出现：保留把握度高的一条，页码保留最先出现的
          if (item.confidence > existing.confidence) seen.set(key, { ...item, pageRef: existing.pageRef ?? item.pageRef })
          continue
        }
        seen.set(key, { ...item, method })
      }
    }
  }

  const items = [...seen.values()].map((item) => ({
    field: item.field,
    valueText: item.valueText,
    valueNum: item.valueNum,
    unit: item.unit,
    method: item.method ?? null,
    pageRef: item.pageRef,
    confidence: item.confidence,
    label: item.label,
  }))
  if (items.length === 0) warnings.push('没认出任何字典内指标（可能不是检验单，或需要 OCR 质量更好的原件）')
  return { reportDate, items, warnings }
}
