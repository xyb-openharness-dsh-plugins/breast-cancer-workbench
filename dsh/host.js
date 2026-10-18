/**
 * 宿主接入层（M5）。
 *
 * 这一层只做三件事，别的都交给 `WorkbenchServer`：
 * 1. 把宿主 webServer 转来的前缀请求交给同一个 handler（路径改写规则在 `server.js`）；
 * 2. 按官方做法先过一遍 `connection.requestRejection`，没通过就不碰业务；
 * 3. 记住用户上次选定的资料目录，重启后恢复——**只在用户已确认过的位置上恢复，
 *    目录不在了就留空让界面重新选，绝不自动建同名目录**（官方 §6）。
 *
 * 为什么 `Config` 不在这里：`Config` 必须是 Schemastery schema，那会引一个只有宿主
 * 才提供的依赖，让本文件在本仓库里不可测。所以 `dsh/index.js` 单独导出 `Config`，
 * 这里保持零依赖、可单测。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Workbench } from './workbench.js'
import { WorkbenchServer, sendJson } from './server.js'
import { PLUGIN_ID, API_PREFIX, HOME_DIR } from '../lib/identity.js'
import { version } from '../lib/version.js'

export { PLUGIN_ID, API_PREFIX, HOME_DIR }

/** 插件条目 id：必须与 cordis.patch.yml 的 insert[].id 同值。 */
export const name = PLUGIN_ID

/** 宿主注入的服务。connection 用于本机授权判断；webServer 用于挂接口前缀。 */
export const inject = ['webServer', 'connection']

/** 资料目录指针文件名。放在宿主给的配置目录里，业务数据仍然在用户自己选的地方。 */
export const POINTER_FILE = 'workspace.json'

/* ---------------- 授权闸 ---------------- */

/**
 * 造一个宿主 handler。授权判断沿用官方示例的写法：
 * `requestRejection` 返回 undefined 表示放行，返回数字表示用那个状态码拒绝；
 * 宿主没有这个方法时一律 403——宁可挡住，也不假装通过。
 */
export function createHostHandler(server, ctx = null) {
  return async function hostHandler(req, res) {
    const rejection = ctx?.connection?.requestRejection?.(req)
    if (!ctx?.connection?.requestRejection || rejection !== undefined) {
      sendJson(res, rejection || 403, {
        error: { code: 'HOST_AUTH_REQUIRED', message: '需要通过 DSH 本机授权会话访问这个工作台' },
      })
      return
    }
    await server.handle(req, res)
  }
}

/* ---------------- 资料目录指针 ---------------- */

async function readPointer(root) {
  try {
    const parsed = JSON.parse(await readFile(join(root, POINTER_FILE), 'utf8'))
    return typeof parsed?.dir === 'string' && parsed.dir ? parsed.dir : null
  } catch {
    return null
  }
}

async function writePointer(root, dir) {
  try {
    await mkdir(root, { recursive: true })
    await writeFile(join(root, POINTER_FILE), `${JSON.stringify({ dir, savedAt: new Date().toISOString() })}\n`, 'utf8')
  } catch (error) {
    console.error('[host] 资料目录指针没能写入，下次启动需要重新选择：', error?.message ?? error)
  }
}

/**
 * 恢复上次的位置。目录不在了就返回 null，让界面走"重新选择"那条路。
 * 不自动创建同名目录：官方 §6 明确禁止。
 */
export async function restoreWorkspace(root) {
  if (!root) return null
  const dir = await readPointer(root)
  if (!dir) return null
  try {
    const { workbench } = await Workbench.openWorkspace({ dir, create: false })
    return workbench
  } catch (error) {
    console.error(`[host] 上次的位置 ${dir} 打不开，交给界面重新选择：`, error?.message ?? error)
    return null
  }
}

/* ---------------- 挂载 ---------------- */

/**
 * 最近一次挂载的 server（测试与诊断用）。cordis 约定 apply 的返回值只能是
 * disposer 函数或 null/undefined，所以实例不走返回值，走这里。
 */
let MOUNTED = null
export function mountedServer() {
  return MOUNTED
}

/**
 * 宿主调用。注册一个 prefix 路由。**非 async、无返回值**——cordis 对 apply
 * 返回值有严格检查（resolve 出普通对象会报 Invalid effect，实测踩过），
 * 恢复资料目录是异步的，交给后台 promise，不阻塞挂载。
 *
 * @param {object} ctx 宿主上下文，至少要有 `webServer`、`connection`、`effect`
 * @param {{ root?: string }} [config] 宿主给的配置；`root` 是宿主分配给本工作台的目录
 */
export function apply(ctx, config = {}) {
  const root = typeof config?.root === 'string' && config.root ? config.root : null
  const server = new WorkbenchServer({
    version,
    basePath: API_PREFIX,
    apiBase: API_PREFIX,
    runtime: 'host',
    onWorkspace: root ? (dir) => writePointer(root, dir) : null,
  })
  MOUNTED = server

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: createHostHandler(server, ctx),
    }),
    `${PLUGIN_ID}: api`,
  )

  void restoreWorkspace(root).then((workbench) => {
    if (workbench && MOUNTED === server) server.workbench = workbench
  })
}
