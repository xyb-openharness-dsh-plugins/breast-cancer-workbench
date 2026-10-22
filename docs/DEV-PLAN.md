# 开发计划（G2 之后）

日期：2026-10-17。状态：G2 已通过（简化），进入开发；G3 待审。本文只定**顺序、产物与判定标准**，不复述规格。

## 0. 一句话

先把「记录 → 出处 → 一图秀 → 带去门诊」这条主线做成真实可用的，再补外围模块，最后接 DSH。**不并行开工，不先做界面美化。**

## 1. 开工前的四个决定

| 决定 | 现状 | 建议默认 | 影响 |
| --- | --- | --- | --- |
| 包名 scope | 未定 | `@pinkypal-dsh/breast-cancer-workbench` | `package.json` 的 `name`、pack 产物名、市场投稿 |
| 许可证 | **已定 `MIT`**（2026-10-17，D30） | 与建议默认一致 | 市场要求"有许可证"已满足 |
| 首发版本 | 未定 | `0.3.0`（沿用当前 `VERSION`） | V1 包级校验、tag、市场记录 |
| 布局 | **已定 A（0.65 标准分栏，D34）** | 与建议默认一致 | 六列表需整行跨列（规则已定，见 UI-DESIGN §5.6） |

除布局已定外，其余三项都不阻塞 M0（工程底座），但阻塞 M5（接入）与发布。改 `VERSION` 前先读 [VERSIONING](VERSIONING.md)。

## 2. 里程碑

| 阶段 | 做什么 | 产物 | 完成判定 | 依赖 |
| --- | --- | --- | --- | --- |
| **M0 工程底座** | 目录、`package.json`、脚本、静态检查、版本校验挂进 `npm run check` | `package.json`、`scripts/`、`test/` 骨架 | ✅ **2026-10-17 完成**：`npm run check` 一条命令跑通（版本同步 + 语法 + 文案红线 + 7 个单测 + 版本一致），`npm run pack:check` 可出包 | 决定项暂用临时值 |
| **M1 数据层** | 迁移、store、契约校验、种子数据 | `schema/0001_initial.sql`、`dsh/store.js`、`dsh/migrate.js` | ✅ **2026-10-17 完成**：25 表 / 26 索引建得起来；`is_conclusion=1` 被拒；`role='doctor'` 被拒；更正链三版可追且旧值不变；四点位缺测为 NULL；18 项字典 + 3 协议幂等；共 11 条数据层单测 | G3 已签认 |
| **M2 主线闭环** | 资料导入 → 草稿核对 → 指标 → 一图秀 → 上肢四点位 → 就诊准备导出 | 可运行的本地应用（无 AI） | ✅ **2026-10-17 完成（v0.4.0）**：`npm start` 起得来；导入→草稿核对→指标→一图秀→四点位→导出全链路真跑通；导出 Markdown 四分区且只含选入项；**A33 实测**：1440/1180/1040/936/780 五档 × 8 页，页面级横向溢出 0、卡内横滚 0、七列测量表 `scrollWidth===clientWidth`、`.pick` 折叠指示在各档都在 | M1 |
| **M3 外围模块** | 临床、营养、心理、康复、收藏的完整交互 | 同上 | ✅ **2026-10-17 完成（v0.4.0）**：8 个一级、37 条二级路由逐页无头渲染通过（`dom` 有内容、无 console 报错）；A19 全模块可达；A12 私密边界：`viewpointList`/`care` 默认不含 `is_private=1`，导出需显式勾选 | M2 |
| **M4 设置与就绪** | 工作区选择、MinerU 设置页与连通性测试、临床库空态、顶栏两状态接真实数据 | `dsh/workbench.js` 内的设置与工作区打开；`dsh/mineru.js` | ✅ **2026-10-17 完成（v0.4.0）**：A21/A22 过（空库先选目录、拒绝主目录/根/桌面/临时目录、不静默建目录）；Token 只回显掩码与来源；顶栏「资料目录」接真实状态；临床库空态写明未接登记库。**未做**：MinerU 连通性主动测试（官方无校验端点，首次解析时才知道） | M2 |
| **M5 接入 DSH** | `cordis.patch.yml`、`dsh/index.js`、`lib/client.js`、`dsh.profile.bundles` | 可安装包 | **部分完成**：宿主入口、customFrame、49 项包合同已过；Desktop web profile 已装过 0.6.1（本地 tgz），**0.12.0 尚未重装复验** | M3、M4 |
| **M6 发布** | P1 推 Git、P2 市场投稿 | tag + 市场记录 | V3 业务验证过；市场可查可装 | M5 |

**M2 进度**：第一段（资料导入 → 草稿核对）2026-10-17 落地（§3.5）；第二段（界面、一图秀真实数据、四点位录入、导出）与 M3、M4 **同日完成**，见 §3.6。M5（DSH 接入）代码与包合同已就位、实机停在 0.6.1，重装到 0.12.0 才算完成；M6（发布）未开始。

## 3. M0 已完成（2026-10-17）

实际落地的文件：

| 文件 | 作用 |
| --- | --- |
| `package.json` | `type: module`、`main: ./dsh/index.js`、`engines.node >= 22.5`、`files` 白名单；`check` / `test` / `pack:check` 三条命令 |
| `.gitignore` | `node_modules/`、`*.tgz`、`*.sqlite*`、`.DS_Store`、`/tmp` |
| `LICENSE` | MIT（2026-10-17 定，D32）；版权方「PinkyPal 社区贡献者」；已进 `files` 白名单 |
| `VERSION` → `lib/version.js` | **生成物**，由 `scripts/build-version.mjs` 从 `VERSION` + git 生成；同一次提交重复跑不改文件；`--check` 只校验不写 |
| `lib/version.js` 导出 | `version` / `displayVersion` / `build` / `channel` / `channelLabel` / `commit` / `APP_INFO`（冻结对象） |
| `scripts/check-version.mjs` | 原 3 处 → **5 处**：新增 `lib/version.js`，并把 `package.json` 纳入（存在即核对） |
| `scripts/check-wording.mjs` | A18 文案红线门：扫 `dsh/` `lib/` `public/` `src/`，命中「建议治疗 / 可能复发 / 无需就医 / 可以停药」等即失败；否定语境与 `wording-allow` 注释可放行 |
| `test/version.test.mjs` | 7 个单测：版本与 `VERSION` 一致、SemVer、`v` 前缀规则、渠道枚举、build/commit 格式、`APP_INFO` 冻结、`package.json` 一致 |
| `dsh/index.js` | **占位**，`apply()` 直接抛错，防止"装上但什么都不做" |
| `lib/client.js` | **占位**，`CLIENT_READY = false` |
| `schema/README.md` | 冻结说明：G3 签认前，本目录不接受 `.sql` |

真实执行结果（本机 Node v22.22.2 / npm 10.9.7）：

```
✓ lib/version.js 与 VERSION 同步：v0.3.0（build local · prototype）
✓ 医疗表述检查通过（3 个实现文件，0 处越界）
# tests 7 / # pass 7 / # fail 0
✓ 版本号一致：v0.3.0（共核对 5 处）
npm run pack:check → 8 files, 264.3 kB, shasum 40374a49…
```

**M0 明确没做**：没建表、没写业务组件、没装任何依赖、没建 Git 仓库、没有 `cordis.patch.yml`、**没有在 DSH Desktop 里装过**。

### 用到的临时值（发布前必须替换）

| 决定 | 临时值 | 说明 |
| --- | --- | --- |
| 包名 scope | `@pinkypal-dsh/breast-cancer-workbench` | 纯占位，未发布；改名只影响 `package.json` 与 pack 产物名 |
| 许可证 | **`MIT`（已定，D30）** | 根 `LICENSE` 与 `package.json` 的 `license` 一致；`private: true` 仍保留，走 npm 来源前要摘掉 |
| 首发版本 | `0.3.0`（沿用 `VERSION`） | M2 出现用户可见功能时会按 VERSIONING 升 MINOR |
| 布局 | **`customFrame=true` + 业务区默认 `0.65`（2026-10-19 修订）** | 参数唯一来源 `lib/layout.js`（`PANEL` 与 `AGENT_PANE`）；M5 写进 `cordis.patch.yml`。标准分栏下宿主没有拖宽/关闭接口，AI 面板不可调，故改 customFrame |

## 3.5 M1 已完成 + M2 第一段已落地（2026-10-17）

**M1 数据层**（G3 签认后当日完成）：`schema/0001_initial.sql`（25 表 / 26 索引，sha256 记进冻结合同）、`dsh/migrate.js`、`dsh/store.js`、`dsh/dictionary.js`（18 项指标 + 3 个协议种子，幂等）。

**M2 第一段：资料导入 → 草稿核对**（本轮新增）：

| 文件 | 作用 |
| --- | --- |
| `dsh/import.js` | `ImportService`：原件去重导入、解析任务生命周期、候选生成与去重、草稿读模型、逐项核对写事实层 |
| `dsh/demo.js` | 五套演示画像（DEMO-1…5）+ manifest 登记 + 只按 manifest 清理 |
| `dsh/store.js`（增） | 嵌套安全事务 `withTransaction`；`addStage` / `addTreatment` / `addSymptom` 及读取 |
| `test/import.test.mjs` | 14 条：重复导入、失败不产候选、候选去重、草稿问题、接受/修改/拒绝、事务回滚、日期边界、批量跳过原因 |
| `test/demo.test.mjs` | 12 条：五套画像体量、空态、侧别歧义、更正链、冲突可见、manifest 清理、确定性 |

四条落地口径（都能被单测证伪）：

1. **重复导入**按 `(subject_id, sha256)` 命中 → 返回原文档与首次导入时间，**不重置状态**（已解析的不会退回未解析）；
2. **解析失败** → `document.status='parse_failed'`，`addCandidate` 直接拒绝；重试成功后才可产候选（A2）；
3. **候选去重**按 `(document_id, field, value_text)`，同值合并；不同值并存并在草稿里标 `conflict`；
4. **接受 ≠ 临床审核**：写 `record` + `observation`/`treatment_event`，`reviewed_by` 保持 NULL；写入失败整笔回滚，候选仍 `pending`。

草稿里的问题（缺单位 / 非数字 / 冲突 / 低把握度 / 指标不在字典）**读取时计算**，不落库——规则改了，历史候选的判定应跟着改。

实测（Node v22.22.2）：`npm run check` → **51 条单测全过**（本轮加 0002 与 MinerU 后为 **84 条**）；五套画像生成耗时 48 ms，体量 124 / 1 / 120 / 124 / 123 条观测（DEMO-2 是刻意的空态，见 DEMO-CHECKLIST §G2-5.2）。

**M2 第一段明确没做**：没有界面（草稿页仍只在原型里）；没有真实的 PDF/图片解析器（`engine` 只是标签）；病理/分子类字段（`pathology:`）没有入库映射；批量接受是"整页一个日期"，跨页不同采样日期需分批。

### 结构缺口已关闭（同日决定）

`candidate` / `document` 缺日期列的问题，用户 2026-10-17 答「ok」后按建议执行：新增 `schema/0002_candidate_dates.sql`（`document.report_date`、`candidate.occurred_on`，均可空、不回填），哈希进冻结合同；`freeze-contract.md` 现记 2 个迁移。代码侧的取值顺序固定为 **候选自带 > 本次传入 > 材料报告日期**，三者都没有就 `DATE_REQUIRED` / `date_missing`，仍然不拿 `imported_at` 顶替。

## 3.6 MinerU 解析接入（2026-10-17，M2 第二段的前置）

| 文件 | 作用 |
| --- | --- |
| `dsh/mineru.js` | API v4 四个动作（申请链接 / 上传 / 轮询 / 下载）+ Token 解析与掩码 + 超时 |
| `lib/zip.js` | 最小 ZIP 读取器（中央目录 + deflate），取 `full.md` 与 `*_content_list.json` |
| `dsh/labparse.js` | markdown / content_list → 候选：18 项词表、单位归一、表格按位置对齐、日期识别 |
| `dsh/import.js`（增） | `ImportService.parseWithMineru()`：候选写入 + `document=parsed` + `job=succeeded` 同一事务；失败整体回滚并 `failParse` |
| `scripts/check-secrets.mjs` | 密钥扫描（`sk-` / 私钥 / AWS / GitHub Token），并检查 `.gitignore` 含 `.secrets/` |
| `test/mineru.test.mjs`、`test/labparse.test.mjs` | 假 fetch 跑五个环节与出错分支；抽取边界（参考范围、不等式、词边界、表格对齐、日期） |

真实跑通（不是 mock）：1 页合成 PDF → 9.7 秒拿回 markdown → 8 项指标值/单位**全部正确** → 批量接受 8 条 → 重开库 `observation` 8 条、`reviewed_by` 仍 NULL。详见 [MINERU](MINERU.md) §6。

**踩到的真 bug**：MinerU 把整张表塞进一个单元格（`Item CA15-3 CEA …` / `Result 18.6 2.1 …`），第一版按"标签列右边第一个数"取值，导致 8 个指标全写成 18.6。改成**按位置对齐**（第 i 个指标配第 i 个数、第 i 个单位），对不齐就整行放弃。这条已成单测。

**M2 第二段明确没做**：解析界面（进度、失败重试、原文对照）、病理/分子字段映射、多页不同采样日期的分批、真实扫描件与双栏排版验证、额度与限流处理。

## 3.6 M2 第二段 + M3 + M4 已完成（2026-10-17，v0.4.0）

这一轮把工作台从"服务层 + 原型"推进到**能真的用**：`npm start` 起一个本机服务，界面是 `public/` 的单页，数据写进用户自己选的目录。

| 文件 | 作用 |
| --- | --- |
| `dsh/readmodels.js` | 读模型：指标序列（按 `lab_method` 分段）、指标卡、臂围历史与差值、症状、看法、问题、待办、治疗、诊断、康复条目、材料统计、导出 Markdown、导出指纹 |
| `dsh/workbench.js` | 应用核心：工作区打开与路径校验、档案与设置、全部写入动作、导入与解析、候选人裁决、导出与留痕、演示数据 |
| `dsh/server.js` | 零依赖 HTTP 适配层：`/api/*` 统一 JSON 错误、原始字节上传（不写 multipart 解析器）、`public/` 静态资源、CSP 等安全头 |
| `scripts/dev-server.mjs` | 独立启动：`npm start -- --workspace … [--port] [--demo]`；不给目录就先让界面选 |
| `scripts/check-syntax.mjs` | 语法门改成扫目录（`dsh/ lib/ public/ scripts/ test/`），新增文件自动纳入——原来的手写清单已经漏过新文件 |
| `public/` | 界面：`index.html` + `style.css`（原型样式 + 开发版追加规则）+ `app.js` 入口 + `js/{api,state,ui,pages-basic,pages-more}.js`，原生 ES Module，无构建、无第三方库 |
| `test/workbench.test.mjs` | 30 条：路径拒绝、空库、演示清理、日期边界、四点位、患侧锁、看法不是结论、导入→解析→接受、导出四分区、Token 掩码、私密默认不出 |
| `test/readmodels.test.mjs` | 13 条：换方法断线、缺方法合并、卡片 delta、臂围最大差、派生值不落库、材料计数、导出文本形状、指纹稳定、导出历史倒序 |
| `test/server.test.mjs` | 16 条：真起服务真发请求——未选目录 409/未知接口 404/坏 JSON 400、404 不偷偷建目录、全链路（选目录→记指标→上肢→上传→解析→接受→导出）、静态资源与越界、换目录不搬数据、演示载入与清理 |

本轮的三次实测（不是"应该能"）：

1. **五档宽度**（1440 / 1180 / 1040 / 936 / 780）× 8 个页面：页面级横向溢出 0、卡内横滚 0、七列测量表 `scrollWidth===clientWidth`、`.pick` 折叠指示各档都在（A33）；
2. **37 条路由**逐页无头渲染：`dom` 有内容、`h1` 有标题、无 console 报错（A19）；
3. **真点击**：关于/设置三 tab/档案/添加安排四个弹窗都能开能关；从 0 开始选目录 → 空态看板 → 顶栏"已激活"（A21/A22）。
   顺带修了两个只有真点击才会暴露的缺陷：`#profile-btn` 漏了 `data-action`（点档案没反应）、`不存在就新建` 复选框被挤成竖排字。

**这一轮改动的三处既有行为**（都有单测钉住）：

- `planned` 状态的治疗允许填未来日期（用 `assertPlanDate`）；"已发生"的事件仍不许晚于今天。原来两者共用一把尺子，导致"下个月开始放疗"被当成错误数据拒掉；
- `viewpointList` 的 `includePrivate` 默认从 `true` 改成 **`false`**（fail-closed，A12/A27）。本人页面要看全，显式传 `true`——默认开启等于让每个新调用点都漏一次。
- `validateWorkspacePath` 把 `/tmp` 也列进拒绝清单：临时目录会被系统清理，病历放那里等于没有备份。

**明确没做**（别当成已做）：

- DSH Desktop 接入（M5）：`cordis.patch.yml` 未写、`apply()` 仍拒绝挂载、`CLIENT_READY` 仍为 `false`；
- 主题外观三档（跟随系统/浅色/深色）只做了「大字」开关；
- 临床试验登记库、真实支持资源库未接入，页面写明是空态；
- 扫描件 OCR、双栏排版、多页不同采样日期、MinerU 额度限流与断网重试在**界面**下的表现未验证；
- 15 页逐页签认仍空（G2 为简化通过）。

## 4. 开发期的五条硬约束

1. **已建的表不改**。G3 于 2026-10-17 通过，`schema/0001_initial.sql` 已冻结（sha256 记在 `schema/freeze-contract.md`）；改结构只能新增 `0002_*.sql`，`scripts/check-schema.mjs` 会拦下对历史迁移的任何改动。
2. **版本号只有一处数字**。新增任何页面/构建产物，都从 `lib/version.js` 取，不再手写；改版本先改 `VERSION`。
3. **UI 以 v0.3.0 原型为准**。原型里的文案、空态、禁用态、错误文案都是验收的一部分；实现时不得"顺手优化"成另一种说法。界面争议按 [DEMO-CHECKLIST](DEMO-CHECKLIST.md) 条目回溯。
4. **不编造**。没有执行的验证写"未验证"，没有的地址不写，没装的包不说已装。
5. **密钥不进仓库**。MinerU Token 只走环境变量或 `.secrets/mineru.json`；`npm run check` 里的密钥扫描命中即失败，错误消息只允许出现掩码。

## 5. 与闸口的关系

- G2 已通过（2026-10-17，简化通过 + 用户二次确认「新的html非常好，可以进行开发」）：可以写业务代码，但 15 页逐页表未签，属"带条件通过"，M0 已在同日落地。
- G3 已通过（2026-10-17，用户「都按 A」）：三问 + 单档案全部取 A，`0001_initial.sql` 已冻结，M1 已完成。留痕见 [G3-REVIEW](G3-REVIEW.md) §6。
- M5 接入前必须过一次**空库启动**：删掉本地数据目录后能正常进入空态，不崩、不静默建目录。

## 6. 风险

| 风险 | 表现 | 应对 |
| --- | --- | --- |
| 布局 0.65 太窄 | 一图秀与六列表被压缩，横向滚动 | 已实测：34 视图 × 五档宽度页面级溢出 0；936 下「测量记录」卡 313px 放不下 417px 的表 → **该卡整行跨列**（实测后滚动归零）。仍待 M5 在真容器里复核 |
| ECharts 离线加载 | `file://` 与容器内 CSP 失败 | 本地 vendor + 失败回退到手写 SVG；D26 待定 |
| SQLite 迁移不可逆 | 改表丢数据 | 只增不改；每次迁移带 `down` 说明；G3 前冻结 |
| MinerU 联网 | Token、限流、超时 | 客户端已实现并把四种失败做成明确错误码（`NO_TOKEN`/`UNAUTHORIZED`/`TIMEOUT`/`TASK_FAILED`）；界面三态已于 **v0.8.1** 落地（`public/js/parse-fault.js`，错误码→结论+下一步，见 [MINERU](MINERU.md) §5.1）。真实样本错读率未验证，所以候选永远要人工核对 |
| 密钥泄漏 | Token 进 git 历史 | 只从 env 或 `.secrets/mineru.json` 读；`npm run check` 含密钥扫描；错误消息只给掩码 |
| 医疗表述越界 | 出现"可能复发/建议治疗" | A18 全文检索纳入 `npm run check`，命中即失败 |
