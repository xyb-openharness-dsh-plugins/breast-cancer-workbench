import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { APP_INFO, version, displayVersion, channel, channelLabel, build, commit } from '../lib/version.js'

const root = new URL('../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const VERSION = read('VERSION').trim()

test('lib/version.js 的 version 与仓库根 VERSION 一致', () => {
  assert.equal(version, VERSION)
})

test('version 是合法 SemVer，且不带 v 前缀', () => {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  assert.ok(!version.startsWith('v'), '数据里的版本号不加 v，显示时才加（VERSIONING §2）')
})

test('displayVersion 是 v + version', () => {
  assert.equal(displayVersion, `v${version}`)
})

test('channel 只能是 prototype / beta / stable，且有对应的人话标签', () => {
  assert.ok(['prototype', 'beta', 'stable'].includes(channel))
  assert.equal(typeof channelLabel, 'string')
  assert.ok(channelLabel.length > 0)
})

test('build 是 YYYY-MM-DD 或 local，commit 是短哈希或 local', () => {
  assert.match(build, /^(\d{4}-\d{2}-\d{2}|local)$/)
  assert.match(commit, /^([0-9a-f]{7,40}|local)$/)
})

test('APP_INFO 四字段与具名导出一致，且被冻结', () => {
  assert.equal(APP_INFO.version, version)
  assert.equal(APP_INFO.displayVersion, displayVersion)
  assert.equal(APP_INFO.build, build)
  assert.equal(APP_INFO.channel, channel)
  assert.equal(APP_INFO.channelLabel, channelLabel)
  assert.ok(Object.isFrozen(APP_INFO))
})

test('package.json 的 version 与 VERSION 一致（打包前的最低要求）', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.version, VERSION)
})

test('许可证已定 MIT，且根目录有对应的 LICENSE（市场硬门槛）', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.license, 'MIT')
  assert.match(read('LICENSE'), /^MIT License/)
  assert.ok(pkg.files.includes('LICENSE'), 'LICENSE 必须进打包白名单')
})
