/**
 * 「与 Agent 讨论」：把当前页的真实记录整理成草稿，**先预览再送**。
 *
 * 为什么不是"点一下直接发"：
 * 1. 用户必须能看见"到底把什么交给了 AI"——预览里逐块列出内容、缺项和没带入的东西；
 * 2. 私密记录默认不带，勾选才带（D39 fail-closed），所以这个开关必须出现在预览里；
 * 3. 草稿可编辑：AI 该看什么，最终由用户决定，不由页面替他决定。
 *
 * 送达方式是 `postMessage` 给宿主面板（`src/client.js` 的 message 监听器），
 * 由它把文本填进**原生会话草稿框**——本文件不建聊天框、不存会话、不发请求给模型。
 * 独立启动（`npm start`）时没有父窗口，按钮退化成"复制草稿"，同样不假装有 AI。
 */
import { $, esc, btn, openModal, closeModal, toast } from './ui.js'
import { api } from './api.js'

const MAX_PROMPT = 8000
const MESSAGE_TYPE = 'pinky:agent-draft'

/** 是否跑在宿主面板里（有父窗口）。独立启动时 false → 只给复制。 */
export function agentHostAvailable() {
  try { return Boolean(window.parent) && window.parent !== window } catch { return false }
}

let current = null // { scope, codes, includePrivate, data }

/**
 * 打开预览弹窗。
 * @param {{scope: string, codes?: string[]}} options
 */
export async function discussWithAgent({ scope, codes = [] } = {}) {
  const query = new URLSearchParams({ scope })
  if (codes.length) query.set('codes', codes.join(','))
  await load(query, { scope, codes, includePrivate: false })
}

async function load(query, state) {
  let data = null
  try {
    data = await api(`/api/agent/context?${query.toString()}`)
  } catch (error) {
    toast(error.message)
    return
  }
  current = { ...state, data, hasPrivate: Boolean(state.includePrivate) || Boolean(data?.excluded?.length) }
  if (!data?.ready) {
    openModal(
      '与 AI 讨论',
      `<div class="notice warn">${esc(data?.reason ?? '这一页还没有可带入的记录。')}</div>
       <p class="small-note">这条路径只整理"已经记录过的内容"；没有记录时不会编一段出来。</p>`,
      btn('知道了', 'close'),
    )
    return
  }
  render()
}

function blockHTML(block) {
  // 行的形状能区分子项：`·` 开头是条目、缩进两格是上一行的续行、纯数字是问题清单。
  // 不区分的话，预览里会出现"• · 2026.05.22…"这种双标记，也看不出哪行从属于哪行。
  const items = (block.lines ?? []).map((raw) => {
    const text = String(raw)
    const cls = /^\s{2,}/.test(text) ? 'sub' : /^\s*·/.test(text) ? 'dot' : 'plain'
    return `<li class="${cls}">${esc(text.trim().replace(/^·\s*/, ''))}</li>`
  }).join('')
  return `<div class="agent-block">
    <span class="marrow-key">${esc(block.label)}</span>
    <ul>${items}</ul>
    ${block.note ? `<p class="small-note">${esc(block.note)}</p>` : ''}
  </div>`
}

function render() {
  const { data } = current
  const inHost = agentHostAvailable()
  // 勾上之后服务端不再返回 excluded（没有"没带入"的东西了），但开关必须留着——
  // 否则用户没有退路，只能关掉弹窗重来。
  const privateToggle = current.hasPrivate
    ? `<label class="checkbox-line" style="margin:8px 0 0">
         <input type="checkbox" id="agent-private" ${current.includePrivate ? 'checked' : ''}><span>这些也一起带上（默认不带私密内容）</span>
       </label>`
    : ''
  const body = `<div class="notice pink">下面这些是<b>你记录过的内容</b>，会整理成一段草稿。可以改；不改也可以。
      草稿只会填进输入框，<b>不会自动发送</b>；发不发、给谁看，由你决定。</div>
    <div class="agent-preview">
      <b>会带进对话的内容</b>
      ${data.blocks.map(blockHTML).join('')}
      ${data.gaps?.length ? `<div class="agent-block gaps"><span class="marrow-key">缺项</span>
        <ul>${data.gaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
      ${data.excluded?.length ? `<div class="agent-block gaps"><span class="marrow-key">这次没带入</span>
        <ul>${data.excluded.map((e) => `<li>${esc(e.label)}——${esc(e.reason)}</li>`).join('')}</ul></div>` : ''}
      ${privateToggle}
    </div>
    <label style="display:block;margin-top:12px"><span class="form-label">实际填入会话的草稿（可以改）</span>
      <textarea id="agent-prompt" maxlength="${MAX_PROMPT}" style="min-height:190px;font-size:12px">${esc(data.prompt)}</textarea></label>
    <p class="small-note">${inHost
      ? '点「填入 AI 对话」后，这段文字会出现在右侧会话的输入框里，发送前你还能改。'
      : '现在是自己启动的页面，没有 AI 面板；可以先复制草稿，或在工作台的 AI 面板里再走一次。'}</p>`

  const foot = inHost
    ? `${btn('取消', 'close')}${btn('复制草稿', 'agent-copy', 'soft')}${btn('填入 AI 对话', 'agent-send', 'primary')}`
    : `${btn('取消', 'close')}${btn('复制草稿', 'agent-copy', 'primary')}`

  openModal(`与 AI 讨论 · ${data.label}`, body, foot, '小粉宝 · 只整理已记录的内容')

  // 直接挂监听：弹窗内容是刚写进 DOM 的，用委托反而更难读。
  // 这两个按钮不注册进 app.js 的 actions，全局委托不会重复触发。
  $('#agent-private')?.addEventListener('change', onPrivateToggle)
  $('[data-action="agent-send"]')?.addEventListener('click', (event) => { event.preventDefault(); sendDraft() })
  $('[data-action="agent-copy"]')?.addEventListener('click', (event) => { event.preventDefault(); copyDraft() })
}

async function onPrivateToggle(event) {
  const includePrivate = Boolean(event.target.checked)
  if (!current) return
  const query = new URLSearchParams({ scope: current.scope })
  if (current.codes?.length) query.set('codes', current.codes.join(','))
  if (includePrivate) query.set('includePrivate', '1')
  await load(query, { scope: current.scope, codes: current.codes, includePrivate })
  toast(includePrivate ? '已把私密项带进来，草稿已重新生成' : '已去掉私密项，草稿已重新生成')
}

function promptValue() {
  return String($('#agent-prompt')?.value ?? '').trim()
}

function copyDraft() {
  const text = promptValue()
  if (!text) { toast('草稿是空的，先写一点'); return }
  const done = () => toast('草稿已复制，可以粘到任何对话里')
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fallback)
    return
  }
  fallback()

  function fallback() {
    const area = document.createElement('textarea')
    area.value = text
    document.body.appendChild(area)
    area.select()
    try { document.execCommand('copy'); done() } catch { toast('复制失败：可以手动选中上面的草稿') }
    area.remove()
  }
}

function sendDraft() {
  const prompt = promptValue()
  if (!prompt) { toast('草稿是空的，先写一点'); return }
  if (!agentHostAvailable()) { copyDraft(); return }
  try {
    window.parent.postMessage({ type: MESSAGE_TYPE, prompt }, window.location.origin)
  } catch {
    toast('没能传给 AI 面板；可以用「复制草稿」自己粘过去')
    return
  }
  closeModal()
  toast('已填入右侧 AI 对话的输入框，按回车发送')
}
