/** 界面组件与图表（手写 SVG，无第三方依赖）。 */

export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel))

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export const fmtNum = (v, dec = 1) => {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return dec === 0 ? String(Math.round(n)) : n.toFixed(dec)
}
export const unitText = (unit) => (!unit || unit === '—' ? '' : unit)
export const longDate = (d) => (d ? String(d).replace(/-/g, '.') : '—')
export const shortDate = (d) => (d ? String(d).slice(5).replace('-', '.') : '—')
export const today = () => new Date().toISOString().slice(0, 10)

export function relTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - Date.parse(iso)
  if (!Number.isFinite(diff)) return ''
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} 小时前`
  if (diff < 30 * 86_400_000) return `${Math.round(diff / 86_400_000)} 天前`
  return longDate(String(iso).slice(0, 10))
}

export const btn = (text, action, cls = '', attr = '') => `<button class="${cls}" data-action="${action}" ${attr}>${text}</button>`
export const go = (text, page, sub = '', cls = '') => btn(text, 'go', cls, `data-page="${page}" data-sub="${esc(sub)}"`)
export const pill = (text, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`

export const section = (title, desc = '', action = '') => `<div class="section-title"><div><h2>${title}</h2>${desc ? `<p>${desc}</p>` : ''}</div>${action}</div>`
export const head = (title, desc, action = '') => `<div class="page-head"><div><span class="eyebrow">PINKYPAL / YOUR CARE COMPANION</span><h1>${title}</h1><p>${desc}</p></div><div class="actions">${action}</div></div>`

export function empty(title, desc = '', action = '') {
  return `<div class="empty"><h3>${esc(title)}</h3>${desc ? `<p>${esc(desc)}</p>` : ''}${action ? `<div class="actions" style="justify-content:center;margin-top:10px">${action}</div>` : ''}</div>`
}

/* ---------------- toast / dialog ---------------- */

let toastTimer = null
export function toast(text) {
  const el = $('#toast')
  if (!el) return
  clearTimeout(toastTimer)
  el.textContent = text
  el.classList.add('visible')
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3800)
}

export function openModal(title, body, foot = '', eyebrow = '小粉宝 · 本机数据') {
  $('#dialog-title').textContent = title
  $('#dialog-eyebrow').textContent = eyebrow
  $('#dialog-body').innerHTML = body
  $('#dialog-foot').innerHTML = foot
  if (!$('#dialog').open) $('#dialog').showModal()
  document.body.style.overflow = 'hidden'
}

export function closeModal() {
  const dlg = $('#dialog')
  if (dlg?.open) dlg.close()
}

/* ---------------- 折线 ---------------- */

const CW = 980, CH = 400, CX0 = 62, CX1 = 954, CY0 = 118, CY1 = 352

export function smoothPath(coords) {
  if (!coords.length) return ''
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`
  return coords.reduce((d, p, i) => {
    if (!i) return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
    const prev = coords[i - 1], before = coords[i - 2] || prev, after = coords[i + 1] || p
    const c1x = prev.x + (p.x - before.x) / 6, c1y = prev.y + (p.y - before.y) / 6
    const c2x = p.x - (after.x - prev.x) / 6, c2y = p.y - (after.y - prev.y) / 6
    return `${d} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  }, '')
}

export function dataEnd(series = [], fallback = null) {
  let end = fallback
  for (const s of series) {
    for (const p of s.points ?? []) if (!end || String(p.date) > end) end = String(p.date)
  }
  return end ?? today()
}

export function windowRange(range, zoom, endIso) {
  const end = Date.parse(`${endIso}T00:00:00Z`)
  const months = { '3m': 3, '6m': 6, '12m': 12 }[range]
  const start = months
    ? new Date(new Date(end).setUTCMonth(new Date(end).getUTCMonth() - months)).getTime()
    : end - 366 * 86_400_000
  const span = Math.max(end - start, 86_400_000)
  const kept = span * Math.max(40, Math.min(100, zoom)) / 100
  return [end - kept, end]
}

const xOf = (t, t0, t1) => CX0 + (t - t0) / Math.max(1, t1 - t0) * (CX1 - CX0)

function monthTicks(t0, t1) {
  const out = []
  const d = new Date(t0)
  let cur = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  if (cur.getTime() < t0) cur.setUTCMonth(cur.getUTCMonth() + 1)
  while (cur.getTime() <= t1) {
    const x = xOf(cur.getTime(), t0, t1)
    if (x > CX0 + 6 && x < CX1 - 6) out.push({ x, label: `${cur.getUTCMonth() + 1}月` })
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))
  }
  return out.length > 8 ? out.filter((_, i) => i % 2 === 0) : out
}

const TREATMENT_COLORS = {
  surgery: '#c2416b', chemo: '#d98324', radio: '#7c6aae', endocrine: '#2f7d6b',
  targeted: '#3f6f7e', immuno: '#8d5b4c', other: '#8a7a80',
}

/**
 * 多指标时间轴。每条线按**自身全部记录**的 min/max 缩放，图例里写明不可比。
 * 治疗条在独立区域，不压曲线；关闭开关后条与虚线一起消失，数据点位置不变。
 */
export function timelineChart({ series = [], treatments = [], range = 'all', zoom = 100, toggles = {}, pin = null, fallbackEnd = null }) {
  const endIso = dataEnd(series, fallbackEnd)
  const [t0, t1] = windowRange(range, zoom, endIso)
  const visible = series
    .filter((s) => (s.points ?? []).some((p) => Date.parse(`${p.date}T00:00:00Z`) >= t0 && Date.parse(`${p.date}T00:00:00Z`) <= t1))
  if (!visible.length) {
    return empty('这个时间窗里没有所选指标', '扩大时间范围，或在左侧加选一个指标。')
  }

  const bands = toggles.treatment
    ? treatments
      .filter((tr) => tr.start && Date.parse(`${tr.start}T00:00:00Z`) <= t1 && Date.parse(`${tr.end ?? tr.start}T00:00:00Z`) >= t0)
      .map((tr) => ({
        ...tr,
        x1: xOf(Math.max(Date.parse(`${tr.start}T00:00:00Z`), t0), t0, t1),
        x2: xOf(Math.min(Date.parse(`${tr.end ?? tr.start}T00:00:00Z`), t1), t0, t1),
        color: TREATMENT_COLORS[tr.kind] ?? '#8a7a80',
      }))
    : []

  const strip = bands.map((b, i) => {
    const row = 20 + i * 16
    if (b.kind === 'surgery') {
      const x = b.x1.toFixed(1)
      return `<g><path d="M ${x} ${row - 4} l4 4 -4 4 -4 -4 Z" fill="${b.color}"/>
        <text x="${(+x + 8).toFixed(1)}" y="${row + 3.5}" font-size="9.5" fill="${b.color}" font-weight="600">${esc(b.kindLabel ?? b.name)}</text></g>`
    }
    const w = Math.max(b.x2 - b.x1, 8).toFixed(1)
    return `<g><rect x="${b.x1.toFixed(1)}" y="${row - 3}" width="${w}" height="6" rx="3" fill="${b.color}" opacity=".3"/>
      <text x="${(b.x1 + 2).toFixed(1)}" y="${row - 7}" font-size="9.5" fill="${b.color}" font-weight="500">${esc(b.name)}</text></g>`
  }).join('')

  const surgeryLines = bands.filter((b) => b.kind === 'surgery').map((b) =>
    `<line x1="${b.x1.toFixed(1)}" x2="${b.x1.toFixed(1)}" y1="${CY0}" y2="${CY1}" stroke="${b.color}" stroke-width="1.2" stroke-dasharray="3 6" opacity=".4"/>`).join('')

  const grid = [0, 1, 2, 3, 4].map((i) => {
    const y = CY0 + i * (CY1 - CY0) / 4
    return `<line class="grid" x1="${CX0}" x2="${CX1}" y1="${y}" y2="${y}"/>`
  }).join('')

  const lines = visible.map((s, si) => {
    const all = (s.points ?? []).map((p) => p.value)
    const lo = Math.min(...all), hi = Math.max(...all)
    const span = hi - lo || Math.max(Math.abs(hi) * 0.08, 1)
    const yOf = (v) => CY1 - (v - lo) / span * (CY1 - CY0)

    const segs = (s.segments ?? [{ points: s.points }]).map((seg) => {
      const pts = (seg.points ?? []).filter((p) => {
        const t = Date.parse(`${p.date}T00:00:00Z`)
        return t >= t0 && t <= t1
      })
      if (!pts.length) return ''
      const coords = pts.map((p) => ({ x: xOf(Date.parse(`${p.date}T00:00:00Z`), t0, t1), y: yOf(p.value) }))
      const path = coords.length > 1
        ? `<path class="line" d="${smoothPath(coords)}" stroke="${s.color}" pathLength="1"/>`
        : ''
      const dots = coords.map((c, i) => {
        const p = pts[i]
        const prev = pts[i - 1]
        const isLast = i === pts.length - 1
        const r = isLast ? 5.2 : (i === 0 ? 4.6 : 4)
        const nearRight = c.x > CX1 - 46
        let tag = ''
        if (prev && toggles.changes) {
          const chg = p.value - prev.value
          const usePct = !['康复测量', '引流'].includes(s.categoryLabel)
          const ratio = usePct ? (prev.value === 0 ? 1 : Math.abs(chg / prev.value)) : Math.abs(chg)
          if (ratio >= 0.2) {
            const text = usePct
              ? `${chg > 0 ? '+' : ''}${Math.round(chg / Math.abs(prev.value || 1) * 100)}%`
              : `${chg > 0 ? '+' : ''}${fmtNum(chg, s.dec)}${unitText(s.unit)}`
            const ty = (isLast && nearRight) ? c.y + 17 : c.y - 8 - (si % 2) * 11
            tag = `<text class="delta-tag" x="${(c.x + (nearRight ? -8 : 8)).toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${nearRight ? 'end' : 'start'}" fill="${s.color}">${esc(text)}</text>`
          }
        }
        let val = ''
        if (toggles.keypoints && isLast) {
          val = `<text x="${(c.x - 4).toFixed(1)}" y="${(c.y - 11 - (si % 2) * 13).toFixed(1)}" text-anchor="end" fill="${s.color}" font-size="11" font-weight="600">${fmtNum(p.value, s.dec)}</text>`
        }
        const active = pin && pin.code === s.code && pin.date === p.date
        return `<circle class="pt${active ? ' active' : ''}" data-action="pin" data-code="${s.code}" data-date="${p.date}" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${r}" fill="${s.color}"><title>${esc(s.name)} ${fmtNum(p.value, s.dec)} ${esc(unitText(s.unit))} · ${longDate(p.date)}</title></circle>${tag}${val}`
      }).join('')
      return `<g>${path}${dots}</g>`
    }).join('')
    return `<g>${segs}</g>`
  }).join('')

  const ticks = monthTicks(t0, t1).map((t) => `<text class="tick" x="${t.x.toFixed(1)}" y="${CY1 + 22}" text-anchor="middle">${t.label}</text>`).join('')

  return `<div class="chart-wrap" id="chart-wrap">
    <svg class="chart" id="timeline-svg" viewBox="0 0 ${CW} ${CH}" role="img"
      aria-label="已选指标与治疗时间轴；每条线按自身范围绘制，点选可查看数值与来源">
      ${grid}
      <line class="axis" x1="${CX0}" x2="${CX1}" y1="${CY1}" y2="${CY1}"/>
      ${toggles.treatment ? `<text x="10" y="16" font-size="9.5" fill="#a2949b">治疗</text>${strip}${surgeryLines}` : ''}
      ${lines}${ticks}
      <text class="tick" x="${CX0}" y="${CH - 6}">↑ 每条线按该指标自身范围缩放，不代表不同指标数值可比</text>
    </svg>
    <div class="chart-tip" id="chart-tip"></div>
  </div>
  <p class="small-note scroll-hint">图表可左右滑动，查看完整时间段</p>`
}

export function legendHTML(series) {
  if (!series.length) return ''
  return `<div class="legend">${series.map((s) => {
    const latest = s.latest ?? (s.points.at(-1) ?? null)
    const values = (s.points ?? []).map((p) => p.value)
    const lo = values.length ? Math.min(...values) : null
    const hi = values.length ? Math.max(...values) : null
    return `<span><i style="background:${s.color}"></i><b>${esc(s.name)}</b> ${latest ? `${fmtNum(latest.value, s.dec)} ${esc(unitText(s.unit))}` : '无记录'}<span class="range">${values.length > 1 ? `全期 ${fmtNum(lo, s.dec)}–${fmtNum(hi, s.dec)}` : '单点不连线'}</span></span>`
  }).join('')}</div>`
}

/* ---------------- 迷你折线 ---------------- */

export function sparkline(points, color, dec, { width = 220, height = 62 } = {}) {
  const pad = 7
  if (!points?.length) return `<div class="na">还没有记录</div>`
  const vals = points.map((p) => p.value)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const span = hi - lo || Math.max(Math.abs(hi) * 0.08, 1)
  const coords = points.map((p, i) => ({
    x: pad + i * (width - pad * 2) / Math.max(points.length - 1, 1),
    y: height - 12 - (p.value - lo) / span * (height - 24),
  }))
  const path = points.length > 1 ? smoothPath(coords) : ''
  const last = coords.at(-1)
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="最近 ${points.length} 次记录折线">
    <line class="base" x1="${pad}" x2="${width - pad}" y1="${height - 12}" y2="${height - 12}"/>
    ${path ? `<path class="sp-line" d="${path}" stroke="${color}" pathLength="1"/>` : ''}
    ${coords.map((c, i) => `<circle class="sp-dot" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === coords.length - 1 ? 3.6 : 2.6}" fill="${color}" style="animation-delay:${i * 45}ms"/>`).join('')}
    <text x="${Math.min(last.x, width - 24)}" y="${Math.max(last.y - 8, 10)}" text-anchor="middle" font-size="9.5" fill="${color}" font-weight="600">${fmtNum(points.at(-1).value, dec)}</text>
  </svg>`
}

/* ---------------- 指标卡（原地翻转） ---------------- */

/**
 * CTCAE 分级徽章（只在有级时出现）。
 * 文案固定为"对照 … 级"，不写"偏高 / 异常 / 需要处理"——分级是把值放进国际标准的
 * 客观区间，是**对照**不是诊断。`ctcaeVersion` 由读模型元信息透传，前端不硬编码版本。
 */
export function gradeBadge(grade, ctcaeVersion = '', extraClass = '') {
  if (!grade) return ''
  const v = ctcaeVersion ? `v${esc(ctcaeVersion)} · ` : ''
  return `<span class="grade-chip${grade >= 3 ? ' high' : ''}${extraClass ? ` ${extraClass}` : ''}">对照 CTCAE ${v}${grade} 级</span>`
}

/**
 * 分级区间与免责一行（卡片背面 / 列表里用）。
 * `extra` 用来把"方法变更断线"之类的既有提示并进同一段——卡片背面高度是固定的
 * （194px），多占一段就会把页脚挤出可视区（实测踩过）。
 */
export function gradeLine(ctcae, ctcaeVersion = '', extra = '') {
  const parts = []
  if (ctcae?.grade) {
    const v = ctcaeVersion ? `CTCAE v${esc(ctcaeVersion)}` : 'CTCAE'
    parts.push(`${v} ${ctcae.grade} 级${ctcae.band ? ` · ${esc(ctcae.band)}` : ''}${ctcae.approx ? ' · 按通用下限' : ''} · 对照不是诊断`)
  }
  if (extra) parts.push(esc(extra))
  return parts.length ? `<span class="grade-line">${parts.join(' · ')}</span>` : ''
}

export function metricCard(card, flipped, ctcaeVersion = '') {
  const color = card.color
  const latest = card.latest
  const badge = card.ctcae?.grade ? gradeBadge(card.ctcae.grade, ctcaeVersion) : ''
  const backGrade = card.ctcae?.grade || card.breakCount
    ? gradeLine(card.ctcae, ctcaeVersion, card.breakCount ? `${card.breakCount} 处方法变更断线` : '')
    : ''
  if (!latest) {
    return `<button class="mcard" data-action="flip" data-code="${card.code}" aria-pressed="false" aria-label="${esc(card.name)}，还没有记录">
      <span class="mcard-inner">
        <span class="mface front" aria-hidden="true">
          <span class="cat"><i style="background:${color}"></i>${esc(card.categoryLabel)}</span>
          <span class="name">${esc(card.name)}</span>
          <span class="na">还没有记录。<br>导入检验单或手工补录后会出现在这里。</span>
          <span class="meta"><span>单位 ${esc(unitText(card.unit)) || '—'}</span><span class="hint">无数据</span></span>
        </span>
        <span class="mface back" aria-hidden="true"><span class="name">${esc(card.name)}</span><span class="na">没有可回顾的记录。</span></span>
      </span></button>`
  }
  const delta = card.delta
  const trend = delta === null
    ? '首次记录'
    : `较前次 ${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} <em>${fmtNum(Math.abs(delta), card.dec)} ${esc(unitText(card.unit))}</em>`
  const recent = card.recent ?? []
  const back = recent.length > 1
    ? `<span class="cat"><i style="background:${color}"></i>${esc(card.categoryLabel)}</span>
       <span class="name">${esc(card.name)} · 最近 ${recent.length} 次</span>
       ${sparkline(recent, color, card.dec)}
       <span class="spark-labels"><span>${longDate(recent[0].date)}</span><span>${longDate(recent.at(-1).date)}</span></span>
       ${backGrade}
       <span class="foot">仅回顾已记录的值 · 点击返回</span>`
    : `<span class="cat"><i style="background:${color}"></i>${esc(card.categoryLabel)}</span>
       <span class="name">${esc(card.name)}</span>
       <span class="na">只有 1 次记录，暂不连线。<br>再记录一次后显示趋势。</span>
       ${backGrade}
       <span class="foot">${longDate(latest.date)} · 点击返回</span>`
  return `<button class="mcard" data-action="flip" data-code="${card.code}" aria-pressed="${flipped ? 'true' : 'false'}" aria-label="${esc(card.name)}，${fmtNum(latest.value, card.dec)} ${esc(unitText(card.unit))}，${longDate(latest.date)}${card.ctcae?.grade ? `，对照 CTCAE ${card.ctcae.grade} 级` : ''}；${flipped ? '点击返回摘要' : `点击翻转查看最近 ${recent.length} 次记录`}">
    <span class="mcard-inner">
      <span class="mface front" aria-hidden="true">
        <span class="cat"><i style="background:${color}"></i>${esc(card.categoryLabel)}</span>
        <span class="name">${esc(card.name)}</span>
        <span class="val">${fmtNum(latest.value, card.dec)}<small>${esc(unitText(card.unit))}</small></span>
        <span class="delta">${trend}</span>
        ${badge ? `<span class="grade-slot" title="${esc(card.ctcae.band ?? '')}（${esc(card.ctcae.term ?? '')}）">${badge}</span>` : ''}
        <span class="rec">共 ${card.count} 次记录${card.count > 1 ? ' · 点击翻转看趋势' : ''}</span>
        <span class="meta"><span>${longDate(latest.date)} · ${esc(latest.source ?? '本人记录')}</span><span class="hint">翻转 ↗</span></span>
      </span>
      <span class="mface back" aria-hidden="true">${back}</span>
    </span></button>`
}

/* ---------------- 臂围 ---------------- */

export function armChart(series) {
  if (!series.length) return empty('还没有四点位测量', '记录一次就能看到差值；两次以上才连线。')
  const w = 900, h = 240, L = 52, R = 20, T = 22, B = 34
  const maxV = Math.max(2.6, ...series.map((p) => p.value))
  const t0 = Date.parse(`${series[0].date}T00:00:00Z`)
  const t1 = Date.parse(`${series.at(-1).date}T00:00:00Z`) || t0 + 86_400_000
  const x = (d) => L + (Date.parse(`${d}T00:00:00Z`) - t0) / Math.max(1, t1 - t0) * (w - L - R)
  const y = (v) => h - B - (v / maxV) * (h - T - B)
  const coords = series.map((p) => ({ x: x(p.date), y: y(p.value) }))
  const path = series.length > 1 ? smoothPath(coords) : ''
  const area = series.length > 1
    ? `${path} L ${coords.at(-1).x} ${h - B} L ${coords[0].x} ${h - B} Z`
    : ''
  const gridVals = [0, 0.5, 1, 1.5, 2, 2.5].filter((v) => v <= maxV)
  return `<svg class="arm-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="患健侧臂围差记录：${series.map((p) => `${p.date} ${p.value}cm`).join('；')}">
    ${gridVals.map((v) => `<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}" stroke="#f3e8ec"/><text x="${L - 8}" y="${y(v) + 3}" text-anchor="end" class="tick">${v}</text>`).join('')}
    <line x1="${L}" x2="${w - R}" y1="${y(2)}" y2="${y(2)}" stroke="#d8a6b6" stroke-dasharray="5 5"/>
    <text x="${L + 8}" y="${y(2) - 6}" text-anchor="start" font-size="10" fill="#a9788a" class="ref-label">参考关注线 2cm（提示进一步评估的常用口径，需专业确认）</text>
    ${area ? `<path d="${area}" fill="#c2416b" opacity=".07"/>` : ''}
    ${path ? `<path d="${path}" fill="none" stroke="#a8410a" stroke-width="2.6" stroke-linecap="round" pathLength="1" class="line"/>` : ''}
    ${coords.map((c, i) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === coords.length - 1 ? 5 : 3.8}" fill="#a8410a" stroke="#fff" stroke-width="1.8" class="pt" style="animation-delay:${i * 50}ms"><title>${longDate(series[i].date)} · ${series[i].value} cm</title></circle>
      ${series.length > 1 ? `<text x="${c.x.toFixed(1)}" y="${c.y - 11}" text-anchor="middle" font-size="10.5" fill="#a8410a" font-weight="600">${series[i].value}</text>` : ''}
      <text x="${c.x.toFixed(1)}" y="${h - 12}" text-anchor="middle" class="tick">${shortDate(series[i].date)}</text>`).join('')}
  </svg>`
}

/* ---------------- 症状轨道（强度色块，不是曲线） ---------------- */

export function symptomTrack(symptoms) {
  if (!symptoms.length) {
    return `<p class="small-note">还没有症状记录。强度是自评体验，不是检验值，也不画成曲线。</p>`
  }
  const months = []
  const now = new Date()
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    months.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: `${d.getUTCMonth() + 1}月` })
  }
  const codes = [...new Set(symptoms.map((s) => s.code))]
  const rows = codes.slice(0, 6).map((code) => {
    const label = symptoms.find((s) => s.code === code)?.label ?? code
    const cells = months.map((m) => {
      const hit = symptoms.filter((s) => s.code === code && String(s.occurredOn).startsWith(m.key))
      const level = hit.length ? Math.max(...hit.map((s) => s.level)) : 0
      return `<span class="cell${level ? ` l${level}` : ''}" title="${esc(label)} · ${m.label} 最高强度 ${level}/3"></span>`
    }).join('')
    return `<span class="label">${esc(label)}</span>${cells}`
  }).join('')
  return `<div class="symptom-track"><span></span>${months.map((m) => `<span class="head">${m.label}</span>`).join('')}${rows}</div>
  <p class="small-note">症状以强度色块呈现，不画成曲线：0–3 是体验强度，不是检验值。色块越深表示自评强度越高。</p>`
}

/* ---------------- 其它 ---------------- */

export function codeBlock(text) {
  return `<pre class="mono" style="white-space:pre-wrap;background:#fbf9f6;border:1px solid var(--line);border-radius:10px;padding:12px;max-height:320px;overflow:auto">${esc(text)}</pre>`
}

export function downloadText(filename, text, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1200)
}
