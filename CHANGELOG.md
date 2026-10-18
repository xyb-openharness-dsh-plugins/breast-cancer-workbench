# 变更记录

规则：涨版本先改 `VERSION`，再在本文顶部加一条（日期 + 版本 + 一句话 + 影响面）。
`npm run check` 会拦住"改了版本没记录"和"记录了没改版本"两种漏（见 [VERSIONING](docs/VERSIONING.md)）。

## 0.5.1 — 2026-10-18（真机首装反馈修复 + Desktop 1.2.2 会话集成）

**一句话**：修掉真机首装暴露的「工作台没能连上本机服务 not found」（CSP 拦内联 boot 脚本），按 Desktop 1.2.2 与门店选址官方样例补齐注册与会话集成；业务区移到左侧、原生 Agent 会话在右侧。

- **修 not found（真机实锤）**：本站 CSP `script-src 'self'` 会静默拦掉 index.html 的内联 boot 脚本 → `__WB_API_BASE__` 从未设置 → 接口全部 404、顶栏仍写「未接入 DSH 宿主」。改为服务端把基址/运行形态写进 `<html data-api-base / data-runtime>`，`api.js`/`app.js` 从 dataset 读；单测同步并加「不得出现内联 boot」断言。
- **布局**：`lib/layout.js` businessSide `right→left`（用户定：原生会话面板在最右，业务区左 65% 可折叠；面板开合与拖宽用宿主原生能力，不自建 splitter）。
- **register 补全**：panelTitle/icon/audience/requirements/initialization:'empty'/embedded:true/version/author（对齐官方样例字段面）。
- **会话集成**（官方 dsh-site-selection 同款 API）：`ensureSession({folder})` 调起原生会话并打开；开场白经 `sessions.scope(id).get('conversation').input` 填进**原生草稿，不自动发送**（composer 未就绪轮询重试、localStorage 持久化）；isActive/ownsSession/currentSession 判定齐备，宿主服务缺位一律降级提示不猜第二入口。面板顶栏新增「AI 协助」按钮。
- **新增 `workbench.json`**（schemaVersion 1）：`wb-xyb-openharness-dsh-plugins-xfb-workbench` 身份、entry、compatibility、capabilities；进 npm files。
- `/api/health` 增加 `dir`（面板调起会话时作为 folder 用）。
- 验证：`npm run check` 161 条全绿；npm pack 49 files / 515.4 kB；已按 remove+add 装入 Desktop 真身 profile（`~/Library/Application Support/dsh-desktop/harness/profiles/web`），副本含会话集成代码。
- 未实测：Desktop 实机里「AI 协助」调起、开场白填草稿、右侧面板拖宽（需用户重启 Desktop 人工确认）。

## 0.5.0 — 2026-10-18（M5 宿主接入，可打包安装）

**一句话**：同一份代码既能独立起服务、也能作为 DSH 插件挂进宿主——`apply()` 从抛错变成真挂载，产出可通过包级合同校验、可 `npm pack` 安装的插件包。

新增：

- `lib/identity.js`：npm 包名 / 工作台目录名 / 接口前缀的单一来源，宿主与客户端共用。
- `dsh/host.js`：宿主接入层——前缀路由改写、授权闸（403）、`apply()` 把 `WorkbenchServer.handle` 挂到宿主 `webServer`，工作区指针写入 `dshHomePath`。
- `cordis.patch.yml`：一条 insert，把服务端入口插入 Harness 插件树（name 写 npm 包名）。
- `src/client.js` + `scripts/build-client.mjs`：客户端单文件源码与构建（占位替换生成 `lib/client.js`，未替换占位即报错）。
- `scripts/check-package.mjs`：**包级合同 V1（46 项）**——包名/入口/cordis patch/客户端注册/repository/peerDependencies/无本机绝对路径/无敏感文件。
- `test/host.test.mjs`（15 条）：前缀改写、假 ctx 挂载、403 授权闸、UI 基址注入、工作区指针恢复语义、patch 与 package 合同。

改动：

- `dsh/server.js`：支持 `basePath`/`apiBase`/`runtime`，静态页面注入 `__WB_API_BASE__`/`__WB_RUNTIME__`，`onWorkspace` 回调；前端资源改相对路径，独立与宿主两种跑法共用一份页面。
- `package.json`：`dsh.bundle.patch` / `dsh.client` / `peerDependencies`（`>=0.1.5-rc.2 <0.2.0-0`，避免预发布 ERESOLVE）/ `exports` 补全。
- 单测 146 → **161 条**；`npm run check` 增加 `check:package`。

验证：`npm run check` 全绿（161 pass）；`npm pack` 48 files / ~512 kB。
**装机实测（2026-10-18）**：tgz 经 pnpm 10.34.5 装入 `~/.dsh/profiles/web`（与本机其他工作台同款 `file:` 约定），bundle 已登记；`dsh --dump-config` 合成出本插件层（`id: breast-cancer-workbench`、`root: dshHomePath('pinkypal-workbench')`）；临时 `DSH_HOME`（空 credentials 库）真起 Harness **加载成功**，`/api/breast-cancer-workbench/*` 全部命中本插件授权闸（curl 返回 403 + `HOST_AUTH_REQUIRED`，正是设计行为）。
**踩坑记录**：①cordis 对 `apply` 返回值严格——async resolve 普通对象会 `Invalid effect`，改为非 async 无返回值（实例走 `mountedServer()`）；②pnpm 同版本号不替换内容，改包后必须 remove + add。
**未实测**：Desktop 实机 UI（受信会话打开面板、已安装列表）——需要重启 DSH Desktop 后人工确认；psych 包 0.3.2 发布件缺 `name` 导出会挡整个 profile，已在安装副本打一行补丁，源项目要修。

## 0.4.0 — 2026-10-17（首个能用的开发版）

**一句话**：工作台从"服务层 + 原型"变成**能在本机真用**的应用——本机起服务、真落库、8 个模块全部接真实数据、就诊准备可导出。

新增：

- `dsh/readmodels.js`：读模型（指标序列按检验方法分段、指标卡、臂围历史与差值、症状/看法/问题/待办/治疗/诊断/康复、材料统计、导出 Markdown 与导出指纹）。派生值只算不存。
- `dsh/workbench.js`：应用核心（工作区打开与路径校验、档案与设置、全部写入动作、导入与解析、候选人裁决、导出留痕、演示数据）。
- `dsh/server.js` + `scripts/dev-server.mjs`：零依赖 HTTP 适配层与独立启动（`npm start -- --workspace …`）。上传走原始字节 + 头信息，不写 multipart 解析器。
- `public/`：单页界面（原生 ES Module、无构建、无第三方库），8 个一级 / 37 条路由。
- `scripts/check-syntax.mjs`：语法门改为扫目录，新增文件自动纳入。
- `test/workbench.test.mjs`（30）、`test/readmodels.test.mjs`（13）、`test/server.test.mjs`（16）、`test/demo.test.mjs`（+2）：单测从 85 条到 **146 条**。

改动：

- `dsh/index.js` 从"占位即抛错"变成**真入口**（导出 `Workbench` / `WorkbenchServer` / `startWorkbenchServer` / 面板参数），`apply()` 仍拒绝挂载——DSH 接入（M5）未开始。
- `lib/client.js`：`CLIENT_READY` 仍为 `false`，新增按 `lib/layout.js` 写好的 `VIEW` 描述。
- `viewpointList` / `careList` 的 `includePrivate` **默认从 `true` 改为 `false`**（A12/A27，fail-closed，D39）。
- `addTreatment` 对 `status='planned'` 改用 `assertPlanDate`，允许未来日期（D40）；已发生事件仍不许晚于今天。
- `validateWorkspacePath` 拒绝清单加入 `/tmp`：临时目录会被系统清理，不适合放病历。
- 版本核对从 5 处扩到 8 处；`prototypes/v0.3/` 改为**快照冻结**在 `0.3.0`（D37）。
- `package.json`：`start` 与 `check:syntax` 两个脚本；`files` 加入 `public/` 与 `scripts/`。

修掉的缺陷（都是实测发现的）：

- `#profile-btn` 漏 `data-action="profile"`，点侧栏档案卡没有任何反应。
- 「不存在就新建」复选框被输入框挤成一列竖排字（`.path-row` 不给它 `flex:0 0 auto`）。
- 未选目录时打一个不存在的接口先撞 `NO_WORKSPACE`（409），把 404 顶掉了。
- `lab_method` 传空串会与 `NULL` 分成两段，序列凭空多断一次。

实测（本机 Node v22.22.2 / macOS）：

- `npm run check` 全绿：版本同步 → 语法（38 文件）→ 冻结合同（2 个迁移）→ 文案红线（23 文件 0 处越界）→ 密钥（89 文件 0 命中）→ **146 条单测全过** → 版本一致（8 处）。
- 五档宽度（1440/1180/1040/936/780）× 8 页：页面级横向溢出 0、卡内横滚 0、七列测量表 `scrollWidth===clientWidth`、`.pick` 折叠指示各档都在（A33）。
- 37 条路由逐页无头渲染：有内容、有标题、无 console 报错（A19）。
- 真点击：关于 / 设置三 tab / 档案 / 添加安排四个弹窗可开可关；从零选目录 → 空态看板 → 顶栏"已激活"（A21/A22）。

未验证（不要当成已做）：DSH 容器内 0.65 分栏的真实宽度与键盘可达、扫描件 OCR 与双栏排版、MinerU 额度限流与断网重试在界面下的表现、15 页逐页签认、DSH 装机与发布。

## 0.3.0 — 2026-10-17（原型与数据层）

- HTML 交互原型 v0.3.0（视觉基准，G1/G2 签认）、M0 工程底座、M1 数据层（25 表 / 26 索引 / 冻结合同）、M2 第一段（导入 → 草稿核对）、MinerU 解析（API v4 全链路 + `full.md`/`content_list.json` 抽取）。85 条单测。
