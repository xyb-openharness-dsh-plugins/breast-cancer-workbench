# 疾病概要 · 乳腺癌

> 本项目实例文件，由 `xyb-workbench-starter` 的 `templates/DISEASE-PRIMER.md` 复制而来。
> 规范：starter `docs/36-DISEASE-PRIMER.md`。四段固定、顺序不变，缺段不合格。

- 项目 / 品牌：小粉宝 PinkyPal
- 病种：乳腺癌（Breast Cancer）
- 最后更新：2026-10-27（36 号 v2：指南可点 + 看板状态卡）
- 原型版本：**`prototypes/v0.4/`**（v0.3.0 是 G1/G2 冻结基准，按 D37 不动；36 号 v2 落在 v0.4）
- 数据文件：`prototypes/v0.4/primer-data.js`（`window.DISEASE_PRIMER`）
- README 对应段：`## 疾病概要`（与 v0.4 数据人工同步，四段标题一致）
- 实现：`prototypes/v0.4/primer.js` + `primer.css`（来自 starter `assets/patterns/` 最新版，含 §2.5 链接渲染，逻辑未改）
- 探针：`NODE_OPTIONS= node scripts/probe-disease-primer.mjs --url http://127.0.0.1:8129/index.html` → 9/9（`--self-test` 6/9，注入 3 处缺陷全报红）
- 链接复核：`NODE_OPTIONS= node scripts/check-primer-links.mjs` → 9/9 可达

## 0 原件状态（本项目的前提）

| 文件 | 状态 |
|---|---|
| CACA-CBCS 2025 精要本 | **已取得**：`guidebooks/caca-cbcs-2025/`，MinerU 从本地 PDF `2025CBCS241218.pdf` 抽取的 md，246 页，sha256 记在 `guidebooks/manifest.json` |
| CACA-CBCS 2026 全文 | **已取得**：中国癌症杂志官网 PDF（2025 年第 35 卷第 12 期 P1157–P1255，[链接 ↗](https://www.china-oncology.com/rc-pub/front/front-article/download/145257590/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882026%E5%B9%B4%E7%89%88%EF%BC%89.pdf)），**本台未逐页核对**，页码仍按 2025 精要本引 |
| CACA-CBCS 2024 全文 | **已取得官方 PDF**：[中国癌症杂志官网 ↗](https://www.china-oncology.com/rc-pub/front/front-article/download/141011677/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882024%E5%B9%B4%E7%89%88%EF%BC%89.pdf)（此前只收了公众号转载 md） |
| CSCO 乳腺癌诊疗指南 2023 | **已取得**：58 页扫描 PDF，未抽文本 |
| NCCN Breast Cancer | **未取得原件**（需机构订阅）：版本按 [nccn.org 指南页 ↗](https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1419) 2026-10-27 显示的 V7.2026 记，随更新滚动 |
| AJCC 第 8 版（乳腺章节） | **未取得原件**，据精要本 P35 转引 |
| WHO 乳腺肿瘤分类第 5 版 | **未取得原件**：IARC 出版页 [Breast Tumours (2019) ↗](https://publications.iarc.who.int/Book-And-Report-Series/Who-Classification-Of-Tumours/Breast-Tumours-2019)，正文需订阅 |

这一条与 `docs/GUIDELINE-BRIDGE.md` §5 的取舍一致：**没看到原件，不许假装看到了**。精要本是 OCR 抽取件，表格偶有串行，所以只引用能定位到页的句子，不引用精确阈值。

## 1 定义（`definition`）

乳腺癌是来源于乳腺上皮组织的恶性肿瘤的统称，不是一种病。病理类型、分子分型与分期的不同组合，对应指南里不同的治疗与随访条目。

- 病理类型命名以 WHO《乳腺肿瘤分类》第 5 版为口径（据精要本转引，未取得 WHO 原件）。
- 浸润性乳腺癌分子分型按 ER / PR / HER2 / Ki-67 划分（精要本 P36、P40）。2025 版在 P40 增加标注：Luminal-B HER2 阴性时，「PgR 低表达」与「Ki67 高表达」符合一项即可判定。
- 分期用 AJCC 第 8 版 TNM；精要本 P35 在 2025 版按 AJCC 第 8 版原文做了系统性修改。
- 本台只抄报告原文，不把分型或分期换算成「严重程度」，也不替报告补字。

**来源**：CACA-CBCS / CMA-CSO-BO · 乳腺癌诊治指南与规范（2025 年版 精要本）· 2025 精要本（2024-12-22 发布）· 原件已取得 · 页码 P35–P36、P40 ｜ WHO · Classification of Tumours: Breast Tumours, 5th ed. · 第 5 版 · 未取得原件，据二次来源 · 页码待核 ｜ AJCC · Cancer Staging Manual, 8th ed.（2017）· 未取得原件，据二次来源 · 页码待核（据精要本 P35 转引）

## 2 医学资料规范和指南情况（`evidence`）

| 机构 | 文件 | 版本 / 年份 | 原件 | 本台的用途 |
|---|---|---|---|---|
| CACA-CBCS / CMA-CSO-BO | 中国抗癌协会与中华医学会肿瘤学分会乳腺癌诊治指南与规范 | 2025 年版 精要本（2024-12-22 发布，246 页） | [已取得（本地 PDF 抽取）· 书目页 ↗](https://book.cppinfo.cn/Encyclopedias/home/Index/4807429) | 主引用源：随访节奏（P208 表 9.5 / P209 表 9.6）、分级口径、分型与病理判读 |
| CACA-CBCS / CMA-CSO-BO | 中国抗癌协会乳腺癌诊治指南与规范（2026 年版） | 中国癌症杂志 2025 年第 35 卷第 12 期，P1157–P1255 | [官方 PDF 可点 · 本台未核对页码 ↗](https://www.china-oncology.com/rc-pub/front/front-article/download/145257590/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882026%E5%B9%B4%E7%89%88%EF%BC%89.pdf) | 对照源：2025 精要本之后的新版全文；本台尚未按这一版改页码引用 |
| CACA-CBCS / CMA-CSO-BO | 中国抗癌协会乳腺癌诊治指南与规范（2024 年版 全文） | 2024 年版（2024-06-10 发布） | [已取得 · 期刊官网 PDF ↗](https://www.china-oncology.com/rc-pub/front/front-article/download/141011677/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882024%E5%B9%B4%E7%89%88%EF%BC%89.pdf) | 补充源：查 2025 精要本压缩掉的完整章节 |
| CSCO | CSCO 乳腺癌诊疗指南 | 2023 版（58 页扫描 PDF） | [已取得（本地扫描件）· 转载 PDF ↗](https://www.healthcare-bio.com/upload/20231226/aa65e60b5180f43e34784c93dfbb2cf9.pdf) | 对照源：看中国 I/II/III 级分层推荐的写法，不作阈值来源；链接为第三方转载，非官方发布页 |
| NCCN | NCCN Guidelines · Breast Cancer | V7.2026（指南页 2026-10-27 显示） | [未取得原件（需机构订阅）· 官方指南页 ↗](https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1419) | 仅在 2025 精要本 P80 被引述；本台不单独引用其条文。该页版本随更新滚动 |
| AJCC | Cancer Staging Manual, 8th ed.（乳腺章节） | 2017 | [未取得原件（据精要本 P35 转引）· 二次来源 ↗](https://pubmed.ncbi.nlm.nih.gov/28294283/) | TNM 解剖学分期与预后分期的口径 |
| WHO | Classification of Tumours: Breast Tumours, 5th ed. | 第 5 版（2019） | [未取得原件 · IARC 出版页 ↗](https://publications.iarc.who.int/Book-And-Report-Series/Who-Classification-Of-Tumours/Breast-Tumours-2019) | 组织学类型命名的唯一口径 |

- 一台一表，不合并；未取得原件的必须标出来。
- 两套口径（AJCC 解剖分期 / 预后分期）并存时两列并列，本表不做换算。

**来源**：见上表逐行；每行「原件」列都是可点链接（§2.5）。链接由 `scripts/check-primer-links.mjs` 逐条复核（2026-10-27：9/9 可达）。

## 2.6 看板状态卡（疾病概要的触发器）

看板首卡按 starter 36 号 §2.6 的四件结构实现（`prototypes/v0.4/app.js` 的 `stageCard()`）：

| 件 | 本台落法 |
|---|---|
| ① 卡头 | `D+279 状态卡 · 距下次安排 9 天`（eyebrow 层，天数与距离都由日期算） |
| ② 大字天数 | `第 279 天`（30px 品牌色），下面一行小字写死锚点：`锚点 2026.01.21（手术日 = Day 0）· 由档案日期算出，不手填` |
| ③ 现状行 | 阶段 pill（`内分泌治疗`）+ 状态（`进行中 · 2026-06 起`）+ `下次：2026.11.05 · 复查（乳腺外科） · 医院安排` |
| ④ 出口按钮排 | 主：`看治疗历程（按次）→` 进当前阶段核心页；副：`疾病概要：乳腺癌是什么？`（`data-primer-open`，打开本浮窗） |

口径上的三条自我约束：

- **锚点不是编的**：`p1` 的 2026-01-21 由引流记录反推（01-22 起 45→30→15→0 ml，术后第 1 天起记量），与病理 01-23、出院 01-25 一致；`p2`（未手术）没有锚点，整卡显示「待初始化 + 三步初始化」，不做假数字。
- **「下次」只读用户自己的未完成待办**，不由指南随访间隔推算——按间隔算出来的日期就是替医生排日程。
- **别人画像不借用 DEMO-1 的待办**：`p3`–`p5` 只演示元数据，卡上「下次：还没有记下安排」，否则会凭空给出一场「已预约的复查」。

## 3 目前治疗全景概要（`landscape`）

按期别 / 线序分组，只列指南列举过的手段类别，不排序、不比优劣、不含剂量与疗程。

### 3.1 早期可手术（局限期）

- 手术：乳腺处理与区域淋巴结处理分别成章；2025 版 P65 增加「保守性全乳切除」的写法，P79 增加豁免前哨淋巴结活检的三条情形。术式取舍属医生判断。
- 放疗：保乳术后放疗、术后胸壁放疗在指南结构中被列出；本台只记「做过没有、什么时候、几次」。
- 新辅助与辅助系统治疗：按分子分型分层列出化疗、内分泌治疗、抗 HER2 治疗（P109、P113）。

### 3.2 局部晚期 / 转移后

- 系统治疗按分子分型与线序分组：内分泌治疗、化疗、抗 HER2 靶向、CDK4/6 抑制剂、PARP 抑制剂、免疫治疗。具体药是否国内获批、是否在医保内需单独核实。
- 局部处理：寡转移灶的放疗或手术在特定情形下被列出。
- 临床研究：被列为正式选项，不是最后手段。

### 3.3 贯穿全程

- 随访节奏：P208 表 9.5、P209 表 9.6；本台只并排显示「指南节奏 / 你最近一次 / 参考窗口」，不发提醒、不写「该复查了」。
- 不良反应分级：主口径 CTCAE v5.0；中国指南口径（如 P227 的中性粒、肝损、QTc）并列在卡片背面，两套级差不取严。

**固定出口（原话照抄）**：

> 以上是文献与指南里列出的手段，按病期与线序排列，不代表任何一项适合你。选哪一个，这一句需要问你的医生。

**来源**：CACA-CBCS / CMA-CSO-BO · 乳腺癌诊治指南与规范（2025 年版 精要本）· 2025 精要本 · 原件已取得 · 页码 P65、P79、P109、P113、P208–P209、P227

## 4 发展趋势（`trend`）

只写已发生的事实，每条带日期或版本号。

1. 2024-06-10：《中国抗癌协会乳腺癌诊治指南与规范（2024 年版）》全文版发布（本项目收录的是公众号转载件）。
2. 2024-12-22：同系列《2025 年版 精要本》发布，共 246 页。
3. 2025 精要本 P35「乳腺癌的 TNM 分期」按 AJCC 第 8 版分期原文，对本页内容做了系统性修改。
4. 2025 精要本 P29「乳腺常用影像学方法的比较」新增「乳腺断层 X 线」相关内容。
5. 2025 精要本 P93、P94 为新增页：自体皮瓣乳房重建技术、植入物乳房重建分类。
6. 《中国癌症杂志》第 35 卷第 12 期（P1157–P1255）刊出《中国抗癌协会乳腺癌诊治指南与规范（2026 年版）》，[期刊官网提供 PDF ↗](https://www.china-oncology.com/rc-pub/front/front-article/download/145257590/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882026%E5%B9%B4%E7%89%88%EF%BC%89.pdf)。本台当前仍以 2025 年版精要本作为页码来源，尚未按 2026 年版逐页核对。
7. 2025 精要本 P80 记录：NCCN 等提出「腋窝临床体检阴性、影像学 1–2 枚淋巴结异常且细针穿刺阳性者可尝试前哨淋巴结活检」，国内专家团 2024 年 10 月投票同意率低于 50%。

**未写**：本项目没有自采的在研登记数量，也没有核实过 NMPA 批件，所以这两类事实一条都没有写；不拿印象补。

**来源**：CACA-CBCS / CMA-CSO-BO · 乳腺癌诊治指南与规范（2025 年版 精要本）· 修订汇总 · 2025 精要本（2024-12-22 发布）· 原件已取得 · 页码 P23–P94 ｜ CACA-CBCS / CMA-CSO-BO · 中国抗癌协会乳腺癌诊治指南与规范（2024 年版）· 2024 版（2024-06-10）· 未取得原件（公众号转载件）· 页码待核

## 5 落地清单

- [x] `prototypes/v0.4/`（在 v0.3.0 冻结基准上新建；v0.3 保持原样，未回改）
- [x] `prototypes/v0.4/primer.css` / `primer.js`（starter `assets/patterns/` 最新版原样复制，含 §2.5 `safeHref`/`dp-miss`）
- [x] `prototypes/v0.4/primer-data.js`（四段数据 + 每条来源 `url`/`secondaryUrl`，图书行 `nolink`+`note`）
- [x] `index.html` 三处引用 + 顶栏手写「?」按钮（`data-primer-open`）：顶栏入口与看板状态卡副按钮**两处都能开**
- [x] 看板首卡 `stageCard()`（§2.6 四件）
- [x] README 的 `## 疾病概要` 四段正文（位置：项目简介之后、`## 三道闸口` 之前），表内每行带链接
- [x] `scripts/check-primer-links.mjs`（新增）：抓出数据里所有 https 链接逐条验可达，反向对照注入死链会报 FAIL
- [x] 探针 9/9 PASS；`--self-test` 6/9（3 条注入缺陷全报红）
- [x] 链接复核 9/9 可达（2026-10-27）

## 6 验收（P1–P8）

| 编号 | 判据 | 结果 |
|---|---|---|
| P1 | 顶栏有可点「?」，aria-label 说明四段 | ✅ text="?" label="疾病概要：乳腺癌是什么？定义、医学资料与指南情况、治疗全景、发展趋势" |
| P2 | 整页面板，四段顺序 定义 → 指南 → 治疗全景 → 趋势 | ✅ definition › evidence › landscape › trend |
| P3 | 面板宽高 ≥ 视口 90% | ✅ 1249×829 / 视口 1280×860 |
| P4 | 打开压一条 history，`history.back()` 收起 | ✅ history.length=3；返回后 open=false |
| P5 | 「返回」「关闭」两个独立入口 | ✅ back=true close=true same=false |
| P6 | 关闭后焦点回触发按钮、滚动位置不变 | ✅ focusOnTrigger=true scrollY=260→260 |
| P7 | Esc 只退一层 | ✅ open=false，URL 仍在 /prototypes/v0.3/index.html |
| P8 | 四段齐全、每段有来源、趋势段无禁止词 | ✅ |
| L1 | 指南表每行「原件」列都是可点 https 链接 | ✅ 7/7 行有链接，`.dp-miss` 红标 0 处 |
| L2 | 数据里 9 条链接逐条可达 | ✅ `check-primer-links.mjs` 9/9（注入死链反向对照 8/9 → 报 FAIL） |
| S1 | 状态卡四件齐全（卡头/天数/现状/出口） | ✅ 卡高 221px；`第 279 天` 由 2026-01-21 派生 |
| S2 | 无锚点档案显示「待初始化」 | ✅ `p2` → `is-empty`，主按钮改为「开始三步初始化」 |
| S3 | 1440/1024/900/768 四档 + 大字模式无溢出 | ✅ `bodyOverflow=false`，按钮无裁切 |

## 7 本项目教训

- **有原件也不能全页引用**：2025 精要本是 MinerU 抽取件，`manifest.json` 写明「表格以 HTML 片段保留，个别数字可能串行」。所以定义段只用了 P35/P36/P40 的叙述句，分级阈值仍留在卡片背面、不进概要。
- **NCCN 的版本号查不到就不写**：项目里只在精要本 P80 见到「NCCN 指南等提出」这一句转述，没有版本号。初稿想写「NCCN 2025」，撤掉了，改成「版本未核实」——填一个像样的年份比留空更容易误导。
- **趋势段没有硬凑到五类**：本项目没有自采的在研登记数量，也没核实过任何 NMPA 批件。初稿想把这两类也写上，但手上只有二手描述，最后整类留空——「本台没有这条数据」比「写一句听起来像事实的话」安全。

- **冻结原型不能动，哪怕要补的是新规范**：v0.3.0 是 G1/G2 签认的视觉基准（D37），`scripts/check-version.mjs` 把它钉在 0.3.0。一开始直接改 v0.3 是错的——补 36 号 v2 应当新开 `v0.4`，让「UI 以 v0.3.0 为准」这条依据保持成立。
- **链接是查出来的，不是推出来的**：初稿差点把 `doi:10.19401/j.cnki.1007-3639.2025.01.001` 当成 2025 版指南（二手引文给的），打开一看是胰腺癌综述。最后用的是期刊官网 PDF：2026 版 1.71 MB、2024 版 1.98 MB，都能整份下载。
- **发现新版不等于可以改口径**：期刊官网已刊出 2026 年版，但本台没逐页核对，所以只在「指南情况」表里并列一行 + 趋势段记一条事实，主引用源与页码仍是 2025 精要本。换版本要重核全部页码，那是另一轮的事。
