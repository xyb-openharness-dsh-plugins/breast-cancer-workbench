#!/usr/bin/env node
/**
 * 独立启动（M2 第二段）：`npm start -- --workspace /你的/资料目录`
 *
 * 这是"开发版工作台"的本地入口，不依赖 DSH 宿主。参数：
 *   --workspace, -w  <绝对路径>   资料目录；不传则启动后由界面选择（不静默建目录）
 *   --port, -p       <端口>       默认 4173，0 表示系统分配
 *   --host           <地址>       默认 127.0.0.1（只监听本机）
 *   --demo           <DEMO-1..2>  启动后载入一套演示画像并切过去
 *   --open                        启动后用系统默认浏览器打开
 *
 * 退出时关闭数据库；Ctrl-C 不会丢数据（每次写入已提交）。
 */
import { spawn } from 'node:child_process'
import { Workbench } from '../dsh/workbench.js'
import { startWorkbenchServer } from '../dsh/server.js'
import { version } from '../lib/version.js'

function parseArgs(argv) {
  const out = { port: 4173, host: '127.0.0.1', workspace: null, demo: null, open: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (!value || value.startsWith('-')) throw new Error(`${arg} 需要一个值`)
      i += 1
      return value
    }
    if (arg === '--workspace' || arg === '-w') out.workspace = next()
    else if (arg === '--port' || arg === '-p') out.port = Number(next())
    else if (arg === '--host') out.host = next()
    else if (arg === '--demo') out.demo = next()
    else if (arg === '--open') out.open = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else throw new Error(`不认识的参数：${arg}`)
  }
  return out
}

const HELP = `
小粉宝工作台 · 开发版启动

  npm start -- --workspace /Users/你/Documents/PinkyPal
  npm start -- --workspace /Users/你/Documents/PinkyPal --demo DEMO-1
  npm start                      # 先启动，再在界面里选资料目录

参数：--workspace/-w  --port/-p  --host  --demo  --open
`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }
  if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) {
    throw new Error('端口必须是 0–65535 的整数')
  }

  let workbench = null
  if (args.workspace) {
    const opened = await Workbench.openWorkspace({ dir: args.workspace, create: true })
    workbench = opened.workbench
    console.log(`· 资料目录：${workbench.dir}${opened.created ? '（本次新建）' : ''}`)
  } else {
    console.log('· 未指定 --workspace：启动后在页面上选择资料目录（不会自动建目录）')
  }

  if (args.demo) {
    if (!workbench) throw new Error('--demo 需要同时给 --workspace')
    const manifest = workbench.seedDemo(args.demo)
    console.log(`· 已载入 ${manifest.datasetId}（${manifest.label}）：观测 ${manifest.counts.observations} 条 / 测量 ${manifest.counts.measurements} 条`)
  }

  const { server, port, host } = await startWorkbenchServer({
    port: args.port,
    host: args.host,
    workbench,
    version,
  })
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/`
  console.log(`\n✓ 小粉宝工作台 v${version} 已启动：${url}`)
  console.log('  这是本机开发版：数据只存在你选的资料目录里，不上传；Ctrl-C 结束。\n')

  if (args.open) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref()
  }

  const shutdown = async () => {
    await new Promise((resolve) => server.close(resolve))
    if (workbench) workbench.store.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(`✗ 启动失败：${error.message}`)
  process.exit(1)
})
