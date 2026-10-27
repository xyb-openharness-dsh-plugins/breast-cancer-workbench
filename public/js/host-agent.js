/**
 * 宿主会话桥（页面侧）。
 *
 * 工作台**不复制聊天界面**：真正的会话是 DSH 宿主的原生面板，由 `src/client.js` 那边调起。
 * 页面只做两件事：
 *   1. 点顶栏「对话」时发 `pinky:open-agent`，请宿主把会话叫到前台（没有会话就建一个）；
 *   2. 听 `pinky:agent-state`，把宿主的真实状态写进顶栏那颗按钮——
 *      不再硬写「未进入激活」，也不再说「这一版没有接入宿主」。
 *
 * 独立启动（`npm start`，没有父窗口）时 `host` 为 false，按钮退化成说明弹窗：
 * 不假装有 AI，也不留一个永远点不动的状态灯。
 */

export const hostAgent = {
  host: false, // 是否跑在宿主面板里
  canOpen: true, // 宿主是否提供 ensureSession（收到 agent-state 后才确定）
  connected: false, // 是否已有归属本工作台的会话
  paneOpen: false, // 会话面板是否展开
  connecting: false, // 宿主正在建会话
}

let notify = () => {}

/** 是否跑在 iframe 里（宿主面板）。独立启动时没有父窗口。 */
export function hostAvailable() {
  try { return Boolean(window.parent) && window.parent !== window } catch { return false }
}

/**
 * 挂上监听。`onChange` 在每次宿主回告后调用，调用方负责重画顶栏。
 * 只认同源消息：这条通道能改顶栏状态，不认"谁都能发"的 postMessage。
 */
export function initHostAgent(onChange) {
  if (typeof onChange === 'function') notify = onChange
  hostAgent.host = hostAvailable()
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return
    const data = event.data
    if (!data || data.type !== 'pinky:agent-state') return
    hostAgent.canOpen = data.canOpen !== false
    hostAgent.connected = Boolean(data.connected)
    hostAgent.paneOpen = Boolean(data.paneOpen)
    hostAgent.connecting = Boolean(data.connecting)
    notify(hostAgent)
  })
  notify(hostAgent)
}

/** 请求宿主打开 / 调起会话。返回 sent / no-host / failed，调用方据此给不同的提示。 */
export function requestOpenAgent() {
  if (!hostAgent.host) return 'no-host'
  try {
    window.parent.postMessage({ type: 'pinky:open-agent' }, window.location.origin)
    return 'sent'
  } catch {
    return 'failed'
  }
}

/** 顶栏那颗按钮的状态文字与提示语。宿主没回告时不编造"已连接"。 */
export function agentStatusText() {
  const a = hostAgent
  if (!a.host) return { label: '独立运行', dot: 'grey', title: '现在是独立启动的页面，没有会话面板；在 DSH Desktop 里打开工作台即可对话' }
  if (a.connecting) return { label: '正在连接', dot: 'grey', title: '正在调起 DSH 原生会话…' }
  if (a.connected) {
    return a.paneOpen
      ? { label: '会话进行中', dot: '', title: '点这里收起 / 展开右侧会话' }
      : { label: '已连接', dot: '', title: '点这里打开右侧会话' }
  }
  return { label: '点此打开', dot: 'grey', title: '点这里调起 DSH 原生会话，开场白只填进草稿' }
}
