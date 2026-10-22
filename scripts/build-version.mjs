#!/usr/bin/env node
/**
 * 生成 lib/version.js。
 *
 * 唯一来源是仓库根目录的 VERSION。build / commit 来自 git；没有 git 时写 local，
 * 不猜日期、不编造哈希。生成结果确定：同一次提交重复跑不会改动文件。
 *
 * 用法：
 *   node scripts/build-version.mjs           写入（内容没变不落盘）
 *   node scripts/build-version.mjs --check   只校验，与 VERSION 不一致时退出码 1
 *
 * 渠道由环境变量 PINKYPAL_CHANNEL 指定，三选一：prototype / beta / stable，默认 prototype。
 * 规则见 docs/VERSIONING.md §4。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'lib', 'version.js')
const checkOnly = process.argv.includes('--check')

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const CHANNELS = ['prototype', 'beta', 'stable']
const CHANNEL_LABELS = {
  prototype: '交互原型 · 未接入 DSH',
  beta: '测试版 · 数据仅在本机',
  stable: '正式版 · 数据仅在本机',
}

const raw = readFileSync(join(root, 'VERSION'), 'utf8').trim()
if (!SEMVER.test(raw)) {
  console.error(`✗ VERSION 不是合法语义化版本：${raw}`)
  process.exit(1)
}

const channel = process.env.PINKYPAL_CHANNEL || 'prototype'
if (!CHANNELS.includes(channel)) {
  console.error(`✗ PINKYPAL_CHANNEL 只能是 ${CHANNELS.join(' / ')}，收到：${channel}`)
  process.exit(1)
}

function git(args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** git 的"是否成功"要用退出码判断：--is-ancestor 成功时没有输出，不能靠字符串区分。 */
function gitOk(args) {
  return spawnSync('git', ['-C', root, ...args], { stdio: 'ignore' }).status === 0
}

const commit = git(['rev-parse', '--short', 'HEAD']) || 'local'
const build = git(['log', '-1', '--format=%cs']) || 'local'

const generated = `// 本文件由 scripts/build-version.mjs 生成，请勿手改。
// 唯一来源：仓库根目录的 VERSION。改版本先改 VERSION，再跑 npm run build:version。
// 生成规则见 docs/VERSIONING.md §4。
export const version = '${raw}'
export const build = '${build}'
export const channel = '${channel}'
export const commit = '${commit}'

export const displayVersion = \`v\${version}\`
export const channelLabel = '${CHANNEL_LABELS[channel]}'

export const APP_INFO = Object.freeze({
  version,
  displayVersion,
  build,
  channel,
  channelLabel,
  commit,
})
`

if (checkOnly) {
  if (!existsSync(target)) {
    console.error('✗ 缺少 lib/version.js，请先运行 npm run build:version')
    process.exit(1)
  }
  const actual = readFileSync(target, 'utf8')
  // `commit` 记的是"生成时的 HEAD"。生成物一提交，HEAD 就前进一格，这一行必然落后。
  // 所以比对时忽略它，单独验"它是不是本仓库的真实历史提交"——滞后可以，编造不行。
  const stripCommit = (s) => s.replace(/^export const commit = '.*'$/m, "export const commit = ''")
  if (stripCommit(actual) !== stripCommit(generated)) {
    console.error('✗ lib/version.js 与 VERSION 不同步，请运行 npm run build:version')
    process.exit(1)
  }
  const recorded = /^export const commit = '(.*)'$/m.exec(actual)?.[1] ?? ''
  if (recorded !== commit && recorded !== 'local') {
    const known = gitOk(['merge-base', '--is-ancestor', recorded, 'HEAD'])
    const exists = gitOk(['cat-file', '-e', `${recorded}^{commit}`])
    if (!exists || !known) {
      console.error(`✗ lib/version.js 里的 commit ${recorded} 不是本仓库历史提交，请重新生成`)
      process.exit(1)
    }
  }
  const lag = recorded === commit ? '' : `，commit ${recorded} 滞后于 HEAD`
  console.log(`✓ lib/version.js 与 VERSION 同步：v${raw}（build ${build} · ${channel}${lag}）`)
  process.exit(0)
}

if (existsSync(target) && readFileSync(target, 'utf8') === generated) {
  console.log(`= lib/version.js 未变化：v${raw}（build ${build} · ${channel}）`)
  process.exit(0)
}

writeFileSync(target, generated)
console.log(`✓ 已生成 lib/version.js：v${raw}（build ${build} · ${channel}）`)
