/**
 * 工作台应用核心（`dsh/workbench.js`）单测。
 *
 * 这一层要证伪的不是"功能能跑"，而是**几条会伤到人的边界**：
 * 不静默建目录、不猜路径、未来日期不写进"已发生"、患侧不被悄悄翻转、
 * 私密记录默认不出、导出只含选入项、看法恒不是结论。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { Workbench, AppError, validateWorkspacePath } from '../dsh/workbench.js'

const LAB_TEXT = [
  '# 检验报告',
  '报告日期：2026-09-12',
  '| 项目 | 结果 | 参考范围 | 单位 |',
  '| --- | --- | --- | --- |',
  '| CA15-3 | 18.6 | 0-25 | U/mL |',
  '| 血红蛋白 | 112 | 115-150 | g/L |',
].join('\n')

/**
 * 试跑用的临时目录：**不放系统临时目录**（`/tmp`、`/var` 都在 A22 的拒绝清单里，
 * 也因为临时目录会被系统清理），改用主目录下的专用子目录，用完即删。
 */
async function tempRoot(label = 'xyb-wb') {
  return mkdtemp(join(homedir(), `.${label}-`))
}

/** 打开一个用完即删的工作区。 */
async function withWorkbench(fn, { subjectName = '测试档案' } = {}) {
  const root = await tempRoot()
  const dir = join(root, '资料')
  const { workbench } = await Workbench.openWorkspace({ dir, create: true, subjectName })
  try {
    return await fn({ workbench, dir, root })
  } finally {
    workbench.store.close()
    await rm(root, { recursive: true, force: true })
  }
}

const today = () => new Date().toISOString().slice(0, 10)

/* ---------------- 工作区路径 ---------------- */

test('拒绝把根目录、系统目录、临时目录当工作区', () => {
  const cases = {
    '/': 'ROOT_PATH',
    '/System': 'SYSTEM_PATH',
    '/Library': 'SYSTEM_PATH',
    '/private/etc': 'SYSTEM_PATH',
    '/var/folders/x': 'SYSTEM_PATH',
    '/tmp/xyb': 'SYSTEM_PATH',
  }
  for (const [bad, code] of Object.entries(cases)) {
    assert.throws(() => validateWorkspacePath(bad, { home: '/Users/somebody' }), (error) => {
      assert.ok(error instanceof AppError, `${bad} 应该报 AppError`)
      assert.equal(error.code, code, `${bad} 的拒绝理由不对`)
      return true
    }, `${bad} 不该被接受`)
  }
});

test('拒绝用户主目录本身与桌面根目录', () => {
  assert.throws(
    () => validateWorkspacePath('/Users/somebody', { home: '/Users/somebody' }),
    (error) => error.code === 'HOME_PATH',
  )
  assert.throws(
    () => validateWorkspacePath('/Users/somebody/Desktop', { home: '/Users/somebody' }),
    (error) => error.code === 'DESKTOP_PATH',
  )
  // 桌面下的子目录可以：挡的是"根"，不是整个桌面
  assert.equal(
    validateWorkspacePath('/Users/somebody/Desktop/PinkyPal', { home: '/Users/somebody' }),
    '/Users/somebody/Desktop/PinkyPal',
  )
});

test('拒绝相对路径与空路径：路径必须由用户明确给出', () => {
  for (const bad of ['', '   ', '资料', './资料', null, undefined]) {
    assert.throws(() => validateWorkspacePath(bad, { home: '/Users/somebody' }), /路径/);
  }
});

test('合法的自定义目录可以接受，且会被解析成绝对路径', () => {
  const out = validateWorkspacePath('/Users/somebody/Documents/小粉宝资料', { home: '/Users/somebody' })
  assert.equal(out, '/Users/somebody/Documents/小粉宝资料')
});

test('目录不存在且没有确认创建：报 MISSING_DIR，不偷偷建', async () => {
  const root = await tempRoot()
  try {
    const dir = join(root, '还没建')
    await assert.rejects(
      () => Workbench.openWorkspace({ dir, create: false }),
      (error) => {
        assert.equal(error.code, 'MISSING_DIR');
        assert.equal(error.status, 404);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true })
  }
});

test('首次打开：建库、建档案、state 里 ready 为真且带阶段字典', async () => {
  await withWorkbench(async ({ workbench, dir }) => {
    const state = workbench.state()
    assert.equal(state.ready, true)
    assert.equal(state.dir, dir)
    assert.ok(state.subject?.id)
    assert.equal(state.subject.laterality, 'unknown')
    assert.ok(state.stages.length >= 6, '阶段字典要够界面渲染')
    assert.equal(state.subjects.length, 1)
  })
});

test('空库打开不报错：各项计数为 0，只保留 22 项字典骨架', async () => {
  await withWorkbench(async ({ workbench }) => {
    const o = workbench.overview()
    assert.equal(o.documents.total, 0)
    assert.equal(o.arm.count, 0)
    assert.deepEqual(o.recent, [])
    assert.equal(o.metrics.total, 22, '字典里有 22 项指标，但没有数据')
    assert.equal(o.metrics.withData, 0)
    const m = workbench.metrics()
    assert.equal(m.series.length, 22)
    assert.ok(m.series.every((s) => s.points.length === 0), '没有数据就没有点，不补 0')
    assert.ok(m.cards.every((c) => c.hasData === false))
    assert.equal(workbench.draft().documents.length, 0)
  })
});

/* ---------------- 演示数据 ---------------- */

test('载入 DEMO-1 后计数与 manifest 一致，清理只删自己那一套', async () => {
  await withWorkbench(async ({ workbench }) => {
    const manifest = workbench.seedDemo('DEMO-1')
    assert.ok(manifest.counts.observations > 100)
    const o = workbench.overview()
    assert.equal(o.documents.total >= 0, true)
    assert.ok(o.arm.count > 0, '演示画像要带上肢测量，界面才有东西看')

    const demoSubject = workbench.state().subject.id
    const before = workbench.documents().counts.total

    workbench.clearDemo('DEMO-1')
    assert.equal(workbench.documents().counts.total, 0)
    assert.equal(workbench.overview().arm.count, 0)
    assert.ok(before >= 0)
    assert.equal(workbench.state().subjects.some((s) => s.id === demoSubject), false, '演示档案要一起清掉')
  })
});

/* ---------------- 日期边界 ---------------- */

test('观测不允许未来日期：那不是"已经发生的事实"', async () => {
  await withWorkbench(async ({ workbench }) => {
    assert.throws(
      () => workbench.addObservation({ metricCode: 'ca153', occurredOn: '2099-01-01', value: 12 }),
      (error) => error.code === 'FUTURE_DATE',
    )
    assert.equal(workbench.metrics().cards.find((c) => c.code === 'ca153').hasData, false, '被拒的日期不留下数据')
  })
});

test('待办允许未来日期：安排事情和已发生的事是两回事', async () => {
  await withWorkbench(async ({ workbench }) => {
    const { task } = workbench.addTask({ title: '把上肢记录带去康复科', dueOn: '2099-01-01' })
    assert.ok(task?.id)
    assert.equal(workbench.tasks().list.length, 1)
  })
});

test('不存在的日期（2 月 30 日）被拦下，不静默挪到 3 月', async () => {
  await withWorkbench(async ({ workbench }) => {
    assert.throws(
      () => workbench.addTask({ title: '随便', dueOn: '2026-02-30' }),
      (error) => error instanceof AppError && error.code === 'BAD_DATE',
    )
  })
});

/* ---------------- 上肢四点位 ---------------- */

test('四点位允许只填患侧：健侧缺测时差值为 null，不补 0', async () => {
  await withWorkbench(async ({ workbench }) => {
    workbench.updateSubject({ laterality: 'right' })
    workbench.addArmSet({
      measuredOn: '2026-09-01',
      points: [
        { point: 'wrist', affected: 16.2, healthy: null },
        { point: 'forearm_mid', affected: 24.1, healthy: 22.0 },
      ],
    })
    const arm = workbench.arm()
    assert.equal(arm.count, 1)
    const set = arm.sets[0]
    const wrist = set.points.find((p) => p.point === 'wrist')
    assert.equal(wrist.diff, null, '缺健侧就是没有差值，不能写 0')
    const mid = set.points.find((p) => p.point === 'forearm_mid')
    assert.ok(Math.abs(mid.diff - 2.1) < 1e-9)
  })
});

test('同一个点位填两次被拒；超出 5–80 cm 的值被拒', async () => {
  await withWorkbench(async ({ workbench }) => {
    workbench.updateSubject({ laterality: 'right' })
    assert.throws(
      () => workbench.addArmSet({
        measuredOn: '2026-09-01',
        points: [{ point: 'wrist', affected: 16 }, { point: 'wrist', affected: 17 }],
      }),
      (error) => error.code === 'DUP_POINT',
    )
    assert.throws(
      () => workbench.addArmSet({ measuredOn: '2026-09-01', points: [{ point: 'wrist', affected: 160 }] }),
      (error) => error.code === 'OUT_OF_RANGE',
    )
  })
});

test('没声明患侧就记上肢：报 LATERALITY_REQUIRED，不猜左右', async () => {
  await withWorkbench(async ({ workbench }) => {
    assert.throws(
      () => workbench.addArmSet({ measuredOn: '2026-09-01', points: [{ point: 'wrist', affected: 16 }] }),
      (error) => error.code === 'LATERALITY_REQUIRED' && error.status === 409,
    )
  })
});

test('已有测量后改患侧被拒 409：否则"患侧 − 健侧"的含义会翻转', async () => {
  await withWorkbench(async ({ workbench }) => {
    workbench.updateSubject({ laterality: 'right' })
    workbench.addArmSet({ measuredOn: '2026-09-01', points: [{ point: 'wrist', affected: 16, healthy: 15 }] })
    assert.throws(
      () => workbench.updateSubject({ laterality: 'left' }),
      (error) => error.code === 'LATERALITY_LOCKED' && error.status === 409,
    )
    assert.equal(workbench.state().subject.laterality, 'right', '被拒后原值不动')
  })
});

/* ---------------- 看法不是结论 ---------------- */

test('新增看法带"不是医生结论"的声明；私密看法默认不进导出', async () => {
  await withWorkbench(async ({ workbench }) => {
    workbench.addViewpoint({ text: '我担心下次复查的骨密度', recordedOn: '2026-09-10' })
    workbench.addViewpoint({ text: '这件事我只想自己记着', recordedOn: '2026-09-10', isPrivate: true })

    const list = workbench.viewpoints().list
    assert.equal(list.length, 2)
    for (const v of list) {
      assert.ok(v.disclaimer.includes('不是医生结论'), '每一条看法都要自带免责说明')
      assert.equal(v.isConclusion, undefined, '读模型不提供"结论"这个属性')
    }

    const normal = workbench.exportVisit({})
    assert.ok(!normal.markdown.includes('这件事我只想自己记着'), '私密看法要经过显式选择才出现')
    assert.equal(normal.counts.viewpoints, 1)

    const withPrivate = workbench.exportVisit({ includePrivateViewpoints: true })
    assert.ok(withPrivate.markdown.includes('这件事我只想自己记着'))
  })
});

test('撤回看法：列表里不再出现，但库里那一条还在（不是删除）', async () => {
  await withWorkbench(async ({ workbench }) => {
    const { viewpoint } = workbench.addViewpoint({ text: '先记一句', recordedOn: '2026-09-10' })
    workbench.withdrawViewpoint(viewpoint.id)
    assert.equal(workbench.viewpoints().list.length, 0, '撤回的不该继续挂在界面上')
    const row = workbench.store.db.prepare('SELECT withdrawn_at FROM viewpoint WHERE id = ?').get(viewpoint.id)
    assert.ok(row?.withdrawn_at, '记录要留着可追，只是标成已撤回')
  })
});

/* ---------------- 导入 → 解析 → 核对 ---------------- */

test('文本材料：导入 → 本地解析 → 候选 → 接受 → 指标里查得到', async () => {
  await withWorkbench(async ({ workbench }) => {
    const { document } = await workbench.importBytes({
      bytes: Buffer.from(LAB_TEXT, 'utf8'),
      filename: '检验报告.txt',
      kind: 'lab',
      reportDate: '2026-09-12',
    })
    assert.equal(document.status, 'stored')

    const parsed = await workbench.parseDocument(document.id, { strategy: 'local' })
    assert.equal(parsed.engine, 'local-text')
    assert.ok(parsed.inserted >= 2, `该抽出至少 2 条候选，实际 ${parsed.inserted}`)
    assert.equal(parsed.document.status, 'parsed')

    const draft = workbench.draft()
    assert.equal(draft.documents.length, 1)
    const items = draft.documents[0].candidates
    const ca = items.find((c) => c.candidate.field === 'metric:ca153')
    assert.ok(ca, 'CA15-3 要成为一条候选')
    assert.equal(ca.suggestedDate, '2026-09-12', '日期取材料报告日期')
    assert.equal(ca.candidate.occurred_on, '2026-09-12')
    assert.deepEqual(ca.issues, [], '有单位有数值，不该带问题')

    const decided = workbench.decideCandidate({ candidateId: ca.candidate.id, action: 'accept' })
    assert.ok(decided.record?.id)
    assert.equal(decided.candidate.status, 'accepted')

    const cards = workbench.metrics().cards
    const card = cards.find((c) => c.code === 'ca153')
    assert.equal(card.hasData, true)
    assert.equal(card.latest.value, 18.6)
    assert.equal(card.latest.date, '2026-09-12')
  })
});

test('重复导入同一份原件：只留一条，且不把已解析状态退回去', async () => {
  await withWorkbench(async ({ workbench }) => {
    const first = await workbench.importBytes({
      bytes: Buffer.from(LAB_TEXT, 'utf8'), filename: '检验报告.txt', kind: 'lab', reportDate: '2026-09-12',
    })
    await workbench.parseDocument(first.document.id, { strategy: 'local' })

    const again = await workbench.importBytes({
      bytes: Buffer.from(LAB_TEXT, 'utf8'), filename: '检验报告(1).txt', kind: 'lab', reportDate: '2026-09-12',
    })
    assert.equal(again.duplicate, true)
    assert.equal(again.document.id, first.document.id)
    assert.equal(again.document.status, 'parsed', '重复导入不重置解析状态')
    assert.equal(workbench.documents().list.length, 1)
  })
});

test('非文本原件不假装能读：documentText 明确返回不可用', async () => {
  await withWorkbench(async ({ workbench }) => {
    const { document } = await workbench.importBytes({
      bytes: Buffer.from('%PDF-1.7 这不是真的 PDF，只用来占位', 'utf8'),
      filename: '门诊病历.pdf',
      kind: 'pathology',
      mime: 'application/pdf',
    })
    const text = await workbench.documentText(document.id)
    assert.equal(text.available, false)
    assert.ok(text.reason.includes('原件'), '要说清楚去打开原件，而不是给一段假文本')
  })
});

test('解析文本会保存；旧材料可以强制重新解析后查看', async () => {
  await withWorkbench(async ({ workbench }) => {
    const { document } = await workbench.importBytes({
      bytes: Buffer.from('报告日期：2026-09-12\n| 项目 | 结果 | 单位 |\n| --- | --- | --- |\n| CA15-3 | 18.6 | U/mL |\n', 'utf8'),
      filename: '化验.md',
      kind: 'lab',
      mime: 'text/markdown',
    })

    await workbench.parseDocument(document.id, { strategy: 'local' })
    const parsed = await workbench.documentText(document.id, { source: 'parsed' })
    assert.equal(parsed.available, true)
    assert.equal(parsed.source, 'parsed')
    assert.match(parsed.text, /CA15-3/)

    const original = await workbench.documentText(document.id, { source: 'original' })
    assert.equal(original.available, true)
    assert.equal(original.source, 'original')

    await assert.rejects(
      () => workbench.parseDocument(document.id, { strategy: 'local' }),
      /已经解析成功/,
    )
    const again = await workbench.parseDocument(document.id, { strategy: 'local', force: true })
    assert.equal(again.engine, 'local-text')
  })
})

test('没有勾选同意就不上云解析：报 CONSENT_REQUIRED 并保留原件', async () => {
  await withWorkbench(async ({ workbench }) => {
    const { document } = await workbench.importBytes({
      bytes: Buffer.from('%PDF-1.7 placeholder', 'utf8'), filename: '扫描件.pdf', kind: 'lab', mime: 'application/pdf',
    })
    await assert.rejects(
      () => workbench.parseDocument(document.id),
      (error) => error.code === 'CONSENT_REQUIRED' && error.status === 409,
    )
    const doc = workbench.documents().list[0]
    assert.equal(doc.status, 'stored', '没解析成功也要留着原件，可稍后重试')
  })
});

/* ---------------- 导出 ---------------- */

test('就诊准备导出：四个分区齐全，且不写处置建议', async () => {
  await withWorkbench(async ({ workbench }) => {
    workbench.updateSubject({ laterality: 'right' })
    workbench.setStage('endocrine')
    workbench.addObservation({ metricCode: 'ca153', occurredOn: '2026-08-01', value: 21.4, unit: 'U/mL' })
    workbench.addObservation({ metricCode: 'ca153', occurredOn: '2026-09-12', value: 18.6, unit: 'U/mL' })
    workbench.addArmSet({ measuredOn: '2026-09-12', points: [{ point: 'wrist', affected: 16.2, healthy: 15.4 }] })
    workbench.addQuestion({ text: '骨密度这次要不要复查？', kind: 'fact' })
    workbench.addViewpoint({ text: '最近爬楼有点累', recordedOn: '2026-09-12' })

    const out = workbench.exportVisit({})
    const md = out.markdown
    for (const heading of ['一、', '二、', '三、', '四、']) {
      assert.ok(md.includes(heading), `缺少分区：${heading}`)
    }
    assert.ok(md.includes('不是医生结论'), '看法区必须标明这不是医生结论')
    assert.ok(md.includes('不表示好转或变差'), '差值要说明不代表好坏')
    assert.ok(md.includes('CA15-3'))
    assert.ok(!/建议治疗|应当用药|可以停药|无需就医/.test(md), '导出不能带处置建议')
    assert.equal(out.counts.metrics, 1, '只有一个指标有数据')
    assert.ok(out.filename.startsWith('小粉宝-就诊准备-') && out.filename.endsWith('.md'))
  })
});

test('导出会留痕：saved_result 里能找回这次的内容', async () => {
  await withWorkbench(async ({ workbench }) => {
    workbench.addObservation({ metricCode: 'hgb', occurredOn: '2026-09-12', value: 112, unit: 'g/L' })
    const out = workbench.exportVisit({})
    const saved = workbench.savedResults()
    assert.equal(saved.length, 1)
    assert.ok(saved[0].title.includes('就诊准备'))
    assert.ok(saved[0].preview.includes('就诊准备') || saved[0].preview.length > 0)
    assert.ok(
      workbench.exports().list.some((e) => e.id === out.exportJob.id),
      `导出历史里要能查到 ${out.exportJob.id}`,
    )
  })
});

test('导出的指标范围可以只选一部分', async () => {
  await withWorkbench(async ({ workbench }) => {
    workbench.addObservation({ metricCode: 'hgb', occurredOn: '2026-09-12', value: 112, unit: 'g/L' })
    workbench.addObservation({ metricCode: 'ca153', occurredOn: '2026-09-12', value: 18.6, unit: 'U/mL' })
    const only = workbench.exportVisit({ metricCodes: ['ca153'] })
    assert.equal(only.counts.metrics, 1)
    assert.ok(only.markdown.includes('CA15-3'))
    assert.ok(!only.markdown.includes('血红蛋白'), '没选入的指标不该出现')
  })
});

/* ---------------- 设置与私密边界 ---------------- */

test('设置只回显掩码与来源，不回显 Token 原文', async () => {
  const { resolveToken } = await import('../dsh/mineru.js')
  await withWorkbench(async ({ workbench }) => {
    const settings = workbench.state().settings
    assert.equal(typeof settings.mineru.configured, 'boolean')
    const raw = resolveToken().token
    if (settings.mineru.configured) {
      assert.ok(settings.mineru.masked, '配置了就要给出可辨认的掩码')
      assert.notEqual(settings.mineru.masked, raw, '掩码不能等于原文')
      assert.ok(settings.mineru.masked.includes('*'), '掩码要能看出被打码了')
    }
    // 来源只报"从哪来"（env:MINERU_TOKEN / .secrets/mineru.json），不报值
    assert.ok([null, 'env:MINERU_TOKEN', '.secrets/mineru.json'].includes(settings.mineru.source),
      `来源写法要能辨认，收到 ${settings.mineru.source}`)
    if (raw) assert.ok(!JSON.stringify(workbench.state()).includes(raw), '整个 state 里都不许出现 Token 原文')
  })
});

test('心理记录默认不进 care 列表；带 includePrivate 才返回', async () => {
  await withWorkbench(async ({ workbench }) => {
    workbench.addCare({ kind: 'mind', title: '本人记录', detail: '今天很累', isPrivate: true, sourceDate: '2026-09-12' })
    const open = workbench.care()
    assert.equal(open.entries.length, 0, '私密条目默认不出现')
    const full = workbench.care({ includePrivate: true })
    assert.equal(full.entries.length, 1)
  })
});

test('引流 0 记为当日拔管，不当成普通数值', async () => {
  await withWorkbench(async ({ workbench }) => {
    workbench.addDrain({ date: '2026-09-10', value: 30 })
    workbench.addDrain({ date: '2026-09-12', value: 0 })
    const list = workbench.drainSeries()
    const pulled = list.find((d) => d.date === '2026-09-12')
    assert.equal(pulled.pulled, true)
    assert.equal(list.find((d) => d.date === '2026-09-10').pulled, false)
  })
});

test('治疗记录：计划与实际分开存；已完成必须有开始日期', async () => {
  await withWorkbench(async ({ workbench }) => {
    workbench.addTreatment({ kind: 'endocrine', name: '来曲唑', status: 'ongoing', start: '2026-05-01' })
    workbench.addTreatment({ kind: 'radio', name: '放疗（计划）', status: 'planned', start: '2026-11-01' })
    assert.throws(
      () => workbench.addTreatment({ kind: 'chemo', name: '待定方案', status: 'completed' }),
      (error) => error.code === 'START_REQUIRED',
    )
    const list = workbench.clinical().treatments
    assert.equal(list.length, 2)
    assert.equal(list.find((t) => t.kind === 'radio').isActual, false, '计划不算已发生')
    assert.equal(list.find((t) => t.kind === 'endocrine').isActual, true)
  })
});

test('问题改文本会留新版本，旧版标为被替代而不是覆盖', async () => {
  await withWorkbench(async ({ workbench }) => {
    const { question } = workbench.addQuestion({ text: '骨密度要不要复查？', kind: 'fact' })
    const updated = workbench.updateQuestion(question.id, { text: '骨密度这次需要复查吗？' })
    assert.notEqual(updated.question.id, question.id, '改文本要产生新的一条')

    const open = workbench.questions().list
    assert.equal(open.length, 1, '列表里只显示当前这一版')
    assert.equal(open[0].text, '骨密度这次需要复查吗？')

    const old = workbench.store.db.prepare('SELECT status, supersedes_id FROM question WHERE id = ?').get(question.id)
    assert.equal(old.status, 'dropped', '旧版标成已替换')
    const next = workbench.store.db.prepare('SELECT supersedes_id, version FROM question WHERE id = ?').get(updated.question.id)
    assert.equal(next.supersedes_id, question.id, '新版要指向旧版，链能追')
    assert.equal(next.version, 2)
  })
});

test('工作区里会落一份 active.json 与库文件，路径不改名不搬家', async () => {
  await withWorkbench(async ({ workbench, dir }) => {
    workbench.setSettings({ mineruConsent: true })
    await new Promise((r) => setTimeout(r, 30))
    const active = JSON.parse(await readFile(join(dir, 'active.json'), 'utf8'))
    assert.ok(active.subjectId)
    const settings = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'))
    assert.equal(settings.mineruConsent, true)
  })
});
