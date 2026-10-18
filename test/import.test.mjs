/**
 * 导入 → 解析 → 候选 → 核对（M2 第一段）。
 * 重点不是"能写进去"，而是**几条不能省的边界**：重复导入不重建、失败不产候选、
 * 候选不接受结论、接受≠临床审核、写入失败不留半条。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { openStore } from '../dsh/store.js'
import { ImportService, ImportError, assertMedicalDate } from '../dsh/import.js'

const SHA = 'a'.repeat(64)

function setup() {
  const store = openStore({ file: ':memory:' })
  const ws = store.createWorkspace({ name: '测试' })
  const subject = store.createSubject({ workspaceId: ws.id, displayName: '测试档案', laterality: 'left' })
  const importer = new ImportService(store)
  const importDoc = (over = {}) => importer.importDocument({
    subjectId: subject.id, kind: 'lab', filename: '化验单.pdf', sha256: SHA,
    storagePath: 'docs/a.pdf', bytes: 1024, ...over,
  })
  return { store, ws, subject, importer, importDoc }
}

function parsedDoc(ctx) {
  const { document } = ctx.importDoc()
  const job = ctx.importer.startParse(document.id, { engine: 'test' })
  ctx.importer.finishParse(job.id)
  return document
}

test('重复导入同一文件：只建一条，返回首次导入时间', () => {
  const ctx = setup()
  const first = ctx.importDoc()
  assert.equal(first.duplicate, false)

  const second = ctx.importDoc()
  assert.equal(second.duplicate, true)
  assert.equal(second.document.id, first.document.id)
  assert.equal(second.importedAt, first.importedAt)
  assert.equal(ctx.importer.documentsFor(ctx.subject.id).length, 1)
})

test('重复导入不会让已解析的材料退回未解析', () => {
  const ctx = setup()
  const { document } = ctx.importDoc()
  const job = ctx.importer.startParse(document.id)
  ctx.importer.finishParse(job.id)
  const again = ctx.importDoc()
  assert.equal(again.duplicate, true)
  assert.equal(again.document.status, 'parsed')
})

test('导入参数不对就不收：哈希格式、绝对路径、上跳路径', () => {
  const ctx = setup()
  assert.throws(() => ctx.importDoc({ sha256: 'abc' }), /64 位小写十六进制/)
  assert.throws(() => ctx.importDoc({ storagePath: '/Users/someone/原件.pdf' }), /相对路径/)
  assert.throws(() => ctx.importDoc({ storagePath: '../外部/原件.pdf' }), /不能跳出工作区/)
  assert.throws(() => ctx.importDoc({ kind: 'unknown_kind' }), /资料类型只能是/)
})

test('解析失败：原件留着、状态为 parse_failed、不产生候选、可重试', () => {
  const ctx = setup()
  const { document } = ctx.importDoc()
  const job = ctx.importer.startParse(document.id)
  ctx.importer.failParse(job.id, { errorCode: 'blurry', errorText: '图像模糊' })

  const after = ctx.importer.documentsFor(ctx.subject.id)[0]
  assert.equal(after.status, 'parse_failed')
  assert.equal(ctx.importer.candidatesFor(document.id).length, 0)
  assert.throws(
    () => ctx.importer.addCandidate({ documentId: document.id, field: 'metric:wbc', valueText: '4.2' }),
    /解析成功后才能生成候选/,
  )

  const jobs = ctx.importer.jobsFor(document.id)
  assert.equal(jobs[0].status, 'failed')
  assert.equal(jobs[0].error_code, 'blurry')

  // 重试并成功后可继续
  const retry = ctx.importer.startParse(document.id)
  ctx.importer.finishParse(retry.id)
  assert.equal(ctx.importer.documentsFor(ctx.subject.id)[0].status, 'parsed')
  const added = ctx.importer.addCandidate({ documentId: document.id, field: 'metric:wbc', valueText: '4.2', unit: '10⁹/L' })
  assert.equal(added.merged, false)
})

test('候选按 (材料, 字段, 原文值) 去重：同值合并，不同值并存', () => {
  const ctx = setup()
  const document = parsedDoc(ctx)
  const a = ctx.importer.addCandidate({ documentId: document.id, field: 'metric:wbc', valueText: '4.2', unit: '10⁹/L' })
  const b = ctx.importer.addCandidate({ documentId: document.id, field: 'metric:wbc', valueText: '4.2', unit: '10⁹/L' })
  const c = ctx.importer.addCandidate({ documentId: document.id, field: 'metric:wbc', valueText: '5.1', unit: '10⁹/L' })
  assert.equal(b.merged, true)
  assert.equal(b.candidate.id, a.candidate.id)
  assert.equal(c.merged, false)
  assert.equal(ctx.importer.candidatesFor(document.id).length, 2)
})

test('候选不接结论类字段、不接没有材料的孤儿候选', () => {
  const ctx = setup()
  const document = parsedDoc(ctx)
  assert.throws(
    () => ctx.importer.addCandidate({ documentId: document.id, field: 'pathology:er', valueText: '90%' }),
    /还没有入库映射/,
  )
  assert.throws(() => ctx.importer.addCandidate({ documentId: document.id, field: 'wbc', valueText: '4.2' }), /命名空间/)
  assert.throws(() => ctx.importer.addCandidate({ field: 'metric:wbc', valueText: '4.2' }), /必须挂在某份材料下/)
  assert.throws(() => ctx.importer.addCandidate({ documentId: document.id, field: 'metric:wbc', valueText: '  ' }), /必须带原文值/)
})

test('草稿视图：问题在读取时算，冲突/缺单位/非数字/低把握度都能报出来', () => {
  const ctx = setup()
  const document = parsedDoc(ctx)
  ctx.importer.addCandidate({ documentId: document.id, field: 'metric:ca153', valueText: '18.6', valueNum: 18.6, unit: 'U/mL', method: 'ECLIA' })
  ctx.importer.addCandidate({ documentId: document.id, field: 'metric:ca153', valueText: '24.1', valueNum: 24.1, unit: 'U/mL', method: 'CLIA' })
  ctx.importer.addCandidate({ documentId: document.id, field: 'metric:alt', valueText: '31', valueNum: 31, unit: null })
  ctx.importer.addCandidate({ documentId: document.id, field: 'metric:hgb', valueText: '无法辨认', confidence: 0.3 })

  const draft = ctx.importer.draftFor(ctx.subject.id)
  assert.equal(draft.documents.length, 1)
  const entry = draft.documents[0]
  assert.equal(entry.counts.pending, 4)

  const byText = (t) => entry.candidates.find((x) => x.candidate.value_text === t)
  assert.ok(byText('18.6').issues.some((i) => i.code === 'conflict'))
  assert.ok(byText('24.1').issues.some((i) => i.code === 'conflict'))
  assert.ok(byText('31').issues.some((i) => i.code === 'unit_missing'))
  assert.ok(byText('无法辨认').issues.some((i) => i.code === 'value_not_number'))
  assert.ok(byText('无法辨认').issues.some((i) => i.code === 'low_confidence'))
  assert.equal(byText('18.6').canAutoAccept, false)
})

test('接受候选：写 record + observation，回填 record_id，但不冒充临床审核', () => {
  const ctx = setup()
  const document = parsedDoc(ctx)
  const { candidate } = ctx.importer.addCandidate({
    documentId: document.id, field: 'metric:ca153', valueText: '18.6', valueNum: 18.6,
    unit: 'U/mL', method: 'ECLIA', pageRef: 'p1',
  })
  const result = ctx.importer.decideCandidate({ candidateId: candidate.id, action: 'accept', occurredOn: '2026-09-28' })

  assert.equal(result.candidate.status, 'accepted')
  assert.ok(result.candidate.decided_at)
  assert.equal(result.candidate.record_id, result.record.id)
  assert.equal(result.record.kind, 'lab')
  assert.equal(result.record.occurred_on, '2026-09-28')
  assert.equal(result.record.source_kind, 'report_transcription')
  assert.equal(result.record.source_document_id, document.id)
  assert.equal(result.record.reviewed_by, null, '接受只表示录入，不是临床审核')
  assert.equal(result.fact.metric_code, 'ca153')
  assert.equal(result.fact.value_num, 18.6)
  assert.equal(result.fact.lab_method, 'ECLIA')
  assert.equal(result.fact.record_id, result.record.id)
})

test('修改后接受：必须给改动，且状态记 edited、值按改动落库', () => {
  const ctx = setup()
  const document = parsedDoc(ctx)
  const { candidate } = ctx.importer.addCandidate({
    documentId: document.id, field: 'metric:wbc', valueText: '4,2', valueNum: null, unit: '10⁹/L',
  })
  assert.throws(() => ctx.importer.decideCandidate({ candidateId: candidate.id, action: 'edit', occurredOn: '2026-09-28' }), /必须给出改了什么/)

  const result = ctx.importer.decideCandidate({
    candidateId: candidate.id, action: 'edit', occurredOn: '2026-09-28',
    patch: { value_text: '4.2', value_num: 4.2 },
  })
  assert.equal(result.candidate.status, 'edited')
  assert.equal(result.fact.value_num, 4.2)
})

test('拒绝不写事实层；终态不可再决定', () => {
  const ctx = setup()
  const document = parsedDoc(ctx)
  const { candidate } = ctx.importer.addCandidate({ documentId: document.id, field: 'metric:alt', valueText: '31', unit: 'U/L' })

  const rejected = ctx.importer.decideCandidate({ candidateId: candidate.id, action: 'reject' })
  assert.equal(rejected.candidate.status, 'rejected')
  assert.equal(rejected.record, null)
  assert.equal(ctx.store.currentRecords(ctx.subject.id).length, 0)

  assert.throws(
    () => ctx.importer.decideCandidate({ candidateId: candidate.id, action: 'accept', occurredOn: '2026-09-28' }),
    /不能重复决定/,
  )
})

test('写入失败不留半条：值不是数字时，候选仍是 pending、记录数为 0', () => {
  const ctx = setup()
  const document = parsedDoc(ctx)
  const { candidate } = ctx.importer.addCandidate({
    documentId: document.id, field: 'metric:hgb', valueText: '约 110', unit: 'g/L',
  })
  assert.throws(
    () => ctx.importer.decideCandidate({
      candidateId: candidate.id, action: 'edit', occurredOn: '2026-09-28', patch: { value_text: '约 110' },
    }),
    /不是数字/,
  )
  const after = ctx.store.db.prepare('SELECT status FROM candidate WHERE id = ?').get(candidate.id)
  assert.equal(after.status, 'pending')
  assert.equal(ctx.store.currentRecords(ctx.subject.id).length, 0)
})

test('日期必须有着落且过常识边界：候选自带则直接用，都没有就拒绝，不拿导入时间顶', () => {
  const ctx = setup()
  const document = parsedDoc(ctx)
  const bare = ctx.importer.addCandidate({ documentId: document.id, field: 'metric:wbc', valueText: '4.2', unit: '10⁹/L' })

  assert.equal(bare.candidate.occurred_on, null, '没读到日期就留空，不编')
  assert.throws(
    () => ctx.importer.decideCandidate({ candidateId: bare.candidate.id, action: 'accept' }),
    /缺「发生日期」/,
  )
  assert.throws(() => ctx.importer.decideCandidate({ candidateId: bare.candidate.id, action: 'accept', occurredOn: '2999-01-01' }), /不能晚于今天/)
  assert.throws(() => ctx.importer.decideCandidate({ candidateId: bare.candidate.id, action: 'accept', occurredOn: '2026-02-31' }), /真实日期/)
  assert.throws(() => assertMedicalDate('1899-12-31'), /早于 1940/)

  // 解析时读到日期 → 存进候选 → 核对时不必再问一遍
  const dated = ctx.importer.addCandidate({
    documentId: document.id, field: 'metric:hgb', valueText: '112', valueNum: 112, unit: 'g/L', occurredOn: '2026-09-28',
  })
  assert.equal(dated.candidate.occurred_on, '2026-09-28')
  const ok = ctx.importer.decideCandidate({ candidateId: dated.candidate.id, action: 'accept' })
  assert.equal(ok.record.occurred_on, '2026-09-28')
  assert.equal(ok.candidate.occurred_on, '2026-09-28')
})

test('报告日期与候选日期：导入时可带、重复导入只补空、批量接受按 候选>传入>报告日期 取值', () => {
  const ctx = setup()
  const first = ctx.importer.importDocument({
    subjectId: ctx.subject.id, kind: 'lab', sha256: 'b'.repeat(64),
    filename: '待核对.pdf', storagePath: 'docs/x.pdf', reportDate: '2026-08-01',
  })
  assert.equal(first.document.report_date, '2026-08-01')

  // 重复导入带日期：原文件没日期则补上，有则不动
  const again = ctx.importer.importDocument({
    subjectId: ctx.subject.id, kind: 'lab', sha256: 'b'.repeat(64),
    filename: '待核对.pdf', storagePath: 'docs/x.pdf', reportDate: '2026-08-02',
  })
  assert.equal(again.duplicate, true)
  assert.equal(again.dateBackfilled, false, '已有日期就不覆盖')
  assert.equal(again.document.report_date, '2026-08-01')

  const doc = ctx.importer.finishParse(ctx.importer.startParse(first.document.id).id)
  assert.equal(doc.status, 'succeeded')
  ctx.importer.addCandidate({ documentId: first.document.id, field: 'metric:wbc', valueText: '4.2', valueNum: 4.2, unit: '10⁹/L' })
  ctx.importer.addCandidate({ documentId: first.document.id, field: 'metric:hgb', valueText: '112', valueNum: 112, unit: 'g/L', occurredOn: '2026-08-05' })

  const draft = ctx.importer.draftFor(ctx.subject.id).documents.find((d) => d.document.id === first.document.id)
  assert.equal(draft.reportDate, '2026-08-01')
  assert.deepEqual(draft.candidates.map((c) => c.suggestedDate).sort(), ['2026-08-01', '2026-08-05'])

  const { accepted, skipped } = ctx.importer.acceptDocumentCandidates({ documentId: first.document.id })
  assert.equal(skipped.length, 0)
  assert.deepEqual(accepted.map((r) => r.occurred_on).sort(), ['2026-08-01', '2026-08-05'], '候选自带日期优先于报告日期')
})

test('没有报告日期、候选也没日期时批量接受不猜日期，只报 date_missing', () => {
  const ctx = setup()
  const document = parsedDoc(ctx)
  ctx.importer.addCandidate({ documentId: document.id, field: 'metric:wbc', valueText: '4.2', valueNum: 4.2, unit: '10⁹/L' })
  const { accepted, skipped } = ctx.importer.acceptDocumentCandidates({ documentId: document.id })
  assert.equal(accepted.length, 0)
  assert.deepEqual(skipped[0].reasons, ['date_missing'])
  assert.equal(ctx.store.db.prepare("SELECT COUNT(*) AS n FROM candidate WHERE status = 'pending'").get().n, 1)
})

test('批量接受一份材料：有问题的候选留 pending 并给出原因，不静默跳过', () => {
  const ctx = setup()
  const document = parsedDoc(ctx)
  ctx.importer.addCandidate({ documentId: document.id, field: 'metric:wbc', valueText: '4.2', valueNum: 4.2, unit: '10⁹/L' })
  ctx.importer.addCandidate({ documentId: document.id, field: 'metric:hgb', valueText: '112', valueNum: 112, unit: 'g/L' })
  ctx.importer.addCandidate({ documentId: document.id, field: 'metric:alt', valueText: '31', valueNum: 31, unit: null })
  ctx.importer.addCandidate({ documentId: document.id, field: 'metric:ca153', valueText: '18.6', valueNum: 18.6, unit: 'U/mL' })
  ctx.importer.addCandidate({ documentId: document.id, field: 'metric:ca153', valueText: '24.1', valueNum: 24.1, unit: 'U/mL' })

  const { accepted, skipped } = ctx.importer.acceptDocumentCandidates({ documentId: document.id, occurredOn: '2026-09-28' })
  assert.equal(accepted.length, 2)
  assert.equal(skipped.length, 3)
  const reasons = skipped.flatMap((s) => s.reasons)
  assert.ok(reasons.includes('unit_missing'))
  assert.ok(reasons.includes('conflict'))
  assert.equal(ctx.store.db.prepare("SELECT COUNT(*) AS n FROM candidate WHERE status = 'pending'").get().n, 3)
})

test('治疗类候选也能落库，并带上实际开始日期', () => {
  const ctx = setup()
  const document = parsedDoc(ctx)
  const { candidate } = ctx.importer.addCandidate({
    documentId: document.id, field: 'treatment:endocrine', valueText: '他莫昔芬 20mg 每日',
  })
  const result = ctx.importer.decideCandidate({ candidateId: candidate.id, action: 'accept', occurredOn: '2025-05-20' })
  assert.equal(result.fact.kind, 'endocrine')
  assert.equal(result.fact.name, '他莫昔芬 20mg 每日')
  assert.equal(result.fact.actual_start, '2025-05-20')
  assert.equal(result.record.kind, 'treatment')
})

test('错误码可被界面区分（不是只给一句话）', () => {
  const ctx = setup()
  assert.throws(
    () => ctx.importDoc({ sha256: 'x' }),
    (error) => error instanceof ImportError && error.code === 'BAD_HASH',
  )
})

/* ---------------- MinerU 解析接入 ---------------- */

const stubMineru = (payload) => ({ parse: async () => payload })

test('MinerU 解析：候选入库、报告日期回填、任务与材料状态一起前进', async () => {
  const ctx = setup()
  const { document } = ctx.importDoc()
  const markdown = [
    '检验报告单',
    '采样时间：2026年9月28日 09:20',
    '| 项目 | 结果 | 单位 |',
    '| --- | --- | --- |',
    '| CA15-3 | 18.6 | U/mL |',
    '| 白细胞 | 4.2 | 10^9/L |',
  ].join('\n')

  const result = await ctx.importer.parseWithMineru({
    documentId: document.id,
    bytes: Buffer.from('%PDF-1.4 fake'),
    client: stubMineru({ markdown, contentList: null, pages: 1, batchId: 'batch_x' }),
  })

  assert.equal(result.job.status, 'succeeded')
  assert.equal(result.document.status, 'parsed')
  assert.equal(result.document.report_date, '2026-09-28', '解析读到的报告日期要落库，核对时不用再问')
  assert.equal(result.inserted, 2)
  assert.equal(result.batchId, 'batch_x')

  const draft = ctx.importer.draftFor(ctx.subject.id).documents[0]
  assert.deepEqual(draft.candidates.map((c) => c.suggestedDate), ['2026-09-28', '2026-09-28'])

  // 候选自带日期 → 逐条接受不必再传 occurredOn
  const ca = draft.candidates.find((c) => c.candidate.field === 'metric:ca153')
  const decided = ctx.importer.decideCandidate({ candidateId: ca.candidate.id, action: 'accept' })
  assert.equal(decided.record.occurred_on, '2026-09-28')
  assert.equal(ctx.store.db.prepare('SELECT COUNT(*) AS n FROM observation').get().n, 1)
})

test('MinerU 失败：整笔回滚，不产候选，材料标 parse_failed 可重试', async () => {
  const ctx = setup()
  const { document } = ctx.importDoc()
  const boom = Object.assign(new Error('MinerU 解析失败：文件格式不支持'), { code: 'TASK_FAILED' })
  await assert.rejects(
    () => ctx.importer.parseWithMineru({
      documentId: document.id, bytes: Buffer.from('x'), client: { parse: async () => { throw boom } },
    }),
    /文件格式不支持/,
  )

  const doc = ctx.store.db.prepare('SELECT * FROM document WHERE id = ?').get(document.id)
  assert.equal(doc.status, 'parse_failed')
  const job = ctx.importer.jobsFor(document.id)[0]
  assert.equal(job.status, 'failed')
  assert.equal(job.error_code, 'TASK_FAILED')
  assert.equal(job.error_text, 'MinerU 解析失败：文件格式不支持')
  assert.equal(ctx.importer.candidatesFor(document.id).length, 0, '失败不能留下候选（A2）')
})

test('MinerU 解析结果里认不出指标：材料仍是 parsed，候选为空并给警告', async () => {
  const ctx = setup()
  const { document } = ctx.importDoc()
  const result = await ctx.importer.parseWithMineru({
    documentId: document.id,
    bytes: Buffer.from('x'),
    client: stubMineru({ markdown: '一段没有指标名的文字，也没有日期。', contentList: null, pages: 1, batchId: 'b' }),
  })
  assert.equal(result.document.status, 'parsed')
  assert.equal(result.inserted, 0)
  assert.ok(result.warnings.length >= 1)
  assert.equal(ctx.importer.draftFor(ctx.subject.id).counts.pending, 0)
})
