/** 页面渲染：全程与康复 / 临床 / 营养 / 心理 / 收藏与回顾 / 设置内容。 */
import { S, SYMPTOM_CODES, ARM_STAGES } from './state.js'
import {
  esc, fmtNum, unitText, longDate, shortDate, today, btn, go, pill, section, head, empty,
  armChart, sparkline,
} from './ui.js'
import { subnav, SUBPAGES, SUBTITLES, kindLabel } from './pages-basic.js'

const d = () => S.data
function statusWord(v) {
  return { positive: '阳性', negative: '阴性', equivocal: '不确定', not_tested: '未检测', unknown: '未知' }[v] ?? '未写'
}
const subOf = (page) => S.sub[page] || SUBPAGES[page]?.[0] || ''

/* ================= 全程与康复 ================= */

function tasksBlock(all = true) {
  const tasks = d().tasks?.list ?? []
  const list = all ? tasks : tasks.filter((t) => t.status === 'open')
  if (!list.length) return `<p class="small-note" style="margin:0">还没有安排。</p>`
  return list.map((t) => `<div class="row ${t.status === 'done' ? 'completed' : ''}"><div class="row-main">
    ${btn(t.status === 'done' ? '✓' : '', 'task-toggle', `icon-button${t.status === 'done' ? ' done' : ''}`, `data-id="${t.id}" aria-label="${t.status === 'done' ? '重开' : '完成'}：${esc(t.title)}"`)}
    <div><small>${longDate(t.dueOn)} · ${esc(t.kindLabel)}${t.status === 'done' ? ' · 已完成' : ''}</small><b>${esc(t.title)}</b>${t.detail ? `<p>${esc(t.detail)}</p>` : ''}</div></div></div>`).join('')
}

function careArrangements() {
  return `<div class="card"><div class="card-head"><div><h2>近期的安排</h2><p>本人待办与医院安排分开；完成待办不会生成治疗记录。</p></div>${btn('＋ 新安排', 'add-task', 'primary')}</div>
    ${tasksBlock()}
    <p class="small-note">工作台不连医院系统，也不发通知；"医院安排"以短信/挂号平台为准。</p></div>`
}

const STAGE_TOPICS = {
  '术后 0–2 周': [
    ['伤口与引流', '记录引流量、颜色与伤口外观；按出院医嘱换药。出现发热、红肿渗液增多或异味时联系治疗团队。', '术后恢复'],
    ['患侧上肢的“不做”清单', '按出院医嘱限制患侧提重物与大幅度外展；具体范围由手术/康复团队给出，工作台不替代。', '术后恢复'],
    ['皮肤与患肢保护', '避免患肢抽血、输液、测血压（除非团队另有安排）；防晒、防蚊虫、防割伤。', '上肢与淋巴水肿'],
  ],
  '术后 2–6 周': [
    ['术后上肢：活动与肿胀', '按康复科给出的范围练习；记录前屈、外展角度和抬臂时的手臂感受，不追求进度。', '上肢与淋巴水肿'],
    ['伤口与瘢痕', '记录牵拉感、瘢痕周围紧绷；不自行处理增生或粘连。', '术后恢复'],
    ['体力恢复', '记录疲劳与睡眠，不设打卡目标；逐步恢复日常。', '术后恢复'],
  ],
  '术后 3 个月以上': [
    ['上肢围度', '四点位（腕横纹、前臂中段、肘上 10cm、腋下 10cm）健患侧成对测量，取最大差值。', '上肢与淋巴水肿'],
    ['症状与功能', '记录沉重、紧绷、肿胀与抬臂受限；症状常早于围度变化。', '上肢与淋巴水肿'],
    ['长期随访', '复查安排与资料归档；工作台不自动生成复查方案。', '近期安排'],
  ],
}

function careRecovery() {
  const drains = d().care?.drains ?? []
  const advice = (d().care?.entries ?? []).filter((e) => e.kind === 'rehab_advice')
  return `<div class="notice pink">阶段由你自己选择，工作台不根据日期推断。以下只整理“可记录的事”和“该问的事”，不给动作处方。</div>
  <div class="stage-row">${ARM_STAGES.map((s) => `<button class="stage-chip" data-stage="${s}" aria-pressed="${S.armStage === s}">${s}</button>`).join('')}</div>
  <div class="grid three">${(STAGE_TOPICS[S.armStage] ?? STAGE_TOPICS['术后 3 个月以上']).map(([t, desc, link]) => `<section class="topic-card"><h3>${t}</h3><p>${desc}</p><div class="actions">${go('记录 / 查看 →', 'care', link, 'text-button')}</div></section>`).join('')}</div>
  ${section('引流记录（术后带管期）', '同一天多次不合并；0 mL 表示当日拔管。', btn('＋ 记一次引流量', 'add-drain', 'primary'))}
  <section class="card">${drains.length ? `<div class="table-wrap"><table><thead><tr><th>日期</th><th>引流量</th><th>备注</th><th>状态</th></tr></thead><tbody>
    ${drains.map((x) => `<tr><td>${longDate(x.date)}</td><td>${x.value} mL</td><td>${esc(x.note ?? '—')}</td><td>${x.pulled ? '当日拔管' : '带管中'}</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="small-note" style="margin:0">还没有引流记录。术后带管期可以每天记一次；没有记录不等于 0。</p>'}
  <p class="small-note">引流量的“正常范围”由手术团队按术式说明；工作台不判断是否异常，也不给换药步骤。</p></section>
  ${section('已存的康复建议', '按来源与日期保留；不把产品文案当成医嘱。')}
  <section class="card">${advice.length ? advice.map((a) => `<div class="advice"><b>${esc(a.title)}</b><p>${esc(a.detail ?? '')}</p><small>来源：${esc(a.sourceLabel)} · ${longDate(a.sourceDate)}</small></div>`).join('') : `<div class="empty" style="margin-top:0"><h3>还没有从材料里保存的专业建议</h3><p>这一版只展示材料里已有的建议；没有就留空，不用产品自拟的内容顶替。</p></div>`}
  <div class="actions">${btn('记一条从门诊听到的建议', 'add-advice', 'text-button')}</div></section>`
}

function careArm() {
  const arm = d().arm
  if (!arm) return `<p class="small-note">正在读取…</p>`
  const latest = arm.latest
  const over = latest && latest.maxDiff >= 2
  const side = S.state?.subject?.laterality
  const sideText = side === 'left' ? '左' : side === 'right' ? '右' : side === 'bilateral' ? '双侧' : '未声明'
  return `<div class="arm-hero">
    <div><span class="eyebrow">患健侧臂围差 · 四点位最大值</span>
      ${latest ? `<div class="big">${fmtNum(latest.maxDiff, 1)}<small>cm</small></div>
        <div class="delta">${arm.previous ? `较上次（${longDate(arm.previous.measuredOn)}）<em>${arm.delta > 0 ? '+' : ''}${fmtNum(arm.delta, 1)} cm</em> · ` : ''}${arm.count} 次记录 · 患侧：${sideText}</div>
        <div class="range-bar"><i style="width:${Math.min(100, latest.maxDiff / 2.5 * 100)}%"></i></div>
        <div class="range-scale"><span style="left:0">0</span><span style="left:40%">1</span><span style="left:80%">2</span><span style="right:0">2.5 cm</span></div>
        <p class="small-note">${over ? '已到 2cm 参考关注线。是否需要处理由治疗团队判断；这里只提示“值得报告”。' : '虚线为 2cm 参考关注线（提示进一步评估的常用口径，具体待专业确认）。'}</p>`
        : `<div class="big">—<small>cm</small></div><p class="small-note">还没有记录。至少填一对患侧 / 健侧数值；缺健侧时只存患侧，不补 0。</p>`}
    </div>
    <div class="actions" style="flex-direction:column;align-items:stretch">
      ${btn('＋ 记录一次测量', 'add-arm', 'primary')}
      ${btn('记录症状', 'add-symptom', 'soft')}
      ${go('记一句我的看法 →', 'care', '就诊准备', 'text-button')}
      ${pill('同一测量协议 · 可比较', 'green')}
    </div>
  </div>
  <section class="card" style="margin-bottom:14px">
    <div class="card-head"><div><h3>臂围差趋势</h3><p>每次取四点位差值最大值 · 参考线 2cm（需专业确认）</p></div>${pill(sideText === '未声明' ? '患侧未声明' : '本机记录', sideText === '未声明' ? 'yellow' : 'grey')}</div>
    <div class="chart-wrap">${armChart(arm.series)}</div>
    <p class="small-note scroll-hint">图表可左右滑动，查看完整时间轴</p>
  </section>
  <div class="grid" style="margin-bottom:14px">
    <section class="card"><div class="card-head"><h3>测量记录</h3><span class="pill green">${esc(latest?.protocolLabel ?? '四点位')}</span></div>
      ${arm.sets.length ? `<div class="table-wrap"><table class="measure-table"><thead><tr><th>日期</th>${arm.pointOrder.map((p) => `<th>${esc(arm.pointLabels[p])}</th>`).join('')}<th>最大差<br><span style="font-weight:500">cm</span></th><th>测量者</th></tr></thead><tbody>
        ${arm.sets.map((s) => `<tr><td>${longDate(s.measuredOn)}</td>${arm.pointOrder.map((p) => {
          const hit = s.points.find((x) => x.point === p)
          return `<td class="num">${hit ? (hit.diff === null ? '<span class="muted" title="缺健侧值，不算差值">—</span>' : fmtNum(hit.diff, 1)) : '<span class="muted">未测</span>'}</td>`
        }).join('')}<td class="num"><b>${s.maxDiff === null ? '—' : fmtNum(s.maxDiff, 1)}</b></td><td>${esc(s.assessorLabel)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small-note">表内为患侧减健侧的差值（cm）。缺健侧值时是「—」，不是 0；四点位可以只测 1–4 个点。</p>`
        : '<p class="small-note" style="margin:0">还没有测量。记录一次后，这张表会按日期倒序列出。</p>'}
    </section>
    <section class="card"><div class="card-head"><h3>症状与功能</h3>${btn('＋ 记录', 'add-symptom', 'text-button')}</div>
      ${(d().symptoms?.list ?? []).filter((s) => ['arm_heaviness', 'tightness', 'swelling', 'le_symptom'].includes(s.code)).slice(0, 3).map((s) => `<div class="saved-item"><b>强度 ${s.level}/3 · ${esc(s.label)}</b><p>${esc(s.note ?? '没有补充描述')}</p><small>${longDate(s.occurredOn)} · 本人自述</small></div>`).join('') || '<p class="small-note" style="margin:0">还没有上肢相关症状记录。</p>'}
      <div class="divider"></div>
      <h3 style="font-size:12.5px">哪些情况先联系治疗团队</h3>
      <div class="flag-list"><div>手臂突然明显肿胀、发红发热或疼痛加重</div><div>抬臂明显受限，影响穿衣、梳头</div><div>皮肤有破损、感染或反复丹毒样发作</div></div>
      <p class="small-note">以上是沟通提示，不是急诊分诊规则；出现呼吸困难、胸痛等情况请按当地急救流程处理。</p>
    </section>
  </div>
  ${section('患肢保护与护理要点', '来自已存专业建议；工作台不生成新的护理处方。')}
  <section class="card"><div class="grid two">
    <div class="advice"><b>避免患肢抽血、输液、测血压</b><p>除非治疗团队另有安排；就诊时主动说明手术侧别。</p><small>来源：出院康复指导 · 待专业复核</small></div>
    <div class="advice"><b>皮肤护理：防晒、防蚊虫、防割伤</b><p>做家务戴手套；出现红肿热痛及时说明，不自行热敷或按摩。</p><small>来源：康复科门诊记录 · 待专业复核</small></div>
  </div>
  <p class="small-note">压力袖套的压力等级、佩戴时长、手法引流等，均需由淋巴水肿专科/康复治疗师个体化给出；工作台不提供这些参数。</p></section>`
}

function careSymptoms() {
  const list = d().symptoms?.list ?? []
  return `<div class="card"><div class="card-head"><div><h2>把变化记下来，方便描述</h2><p>强度是自评，不是评分；不用于判断病情。</p></div>${btn('＋ 记录不适', 'add-symptom', 'primary')}</div>
    ${list.length ? list.map((s) => `<div class="saved-item"><b>${esc(s.label)} · 强度 ${s.level}/3</b><p>${esc(s.note ?? '没有补充描述')}</p><small>${longDate(s.occurredOn)} · 本人自述 · 不是诊断</small></div>`).join('') : empty('这里还没有记录', '记录当时的感受、时间和想问的问题即可。')}
    <div class="help-box">内分泌治疗的关节痛/潮热、放疗区皮肤反应都可以记在这里；工作台不做因果归因，也不评价是否继续用药。</div></div>`
}

function viewpointsCard() {
  const list = d().viewpoints?.list ?? []
  return `<section class="card" style="margin-bottom:14px">
    <div class="card-head"><div><h3>我的看法与担心</h3><p>只作为一条信息保留，方便你说明；不进入趋势、不写进摘要的事实区，也不参与任何判断。</p></div>${pill('不是医生结论', 'grey')}</div>
    ${list.length ? list.map((v) => `<div class="saved-item"><p>${esc(v.text)}${v.isPrivate ? ` ${pill('私密 · 默认不导出', 'grey')}` : ''}</p><small>${longDate(v.recordedOn)} · ${esc(v.speakerLabel)}记录 · 这是一条看法，不是医生结论</small></div>`).join('') : '<div class="empty" style="margin-top:8px"><p>还没有记录。想到什么就写一句，不需要整理好。</p></div>'}
    <div class="form-actions" style="margin-top:12px">${btn('＋ 记一句我的看法', 'add-viewpoint', 'primary')}${btn('记一条照护者的感受', 'add-viewpoint-caregiver', 'text-button')}</div>
    <p class="small-note">诊断与处理由治疗团队判断。这里记的是你的感受与想法，导出时会单独标注。</p>
  </section>`
}

function questionsEditor(withSuggest = false) {
  const list = d().questions?.list ?? []
  return `${withSuggest ? `<div class="notice warn"><b>可以从最近记录生成一条问题</b><br>生成后可以改、可以删；工作台不替你判断是否需要处理。
    <div class="actions" style="margin-top:8px">${btn('＋ 从臂围趋势生成', 'gen-arm-question', 'soft')}${btn('＋ 从关节痛生成', 'gen-joint-question', 'soft')}</div></div>` : ''}
  <div class="notice pink">问题可以编辑、选择、删除。导出只包含勾选的问题，不含病历或私密记录。<br>标记为「我的看法」的只作为一条信息，导出时单独分区。</div>
  ${list.length ? list.map((q) => `<div class="q-item ${q.includeInExport ? 'sel' : ''}">
    <input type="checkbox" data-q-select="${q.id}" aria-label="选入问题：${esc(q.text)}" ${q.includeInExport ? 'checked' : ''} style="width:16px;height:16px;margin-top:4px;flex:0 0 16px">
    <div class="qbody">
      <textarea data-q-edit="${q.id}" aria-label="编辑就诊问题">${esc(q.text)}</textarea>
      <div class="tag-list" style="margin-top:6px">${q.kind === 'view' ? '<span class="pill grey">我的看法 · 不是医生结论</span>' : '<span class="pill grey">想问的事</span>'}${q.version > 1 ? `<span class="pill grey">第 ${q.version} 版</span>` : ''}<span class="pill grey">${esc({ open: '待问', asked: '已问过', answered: '已有答复', dropped: '已删除' }[q.status] ?? q.status)}</span></div>
    </div>
    ${btn('保存', 'save-question', 'source-link', `data-id="${q.id}"`)}
    ${btn('×', 'delete-question', 'icon-button', `data-id="${q.id}" aria-label="删除这个问题"`)}
  </div>`).join('') : empty('问题清单是空的', '想到什么就写一句，下次就诊不用重新想。')}
  <div class="form-actions">${btn('＋ 加一个问题', 'add-question', 'primary')}${btn('＋ 记一条看法', 'add-viewpoint', 'soft')}</div>`
}

function exportPanel() {
  const metrics = (d().metrics?.cards ?? []).filter((m) => m.hasData)
  const questions = d().questions?.list ?? []
  const views = d().viewpoints?.list ?? []
  return `<section class="card" style="margin-bottom:14px">
    <div class="card-head"><div><h3>导出就诊准备</h3><p>Markdown · 只含下面勾选的内容；导出后源数据有变化，会在「报告与任务」里标为可能已过时。</p></div>${pill('一期只做 Markdown', 'grey')}</div>
    <div class="grid two">
      <div><span class="form-label">选入的指标（最新值）</span>
        <div style="max-height:190px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px 10px">
          ${metrics.length ? metrics.map((m) => `<label class="checkbox-line" style="margin:3px 0"><input type="checkbox" data-export-metric="${m.code}" ${S.selMetrics.has(m.code) ? 'checked' : ''}><span>${esc(m.name)} <span class="muted">${fmtNum(m.latest.value, m.dec)} ${esc(unitText(m.unit))}</span></span></label>`).join('') : '<p class="small-note" style="margin:0">没有可导出的指标。</p>'}
        </div>
      </div>
      <div><span class="form-label">选入的问题与看法</span>
        <div style="max-height:190px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px 10px">
          ${questions.length || views.length ? `${questions.map((q) => `<label class="checkbox-line" style="margin:3px 0"><input type="checkbox" data-export-question="${q.id}" ${S.selQuestions.has(q.id) ? 'checked' : ''}><span>${esc(q.text.slice(0, 42))}${q.text.length > 42 ? '…' : ''}${q.kind === 'view' ? ' <span class="muted">（看法）</span>' : ''}</span></label>`).join('')}
            ${views.map((v) => `<label class="checkbox-line" style="margin:3px 0"><input type="checkbox" data-export-view="${v.id}" ${S.selViews?.has(v.id) ?? true ? 'checked' : ''}><span class="muted">${esc(v.text.slice(0, 40))}${v.text.length > 40 ? '…' : ''}</span></label>`).join('')}` : '<p class="small-note" style="margin:0">还没有问题或看法。</p>'}
        </div>
      </div>
    </div>
    <div class="form-actions">${btn('预览并下载 Markdown', 'export', 'primary')}${btn('检查隐私边界', 'privacy-check', 'text-button')}</div>
  </section>`
}

function careVisit() {
  return `${viewpointsCard()}
  <section class="card" style="margin-bottom:14px"><div class="card-head"><div><h3>下次就诊，想问的事</h3><p>问题带版本：改一次就是新一版，旧版仍可回溯。</p></div>${btn('＋ 新增', 'add-question', 'primary')}</div>
    ${questionsEditor(true)}</section>
  ${exportPanel()}`
}

function careLongTerm() {
  const topics = [
    ['身体形象与穿衣', '术后外观、义乳/内衣、照镜子时的感受；由你决定谈不谈。'],
    ['亲密关系与性健康', '阴道干涩、性欲变化、伴侣沟通；默认私密，不进摘要。'],
    ['生育与月经', '化疗后月经变化、生育力保存的转介问题；不按年龄推断。'],
    ['工作与体力', '返岗节奏、通勤、家务分工；记录困难而不是“完成度”。'],
    ['复发担忧', '允许表达；把担忧整理成问题，不拿标志物曲线安抚。'],
    ['睡眠', '入睡困难、夜间醒来；与潮热/关节痛分开记录。'],
  ]
  return `<div class="notice">这些是可选择的话题，不会要求每个人都经历或完成。</div>
  <div class="grid three">
    ${topics.map(([t, desc]) => `<section class="card"><h3>${esc(t)}</h3><p style="font-size:11.5px;margin-top:5px">${esc(desc)}</p>${btn('准备一个讨论问题 →', 'topic-question', 'text-button', `data-topic="${esc(t)}"`)}</section>`).join('')}
  </div>
  <div class="help-box">工作台不提供心理治疗、不评估危机状态；如出现自伤想法，请联系当地急救或专业机构。</div>`
}

export function carePage() {
  const sub = subOf('care')
  const map = {
    近期安排: careArrangements,
    术后恢复: careRecovery,
    上肢与淋巴水肿: careArm,
    不适记录: careSymptoms,
    就诊准备: careVisit,
    长期生活: careLongTerm,
  }
  const headAction = sub === '就诊准备'
    ? btn('导出 Markdown', 'export', 'primary') + btn('与 AI 讨论这份准备', 'discuss-agent', 'soft', 'data-scope="prep"')
    : btn('记录一点', 'add-symptom', 'soft')
  return head('全程与康复', SUBTITLES.care, headAction) + subnav() + map[sub]()
}

/* ================= 临床 ================= */

function clinicalTreatments() {
  const list = d().clinical?.treatments ?? []
  return `<div class="notice pink">计划与实际分别保存。完成待办不会自动生成实际治疗；未核对的材料只作草稿。</div>
  <section class="card">${list.length ? list.map((t) => `<div class="row"><div><b>${esc(t.kindLabel)}：${esc(t.name)}</b>
    <p>${longDate(t.start)}${t.end && t.end !== t.start ? ` — ${longDate(t.end)}` : ''} · ${t.isActual ? '实际接受' : '计划'}${t.axillaryProcedure ? ` · 腋窝处理：${esc(t.axillaryProcedure)}` : ''}${t.radiationField ? ` · 放疗野：${esc(t.radiationField)}` : ''}</p></div>${pill(t.statusLabel, t.status === 'ongoing' ? 'green' : 'grey')}</div>`).join('') : '<p class="small-note" style="margin:0">还没有治疗记录。可以手工补录一次已经发生的治疗，或导入治疗文书后在草稿里核对。</p>'}
  <div class="form-actions">${btn('＋ 补录一次治疗', 'add-treatment', 'primary')}</div>
  <p class="small-note">治疗记录关联原始文书；没有来源的条目会标记为“本人补录”。</p></section>`
}

function clinicalPathology() {
  const dx = d().clinical?.diagnoses ?? []
  return `<div class="card"><h2>按标本和时间保留每一份结果</h2>
    <p>病理、分子与遗传材料各有来源；没有检测、未录入和未检出分别表达。</p>
    ${dx.length ? dx.map((x) => `<div class="row"><div><b>${longDate(x.notedOn)} · ${esc(x.specimenSite ?? '标本部位未写')}</b><p>${esc(x.histology ?? '组织学未写')}${x.grade ? ` · ${esc(x.grade)}` : ''} · ER ${statusWord(x.er)} / PR ${statusWord(x.pr)} / HER2 ${statusWord(x.her2)}${x.ki67 !== null && x.ki67 !== undefined ? ` / Ki-67 ${x.ki67}%` : ''}</p></div><span class="pill green">转录</span></div>`).join('') : ''}
    <div class="empty"><h3>分子 / 遗传材料尚未载入</h3><p>此状态不表示结果阴性，也不提示必须检测。这一版的入库映射只覆盖检验与治疗字段。</p></div></div>`
}

/* 临床试验线索（35 号四段）：
   段1 建档：只列已确认入库的诊断字段；未核候选不参与。
   段2 检索：在随包快照里按关键词筛（不是全库扫描，卡头写口径）。
   段3 匹配：快照不含入排条件原文 → 每条一律「待确认」，不给百分数。
   段4 呈现/收藏：可把条目加进问题清单（零副作用）。 */
function trialKeyword() {
  try { return String(globalThis.__PINKY_TRIAL_KW__ || '') } catch { return '' }
}

function clinicalTrials() {
  const t = S.data?.clinical?.trials || { connected: false, note: '未接入' }
  if (!t.connected) {
    return `<div class="notice">${esc(t.note || '本机快照不可用')}</div>
    <section class="card"><div class="card-head"><h2>临床试验线索</h2>${pill('未接入', 'grey')}</div>
      <p class="small-note">随包快照缺失时如实说明，不用"没有研究"冒充"没查到"。</p></section>`
  }
  const kw = trialKeyword().trim().toLowerCase()
  const all = t.records || []
  const rows = kw ? all.filter((r) => [r.title, r.registryId, ...(r.interventions || [])].join(' ').toLowerCase().includes(kw)) : all
  const pool = t.candidatePool || {}
  const dx = d().clinical?.diagnoses || []
  return `<div class="notice">${esc(t.note || '')} 登记状态未核实；「查不到」不等于「没有研究」。</div>
  <section class="card"><div class="card-head"><h2>参与匹配的已确认字段</h2>${pill('建档', 'grey')}</div>
    <p class="small-note">只有已确认入库的诊断字段参与匹配；未核候选、未检测、报告未提供都不进池，也不会被当成阴性去填。</p>
    ${dx.length
      ? `<ul class="small-note" style="margin:6px 0 0 18px">${dx.slice(0, 8).map((x) => `<li>${esc(longDate(x.notedOn))} · ${esc(x.histology ?? '组织学未写')} · ER ${statusWord(x.er)} / PR ${statusWord(x.pr)} / HER2 ${statusWord(x.her2)}</li>`).join('')}</ul>`
      : '<p class="small-note">还没有已确认的诊断字段。先去「病理分子」把报告原文逐条核对确认。</p>'}
  </section>
  <section class="card"><div class="card-head"><h2>检索登记线索</h2>${pill(`快照 ${esc(t.snapshotDate || '日期未记')}`, 'grey')}</div>
    <p class="small-note">候选池口径：已载 ${pool.loaded ?? all.length} 条 · 本次返回 ${rows.length} 条（上限 ${pool.limit ?? 20}）· <b>不是全库扫描</b>。</p>
    <div class="path-row"><input id="trial-kw" placeholder="关键词：药名 / 登记号 / 干预" value="${esc(trialKeyword())}">${btn('检索', 'trial-search', 'primary')}</div>
    ${rows.length ? '' : '<div class="empty"><h3>这一组条件下没有命中</h3><p>查不到 ≠ 没有研究：清空关键词再看，或直接问医生。</p></div>'}
    ${rows.map((r) => `<div class="row"><div>
      <b>${esc(r.registryId)} · ${esc(r.title || '')}</b>
      <p class="small-note">${esc(r.status || '状态未记')} · ${(r.phase || []).join(', ') || '阶段未记'} · ${esc(r.sponsor || '申办方未记')} · 快照 ${esc(r.retrievedAt || '')}</p>
      <ul class="small-note" style="margin:4px 0 0 18px">
        <li>? <b>待确认</b> — 条件类别：入排条件（快照未含原文）</li>
        <li>记录里是：见上方已确认字段 · 条件要求：见登记原文</li>
      </ul>
      <p class="small-note">分层：<b>需补充信息</b>；符合度：<b>暂无可对照项（不编百分数）</b>。这不是入组资格，也不代表效果。</p>
      <div class="actions">${btn('收藏这条线索', 'add-trial-question', 'soft')}${r.sourceUrl ? `<a class="soft" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">打开登记原文 ↗</a>` : ''}</div>
    </div>${pill(esc(r.status || '未核实'), 'grey')}</div>`).join('')}
  </section>`
}

function clinicalCompare() {
  const docs = d().documents?.counts
  const dx = d().clinical?.diagnoses ?? []
  const treatments = d().clinical?.treatments ?? []
  const arm = d().arm
  return `<section class="card"><h2>先列出已知和未知，交给研究中心核实</h2>
    <div class="table-wrap"><table><thead><tr><th>资料项</th><th>目前记录</th><th>需要做的沟通</th></tr></thead><tbody>
      <tr><td>病理资料</td><td>${dx.length ? `已录入 ${dx.length} 份转录` : '未录入'}</td><td>核实标本与报告信息是否完整</td></tr>
      <tr><td>腋窝处理</td><td>${treatments.some((t) => t.axillaryProcedure) ? treatments.filter((t) => t.axillaryProcedure).map((t) => esc(t.axillaryProcedure)).join('、') : '未记录'}</td><td>向手术团队核对范围</td></tr>
      <tr><td>既往治疗</td><td>${treatments.length ? `${treatments.length} 条治疗记录` : '未记录'}</td><td>确认周期与结束日期</td></tr>
      <tr><td>上肢测量</td><td>${arm?.count ? `${arm.count} 次四点位` : '未记录'}</td><td>如需，带最近两次原始数值</td></tr>
      <tr><td>材料原件</td><td>${docs?.total ?? 0} 份（${docs?.parsed ?? 0} 份已解析）</td><td>以登记原文及中心答复为准</td></tr>
      <tr><td>研究条件</td><td>未接入真实数据</td><td>以登记原文及中心答复为准</td></tr>
    </tbody></table></div>
    <p class="small-note">资料对照不输出适合率、匹配排名或入组结论。</p>${btn('把缺的一项加进问题清单', 'add-trial-question', 'primary')}</section>`
}

function clinicalFollow() {
  return empty('一期没有关注真实研究的功能', '为了避免让人以为这里有真实试验线索，这一版不提供关注列表；示例条目只在「试验线索」里演示路径。', go('看示例条目', 'clinical', '试验线索', 'primary'))
}

function clinicalSources() {
  const docs = d().documents?.list ?? []
  return `<section class="card"><h2>数据来源与时效</h2>
    <div class="row"><div><b>临床试验数据</b><p>未接入。真实版本需保留登记 URL、获取日期、更新责任与过期状态。</p></div>${pill('未接入', 'grey')}</div>
    <div class="row"><div><b>个人资料</b><p>存在 ${esc(S.state?.dir ?? '本机资料目录')}；${docs.length} 份原件，路径相对资料目录。</p></div>${pill('本机', 'green')}</div>
    <div class="row"><div><b>康复参考线</b><p>2cm 为常用提示阈值，中国临床口径与测量规范待核验。</p></div>${pill('待核验', 'yellow')}</div>
    <div class="row"><div><b>指标字典</b><p>18 项指标来自领域文档 v0.2；改口径要发新版本，不原地改旧行。</p></div>${pill('v1', 'grey')}</div>
    ${docs.length ? `<div class="divider"></div><h3 style="font-size:12.5px">已导入的原件</h3>${docs.map((x) => `<div class="row"><div><b>${esc(x.filename)}</b><p>${esc(kindLabel(x.kind))} · 报告日期 ${x.reportDate ? longDate(x.reportDate) : '未写'} · 导入 ${longDate(x.importedAt.slice(0, 10))}</p></div><span class="hash">${esc(x.sha256.slice(0, 12))}…</span></div>`).join('')}` : ''}
    <p class="small-note">工作台不会把“获取成功”标成“医学已核实”。</p></section>`
}

export function clinicalPage() {
  const sub = subOf('clinical')
  const map = {
    治疗历程: clinicalTreatments,
    '病理 / 分子档案': clinicalPathology,
    试验线索: clinicalTrials,
    资料对照: clinicalCompare,
    我的关注: clinicalFollow,
    数据来源: clinicalSources,
  }
  return head('临床', SUBTITLES.clinical, btn('准备讨论的问题', 'add-question', 'soft')) + subnav() + (map[sub]?.() ?? '')
}

/* ================= 营养 ================= */

function nutritionNow() {
  return `<div class="grid two">
    <section class="card"><span class="eyebrow">从眼前的感受开始</span><h2 style="margin-top:8px">最近吃东西，有什么不一样？</h2><p>不必先计算摄入。可以记下食欲、吃不下的原因，或已存的专业建议。</p>
      <div class="actions" style="margin-top:18px">${go('记录进食变化', 'nutrition', '进食与体重', 'primary')}${btn('整理我想问的问题', 'nutrition-question')}</div></section>
    <section class="card"><h2>已有建议，值得留好</h2><p>正式建议应保留日期与来源；工作台不会把任何模拟内容当成营养处方。</p>
      <div class="empty" style="margin-top:14px"><p>尚未保存营养相关的专业建议。</p></div></section></div>`
}

function nutritionBody() {
  const weight = d().nutrition?.weight
  const entries = d().nutrition?.entries ?? []
  return `<div class="grid two">
    <section class="card"><h2>今天，记一点就好</h2><p>任选一项；不填也可以。</p>
      <form id="nutrition-form" style="margin-top:14px"><div class="form-grid">
        <label><span class="form-label">进食情况（可不选）</span><select name="intake"><option value="">暂不记录</option><option>和平常差不多</option><option>比平常少一些</option><option>比平常少很多</option></select></label>
        <label><span class="form-label">体重 kg（选填）</span><input name="weight" type="number" step="0.1" min="20" max="300" placeholder="不填也可以"></label>
        <label><span class="form-label">日期</span><input name="date" type="date" value="${today()}" max="${today()}" required></label>
        <label class="wide"><span class="form-label">困难或想说的话（选填）</span><textarea name="note" maxlength="500" placeholder="例如：想把最近吃得少的情况告诉营养师"></textarea></label>
      </div><div class="form-actions"><button class="primary" type="submit">保存记录</button></div></form></section>
    <section class="card"><h2>我的记录</h2>${entries.length ? entries.map((n) => `<div class="saved-item"><b>${esc(n.title)}</b><p>${esc(n.detail ?? '没有补充描述')}</p><small>${longDate(n.sourceDate)} · 本人记录</small></div>`).join('') : '<div class="empty" style="margin-top:16px"><h3>从第一条开始</h3><p>缺失不会记成零，也不影响其他功能。</p></div>'}
      <div class="divider"></div><h3 style="font-size:12.5px">体重趋势</h3>
      ${weight && weight.points.length ? sparkline(weight.points.slice(-8), weight.color, weight.dec) + `<p class="small-note">单点不连线；体重会同步到一图秀的「营养与体重」分类。</p>` : '<p class="small-note">还没有体重记录。</p>'}
    </section></div>`
}

function nutritionReview() {
  const weight = d().nutrition?.weight
  return `<section class="card"><h2>把变化带到下一次沟通里</h2>
    <p>已保存 ${(d().nutrition?.entries ?? []).length} 条营养记录${weight?.points?.length ? `、${weight.points.length} 次体重` : ''}；专业建议与 AI 解释尚未接入。</p>
    <div class="actions" style="margin-top:16px">${btn('保留一个营养问题', 'nutrition-question', 'primary')}${go('查看我的问题', 'review', '问题清单', 'text-button')}</div></section>`
}

export function nutritionPage() {
  const sub = subOf('nutrition')
  const map = { 当下困扰: nutritionNow, 进食与体重: nutritionBody, 建议与回顾: nutritionReview }
  return head('营养支持', SUBTITLES.nutrition) + subnav() + (map[sub]?.() ?? '')
}

/* ================= 心理 ================= */

function mindNow() {
  return `<div class="notice pink">私密空间 · 这里的内容默认不进入一图秀、就诊摘要、导出或 Agent 预览。</div>
  <div class="grid two"><section class="card"><span class="eyebrow">不必马上找到答案</span><h2 style="margin-top:8px">今天，你想给自己留些什么？</h2>
    <form id="mind-form" style="margin-top:16px"><label><span class="form-label">这条记录属于谁？</span><select name="owner"><option value="patient">患者本人</option><option value="caregiver">照护者自己</option></select></label>
    <label style="margin-top:14px"><span class="form-label">感受、睡眠，或者一个小小的困扰</span><textarea name="note" required maxlength="1000" placeholder="可以只写一句，也可以暂时不说。"></textarea></label>
    <div class="form-actions">${go('现在先不写', 'dashboard', '', '')}<button class="primary" type="submit">私密保存</button></div></form></section>
    <section class="card"><h2>可以慢慢来</h2><p>记录没有打卡要求，也不评价你是否“足够积极”。</p>
    <div class="private" style="margin-top:16px"><h3>照护者，也值得被照顾</h3><p style="font-size:11.5px;margin-top:4px">家属自己的感受单独保留，不写成患者的症状。</p></div>
    ${go('看看支持资源 →', 'mind', '支持资源', 'text-button')}</section></div>`
}

function mindRecords() {
  const list = d().mind?.entries ?? []
  return `<section class="card"><div class="card-head"><h2>只留给记录主体的内容</h2>${pill('私密', 'pink')}</div>
    ${list.length ? list.map((m) => `<div class="saved-item private"><b>${esc(m.title)}</b><p>${esc(m.detail ?? '')}</p><small>${longDate(m.sourceDate)} · 未进入分享或导出</small></div>`).join('') : '<div class="empty"><h3>这里还没有记录</h3><p>不记录也可以使用其他帮助。</p></div>'}
    <div class="form-actions">${go('写一条', 'mind', '当下感受', 'primary')}</div></section>`
}

function mindResources() {
  return `<div class="grid two"><section class="card"><h2>如何向别人表达我需要帮助</h2><p>先从自己的话开始：眼前最困扰的是什么，希望别人帮哪一件事。</p>${btn('整理一个求助问题', 'support-question', 'primary')}</section>
    <section class="card"><h2>支持资源的位置</h2><p>真实版本需要核实地区、服务范围、开放时间与更新日期。这一版未接入转介、真人咨询或危机服务，也不做危机分级判断。</p>${btn('看这条设计的边界', 'resource-info', 'text-button')}</section></div>`
}

function mindIntimacy() {
  return `<div class="notice pink">这些话题默认私密，只有你主动选择才会进入分享。</div>
  <div class="grid three">${[['身体形象', '术后外观、穿衣、照镜子时的感受。'], ['亲密关系', '性欲变化、疼痛、伴侣沟通；可以只记不分享。'], ['生育与月经', '化疗后月经变化、生育力保存的转介问题。']].map(([t, d2]) => `<section class="card"><h3>${t}</h3><p style="font-size:11.5px;margin-top:5px">${d2}</p>${btn('留一个私密问题 →', 'private-question', 'text-button', `data-topic="${t}"`)}</section>`).join('')}</div>
  <div class="help-box">生育意愿、月经状态、是否已转介都是自愿填写；工作台不判断“能不能怀孕”，也不按年龄推断。</div>`
}

export function mindPage() {
  const sub = subOf('mind')
  const map = { 当下感受: mindNow, 我的记录: mindRecords, 支持资源: mindResources, 身体与亲密: mindIntimacy }
  return head('心理支持', SUBTITLES.mind) + subnav() + (map[sub]?.() ?? '')
}

/* ================= 收藏与回顾 ================= */

function reviewQuestions() {
  const list = d().questions?.list ?? []
  return `<section class="card"><div class="card-head"><h2>就诊问题清单</h2>${btn('＋ 新增', 'add-question', 'primary')}</div>
    ${list.length ? list.map((q) => `<div class="row"><div><b>${esc(q.text)}</b><p>${q.kind === 'view' ? '我的看法 · 不是医生结论' : '想问的事'}${q.version > 1 ? ` · 第 ${q.version} 版` : ''}</p></div>${pill(q.includeInExport ? '已选入导出' : '不进导出', q.includeInExport ? 'green' : 'grey')}</div>`).join('') : '<p class="small-note" style="margin:0">还没有问题。</p>'}
    <div class="form-actions">${go('编辑与导出', 'care', '就诊准备', 'primary')}</div></section>`
}

function reviewSaved() {
  const saved = d().saved?.list ?? []
  return `<section class="card"><h2>保留的准备结果</h2>
    ${saved.length ? `<div class="export-list">${saved.map((s) => `<div class="saved-item"><b>${esc(s.title)}</b><p>${esc(s.preview ?? '快照已保存')}</p><small>${longDate(s.createdAt.slice(0, 10))} · ${esc(s.kind)}</small></div>`).join('')}</div>` : '<div class="empty" style="margin-top:16px"><h3>还没有保留的结果</h3><p>导出问题后，会在这里留一条快照记录。</p></div>'}
    <div class="form-actions">${go('去就诊准备导出', 'care', '就诊准备', 'primary')}</div></section>`
}

function reviewReports() {
  const exports = d().exports?.list ?? []
  return `<div class="grid two">
    <section class="card"><h2>报告与导出</h2><p>当前可导出就诊准备的 Markdown；其他格式未实现。</p>
      <div class="form-actions">${go('去导出', 'care', '就诊准备', 'primary')}</div>
      <div class="divider"></div>
      <h3 style="font-size:12.5px">导出记录</h3>
      ${exports.length ? exports.map((x) => `<div class="saved-item"><b>${longDate(x.createdAt.slice(0, 10))} · Markdown</b><p>选入 ${x.scope?.questionIds?.length ?? 0} 个问题、${x.scope?.metricCodes?.length ?? 0} 个指标${x.scope?.includeArm ? '、上肢摘要' : ''}</p><small>${x.isStale ? '<span class="danger-text">导出后源数据有变化，这份可能已过时</span>' : '<span class="ok-text">与当前记录一致</span>'}</small></div>`).join('') : '<p class="small-note">还没有导出过。</p>'}
    </section>
    <section class="card"><h2>原生 Agent 任务</h2><p>这一版没有连接 DSH 宿主或模型，不会创建会话、读取目录或发送内容。</p>
      <div class="form-actions">${btn('预览未来会发送什么', 'agent-preview', 'soft')}</div>
      <div class="divider"></div><h3 style="font-size:12.5px">任务</h3>${tasksBlock()}</section></div>`
}

export function reviewPage() {
  const sub = subOf('review')
  const map = { 问题清单: reviewQuestions, 已保留结果: reviewSaved, 报告与任务: reviewReports }
  return head('收藏与回顾', SUBTITLES.review) + subnav() + (map[sub]?.() ?? '')
}

/* ================= 设置 / 关于 / 档案 ================= */

export const CFG_TABS = [['store', '资料目录'], ['parse', '文档解析'], ['about', '关于']]

export function settingsBody(tab = 'store', pendingPath = '') {
  const st = S.state
  const consent = Boolean(st?.settings?.mineruConsent)
  const mineru = st?.settings?.mineru ?? {}
  const sourceLabel = mineru.source === 'bundled-public' ? '随包公益 Key'
    : mineru.source === 'env:MINERU_TOKEN' ? '环境变量 MINERU_TOKEN'
      : mineru.source === '.secrets/mineru.json' ? '本机 .secrets/mineru.json'
        : mineru.source ?? '未配置'
  if (tab === 'parse') {
    return `<div class="choice ${consent ? 'on' : 'off'}" role="group" aria-label="解析方式">
      <div class="choice-head"><b>MinerU 解析</b>${pill(consent ? '已启用' : '未启用', consent ? 'green' : 'yellow')}</div>
      <p class="small-note">TXT / MD / CSV 始终先走本机抽取，不上传；只有扫描件、图片、PDF 与 Office 才送到 MinerU。</p>
      <label class="check-row"><input type="checkbox" id="consent" ${consent ? 'checked' : ''} data-action="toggle-consent">
        <span>我了解：所选文件会上传到 MinerU 云端解析。只传文件本身，不传档案、看法与问题；可随时关闭。</span></label>
      ${consent ? '' : '<p class="small-note" style="color:var(--warn)">未勾选前不会上传，也不会调用 MinerU。</p>'}
    </div>
    <div class="choice" style="margin-top:14px">
      <div class="choice-head"><b>API Token</b><span class="status-inline">${mineru.configured ? esc(sourceLabel) : '未配置'}</span></div>
      <div class="token-row">
        <input id="mineru-token" type="password" autocomplete="off" spellcheck="false"
          placeholder="${mineru.configured ? '已配置，粘贴新 Token 可覆盖' : '粘贴 sk-... 开头的 Token'}">
        ${btn('保存 Token', 'save-mineru-token', 'primary')}
        ${mineru.configured && mineru.source === '.secrets/mineru.json' ? btn('清除本机 Token', 'clear-mineru-token', 'text-button') : ''}
      </div>
      <p class="small-note" style="margin-top:8px">当前：${mineru.configured ? esc(mineru.masked ?? '****') : '未配置'} · 来源：${esc(sourceLabel)}</p>
      <div class="notice plain" style="margin:12px 0 0">
        <b>Token 放在哪</b>
        <p style="margin:6px 0 0">保存后会写入本机 <code>.secrets/mineru.json</code>（权限 600、已在 .gitignore 里）；环境变量 <code>MINERU_TOKEN</code> 只作临时覆盖。不写进患者库、不进日志、不进导出。</p>
        <p style="margin:6px 0 0">随包公益 Key 只在没有本机 Token 和环境变量时兜底；你保存自己的 Token 会优先使用。</p>
      </div>
      <div class="notice warn" style="margin-top:12px">Token 不做在线校验：MinerU 没有无副作用的校验端点。首次解析若 401，会在材料上写明原因，原件保留可重试。</div>
    </div>`
  }
  if (tab === 'about') {
    return `<div class="about">
      <img class="about-logo" src="assets/brand/pinkypal-logo-full.png" width="150" height="150" alt="小粉宝 PinkyPal 完整标识">
      <div class="about-meta">
        <div class="about-ver"><b>v${esc(S.version)}</b><span class="pill grey">开发版 · 未接入 DSH</span></div>
        <dl>
          <div><dt>版本来源</dt><dd>仓库根目录 VERSION 文件（唯一来源）</dd></div>
          <div><dt>页面渲染</dt><dd>顶栏、页脚、本弹窗同源</dd></div>
          <div><dt>数据位置</dt><dd style="word-break:break-all">${esc(st?.dir ?? '未设置')}</dd></div>
          <div><dt>解析引擎</dt><dd>本机文本抽取 + MinerU（可选）</dd></div>
        </dl>
      </div>
    </div>
    <div class="notice plain" style="margin-top:14px">这是开发版：界面接的是真实本机数据，但还没装进 DSH Desktop，也没有发布。记录不是诊断，处置由治疗团队判断。</div>`
  }
  return `<div class="notice plain">资料目录由你指定。工作台<b>不会</b>在默认位置、用户主目录或桌面根目录静默新建文件夹，也拒绝根目录与系统目录。</div>
  <div class="cfg-block">
    <span class="form-label">当前资料根目录</span>
    <div class="path-row"><code>${esc(st?.dir ?? '未设置')}</code></div>
    <p class="small-note">原件、解析派生文件与数据库都在这里；该目录不进安装包、不进日志、不进 Git。换目录不会搬走已有记录。</p>
  </div>
  <div style="margin-top:14px">
    <span class="form-label">换一个资料目录</span>
    <div class="path-row"><input id="ws-path" placeholder="/Users/你的名字/Documents/PinkyPal" value="${esc(pendingPath)}" spellcheck="false">${btn('本机选择…', 'pick-native', 'soft')}<label class="checkbox-line" style="margin:0"><input type="checkbox" id="ws-create" checked><span>目录不存在时按这个路径新建</span></label>${btn('打开 / 新建', 'set-workspace', 'primary')}</div>
    <p class="small-note" style="margin-top:6px">也可以手输完整路径，或${btn('网页逐层浏览', 'browse-dirs', 'text-link text-button')}。</p>
    <p class="small-note">拒绝规则：根目录、用户主目录、桌面根目录、系统目录。拒绝时会给出可读原因，不会静默失败。</p>
  </div>
  <div class="divider"></div>
  <h3 style="font-size:13px">档案</h3>
  <div class="form-grid" style="margin-top:10px">
    <label><span class="form-label">显示名（可用化名）</span><input id="subject-name" value="${esc(st?.subject?.displayName ?? '')}" maxlength="40"></label>
    <label><span class="form-label">患侧</span><select id="subject-side">
      ${[['unknown', '未声明'], ['left', '左'], ['right', '右'], ['bilateral', '双侧']].map(([v, l]) => `<option value="${v}" ${st?.subject?.laterality === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select></label>
  </div>
  <p class="small-note">已有上肢测量记录时，改患侧会被拒绝：那会让已存的“患侧 − 健侧”含义翻转。</p>
  <div class="form-actions">${btn('保存档案信息', 'save-subject', 'soft')}</div>`
}

export function profileBody() {
  const subjects = S.state?.subjects ?? []
  const demos = S.state?.demos ?? []
  return `<div class="notice warn">演示画像用<b>模拟数据</b>覆盖边界情况，不是真实病历。切换档案只换当前查看的档案，不改数据。</div>
  <div class="intake-actions" style="margin:10px 0 4px">
    ${btn('＋ 新建档案', 'new-subject', 'primary')}
    ${btn('资料初始化', 'intake-open', 'soft')}
  </div>
  <h3 style="font-size:13px">本机档案</h3>
  ${subjects.map((s) => `<button class="profile-row ${s.active ? 'on' : ''}" data-action="use-subject" data-id="${s.id}" aria-pressed="${s.active}">
    <div><b>${esc(s.displayName)}${s.demo ? ` · ${esc(s.demo.id)}` : ''}</b><p>${esc(s.roleLabel ?? '身份未填写')} · ${esc({ left: '左', right: '右', bilateral: '双侧', unknown: '患侧未声明' }[s.laterality] ?? '')}${s.demo ? ` · ${esc(s.demo.label)}` : ' · 真实档案'}</p></div>
    <span class="profile-caret">${s.active ? '当前' : '切换'}</span></button>`).join('')}
  <div class="divider"></div>
  <h3 style="font-size:13px">演示画像</h3>
  <p class="small-note">载入会新建一个独立档案（用 [UI DEMO] 标记），不会写进你的真实档案；清理只删 manifest 登记过的那一套。</p>
  ${demos.map((x) => `<div class="profile-row" style="cursor:default">
    <div><b>${esc(x.id)} · ${esc(x.label)}</b><p>${esc(x.note)}${x.seeded ? ` · 已载入（观测 ${x.counts?.observations ?? 0} 条）` : ''}</p></div>
    <span class="actions">${x.seeded ? btn('清理', 'clear-demo', 'text-button', `data-id="${x.id}"`) : btn('载入', 'seed-demo', 'soft', `data-id="${x.id}"`)}</span>
  </div>`).join('')}`
}
