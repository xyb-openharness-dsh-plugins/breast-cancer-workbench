/**
 * 「与 Agent 讨论」上下文草稿（dsh/agent-context.js）单测。
 *
 * 钉的不是"文本好不好看"，而是三条会伤到人的边界：
 * 1. 只抄记录：出现的每个值都能在读模型里找到，缺的地方写"没有"，不补不猜；
 * 2. 核对 ≠ 审核：草稿核对页**只带已接受的事实**，未核对候选只报条数、不带值；
 * 3. 私密默认不带：`includePrivate` 不给就绝不出现，给了要在文里标明"本次已勾选"。
 * 另外钉住不含本机资料目录路径（讨论文本会被贴进会话，路径带用户名）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { Workbench } from '../dsh/workbench.js'
import { AGENT_SCOPES, buildAgentContext } from '../dsh/agent-context.js'

async function withWb(fn) {
  const root = await mkdtemp(join(homedir(), '.xyb-agentctx-'))
  try {
    const dir = join(root, '资料')
    const { workbench } = await Workbench.openWorkspace({ dir, create: true, subjectName: '测试' })
    try {
      const out = await fn(workbench, dir)
      return out
    } finally {
      workbench.store.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('只接受三个范围；我的关注（没有真实试验数据）不提供入口', () => {
  assert.deepEqual([...AGENT_SCOPES], ['timeline', 'prep', 'draft'])
  assert.throws(() => buildAgentContext({}, 'following'), /不支持的上下文范围/)
})

test('一图秀：指标值、日期与 CTCAE 对照都进上下文，且不带本机路径', async () => {
  const r = await withWb((wb, dir) => {
    wb.addObservation({ metricCode: 'anc', occurredOn: '2026-10-15', value: 1.4, method: '血细胞分析仪' })
    wb.addObservation({ metricCode: 'ca153', occurredOn: '2026-09-01', value: 18.6 })
    wb.addTreatment({ kind: 'chemo', name: 'TC 方案第 3 周期', start: '2026-09-20' })
    const out = buildAgentContext(wb, 'timeline', { codes: ['anc', 'ca153'], now: new Date('2026-10-20T02:00:00Z') })
    return { out, dir }
  })
  const { out, dir } = r
  assert.equal(out.ready, true)
  assert.equal(out.prompt.includes(dir), false, '不把本机资料目录路径贴进会话')
  assert.match(out.prompt, /中性粒细胞/)
  assert.match(out.prompt, /2026\.10\.15 1\.4/)
  assert.match(out.prompt, /CA15-3/)
  assert.match(out.prompt, /2 级/, '最新值对照 CTCAE 要写进上下文')
  assert.match(out.prompt, /不是诊断/)
  assert.match(out.prompt, /TC 方案第 3 周期/, '治疗节点要带上，才看得懂时间关系')
  assert.match(out.prompt, /请你怎么用/)
  assert.match(out.prompt, /请不要/)
  assert.match(out.prompt, /不下诊断/)
})

test('一图秀：单点写"看不出趋势"，方法变化写"不可直接比较"', async () => {
  const out = await withWb((wb) => {
    wb.addObservation({ metricCode: 'cea', occurredOn: '2026-09-01', value: 2.1 })
    wb.addObservation({ metricCode: 'ca153', occurredOn: '2026-05-01', value: 18.6, method: '化学发光法' })
    wb.addObservation({ metricCode: 'ca153', occurredOn: '2026-07-01', value: 22.1, method: '电化学发光法' })
    return buildAgentContext(wb, 'timeline', { codes: ['cea', 'ca153'] })
  })
  const metricLines = out.blocks.find((b) => b.key === 'metrics').lines.join('\n')
  assert.match(metricLines, /只有 1 次记录/)
  assert.match(metricLines, /不可直接比较/)
  assert.match(metricLines, /2026\.07\.01/)
})

test('一图秀：选了没记录的指标，缺项里写明"没有任何记录"，不画成 0', async () => {
  const out = await withWb((wb) => {
    wb.addObservation({ metricCode: 'anc', occurredOn: '2026-10-15', value: 1.4 })
    return buildAgentContext(wb, 'timeline', { codes: ['anc', 'hgb'] })
  })
  const metricLines = out.blocks.find((b) => b.key === 'metrics').lines.join('\n')
  assert.match(metricLines, /血红蛋白.*还没有任何记录/)
  assert.ok(out.gaps.some((g) => g.includes('血红蛋白') && g.includes('没有任何记录')))
  assert.match(out.prompt, /缺项/)
})

test('一图秀：一条记录都没有时 ready=false，不产出空壳草稿', async () => {
  const out = await withWb((wb) => buildAgentContext(wb, 'timeline', {}))
  assert.equal(out.ready, false)
  assert.equal(out.prompt, '')
  assert.match(out.reason, /还没有/)
})

test('就诊准备：问题与待办进上下文；私密看法默认不带，勾选后才带并标明', async () => {
  const out = await withWb((wb) => {
    wb.addQuestion({ text: '来曲唑期间手指晨僵，需要做哪些评估？' })
    wb.addQuestion({ text: '我很担心复发', kind: 'view' })
    wb.addTask({ title: '把上肢记录带去康复科', dueOn: '2026-10-28', kind: 'hospital' })
    wb.addViewpoint({ text: '总觉得这条手臂比上个月沉', recordedOn: '2026-10-10' })
    wb.addViewpoint({ text: '亲密关系受影响，不太好开口', recordedOn: '2026-10-11', isPrivate: true })
    const plain = buildAgentContext(wb, 'prep', {})
    const withPrivate = buildAgentContext(wb, 'prep', { includePrivate: true })
    return { plain, withPrivate }
  })
  assert.match(out.plain.prompt, /来曲唑期间手指晨僵/)
  assert.match(out.plain.prompt, /（我的看法 \/ 担心，不是结论）/)
  assert.match(out.plain.prompt, /把上肢记录带去康复科/)
  assert.match(out.plain.prompt, /总觉得这条手臂比上个月沉/)
  assert.equal(out.plain.prompt.includes('亲密关系受影响'), false, '私密看法默认不出现')
  assert.ok(out.plain.excluded.some((e) => e.label.includes('私密看法')))
  assert.match(out.withPrivate.prompt, /亲密关系受影响/)
  assert.match(out.withPrivate.prompt, /私密，本次已勾选带入/)
  assert.equal(out.withPrivate.excluded.length, 0)
})

test('草稿核对：只带已接受的事实；未核对候选只报条数、不带值', async () => {
  const out = await withWb((wb) => {
    const subjectId = wb.requireSubject()
    const now = new Date().toISOString()
    wb.store.db.prepare(`INSERT INTO document (id, subject_id, kind, filename, sha256, imported_at, storage_path, status)
      VALUES ('doc1', ?, 'lab', '2026-09-28 化验单.pdf', ?, ?, 'docs/a.pdf', 'parsed')`)
      .run(subjectId, 'a'.repeat(64), now)
    const add = (id, field, text, num, unit, status) => wb.store.db.prepare(
      `INSERT INTO candidate (id, document_id, field, value_text, value_num, unit, status)
       VALUES (?, 'doc1', ?, ?, ?, ?, ?)`,
    ).run(id, field, text, num, unit, status)
    add('c1', 'metric:anc', '1.4', 1.4, '10⁹/L', 'accepted')
    add('c2', 'metric:ca153', '31.7', 31.7, 'U/mL', 'edited')
    add('c3', 'metric:cea', '9.9', 9.9, 'ng/mL', 'pending')
    return buildAgentContext(wb, 'draft', {})
  })
  assert.equal(out.ready, true)
  assert.match(out.prompt, /中性粒细胞.*1\.4/)
  assert.match(out.prompt, /CA15-3.*31\.7/)
  assert.match(out.prompt, /修改后接受/)
  assert.equal(out.prompt.includes('9.9'), false, '未核对候选的数值绝不能进上下文')
  assert.ok(out.gaps.some((g) => g.includes('1 项待核对') && g.includes('未纳入')))
  assert.match(out.prompt, /不等于医学审核/)
})

test('草稿核对：一条都没核对时 ready=false，指路去核对而不是给空草稿', async () => {
  const out = await withWb((wb) => buildAgentContext(wb, 'draft', {}))
  assert.equal(out.ready, false)
  assert.match(out.reason, /已接受/)
})

test('输出的形状对界面友好：blocks 有 label/lines，prompt 行数与 lineCount 一致', async () => {
  const out = await withWb((wb) => {
    wb.addObservation({ metricCode: 'anc', occurredOn: '2026-10-15', value: 1.4 })
    return buildAgentContext(wb, 'timeline', { codes: ['anc'] })
  })
  for (const block of out.blocks) {
    assert.equal(typeof block.label, 'string')
    assert.ok(Array.isArray(block.lines) && block.lines.length > 0)
  }
  assert.equal(out.lineCount, out.prompt.split('\n').length)
  assert.equal(out.label, '病情一图秀')
})
