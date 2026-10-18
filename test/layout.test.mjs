import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PANEL, HOST_LIMITS, MEASURE_TABLE_MIN_PX, businessPanePx, needsFullRowCard, assertPanelConfig } from '../lib/layout.js'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('D34 分栏 0.65 + 2026-10-18 用户定：业务在左、原生会话在右，不用 customFrame', () => {
  assert.equal(PANEL.businessSide, 'left')
  assert.equal(PANEL.businessWidth, 0.65)
  assert.equal(PANEL.customFrame, false)
  assert.deepEqual(assertPanelConfig(), [])
})

test('businessWidth 落在宿主允许区间内，且不取上限 0.7', () => {
  assert.ok(PANEL.businessWidth >= HOST_LIMITS.min && PANEL.businessWidth <= HOST_LIMITS.max)
  assert.notEqual(PANEL.businessWidth, HOST_LIMITS.max)
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
  assert.notDeepEqual(assertPanelConfig({ businessSide: 'right', businessWidth: 0.8, customFrame: false }), [])
  assert.notDeepEqual(assertPanelConfig({ businessSide: 'right', businessWidth: 0.7, customFrame: false }), [])
  assert.notDeepEqual(assertPanelConfig({ businessSide: 'right', businessWidth: 0.65, customFrame: true }), [])
  assert.notDeepEqual(assertPanelConfig({ businessSide: 'top', businessWidth: 0.65, customFrame: false }), [])
})

test('文档与代码同值：SPEC / UI-DESIGN 都写了 0.65，且都写明不用 customFrame', () => {
  for (const f of ['docs/SPEC.md', 'docs/UI-DESIGN.md', 'docs/RELEASE.md', 'docs/DEV-PLAN.md']) {
    const t = read(f)
    assert.match(t, /0\.65/, `${f} 应写明 businessWidth 0.65`)
  }
  assert.match(read('docs/UI-DESIGN.md'), /customFrame/)
})
