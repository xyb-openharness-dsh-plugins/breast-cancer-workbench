/** API 调用层：所有请求集中在这里，错误统一抛出可读消息。 */

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || `请求失败（${status}）`)
    this.name = 'ApiError'
    this.status = status
    this.code = payload?.error?.code ?? 'UNKNOWN'
    this.detail = payload?.error?.detail ?? null
  }
}

async function parse(res) {
  const text = await res.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = { error: { message: text.slice(0, 200) } } }
  if (!res.ok) throw new ApiError(res.status, payload)
  return payload
}

/**
 * 接口基址。独立启动是 `/api`；挂在 DSH 面板里是 `/api/breast-cancer-workbench`
 * （由服务端在返回页面时写进 <html data-api-base>，页面自己不猜）。
 * 从 data 属性读而不是内联脚本：本站 CSP 禁内联脚本，内联 boot 会被静默拦掉
 * （实测踩过：基址变 undefined，接口全部 404，顶栏还写着"未接入 DSH 宿主"）。
 * 拿不到就退回 `/api`：宁可退回独立启动的形状，也不要拼出一个不存在的路径。
 */
export function apiBase() {
  const base = typeof document === 'undefined' ? '' : document.documentElement?.dataset?.apiBase
  if (typeof base === 'string' && base.startsWith('/') && !base.includes('{')) return base.replace(/\/+$/, '')
  return '/api'
}

export async function api(path, { method = 'GET', body = null, headers = {} } = {}) {
  const options = { method, headers: { ...headers } }
  if (body !== null) {
    options.headers['content-type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  const res = await fetch(`${apiBase()}${path}`, options)
  return parse(res)
}

/** 原件上传：原始字节 + 头信息，服务端自己算 sha256。 */
export async function uploadDocument(file, { kind, reportDate } = {}) {
  const headers = {
    'content-type': 'application/octet-stream',
    'x-filename': encodeURIComponent(file.name),
    'x-kind': kind ?? 'other',
    'x-mime': file.type || '',
  }
  if (reportDate) headers['x-report-date'] = reportDate
  const res = await fetch(`${apiBase()}/api/documents`, {
    method: 'POST',
    headers,
    body: await file.arrayBuffer(),
  })
  return parse(res)
}

/** 按扩展名猜资料类型，用户仍可在界面上改。 */
export function guessKind(filename = '') {
  const name = String(filename).toLowerCase()
  if (/病理|patho/.test(name)) return 'pathology'
  if (/出院|discharge/.test(name)) return 'discharge'
  if (/放疗|化疗|治疗|treat/.test(name)) return 'other'
  if (/ct|mri|超声|影像|x光|pet/.test(name)) return 'imaging'
  if (/处方|prescription/.test(name)) return 'prescription'
  if (/(化验|检验|血常规|生化|lab|blood)/.test(name)) return 'lab'
  return 'lab'
}

export function isTextFile(filename = '') {
  return /\.(txt|md|markdown|csv)$/i.test(filename)
}
