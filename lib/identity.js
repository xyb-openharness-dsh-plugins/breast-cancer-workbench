/**
 * 宿主身份常量（M5）。
 *
 * 官方规范把工作台的三个标识分开管，不能混（workbench-standard §2）：
 *
 * | 标识 | 值 | 写在哪 |
 * | --- | --- | --- |
 * | npm 包名 | `package.json` 的 `name` | **不写在这里**：写两份必然漂移，由 `scripts/check-package.mjs` 与 `package.json` 比对 |
 * | 插件条目 id | `PLUGIN_ID` | `cordis.patch.yml` 的 `insert[].id`；本机接口前缀也由它派生 |
 * | 工作台身份 | `package.json` 的 `repository` | 客户端 `register()` 必填，Desktop 由它派生 `owner/repo` |
 *
 * `API_PREFIX` 必须是 `/api/<id>/` 形状：官方要求本机接口放在自己的前缀下，
 * 不能占用 Desktop 或其他插件的路径。
 */

/** 插件条目 id：cordis.patch.yml 的 insert[].id，也是本机接口前缀的一段。 */
export const PLUGIN_ID = 'breast-cancer-workbench'

/** 本机接口前缀。宿主 webServer 按这个前缀把请求转给我们。 */
export const API_PREFIX = `/api/${PLUGIN_ID}`

/** `dshHomePath()` 的参数：宿主分配给本工作台的配置目录名（只放指针文件，不放业务数据）。 */
export const HOME_DIR = 'pinkypal-workbench'

/** 面板在宿主里挂载后，静态页面的路径（iframe 的 src）。 */
export const UI_ENTRY = `${API_PREFIX}/ui/`

export const IDENTITY = Object.freeze({ PLUGIN_ID, API_PREFIX, HOME_DIR, UI_ENTRY })
