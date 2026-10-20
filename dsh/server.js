/**
 * HTTP 适配层（M2 第二段，M5 加宿主基址）。零依赖：只用 `node:http`。
 *
 * 两种跑法，一份逻辑：
 * - 独立启动：`npm start -- --workspace /path/to/资料`（`scripts/dev-server.mjs`），
 *   站点在根路径，`basePath` 为空、接口基址 `/api`；
 * - 接入 DSH：`dsh/host.js` 把同一个 handler 挂在宿主 webServer 的前缀下（M5），
 *   `basePath = /api/breast-cancer-workbench`，页面在该前缀的 `/ui/` 下，
 *   接口基址就是前缀本身。改写规则见 `stripBasePath()`。
 *
 * 约定：
 * 1. API 一律 `/api/*`，返回 JSON；错误统一 `{ error: { code, message, detail } }`，
 *    不把堆栈发给浏览器，但服务端日志里留完整原因；
 * 2. 上传走原始字节 + 头信息，不解析 multipart——少一个手写解析器就少一类 bug；
 * 3. 静态资源只从 `public/` 出，路径必须归一化后仍在目录内；
 * 4. 页面里的 `{{WB_API_BASE}}` / `{{WB_RUNTIME}}` 在**返回时**替换，写进
 *    `<html data-*>` 属性——CSP 禁内联脚本，内联 boot 在面板里会被静默拦掉。
 *    前端因此不用知道自己是跑在独立服务里还是宿主面板里。
 */
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import { realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AppError, Workbench, MAX_UPLOAD } from './workbench.js'
import { ImportError } from './import.js'
import { CTCAE_META } from './ctcae.js'

const DEFAULT_PUBLIC = fileURLToPath(new URL('../public/', import.meta.url))
/** 仓库根：`assets/` 与 `public/` 同级，引用类静态文件从这里出（不在 public/ 复制一份）。 */
const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'SAMEORIGIN',
  'content-security-policy': [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; '),
}

/* ---------------- 基础工具 ---------------- */

export function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload))
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendError(res, error) {
  const status = error instanceof AppError ? error.status
    : error instanceof ImportError ? 400
      : 500
  const code = error?.code ?? 'INTERNAL'
  const message = status === 500 ? '服务端出错了；原因已写进本机日志，界面不会假装成功' : error.message
  sendJson(res, status, { error: { code, message, detail: error?.detail ?? null } })
  if (status === 500) console.error('[api] 未处理错误：', error)
}

function readBody(req, limit = MAX_UPLOAD) {
  return new Promise((resolvePromise, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new AppError('BODY_TOO_LARGE', `请求体超过 ${Math.round(limit / 1024 / 1024)} MB`, 413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJsonBody(req, limit = 2 * 1024 * 1024) {
  const buf = await readBody(req, limit)
  if (!buf.length) return {}
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    throw new AppError('BAD_JSON', '请求体不是合法 JSON', 400)
  }
}

const decodeHeader = (value) => {
  if (!value) return ''
  try { return decodeURIComponent(String(value)) } catch { return String(value) }
}

/* 接口清单：只用来判断"没选目录时该报 404 还是 409"。
 * 不加这张表的话，随便打一个不存在的接口会先撞上 NO_WORKSPACE，
 * 让人误以为是没选目录的问题。新增接口要同步这里。 */
const API_KNOWN = {
  GET: [
    /^\/api\/(overview|metrics|arm|symptoms|questions|tasks|viewpoints|documents|draft|clinical|care|nutrition|mind|exports|saved|demos)$/,
    /^\/api\/fs\/dirs$/,
    /^\/api\/documents\/[^/]+\/text$/,
  ],
  POST: [
    /^\/api\/fs\/pick$/,
    /^\/api\/(subject|active-subject|stage|settings|observations|treatments|arm|symptoms|tasks|questions|viewpoints|care|drains|nutrition|mind|export|documents)$/,
    /^\/api\/documents\/[^/]+\/(parse|accept-all)$/,
    /^\/api\/candidates\/[^/]+\/decide$/,
    /^\/api\/tasks\/[^/]+\/toggle$/,
    /^\/api\/questions\/[^/]+$/,
    /^\/api\/viewpoints\/[^/]+\/withdraw$/,
    /^\/api\/demo\/(seed|clear)$/,
  ],
  PATCH: [/^\/api\/questions\/[^/]+$/],
}

const isKnownApi = (method, path) => (API_KNOWN[method] ?? []).some((re) => re.test(path))

/* ---------------- 服务 ---------------- */

/**
 * 宿主前缀下的路径 → 本服务认识的路径。
 *
 * 宿主把 `/api/breast-cancer-workbench/**` 整段转给我们，内部要保持原来的 `/api/*` 形状，
 * 否则下面四十来处判断全得改。规则只有三条：
 *
 * | 宿主来的路径 | 改写后 | 说明 |
 * | --- | --- | --- |
 * | `<base>` 或 `<base>/` | `/index.html` | iframe 的 src 就是这里 |
 * | `<base>/ui/xxx` | `/xxx` | 静态资源（style.css、app.js、图片） |
 * | `<base>/api/xxx` | `/api/xxx` | 接口，形状与独立启动时完全一致 |
 *
 * 独立启动时 `base` 为空串，原样返回，行为不变。
 */
export function stripBasePath(pathname, base = '') {
  const path = String(pathname ?? '/')
  if (!base || !path.startsWith(base)) return path
  const rest = path.slice(base.length)
  if (!rest || rest === '/') return '/index.html'
  if (rest === '/ui') return '/index.html'
  if (rest.startsWith('/ui/')) return rest.slice(3)
  return rest
}

export class WorkbenchServer {
  /**
   * @param {object} opts
   * @param {Workbench|null} [opts.workbench] 已打开的工作台；不给就等用户在界面上选目录
   * @param {string} [opts.publicDir]
   * @param {string} [opts.version]
   * @param {string} [opts.basePath] 宿主给的前缀；独立启动时为空串
   * @param {string} [opts.apiBase] 注入页面的接口基址；**不含 `/api`**（接口路径自带 `/api`）。
   *   独立启动是空串，挂在宿主下是宿主前缀本身（如 `/api/breast-cancer-workbench`）。
   * @param {string} [opts.runtime] `standalone` | `host`，只影响页面顶部那一行提示
   * @param {((dir: string) => void)|null} [opts.onWorkspace] 用户选定资料目录后回调（宿主用来记住位置）
   */
  constructor({
    workbench = null,
    publicDir = DEFAULT_PUBLIC,
    version = '0.0.0',
    basePath = '',
    apiBase = '',
    runtime = 'standalone',
    onWorkspace = null,
  } = {}) {
    this.workbench = workbench
    this.publicDir = resolve(publicDir)
    this.version = version
    this.basePath = basePath
    // 前端调用形如 `${apiBase}/api/xxx`，所以基址里不能再含 /api：
    // 独立启动是空串（请求 /api/xxx），宿主下是前缀（请求 /api/breast-cancer-workbench/api/xxx）。
    // 这里原先在 basePath 为空时兜底成 '/api'，结果拼出 /api/api/state —— 开发版界面开不起来。
    this.apiBase = apiBase || basePath
    this.runtime = runtime === 'host' ? 'host' : 'standalone'
    this.onWorkspace = typeof onWorkspace === 'function' ? onWorkspace : null
  }

  get ready() {
    return Boolean(this.workbench)
  }

  async handle(req, res) {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (this.basePath) url.pathname = stripBasePath(url.pathname, this.basePath)
      if (url.pathname.startsWith('/api/')) {
        await this.#api(req, res, url)
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '只支持 GET' } })
        return
      }
      await this.#static(req, res, url)
    } catch (error) {
      if (!res.headersSent) sendError(res, error)
      else res.end()
    }
  }

  /* ---------- 静态 ---------- */

  async #static(req, res, url) {
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/') pathname = '/index.html'
    const rel = normalize(pathname).replace(/^([/\\])+/, '').replace(/^(\.\.[/\\])+/, '')
    let full = join(this.publicDir, rel)
    if (full !== this.publicDir && !full.startsWith(`${this.publicDir}${sep}`)) {
      throw new AppError('UNSAFE_PATH', '路径不合法', 400)
    }
    let info = null
    try { info = await stat(full) } catch { info = null }
    if (!info || !info.isFile()) {
      // 前端是单页：未知路径回 index.html，让 hash 路由接手
      full = join(this.publicDir, 'index.html')
      try { info = await stat(full) } catch {
        throw new AppError('NOT_FOUND', '页面资源缺失，请确认 public/ 是否随包分发', 404)
      }
    }
    const type = MIME[extname(full).toLowerCase()] ?? 'application/octet-stream'
    let body = await readFile(full)
    if (type.startsWith('text/html')) body = Buffer.from(this.#renderHtml(body.toString('utf8')), 'utf8')
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': type,
      'content-length': body.length,
      'cache-control': 'no-cache',
    })
    if (req.method === 'HEAD') res.end()
    else res.end(body)
  }

  /**
   * 把页面里的两个占位换成实际值（`{{WB_API_BASE}}` / `{{WB_RUNTIME}}`）。
   * 前端因此不用判断自己跑在哪：接口基址由服务端给，运行形态也由服务端给。
   */
  #renderHtml(html) {
    return html
      .split('{{WB_API_BASE}}').join(this.apiBase)
      .split('{{WB_RUNTIME}}').join(this.runtime)
  }

  /* ---------- API ---------- */

  async #api(req, res, url) {
    const method = req.method ?? 'GET'
    const path = url.pathname.replace(/\/+$/, '') || '/api'
    const wb = this.workbench

    if (method === 'GET' && path === '/api/health') {
      // dir 只在面板里用来调起原生会话（ensureSession 的 folder）；本机同源，无泄露面。
      sendJson(res, 200, { ok: true, version: this.version, ready: this.ready, dir: wb?.dir ?? null })
      return
    }

    if (method === 'GET' && path === '/api/reference/ctcae') {
      // 分级标准的原文（随包分发的 PDF）。三件事说清楚：
      // 1. 单一来源：只在 assets/reference/ctcae/ 放一份，不在 public/ 复制；
      // 2. 不能变成任意文件读：文件名取自冻结的 CTCAE_META，且必须仍在该目录内；
      // 3. 缺失时不假装有：明确报 NOT_FOUND，让界面去指 NCI 发布页。
      // 目录写死成 assets/reference/ctcae（不用 dirname(配置)）：即使有人把 localPdf
      // 改成别处的路径，也只能在这个目录里取，不会变成任意文件读。
      const dir = resolve(REPO_ROOT, 'assets/reference/ctcae')
      const full = resolve(REPO_ROOT, CTCAE_META.localPdf)
      if (!full.startsWith(`${dir}${sep}`)) {
        throw new AppError('UNSAFE_PATH', '引用文件路径不合法', 400)
      }
      let body = null
      try { body = await readFile(full) } catch { body = null }
      if (!body) {
        throw new AppError('NOT_FOUND', '标准原文没有随包分发（assets/reference/ctcae/ 缺失），可先看 NCI 发布页', 404)
      }
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': 'application/pdf',
        'content-length': body.length,
        'cache-control': 'no-cache',
      })
      if (req.method === 'HEAD') res.end()
      else res.end(body)
      return
    }

    if (method === 'GET' && path === '/api/fs/dirs') {
      // 目录浏览点选（网页回退）：只列子目录、不读文件内容、不写任何东西。
      // 不要求已选资料目录（首次进入页就要用）。本机同源 + 宿主授权闸之内。
      const asked = url.searchParams.get('path')?.trim() || homedir()
      let current
      try {
        current = realpathSync(asked)
      } catch {
        throw new AppError('DIR_NOT_FOUND', `这个目录不存在或打不开：${asked}`, 404)
      }
      if (!statSync(current).isDirectory()) throw new AppError('NOT_A_DIR', `这不是一个目录：${current}`, 400)
      const dirents = await readdir(current, { withFileTypes: true })
      const dirs = dirents.filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name.trim())
      const entries = dirs.slice(0, 500)
        .map((d) => ({ name: d.name, path: join(current, d.name) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
      const parent = dirname(current)
      sendJson(res, 200, {
        current,
        parent: parent !== current ? parent : null,
        entries,
        truncated: dirs.length > entries.length,
        shortcuts: { home: homedir() },
      })
      return
    }

    if (method === 'POST' && path === '/api/fs/pick') {
      // 原生目录选择器：macOS 的 choose folder 对话框，由本机 osascript 弹出。
      // 用户取消（-128）不是错误，返回 canceled 让界面安静收场。
      if (process.platform !== 'darwin') {
        throw new AppError('NOT_SUPPORTED', '本机系统不支持原生目录选择器，请用「网页浏览」或手输路径', 501)
      }
      const picked = await new Promise((resolvePromise) => {
        execFile('osascript', ['-e', 'POSIX path of (choose folder with prompt "选择资料目录")'], (error, stdout) => {
          if (error) {
            if (error.code === -128 || /User canceled|用户已取消/i.test(`${error.message}`)) resolvePromise(null)
            else resolvePromise({ error: error.message })
          } else resolvePromise(String(stdout).trim().replace(/\/$/, '') || null)
        })
      })
      if (picked && picked.error) throw new AppError('PICK_FAILED', `原生选择器没能打开：${picked.error}`, 500)
      sendJson(res, 200, { picked, canceled: picked === null })
      return
    }

    if (method === 'GET' && path === '/api/state') {
      if (!wb) {
        sendJson(res, 200, {
          ready: false,
          version: this.version,
          reason: '资料目录还没设置。工作台不会自己创建目录，也不会用默认路径。',
          demos: [],
        })
        return
      }
      sendJson(res, 200, { ready: true, version: this.version, ...wb.state() })
      return
    }

    if (method === 'POST' && path === '/api/workspace') {
      const body = await readJsonBody(req)
      const { workbench, created, subject } = await Workbench.openWorkspace({
        dir: body.path,
        create: body.create !== false,
        subjectName: body.subjectName ?? '我',
      })
      if (this.workbench && this.workbench !== workbench) this.workbench.store.close()
      this.workbench = workbench
      // 等回调走完再回：宿主用它记指针，回包先到而指针后到会出现"选了目录但重启又没了"
      await this.onWorkspace?.(workbench.dir ?? body.path)
      sendJson(res, 200, {
        ready: true,
        created,
        subject: workbench.state().subject ?? subject,
        state: { ...workbench.state(), version: this.version },
      })
      return
    }

    if (!wb) {
      if (!isKnownApi(method, path)) {
        throw new AppError('NOT_FOUND', `没有这个接口：${method} ${path}`, 404)
      }
      throw new AppError(
        'NO_WORKSPACE',
        '先选择资料目录：工作台不在默认位置建目录，也不读取主目录',
        409,
      )
    }

    /* ----- 档案与设置 ----- */

    if (method === 'POST' && path === '/api/subject') {
      const body = await readJsonBody(req)
      sendJson(res, 200, { subject: wb.updateSubject(body) })
      return
    }
    if (method === 'POST' && path === '/api/active-subject') {
      const body = await readJsonBody(req)
      sendJson(res, 200, { subject: wb.setActiveSubject(body.subjectId) })
      return
    }
    if (method === 'POST' && path === '/api/stage') {
      const body = await readJsonBody(req)
      sendJson(res, 200, { stage: wb.setStage(body.stage).stage })
      return
    }
    if (method === 'POST' && path === '/api/settings') {
      const body = await readJsonBody(req)
      const patch = {}
      if (body.mineruConsent !== undefined) patch.mineruConsent = Boolean(body.mineruConsent)
      const settings = wb.setSettings(patch)
      sendJson(res, 200, { settings: { mineruConsent: Boolean(settings.mineruConsent), ...wb.state().settings } })
      return
    }

    /* ----- 读模型 ----- */

    const gets = {
      '/api/overview': () => wb.overview(),
      '/api/metrics': () => wb.metrics(),
      '/api/arm': () => wb.arm(),
      '/api/symptoms': () => wb.symptoms({ includePrivate: url.searchParams.get('private') === '1' }),
      '/api/questions': () => wb.questions(),
      '/api/tasks': () => wb.tasks(),
      '/api/viewpoints': () => wb.viewpoints(),
      '/api/documents': () => wb.documents(),
      '/api/draft': () => wb.draft(),
      '/api/clinical': () => wb.clinical(),
      '/api/care': () => wb.care({ includePrivate: url.searchParams.get('private') === '1' }),
      '/api/nutrition': () => wb.nutrition(),
      '/api/mind': () => wb.mind(),
      '/api/exports': () => wb.exports(),
      '/api/saved': () => ({ list: wb.savedResults() }),
      '/api/demos': () => ({ list: wb.listDemoState() }),
    }
    if (method === 'GET' && gets[path]) {
      sendJson(res, 200, gets[path]())
      return
    }

    /* ----- 资料导入与解析 ----- */

    if (method === 'POST' && path === '/api/documents') {
      const body = await readBody(req)
      const result = await wb.importBytes({
        bytes: body,
        filename: decodeHeader(req.headers['x-filename']) || '未命名材料',
        kind: decodeHeader(req.headers['x-kind']) || 'other',
        reportDate: decodeHeader(req.headers['x-report-date']) || null,
        mime: decodeHeader(req.headers['x-mime']) || null,
      })
      sendJson(res, 200, { ...result, documents: wb.documents() })
      return
    }

    let m = path.match(/^\/api\/documents\/([^/]+)\/parse$/)
    if (method === 'POST' && m) {
      const body = await readJsonBody(req)
      const result = await wb.parseDocument(m[1], { strategy: body.strategy ?? 'auto' })
      sendJson(res, 200, { ...result, draft: wb.draft() })
      return
    }

    m = path.match(/^\/api\/documents\/([^/]+)\/text$/)
    if (method === 'GET' && m) {
      sendJson(res, 200, await wb.documentText(m[1]))
      return
    }

    m = path.match(/^\/api\/documents\/([^/]+)\/accept-all$/)
    if (method === 'POST' && m) {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.acceptDocument(m[1], { occurredOn: body.occurredOn ?? null }))
      return
    }

    m = path.match(/^\/api\/candidates\/([^/]+)\/decide$/)
    if (method === 'POST' && m) {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.decideCandidate({
        candidateId: m[1],
        action: body.action,
        occurredOn: body.occurredOn ?? null,
        patch: body.patch ?? null,
      }))
      return
    }

    /* ----- 写入 ----- */

    if (method === 'POST' && path === '/api/observations') {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.addObservation(body))
      return
    }
    if (method === 'POST' && path === '/api/treatments') {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.addTreatment(body))
      return
    }
    if (method === 'POST' && path === '/api/arm') {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.addArmSet(body))
      return
    }
    if (method === 'POST' && path === '/api/symptoms') {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.addSymptom(body))
      return
    }
    if (method === 'POST' && path === '/api/tasks') {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.addTask(body))
      return
    }
    m = path.match(/^\/api\/tasks\/([^/]+)\/toggle$/)
    if (method === 'POST' && m) {
      sendJson(res, 200, wb.toggleTask(m[1]))
      return
    }
    if (method === 'POST' && path === '/api/questions') {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.addQuestion(body))
      return
    }
    m = path.match(/^\/api\/questions\/([^/]+)$/)
    if ((method === 'POST' || method === 'PATCH') && m) {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.updateQuestion(m[1], body))
      return
    }
    if (method === 'POST' && path === '/api/viewpoints') {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.addViewpoint(body))
      return
    }
    m = path.match(/^\/api\/viewpoints\/([^/]+)\/withdraw$/)
    if (method === 'POST' && m) {
      sendJson(res, 200, wb.withdrawViewpoint(m[1]))
      return
    }
    if (method === 'POST' && path === '/api/care') {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.addCare(body))
      return
    }
    if (method === 'POST' && path === '/api/drains') {
      const body = await readJsonBody(req)
      sendJson(res, 200, wb.addDrain(body))
      return
    }
    if (method === 'POST' && path === '/api/nutrition') {
      const body = await readJsonBody(req)
      const out = {}
      if (body.weight !== undefined && body.weight !== null && String(body.weight).trim() !== '') {
        out.weight = wb.addObservation({
          metricCode: 'weight', occurredOn: body.occurredOn, value: body.weight,
          note: body.note ? `营养记录 · ${String(body.note).slice(0, 120)}` : '营养记录',
        })
      }
      if (body.intake || body.note) {
        out.entry = wb.addCare({
          kind: 'nutrition',
          title: body.intake ? `进食：${body.intake}` : '营养记录',
          detail: body.note ?? null,
          sourceDate: body.occurredOn,
        }).entry
      }
      if (!out.weight && !out.entry) {
        throw new AppError('EMPTY_RECORD', '任选一项记录，或直接返回', 400)
      }
      sendJson(res, 200, { ...out, nutrition: wb.nutrition() })
      return
    }
    if (method === 'POST' && path === '/api/mind') {
      const body = await readJsonBody(req)
      const entry = wb.addCare({
        kind: 'mind',
        title: body.owner === 'caregiver' ? '照护者自己的记录' : '本人记录',
        detail: body.note,
        sourceDate: body.recordedOn ?? null,
        isPrivate: true,
      }).entry
      sendJson(res, 200, { entry, mind: wb.mind() })
      return
    }

    /* ----- 导出 ----- */

    if (method === 'POST' && path === '/api/export') {
      const body = await readJsonBody(req)
      const result = wb.exportVisit(body ?? {})
      sendJson(res, 200, { ...result, exports: wb.exports() })
      return
    }

    /* ----- 演示 ----- */

    if (method === 'POST' && path === '/api/demo/seed') {
      const body = await readJsonBody(req)
      const manifest = wb.seedDemo(body.id, { activate: body.activate !== false })
      sendJson(res, 200, { ...manifest, state: wb.state() })
      return
    }
    if (method === 'POST' && path === '/api/demo/clear') {
      const body = await readJsonBody(req)
      sendJson(res, 200, { ...wb.clearDemo(body.id), state: wb.state() })
      return
    }

    throw new AppError('NOT_FOUND', `没有这个接口：${method} ${path}`, 404)
  }
}

/**
 * 起一个独立服务。`port: 0` 让系统分配（测试用），返回值里带真实端口。
 */
export function startWorkbenchServer({
  port = 4173,
  host = '127.0.0.1',
  workbench = null,
  publicDir,
  version = '0.0.0',
  basePath = '',
  apiBase = '',
  runtime = 'standalone',
  onWorkspace = null,
} = {}) {
  const app = new WorkbenchServer({ workbench, publicDir, version, basePath, apiBase, runtime, onWorkspace })
  const server = createServer((req, res) => { app.handle(req, res) })
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const address = server.address()
      resolvePromise({ app, server, port: typeof address === 'object' ? address.port : port, host })
    })
  })
}
