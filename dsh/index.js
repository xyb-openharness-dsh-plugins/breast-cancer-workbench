/**
 * 包的入口：DSH 插件的服务端侧。
 *
 * 宿主（Harness）加载的就是这个文件，需要 `name` / `inject` / `Config` / `apply`
 * 四样（`workbench-standard` §3.4）：
 * - `name`、`inject`、`apply` 在 `dsh/host.js`，那一层零依赖、可单测；
 * - `Config` 在本文件——官方要求它**必须**是 Schemastery schema，而 Schemastery
 *   是宿主提供的 peer 依赖，本仓库里装不上。为了不让 `apply()` 跟着变得不可测，
 *   只把这一行留在入口。
 *
 * 独立启动仍然走 `npm start -- --workspace <目录>`（`scripts/dev-server.mjs`），
 * 用的是同一份 `WorkbenchServer.handle`。
 */
import Schema from '@deepseek-ai/schemastery'
import { version, displayVersion, channel, channelLabel, build, commit } from '../lib/version.js'
import { PLUGIN_ID, API_PREFIX, HOME_DIR, UI_ENTRY } from '../lib/identity.js'

export { Workbench, AppError, validateWorkspacePath } from './workbench.js'
export { WorkbenchServer, startWorkbenchServer, stripBasePath } from './server.js'
export { PANEL, HOST_LIMITS, businessPanePx, needsFullRowCard, assertPanelConfig } from '../lib/layout.js'
export { PLUGIN_ID, API_PREFIX, HOME_DIR, UI_ENTRY } from '../lib/identity.js'

/* 宿主合同：name / inject / apply 来自 host.js，Config 在本文件末尾。 */
export { name, inject, apply, createHostHandler, restoreWorkspace, POINTER_FILE } from './host.js'

export const HOME_DIR_NAME = HOME_DIR
export const PANEL_ENTRY = UI_ENTRY

/** Config 必须是 Schemastery schema，普通对象会被宿主拒绝。root 由 cordis.patch.yml 给。 */
export const Config = Schema.object({
  root: Schema.string().required(),
})

/** 挂载能力已实现；是否真的装在某台 Desktop 上，只有装机后才知道（V2）。 */
export const HOST_ADAPTER_READY = true

export const STATUS = Object.freeze({
  version,
  displayVersion,
  channel,
  channelLabel,
  build,
  commit,
  pluginId: PLUGIN_ID,
  apiPrefix: API_PREFIX,
  homeDir: HOME_DIR,
  hostAdapter: 'implemented',
  installed: false,
  standalone: 'npm start -- --workspace <资料目录>',
  note: '宿主接入层已完成；装机验证（V2）需要装到 DSH Desktop 并重启 Harness 后才能确认。',
})
