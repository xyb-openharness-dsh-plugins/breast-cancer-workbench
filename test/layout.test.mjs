import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  PANEL, HOST_LIMITS, MEASURE_TABLE_MIN_PX, AGENT_PANE,
  businessPanePx, needsFullRowCard, clampAgentWidth, assertPanelConfig,
} from '../lib/layout.js'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('customFrame：面板可拖宽、可收起都依赖它；业务在左、原生会话在右', () => {
  // 依据：宿主 packages/dsh-desktop-workbenches/client.js 只在 standard 分栏里写死
  // --workbench-business-width，服务没有拖宽/关闭接口；customFrame 才把原生会话
  // 作为 conversation prop 交给我们排版。详见 docs/AGENT-PANE-DESIGN.md。
  assert.equal(PANEL.customFrame, true)
  assert.equal(PANEL.businessSide, 'left')
  assert.deepEqual(assertPanelConfig(), [])
})

test('businessWidth 落区间、不取上限，且与会话默认宽度互补', () => {
  assert.ok(PANEL.businessWidth >= HOST_LIMITS.min && PANEL.businessWidth <= HOST_LIMITS.max)
  assert.notEqual(PANEL.businessWidth, HOST_LIMITS.max)
  assert.equal(PANEL.businessWidth, 1 - AGENT_PANE.default)
})

test('会话面板可拖区间 25%–45%，默认 35%，步进不超过区间一半', () => {
  assert.equal(AGENT_PANE.default, 0.35)
  assert.equal(AGENT_PANE.min, 0.25)
  assert.equal(AGENT_PANE.max, 0.45)
  assert.ok(AGENT_PANE.min < AGENT_PANE.default && AGENT_PANE.default < AGENT_PANE.max)
  assert.ok(AGENT_PANE.step > 0 && AGENT_PANE.step <= (AGENT_PANE.max - AGENT_PANE.min) / 2)
  assert.ok(AGENT_PANE.narrowBelowPx > 0 && AGENT_PANE.drawerMaxPx > 0)
})

test('clampAgentWidth：越界夹回边界，非数字回落默认', () => {
  assert.equal(clampAgentWidth(0.1), AGENT_PANE.min)
  assert.equal(clampAgentWidth(0.9), AGENT_PANE.max)
  assert.equal(clampAgentWidth(0.35), 0.35)
  assert.equal(clampAgentWidth(NaN), AGENT_PANE.default)
  assert.equal(clampAgentWidth(undefined), AGENT_PANE.default)
  assert.equal(clampAgentWidth('0.3'), 0.3)
})

test('业务区像素宽度按窗口折算（1440→936 / 1280→832 / 1200→780）', () => {
  assert.equal(businessPanePx(1440), 936)
  assert.equal(businessPanePx(1280), 832)
  assert.equal(businessPanePx(1200), 780)
})

test('六列表卡宽判定与实测一致：936 下的 313px 卡要整行，1280 下的 443px 卡不用', () => {
  assert.equal(MEASURE_TABLE_MIN_PX, 417)
  assert.equal(needsFullRowCard(313), true)
  assert.equal(needsFullRowCard(417), false)
  assert.equal(needsFullRowCard(443), false)
})

test('越界配置会被自检拦下', () => {
  // customFrame 关掉 = 面板不可拖不可收起，必须被拦
  assert.notDeepEqual(assertPanelConfig({ businessSide: 'left', businessWidth: 0.65, customFrame: false }), [])
  assert.notDeepEqual(assertPanelConfig({ businessSide: 'left', businessWidth: 0.8, customFrame: true }), [])
  assert.notDeepEqual(assertPanelConfig({ businessSide: 'left', businessWidth: 0.7, customFrame: true }), [])
  assert.notDeepEqual(assertPanelConfig({ businessSide: 'top', businessWidth: 0.65, customFrame: true }), [])
  // 显式传默认参数（构建脚本就是这么调的）必须通过，否则注入会误拦
  assert.deepEqual(
    assertPanelConfig({ businessSide: 'left', businessWidth: 0.65, customFrame: true }, AGENT_PANE),
    [],
  )
  // 默认宽度脱离 25%–45%、或补不齐 65% 业务区，也要被拦
  assert.notDeepEqual(
    assertPanelConfig({ businessSide: 'left', businessWidth: 0.65, customFrame: true },
      { ...AGENT_PANE, default: 0.6 }),
    [],
  )
  assert.notDeepEqual(
    assertPanelConfig({ businessSide: 'left', businessWidth: 0.55, customFrame: true }, AGENT_PANE),
    [],
  )
})

test('文档与代码同值：AGENT-PANE-DESIGN 写明 customFrame 与 25%–45%', () => {
  assert.ok(existsSync(new URL('../docs/AGENT-PANE-DESIGN.md', import.meta.url)), '缺 docs/AGENT-PANE-DESIGN.md')
  const t = read('docs/AGENT-PANE-DESIGN.md')
  assert.match(t, /customFrame/)
  assert.match(t, /25%–45%|25%–45|0\.25–0\.45/)
  assert.match(t, /35%|0\.35/)
})

test('文档与代码同值：SPEC / UI-DESIGN / RELEASE 仍写默认业务区 0.65', () => {
  for (const f of ['docs/SPEC.md', 'docs/UI-DESIGN.md', 'docs/RELEASE.md', 'docs/DEV-PLAN.md']) {
    assert.match(read(f), /0\.65/, `${f} 应写明默认业务区宽度 0.65`)
  }
})
