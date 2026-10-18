# 小粉宝 PinkyPal · 乳腺癌患者与照护者工作台

状态：G1/G2/G3 **全部通过**（G2 为简化通过，15 页逐页表未签；G3 用户「都按 A」）；设计规格 v0.8、原型 v0.3.0 为视觉基准；**M0 工程底座 + M1 数据层 + M2 主线闭环 + M3 外围模块 + M4 设置与就绪已落地，v0.4.0 开发版可在本机跑起来**。DSH Desktop 接入（M5）与发布（M6）**尚未开始**——当前没有可安装的包，也没有 Git 仓库，发布手册见 [docs/RELEASE.md](docs/RELEASE.md)。

用户要求：参考 `xyb-workbench` 和 `ovarian-workbench` 功能架构，使用社区 `xyb-workbench-starter` 开发 DSH Desktop 配套工作台，并通过互动确认 SPEC。开发代号 `breast-cancer-workbench`，UI 采用小粉宝品牌与 Logo 色系。

## 三道闸口（顺序不可跳）

| 闸口 | 审什么 | 当前 |
| --- | --- | --- |
| G1 业务流程与功能 | 模块、场景、边界、"不做清单" | **已通过** 2026-10-17 |
| G2 HTML 交互 demo | 七组检查 + 15 页签认（[检查表](docs/DEMO-CHECKLIST.md)） | **已通过（简化）** 2026-10-17 |
| G3 数据模型与数据流 | 字段能否支撑流程与界面 | **已通过** 2026-10-17（[评审包](docs/G3-REVIEW.md)） |

**三道闸口全过：可以写业务代码，也已经建表。** 结构变更只能新增 `schema/0002_*.sql`，不许改 `0001`。详见 [SPEC §0](docs/SPEC.md)。

## 先看什么

0. **开发版（v0.4.0，能真用）**：`npm start -- --workspace /你的/资料目录` 然后打开 `http://127.0.0.1:4173/`。数据只写进你选的目录；不传 `--workspace` 时先让你在页面上选，不会静默建目录。10 秒看演示：加 `--demo DEMO-1`（模拟数据，不是真实病历）。**还没接进 DSH Desktop**，见 [DEV-PLAN](docs/DEV-PLAN.md) M5。
1. **HTML 原型 v0.3.0**：[`prototypes/v0.3/index.html`](prototypes/v0.3/index.html) —— 本机浏览器打开，无依赖，全部模拟，刷新重置。顶栏与页脚显示版本号，点 `v0.3.0` 可看「关于」。
2. **规格**：[SPEC v0.8](docs/SPEC.md)（范围、闸口、产品立场、验收、发布约束）；G2 判定依据见 [DEMO-CHECKLIST](docs/DEMO-CHECKLIST.md)。
3. **数据**：[SCHEMA-SPEC](docs/SCHEMA-SPEC.md)（表/字段/约束/索引）、[DATA-FLOW-SPEC](docs/DATA-FLOW-SPEC.md)（写入/派生/更正/导出）。
4. **领域**：[BREAST-DOMAIN](docs/BREAST-DOMAIN.md)（乳腺癌维度与 16 项指标字典）、[SCENARIOS](docs/SCENARIOS.md)（S1–S10）。
5. **发布**：[RELEASE](docs/RELEASE.md)（接入、三层版本验证、Git 与市场发布、回滚；含本机实测的 Desktop 0.12.0 安装入口与两个 profile 的坑）。当前**未接入、未发布**。
6. **规范**：[VERSIONING](docs/VERSIONING.md)（版本号单一来源 `VERSION`、页面三处显示、校验命令）。
7. **开发**：[DEV-PLAN](docs/DEV-PLAN.md)（M0–M6 里程碑；M0/M1 已完成，M2 第一段与 MinerU 解析已落地）。
7b. **解析**：[MINERU](docs/MINERU.md)（为什么走云端、API v4 四步、Token 怎么管、markdown→候选的规则、失败语义与实测）。
8. **G3 评审包**：[G3-REVIEW](docs/G3-REVIEW.md)（三个必答问题 + 25 表速览 + 签认块）。
9. **HVT 审核**：[HVT-REVIEW](docs/HVT-REVIEW.md)（癌种特有高价值场景审核；结论 B=0 / G=3 / W=4，补丁已并入 SPEC v0.8 的 §4.5–§4.6 与 A25–A32）。

## 开发命令（v0.4.0 开发版）

```bash
npm start -- --workspace /你的/资料目录          # 起开发版（本机 127.0.0.1:4173）
npm start -- --workspace ~/Documents/PinkyPal --demo DEMO-1   # 带演示画像
npm start                                       # 不给目录：先在页面上选，不静默创建
npm run check        # 版本同步 → 语法（38 文件）→ 冻结合同 → 文案红线（A18）→ 密钥扫描 → 146 条单测 → 版本一致
npm test             # 只跑单测（版本 8 + 数据层 13 + 布局 6 + 导入 20 + 演示 13 + 解析 15 + MinerU 12 + 读模型 13 + 工作台 30 + HTTP 16）
npm run check:syntax # 只做语法门（扫 dsh/ lib/ public/ scripts/ test/，新增文件自动纳入）
npm run check:schema # 只校验 schema 冻结哈希（改了 0001/0002 会被拦下）
npm run check:secrets # 只跑密钥扫描（sk- / 私钥 / AWS / GitHub Token）
npm run build:version # 从 VERSION + git 重新生成 lib/version.js（内容不变不写盘）
npm run pack:check   # 打包预检（含 public/ 界面与 scripts/）
```

`--workspace` 会被 `validateWorkspacePath` 检查：拒绝根目录、用户主目录、桌面根目录、`/tmp` `/var` 等系统与临时目录，拒绝相对路径；目录不存在时只有显式确认（`create !== false`）才创建。

`dsh/index.js` 现在是**真入口**：导出 `Workbench` / `WorkbenchServer` / `startWorkbenchServer` / 面板参数，但 `apply()` 仍然拒绝挂载——DSH 宿主接入按 M5 做。`lib/client.js` 的 `CLIENT_READY` 仍为 `false`，`VIEW` 描述已按 `lib/layout.js` 写好，接入时不再改文案。

```js
import { Workbench, startWorkbenchServer } from 'breast-cancer-workbench'

const { workbench } = await Workbench.openWorkspace({ dir: '/Users/你/Documents/PinkyPal', create: true })
workbench.addObservation({ metricCode: 'ca153', occurredOn: '2026-09-12', value: 18.6, unit: 'U/mL' })
workbench.addArmSet({ measuredOn: '2026-09-12', points: [{ point: 'wrist', affected: 16.2, healthy: 15.4 }] })
workbench.exportVisit({})            // 就诊准备 Markdown，四个分区；私密看法默认不进
await startWorkbenchServer({ workbench, port: 4173 })   // 与 npm start 跑的是同一个 handler
```

## v0.4 开发版覆盖（真数据、真落库）

八个一级模块全部接的是**本机库里的真数据**，不再是模拟脚本：

- **看板**：空态三选一（选阶段 / 记一条身体感受 / 留一个问题）、演示画像横幅、臂围提醒条、最近变化、待办与要问的事；四个可点入口都通到对应页。
- **病情整理**：资料库（状态、解析重试、查看原文）、整理草稿 / 核对（逐项接受 / 修改 / 拒绝、日期缺失可见、冲突标红）、病情档案、指标检测（18 项字典 + 分类 + 卡片）、病情汇总。
- **病情一图秀**：多指标曲线（按检验方法分段，换方法就断线）、治疗条、手术虚线、症状强度轨道、点详情、时间窗与缩放、3D 翻转指标卡。
- **临床**：治疗历程（计划/实际分开）、病理与分子档案、试验线索（明确写未接登记库）、资料对照、我的关注、数据来源。
- **营养 / 心理**：体重与进食记录、当下感受、我的记录、支持资源、身体与亲密（私密默认不出）。
- **全程与康复**：近期安排、术后恢复（3 阶段 × 3 话题）、上肢与淋巴水肿（四点位、差值趋势、2cm 参考线、引流量与拔管）、不适记录、就诊准备、长期生活。
- **收藏与回顾**：问题清单（改文本留新版本）、已保留结果、报告与任务。
- **设置**：资料目录（改目录不搬数据）、文档解析（MinerU 开关与 Token 掩码，失败原因可读）、关于（版本、构建、数据位置）。

真实跑通的两条链路：`导入原件 → 本地抽取/MinerU 解析 → 草稿核对 → 事实层` 与 `事实层 → 读模型 → 就诊准备 Markdown（四分区）`。

## v0.3 原型覆盖（视觉基准）

看板、资料闭环、**16 指标一图秀（多选/时间窗/缩放/治疗条/点详情）**、**真 3D 翻转指标卡**、**术后恢复（3 阶段 × 3 话题 + 引流记录）**、**上肢与淋巴水肿（四点位测量、差值趋势、2cm 参考线）**、**就诊准备（我的看法与担心 + 问题两类 + 导出分区）**、营养/心理低负担记录、问题清单与 Markdown 导出、**配置（工作区目录 / MinerU 引导注册 / 临床库）、顶栏两个就绪状态（资料目录 / 对话）、5 套演示画像切换**。

## 产品立场（D16）

诊断与处置交给医生；工作台提供的是**边际信息**——把散落在出院小结、化验单和记忆里的东西归拢、标出处、按时序摆好。用户的判断与担心**按一条信息记录**（`viewpoint`），标注"不是医生结论"，不进趋势、不进摘要事实区、不参与任何判断。

## 当前交付物

设计文档、品牌素材、模拟 HTML 原型（v0.3.0，视觉基准）、**M0 工程底座**、**M1 数据层**（25 表 / 26 索引 / 冻结合同）、**M2 主线闭环**（导入 → 草稿核对 → 指标 → 一图秀 → 四点位 → 就诊准备导出）、**M3 外围模块**（临床 / 营养 / 心理 / 康复 / 收藏）、**M4 设置与就绪**（工作区选择、MinerU 配置与掩码、空库空态、顶栏两状态接真实数据）、**MinerU 解析**（`dsh/mineru.js` + `lib/zip.js` + `dsh/labparse.js`，真实跑通 1 页合成 PDF：8 项指标值与单位全部正确）。

**v0.4.0 开发版 = 可运行的本地应用**：`dsh/workbench.js`（应用核心）+ `dsh/readmodels.js`（读模型）+ `dsh/server.js`（零依赖 HTTP）+ `public/`（单页界面，原生 ES Module，无构建）+ `scripts/dev-server.mjs`（`npm start`）。**146 条单测**，`npm run check` 全绿。

已知未验证项：DSH 容器内 0.65 分栏的真实宽度与键盘可达、扫描件 OCR 与双栏排版、MinerU 额度与断网重试在界面下的表现、15 页逐页签认。包名（临时 `@pinkypal-dsh/`）与远端仓库尚未确定；许可证 **MIT**（D32）、面板布局 **A 标准分栏 0.65**（D34，参数只在 `lib/layout.js` 写一份），不编造 GitHub 地址通过初始化校验。

确认记录见 [PROTOTYPE-REVIEW](docs/PROTOTYPE-REVIEW.md)，逐项状态见 [PARITY](docs/PARITY.md)，决策台账见 [DESIGN-SESSION](docs/DESIGN-SESSION.md)。

HVT 审核（2026-10-17）：乳腺癌核心场景（上肢与淋巴水肿）五层齐、达标；心脏监测、骨健康、生育与性健康为 G 级缺口，本版已补场景与验收，但**未做临床审核与原型走查，不等于 G1 扩展通过**。发布可见性 P1–P5 中 P2/P5 仍待接入 DSH 后验证。

一图秀的实现经验已沉淀为社区脚手架的通用规范 `docs/16-ONE-CHART-SPEC.md`（R1–R12 硬规则、C1–C12 断言、真实事故表），本项目 v0.3 是该规范的参考实现；本项目口径见 [UI-DESIGN §3](docs/UI-DESIGN.md)。版本号规范见 [VERSIONING](docs/VERSIONING.md)：`npm run check` 现在核对 8 处（开发版页面标题与全部版本字面量、`public/js/state.js` 降级值、`lib/version.js`、`package.json`，以及 `prototypes/v0.3` 的**快照冻结**三处），任一与 `VERSION` 不同即失败（D37）。

## MinerU 配置（解析 PDF/图片用）

解析走 MinerU 云端 API v4。Token 只从环境变量或本地私密文件读，**仓库里没有任何硬编码**：

```bash
export MINERU_TOKEN="sk-..."          # 方式一
echo '{"token":"sk-..."}' > .secrets/mineru.json   # 方式二（已在 .gitignore）
```

没有 Token 时解析会直接报 `NO_TOKEN` 并保留原件，不静默重试。原件会上传到 mineru.net，
所以界面上必须由用户点"解析"才发生——这条在 M2 第二段接界面时落实。细节见 [MINERU](docs/MINERU.md)。

## 许可与免责

- **许可证：MIT**（2026-10-17 定，见 [LICENSE](LICENSE)）。版权方写为「PinkyPal 社区贡献者」。
- 本项目**不是医疗器械**，不提供诊断、治疗或用药建议；界面里的"提示和医生讨论"只是提示，不构成判断。使用者应把工作台当整理与沟通工具，医疗决定交给医生。
- Logo 与品牌素材由项目发起人提供，**公开使用与商用授权未在本次范围内确认**（见 [assets/README.md](assets/README.md)）；对外发布前需单独确认。
