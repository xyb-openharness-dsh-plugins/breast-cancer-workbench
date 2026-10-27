# 小粉宝 PinkyPal · 乳腺癌患者与照护者工作台

## 本次更新 · 2026-10-22（v0.12.0）

分级扩到了「升高」那一侧：**ALT / AST / 碱性磷酸酶 / 总胆红素 / 肌酐**这五项，CTCAE v5.0 写的是「×ULN」，所以只在这张化验单自带参考上限时才给级——ALT 的上限各实验室 40–55 U/L 不等，差 1.4 倍，拿通用值一除就能把 2 级说成 1 级。没带参考上限时卡面给一枚虚线徽章「需参考上限」，不猜。**QTc** 按毫秒绝对值给到 3 级，填成秒（0.46）会提示换单位而不是替你换算。上一版的**随访节奏（G2）**仍在：参考节点、不排计划、不发提醒、不做分期判断。细节见 [变更记录](CHANGELOG.md)，分级口径见 [METRIC-GRADING](docs/METRIC-GRADING.md)。

状态（2026-10-22）：当前包版本 **v0.12.0**。既有G1/G2/G3确认范围见设计台账；数据层、业务页面、宿主入口及原型检查链已落代码。当前已使用组织Git仓库保存，自动化通过不代表DSH Desktop逐项实机验收；安装/市场状态以 [发布记录](docs/RELEASE.md) 为准。

用户要求：参考 `xyb-workbench` 和 `ovarian-workbench` 功能架构，使用社区 `xyb-workbench-starter` 开发 DSH Desktop 配套工作台，并通过互动确认 SPEC。开发代号 `breast-cancer-workbench`，UI 采用小粉宝品牌与 Logo 色系。

## 疾病概要

> 四段固定：定义 → 医学资料规范和指南情况 → 目前治疗全景概要 → 发展趋势。整体属**解释层**（第 ② 层）：
> 只整理公开信息，不判断你的病情。工作台右上角的「?」看同一份内容的整页版。
> 原件状态照实写，且每行都带可点链接（36 号 §2.5）：CACA-CBCS 2025 精要本有本地 PDF 抽取件（公开渠道只有[书目页 ↗](https://book.cppinfo.cn/Encyclopedias/home/Index/4807429)）；NCCN / AJCC / WHO 未取得原件，页码待核，链接指向官方出版信息页。
> 已公开的期刊原件：[2026 年版 PDF ↗](https://www.china-oncology.com/rc-pub/front/front-article/download/145257590/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882026%E5%B9%B4%E7%89%88%EF%BC%89.pdf)、[2024 年版 PDF ↗](https://www.china-oncology.com/rc-pub/front/front-article/download/141011677/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882024%E5%B9%B4%E7%89%88%EF%BC%89.pdf)。

### 定义

乳腺癌是来源于乳腺上皮组织的恶性肿瘤的统称，不是一种病。病理类型、分子分型与分期的不同组合，对应指南里不同的治疗与随访条目——所以这台工作台把「哪一型、哪一期」放在所有记录的第一层。

病理类型命名以 WHO《乳腺肿瘤分类》第 5 版为口径（本项目据精要本转引，未取得 WHO 原件）。浸润性乳腺癌的分子分型按 ER / PR / HER2 / Ki-67 划分（精要本 P36、P40）；2025 版在 P40 增加标注：Luminal-B HER2 阴性时，「PgR 低表达」与「Ki67 高表达」符合一项即可判定。分期用 AJCC 第 8 版 TNM，精要本 P35 在 2025 版按 AJCC 第 8 版原文做了系统性修改。本台只把报告原文抄进档案，不把分型或分期换算成「严重程度」。

**来源**：CACA-CBCS / CMA-CSO-BO · 乳腺癌诊治指南与规范（2025 年版 精要本）· 2025 精要本（2024-12-22 发布）· 原件已取得（图书，[书目页 ↗](https://book.cppinfo.cn/Encyclopedias/home/Index/4807429)）· 页码 P35–P36、P40 ｜ WHO · Classification of Tumours: Breast Tumours, 5th ed. · 第 5 版（2019）· 未取得原件，[据 IARC 出版页 ↗](https://publications.iarc.who.int/Book-And-Report-Series/Who-Classification-Of-Tumours/Breast-Tumours-2019) · 页码待核 ｜ AJCC · Cancer Staging Manual, 8th ed.（2017）· 未取得原件，[据二次来源 ↗](https://pubmed.ncbi.nlm.nih.gov/28294283/) · 页码待核（据精要本 P35 转引）

### 医学资料规范和指南情况

| 机构 | 文件 | 版本 / 年份 | 原件 | 本台的用途 |
|---|---|---|---|---|
| CACA-CBCS / CMA-CSO-BO | 中国抗癌协会与中华医学会肿瘤学分会乳腺癌诊治指南与规范 | 2025 年版 精要本（2024-12-22 发布，246 页） | [已取得（本地 PDF 抽取）· 书目页 ↗](https://book.cppinfo.cn/Encyclopedias/home/Index/4807429) | 主引用源：随访节奏（P208 表 9.5 / P209 表 9.6）、分级口径、分型与病理判读 |
| CACA-CBCS / CMA-CSO-BO | 中国抗癌协会乳腺癌诊治指南与规范（2026 年版） | 中国癌症杂志 2025 年第 35 卷第 12 期，P1157–P1255 | [官方 PDF 可点 · 本台未核对页码 ↗](https://www.china-oncology.com/rc-pub/front/front-article/download/145257590/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882026%E5%B9%B4%E7%89%88%EF%BC%89.pdf) | 对照源：2025 精要本之后的新版全文；本台尚未按这一版改页码引用 |
| CACA-CBCS / CMA-CSO-BO | 中国抗癌协会乳腺癌诊治指南与规范（2024 年版 全文） | 2024 年版（2024-06-10 发布） | [已取得 · 期刊官网 PDF ↗](https://www.china-oncology.com/rc-pub/front/front-article/download/141011677/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882024%E5%B9%B4%E7%89%88%EF%BC%89.pdf) | 补充源：查 2025 精要本压缩掉的完整章节 |
| CSCO | CSCO 乳腺癌诊疗指南 | 2023 版（58 页扫描 PDF） | [已取得（本地扫描件）· 转载 PDF ↗](https://www.healthcare-bio.com/upload/20231226/aa65e60b5180f43e34784c93dfbb2cf9.pdf) | 对照源：看中国 I/II/III 级分层推荐的写法，不作阈值来源；链接为第三方转载，非官方发布页 |
| NCCN | NCCN Guidelines · Breast Cancer | V7.2026（nccn.org 指南页 2026-10-27 显示） | [未取得原件（需机构订阅）· 官方指南页 ↗](https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1419) | 仅在 2025 精要本 P80 被引述；本台不单独引用其条文。该页版本随更新滚动，引用以页面当日显示为准 |
| AJCC | Cancer Staging Manual, 8th ed.（乳腺章节） | 2017 | [未取得原件（据精要本 P35 转引）· 二次来源 ↗](https://pubmed.ncbi.nlm.nih.gov/28294283/) | TNM 解剖学分期与预后分期的口径 |
| WHO | Classification of Tumours: Breast Tumours, 5th ed. | 第 5 版（2019） | [未取得原件 · IARC 出版页 ↗](https://publications.iarc.who.int/Book-And-Report-Series/Who-Classification-Of-Tumours/Breast-Tumours-2019) | 组织学类型命名的唯一口径 |

同一份指南隔一年，条目会变；所以本台引用一律带「机构 + 版本 + 页码」。未取得原件的文件只记「存在」与「大致讲什么」，不引用其具体条文。CSCO 的分层推荐（I/II/III 级）在本台不做成产品菜单——分层是给医生的写法，不是给患者的选择题。2026 年版全文已在期刊官网公开，但本台尚未逐页核对，所以仍以 2025 年版精要本作为页码来源；两版并列在表里，不合并成一个「最新版」。

**来源**：见上表逐行。

### 目前治疗全景概要

按期别与线序列出指南里出现过的手段类别。这是「世界上大致有哪些办法」的地图，不含剂量、疗程与适用条件——那些必须由医生按你的病理与影像决定。

- **早期可手术（局限期）**：手术（乳腺处理与区域淋巴结处理分别成章；2025 版 P65 增加「保守性全乳切除」的写法，P79 增加豁免前哨淋巴结活检的三条情形）／放疗（保乳术后、术后胸壁放疗均被列出；本台只记「做过没有、什么时候、几次」）／新辅助与辅助系统治疗（按分子分型分层列出化疗、内分泌治疗、抗 HER2 治疗，见 P109、P113）。
- **局部晚期 / 转移后**：系统治疗按分子分型与线序分组（内分泌治疗、化疗、抗 HER2 靶向、CDK4/6 抑制剂、PARP 抑制剂、免疫治疗；具体药是否国内获批、是否在医保内需单独核实）／寡转移灶的放疗或手术在特定情形下被列出／临床研究被列为正式选项，不是最后手段。
- **贯穿全程**：随访节奏（P208 表 9.5、P209 表 9.6；本台只并排显示「指南节奏 / 你最近一次 / 参考窗口」，不发提醒）／不良反应分级（主口径 CTCAE v5.0，中国指南口径如 P227 并列在卡片背面，两套级差不取严）。

以上是文献与指南里列出的手段，按病期与线序排列，**不代表任何一项适合你**。选哪一个，这一句需要问你的医生。

**来源**：CACA-CBCS / CMA-CSO-BO · 乳腺癌诊治指南与规范（2025 年版 精要本）· 2025 精要本 · 原件已取得（图书，[书目页 ↗](https://book.cppinfo.cn/Encyclopedias/home/Index/4807429)）· 页码 P65、P79、P109、P113、P208–P209、P227

### 发展趋势

只写已经发生的事，每条带日期或版本号。不预测、不评价、不给倾向。

- 2024-06-10：《中国抗癌协会乳腺癌诊治指南与规范（2024 年版）》全文版发布（本项目收录的是公众号转载件）。
- 2024-12-22：同系列《2025 年版 精要本》发布，共 246 页；本项目以精要本为主引用源。
- 2025 精要本 P35「乳腺癌的 TNM 分期」按 AJCC 第 8 版分期原文，对本页内容做了系统性修改。
- 2025 精要本 P29「乳腺常用影像学方法的比较」新增「乳腺断层 X 线」相关内容。
- 2025 精要本 P93、P94 为新增页：自体皮瓣乳房重建技术、植入物乳房重建分类。
- 2025 精要本 P80 记录：NCCN 等提出「腋窝临床体检阴性、影像学 1–2 枚淋巴结异常且细针穿刺阳性者可尝试前哨淋巴结活检」，国内专家团 2024 年 10 月投票同意率低于 50%。
- 《中国癌症杂志》第 35 卷第 12 期（P1157–P1255）刊出《中国抗癌协会乳腺癌诊治指南与规范（2026 年版）》，[期刊官网提供 PDF ↗](https://www.china-oncology.com/rc-pub/front/front-article/download/145257590/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882026%E5%B9%B4%E7%89%88%EF%BC%89.pdf)。本台当前仍以 2025 年版精要本作为页码来源，尚未按 2026 年版逐页核对。

**来源**：CACA-CBCS / CMA-CSO-BO · 乳腺癌诊治指南与规范（2025 年版 精要本）· 修订汇总 · 2025 精要本（2024-12-22 发布）· 原件已取得（图书，[书目页 ↗](https://book.cppinfo.cn/Encyclopedias/home/Index/4807429)）· 页码 P23–P94 ｜ CACA-CBCS / CMA-CSO-BO · 中国抗癌协会乳腺癌诊治指南与规范（2024 年版）· 2024 版（2024-06-10）· 原件已取得（[期刊官网 ↗](https://www.china-oncology.com/zh/article/doi/10.19401/j.cnki.1007-3639.2023.12.004/)）· 页码待核 ｜ CACA-CBCS / CMA-CSO-BO · 中国抗癌协会乳腺癌诊治指南与规范（2026 年版）· 中国癌症杂志 2025;35(12):1157-1255 · 原件已取得（[期刊官网 ↗](https://www.china-oncology.com/zh/article/doi/10.19401/j.cnki.1007-3639.2025.12.009/)）· 页码待核

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
4. **领域**：[BREAST-DOMAIN](docs/BREAST-DOMAIN.md)（乳腺癌维度与 22 项指标字典：含 5 项 ×ULN 与 QTc）、[SCENARIOS](docs/SCENARIOS.md)（S1–S10）。
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
