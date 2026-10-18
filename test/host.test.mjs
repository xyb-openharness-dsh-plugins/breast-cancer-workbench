/**
 * 宿主接入层（M5）。
 *
 * 用一个假的 ctx 走完整链路：注册前缀 → 授权闸 → 路径改写 → 真请求。
 * 不连真宿主也能验，因为 `dsh/host.js` 是零依赖的；Schemastery 的 `Config`
 * 单独放在 `dsh/index.js`，那里才需要宿主提供的依赖。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

import { WorkbenchServer, stripBasePath } from '../dsh/server.js'
import {
  name, inject, apply, createHostHandler, restoreWorkspace, mountedServer,
  POINTER_FILE, API_PREFIX, PLUGIN_ID, HOME_DIR,
} from '../dsh/host.js'
import { PANEL } from '../lib/layout.js'

/* ---------------- 测试替身 ---------------- */

function fakeRes() {
  const res = {
    status: 0, headers: {}, body: null, headersSent: false, ended: false,
    writeHead(status, headers) {
      res.status = status
      res.headers = { ...headers }
      res.headersSent = true
      return res
    },
    end(chunk) {
      res.body = chunk ?? null
      res.ended = true
      return res
    },
  }
  return res
}

function fakeReq({ method = 'GET', url = '/', headers = {}, body = '' } = {}) {
  const listeners = new Map()
  const req = {
    method,
    url,
    headers,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(fn)
      return req
    },
    destroy() {},
    emit(event, arg) { for (const fn of listeners.get(event) ?? []) fn(arg) },
    fire() {
      if (body) req.emit('data', Buffer.from(body))
      req.emit('end')
    },
  }
  return req
}

/**
 * @param {object} opts
 * @param {'none'|'allow'|number} [opts.auth] 宿主授权闸的行为：
 *   `none` = 宿主没有 requestRejection 方法；`allow` = 方法存在并返回 undefined；数字 = 用该状态码拒绝
 */
function fakeCtx({ auth = 'allow' } = {}) {
  const registered = []
  const effects = []
  const ctx = {
    webServer: {
      register(entry) {
        registered.push(entry)
        return () => {}
      },
    },
    effect(fn, label) {
      effects.push({ fn, label })
      return fn()
    },
    registered,
    effects,
  }
  if (auth === 'none') ctx.connection = undefined
  else ctx.connection = { requestRejection: () => (auth === 'allow' ? undefined : auth) }
  return ctx
}

async function call(server, { method = 'GET', url, body = '', headers = {} } = {}) {
  const req = fakeReq({ method, url, headers, body })
  const res = fakeRes()
  const pending = server.handle(req, res)
  req.fire()
  await pending
  return {
    status: res.status,
    headers: res.headers,
    body: res.body ? Buffer.from(res.body).toString('utf8') : null,
    get json() { return JSON.parse(Buffer.from(res.body).toString('utf8')) },
  }
}

function tempDir(prefix = '.xyb-host-') {
  return mkdtemp(join(homedir(), prefix))
}

/* ---------------- 常量与改写规则 ---------------- */

test('插件条目 id 与接口前缀：前缀必须是 /api/<id>，且 id 与 patch 一致', async () => {
  assert.equal(name, PLUGIN_ID)
  assert.equal(PLUGIN_ID, 'breast-cancer-workbench')
  assert.equal(API_PREFIX, '/api/breast-cancer-workbench')
  assert.equal(HOME_DIR, 'pinkypal-workbench')
  assert.deepEqual(inject, ['webServer', 'connection'])
})

test('路径改写：前缀本身与 /ui/ 归页面，其余原样交给 /api 判断', () => {
  const base = API_PREFIX
  assert.equal(stripBasePath(`${base}`, base), '/index.html')
  assert.equal(stripBasePath(`${base}/`, base), '/index.html')
  assert.equal(stripBasePath(`${base}/ui`, base), '/index.html')
  assert.equal(stripBasePath(`${base}/ui/`, base), '/')
  assert.equal(stripBasePath(`${base}/ui/style.css`, base), '/style.css')
  assert.equal(stripBasePath(`${base}/ui/js/app.js`, base), '/js/app.js')
  assert.equal(stripBasePath(`${base}/api/state`, base), '/api/state')
  assert.equal(stripBasePath(`${base}/api/documents/abc/parse`, base), '/api/documents/abc/parse')
})

test('路径改写：独立启动时 base 为空，行为不变', () => {
  assert.equal(stripBasePath('/api/state', ''), '/api/state')
  assert.equal(stripBasePath('/', ''), '/')
  assert.equal(stripBasePath('/style.css', ''), '/style.css')
})

/* ---------------- 挂载 ---------------- */

test('apply：注册一个 prefix 路由，并把注销交给 ctx.effect', async () => {
  const root = await tempDir()
  try {
    const ctx = fakeCtx()
    apply(ctx, { root })
    const server = mountedServer()
    const prefix = server.apiBase
    assert.equal(prefix, API_PREFIX)
    assert.equal(ctx.registered.length, 1)
    assert.equal(ctx.registered[0].kind, 'prefix')
    assert.equal(ctx.registered[0].path, API_PREFIX)
    assert.equal(typeof ctx.registered[0].handler, 'function')
    assert.equal(ctx.effects.length, 1)
    assert.equal(ctx.effects[0].label, `${PLUGIN_ID}: api`)
    assert.equal(server.runtime, 'host')
    assert.equal(server.basePath, API_PREFIX)
    server.workbench?.store.close()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('授权闸：宿主没有 requestRejection 时一律 403，不碰业务', async () => {
  const server = new WorkbenchServer({ version: '0.0.0', basePath: API_PREFIX, apiBase: API_PREFIX })
  const res = fakeRes()
  await createHostHandler(server, fakeCtx({ auth: 'none' }))(fakeReq({ url: `${API_PREFIX}/api/health` }), res)
  assert.equal(res.status, 403)
  assert.equal(JSON.parse(res.body.toString('utf8')).error.code, 'HOST_AUTH_REQUIRED')
})

test('授权闸：宿主返回状态码时原样拒绝', async () => {
  const server = new WorkbenchServer({ version: '0.0.0' })
  const res = fakeRes()
  await createHostHandler(server, fakeCtx({ auth: 401 }))(fakeReq({ url: '/api/health' }), res)
  assert.equal(res.status, 401)
})

test('授权闸：requestRejection 返回 undefined 视为放行', async () => {
  const root = await tempDir()
  try {
    const ctx = fakeCtx({ auth: 'allow' })
    apply(ctx, { root })
    const server = mountedServer()
    const out = await call(server, { url: `${API_PREFIX}/api/health` })
    assert.equal(out.status, 200)
    assert.equal(out.json.ok, true)
    assert.equal(out.json.ready, false)
    server.workbench?.store.close()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

/* ---------------- 宿主前缀下的真请求 ---------------- */

test('宿主前缀下取健康检查与状态：路径改写后与独立启动同形', async () => {
  const server = new WorkbenchServer({ version: '1.2.3', basePath: API_PREFIX, apiBase: API_PREFIX, runtime: 'host' })
  const health = await call(server, { url: `${API_PREFIX}/api/health` })
  assert.equal(health.status, 200)
  assert.equal(health.json.version, '1.2.3')

  const state = await call(server, { url: `${API_PREFIX}/api/state` })
  assert.equal(state.status, 200)
  assert.equal(state.json.ready, false)
  assert.match(state.json.reason, /资料目录/)
})

test('宿主前缀下的静态页面：占位被替换成前缀与 host', async () => {
  const server = new WorkbenchServer({ version: '1.2.3', basePath: API_PREFIX, apiBase: API_PREFIX, runtime: 'host' })
  const page = await call(server, { url: `${API_PREFIX}/ui/` })
  assert.equal(page.status, 200)
  assert.match(page.headers['content-type'], /text\/html/)
  assert.match(page.body, /data-api-base="\/api\/breast-cancer-workbench"/)
  assert.match(page.body, /data-runtime="host"/)
  assert.doesNotMatch(page.body, /\{\{WB/)
  // CSP 禁内联脚本，基址必须走 data 属性而不是内联 boot（实测内联被静默拦掉 → 全 404）
  assert.doesNotMatch(page.body, /<script>[^<]*__WB_API_BASE__/)

  const css = await call(server, { url: `${API_PREFIX}/ui/style.css` })
  assert.equal(css.status, 200)
  assert.match(css.headers['content-type'], /text\/css/)
})

test('宿主前缀下的未知接口返回 404 JSON，不是 HTML 也不是 500', async () => {
  const server = new WorkbenchServer({ version: '1.2.3', basePath: API_PREFIX })
  const out = await call(server, { url: `${API_PREFIX}/api/not-a-route` })
  assert.equal(out.status, 404)
  assert.equal(out.json.error.code, 'NOT_FOUND')
})

test('独立启动时占位替换成 /api 与 standalone，行为与 M2 一致', async () => {
  const server = new WorkbenchServer({ version: '1.2.3' })
  const page = await call(server, { url: '/' })
  assert.equal(page.status, 200)
  assert.match(page.body, /data-api-base="\/api"/)
  assert.match(page.body, /data-runtime="standalone"/)
})

test('目录浏览接口：默认列家目录，只含子目录、不带隐藏项，可向上一级', async () => {
  const server = new WorkbenchServer({ version: '1.2.3' })
  const out = await call(server, { url: '/api/fs/dirs' })
  assert.equal(out.status, 200)
  assert.ok(out.json.current)
  assert.equal(out.json.shortcuts.home, homedir())
  for (const e of out.json.entries) {
    assert.ok(!e.name.startsWith('.'))
    assert.ok(e.path.startsWith(out.json.current + '/'))
  }
  if (out.json.parent) {
    const up = await call(server, { url: `/api/fs/dirs?path=${encodeURIComponent(out.json.parent)}` })
    assert.equal(up.status, 200)
    assert.ok(up.json.entries.some((e) => e.path === out.json.current))
  }
})

test('目录浏览接口：不存在的路径 404 且可读；文件路径报 NOT_A_DIR', async () => {
  const server = new WorkbenchServer({ version: '1.2.3' })
  const bad = await call(server, { url: `/api/fs/dirs?path=${encodeURIComponent(join(homedir(), 'no-such-xyb-dir-xyz'))}` })
  assert.equal(bad.status, 404)
  assert.equal(bad.json.error.code, 'DIR_NOT_FOUND')
  const file = await call(server, { url: `/api/fs/dirs?path=${encodeURIComponent(new URL(import.meta.url).pathname)}` })
  assert.equal(file.status, 400)
  assert.equal(file.json.error.code, 'NOT_A_DIR')
})

/* ---------------- 资料目录指针 ---------------- */

test('资料目录指针：用户选过之后写入，重启能恢复', async () => {
  const root = await tempDir()
  const data = await tempDir('.xyb-data-')
  try {
    apply(fakeCtx(), { root })
    const server = mountedServer()
    const out = await call(server, {
      method: 'POST',
      url: `${API_PREFIX}/api/workspace`,
      body: JSON.stringify({ path: data, create: false, subjectName: '我' }),
    })
    assert.equal(out.status, 200)
    assert.equal(out.json.ready, true)

    const saved = JSON.parse(await readFile(join(root, POINTER_FILE), 'utf8'))
    assert.equal(saved.dir, data)

    const restored = await restoreWorkspace(root)
    assert.ok(restored, '重启后应恢复上次的位置')
    assert.equal(restored.dir, data)
    restored.store.close()
    server.workbench.store.close()
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('资料目录指针：目录不在了就返回 null，且不自动建同名目录', async () => {
  const root = await tempDir()
  const data = await tempDir('.xyb-data-')
  try {
    apply(fakeCtx(), { root })
    const server = mountedServer()
    const opened = await call(server, {
      method: 'POST',
      url: `${API_PREFIX}/api/workspace`,
      body: JSON.stringify({ path: data, create: true, subjectName: '我' }),
    })
    assert.equal(opened.status, 200)
    server.workbench.store.close()
    await rm(data, { recursive: true, force: true })

    // 指针还指着那个目录：恢复必须失败，而且目录不能被悄悄重建（官方 §6）
    assert.equal(await restoreWorkspace(root), null)
    assert.equal(existsSync(data), false)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true }).catch(() => {})
  }
})

test('资料目录指针：没有指针文件、或没给 root 时都返回 null', async () => {
  const root = await tempDir()
  try {
    assert.equal(await restoreWorkspace(root), null)
    assert.equal(await restoreWorkspace(null), null)
    assert.equal(await restoreWorkspace(''), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

/* ---------------- 面板参数只认 lib/layout.js ---------------- */

test('面板参数来自 lib/layout.js：客户端里不得出现第二份写死的 0.65', async () => {
  const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(client, new RegExp(`businessSide: '${PANEL.businessSide}'`))
  assert.match(client, new RegExp(`businessWidth: ${PANEL.businessWidth}\\b`))
  assert.match(client, /window\.__ModuleLoader__\.load\(/)
  assert.match(client, /desktopWorkbenches\.register\(/)
})
