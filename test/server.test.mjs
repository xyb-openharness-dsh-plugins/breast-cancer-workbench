/**
 * HTTP 适配层（`dsh/server.js`）单测：真的起一个服务、真的发请求。
 *
 * 这一层要钉住的是**界面的两个状态**（未选目录 / 已就绪）和**几个不该漏的口子**：
 * 没选目录时不能假装有数据、路径越界不能读到 public 之外、上传不靠 multipart、
 * 错误统一成 `{ error: { code, message } }` 而不是把堆栈给浏览器。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { startWorkbenchServer } from '../dsh/server.js'
import { Workbench } from '../dsh/workbench.js'

const LAB_TEXT = [
  '报告日期：2026-09-12',
  '| 项目 | 结果 | 参考范围 | 单位 |',
  '| --- | --- | --- | --- |',
  '| CA15-3 | 18.6 | 0-25 | U/mL |',
  '| 血红蛋白 | 112 | 115-150 | g/L |',
].join('\n')

async function tempRoot(label = 'xyb-srv') {
  return mkdtemp(join(homedir(), `.${label}-`))
}

/**
 * 起一个服务：默认**没有**工作区（界面上要让用户自己选目录），
 * 每一步都从 HTTP 走，不直接调 Workbench，才能发现接线上的错。
 */
async function withServer(fn) {
  const root = await tempRoot()
  const { server, app, port } = await startWorkbenchServer({ port: 0, version: '9.9.9' })
  const base = `http://127.0.0.1:${port}`
  const call = async (path, { method = 'GET', body, headers } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body instanceof Buffer ? headers : (body ? { 'content-type': 'application/json', ...headers } : headers),
      body: body instanceof Buffer ? body : (body ? JSON.stringify(body) : undefined),
    })
    const type = res.headers.get('content-type') ?? ''
    const payload = type.includes('json') ? await res.json() : await res.text()
    return { status: res.status, headers: res.headers, payload }
  }
  try {
    return await fn({ call, base, root, port, app })
  } finally {
    if (app.workbench) app.workbench.store.close()
    await new Promise((r) => server.close(r))
    await rm(root, { recursive: true, force: true })
  }
}

/* ---------------- 就绪前的两个状态 ---------------- */

test('健康检查：没选目录也是 200，但 ready 为 false', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/health')
    assert.equal(res.status, 200)
    assert.equal(res.payload.ok, true)
    assert.equal(res.payload.ready, false)
    assert.equal(res.payload.version, '9.9.9', '版本要从调用方传进来，不在服务里写死')
  })
});

test('没选目录时 /api/state 说清"不建目录、不用默认路径"，且不给假数据', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/state')
    assert.equal(res.status, 200)
    assert.equal(res.payload.ready, false)
    assert.ok(res.payload.reason.includes('不会自己创建目录'))
    assert.deepEqual(res.payload.demos, [])
  })
});

test('没选目录时读业务数据：409 NO_WORKSPACE，不返回空数组假装正常', async () => {
  await withServer(async ({ call }) => {
    for (const path of ['/api/overview', '/api/metrics', '/api/arm', '/api/draft', '/api/care']) {
      const res = await call(path)
      assert.equal(res.status, 409, `${path} 应该 409`)
      assert.equal(res.payload.error.code, 'NO_WORKSPACE')
    }
  })
});

test('不存在的目录且未确认创建：404 MISSING_DIR，并且真的没有建出来', async () => {
  await withServer(async ({ call, root }) => {
    const dir = join(root, '还没建')
    const res = await call('/api/workspace', { method: 'POST', body: { path: dir, create: false } })
    assert.equal(res.status, 404)
    assert.equal(res.payload.error.code, 'MISSING_DIR')
    await assert.rejects(() => access(dir), '目录不该被偷偷创建')
  })
});

test('把主目录当资料目录：400，且提示要建子目录', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/workspace', { method: 'POST', body: { path: homedir() } })
    assert.equal(res.status, 400)
    assert.equal(res.payload.error.code, 'HOME_PATH')
    assert.ok(res.payload.error.message.includes('子目录'))
  })
});

/* ---------------- 选目录 → 全链路 ---------------- */

test('从空到有：选目录 → 记一条指标 → 上肢 → 导入 → 解析 → 接受 → 导出', async () => {
  await withServer(async ({ call, root }) => {
    const dir = join(root, '资料')

    const opened = await call('/api/workspace', { method: 'POST', body: { path: dir, subjectName: '测试' } })
    assert.equal(opened.status, 200)
    assert.equal(opened.payload.ready, true)
    assert.equal(opened.payload.created, true, '要如实说"刚刚新建"')
    assert.equal(opened.payload.state.ready, true)

    const overview0 = await call('/api/overview')
    assert.equal(overview0.status, 200)
    assert.equal(overview0.payload.documents.total, 0)

    // 1) 记一条指标
    const obs = await call('/api/observations', {
      method: 'POST',
      body: { metricCode: 'ca153', occurredOn: '2026-08-01', value: 21.4, unit: 'U/mL' },
    })
    assert.equal(obs.status, 200)
    assert.equal(obs.payload.observation.value, 21.4)

    // 2) 没声明患侧就记上肢：要 409，不能猜左右
    const armFail = await call('/api/arm', {
      method: 'POST',
      body: { measuredOn: '2026-09-12', points: [{ point: 'wrist', affected: 16.2 }] },
    })
    assert.equal(armFail.status, 409)
    assert.equal(armFail.payload.error.code, 'LATERALITY_REQUIRED')

    const subj = await call('/api/subject', { method: 'POST', body: { laterality: 'right' } })
    assert.equal(subj.payload.subject.laterality, 'right')

    const armOk = await call('/api/arm', {
      method: 'POST',
      body: {
        measuredOn: '2026-09-12',
        points: [
          { point: 'wrist', affected: 16.2, healthy: 15.4 },
          { point: 'forearm_mid', affected: 24.1, healthy: null },
        ],
      },
    })
    assert.equal(armOk.status, 200)
    const arm = await call('/api/arm')
    assert.equal(arm.payload.count, 1)
    const wrist = arm.payload.sets[0].points.find((p) => p.point === 'wrist')
    assert.ok(Math.abs(wrist.diff - 0.8) < 1e-9)

    // 3) 上传原件：原始字节 + 头信息，不是 multipart
    const upload = await call('/api/documents', {
      method: 'POST',
      body: Buffer.from(LAB_TEXT, 'utf8'),
      headers: {
        'x-filename': encodeURIComponent('检验报告.txt'),
        'x-kind': 'lab',
        'x-report-date': '2026-09-12',
        'content-type': 'application/octet-stream',
      },
    })
    assert.equal(upload.status, 200)
    assert.equal(upload.payload.duplicate, false)
    const docId = upload.payload.document.id
    assert.equal(upload.payload.document.status, 'stored')

    // 4) 同一份原件再传一次：去重，不新建
    const again = await call('/api/documents', {
      method: 'POST',
      body: Buffer.from(LAB_TEXT, 'utf8'),
      headers: {
        'x-filename': encodeURIComponent('检验报告(1).txt'),
        'x-kind': 'lab',
        'content-type': 'application/octet-stream',
      },
    })
    assert.equal(again.payload.duplicate, true)
    assert.equal(again.payload.documents.list.length, 1)

    // 5) 解析 → 草稿
    const parsed = await call(`/api/documents/${docId}/parse`, { method: 'POST', body: { strategy: 'local' } })
    assert.equal(parsed.status, 200)
    assert.ok(parsed.payload.inserted >= 2)

    const draft = await call('/api/draft')
    const doc = draft.payload.documents[0]
    const ca = doc.candidates.find((c) => c.candidate.field === 'metric:ca153')
    assert.ok(ca, '草稿里要能看到 CA15-3')

    // 6) 逐项接受
    const decided = await call(`/api/candidates/${ca.candidate.id}/decide`, {
      method: 'POST', body: { action: 'accept' },
    })
    assert.equal(decided.status, 200)
    assert.ok(decided.payload.record?.id)
    assert.equal(decided.payload.draft.counts.pending, doc.candidates.length - 1)

    // 7) 导出门诊材料
    const exported = await call('/api/export', { method: 'POST', body: {} })
    assert.equal(exported.status, 200)
    assert.ok(exported.payload.markdown.includes('一、'))
    assert.ok(exported.payload.counts.metrics >= 1)
    assert.ok(exported.payload.filename.endsWith('.md'))

    // 8) 导出留痕
    const saved = await call('/api/saved')
    assert.equal(saved.payload.list.length, 1)
    const history = await call('/api/exports')
    assert.ok(history.payload.list.length >= 1)
  })
});

test('上传空文件被拒：EMPTY_FILE，不留半条记录', async () => {
  await withServer(async ({ call, root }) => {
    await call('/api/workspace', { method: 'POST', body: { path: join(root, '资料') } })
    const res = await call('/api/documents', {
      method: 'POST',
      body: Buffer.alloc(0),
      headers: { 'x-filename': encodeURIComponent('空.txt'), 'x-kind': 'other', 'content-type': 'application/octet-stream' },
    })
    assert.equal(res.status, 400)
    assert.equal(res.payload.error.code, 'EMPTY_FILE')
    const docs = await call('/api/documents')
    assert.equal(docs.payload.list.length, 0)
  })
});

test('未知接口返回 404 且带错误码，不返回 HTML', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/nope')
    assert.equal(res.status, 404)
    assert.equal(res.payload.error.code, 'NOT_FOUND')
  })
});

test('坏 JSON 请求体：400 BAD_JSON，不是 500', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/api/workspace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{这不是 JSON',
    })
    assert.equal(res.status, 400)
    const payload = await res.json()
    assert.equal(payload.error.code, 'BAD_JSON')
  })
});

/* ---------------- 静态资源 ---------------- */

test('首页能打开，并且带 CSP / nosniff 等安全头', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/')
    assert.equal(res.status, 200)
    assert.ok(res.payload.includes('<title>'), '应该是 HTML')
    assert.ok(res.payload.includes('小粉宝'))
    assert.ok(res.headers.get('content-security-policy').includes("default-src 'self'"))
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN')
  })
});

test('前端资源都能取到：模块脚本与样式表', async () => {
  await withServer(async ({ base }) => {
    for (const path of ['/app.js', '/style.css', '/js/api.js', '/js/state.js', '/js/ui.js', '/js/pages-basic.js', '/js/pages-more.js']) {
      const res = await fetch(`${base}${path}`)
      assert.equal(res.status, 200, `${path} 取不到`)
      const type = res.headers.get('content-type') ?? ''
      assert.ok(type.includes('javascript') || type.includes('css'), `${path} 的 content-type 不对：${type}`)
      const text = await res.text()
      assert.ok(text.length > 100, `${path} 内容太短，可能是空文件`)
    }
  })
});

test('路径越界读不到 public 之外的文件', async () => {
  await withServer(async ({ base }) => {
    for (const path of ['/%2e%2e%2fpackage.json', '/..%2f..%2fetc%2fpasswd', '/js/%2e%2e%2f%2e%2e%2fpackage.json']) {
      const res = await fetch(`${base}${path}`)
      const text = await res.text()
      assert.ok(!text.includes('"name": "@pinkypal-dsh'), `${path} 读到了 package.json`)
      assert.ok(!text.includes('root:'), `${path} 读到了系统文件`)
    }
  })
});

test('非 GET 打静态路径：405，不尝试写入', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/style.css`, { method: 'POST' })
    assert.equal(res.status, 405)
    const payload = await res.json()
    assert.equal(payload.error.code, 'METHOD_NOT_ALLOWED')
  })
});

test('已打开的工作区：换目录会关掉旧库并切到新目录', async () => {
  await withServer(async ({ call, root }) => {
    const a = join(root, '资料A')
    const b = join(root, '资料B')
    await call('/api/workspace', { method: 'POST', body: { path: a } })
    await call('/api/observations', { method: 'POST', body: { metricCode: 'hgb', occurredOn: '2026-09-01', value: 110 } })
    const stateA = await call('/api/state')
    assert.equal(stateA.payload.dir, a)

    await call('/api/workspace', { method: 'POST', body: { path: b } })
    const stateB = await call('/api/state')
    assert.equal(stateB.payload.dir, b)
    const overviewB = await call('/api/overview')
    assert.equal(overviewB.payload.metrics.withData, 0, '新目录应该是空的')

    // 回到 A，之前那条数据还在
    await call('/api/workspace', { method: 'POST', body: { path: a } })
    const back = await call('/api/overview')
    assert.equal(back.payload.metrics.withData, 1)
  })
});

test('演示数据可以载入与清理，接口都返回最新状态', async () => {
  await withServer(async ({ call, root }) => {
    await call('/api/workspace', { method: 'POST', body: { path: join(root, '资料') } })
    const seed = await call('/api/demo/seed', { method: 'POST', body: { id: 'DEMO-3' } })
    assert.equal(seed.status, 200)
    assert.ok(seed.payload.counts.observations > 100)

    const o = await call('/api/overview')
    assert.ok(o.payload.metrics.withData > 0)

    const cleared = await call('/api/demo/clear', { method: 'POST', body: { id: 'DEMO-3' } })
    assert.equal(cleared.status, 200)
    const after = await call('/api/overview')
    assert.equal(after.payload.metrics.withData, 0)
  })
});

test('直接传 Workbench 进来时 ready 为 true（接入宿主时走这条路）', async () => {
  const root = await tempRoot()
  const { workbench } = await Workbench.openWorkspace({ dir: join(root, '资料'), create: true, subjectName: '测试' })
  const { server, port, app } = await startWorkbenchServer({ port: 0, workbench, version: '9.9.9' })
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/state`)
    const payload = await res.json()
    assert.equal(payload.ready, true)
    assert.equal(payload.version, '9.9.9')
    assert.equal(app.ready, true)
  } finally {
    workbench.store.close()
    await new Promise((r) => server.close(r))
    await rm(root, { recursive: true, force: true })
  }
});
