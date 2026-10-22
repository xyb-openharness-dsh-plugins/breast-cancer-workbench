/**
 * MinerU 客户端单测：**不联网**。
 *
 * 用假 fetch 复现真实协议里的五个环节（申请链接 → 上传 → 轮询 → 下载 → 解包），
 * 重点是那些出错时容易糊弄过去的地方：Token 泄漏、401、解析失败被当成功、超时、ZIP 里没有 full.md。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { MineruClient, resolveToken, maskToken, MINERU_MODEL_DEFAULT, MINERU_MODEL_FALLBACK, modelFallbackWorthy } from '../dsh/mineru.js'
import { readZip, ZipError } from '../lib/zip.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* ---------------- 造一个真 ZIP（deflate，够真） ---------------- */

export function buildZip(files) {
  const chunks = []
  const central = []
  let offset = 0
  for (const file of files) {
    const data = Buffer.from(file.data)
    const comp = deflateRawSync(data)
    const nameBuf = Buffer.from(file.name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(comp.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    chunks.push(local, nameBuf, comp)
    central.push({ nameBuf, comp, data, offset })
    offset += 30 + nameBuf.length + comp.length
  }
  const cdStart = offset
  const cdChunks = []
  for (const c of central) {
    const h = Buffer.alloc(46)
    h.writeUInt32LE(0x02014b50, 0)
    h.writeUInt16LE(20, 4)
    h.writeUInt16LE(20, 6)
    h.writeUInt16LE(0x800, 8)
    h.writeUInt16LE(8, 10)
    h.writeUInt32LE(c.comp.length, 20)
    h.writeUInt32LE(c.data.length, 24)
    h.writeUInt16LE(c.nameBuf.length, 28)
    h.writeUInt32LE(c.offset, 42)
    cdChunks.push(h, c.nameBuf)
    offset += 46 + c.nameBuf.length
  }
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(central.length, 8)
  eocd.writeUInt16LE(central.length, 10)
  eocd.writeUInt32LE(offset - cdStart, 12)
  eocd.writeUInt32LE(cdStart, 16)
  return Buffer.concat([...chunks, ...cdChunks, eocd])
}

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  arrayBuffer: async () => Buffer.from(JSON.stringify(data)).buffer,
})
const bytesResponse = (buf, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => { throw new Error('not json') },
  arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
})

/** 假 MinerU：状态在第 N 次查询后变 done。 */
function fakeMineru({ zipBuffer, states = ['running', 'done'], failWith = null, onCall = null, withProgress = true } = {}) {
  let poll = 0
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ url, method, headers: init.headers ?? {}, body: init.body })
    if (onCall) onCall(url, init)
    if (url.endsWith('/file-urls/batch') && method === 'POST') {
      return jsonResponse({ code: 0, data: { batch_id: 'batch_1', file_urls: ['https://upload.example/put/1'] } })
    }
    if (url === 'https://upload.example/put/1') return { ok: true, status: 200 }
    if (url.includes('/extract-results/batch/batch_1')) {
      const state = states[Math.min(poll, states.length - 1)]
      poll += 1
      return jsonResponse({
        code: 0,
        data: {
          batch_id: 'batch_1',
          extract_result: [{
            file_name: 'lab.pdf',
            state,
            full_zip_url: state === 'done' ? 'https://cdn.example/result.zip' : null,
            err_msg: failWith,
            ...(withProgress ? { extract_progress: { total_pages: 2, extracted_pages: state === 'done' ? 2 : 1 } } : {}),
          }],
        },
      })
    }
    if (url === 'https://cdn.example/result.zip') return bytesResponse(zipBuffer)
    throw new Error(`假 fetch 没实现这个地址：${method} ${url}`)
  }
  return { fetchImpl, calls }
}

const MD = [
  '# 检验报告单',
  '采样时间：2026-09-28',
  '| 项目 | 结果 | 参考范围 | 单位 |',
  '| --- | --- | --- | --- |',
  '| CA15-3 | 18.6 | 0-25 | U/mL |',
  '| 血红蛋白 | 112 | 115-150 | g/L |',
].join('\n')

const CONTENT_LIST = [
  { type: 'text', page_idx: 0, text: '检验报告单\n采样时间：2026年9月28日 09:20' },
  { type: 'table', page_idx: 0, table_body: '<table><tr><td>项目</td><td>结果</td><td>单位</td></tr><tr><td>CA15-3</td><td>18.6</td><td>U/mL</td></tr></table>' },
]

/* ---------------- Token ---------------- */

test('Token 优先级：显式 > 私密文件 > 环境；都没有就明确报错', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pinky-mineru-'))
  const secret = join(dir, 'mineru.json')
  writeFileSync(secret, JSON.stringify({ token: 'sk-from-file' }))

  assert.deepEqual(resolveToken({ token: 'sk-explicit', env: { MINERU_TOKEN: 'sk-env' }, secretFile: secret }), { token: 'sk-explicit', source: 'explicit' })
  // 文件优先（2026-10-22 统一口径）：两者都在时用文件里那把
  assert.deepEqual(resolveToken({ env: { MINERU_TOKEN: 'sk-env' }, secretFile: secret }), { token: 'sk-from-file', source: '.secrets/mineru.json' })
  // env 只在文件缺失时兜底
  assert.deepEqual(resolveToken({ env: { MINERU_TOKEN: 'sk-env' }, secretFile: join(dir, 'nope.json') }), { token: 'sk-env', source: 'env:MINERU_TOKEN' })
  assert.deepEqual(resolveToken({ env: {}, secretFile: secret }), { token: 'sk-from-file', source: '.secrets/mineru.json' })

  assert.throws(() => resolveToken({ env: {}, secretFile: join(dir, 'nope.json') }), (error) => {
    assert.equal(error.code, 'NO_TOKEN')
    assert.match(error.message, /MINERU_TOKEN/)
    return true
  })
  rmSync(dir, { recursive: true, force: true })
})

test('Token 掩码：只露四位与两位，日志里不会出现完整 key', () => {
  assert.equal(maskToken('sk-1234567890abcdef'), 'sk-1****ef')
  assert.equal(maskToken('short'), '****')
  assert.equal(maskToken(null), '(空)')
})

test('401 直接判 UNAUTHORIZED，错误消息里不带完整 Token', async () => {
  const token = 'sk-verysecretvalue1234567890' // secret-allow：假 Token，只用来验证错误消息不泄漏
  const client = new MineruClient({
    token,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
  })
  await assert.rejects(
    () => client.createUploadBatch({ files: [{ name: 'a.pdf' }] }),
    (error) => {
      assert.equal(error.code, 'UNAUTHORIZED')
      assert.ok(!error.message.includes(token), '错误消息不能泄漏完整 key')
      assert.match(error.message, /sk-v\*\*\*\*90/)
      return true
    },
  )
})

/* ---------------- 完整解析链路 ---------------- */

test('完整链路：申请 → 上传（不带 Content-Type）→ 轮询 → 下载 → 解包', async () => {
  const zip = buildZip([
    { name: 'full.md', data: MD },
    { name: 'lab_content_list.json', data: JSON.stringify(CONTENT_LIST) },
    { name: 'images/a.jpg', data: 'fake-image' },
  ])
  const { fetchImpl, calls } = fakeMineru({ zipBuffer: zip })
  const client = new MineruClient({ token: 'sk-test', fetchImpl })
  const result = await client.parse({ bytes: Buffer.from('%PDF-1.4 fake'), filename: 'lab.pdf', intervalMs: 1 })

  assert.equal(result.batchId, 'batch_1')
  assert.equal(result.markdown, MD)
  assert.equal(result.contentList.length, 2)
  assert.equal(result.pages, 2)

  const upload = calls.find((c) => c.url === 'https://upload.example/put/1')
  assert.equal(upload.method, 'PUT')
  assert.equal(upload.headers['Content-Type'], undefined, 'MinerU 要求上传不要 Content-Type')
  const created = calls.find((c) => c.url.endsWith('/file-urls/batch'))
  assert.equal(created.headers.Authorization, 'Bearer sk-test')
  const payload = JSON.parse(created.body)
  assert.equal(payload.files[0].name, 'lab.pdf')
  assert.equal(payload.enable_formula, true)
  assert.equal(payload.model_version, 'pipeline', '默认 pipeline（2026-10-22 跨工作台统一口径）')
  assert.equal(result.modelVersion, 'pipeline', '结果里要回报实际用的模型，落 engine 用')
})

test('模型选择：默认 pipeline，只有"模型参数不被接受"才值得退回 vlm', () => {
  assert.equal(MINERU_MODEL_DEFAULT, 'pipeline')
  assert.equal(MINERU_MODEL_FALLBACK, 'vlm')
  // 接口明确说模型/版本/参数不认 → 可以退
  assert.equal(modelFallbackWorthy({ code: 'API_ERROR', message: 'unsupported model_version' }), true)
  assert.equal(modelFallbackWorthy({ code: 'BAD_INPUT', message: '模型 参数 错误' }), true)
  // 文件本身解析失败 / 没 Token / 超时 → 换模型没意义，别多花一次额度
  assert.equal(modelFallbackWorthy({ code: 'TASK_FAILED', message: 'file size is less than 30B' }), false)
  assert.equal(modelFallbackWorthy({ code: 'NO_TOKEN', message: '没有 MinerU Token' }), false)
  assert.equal(modelFallbackWorthy({ code: 'TIMEOUT', message: '等待超时' }), false)
  assert.equal(modelFallbackWorthy({ code: 'API_ERROR', message: 'quota exceeded' }), false)
  assert.equal(modelFallbackWorthy(null), false)
})

test('显式传 modelVersion 时按传入值提交，不被默认值覆盖', async () => {
  const zip = buildZip([{ name: 'full.md', data: MD }])
  const { fetchImpl, calls } = fakeMineru({ zipBuffer: zip })
  const client = new MineruClient({ token: 'sk-test', fetchImpl })
  const result = await client.parse({
    bytes: Buffer.from('%PDF-1.4 fake'), filename: 'lab.pdf', intervalMs: 1, modelVersion: MINERU_MODEL_FALLBACK,
  })
  const payload = JSON.parse(calls.find((c) => c.url.endsWith('/file-urls/batch')).body)
  assert.equal(payload.model_version, 'vlm')
  assert.equal(result.modelVersion, 'vlm')
})

test('done 后没有 extract_progress 时，页数从 content_list 的 page_idx 上限推；都没有就 null', async () => {
  const zip = buildZip([
    { name: 'full.md', data: MD },
    { name: 'x_content_list.json', data: JSON.stringify([{ type: 'text', page_idx: 0, text: 'a' }, { type: 'text', page_idx: 4, text: 'b' }]) },
  ])
  const { fetchImpl } = fakeMineru({ zipBuffer: zip, states: ['done'], withProgress: false })
  const client = new MineruClient({ token: 'sk-test', fetchImpl })
  const result = await client.parse({ bytes: Buffer.from('x'), filename: 'a.pdf', intervalMs: 1 })
  assert.equal(result.pages, 5)
})

test('state=failed 不能当成功：抛 TASK_FAILED 并带上原文原因', async () => {
  const { fetchImpl } = fakeMineru({ zipBuffer: buildZip([]), states: ['failed'], failWith: '文件格式不支持' })
  const client = new MineruClient({ token: 'sk-test', fetchImpl })
  await assert.rejects(() => client.parse({ bytes: Buffer.from('x'), filename: 'a.pdf', intervalMs: 1 }), (error) => {
    assert.equal(error.code, 'TASK_FAILED')
    assert.match(error.message, /文件格式不支持/)
    return true
  })
})

test('一直跑不完就超时，不无限等', async () => {
  const { fetchImpl } = fakeMineru({ zipBuffer: buildZip([]), states: ['running'] })
  const client = new MineruClient({ token: 'sk-test', fetchImpl })
  await assert.rejects(() => client.parse({ bytes: Buffer.from('x'), filename: 'a.pdf', intervalMs: 5, timeoutMs: 30 }), (error) => {
    assert.equal(error.code, 'TIMEOUT')
    return true
  })
})

test('ZIP 里没有 full.md 就报 NO_MARKDOWN，不返回空字符串当解析结果', async () => {
  const zip = buildZip([{ name: 'other.md', data: 'x' }])
  const { fetchImpl } = fakeMineru({ zipBuffer: zip })
  const client = new MineruClient({ token: 'sk-test', fetchImpl })
  await assert.rejects(() => client.parse({ bytes: Buffer.from('x'), filename: 'a.pdf', intervalMs: 1 }), (error) => {
    assert.equal(error.code, 'NO_MARKDOWN')
    assert.match(error.message, /other\.md/)
    return true
  })
})

test('接口返回 code≠0 时抛 API_ERROR，带 trace_id 便于排查', async () => {
  const client = new MineruClient({
    token: 'sk-test',
    fetchImpl: async () => jsonResponse({ code: -60012, msg: 'task not found or expire', trace_id: 't-1' }),
  })
  await assert.rejects(() => client.getBatchResult('nope'), (error) => {
    assert.equal(error.code, 'API_ERROR')
    assert.equal(error.detail.traceId, 't-1')
    return true
  })
})

test('空文件不提交解析（省额度，也避免拿一个空结果当成功）', async () => {
  const client = new MineruClient({ token: 'sk-test', fetchImpl: async () => { throw new Error('不该发请求') } })
  await assert.rejects(() => client.parse({ bytes: Buffer.alloc(0), filename: 'a.pdf' }), /文件内容为空/)
  await assert.rejects(() => client.parse({ bytes: Buffer.from('x'), filename: '' }), /缺少文件名/)
})

/* ---------------- ZIP 读取器 ---------------- */

test('ZIP：列条目、按名取、忽略大小写、认子目录后缀', () => {
  const zip = readZip(buildZip([
    { name: 'full.md', data: '# 标题' },
    { name: 'nested/dir/a_content_list.json', data: '[{"a":1}]' },
  ]))
  assert.deepEqual(zip.names, ['full.md', 'nested/dir/a_content_list.json'])
  assert.equal(zip.text('full.md'), '# 标题')
  assert.equal(zip.text('FULL.MD'), '# 标题')
  assert.equal(zip.text('a_content_list.json'), '[{"a":1}]', 'zip 里多一层目录也要能找到')
  assert.equal(zip.has('nothing.md'), false)
  assert.throws(() => zip.text('nothing.md'), ZipError)
})

test('ZIP：不是 ZIP 时给明确错误，不是乱码或空', () => {
  assert.throws(() => readZip(Buffer.from('这明显不是 zip，只是一段文字而已，但长度得超过二十二字节')), /找不到 ZIP 中央目录结尾/)
  assert.throws(() => readZip(Buffer.from('tiny')), /文件太小/)
})
