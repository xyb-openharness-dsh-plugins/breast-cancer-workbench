/** 前端入口：路由、事件、表单与弹窗。 */
import { S, boot, resetBoot, refresh, STAGE_HINT, SYMPTOM_CODES, ARM_STAGES } from './js/state.js'
import { api, uploadDocument, guessKind, isTextFile } from './js/api.js'
import { discussWithAgent } from './js/agent.js'
import { hostAgent, initHostAgent, requestOpenAgent, agentStatusText } from './js/host-agent.js'
import { parseFault } from './js/parse-fault.js'
import {
  $, $$, esc, fmtNum, unitText, longDate, today, toast, openModal, closeModal, downloadText,
  btn, go, pill, section, empty, head, codeBlock,
} from './js/ui.js'
import {
  PAGES, SUBPAGES, SUBTITLES, icon, subnav, dashboard, recordsPage, timelinePage, kindLabel,
  pinHTML, chartPanel,
} from './js/pages-basic.js'
import {
  carePage, clinicalPage, nutritionPage, mindPage, reviewPage,
  settingsBody, profileBody, CFG_TABS,
} from './js/pages-more.js'

const RENDER = {
  dashboard,
  records: recordsPage,
  timeline: timelinePage,
  clinical: clinicalPage,
  nutrition: nutritionPage,
  mind: mindPage,
  care: carePage,
  review: reviewPage,
}

let lastExport = null

/* ================= 渲染 ================= */

function setupPage(error = null) {
  return `<div class="setup">
    <div class="card">
      <div class="brand" style="display:flex;gap:12px;align-items:center">
        <img src="assets/brand/pinkypal-mark-96.png" width="52" height="52" alt="小粉宝标识" style="border-radius:14px;border:1px solid var(--line)">
        <div><strong style="font-size:20px;letter-spacing:1.5px">小粉宝</strong><span style="display:block;font-size:11px;color:var(--muted)">PinkyPal · 陪你慢慢来</span></div>
      </div>
      <h1>先建一个资料目录</h1>
      <p>原件、解析出的文本与数据库都放在你自己的目录里。工作台<b>不会</b>在用户主目录或桌面根目录静默新建文件夹，也不会读别的目录。</p>
      ${error ? `<div class="notice warn" style="margin-top:14px"><b>没能打开：</b>${esc(error)}</div>` : ''}
      <div class="form-actions" style="margin-top:16px">${btn('一键创建默认资料目录', 'prepare-default', 'primary')}</div>
      <p class="small-note" style="margin-top:6px">默认位置：<code>~/Documents/小粉宝工作台</code>。点一下会建好分类子目录（病理、影像、化验、出院小结等），不需要压缩或整理成模板。</p>
      <div class="divider"></div>
      <div style="margin-top:10px">
        <span class="form-label">或者自己指定资料目录</span>
        <div class="path-row"><input id="ws-path" placeholder="/Users/你的名字/Documents/PinkyPal" spellcheck="false" autofocus>
          ${btn('本机选择…', 'pick-native', 'soft')}
          <label class="checkbox-line" style="margin:0"><input type="checkbox" id="ws-create" checked><span>不存在就新建</span></label></div>
        <p class="small-note" style="margin-top:6px">也可以手输完整路径，或${btn('网页逐层浏览', 'browse-dirs', 'text-link text-button')}。</p>
      </div>
      <div class="form-actions" style="margin-top:16px">${btn('打开这个目录', 'set-workspace', 'primary')}</div>
      <p class="small-note">拒绝：根目录、用户主目录、桌面根目录、系统目录。选错会给出可读原因，不会静默失败。</p>
      <div class="divider"></div>
      <details><summary style="font-size:12px;color:var(--muted);cursor:pointer">命令行怎么启动</summary>
        <p class="small-note"><code>npm start -- --workspace /你的/资料目录</code><br>要直接看演示数据：加 <code>--demo DEMO-1</code>（模拟数据，不是真实病历）。</p></details>
    </div>
    <p class="small-note" style="text-align:center;margin-top:14px">v${esc(S.version)} · 记录不是诊断，处置由治疗团队判断</p>
  </div>`
}

function paintNav() {
  const nav = $('#nav')
  if (!nav) return
  nav.innerHTML = PAGES.map(([id, label, ic]) => {
    const badge = navBadge(id)
    return `<button class="nav-button" data-action="go" data-page="${id}" ${S.page === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${badge ? `<span class="nav-count">${badge}</span>` : ''}</button>`
  }).join('')

  // 窄空间把一级、二级都提升到顶部：一级一行、二级独占下一行。
  // 宽空间仍由页面内容区保留二级标签，避免改变已验收的大屏工作流。
  const dock = $('#subnav-dock')
  if (!dock) return
  const items = SUBPAGES[S.page] ?? []
  const selected = S.sub[S.page] || items[0]
  dock.innerHTML = items.length
    ? `<div class="nav-subrow" role="tablist" aria-label="${PAGES.find((p) => p[0] === S.page)?.[1] ?? ''}二级页面">${items.map((item) => `<button role="tab" aria-selected="${selected === item}" data-action="sub" data-sub="${esc(item)}">${esc(item)}</button>`).join('')}</div>`
    : ''
}

function navBadge(id) {
  if (!S.ready) return ''
  if (id === 'records') {
    const n = S.data.overview?.documents?.pendingCandidates ?? 0
    return n ? String(n) : ''
  }
  if (id === 'review') {
    const n = (S.data.questions?.list ?? []).filter((q) => q.status === 'open').length
    return n ? String(n) : ''
  }
  return ''
}

function paintTop() {
  const st = S.state
  const store = $('#ready-store')
  const chat = $('#ready-session')
  const ready = Boolean(st?.ready)
  if (store) {
    store.innerHTML = `<i class="${ready ? '' : 'grey'}"></i><span>资料目录</span><b>${ready ? '已激活' : '未设置'}</b>`
    store.title = ready ? st.dir : '选择资料目录（不使用默认路径）'
  }
  if (chat) {
    // 顶栏这颗是**真的入口**：状态来自宿主回告（pinky:agent-state），不是硬写的字。
    // 宿主没回告之前只能说"点此打开"，不能先替它宣布"已连接"。
    const st2 = agentStatusText()
    chat.innerHTML = `<i class="${st2.dot}"></i><span>对话</span><b>${st2.label}</b>`
    chat.title = st2.title
  }
  const subject = st?.subject
  if ($('#profile-avatar')) $('#profile-avatar').textContent = (subject?.displayName ?? '我').slice(0, 1)
  if ($('#profile-name')) {
    const name = subject?.displayName ?? ''
    $('#profile-name').textContent = !name || name === '我' || name === '我的' ? '我的资料' : `${name}的资料`
  }
  if ($('#profile-meta')) {
    const demo = st?.subjects?.find((s) => s.id === subject?.id)?.demo
    $('#profile-meta').textContent = demo
      ? `${demo.id} · 模拟数据`
      : (subject ? `${subject.roleLabel ?? '身份未填写'} · 本机档案` : '本机档案')
  }
  const crumb = $('#breadcrumb')
  if (crumb) crumb.textContent = PAGES.find((p) => p[0] === S.page)?.[1] ?? '看板'
  $$('.ver-chip').forEach((el) => { el.textContent = `v${S.version}` })
  const av = $('#app-version'); if (av) av.textContent = `v${S.version}`
}

function onboardingPage() {
  return `<div class="setup"><div class="card">
    <h1>先建一个档案</h1>
    <p>资料目录已经就绪：<code>${esc(S.state?.dir ?? '')}</code></p>
    <p>同一个资料库里可以放多位家人的档案；切换档案只换当前查看的人，不会混数据。</p>
    <div class="form-actions" style="margin-top:16px">${btn('新建档案', 'new-subject', 'primary')}</div>
    <p class="small-note">新建后可以一键创建分类目录，把病历文件放进去，再回工作台检查导入。</p>
    <div class="divider"></div>
    <p class="small-note">只想先看看效果？${btn('加载一套模拟数据', 'load-demo-showcase', 'text-link text-button')}（模拟数据，不是真实病历）</p>
  </div></div>`
}

export function rerender() {
  paintTop()
  paintNav()
  const main = $('#main')
  if (!main) return
  if (!S.ready) {
    main.innerHTML = setupPage()
    return
  }
  if (!S.state?.subject) {
    main.innerHTML = `<div class="page-enter">${onboardingPage()}</div>`
    return
  }
  const render = RENDER[S.page] ?? dashboard
  try {
    main.innerHTML = `<div class="page-enter">${render()}</div>`
  } catch (error) {
    console.error(error)
    main.innerHTML = `<div class="notice warn">这一页渲染出错了：${esc(error.message)}。数据没有被改动。<div class="actions" style="margin-top:10px">${btn('回看板', 'go', 'soft', 'data-page="dashboard"')}</div></div>`
  }
}

/* ================= 路由 ================= */

function navigate(page, sub) {
  if (!PAGES.some((p) => p[0] === page)) page = 'dashboard'
  S.page = page
  if (sub && (SUBPAGES[page] ?? []).includes(sub)) S.sub[page] = sub
  S.query = ''
  S.pin = null
  try { history.replaceState(null, '', `#${page}${S.sub[page] ? `/${encodeURIComponent(S.sub[page])}` : ''}`) } catch { /* file:// 下忽略 */ }
  rerender()
  $('#main')?.focus({ preventScroll: true })
  window.scrollTo({ top: 0, behavior: 'instant' })
}

function applyHash() {
  const raw = (location.hash || '').replace(/^#/, '')
  if (!raw) return false
  const parts = raw.split('/')
  const page = decodeURIComponent(parts[0] ?? '')
  const sub = parts[1] ? decodeURIComponent(parts[1]) : ''
  if (!PAGES.some((p) => p[0] === page)) return false
  S.page = page
  if (sub && (SUBPAGES[page] ?? []).includes(sub)) S.sub[page] = sub
  return true
}

/* ================= 通用动作 ================= */

async function guarded(fn, okMessage = null) {
  try {
    const result = await fn()
    if (okMessage) toast(okMessage)
    await refresh()
    rerender()
    return result
  } catch (error) {
    toast(error.message)
    if (!['NO_WORKSPACE'].includes(error.code)) console.warn('[action]', error)
    return null
  }
}

const inputValue = (sel) => $(sel)?.value ?? ''

function formData(form) {
  return Object.fromEntries(new FormData(form).entries())
}

/* ================= 表单弹窗 ================= */

function taskModal() {
  openModal('添加一项安排', `<form id="task-form">
    <label><span class="form-label">安排内容</span><input name="title" required maxlength="120" placeholder="例如：把上肢记录带去康复科"></label>
    <div class="form-grid" style="margin-top:12px">
      <label><span class="form-label">日期</span><input type="date" name="dueOn" value="${today()}"></label>
      <label><span class="form-label">来源</span><select name="kind">
        <option value="self">本人安排</option><option value="hospital">医院安排</option>
        <option value="question_prep">准备问题</option><option value="followup">随访</option></select></label>
    </div>
    <label style="margin-top:12px"><span class="form-label">补充说明（选填）</span><textarea name="detail" maxlength="500" placeholder="这项安排来自哪里？还有什么需要确认？"></textarea></label>
    <p class="small-note">完成待办不会生成治疗记录。</p></form>`,
  `${btn('取消', 'close')}<button type="submit" form="task-form" class="primary">保存安排</button>`)
}

function questionModal(kind = 'fact') {
  openModal('加一个想问的问题', `<form id="question-form">
    <label><span class="form-label">用自己的话写下来</span><textarea name="text" required maxlength="500" placeholder="例如：来曲唑期间手指晨僵，需要做哪些评估？"></textarea></label>
    <div class="form-actions" style="align-items:center;gap:14px;flex-wrap:wrap">
      <label style="display:flex;flex-direction:row;align-items:center;gap:6px;font-size:12px;white-space:nowrap"><input type="radio" name="kind" value="fact" ${kind === 'fact' ? 'checked' : ''}> 想问的事</label>
      <label style="display:flex;flex-direction:row;align-items:center;gap:6px;font-size:12px;white-space:nowrap"><input type="radio" name="kind" value="view" ${kind === 'view' ? 'checked' : ''}> 我的看法 / 担心</label>
    </div>
    <p class="small-note">选「我的看法」时，这句话会标注为本人观点，不作为事实或结论使用。</p></form>`,
  `${btn('取消', 'close')}<button type="submit" form="question-form" class="primary">加入清单</button>`)
}

function viewpointModal(role = 'patient') {
  openModal(role === 'patient' ? '记一句我的看法' : '记一句照护者的感受', `<form id="viewpoint-form">
    <input type="hidden" name="speakerRole" value="${role}">
    <label><span class="form-label">${role === 'patient' ? '你的感受或担心' : '照护者自己的感受'}</span><textarea name="text" required maxlength="500" placeholder="例如：我总觉得这条手臂比上个月沉"></textarea></label>
    <label style="margin-top:12px;max-width:180px"><span class="form-label">记录日期</span><input type="date" name="recordedOn" value="${today()}" max="${today()}"></label>
    <p class="small-note">这是一条看法，不是医生结论；不进趋势、不写进摘要的事实区。</p></form>`,
  `${btn('取消', 'close')}<button type="submit" form="viewpoint-form" class="primary">保存这条看法</button>`)
}

function symptomModal() {
  openModal('记录一点身体变化', `<form id="symptom-form">
    <label><span class="form-label">哪一类</span><select name="code">${SYMPTOM_CODES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
    <div class="form-grid" style="margin-top:12px">
      <label><span class="form-label">日期</span><input type="date" name="occurredOn" value="${today()}" max="${today()}" required></label>
      <label><span class="form-label">强度</span><select name="level"><option value="0">0 · 没有</option><option value="1" selected>1 · 轻微</option><option value="2">2 · 明显</option><option value="3">3 · 影响日常</option></select></label>
    </div>
    <label style="margin-top:12px"><span class="form-label">发生了什么（时间、位置、什么时候更明显）</span><textarea name="note" maxlength="500" placeholder="例如：下午更明显，抬手会轻一些"></textarea></label>
    <p class="small-note">这是本人自述；工作台不评估症状、不做因果归因，也不给处理方案。</p></form>`,
  `${btn('取消', 'close')}<button type="submit" form="symptom-form" class="primary">保存记录</button>`)
}

function armModal() {
  const arm = S.data.arm
  const points = arm?.pointOrder ?? ['wrist', 'forearm_mid', 'above_elbow_10', 'below_axilla_10']
  const labels = arm?.pointLabels ?? {}
  const side = S.state?.subject?.laterality
  const sideText = side === 'left' ? '左' : side === 'right' ? '右' : '未声明'
  openModal('记录一次四点位测量', `<form id="arm-form">
    <div class="form-grid">
      <label><span class="form-label">日期</span><input type="date" name="measuredOn" value="${today()}" max="${today()}" required></label>
      <label><span class="form-label">测量者</span><select name="assessorRole">
        <option value="patient">本人</option><option value="caregiver">本人 + 家属</option>
        <option value="nurse">护士</option><option value="therapist">康复治疗师</option><option value="clinician">医生</option></select></label>
    </div>
    <p class="small-note" style="margin:10px 0 6px">坐位 · 双臂自然下垂 · 四点位（cm）· 同一体位、同一位置成对测量；患侧：${esc(sideText)}。</p>
    <div class="table-wrap"><table><thead><tr><th>点位</th><th>患侧</th><th>健侧（可空）</th><th>差值</th></tr></thead><tbody>
      ${points.map((p) => `<tr><td>${esc(labels[p] ?? p)}</td>
        <td><input name="${p}_a" type="number" step="0.1" min="5" max="80" placeholder="—" inputmode="decimal"></td>
        <td><input name="${p}_h" type="number" step="0.1" min="5" max="80" placeholder="可空" inputmode="decimal"></td>
        <td class="num" data-diff="${p}">—</td></tr>`).join('')}
    </tbody></table></div>
    <p class="small-note">至少填一个点位的患侧值。只填患侧也能保存，差值记为空（不是 0）；工作台不判断水肿分期。</p>
    ${side === 'unknown' ? '<div class="notice warn" style="margin-top:10px">档案还没声明患侧，保存会被拒绝。先到「设置 → 资料目录」里选左或右。</div>' : ''}
  </form>`,
  `${btn('取消', 'close')}<button type="submit" form="arm-form" class="primary">保存并同步到一图秀</button>`)
}

function drainModal() {
  openModal('记录引流量', `<form id="drain-form"><div class="form-grid">
    <label><span class="form-label">日期</span><input type="date" name="date" value="${today()}" max="${today()}" required></label>
    <label><span class="form-label">引流量 mL（0 表示当日拔管）</span><input name="value" type="number" min="0" max="2000" step="1" required placeholder="例如 45"></label>
    <label class="wide"><span class="form-label">性状 / 备注（选填）</span><input name="note" maxlength="100" placeholder="例如：淡血性"></label></div>
    <p class="small-note">同一天多次记录不合并；工作台不判断是否异常，也不给换药步骤。</p></form>`,
  `${btn('取消', 'close')}<button type="submit" form="drain-form" class="primary">保存记录</button>`)
}

function observationModal() {
  const metrics = S.data.metrics?.cards ?? []
  openModal('手工补录一个值', `<form id="observation-form">
    <div class="form-grid">
      <label><span class="form-label">指标</span><select name="metricCode">${metrics.map((m) => `<option value="${m.code}">${esc(m.name)}${m.unit && m.unit !== '—' ? `（${esc(m.unit)}）` : ''}</option>`).join('')}</select></label>
      <label><span class="form-label">日期</span><input type="date" name="occurredOn" value="${today()}" max="${today()}" required></label>
      <label><span class="form-label">数值</span><input name="value" type="number" step="any" required placeholder="例如 3.8"></label>
      <label><span class="form-label">化验单参考上限（选填）</span><input name="refHigh" type="number" step="any" placeholder="例如 40"></label>
      <label><span class="form-label">方法 / 设备（选填）</span><input name="method" maxlength="60" placeholder="例如同一实验室 ECLIA"></label>
    </div>
    <label style="margin-top:12px"><span class="form-label">备注（选填）</span><input name="note" maxlength="200" placeholder="例如：随访复查"></label>
    <p class="small-note">手工补录直接进事实层（不经候选）；方法不同的值会在趋势里断开，不拼接。
    参考上限只用于 ALT / AST / 碱性磷酸酶 / 总胆红素 / 肌酐这几项的分级换算——CTCAE 对它们写的是「×正常上限」，
    没有上限就给不出级别，工作台也不会拿通用值替你除。</p></form>`,
  `${btn('取消', 'close')}<button type="submit" form="observation-form" class="primary">保存这个值</button>`)
}

function treatmentModal() {
  openModal('补录一次治疗', `<form id="treatment-form">
    <div class="form-grid">
      <label><span class="form-label">类型</span><select name="kind">
        <option value="surgery">手术</option><option value="chemo">化疗</option><option value="radio">放疗</option>
        <option value="endocrine">内分泌治疗</option><option value="targeted">靶向治疗</option><option value="immuno">免疫治疗</option><option value="other">其他</option></select></label>
      <label><span class="form-label">名称 / 方案</span><input name="name" required maxlength="120" placeholder="例如 EC × 4 → 紫杉醇 × 4"></label>
      <label><span class="form-label">开始日期</span><input type="date" name="start" max="${today()}"></label>
      <label><span class="form-label">结束日期（选填）</span><input type="date" name="end" max="${today()}"></label>
      <label><span class="form-label">状态</span><select name="status"><option value="completed">已完成</option><option value="ongoing">进行中</option><option value="planned">计划</option></select></label>
      <label><span class="form-label">腋窝处理（手术时）</span><select name="axillary"><option value="">不适用</option><option value="slnb">前哨淋巴结活检</option><option value="alnd">腋窝清扫</option><option value="none">未处理</option><option value="unknown">不清楚</option></select></label>
    </div>
    <label style="margin-top:12px"><span class="form-label">备注（选填）</span><input name="note" maxlength="200" placeholder="例如：来源为出院小结"></label>
    <p class="small-note">这是本人补录，会标记来源；原始文书仍以你导入的材料为准。</p></form>`,
  `${btn('取消', 'close')}<button type="submit" form="treatment-form" class="primary">保存治疗记录</button>`)
}

function adviceModal() {
  openModal('记一条从门诊听到的建议', `<form id="advice-form">
    <label><span class="form-label">建议内容（尽量保留原话）</span><textarea name="title" required maxlength="300" placeholder="例如：患肢避免提重物（>5kg），按康复科指导使用压力袖套"></textarea></label>
    <div class="form-grid" style="margin-top:12px">
      <label><span class="form-label">来源</span><input name="detail" maxlength="120" placeholder="例如：康复科门诊 / 出院指导"></label>
      <label><span class="form-label">日期</span><input type="date" name="sourceDate" value="${today()}" max="${today()}"></label>
    </div>
    <p class="small-note">这里只保存你听到/看到的建议，工作台不生成新的护理处方。</p></form>`,
  `${btn('取消', 'close')}<button type="submit" form="advice-form" class="primary">保存建议</button>`)
}

function candidateEditModal(candidateId) {
  const draft = S.data.draft
  let hit = null
  for (const doc of draft?.documents ?? []) {
    const found = doc.candidates.find((c) => c.candidate.id === candidateId)
    if (found) hit = found
  }
  if (!hit) return toast('这条候选已不在草稿里')
  const c = hit.candidate
  openModal('修改后接受', `<form id="candidate-form" data-id="${candidateId}">
    <div class="notice">核对表示转录已检查，不等于医学专业审核。</div>
    <label><span class="form-label">${esc(c.field)} 的值</span><input name="valueText" value="${esc(c.value_text ?? '')}" required maxlength="160"></label>
    <div class="form-grid" style="margin-top:12px">
      <label><span class="form-label">单位</span><input name="unit" value="${esc(c.unit ?? '')}" maxlength="30"></label>
      <label><span class="form-label">发生日期</span><input name="occurredOn" type="date" value="${esc(S.draftDates[c.id] ?? hit.suggestedDate ?? '')}" max="${today()}"></label>
      <label><span class="form-label">方法（选填）</span><input name="method" value="${esc(c.method ?? '')}" maxlength="60"></label>
    </div>
    <p class="small-note">来源：${esc(c.page_ref ?? '原文')}。修改会作为「修改后接受」记录，原候选值保留在历史里。</p></form>`,
  `${btn('取消', 'close')}<button type="submit" form="candidate-form" class="primary">修改后接受</button>`)
}

function stageModal() {
  const stages = S.state?.stages ?? []
  const current = S.data.overview?.subject?.stage?.code
  openModal('当前关注阶段', `<div class="notice plain">阶段由你自己选，工作台<b>不按治疗日期推断</b>。换阶段只改推荐话题，<b>不改任何记录</b>。</div>
    <div class="stage-grid">${stages.map((s) => `<button data-action="stage-set" data-code="${s.code}" aria-pressed="${current === s.code}" class="${current === s.code ? 'on' : ''}">${esc(s.label)}</button>`).join('')}</div>`,
  btn('取消', 'close'))
}

function stageHelpModal() {
  const stage = S.data.overview?.subject?.stage
  openModal(`${stage?.label ?? '还没选阶段'} · 可以做什么`, `<p>${esc(STAGE_HINT[stage?.code] ?? '阶段由你自己选；工作台不根据日期推断，也不会因为阶段隐藏其他模块。')}</p>
    <div class="grid" style="margin-top:14px">
      ${go('看看这一阶段的记录重点', 'care', '术后恢复', 'soft')}
      ${go('量一次上肢围度', 'care', '上肢与淋巴水肿', 'soft')}
      ${btn('留一个想问的问题', 'add-question', 'soft')}
    </div>
    <div class="row" style="margin-top:14px"><div><b>当前阶段：${esc(stage?.label ?? '未选择')}</b><p>换阶段不会改写任何记录</p></div>${btn('改阶段', 'stage-pick', 'text-button')}</div>`,
  btn('返回', 'close'))
}

/**
 * 顶栏「对话」：宿主里直接调起原生会话；独立启动时说明为什么这里没有对话。
 * 旧版这里弹的是「这一版没有接入宿主」——那句已经不对了，会话是真的接了的。
 */
function sessionModal() {
  if (hostAgent.host) {
    const result = requestOpenAgent()
    if (result === 'sent') { toast('正在为你调起右侧对话…'); return }
    toast('没能联系上宿主面板；可以从左侧会话列表新建一个')
    return
  }
  openModal('工作台对话 · 需要在宿主里打开', `<div class="notice plain">对话由 DSH 宿主提供，工作台不复制聊天界面。现在是<b>独立启动的页面</b>（<code>npm start</code>），本机没有会话面板，所以这颗按钮只会给说明。</div>
    <div class="row"><div><b>在 DSH Desktop 里打开就有对话</b><p>同一个包装进 Desktop 后，点这颗按钮会调起右侧原生会话：开场白先填进草稿，不会自动发送。</p></div>${pill('宿主接入', 'green')}</div>
    <div class="row"><div><b>业务面板不依赖会话</b><p>看板、指标卡、一图秀、测量与导出在没有会话时都可用；只有需要 AI 的动作才要它。</p></div>${pill('设计约束', 'green')}</div>
    <div class="row"><div><b>资料目录</b><p><code>${esc(S.state?.dir ?? '未设置')}</code></p></div>${pill(S.state?.ready ? '已激活' : '未设置', S.state?.ready ? 'green' : 'grey')}</div>`,
  btn('关闭', 'close', 'primary'))
}

function helpModal() {
  openModal('这版能做什么', `<ol style="font-size:12.5px;line-height:1.9;padding-left:18px">
    <li>资料库导入一份检验单 → 解析 → 在「整理草稿」逐项核对，接受后才进档案。</li>
    <li>「上肢与淋巴水肿」记录一次四点位，看它同步到趋势与一图秀。</li>
    <li>一图秀：左侧加减指标、切时间范围、拖缩放；点数据点固定详情。</li>
    <li>指标卡片：点任意一张，原地翻转看最近几次。</li>
    <li>「就诊准备」记看法、问题，导出 Markdown 带去门诊。</li>
    <li>右上「设置」换资料目录、开关云端解析；点版本号看关于。</li></ol>
    <p class="small-note">数据只存在你选的资料目录里；不联网（除非你允许 MinerU 解析）。没有演示数据时，点左上档案可载入模拟画像。</p>`,
  btn('开始', 'close', 'primary'))
}

function trialDetailModal() {
  openModal('研究条目详情 · 虚构示例', `<div class="notice">条目 A 只用于交互设计，不是真实研究，不含可用登记号或研究中心。</div>
    <div class="row"><div><b>研究状态</b><p>未接入真实信息</p></div></div>
    <div class="row"><div><b>登记来源</b><p>未来需保留原始 URL 与更新日期</p></div></div>
    <div class="row"><div><b>参与条件</b><p>由登记原文及研究中心核实</p></div></div>
    <div class="row"><div><b>你的材料</b><p>${(S.data.documents?.counts?.total ?? 0)} 份材料，${(S.data.documents?.counts?.parsed ?? 0)} 份已解析</p></div></div>`,
  `${btn('返回', 'close')}${go('查看资料对照', 'clinical', '资料对照', 'primary')}`)
}

function agentPreviewModal() {
  const o = S.data.overview
  openModal('交给原生 Agent 之前', `<div class="notice">这一版没有接入 DSH、AI 或任何外部服务。下面只预览内容，不会发送。</div>
    <h3>拟定任务</h3><p>请根据本次选择的资料，帮助整理需要进一步核实的问题。</p>
    <details open><summary>本次内容范围</summary><ul style="font-size:12.5px;line-height:1.8">
      <li>当前业务页面：${esc(PAGES.find((p) => p[0] === S.page)?.[1] ?? '')}</li>
      <li>材料 ${o?.documents?.total ?? 0} 份（${o?.documents?.parsed ?? 0} 份已解析）</li>
      <li>上肢测量 ${o?.arm?.count ?? 0} 次；指标 ${o?.metrics?.withData ?? 0} 项有记录</li>
      <li>心理、性健康与生育记录<b>不加入</b></li>
      <li>未核对内容保留草稿状态与来源</li></ul></details>
    <p class="small-note">一期 AI 只做整理与提问；解释性建议为二期开关，默认关闭。</p>`,
  `${btn('返回', 'close')}<button disabled>未接入，无法发送</button>`)
}

function privacyModal() {
  const mind = S.data.mind?.entries?.length ?? 0
  const privateViews = (S.data.viewpoints?.list ?? []).filter((v) => v.isPrivate).length
  openModal('隐私边界检查', `<div class="notice plain">导出只包含就诊准备里勾选的内容。以下是<b>不会</b>进入导出的记录：</div>
    <div class="row"><div><b>心理记录</b><p>默认私密，${mind} 条</p></div>${pill('不导出', 'green')}</div>
    <div class="row"><div><b>私密看法</b><p>${privateViews} 条</p></div>${pill('不导出', 'green')}</div>
    <div class="row"><div><b>未勾选的问题与指标</b><p>${(S.data.questions?.list ?? []).filter((q) => !q.includeInExport).length} 个问题未选入</p></div>${pill('不导出', 'green')}</div>
    <div class="row"><div><b>未解析 / 解析失败的原件</b><p>只在资料库保留，不进摘要</p></div>${pill('不导出', 'green')}</div>`,
  btn('知道了', 'close', 'primary'))
}

function resourceInfoModal() {
  openModal('支持资源如何进入工作台', `<p>真实版本将按地区、服务范围、联系方式、获取日期及核实状态维护资源。</p>
    <p style="margin-top:12px">目前没有接入真人服务、在线监护或危机评估，也不做分级判断；此处只演示资源说明与返回路径。</p>`,
  btn('返回', 'close', 'primary'))
}

function settingsModal(tab = 'store', note = null, tone = 'ok') {
  const noteHtml = note
    ? `<div class="notice ${tone}" style="margin-top:12px">${tone === 'ok' ? '✓ ' : ''}${esc(note)}</div>`
    : ''
  openModal('设置', `<div class="cfg-tabs" role="tablist" aria-label="设置分区">${CFG_TABS.map(([id, label]) => `<button role="tab" aria-selected="${tab === id}" data-settings-tab="${id}">${label}</button>`).join('')}</div>
    ${noteHtml}
    <div style="margin-top:16px">${settingsBody(tab)}</div>`, btn('完成', 'close', 'primary'))
}

function profileModal() {
  openModal('档案与演示画像', profileBody(), btn('关闭', 'close', 'primary'))
}

/* ================= 动作 ================= */

/* ---------------- 目录浏览点选 ----------------
 * iframe 里拿不到系统原生目录选择器，走本机服务端的只读目录列表：
 * 服务端只列子目录名、不读文件内容；选择结果回填到 #ws-path。 */

async function renderDirView(path) {
  let data
  try {
    data = await api(`/api/fs/dirs${path ? `?path=${encodeURIComponent(path)}` : ''}`)
  } catch (error) {
    toast(error.message)
    return
  }
  const item = (label, target, cls = 'dir-item', ic = '📁') =>
    `<button type="button" class="${cls}" data-dirgo="${esc(target)}"><span>${ic ? `${ic} ` : ''}${esc(label)}</span><small>›</small></button>`
  openModal('选择资料目录（网页浏览）', `
    <div class="dir-crumb"><code>${esc(data.current)}</code></div>
    <div class="dir-shortcuts">
      ${item('家目录', data.shortcuts.home, 'dir-up', '🏠')}
      ${data.parent ? item('上一级', data.parent, 'dir-up', '←') : ''}
    </div>
    <div class="dir-list">
      ${data.entries.map((e) => item(e.name, e.path)).join('')}
      ${data.entries.length ? '' : '<p class="small-note" style="margin:8px 0">这一层没有子目录了。可以直接用当前目录。</p>'}
      ${data.truncated ? '<p class="small-note" style="margin:8px 0">子目录太多，只显示前 500 个；建议直接手输更深一层。</p>' : ''}
    </div>`,
    `<button type="button" class="primary" id="dir-pick">用这个目录</button>`)
  $('#dialog-body').querySelectorAll('[data-dirgo]').forEach((el) =>
    el.addEventListener('click', () => renderDirView(el.dataset.dirgo)))
  $('#dir-pick')?.addEventListener('click', () => {
    const input = $('#ws-path')
    if (input) input.value = data.current
    closeModal()
    toast(`已选择：${data.current}`)
  })
}

/* ---------- 多档案与资料初始化 ---------- */

const intakeState = { view: 'list', tree: null, selected: new Set(), parsing: null, lastResults: null }
function resetIntakeState() {
  intakeState.view = 'list'
  intakeState.tree = null
  intakeState.selected = new Set()
  intakeState.parsing = null
  intakeState.lastResults = null
}

function newSubjectModal() {
  // 第一个档案默认填「我的」；后续新建给家人才留空。用户仍可改。
  const defaultName = (S.state?.subjects?.length ?? 0) === 0 ? '我的' : ''
  openModal('新建档案', `
    <div class="notice plain">同一个资料库里可以放多位家人的档案；切换档案只换当前查看的人，不改数据。</div>
    <div class="form-grid" style="margin-top:14px">
      <label class="field"><span class="form-label">姓名（必填）</span><input id="ns-name" maxlength="40" value="${esc(defaultName)}" placeholder="例如：我的 / 张阿姨" autofocus></label>
      <label class="field"><span class="form-label">使用者身份（必填）</span>
        <select id="ns-role"><option value="">请选择</option><option value="patient">患者本人</option><option value="caregiver">家属 / 照护者</option></select>
      </label>
      <label class="field"><span class="form-label">出生年份（可选）</span><input id="ns-birth" inputmode="numeric" maxlength="4" placeholder="1958"></label>
      <label class="field"><span class="form-label">患侧（可选）</span>
        <select id="ns-laterality"><option value="unknown">未声明</option><option value="left">左</option><option value="right">右</option><option value="bilateral">双侧</option></select>
      </label>
    </div>
    <p class="small-note" style="margin-top:10px">创建后会切到这个档案，并引导你创建资料目录、放病历、导入。</p>`,
    `${btn('取消', 'close', 'soft')}${btn('创建并继续', 'create-subject', 'primary')}`)
}

const LOCAL_TEXT_RE = /\.(txt|md|markdown|csv)$/i
const isLocalDoc = (doc) => LOCAL_TEXT_RE.test(doc.filename ?? '') || String(doc.mime ?? '').startsWith('text/')
const mineruReady = () => Boolean(S.state?.settings?.mineruConsent && S.state?.settings?.mineru?.configured)
const unparsedDocs = () => (S.data.documents?.list ?? []).filter((doc) => doc.reviewState === 'unparsed')

function listIntakeBody() {
  const tree = intakeState.tree
  const docs = S.data.documents?.list ?? []
  const subject = S.state?.subject
  const max = S.state?.intake?.maxUploadBatch ?? 3
  const categories = tree?.categories ?? (S.state?.intake?.categories ?? []).map((c) => ({ ...c, files: [], count: 0 }))

  const filesHtml = categories.map((category) => {
    const files = category.files ?? []
    return `<div class="intake-cat">
      <div class="intake-cat-head"><b>${esc(category.label ?? category.dir)}</b><span>${esc(category.hint ?? '')}</span></div>
      ${files.length ? files.map((file) => `<label class="intake-file">
        <input type="checkbox" data-intake-select="${esc(file.relPath)}" ${intakeState.selected.has(file.relPath) ? 'checked' : ''} ${!file.supported || file.duplicate ? 'disabled' : ''}>
        <span class="name">${esc(file.name)}</span>
        ${!file.supported ? '<span class="tag bad">不支持</span>' : file.duplicate ? '<span class="tag">已导入过</span>' : '<span class="tag ok">可导入</span>'}
      </label>`).join('') : '<p class="small-note" style="margin-top:5px">这个目录里还没有文件</p>'}
    </div>`
  }).join('')

  const parsing = intakeState.parsing
  const last = intakeState.lastResults
  const resultFor = (id) => parsing?.items?.find((item) => item.id === id) ?? last?.items?.find((item) => item.id === id) ?? null

  const docsHtml = docs.length ? docs.map((doc) => {
    const item = resultFor(doc.id)
    const current = parsing?.currentId === doc.id
    const stateLabel = current ? '解析中…'
      : item ? (item.ok ? (item.inserted ? `解析成功 · ${item.inserted} 项待核对` : '解析成功 · 没有抽到候选') : '解析失败')
        : doc.reviewState === 'unparsed' ? '待解析'
          : doc.reviewState === 'pending' ? `待核对 ${doc.pendingCandidates} 项`
            : doc.reviewState === 'reviewed' ? '已核对' : '解析失败'
    const tagClass = current ? '' : item ? (item.ok ? 'ok' : 'bad') : doc.reviewState === 'parse_failed' ? 'bad' : doc.reviewState === 'unparsed' ? '' : 'ok'
    const tagText = current ? '解析中' : item ? (item.ok ? '成功' : '失败') : doc.reviewState === 'unparsed' ? '待解析' : doc.reviewState === 'pending' ? '待核对' : doc.reviewState === 'reviewed' ? '已核对' : '失败'
    return `<div class="intake-doc">
      <div><b>${esc(doc.filename)}</b><span>${esc(kindLabel(doc.kind))} · ${stateLabel}</span></div>
      <span class="tag ${tagClass}">${tagText}</span>
    </div>`
  }).join('') : '<p class="small-note" style="margin-top:6px">还没有导入资料。</p>'

  const unparsed = docs.filter((doc) => doc.reviewState === 'unparsed').length
  const pending = docs.filter((doc) => doc.reviewState === 'pending').length

  const lastHtml = last ? `<div class="intake-last"><span>上次解析：成功 ${last.ok} 份，失败 ${last.failed} 份</span>${btn('查看结果', 'intake-show-result', 'text-button')}</div>` : ''

  return `
    <p class="intake-step">档案：${esc(subject?.displayName ?? '')} · ${esc(subject?.roleLabel ?? '')}</p>
    <div class="intake-path">${esc(S.state?.dir ?? '')}</div>
    <div class="notice plain" style="margin-top:10px">把病历文件放进对应分类目录，或直接上传（单次最多 ${max} 个）。不需要压缩、不需要改名。</div>
    <div class="intake-actions">
      ${btn(tree ? '重新建 / 补齐目录' : '一键创建分类目录', 'intake-prepare', 'soft')}
      ${btn('打开文件夹', 'intake-open-folder', 'soft')}
      ${btn('检查我放进去的文件', 'intake-scan', 'primary')}
      ${btn('直接上传文件', 'intake-upload', 'soft')}
    </div>
    <input type="file" id="intake-file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.txt,.md,.csv,.xls,.xlsx" style="display:none">
    ${tree ? `<div class="intake-tree">${filesHtml}</div>
      <div class="intake-actions">${btn(`导入勾选的文件（${intakeState.selected.size}）`, 'intake-import', 'primary')}</div>` : ''}
    <div class="divider"></div>
    <p class="intake-step">已导入的资料（${docs.length}）</p>
    ${lastHtml}
    ${docsHtml}
    ${docs.length ? `<div class="intake-actions">
      ${unparsed ? btn(parsing ? '正在解析…' : `开始解析（${unparsed} 份）`, 'intake-parse-all', 'primary', parsing ? 'disabled' : '') : ''}
      ${pending ? btn(`去核对（${pending} 份待核对）`, 'intake-review', 'soft') : ''}
    </div>` : ''}
    <p class="small-note" style="margin-top:10px">解析优先在本机做文本抽取；扫描件/图片需要 MinerU 时，会先问你是否允许上传云端。解析失败的原件会保留，可重试或手动补录。</p>`
}

/* 资料初始化的三个单一主题视图：确认解析 / 解析中 / 解析结果。
 * 不另开窗口：同一个 dialog 内切换 view，返回和“去核对”不会叠两层弹窗。 */

function confirmIntakeBody(docs) {
  const local = docs.filter(isLocalDoc)
  const remote = docs.filter((doc) => !isLocalDoc(doc))
  const ready = mineruReady()
  return `
    <p class="intake-step">确认解析</p>
    <div class="intake-confirm">
      <p>将解析 <b>${docs.length}</b> 份资料：</p>
      <ul>
        <li>本机文本抽取：<b>${local.length}</b> 份（快，不上传）</li>
        <li>MinerU 云端解析：<b>${remote.length}</b> 份（扫描件/图片/Office，可能较慢）</li>
      </ul>
      ${remote.length && !ready ? '<div class="notice warn">MinerU 还没配置或未授权，这些资料会解析失败。可以先只解析本机文本，或去设置里启用。</div>' : ''}
      <p class="small-note">解析只读原件，不改文件；失败的原件会保留，可重试或手动补录。</p>
    </div>
    <div class="intake-actions">
      ${btn('返回资料列表', 'intake-back', 'soft')}
      ${local.length ? btn(`只解析本机文本（${local.length} 份）`, 'intake-parse-local', 'soft') : ''}
      ${btn(`开始解析（${docs.length} 份）`, 'intake-parse-confirm', 'primary')}
      ${remote.length && !ready ? btn('去设置 MinerU', 'intake-open-mineru', 'soft') : ''}
    </div>`
}

function parsingIntakeBody() {
  const parsing = intakeState.parsing
  if (!parsing) return listIntakeBody()
  const pct = Math.round((parsing.done / Math.max(1, parsing.total)) * 100)
  return `
    <p class="intake-step">正在解析</p>
    <div class="intake-progress">
      <div class="intake-progress-head"><b>${Math.min(parsing.done + 1, parsing.total)}/${parsing.total}</b><span>${esc(parsing.current || '准备中…')}</span></div>
      <div class="intake-bar"><i style="width:${pct}%"></i></div>
      <p class="small-note">本机文本通常几秒；扫描件/图片走 MinerU 时可能需要十几秒到几分钟。可以先返回列表，解析会在后台继续。</p>
    </div>
    <div class="intake-actions">${btn('返回资料列表', 'intake-back', 'soft')}</div>`
}

function resultIntakeBody() {
  const last = intakeState.lastResults
  if (!last) return listIntakeBody()
  const needsMineru = Boolean(last.items.some((item) => !item.ok && ['CONSENT_REQUIRED', 'NO_TOKEN'].includes(item.code)))
  return `
    <p class="intake-step">解析结果</p>
    <div class="intake-result">
      <div class="intake-progress-head"><b>成功 ${last.ok} 份，失败 ${last.failed} 份</b>${last.failed ? btn('重试失败项', 'intake-retry-failed', 'soft') : ''}</div>
      ${last.items.map((item) => `<div class="intake-result-item">
        <span class="${item.ok ? 'ok' : 'bad'}">${item.ok ? '✓' : '✕'}</span>
        <span class="name">${esc(item.filename)}</span>
        <span class="reason">${item.ok ? (item.inserted ? `${item.inserted} 项待核对` : '没有抽到候选，可手动补录') : esc(item.error)}</span>
      </div>`).join('')}
      ${needsMineru ? `<div class="intake-actions">${btn('去设置 MinerU', 'intake-open-mineru', 'soft')}</div>` : ''}
    </div>`
}

function intakeBody() {
  const view = intakeState.view ?? 'list'
  if (view === 'confirm') return confirmIntakeBody(unparsedDocs())
  if (view === 'parsing') return parsingIntakeBody()
  if (view === 'result') return resultIntakeBody()
  return listIntakeBody()
}

function intakeModal() {
  const view = intakeState.view ?? 'list'
  let foot = `${btn('关闭', 'close', 'soft')}${btn('去核对', 'intake-review', 'primary')}`
  if (view === 'confirm') foot = ''
  else if (view === 'parsing') foot = btn('关闭', 'close', 'soft')
  else if (view === 'result') foot = `${btn('返回资料列表', 'intake-back', 'soft')}${btn('去核对', 'intake-review', 'primary')}`
  openModal('资料初始化', intakeBody(), foot)
  $('#dialog-body')?.querySelectorAll('[data-intake-select]').forEach((el) => {
    el.checked = intakeState.selected.has(el.dataset.intakeSelect)
  })
}

/**
 * 逐份解析：每份开始/结束都刷新弹窗，让用户看到“正在解析第几份、成功几份、失败几份”。
 * 不在循环里 refresh 全量读模型（15 个接口 × 每份），只在最后刷一次。
 */
async function parseIntakeDocuments(docs) {
  if (intakeState.parsing) return
  intakeState.lastResults = null
  intakeState.view = 'parsing'
  intakeState.parsing = { total: docs.length, done: 0, current: '', currentId: null, items: [] }
  const paint = () => { if ($('#dialog')?.open) intakeModal() }
  paint()
  for (const doc of docs) {
    intakeState.parsing.current = doc.filename
    intakeState.parsing.currentId = doc.id
    paint()
    try {
      const result = await api(`/api/documents/${doc.id}/parse`, { method: 'POST', body: {} })
      intakeState.parsing.items.push({
        id: doc.id,
        filename: doc.filename,
        ok: true,
        inserted: result.inserted ?? 0,
        warnings: result.warnings ?? [],
        engine: result.engine ?? null,
      })
    } catch (error) {
      intakeState.parsing.items.push({
        id: doc.id,
        filename: doc.filename,
        ok: false,
        error: error.message,
        code: error.code ?? null,
      })
    }
    intakeState.parsing.done += 1
    paint()
  }
  const items = intakeState.parsing.items
  const wasParsingView = intakeState.view === 'parsing'
  intakeState.parsing = null
  intakeState.lastResults = {
    items,
    ok: items.filter((item) => item.ok).length,
    failed: items.filter((item) => !item.ok).length,
  }
  // 用户中途返回列表时不强行把他拽回结果页；列表会留一个“查看结果”入口。
  intakeState.view = wasParsingView ? 'result' : 'list'
  await refresh()
  rerender()
  if ($('#dialog')?.open) intakeModal()
  const { ok, failed } = intakeState.lastResults
  toast(`解析完成：成功 ${ok} 份${failed ? `，失败 ${failed} 份（原因见弹窗）` : ''}`)
}

const actions = {
  // 原生目录选择器：macOS choose folder 对话框；不支持或失败时退回网页浏览。
  'pick-native': async () => {
    let result = null
    try {
      result = await api('/api/fs/pick', { method: 'POST' })
    } catch {
      void renderDirView(inputValue('#ws-path').trim())
      return
    }
    if (result?.picked) {
      const input = $('#ws-path')
      if (input) input.value = result.picked
      toast(`已选择：${result.picked}`)
    } // canceled：用户关掉了对话框，不打扰
  },
  'browse-dirs': () => { void renderDirView(inputValue('#ws-path').trim()) },
  go: (el) => navigate(el.dataset.page, el.dataset.sub),
  sub: (el) => { S.sub[S.page] = el.dataset.sub; rerender() },
  close: closeModal,

  // 「与 Agent 讨论」：先把这一页的记录整理成草稿并预览，用户确认后才填进会话输入框。
  // 一图秀带上当前勾选的指标（最多 4 个），其余页面由服务端按范围取。
  'discuss-agent': (el) => discussWithAgent({
    scope: el.dataset.scope,
    codes: el.dataset.scope === 'timeline' ? S.sel : [],
  }),

  settings: () => settingsModal('store'),
  // 解析失败卡片上的「去填 Token」：直接落在 MinerU 那一页，不用用户自己找 tab。
  'open-mineru-settings': () => settingsModal('parse'),

  'save-mineru-token': async () => {
    const token = inputValue('#mineru-token').trim()
    if (!token) return settingsModal('parse', '先粘贴 Token', 'warn')
    try {
      const result = await api('/api/settings/mineru-token', { method: 'POST', body: { token } })
      if (S.state) S.state.settings = result.settings
      await refresh()
      rerender()
      settingsModal('parse', 'Token 已保存；下一次解析立即使用')
    } catch (error) {
      // 失败也放在弹窗顶部：页面级 toast 会被原生 dialog 的 top layer 盖住。
      settingsModal('parse', `保存失败：${error.message}`, 'warn')
    }
  },

  'clear-mineru-token': () => {
    openModal('清除本机 Token',
      '<p>清除后，如果环境变量和随包公益 Key 也没有，扫描件/图片会解析失败；原件不会丢，可随时重新填。</p>',
      `${btn('取消', 'close', 'soft')}${btn('确认清除', 'confirm-clear-mineru-token', 'primary')}`)
  },

  'confirm-clear-mineru-token': async () => {
    try {
      const result = await api('/api/settings/mineru-token', { method: 'POST', body: { clear: true } })
      if (S.state) S.state.settings = result.settings
      await refresh()
      rerender()
      settingsModal('parse', '已清除本机 Token；当前回落到环境变量或随包公益 Key')
    } catch (error) {
      settingsModal('parse', `清除失败：${error.message}`, 'warn')
    }
  },

  about: () => settingsModal('about'),
  help: helpModal,
  session: sessionModal,
  profile: profileModal,
  'switch-profile': profileModal,

  // 一键建默认资料目录：不需要用户懂路径、压缩或模板。
  'prepare-default': async () => {
    toast('正在创建默认资料目录…')
    const result = await guarded(() => api('/api/intake/prepare', { method: 'POST', body: {} }))
    if (!result) return
    resetBoot()
    await boot()
    rerender()
    toast(result.created ? '资料目录已创建' : '资料目录已就绪')
    if (!S.state?.subject) newSubjectModal()
  },

  'new-subject': () => { resetIntakeState(); newSubjectModal() },

  'create-subject': async () => {
    const displayName = inputValue('#ns-name').trim()
    const role = inputValue('#ns-role')
    if (!displayName) return toast('请填写姓名')
    if (!role) return toast('请选择使用者身份：患者本人或家属')
    const birthYear = inputValue('#ns-birth').trim()
    if (birthYear && !/^\d{4}$/.test(birthYear)) return toast('出生年份写 4 位数字，或留空')
    const result = await guarded(() => api('/api/subjects', {
      method: 'POST',
      body: {
        displayName,
        role,
        birthYear: birthYear || null,
        laterality: inputValue('#ns-laterality') || 'unknown',
      },
    }))
    if (!result) return
    resetBoot()
    await boot()
    resetIntakeState()
    closeModal()
    rerender()
    toast(`已创建「${displayName}」的档案`)
    intakeModal()
  },

  'intake-open': () => intakeModal(),

  'intake-prepare': async () => {
    const result = await guarded(() => api('/api/intake/prepare', { method: 'POST', body: {} }))
    if (!result) return
    intakeState.tree = result.tree
    intakeModal()
    toast('分类目录已创建')
  },

  'intake-open-folder': async () => {
    try {
      await api('/api/intake/open-folder', { method: 'POST', body: {} })
      toast('已打开资料文件夹')
    } catch (error) {
      toast(error.message)
    }
  },

  'intake-scan': async () => {
    const result = await guarded(() => api('/api/intake/scan', { method: 'POST', body: {} }))
    if (!result) return
    intakeState.tree = result
    intakeState.selected = new Set()
    for (const category of result.categories) {
      for (const file of category.files) {
        if (file.supported && !file.duplicate) intakeState.selected.add(file.relPath)
      }
    }
    intakeModal()
    toast(result.total ? `找到 ${result.supported} 个可导入文件` : '目录里还没有文件')
  },

  'intake-import': async () => {
    const files = [...intakeState.selected].map((relPath) => ({ relPath }))
    if (!files.length) return toast('先勾选要导入的文件')
    const result = await guarded(() => api('/api/intake/import', { method: 'POST', body: { files } }))
    if (!result) return
    resetIntakeState()
    intakeModal()
    toast(`已导入 ${result.imported} 份${result.duplicates ? `，跳过重复 ${result.duplicates} 份` : ''}${result.failed ? `，失败 ${result.failed} 份` : ''}`)
  },

  'intake-upload': () => { $('#intake-file')?.click() },

  'intake-parse-all': () => {
    const docs = unparsedDocs()
    if (!docs.length) return toast('没有待解析的资料')
    // 先给一份“本机几份 / MinerU 几份”的确认，不直接开跑。
    intakeState.view = 'confirm'
    intakeModal()
  },

  'intake-parse-confirm': async () => {
    const docs = unparsedDocs()
    if (!docs.length) return toast('没有待解析的资料')
    await parseIntakeDocuments(docs)
  },

  'intake-parse-local': async () => {
    const docs = unparsedDocs().filter(isLocalDoc)
    if (!docs.length) return toast('没有可本机解析的文本资料')
    await parseIntakeDocuments(docs)
  },

  'intake-back': () => {
    intakeState.view = 'list'
    intakeModal()
  },

  'intake-show-result': () => {
    intakeState.view = 'result'
    intakeModal()
  },

  'intake-retry-failed': async () => {
    const failedIds = new Set((intakeState.lastResults?.items ?? []).filter((item) => !item.ok).map((item) => item.id))
    const docs = (S.data.documents?.list ?? []).filter((doc) => failedIds.has(doc.id))
    if (!docs.length) return toast('没有需要重试的资料')
    await parseIntakeDocuments(docs)
  },

  'intake-open-mineru': () => {
    closeModal()
    settingsModal('parse')
  },

  'intake-review': () => {
    closeModal()
    navigate('records', '整理草稿 / 核对')
  },

  'load-demo-showcase': async () => {
    toast('正在加载完整示例…')
    const result = await guarded(() => api('/api/demo/seed', { method: 'POST', body: { id: 'DEMO-1', activate: true } }))
    if (!result) return
    resetBoot()
    await boot()
    S.page = 'timeline'
    S.sub.timeline = ''
    S.pin = null
    S.sel = []
    navigate('timeline')
    toast('已加载完整示例；现在可以查看病情一图秀')
  },

  'use-subject': async (el) => {
    const id = el.dataset.id
    const result = await guarded(() => api('/api/active-subject', { method: 'POST', body: { subjectId: id } }))
    if (result) {
      resetBoot()
      await boot()
      resetIntakeState()
      closeModal()
      rerender()
      toast('已切换档案')
    }
  },

  'seed-demo': async (el) => {
    const id = el.dataset.id
    closeModal()
    toast(`正在载入 ${id}…`)
    const result = await guarded(() => api('/api/demo/seed', { method: 'POST', body: { id } }))
    if (result) {
      resetBoot()
      await boot()
      rerender()
      toast(`已载入 ${id}（模拟数据）`)
    }
  },

  'clear-demo': async (el) => {
    const id = el.dataset.id
    const result = await guarded(() => api('/api/demo/clear', { method: 'POST', body: { id } }), `已清理 ${id}`)
    if (result) {
      resetBoot()
      await boot()
      closeModal()
      rerender()
    }
  },

  'stage-pick': stageModal,
  'stage-help': stageHelpModal,
  'stage-set': async (el) => {
    const result = await guarded(() => api('/api/stage', { method: 'POST', body: { stage: el.dataset.code } }))
    if (result) {
      closeModal()
      toast(`阶段已改为「${result.stage.label}」；话题随之变化，记录一条没动`)
    }
  },

  'add-task': taskModal,
  'task-toggle': async (el) => {
    const result = await api(`/api/tasks/${el.dataset.id}/toggle`, { method: 'POST' })
    await refresh()
    rerender()
    toast(result.task.status === 'done' ? '安排已完成；不会生成治疗记录' : '已重新打开安排')
  },

  'add-question': () => questionModal('fact'),
  'add-viewpoint': () => viewpointModal('patient'),
  'add-viewpoint-caregiver': () => viewpointModal('caregiver'),

  // 随访节奏（G2）：节点只转成「问题」或「我自己的待办」，**不排计划、不发提醒**。
  'followup-question': async () => {
    const fu = S.data.metrics?.followup
    const cp = fu?.plan?.checkpoints
    const next = cp?.next?.date
    const prev = cp?.previous?.date
    if (!next) return toast('还没有手术日期，先补一条手术记录')
    const text = `按 CBCS 2025 表 9.5 的间隔（${fu.plan.phaseLabel}每 ${fu.plan.intervalMonths} 个月），我的参考节点是 ${longDate(prev ?? fu.surgery.date)} 与 ${longDate(next)}；我实际的复查安排在什么时候、需要提前做哪些检查？`
    await guarded(() => api('/api/questions', { method: 'POST', body: { text, kind: 'fact' } }), '已加入问题清单')
    closeModal()
  },
  'followup-task': async () => {
    const fu = S.data.metrics?.followup
    const next = fu?.plan?.checkpoints?.next?.date
    if (!next) return toast('还没有手术日期，先补一条手术记录')
    await guarded(() => api('/api/tasks', {
      method: 'POST',
      body: { title: `问一下下次复查安排（参考节点 ${next}）`, dueOn: null, kind: 'self', detail: '我自己记的待办，不是工作台的提醒' },
    }), '已加一条待办')
  },

  'save-question': async (el) => {
    const id = el.dataset.id
    const text = $(`[data-q-edit="${id}"]`)?.value ?? ''
    await guarded(() => api(`/api/questions/${id}`, { method: 'POST', body: { text } }), '问题已保存为新一版')
  },
  'delete-question': async (el) => {
    await guarded(() => api(`/api/questions/${el.dataset.id}`, { method: 'POST', body: { status: 'dropped' } }), '已删除这个问题')
  },
  'gen-arm-question': async () => {
    const arm = S.data.arm
    if (!arm?.latest) return toast('还没有上肢测量记录')
    await guarded(() => api('/api/questions', {
      method: 'POST',
      body: { text: `患健侧臂围差 ${fmtNum(arm.latest.maxDiff, 1)}cm（${longDate(arm.latest.measuredOn)}，四点位最大），需要做哪些评估？`, kind: 'fact' },
    }), '已从臂围趋势生成一条问题')
    closeModal()
  },
  'gen-joint-question': async () => {
    const s = (S.data.symptoms?.list ?? []).find((x) => x.code === 'joint_pain')
    await guarded(() => api('/api/questions', {
      method: 'POST',
      body: { text: s ? `${longDate(s.occurredOn)} 记录关节痛强度 ${s.level}/3，需要做哪些评估？` : '内分泌治疗期间关节痛，需要做哪些评估？', kind: 'fact' },
    }), '已生成一条问题')
    closeModal()
  },
  'add-trial-question': async () => {
    await guarded(() => api('/api/questions', {
      method: 'POST',
      body: { text: '向研究中心询问：还需要提供哪些资料来核实参与条件？', kind: 'fact' },
    }), '已加入问题清单')
  },
  'nutrition-question': async () => {
    await guarded(() => api('/api/questions', {
      method: 'POST',
      body: { text: '最近进食变化，我需要向医生或营养师说明哪些情况？', kind: 'fact' },
    }), '已加入问题清单')
  },
  'support-question': async () => {
    await guarded(() => api('/api/questions', {
      method: 'POST',
      body: { text: '我希望和专业人员谈谈最近的感受，可以怎样获得合适的支持？', kind: 'fact' },
    }), '已加入问题清单（不含私密记录）')
  },
  'topic-question': async (el) => {
    await guarded(() => api('/api/questions', {
      method: 'POST',
      body: { text: `关于${el.dataset.topic}，我希望询问有哪些适合进一步讨论的支持方式。`, kind: 'fact' },
    }), '已加入问题清单')
  },
  'private-question': async (el) => {
    await guarded(() => api('/api/questions', {
      method: 'POST',
      body: { text: `关于${el.dataset.topic}，我想单独和医生讨论，可以怎样安排？`, kind: 'fact' },
    }), '已加入问题清单（只含这句问题，不含记录内容）')
  },

  'add-symptom': symptomModal,
  'add-arm': armModal,
  'add-drain': drainModal,
  'add-observation': observationModal,
  'add-treatment': treatmentModal,
  'add-advice': adviceModal,

  'import-doc': async () => {
    const input = $('#doc-file')
    const file = input?.files?.[0]
    if (!file) return toast('先选一个文件')
    const kind = inputValue('#doc-kind') || guessKind(file.name)
    const reportDate = inputValue('#doc-date') || null
    const consent = Boolean($('#doc-consent')?.checked)
    if (consent) await api('/api/settings', { method: 'POST', body: { mineruConsent: true } })
    S.busy['import'] = true
    rerender()
    const result = await guarded(() => uploadDocument(file, { kind, reportDate }))
    delete S.busy['import']
    if (result) {
      const doc = result.document
      toast(result.duplicate
        ? `这份文件已经导入过（同一 SHA-256），没有重复新增；首次导入于 ${longDate(result.importedAt?.slice(0, 10))}`
        : `已导入「${doc?.filename ?? file.name}」；${isTextFile(file.name) ? 'TXT / MD 可以在本机直接解析' : '需要解析时点「解析」'}`)
      resetBoot()
      await boot()
      rerender()
    } else {
      rerender()
    }
  },

  'parse-doc': async (el) => {
    const id = el.dataset.id
    S.busy[`parse:${id}`] = true
    rerender()
    let result = null
    let failure = null
    try {
      result = await api(`/api/documents/${id}/parse`, { method: 'POST', body: { strategy: 'auto' } })
    } catch (error) {
      // 原始错误码与报文留给失败卡片（排查用），toast 只给人话结论
      failure = parseFault(error.code, error.message)
      if (!['NO_WORKSPACE'].includes(error.code)) console.warn('[parse]', error)
    }
    delete S.busy[`parse:${id}`]
    if (result) {
      const model = result.modelVersion ? `（${result.modelVersion}）` : ''
      toast(result.inserted > 0
        ? `解析完成${model}：新增 ${result.inserted} 项待核对${result.pages ? ` · ${result.pages} 页` : ''}`
        : `解析完成${model}，但没认出这份材料里的指标；原件已保存，可手工录入`)
      navigate('records', '整理草稿 / 核对')
    } else if (failure) {
      toast(failure.title)
      await refresh()
      rerender()
    } else {
      rerender()
    }
  },

  'doc-text': async (el) => {
    const result = await guarded(() => api(`/api/documents/${el.dataset.id}/text?source=original`))
    if (!result) return
    openModal(`原文 · ${result.filename}`, result.available
      ? `${codeBlock(result.text || '（这份文本是空的）')}<p class="small-note">这是原件本身的文本，没有经过改写。</p>`
      : `<div class="notice">${esc(result.reason)}</div><p class="small-note">原件位置（相对资料目录）：<code>${esc(result.storagePath)}</code></p>`,
    btn('关闭', 'close', 'primary'))
  },

  'doc-parsed-text': async (el) => {
    const id = el.dataset.id
    const result = await guarded(() => api(`/api/documents/${id}/text?source=parsed`))
    if (!result) return
    if (result.available) {
      openModal(`解析文本 · ${result.filename}`,
        `${codeBlock(result.text || '（解析结果为空）')}<p class="small-note">这是 MinerU / 本机解析出的文本，仅供核对，不是诊断意见。</p>`,
        btn('关闭', 'close', 'primary'))
      return
    }
    openModal(`解析文本 · ${result.filename}`,
      `<div class="notice warn">${esc(result.reason)}</div><p class="small-note">重新解析会重新调用 MinerU（或本机文本抽取），并把识别文本保存到本机，之后就能查看。</p>`,
      `${btn('重新解析', 'doc-reparse', 'primary', `data-id="${id}"`)}${btn('关闭', 'close', 'soft')}`)
  },

  'doc-reparse': async (el) => {
    const id = el.dataset.id
    closeModal()
    S.busy[`parse:${id}`] = true
    rerender()
    try {
      await api(`/api/documents/${id}/parse`, { method: 'POST', body: { force: true } })
      await refresh()
      rerender()
      toast('重新解析完成；现在可以查看解析文本')
    } catch (error) {
      toast(`重新解析失败：${error.message}`)
    } finally {
      S.busy[`parse:${id}`] = false
      rerender()
    }
  },

  'cand-accept': async (el) => {
    const id = el.dataset.id
    const occurredOn = $(`[data-cand-date="${id}"]`)?.value || null
    await guarded(() => api(`/api/candidates/${id}/decide`, { method: 'POST', body: { action: 'accept', occurredOn } }), '已接受这一项；核对不等于医学审核')
  },
  'cand-review': async (el) => {
    await guarded(() => api(`/api/candidates/${el.dataset.id}/decide`, { method: 'POST', body: { action: 'needs_review' } }), '已标为需要确认，稍后可以再处理')
  },
  'cand-reject': async (el) => {
    await guarded(() => api(`/api/candidates/${el.dataset.id}/decide`, { method: 'POST', body: { action: 'reject' } }), '已拒绝这一项，不会写入档案')
  },
  'cand-edit': (el) => candidateEditModal(el.dataset.id),

  'accept-all': async (el) => {
    const id = el.dataset.id
    const occurredOn = $(`[data-draft-date="${id}"]`)?.value || null
    if (!occurredOn) return toast('先填一个发生日期；没有日期不猜')
    S.busy[`accept-all:${id}`] = true
    rerender()
    const result = await guarded(() => api(`/api/documents/${id}/accept-all`, { method: 'POST', body: { occurredOn } }))
    delete S.busy[`accept-all:${id}`]
    if (result) {
      toast(`已接受 ${result.accepted.length} 项${result.skipped.length ? `；${result.skipped.length} 项留待逐条处理` : ''}`)
      rerender()
    } else {
      rerender()
    }
  },

  export: async () => {
    const body = {
      questionIds: [...S.selQuestions],
      metricCodes: [...S.selMetrics],
      viewpointIds: [...S.selViews],
      includeArm: true,
      includeTreatments: true,
      includeDocuments: true,
    }
    const result = await guarded(() => api('/api/export', { method: 'POST', body }))
    if (!result) return
    lastExport = result
    openModal('导出预览', `<div class="notice">这次只包含你在「就诊准备」里勾选的内容：${result.counts.questions} 个问题、${result.counts.viewpoints} 条看法、${result.counts.metrics} 个指标。私密记录不在里面。</div>
      ${codeBlock(result.markdown.slice(0, 6000))}
      <p class="small-note">预览截断到 6000 字；下载的是完整文件。</p>`,
    `${btn('关闭', 'close')}${btn('下载 Markdown', 'download-export', 'primary')}`)
  },
  'download-export': () => {
    if (!lastExport) return
    downloadText(lastExport.filename, lastExport.markdown)
    toast('已生成 Markdown 文件')
    closeModal()
  },
  'privacy-check': privacyModal,
  'agent-preview': agentPreviewModal,
  'trial-detail': trialDetailModal,
  'resource-info': resourceInfoModal,

  pin: (el) => {
    const code = el.dataset.code
    const date = el.dataset.date
    S.pin = S.pin && S.pin.code === code && S.pin.date === date ? null : { code, date }
    $$('#timeline-svg .pt').forEach((c) => {
      c.classList.toggle('active', Boolean(S.pin) && c.dataset.code === S.pin.code && c.dataset.date === S.pin.date)
    })
    const slot = $('#pin-slot')
    if (slot) slot.innerHTML = pinHTML()
  },
  unpin: () => {
    S.pin = null
    $$('#timeline-svg .pt').forEach((c) => c.classList.remove('active'))
    const slot = $('#pin-slot')
    if (slot) slot.innerHTML = pinHTML()
  },
  'pin-source': () => {
    if (!S.pin) return
    const series = (S.data.metrics?.series ?? []).find((s) => s.code === S.pin.code)
    const point = series?.points?.find((p) => p.date === S.pin.date)
    if (!point) return
    openModal('这次记录的来源', `<div class="row"><div><b>${esc(series.name)} ${fmtNum(point.value, series.dec)} ${esc(unitText(series.unit))}</b><p>${longDate(point.date)} · ${esc(point.source)}</p></div></div>
      <div class="row"><div><b>方法</b><p>${esc(point.method ?? '未记录方法')}</p></div></div>
      <div class="row"><div><b>说明</b><p>${esc(series.note ?? '没有额外说明')}</p></div></div>
      <p class="small-note">记录本身不是诊断；不同方法的数值不连成一条线。</p>`, btn('关闭', 'close', 'primary'))
  },

  flip: (el) => {
    const code = el.dataset.code
    if (S.flipped.has(code)) S.flipped.delete(code)
    else S.flipped.add(code)
    el.setAttribute('aria-pressed', S.flipped.has(code) ? 'true' : 'false')
  },

  'toggle-consent': async (el) => {
    try {
      const result = await api('/api/settings', { method: 'POST', body: { mineruConsent: Boolean(el.checked) } })
      if (S.state && result.settings) S.state.settings = result.settings
      await refresh()
      rerender()
      // 反馈放在设置弹窗顶部：原生 dialog 在 top layer，页面级 toast 会被盖住。
      settingsModal('parse', el.checked ? '已开启 MinerU 云端解析；TXT / MD / CSV 仍走本机' : '已关闭；未勾选前不会上传文件')
    } catch (error) {
      settingsModal('parse', `设置失败：${error.message}`, 'warn')
    }
  },

  'set-workspace': async () => {
    const path = inputValue('#ws-path').trim()
    const create = $('#ws-create')?.checked !== false
    if (!path) return toast('先填一个完整路径')
    try {
      const result = await api('/api/workspace', { method: 'POST', body: { path, create } })
      resetBoot()
      await boot()
      rerender()
      toast(result.created ? '资料目录已创建并打开' : '已打开这个资料目录')
      if ($('#dialog')?.open) closeModal()
    } catch (error) {
      if (!S.ready) {
        $('#main').innerHTML = setupPage(error.message)
      } else {
        toast(error.message)
      }
    }
  },

  'save-subject': async () => {
    const displayName = inputValue('#subject-name').trim()
    const laterality = inputValue('#subject-side') || 'unknown'
    const result = await guarded(() => api('/api/subject', { method: 'POST', body: { displayName, laterality } }), '档案信息已保存')
    if (result) {
      resetBoot()
      await boot()
      settingsModal('store')
    }
  },

  'section': () => {},
}

/* ================= 事件 ================= */

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-settings-tab]')
  if (tab) { settingsModal(tab.dataset.settingsTab); return }
  const range = event.target.closest('[data-range]')
  if (range) {
    S.range = range.dataset.range
    S.pin = null
    $$('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === S.range)))
    updateChart()
    return
  }
  const toggle = event.target.closest('[data-toggle]')
  if (toggle) {
    const key = toggle.dataset.toggle
    S.toggles[key] = !S.toggles[key]
    toggle.setAttribute('aria-pressed', String(S.toggles[key]))
    S.pin = null
    updateChart()
    return
  }
  const stage = event.target.closest('[data-stage]')
  if (stage) {
    S.armStage = stage.dataset.stage
    rerender()
    return
  }
  const el = event.target.closest('[data-action]')
  if (!el) return
  const fn = actions[el.dataset.action]
  if (fn) {
    // 复选框/单选框的默认行为就是切换状态；在这里 preventDefault 会让它永远点不动。
    if (!el.matches('input[type="checkbox"], input[type="radio"]')) event.preventDefault()
    Promise.resolve(fn(el)).catch((error) => toast(error.message))
  }
})

document.addEventListener('change', (event) => {
  const el = event.target
  if (el.id === 'intake-file') {
    const files = [...(el.files ?? [])]
    if (!files.length) return
    const max = S.state?.intake?.maxUploadBatch ?? 3
    if (files.length > max) toast(`一次最多上传 ${max} 个文件；多的请放进资料目录`)
    void (async () => {
      let ok = 0
      let failed = 0
      for (const file of files.slice(0, max)) {
        try {
          await uploadDocument(file, { kind: guessKind(file.name) })
          ok += 1
        } catch (error) {
          failed += 1
          toast(`${file.name}：${error.message}`)
        }
      }
      el.value = ''
      await refresh()
      rerender()
      intakeModal()
      if (ok) toast(`已上传 ${ok} 个文件${failed ? `，失败 ${failed} 个` : ''}`)
    })()
    return
  }
  if (el.dataset.intakeSelect) {
    const relPath = el.dataset.intakeSelect
    if (el.checked) intakeState.selected.add(relPath)
    else intakeState.selected.delete(relPath)
    const importBtn = document.querySelector('[data-action="intake-import"]')
    if (importBtn) importBtn.textContent = `导入勾选的文件（${intakeState.selected.size}）`
    return
  }
  if (el.dataset.metric) {
    const code = el.dataset.metric
    if (el.checked) {
      if (S.sel.length >= 4) { el.checked = false; toast('最多同时看 4 个指标；先取消一个再加'); return }
      S.sel.push(code)
    } else {
      S.sel = S.sel.filter((c) => c !== code)
    }
    S.pin = null
    updateChart()
  }
  if (el.dataset.qSelect) {
    const id = el.dataset.qSelect
    if (el.checked) S.selQuestions.add(id)
    else S.selQuestions.delete(id)
    const item = el.closest('.q-item')
    if (item) item.classList.toggle('sel', el.checked)
  }
  if (el.dataset.exportQuestion) {
    if (el.checked) S.selQuestions.add(el.dataset.exportQuestion)
    else S.selQuestions.delete(el.dataset.exportQuestion)
  }
  if (el.dataset.exportMetric) {
    if (el.checked) S.selMetrics.add(el.dataset.exportMetric)
    else S.selMetrics.delete(el.dataset.exportMetric)
  }
  if (el.dataset.exportView) {
    if (el.checked) S.selViews.add(el.dataset.exportView)
    else S.selViews.delete(el.dataset.exportView)
  }
  if (el.dataset.candDate) {
    S.draftDates[el.dataset.candDate] = el.value
  }
})

document.addEventListener('input', (event) => {
  const el = event.target
  if (el.id === 'doc-search') {
    S.query = el.value
    const holder = $('#docs-table')
    if (holder) holder.innerHTML = documentsTableForClient()
  }
  if (el.id === 'zoom') {
    S.zoom = Number(el.value)
    const label = $('#zoom-val')
    if (label) label.textContent = `${S.zoom}%`
    updateChart()
  }
  if (el.closest('#arm-form')) {
    const form = el.closest('#arm-form')
    for (const cell of $$('[data-diff]', form)) {
      const point = cell.dataset.diff
      const a = Number(form.querySelector(`[name="${point}_a"]`)?.value)
      const h = Number(form.querySelector(`[name="${point}_h"]`)?.value)
      cell.textContent = Number.isFinite(a) && a > 0 && Number.isFinite(h) && h > 0 ? (a - h).toFixed(1) : '—'
    }
  }
})

document.addEventListener('pointermove', (event) => {
  const svg = event.target.closest('#timeline-svg')
  const tip = $('#chart-tip')
  if (!svg || !tip) { if (tip) tip.classList.remove('on'); return }
  const rect = svg.getBoundingClientRect()
  const sx = rect.width / 980, sy = rect.height / 400
  const px = event.clientX - rect.left, py = event.clientY - rect.top
  let best = null, distance = 1e9
  $$('.pt', svg).forEach((c) => {
    const dx = +c.getAttribute('cx') * sx - px
    const dy = +c.getAttribute('cy') * sy - py
    const dist = dx * dx + dy * dy
    if (dist < distance) { distance = dist; best = c }
  })
  if (!best || distance > 620) { tip.classList.remove('on'); return }
  const series = (S.data.metrics?.series ?? []).find((s) => s.code === best.dataset.code)
  const point = series?.points?.find((p) => p.date === best.dataset.date)
  if (!series || !point) { tip.classList.remove('on'); return }
  tip.innerHTML = `<b>${esc(series.name)}</b> ${fmtNum(point.value, series.dec)} ${esc(unitText(series.unit))}<br><span style="opacity:.75">${longDate(point.date)} · ${esc(point.source)}</span>`
  tip.style.left = `${+best.getAttribute('cx') * sx}px`
  tip.style.top = `${+best.getAttribute('cy') * sy}px`
  tip.classList.add('on')
}, { passive: true })

document.addEventListener('submit', async (event) => {
  const form = event.target
  event.preventDefault()
  const data = formData(form)
  try {
    if (form.id === 'task-form') {
      await api('/api/tasks', { method: 'POST', body: { title: data.title, dueOn: data.dueOn || null, kind: data.kind, detail: data.detail || null } })
      closeModal(); await refresh(); rerender(); toast('安排已保存')
    } else if (form.id === 'question-form') {
      await api('/api/questions', { method: 'POST', body: { text: data.text, kind: data.kind } })
      closeModal(); await refresh(); rerender(); toast(data.kind === 'view' ? '已作为一条「我的看法」保存，不会被当成结论' : '已加入问题清单')
    } else if (form.id === 'viewpoint-form') {
      await api('/api/viewpoints', { method: 'POST', body: { text: data.text, speakerRole: data.speakerRole, recordedOn: data.recordedOn } })
      closeModal(); await refresh(); rerender(); toast('已记下这句看法；它只作为一条信息，不进入趋势或结论')
    } else if (form.id === 'symptom-form') {
      await api('/api/symptoms', { method: 'POST', body: { code: data.code, level: Number(data.level), occurredOn: data.occurredOn, note: data.note || null } })
      closeModal(); await refresh(); rerender(); toast('已保存；可在不适记录里回顾')
    } else if (form.id === 'arm-form') {
      const points = []
      for (const cell of $$('[data-diff]', form)) {
        const point = cell.dataset.diff
        const affected = form.querySelector(`[name="${point}_a"]`)?.value
        const healthy = form.querySelector(`[name="${point}_h"]`)?.value
        if (affected && String(affected).trim() !== '') {
          points.push({ point, affected: Number(affected), healthy: healthy && String(healthy).trim() !== '' ? Number(healthy) : null })
        }
      }
      if (!points.length) return toast('至少填一个点位的患侧值')
      const result = await api('/api/arm', { method: 'POST', body: { measuredOn: data.measuredOn, assessorRole: data.assessorRole, points } })
      closeModal(); await refresh(); rerender()
      toast(`已保存${result.set?.maxDiff !== null && result.set?.maxDiff !== undefined ? `，四点位最大差 ${fmtNum(result.set.maxDiff, 1)} cm` : '（缺健侧值，差值记为空）'}；已同步到一图秀`)
    } else if (form.id === 'drain-form') {
      await api('/api/drains', { method: 'POST', body: { date: data.date, value: Number(data.value), note: data.note || null } })
      closeModal(); await refresh(); rerender(); toast(Number(data.value) === 0 ? '已记录当日拔管' : '引流量已保存')
    } else if (form.id === 'observation-form') {
      await api('/api/observations', { method: 'POST', body: { metricCode: data.metricCode, occurredOn: data.occurredOn, value: data.value, method: data.method || null, note: data.note || null, refHigh: data.refHigh || null } })
      closeModal(); await refresh(); rerender(); toast('已补录一个值')
    } else if (form.id === 'treatment-form') {
      await api('/api/treatments', { method: 'POST', body: {
        kind: data.kind, name: data.name, start: data.start || null, end: data.end || null,
        status: data.status, axillary: data.axillary || null, note: data.note || null,
      } })
      closeModal(); await refresh(); rerender(); toast('治疗记录已保存（本人补录）')
    } else if (form.id === 'advice-form') {
      await api('/api/care', { method: 'POST', body: { kind: 'rehab_advice', title: data.title, detail: data.detail || null, sourceDate: data.sourceDate || null } })
      closeModal(); await refresh(); rerender(); toast('建议已保存（带来源与日期）')
    } else if (form.id === 'candidate-form') {
      const id = form.dataset.id
      const occurredOn = data.occurredOn || null
      await api(`/api/candidates/${id}/decide`, {
        method: 'POST',
        body: { action: 'edit', occurredOn, patch: { value_text: data.valueText, unit: data.unit || null, method: data.method || null } },
      })
      closeModal(); await refresh(); rerender(); toast('已修改后接受')
    } else if (form.id === 'nutrition-form') {
      await api('/api/nutrition', { method: 'POST', body: { intake: data.intake || null, weight: data.weight || null, note: data.note || null, occurredOn: data.date } })
      await refresh(); rerender(); toast('已保存记录' + (data.weight ? '；体重已同步到指标' : ''))
    } else if (form.id === 'mind-form') {
      await api('/api/mind', { method: 'POST', body: { owner: data.owner, note: data.note, recordedOn: today() } })
      S.sub.mind = '我的记录'
      rerender(); toast('已私密保存，不加入分享')
    }
  } catch (error) {
    toast(error.message)
  }
})

function documentsTableForClient() {
  // 搜索只改本地过滤，不重取整页
  const docs = S.data.documents?.list ?? []
  const query = S.query.trim()
  const filtered = query ? docs.filter((x) => x.filename.includes(query)) : docs
  if (!filtered.length) return query ? empty('没有找到这份材料', '试试「化验」「病理」或清空搜索。') : empty('还没有材料', '导入一份材料后，这里会按导入时间列出。')
  return `<div class="table-wrap"><table><thead><tr><th>材料名称</th><th>报告日期</th><th>类型</th><th>整理状态</th><th>待核对</th><th>操作</th></tr></thead><tbody>
  ${filtered.map((doc) => `<tr><td><b>${esc(doc.filename)}</b><br><small>${(doc.bytes / 1024).toFixed(0)} KB · 导入于 ${longDate(String(doc.importedAt).slice(0, 10))}</small></td>
    <td>${doc.reportDate ? longDate(doc.reportDate) : '<span class="muted">未写</span>'}</td><td>${esc(kindLabel(doc.kind))}</td>
    <td>${doc.status === 'parsed' ? (doc.pendingCandidates ? pill('待核对', 'yellow') : pill('已核对', 'green')) : doc.status === 'parse_failed' ? pill('解析失败', 'yellow') : pill('未解析', 'grey')}</td>
    <td>${doc.pendingCandidates ? `${doc.pendingCandidates} 项` : '—'}</td>
    <td>${btn('原文', 'doc-text', 'source-link', `data-id="${doc.id}"`)}</td></tr>`).join('')}
  </tbody></table></div>`
}

function updateChart() {
  const panel = $('#chart-panel')
  if (!panel) return
  panel.outerHTML = chartPanel()
}

/* ================= 启动 ================= */

function paintFontToggle() {
  const btnEl = $('#font-toggle')
  if (!btnEl) return
  const large = document.body.classList.contains('large')
  btnEl.setAttribute('aria-pressed', String(large))
  btnEl.textContent = large ? '标准字 Aa' : '大字 Aa'
}

/**
 * 顶部那行说明要按运行形态改：挂在 DSH 面板里时不能再说"未接入 DSH 宿主"。
 * 运行形态由服务端写进 <html data-runtime>（CSP 禁内联脚本，不走 window 全局）。
 */
function paintRuntimeLine() {
  const el = $('#runtime-line')
  if (!el) return
  const runtime = document.documentElement?.dataset?.runtime
  if (runtime === 'host') el.innerHTML = `<b>工作台 v${esc(S.version)}</b> · 本机数据 · 在 DSH Desktop 面板里`
}

function bindChrome() {
  paintRuntimeLine()
  $('#font-toggle')?.addEventListener('click', () => {
    const large = document.body.classList.toggle('large')
    try { localStorage.setItem('pinkypal.large', large ? '1' : '0') } catch { /* 隐私模式忽略 */ }
    paintFontToggle()
  })
  try {
    if (localStorage.getItem('pinkypal.large') === '1') document.body.classList.add('large')
  } catch { /* 忽略 */ }
  paintFontToggle()
  $('#dialog')?.addEventListener('close', () => { document.body.style.overflow = '' })
  window.addEventListener('hashchange', () => { if (applyHash()) rerender() })
}

async function main() {
  bindChrome()
  // 先挂宿主会话桥：宿主可能在 iframe onLoad 后立刻回告一次状态，
  // 晚挂就漏掉第一条，顶栏会一直停在"点此打开"。
  initHostAgent(() => paintTop())
  applyHash()
  try {
    await boot()
  } catch (error) {
    const main = $('#main')
    if (main) main.innerHTML = `<div class="setup"><div class="card"><h1>工作台没能连上本机服务</h1>
      <p>${esc(error.message)}</p>
      <div class="form-actions">${btn('重试', 'reload', 'primary')}</div></div></div>`
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="reload"]')) location.reload()
    }, { once: true })
    return
  }
  rerender()
}

main()
