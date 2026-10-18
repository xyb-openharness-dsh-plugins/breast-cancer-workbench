#!/usr/bin/env node
/**
 * 包级静态校验（V1 的第 1 步，对应 RELEASE §3「1) 语法与静态合同」）。
 *
 * 官方《工作台开发规范》§3.2–3.5 有一串"必须"项，缺一项就装不上或加载失败。
 * 这些项全是**静态**的，不需要真安装就能查，所以放进 `npm run check`：
 * 装机前先在这里挡一道，而不是等 Harness 启动失败再回头猜。
 *
 * 注意：`pnpm pack` 之后的清单核对、体积与 hash 属于 V1 的第 2–7 步，
 * 需要真的产物，本脚本不做（`docs/RELEASE.md` §3 有逐条命令）。
 *
 * 用法：node scripts/check-package.mjs
 * 退出码：0 全部满足；1 有"必须"项不满足。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const has = (p) => existsSync(join(root, p))

const problems = []
const notes = []
const ok = (label) => notes.push(`✓ ${label}`)
const bad = (label, detail) => problems.push(`${label}${detail ? `：${detail}` : ''}`)

const pkg = JSON.parse(read('package.json'))
const { PLUGIN_ID, API_PREFIX, HOME_DIR, UI_ENTRY } = await import('../lib/identity.js')
const { PANEL } = await import('../lib/layout.js')

/* 1) package.json 的合同字段 */
const CONTRACT = [
  ['name', typeof pkg.name === 'string' && pkg.name.length > 0, '缺少或非字符串'],
  ['version（完整 SemVer）', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(pkg.version ?? '')), String(pkg.version)],
  ['type: module', pkg.type === 'module', String(pkg.type)],
  ['main 指向服务端入口', pkg.main === './dsh/index.js', String(pkg.main)],
  ['exports["."] 与 main 同指', pkg.exports?.['.'] === './dsh/index.js', String(pkg.exports?.['.'])],
  ['exports["./client"]', pkg.exports?.['./client'] === './lib/client.js', String(pkg.exports?.['./client'])],
  ['exports["./package.json"]', pkg.exports?.['./package.json'] === './package.json', String(pkg.exports?.['./package.json'])],
  ['exports["./cordis.patch.yml"]', pkg.exports?.['./cordis.patch.yml'] === './cordis.patch.yml', String(pkg.exports?.['./cordis.patch.yml'])],
  ['dsh.bundle.patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml', String(pkg.dsh?.bundle?.patch)],
  ['dsh.client.platform = web', pkg.dsh?.client?.platform === 'web', String(pkg.dsh?.client?.platform)],
  ['dsh.client.inject 含 dsh-desktop-workbenches', (pkg.dsh?.client?.inject ?? []).includes('dsh-desktop-workbenches'), JSON.stringify(pkg.dsh?.client?.inject)],
  ['files 含 cordis.patch.yml', (pkg.files ?? []).includes('cordis.patch.yml'), ''],
  ['files 含服务端 dsh/', (pkg.files ?? []).includes('dsh'), ''],
  ['files 含客户端 lib/', (pkg.files ?? []).includes('lib'), ''],
  ['license 已声明（且不是 UNLICENSED）', typeof pkg.license === 'string' && pkg.license !== 'UNLICENSED', String(pkg.license)],
]
for (const [label, pass, detail] of CONTRACT) {
  if (pass) ok(label)
  else bad(label, detail)
}

/* 2) peerDependencies：宿主提供的包不能进 dependencies，否则会装出第二份宿主代码 */
const peers = Object.keys(pkg.peerDependencies ?? {})
const deps = Object.keys(pkg.dependencies ?? {})
for (const need of ['@deepseek-ai/cordis', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-host-webserver']) {
  if (peers.includes(need)) ok(`peerDependencies 含 ${need}`)
  else bad(`peerDependencies 缺少 ${need}`, '宿主提供的包必须声明为 peer')
}
const leaked = deps.filter((d) => d.startsWith('@deepseek-ai/'))
if (leaked.length) bad('dependencies 里不应出现宿主包', leaked.join(', '))
else ok('dependencies 里没有宿主包（不会装出第二份宿主代码）')

/* 3) 声明出去的文件都要真的存在 */
for (const p of ['dsh/index.js', 'lib/client.js', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
  if (has(p)) ok(`${p} 存在`)
  else bad(`${p} 缺失`, 'exports/files 指向了不存在的文件')
}

/* 4) cordis.patch.yml：空文件与纯注释会让 Harness 启动失败 */
const patch = has('cordis.patch.yml') ? read('cordis.patch.yml') : ''
const patchBody = patch.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).join('\n')
if (!patchBody.trim()) bad('cordis.patch.yml 为空或只有注释', '官方：这会导致启动失败，没有条目就写 []')
else {
  ok('cordis.patch.yml 非空（有实际条目）')
  const id = patch.match(/^\s*-\s*id:\s*(\S+)/m)?.[1]
  const name = patch.match(/^\s*name:\s*'?([^'\n]+)'?/m)?.[1]
  if (id === PLUGIN_ID) ok(`patch 的 id 与 lib/identity.js 一致（${PLUGIN_ID}）`)
  else bad('patch 的 id 与 lib/identity.js 不一致', `patch=${id} 期望=${PLUGIN_ID}`)
  if (name === pkg.name) ok('patch 的 name 写的是 npm 包名')
  else bad('patch 的 name 必须是 npm 包名', `patch=${name} 期望=${pkg.name}`)
  if (patch.includes(`dshHomePath('${HOME_DIR}')`)) ok(`patch 的 root 用 dshHomePath('${HOME_DIR}')`)
  else bad('patch 的 root 与 lib/identity.js 的 HOME_DIR 不一致', HOME_DIR)
}

/* 5) 客户端：必须是已构建好的单文件，且注册信息齐全 */
if (has('lib/client.js')) {
  const client = read('lib/client.js')
  const repo = client.match(/const REPOSITORY = '([^']+)'/)?.[1] ?? ''
  const canonicalRepo = (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '')
    .replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '')
  const checks = [
    ['客户端用 __ModuleLoader__.load 注册', /window\.__ModuleLoader__\.load\(/.test(client)],
    ['load 的 id 等于 npm 包名', client.includes(`id: '${pkg.name}'`)],
    ['register 给了 title', /desktopWorkbenches\.register\([\s\S]{0,400}?title:/.test(client)],
    ['register 给了 repository（官方必填）', /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(repo) && client.includes('repository: REPOSITORY')],
    ['repository 与 package.json 同值', repo === canonicalRepo, `client=${repo} pkg=${canonicalRepo}`],
    ['register 给了业务组件', /desktopWorkbenches\.register\([\s\S]*\}, Panel\)/.test(client)],
    ['注销交给 ctx.effect', /ctx\.effect\(\(\) =>/.test(client)],
    ['单文件：没有 import / 本地 require', !/^\s*import\s/m.test(client) && !/require\(['"]\.\.?\//.test(client)],
    ['面板参数与 lib/layout.js 同值', client.includes(`businessSide: '${PANEL.businessSide}'`) && client.includes(`businessWidth: ${PANEL.businessWidth}`)],
    ['customFrame 与 lib/layout.js 同值（面板可拖可收依赖它）', client.includes(`customFrame: ${PANEL.customFrame === true}`)],
    ['customFrame 下自带 AI 对话入口（不依赖宿主关闭接口）', /'打开 AI 对话'/.test(client) && /'收起 AI 对话'/.test(client)],
    ['splitter 语义与键盘可达（role=separator + tabIndex）', /role: 'separator'/.test(client) && /tabIndex: 0/.test(client)],
    ['接口前缀与 lib/identity.js 同值', client.includes(UI_ENTRY)],
  ]
  for (const [label, pass] of checks) {
    if (pass) ok(label)
    else bad(label)
  }
}

/* 6) 服务端入口：Config 必须是 Schemastery schema，且转出宿主合同 */
if (has('dsh/index.js')) {
  const entry = read('dsh/index.js')
  const entryChecks = [
    ['入口导出 Schemastery 的 Config', /import Schema from '@deepseek-ai\/schemastery'/.test(entry) && /export const Config = Schema\.object\(/.test(entry)],
    ['入口转出 name / inject / apply', /export \{[^}]*\bapply\b[^}]*\} from '\.\/host\.js'/.test(entry)],
    ['接口前缀取自 lib/identity.js（不在入口写第二份）', /API_PREFIX[^}]*\} from '\.\.\/lib\/identity\.js'/.test(entry)],
  ]
  for (const [label, pass] of entryChecks) {
    if (pass) ok(label)
    else bad(label)
  }
}

/* 7) 包内不得带本机绝对路径与未授权内容 */
const ABSOLUTE = /\/Users\/|\/home\/|C:\\/
for (const p of ['package.json', 'cordis.patch.yml', 'lib/client.js']) {
  if (!has(p)) continue
  const hit = read(p).split('\n').findIndex((l) => ABSOLUTE.test(l))
  if (hit >= 0) bad(`${p} 第 ${hit + 1} 行含本机绝对路径`)
  else ok(`${p} 无本机绝对路径`)
}
for (const p of ['.secrets', '.workbuddy']) {
  if ((pkg.files ?? []).includes(p)) bad(`files 含 ${p}`, '不得随包分发')
}

/* 8) 版本与 VERSION 一致 */
const versionFile = read('VERSION').trim()
if (pkg.version === versionFile) ok(`package.json 版本与 VERSION 一致（v${versionFile}）`)
else bad('package.json 版本与 VERSION 不一致', `pkg=${pkg.version} VERSION=${versionFile}`)

/* ---- 输出 ---- */
for (const line of notes) console.log(line)
if (problems.length) {
  console.error(`\n✗ 包级合同不满足 ${problems.length} 项（官方 §3 的"必须"项，装不上就是这些）：`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\n依据：~/Downloads/dsh-desktop/docs/workbench-standard.zh.md §3；判据见 docs/RELEASE.md §2.1。')
  process.exit(1)
}
console.log(`\n✓ 包级合同通过（${notes.length} 项）：${pkg.name} v${pkg.version} · ${PLUGIN_ID} · ${UI_ENTRY}`)
console.log('  仓库：' + (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '（未填）'))
console.log(`  面板：${PANEL.businessSide} ${PANEL.businessWidth} · customFrame=${PANEL.customFrame}`)
