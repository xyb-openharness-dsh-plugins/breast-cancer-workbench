/** 页面渲染：看板 / 病情整理 / 一图秀。 */
import { S, STAGE_HINT, SYMPTOM_CODES, categoryOrder } from './state.js'
import { apiBase } from './api.js'
import {
  esc, fmtNum, unitText, longDate, shortDate, relTime, today, btn, go, pill, section, head, empty,
  timelineChart, legendHTML, metricCard, gradeBadge, armChart, symptomTrack, sparkline,
} from './ui.js'

export const PAGES = [
  ['dashboard', '看板', 'home'],
  ['records', '病情整理', 'folder'],
  ['timeline', '病情一图秀', 'chart'],
  ['clinical', '临床', 'clinical'],
  ['nutrition', '营养支持', 'food'],
  ['mind', '心理支持', 'heart'],
  ['care', '全程与康复', 'calendar'],
  ['review', '收藏与回顾', 'bookmark'],
]

export const SUBPAGES = {
  records: ['资料库', '整理草稿 / 核对', '病情档案', '指标检测', '病情汇总'],
  clinical: ['治疗历程', '病理 / 分子档案', '试验线索', '资料对照', '我的关注', '数据来源'],
  nutrition: ['当下困扰', '进食与体重', '建议与回顾'],
  mind: ['当下感受', '我的记录', '支持资源', '身体与亲密'],
  care: ['近期安排', '术后恢复', '上肢与淋巴水肿', '不适记录', '就诊准备', '长期生活'],
  review: ['问题清单', '已保留结果', '报告与任务'],
}

export const SUBTITLES = {
  dashboard: '把眼前的事情理清楚，让每次记录都能继续帮到你。',
  records: '原始材料有出处，整理结果可核对，一次记录多处复用。',
  timeline: '治疗、检查、症状与上肢变化，放回同一段时间里。',
  clinical: '看懂自己的治疗资料，也为下一次讨论做好准备。',
  nutrition: '从今天吃得怎么样开始，少量记录也有意义。',
  mind: '这里可以放下感受，不需要整理好情绪再开始。',
  care: '治疗之外，也照顾手臂、体力与日常的节奏。',
  review: '重要的问题和结果，在需要的时候找得到。',
}

const icons = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  folder: 'M3 7h7l2 2h9v12H3ZM3 7V4h7l2 3',
  chart: 'M4 3v17h17M7 14l4-5 4 3 5-7',
  clinical: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',
  food: 'M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10M19 3c-4 3-4 9 0 10V3Zm0 10v8',
  heart: 'M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 8 15 8 15s13-10 8-15Z',
  calendar: 'M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2',
  bookmark: 'M6 3h12v19l-6-4-6 4Z',
}
export const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[k]}"/></svg>`

export function subnav() {
  const items = SUBPAGES[S.page]
  if (!items) return ''
  const sel = S.sub[S.page] || items[0]
  return `<nav class="subnav" role="tablist" aria-label="${esc(PAGES.find((p) => p[0] === S.page)?.[1] ?? '')}二级页面">${items.map((s) => `<button role="tab" aria-selected="${sel === s}" data-action="sub" data-sub="${esc(s)}">${esc(s)}</button>`).join('')}</nav>`
}

const d = () => S.data
const subOf = (page) => S.sub[page] || SUBPAGES[page]?.[0] || ''

/* ================= 看板 ================= */

function demoBanner() {
  const demo = S.state?.subjects?.find((s) => s.id === S.state?.subject?.id)?.demo
  if (!demo) return ''
  return `<div class="banner warn"><span><b>${esc(demo.id)} · ${esc(demo.label)}</b>：当前看到的是<b>模拟数据</b>，不是任何真实患者；观测 ${demo.counts?.observations ?? 0} 条、测量 ${demo.counts?.measurements ?? 0} 条、材料 ${demo.counts?.documents ?? 0} 份。</span>${btn('切换到我的档案', 'switch-profile', 'text-button')}</div>`
}

export function dashboard() {
  const o = d().overview
  if (!o) return `<p class="small-note">正在读取…</p>`
  const stage = o.subject?.stage
  const arm = o.arm
  const docs = o.documents
  const recent = o.recent ?? []
  const tasks = o.tasks?.list ?? []
  const questions = (d().questions?.list ?? []).filter((q) => q.includeInExport).slice(0, 3)
  const symptoms = d().symptoms?.list ?? []

  const hasAnything = docs.total > 0 || (arm.count > 0) || recent.length > 0 || tasks.length > 0 || questions.length > 0

  const armStrip = arm.latest
    ? `<div class="alert-strip">
        <div><b>患健侧臂围差 ${fmtNum(arm.latest.maxDiff, 1)} cm${arm.delta !== null ? `，较上次 ${arm.delta > 0 ? '+' : ''}${fmtNum(arm.delta, 1)} cm` : ''}</b>
          <p>${longDate(arm.latest.measuredOn)} 四点位测量 · 已同步到一图秀；是否需要处理请与治疗团队讨论，工作台不做判断。</p></div>
        <div class="actions">${go('看上肢趋势 →', 'care', '上肢与淋巴水肿', 'primary')}${btn('记录一次测量', 'add-arm', 'soft')}</div>
      </div>`
    : `<div class="alert-strip">
        <div><b>还没有上肢四点位记录</b><p>量一次腕横纹、前臂中段、肘上 10cm、腋下 10cm，工作台只算差值，不判断水肿分期。</p></div>
        <div class="actions">${btn('＋ 记录一次测量', 'add-arm', 'primary')}</div>
      </div>`

  /**
   * 骨髓抑制提醒（用户 2026-10-20 定则）：把"表达上的头晕无力"与"指标上的中性粒细胞低"
   * 并排放在一起，指标侧用 CTCAE v5.0 分级对照。
   *
   * 三条边界：
   * 1. 只在读模型 `paired`（感受与指标都记录了）时出现——只有一侧不构成提醒；
   * 2. 只**并置**已记录的内容，不写因果（不说"因为血象低所以头晕"）；
   * 3. 分级是对照国际标准的客观区间，明写"对照不是诊断"，是否处理交给治疗团队。
   */
  const marrowStrip = (() => {
    const marrow = o.marrow
    if (!marrow?.paired) return ''
    const ver = d().metrics?.ctcae?.version ?? ''
    const hasChemo = (d().clinical?.treatments ?? []).some((t) => t.kind === 'chemo')
    const when = hasChemo ? '化疗后' : '治疗期间'
    return `<div class="alert-strip marrow">
      <div style="flex:1;min-width:260px">
        <b>${when}常见反应 · 骨髓抑制：你记录到的两侧</b>
        <p>表达上是${esc(marrow.symptoms.map((s) => s.label).join('、'))}，指标上是${esc(marrow.labs.map((l) => l.name).join('、'))}。分级对照 CTCAE v${esc(ver)}（国际标准）的客观区间，只是把记录值放进区间里——<b>对照不是诊断</b>，是否处理由治疗团队判断。</p>
        <div class="marrow-cols">
          <div class="marrow-col"><span class="marrow-key">你记录的感受</span>
            ${marrow.symptoms.map((s) => `<span class="marrow-item"><b>${esc(s.label)}</b>强度 ${s.level}/3<small>${longDate(s.occurredOn)}${s.note ? ` · ${esc(s.note)}` : ''}</small></span>`).join('')}
          </div>
          <div class="marrow-col"><span class="marrow-key">记录里的血液学指标</span>
            ${marrow.labs.map((l) => `<span class="marrow-item"><b>${esc(l.name)} ${fmtNum(l.value, l.dec)} ${esc(unitText(l.unit))}</b>${gradeBadge(l.grade, ver)}<small>${longDate(l.date)} · ${esc(l.band ?? '')} · ${esc(l.source)}</small></span>`).join('')}
          </div>
        </div>
        <p class="small-note" style="margin-top:6px">${esc(marrow.note)}</p>
      </div>
      <div class="actions">${go('看血常规指标 ↗', 'records', '指标检测', 'soft')}${btn('记一条感受', 'add-symptom', 'soft')}</div>
    </div>`
  })()

  const docsText = docs.total === 0
    ? '还没有资料 · 先导入一份'
    : `${docs.parsed} 份已解析${docs.pendingCandidates ? ` · ${docs.pendingCandidates} 项待核对` : ' · 无待核对'}${docs.failed ? ` · ${docs.failed} 份解析失败` : ''}`

  if (!hasAnything) {
    return `${head('今天，先照顾眼前的一件事。', SUBTITLES.dashboard, btn(`当前阶段：${stage?.label ?? '未选择'}`, 'stage-pick', 'soft'))}
      ${demoBanner()}
      <section class="demo-cta" aria-label="模拟数据入口"><div><span class="eyebrow">先看看效果</span><b>加载一套模拟数据</b><p>会创建独立的演示档案，并自动打开「病情一图秀」。不写入你的真实档案。</p></div>${btn('加载完整示例', 'load-demo-showcase', 'primary')}</section>
      <section class="card" style="padding:26px">
        <h2>从三条里选一条，不需要都做完</h2>
        <p style="margin-top:6px;font-size:12.5px">空着也能用：不填资料、不导入报告，同样可以记录。</p>
        <div class="grid three" style="margin-top:16px">
          <button class="task-entry" data-action="stage-pick"><span class="entry-icon">◔</span><b>先选一个当前阶段</b><span>阶段由你选，工作台不按日期推断</span><span class="arrow">↗</span></button>
          <button class="task-entry" data-action="add-symptom"><span class="entry-icon">＋</span><b>记一条身体感受</b><span>强度 0–3，是体验不是评分</span><span class="arrow">↗</span></button>
          <button class="task-entry" data-action="add-question"><span class="entry-icon">？</span><b>留一个想问的问题</b><span>下次就诊不用重新想</span><span class="arrow">↗</span></button>
        </div>
      </section>
      <div class="help-box">工作台不判断病情，也不给处置建议；它把散落的信息整理成可以核对、可以带走的样子。所有数据只存在你选择的资料目录里。</div>`
  }

  return `${head('今天，先照顾眼前的一件事。', SUBTITLES.dashboard, btn(`当前阶段：${stage?.label ?? '未选择'}`, 'stage-pick', 'soft'))}
  ${demoBanner()}
  ${docs.pendingCandidates ? `<div class="banner rose"><span><b>${docs.pendingCandidates} 项整理结果待核对</b>：核对只表示"转录检查过"，不等于医学审核。</span>${go('去核对', 'records', '整理草稿 / 核对', 'soft')}</div>` : ''}
  ${armStrip}
  ${marrowStrip}
  <div class="grid three" style="margin-bottom:16px">
    <button class="task-entry" data-action="stage-help"><span class="entry-icon">◔</span><b>${esc(stage?.label ?? '还没选阶段')}，现在该注意什么</b><span>按阶段列出可记录、可询问的事</span><span class="arrow">↗</span></button>
    <button class="task-entry" data-action="add-symptom"><span class="entry-icon">＋</span><b>今天手臂有点沉</b><span>记症状，或量一次四点位</span><span class="arrow">↗</span></button>
    <button class="task-entry" data-action="go" data-page="records" data-sub="资料库"><span class="entry-icon">▤</span><b>资料很多，帮我理清楚</b><span>${esc(docsText)}</span><span class="arrow">↗</span></button>
  </div>
  <div class="dashboard-grid">
    <div>
      ${section('最近的变化', '同一份记录，同时出现在一图秀、指标卡和就诊准备里。', go('打开一图秀 ↗', 'timeline', '', 'text-button'))}
      ${recent.length ? `<div class="grid two">${recent.slice(0, 4).map((r) => `
        <section class="card">
          <div class="card-head"><div><h3>${esc(r.name)}</h3><p>${longDate(r.date)} · ${esc(r.source)}</p></div>${pill(r.categoryLabel, 'grey')}</div>
          <div style="font-size:23px;font-weight:600;letter-spacing:-.5px">${fmtNum(r.value, r.dec)}<small style="font-size:11px;font-weight:500;color:var(--muted);margin-left:4px">${esc(unitText(r.unit))}</small></div>
          <p class="small-note">${r.delta === null ? '首次记录' : `较前次 ${r.delta > 0 ? '+' : ''}${fmtNum(r.delta, r.dec)} ${esc(unitText(r.unit))}`} · 只是两次记录相减</p>
        </section>`).join('')}</div>`
    : empty('还没有指标记录', '导入一份检验单，或手工补录一个值。', btn('＋ 手工补录', 'add-observation', 'primary'))}
      ${symptoms.length ? `<section class="card" style="margin-top:14px"><div class="card-head"><h3>最近记录的身体感受</h3>${go('全部 →', 'care', '不适记录', 'text-button')}</div>
        <div class="row"><div><b>${esc(symptoms[0].label)} · 强度 ${symptoms[0].level}/3</b><p>${longDate(symptoms[0].occurredOn)} · ${esc(symptoms[0].note ?? '没有补充描述')} · 本人自述</p></div>${pill('自评强度', 'grey')}</div>
        <p class="small-note">强度是体验，不是检验值；工作台不做因果归因。</p></section>` : ''}
    </div>
    <div>
      ${section('接下来的安排', `${o.tasks?.open ?? 0} 项待办`, btn('＋ 添加', 'add-task', 'text-button'))}
      <section class="card">${tasks.length ? tasks.map((t) => `<div class="row"><div class="row-main">
        ${btn('✓', 'task-toggle', 'icon-button', `data-id="${t.id}" aria-label="完成：${esc(t.title)}"`)}
        <div><small>${longDate(t.dueOn)} · ${esc(t.kindLabel)}</small><b>${esc(t.title)}</b>${t.detail ? `<p>${esc(t.detail)}</p>` : ''}</div></div></div>`).join('') : '<p class="small-note" style="margin:0">还没有安排。完成一项安排不会生成治疗记录。</p>'}
      </section>
      ${section('就诊前，想问的事', '', btn('编辑', 'add-question', 'text-button'))}
      <section class="card accent">${questions.length ? questions.map((q) => `<div class="row"><div><b>${esc(q.text)}</b><p>${q.kind === 'view' ? '我的看法 · 不是医生结论' : '本人保留的问题'}</p></div>${q.kind === 'view' ? pill('看法', 'grey') : ''}</div>`).join('') : '<p class="small-note" style="margin:0">还没有问题。留一句就够，导出时只带选入的。</p>'}
        <div class="small-note">问题会保留到「收藏与回顾」，下次不用重新整理。</div></section>
    </div>
  </div>`
}

/* ================= 病情整理 ================= */

function documentsTable() {
  const docs = d().documents?.list ?? []
  const query = S.query.trim()
  const filtered = query ? docs.filter((x) => x.filename.includes(query)) : docs
  if (!filtered.length) {
    return query ? empty('没有找到这份材料', '试试「化验」「病理」或清空搜索。') : empty('还没有材料', '导入一份检验单、出院小结或病理报告；也可以先载入一套演示画像看看。', btn('载入演示画像', 'switch-profile', 'soft'))
  }
  return `<div class="table-wrap"><table><thead><tr><th>材料名称</th><th>报告日期</th><th>类型</th><th>整理状态</th><th>待核对</th><th>操作</th></tr></thead><tbody>
    ${filtered.map((doc) => {
      const state = doc.status === 'parse_failed'
        ? pill('解析失败', 'yellow')
        : doc.status === 'parsed'
          ? (doc.pendingCandidates ? pill('待核对', 'yellow') : pill('已核对', 'green'))
          : pill(doc.status === 'stored' ? '未解析' : '已归档', 'grey')
      const busy = S.busy[`parse:${doc.id}`]
      const canParse = doc.status === 'stored' || doc.status === 'parse_failed'
      return `<tr>
        <td><b>${esc(doc.filename)}</b><br><small>${(doc.bytes / 1024).toFixed(0)} KB${doc.pageCount ? ` · ${doc.pageCount} 页` : ''} · 导入于 ${relTime(doc.importedAt)}</small><br><span class="hash">${esc(doc.sha256.slice(0, 16))}…</span></td>
        <td>${doc.reportDate ? longDate(doc.reportDate) : '<span class="muted">未写</span>'}</td>
        <td>${esc(kindLabel(doc.kind))}</td>
        <td class="status-cell">${state}${doc.lastJob?.error_text ? `<div class="small-note" style="max-width:220px">${esc(doc.lastJob.error_code)}：${esc(doc.lastJob.error_text)}</div>` : ''}</td>
        <td>${doc.pendingCandidates ? `<b>${doc.pendingCandidates}</b> 项` : '—'}</td>
        <td class="cand-actions">
          ${busy ? `<span class="small-note"><span class="spin"></span>解析中</span>` : canParse ? btn('解析', 'parse-doc', 'source-link', `data-id="${doc.id}"`) : ''}
          ${doc.pendingCandidates ? go('看草稿', 'records', '整理草稿 / 核对', 'source-link') : ''}
          ${btn('原文', 'doc-text', 'source-link', `data-id="${doc.id}"`)}
        </td>
      </tr>`
    }).join('')}
  </tbody></table></div>`
}

export function kindLabel(kind) {
  return {
    pathology: '病理', imaging: '影像', lab: '检验', discharge: '住院小结',
    prescription: '处方', rehab_advice: '康复指导', other: '其他',
  }[kind] ?? kind
}

function recordsLibrary() {
  const docs = d().documents
  const consent = Boolean(S.state?.settings?.mineruConsent)
  return `<div class="toolbar">
    <input id="doc-search" aria-label="搜索材料名称" placeholder="搜索材料名称" value="${esc(S.query)}">
    <div class="actions">${pill(`共 ${docs?.counts?.total ?? 0} 份`, 'pink')}${pill('本机存储', 'green')}</div>
  </div>
  <section class="card" style="margin-bottom:14px">
    <div class="card-head"><div><h3>导入一份材料</h3><p>原件按 SHA-256 去重，重复导入不会重置已解析状态。</p></div>${pill('不走网络（除非解析）', 'grey')}</div>
    <div class="import-box">
      <label><span class="form-label">选择文件（PDF / 图片 / TXT / MD）</span><input id="doc-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.docx"></label>
      <label><span class="form-label">资料类型</span>
        <select id="doc-kind">${[['lab', '检验'], ['pathology', '病理'], ['imaging', '影像'], ['discharge', '住院小结'], ['prescription', '处方'], ['rehab_advice', '康复指导'], ['other', '其他']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      </label>
      <label><span class="form-label">报告 / 采样日期（选填）</span><input id="doc-date" type="date" max="${today()}"></label>
      <div class="actions">${btn('导入', 'import-doc', 'primary')}${btn('载入演示画像', 'switch-profile', 'soft')}</div>
    </div>
    <label class="checkbox-line" style="margin-top:12px"><input type="checkbox" id="doc-consent" ${consent ? 'checked' : ''} data-action="toggle-consent">
      <span>允许把<b>需要解析的扫描件、图片、PDF、Office</b>上传到 MinerU 云端解析。只传文件本身，不传档案、看法与问题；TXT / MD / CSV 始终在本机抽取。</span></label>
    <p class="drop-hint">单份上限 40 MB。解析失败时原件仍保留，可重试或手工补录（不会产生半份草稿）。</p>
  </section>
  <div class="card" id="docs-table">${documentsTable()}</div>
  <div class="help-box">原件的相对路径记在库里，文件本身存在你选的资料目录的 <code>documents/</code> 下。删除目录就是删除资料，工作台不另外藏副本。</div>`
}

function draftPage() {
  const draft = d().draft
  if (!draft) return `<p class="small-note">正在读取…</p>`
  const docs = draft.documents.filter((x) => x.candidates.length || x.document.status !== 'parsed')
  if (!docs.length) {
    return `<div class="flow-steps"><span>原始材料</span>→<span class="on">整理草稿</span>→<span>按需核对</span>→<span>病程 / 就诊准备</span></div>
      ${empty('没有待核对的草稿', '导入并解析一份材料后，抽出来的字段会先放在这里，等你逐项确认。', go('去资料库', 'records', '资料库', 'primary'))}`
  }
  return `<div class="flow-steps"><span>原始材料</span>→<span class="on">整理草稿</span>→<span>按需核对</span>→<span>病程 / 就诊准备</span></div>
  <div class="notice pink">草稿里的每一项都要你确认后才会进档案。<b>核对 ≠ 医学审核</b>；日期不会拿导入时间顶替，缺日期时会明确要你填。</div>
  ${docs.map((entry) => draftDocumentCard(entry)).join('')}`
}

function draftDocumentCard(entry) {
  const doc = entry.document
  const pending = entry.candidates.filter((c) => ['pending', 'needs_review'].includes(c.candidate.status))
  const done = entry.candidates.filter((c) => !['pending', 'needs_review'].includes(c.candidate.status))
  const suggested = entry.candidates.map((c) => c.suggestedDate).filter(Boolean).sort().at(-1) ?? doc.report_date ?? ''
  const busy = S.busy[`accept-all:${doc.id}`]
  if (doc.status === 'parse_failed') {
    return `<section class="card" style="margin-bottom:14px">
      <div class="card-head"><div><h2>${esc(doc.filename)}</h2><p>解析失败，原件仍保留</p></div>${pill('解析失败', 'yellow')}</div>
      <p class="small-note">失败原因：${esc(entry.jobs?.[0]?.error_text ?? '未记录')}。重试成功后才会产生候选，失败不会留下半份草稿。</p>
      <div class="form-actions">${btn('重试解析', 'parse-doc', 'primary', `data-id="${doc.id}"`)}${btn('查看原文', 'doc-text', 'soft', `data-id="${doc.id}"`)}</div>
    </section>`
  }
  return `<section class="card" style="margin-bottom:14px">
    <div class="card-head"><div><h2>${esc(doc.filename)}</h2><p>${doc.reportDate ? `报告日期 ${longDate(doc.reportDate)}` : '报告上没有读到日期'} · 候选 ${entry.candidates.length} 项${pending.length ? ` · ${pending.length} 项待处理` : ' · 已处理完'}</p></div>
      ${btn('查看原文', 'doc-text', 'soft', `data-id="${doc.id}"`)}</div>
    ${pending.length ? `<div class="bulk">
      <label><span class="form-label">整份收下时用的日期</span><input type="date" data-draft-date="${doc.id}" value="${esc(suggested)}" max="${today()}"></label>
      ${btn(busy ? '处理中…' : '没有问题的一起收下', 'accept-all', 'primary', `data-id="${doc.id}" ${busy ? 'disabled' : ''}`)}
      <span class="small-note" style="margin:0;max-width:32ch">有缺单位、非数字、同字段多值、指标不在字典的条目<b>不会</b>被静默跳过，会留在下面等你逐条处理。</span>
    </div>` : ''}
    <div class="table-wrap">
      <table class="cand-table"><thead><tr><th>项目</th><th>材料中的内容</th><th>发生日期</th><th>来源</th><th>状态</th><th>操作</th></tr></thead><tbody>
        ${entry.candidates.map((item) => candidateRow(item, doc)).join('')}
      </tbody></table>
      ${done.length ? `<p class="small-note">已处理 ${done.length} 项：${done.map((c) => `${esc(fieldLabel(c.candidate.field))}（${statusLabel(c.candidate.status)}）`).join('、')}</p>` : ''}
    </div>
  </section>`
}

function fieldLabel(field) {
  const [ns, key] = String(field).split(':')
  if (ns === 'metric') return metricName(key)
  if (ns === 'treatment') return `治疗事件：${key}`
  return field
}

function metricName(code) {
  const hit = (d().metrics?.series ?? []).find((s) => s.code === code)
  return hit?.name ?? code
}

function statusLabel(status) {
  return { pending: '未核对', accepted: '已接受', edited: '修改后接受', rejected: '已拒绝', needs_review: '需要确认' }[status] ?? status
}

function candidateRow(item) {
  const c = item.candidate
  const settled = !['pending', 'needs_review'].includes(c.status)
  const value = `${c.value_text ?? ''}${c.unit ? ` ${c.unit}` : ''}`
  const dateValue = S.draftDates[c.id] ?? item.suggestedDate ?? ''
  return `<tr class="${settled ? 'done' : ''}">
    <td><b>${esc(fieldLabel(c.field))}</b>${item.issues.map((i) => `<div class="issue">${esc(i.text)}</div>`).join('')}</td>
    <td class="val">${esc(value)}${c.method ? `<div class="small-note" style="margin:0">方法：${esc(c.method)}</div>` : ''}</td>
    <td>${settled ? `<span class="muted">${longDate(c.occurred_on ?? item.suggestedDate)}</span>` : `<div class="date-cell"><input type="date" data-cand-date="${c.id}" value="${esc(dateValue)}" max="${today()}" aria-label="发生日期"></div>`}</td>
    <td>${esc(c.page_ref ?? '原文')}</td>
    <td>${pill(statusLabel(c.status), settled ? (c.status === 'rejected' ? 'grey' : 'green') : 'yellow')}</td>
    <td><div class="cand-actions">
      ${settled ? '<span class="small-note" style="margin:0">已处理</span>' : `
        ${btn('接受', 'cand-accept', 'ok', `data-id="${c.id}"`)}
        ${btn('改后接受', 'cand-edit', 'source-link', `data-id="${c.id}"`)}
        ${btn('需要确认', 'cand-review', 'source-link', `data-id="${c.id}"`)}
        ${btn('拒绝', 'cand-reject', 'bad', `data-id="${c.id}"`)}`}
    </div></td>
  </tr>`
}

function recordsProfile() {
  const clinical = d().clinical
  const dx = clinical?.diagnoses ?? []
  const hasArm = (d().arm?.count ?? 0) > 0
  const hasQuestions = (d().questions?.list ?? []).length > 0
  const hasDocs = (d().documents?.counts?.total ?? 0) > 0
  return `<div class="notice pink">不同标本、时间与来源的结果分别保留。不能用一份最新报告覆盖全部历史；<b>未检测不等于阴性</b>。</div>
  <div class="grid two">
    <section class="card"><div class="card-head"><h2>病理资料</h2>${dx.length ? pill('转录 · 非判定', 'green') : pill('未录入', 'grey')}</div>
      ${dx.length ? dx.map((x) => `<dl class="kv">
        <dt>取样日期</dt><dd>${longDate(x.notedOn)}</dd>
        <dt>部位</dt><dd>${esc(x.specimenSite ?? '未写')}</dd>
        <dt>组织学 / 分级</dt><dd>${esc(x.histology ?? '未写')}${x.grade ? ` · ${esc(x.grade)}` : ''}</dd>
        <dt>分期原文</dt><dd>${esc(x.stageText ?? '未写')}</dd>
        <dt>ER / PR</dt><dd>${statusWord(x.er)} / ${statusWord(x.pr)}</dd>
        <dt>HER2</dt><dd>${statusWord(x.her2)}</dd>
        <dt>Ki-67</dt><dd>${x.ki67 === null || x.ki67 === undefined ? '未写' : `${x.ki67}%`}</dd>
      </dl>`).join('') : `<p class="small-note" style="margin:0">还没有病理转录。这一版只把「检验指标」与「治疗事件」接进了入库映射，病理/分子字段的转录入口还没做——这里不假装有结论，也不推断分型。</p>`}
    </section>
    <section class="card"><h2>这份档案还缺什么</h2><p style="font-size:11.5px;margin-top:4px">缺项只表示"没录入"，不代表需要补做检查。</p>
      ${missingRow('病理转录', dx.length > 0, '未录入：可从病理报告逐项抄写（入口待做）')}
      ${missingRow('治疗事件', (clinical?.treatments?.length ?? 0) > 0, '未录入：可在治疗历程查看已接受的记录')}
      ${missingRow('上肢四点位', hasArm, '未记录：记录一次就能看到患健侧差值')}
      ${missingRow('就诊问题', hasQuestions, '还没有问题：想到什么就写一句')}
      ${missingRow('资料原件', hasDocs, '还没有导入材料')}
      <div class="divider"></div>
      <div class="actions">${go('继续整理材料 →', 'records', '资料库', 'text-button')}${go('看指标 →', 'records', '指标检测', 'text-button')}</div>
    </section>
  </div>`
}

function missingRow(label, ok, note) {
  return `<div class="row"><div><b>${esc(label)}</b><p>${ok ? '已有记录' : esc(note)}</p></div>${pill(ok ? '已有' : '缺', ok ? 'green' : 'grey')}</div>`
}

function statusWord(v) {
  return {
    positive: '阳性', negative: '阴性', equivocal: '不确定', not_tested: '未检测', unknown: '未知',
  }[v] ?? '未写'
}

/**
 * 指标卡按类别分组（用户 2026-10-20 定则：一张平铺的网格读不出"这是血象还是标志物"）。
 * 顺序跟 `categoryOrder` 走，与一图秀左侧的指标列表同一套次序，避免两处各排各的。
 */
function metricGroupsHTML(cards) {
  const ver = d().metrics?.ctcae?.version ?? ''
  const groups = new Map()
  for (const card of cards) {
    if (!groups.has(card.categoryLabel)) groups.set(card.categoryLabel, [])
    groups.get(card.categoryLabel).push(card)
  }
  const order = [...groups.keys()].sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b))
  return order.map((cat) => {
    const list = groups.get(cat)
    const graded = list.filter((c) => c.ctcae?.grade).length
    return `<div class="metric-group"><div class="metric-group-head"><h3>${esc(cat)}</h3>
        <span>${list.length} 项${graded ? ` · ${graded} 项有 CTCAE 对照` : ''}</span></div>
      <div class="metric-grid">${list.map((card) => metricCard(card, S.flipped.has(card.code), ver)).join('')}</div></div>`
  }).join('')
}

/**
 * CTCAE 对照说明：说明"分级从哪来、覆盖哪几项、不是什么"。
 * 指标分析页带头引用，方便对照标准原文（PDF 随仓库分发，也在设置页可开）。
 */
function ctcaeReference() {
  const meta = d().metrics?.ctcae
  if (!meta) return ''
  const covered = (d().metrics?.cards ?? []).filter((c) => c.ctcae?.grade)
  return `<div class="notice plain ctcae-ref">
    <div><b>分级对照用的是 CTCAE v${esc(meta.version)}</b>（${esc(meta.publisher)}，${esc(meta.published)} 出版）——
      国际通用的不良事件术语标准，把化验值放进客观区间。<b>对照不是诊断</b>，也不是疗效判断；是否处理由治疗团队决定。</div>
    <div class="ctcae-ref-cols">
      <div><span class="marrow-key">这一版能对照的项</span>
        <p>白细胞、中性粒细胞绝对值、血红蛋白、血小板——这四项在标准里有<b>绝对数值界限</b>，可以直接用。
        ALT/AST/肌酐一类"×正常上限"的条目需要化验单上的参考范围上限，本地没有就不启用，也不近似。</p></div>
      <div><span class="marrow-key">怎么看这个级</span>
        <p>卡上的徽章写"对照 CTCAE v${esc(meta.version)} · N 级"，翻到背面看这一级对应的数值区间。
        用了成人通用正常下限的地方会标"按通用下限近似"——以你化验单上的参考范围为准。</p></div>
    </div>
    ${covered.length ? `<p class="small-note" style="margin-top:6px">当前档案里有 ${covered.length} 项落在对照区间内：${esc(covered.map((c) => `${c.name}（${c.ctcae.grade} 级）`).join('、'))}。</p>` : '<p class="small-note" style="margin-top:6px">当前档案里还没有指标落到对照区间内。</p>'}
    <div class="actions" style="margin-top:8px"><a class="source-link" href="${esc(apiBase())}/api/reference/ctcae" target="_blank" rel="noreferrer">标准原文 PDF ↗</a><a class="source-link" href="${esc(meta.sourceUrl)}" target="_blank" rel="noreferrer">NCI 发布页 ↗</a></div>
  </div>`
}

function recordsMetrics() {
  const cards = d().metrics?.cards ?? []
  return `<div class="notice">趋势只呈现记录，不代表疗效、复发或诊断判断；不同单位与方法需分开核对。方法变化时线会断开，不拼接。</div>
  ${ctcaeReference()}
  <div class="form-actions" style="margin:-4px 0 10px">${btn('＋ 手工补录一个值', 'add-observation', 'primary')}${btn('去一图秀看趋势', 'go', 'soft', 'data-page="timeline"')}</div>
  ${metricGroupsHTML(cards)}
  <div class="help-box">点一张卡，原地翻转看最近几次；卡片位置和尺寸不变。没有记录的指标也会列出，避免"没显示 = 正常"的误读。</div>`
}

function recordsSummary() {
  const o = d().overview
  const docs = o?.documents
  const arm = o?.arm
  const questions = d().questions?.list ?? []
  return `<div class="grid two">
    <section class="card"><div class="card-head"><h2>就诊摘要预览</h2>${pill('由你的记录生成', 'pink')}</div>
      <p>范围：全部已记录内容 · 只预览资料组织与分享选择。</p>
      <div class="row"><div><b>病情与治疗材料</b><p>${docs?.total ?? 0} 份材料，其中 ${docs?.parsed ?? 0} 份已解析；${docs?.pendingCandidates ?? 0} 项待核对。</p></div></div>
      <div class="row"><div><b>最近变化</b><p>${arm?.latest ? `臂围差 ${fmtNum(arm.latest.maxDiff, 1)} cm（${longDate(arm.latest.measuredOn)}）；` : '还没有上肢测量；'}${(o?.recent ?? [])[0] ? `${esc(o.recent[0].name)} ${fmtNum(o.recent[0].value, o.recent[0].dec)} ${esc(unitText(o.recent[0].unit))}（${longDate(o.recent[0].date)}）。` : ''}</p></div></div>
      <div class="row"><div><b>准备讨论的问题</b><p>${questions.length} 个，可编辑与选择。</p></div></div>
      <div class="notice pink">心理、性健康与生育相关记录默认不进入这份摘要，也不进导出。</div>
      ${go('去就诊准备并导出', 'care', '就诊准备', 'primary')}</section>
    <section class="card"><h2>分享之前，再看一眼</h2>
      <p>未核对内容与来源状态在所有格式里都保留。导出只包含主动选入的问题与指标。</p>
      <div class="notice plain" style="margin-top:14px">一期只做 Markdown 导出；PDF/JPEG/HTML/DOCX 需要逐格式验收，未实现。</div>
      <details><summary>导出会包含什么</summary><p>资料范围、来源、已核对与草稿区分、选入的问题与看法；不含心理与私密记录。</p></details>
      <div class="divider"></div>
      <div class="actions">${go('打开就诊准备 →', 'care', '就诊准备', 'soft')}${btn('看导出记录', 'go', 'text-button', 'data-page="review" data-sub="报告与任务"')}</div>
    </section></div>`
}

export function recordsPage() {
  const sub = subOf('records')
  let body = ''
  if (sub === '资料库') body = recordsLibrary()
  else if (sub === '整理草稿 / 核对') body = draftPage()
  else if (sub === '病情档案') body = recordsProfile()
  else if (sub === '指标检测') body = recordsMetrics()
  else body = recordsSummary()
  return head('病情整理', SUBTITLES.records, btn('准备问题清单', 'add-question', 'primary')) + subnav() + body
}

/* ================= 一图秀 ================= */

function rail() {
  const series = d().metrics?.series ?? []
  const groups = new Map()
  for (const s of series) {
    if (!groups.has(s.categoryLabel)) groups.set(s.categoryLabel, [])
    groups.get(s.categoryLabel).push(s)
  }
  const order = [...groups.keys()].sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b))
  return `<aside class="rail" aria-label="一图秀筛选项">
    <section><h3>时间范围</h3><div class="chips">
      ${[['3m', '近 3 月'], ['6m', '近 6 月'], ['12m', '近 12 月'], ['all', '全部']].map(([k, l]) => `<button class="chip" data-range="${k}" aria-pressed="${S.range === k}">${l}</button>`).join('')}
    </div></section>
    <section><details class="pick" open>
      <summary><span>选择指标</span><small>最多 4 个 · 已选 ${S.sel.length}</small></summary>
      <div class="metric-list">${order.map((cat) => `<div class="cat-label">${esc(cat)}</div>${groups.get(cat).map((s) => `<label class="metric-pick"><input type="checkbox" data-metric="${s.code}" ${S.sel.includes(s.code) ? 'checked' : ''}><i style="background:${s.color}"></i><span>${esc(s.name)}</span><small>${s.latest ? fmtNum(s.latest.value, s.dec) : '—'}</small></label>`).join('')}`).join('')}</div>
      <p class="small-note" style="margin-top:6px">共 ${series.length} 项，可滚动 · 点选后图表立即更新</p>
    </details></section>
    <section><h3>显示内容</h3><div class="chips">
      ${[['treatment', '治疗节点'], ['keypoints', '关键点数值'], ['changes', '变化 ≥20%']].map(([k, l]) => `<button class="chip" data-toggle="${k}" aria-pressed="${S.toggles[k]}">${l}</button>`).join('')}
    </div>
    <label class="form-label" style="margin-top:14px">缩放</label>
    <div class="zoom"><input type="range" id="zoom" min="40" max="100" step="5" value="${S.zoom}" aria-label="时间窗缩放"><span id="zoom-val">${S.zoom}%</span></div>
    </section>
  </aside>`
}

export function pinHTML() {
  if (!S.pin) return `<p class="small-note">点击曲线上的记录点，可查看数值、日期与来源；悬停可快速预览。</p>`
  const series = (d().metrics?.series ?? []).find((s) => s.code === S.pin.code)
  const point = series?.points?.find((p) => p.date === S.pin.date)
  if (!point) return `<p class="small-note">这个记录点已不在当前时间窗内。</p>`
  return `<div class="pin"><div><b>${esc(series.name)} ${fmtNum(point.value, series.dec)} ${esc(unitText(series.unit))}</b>
    <p>${longDate(point.date)} · 来源：${esc(point.source)}${point.method ? ` · 方法：${esc(point.method)}` : ''} · ${esc(series.note ?? '')}</p>
    <p class="small-note">这是已记录的值；趋势只用于回顾，不构成诊断或疗效判断。</p></div>
    <div class="actions">${btn('查看来源', 'pin-source', 'source-link')}${btn('收起', 'unpin', 'text-link text-button')}</div></div>`
}

function selectedSeries() {
  const all = d().metrics?.series ?? []
  return S.sel.map((code) => all.find((s) => s.code === code)).filter(Boolean)
}

export function chartPanel() {
  const series = selectedSeries()
  const treatments = d().clinical?.treatments ?? []
  const fallback = d().overview?.newestRecordAt?.slice(0, 10) ?? null
  /* 空态分三种说清楚，避免"图没出来"被当成界面坏了：
   * ① 一条指标都没选；② 选了但整个工作区一次记录都没有（截图真机反馈）；
   * ③ 有记录但不在当前时间窗（timelineChart 自己的提示）。 */
  const demoActions = `${btn('加载完整示例', 'load-demo-showcase', 'primary')}${go('去指标检测补录 →', 'records', '指标检测', 'soft')}`
  let chartBody
  if (!series.length) {
    chartBody = empty('还没有选择指标', '在左侧勾选最多 4 个指标；还没有记录时，也可以先加载一套模拟数据看图表长什么样。', demoActions)
  } else if (!series.some((s) => (s.points ?? []).length)) {
    const names = series.map((s) => s.name).join('、')
    chartBody = empty('所选指标还没有任何一次记录', `「${names.slice(0, 40)}${names.length > 40 ? '…' : ''}」在这个工作区里还没有记录，所以画不出曲线——这是没有数据，不是界面故障。导入检验单、手工补录，或先看模拟数据的效果。`, demoActions)
  } else {
    chartBody = timelineChart({ series, treatments, range: S.range, zoom: S.zoom, toggles: S.toggles, pin: S.pin, fallbackEnd: fallback })
  }
  return `<section class="chart-panel" id="chart-panel">
    <div class="chart-top"><div><h2>病程时间轴</h2>
      <p class="small-note" style="margin-top:2px">只呈现已记录的值 · 不同指标各自缩放，不能横向比大小</p></div>
      <div class="actions">${pill(`${S.sel.length} 个指标`, 'pink')}${pill('按方法断线', 'green')}</div></div>
    ${legendHTML(series)}
    ${chartBody}
    <div id="pin-slot">${pinHTML()}</div>
  </section>`
}

export function timelinePage() {
  const cards = (d().metrics?.cards ?? []).filter((c) => c.hasData)
  const graded = cards.filter((c) => c.ctcae?.grade)
  const cardNote = graded.length
    ? `按类别分组 · ${graded.length} 项带 CTCAE v${d().metrics?.ctcae?.version ?? ''} 分级对照（对照不是诊断）`
    : '按类别分组 · 点一张卡，原地翻转看最近几次'
  return head('病情一图秀', SUBTITLES.timeline, btn('准备讨论的问题', 'add-question', 'primary')) +
  `<div class="overview">${rail()}<div class="timeline-main">${chartPanel()}
     <section class="card"><div class="card-head"><div><h3>症状轨道</h3><p>与曲线同处一段时间，但不与数值混在一起。</p></div>${pill('0–3 自评', 'grey')}</div>${symptomTrack(d().symptoms?.list ?? [])}</section>
   </div></div>
   ${section('指标卡片', esc(cardNote), go('去指标检测 ↗', 'records', '指标检测', 'text-button'))}
   ${cards.length ? metricGroupsHTML(cards) : empty('还没有任何指标记录', '导入一份检验单或手工补录一个值，卡片会按类别出现在这里。')}
   ${section('治疗时间线', '计划与实际分开；这里只列已经记录的行程。')}
   <section class="card">
     ${(d().clinical?.treatments ?? []).length ? (d().clinical.treatments).map((t) => `<div class="row"><div><b>${esc(t.kindLabel)}：${esc(t.name)}</b><p>${longDate(t.start)}${t.end && t.end !== t.start ? ` — ${longDate(t.end)}` : ''} · ${t.isActual ? '实际接受' : '计划'}${t.axillaryProcedure ? ` · 腋窝处理：${esc(t.axillaryProcedure)}` : ''}${t.radiationField ? ` · 放疗野：${esc(t.radiationField)}` : ''}</p></div>${pill(t.statusLabel, t.status === 'ongoing' ? 'green' : 'grey')}</div>`).join('') : '<p class="small-note" style="margin:0">还没有治疗记录。导入治疗文书并核对后，或手工补录后，会出现在这里。</p>'}
     <p class="small-note">治疗色带只做背景参照，不表示因果；关闭「治疗节点」后色带消失，数据点位置不变。</p>
   </section>`
}

export { armChart, sparkline }
