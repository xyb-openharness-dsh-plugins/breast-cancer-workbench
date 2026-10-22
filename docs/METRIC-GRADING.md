# 指标分级与卡片提醒（本仓实现）

> 原则见脚手架仓 `xyb-workbench-starter` 的 `docs/23-METRIC-GRADING-AND-ALERTS.md`（v1.4.2 起）。
> 本文只写**这一仓怎么落地**：文件位置、阈值、状态机与验收。改行为前先读原则，别只改代码。

引入版本：v0.7.0（2026-10-20，用户定则：指标卡要分组；化疗后并发症如骨髓抑制，表达上是头晕无力、指标上是中性粒细胞低，用 CTCAE 分级对照）。
v0.10.0（2026-10-22）新增**指南出处层（G1）**：分级主口径仍是 CTCAE v5.0，指南口径只在卡片背面并列一行、**不取严**；出处数据在 `assets/reference/guideline/refs.json`，实现见 `dsh/guideline.js`，方案见 [GUIDELINE-BRIDGE](GUIDELINE-BRIDGE.md)。
v0.11.0（2026-10-22）新增**随访节奏层（G2）**：只算参考节点（指南间隔 + 手术日），**不碰分级**——它不出任何级别、不判轻重，因此本文的分级口径未变；数据在 `assets/reference/guideline/cadence.json`，实现见 `dsh/cadence.js`。
v0.12.0（2026-10-22）**分级扩项（G3）**：新增 ×ULN 五项与 QTc 绝对值型（见 §2.1）。字典 18 → 22 项；`addObservation` 开始接受并校验 `ref_low` / `ref_high`。分级主口径仍是 CTCAE v5.0。

---

## 1. 文件分工

| 文件 | 职责 | 不许做 |
|---|---|---|
| `assets/reference/ctcae/` | 标准原文 PDF + 来源说明（唯一一份，不在 `public/` 复制） | 不放代码 |
| `dsh/ctcae.js` | 阈值表、`ctcaeGrade()` 纯函数、元信息 `CTCAE_META` | 不碰数据库、不判断处置 |
| `dsh/readmodels.js` | `gradeCtcae()` 挂到指标卡；`marrowSuppression()` 算 `paired`/`labsOnly` | 不落库 |
| `dsh/workbench.js` | `metrics().ctcae` 透传元信息；`overview().marrow` 给看板 | 不复制阈值 |
| `dsh/server.js` | `GET /api/reference/ctcae` 只读原文 | 不暴露任意文件 |
| `public/js/ui.js` | `gradeBadge()` / `gradeLine()` / 卡片正面徽章与背面区间 | 不硬编码版本与阈值 |
| `public/js/pages-basic.js` | `metricGroupsHTML()` 分组、`ctcaeReference()` 对照块、`guidelineReference()` 出处块、`marrowStrip` 看板提醒 | 不自己判"该不该提醒" |
| `assets/reference/guideline/refs.json` | 指南页码、表号、≤200 字摘录、未对照项的原因 | 不放正文；不放处置条文 |
| `dsh/guideline.js` | `guidelineRef()` / `cbcsView()` / `refLabel()` 纯函数 | 不覆盖 CTCAE 的级、不取严、不判断 |

---

## 2. 阈值（`dsh/ctcae.js`，以 PDF 为准）

| 指标 | 术语 | 单位 | G1 | G2 | G3 | G4 |
|---|---|---|---|---|---|---|
| `wbc` 白细胞 | 白细胞减少 | 10⁹/L | <3.5–≥3.0 | <3.0–≥2.0 | <2.0–≥1.0 | <1.0 |
| `anc` 中性粒细胞绝对值 | 中性粒细胞减少 | 10⁹/L | <2.0–≥1.5 | <1.5–≥1.0 | <1.0–≥0.5 | <0.5 |
| `hgb` 血红蛋白 | 贫血 | g/L | <120–≥100 | <100–≥80 | <80 | 无数值界限 |
| `plt` 血小板 | 血小板减少 | 10⁹/L | <125–≥75 | <75–≥50 | <50–≥25 | <25 |

- 区间左闭右开：`v < 上界` 才进该级，等于上界算轻一级（单测钉住）。
- `hgb` 的 `maxGrade: 3`：标准里 G4 是"危及生命，需紧急处理"，没有数值门槛，本地不给 G4。
- 通用下限（`llfn`）是成人近似值，结果恒带 `approx: true`，界面写"按通用下限"。
- `ctcaeCoveredCodes()` 返回 `['anc','hgb','plt','wbc']`；其他指标（含 CA15-3 / CEA）恒 `null`——**标志物不是不良事件，不做分级**。

### 2.1 ×ULN 型与绝对阈值型（v0.12.0 起）

| 指标 | 术语 | 单位 | G1 | G2 | G3 |
|---|---|---|---|---|---|
| `alt` 丙氨酸氨基转移酶 | 丙氨酸氨基转移酶升高 | U/L | >1.0–3.0 | >3.0–5.0 | >5.0–20.0 |
| `ast` 天冬氨酸氨基转移酶 | 天冬氨酸氨基转移酶升高 | U/L | >1.0–3.0 | >3.0–5.0 | >5.0–20.0 |
| `alp` 碱性磷酸酶 | 碱性磷酸酶升高 | U/L | >1.0–2.5 | >2.5–5.0 | >5.0–20.0 |
| `tbil` 总胆红素 | 总胆红素升高 | μmol/L | >1.0–1.5 | >1.5–3.0 | >3.0–10.0 |
| `cr` 肌酐 | 肌酐升高 | μmol/L | >1.0–1.5 | >1.5–3.0 | >3.0–6.0 |
| `qtc` 校正后 QT 间期 | QT 间期延长 | ms | 450–480 | 481–500 | ≥501 |

- 上表五项的边界是 **×ULN**，不是绝对值（QTc 那行是绝对值）。页码：ALT/AST/ALP P84，TBIL P85，Cr P86，QTc P87。
- **必须用这张化验单自己的参考上限**（`ref_high`）。没有就返回 `needsUln`，卡面给虚线徽章「需参考上限」，**绝不用成人通用上限凑倍数**——ALT 的 ULN 各实验室 40–55 U/L，差 1.4 倍，一除就能把 2 级说成 1 级。这与"降低"类用通用下限近似（带 `approx: true`）是两套处理，别混。
- 倍数 `≤1` 记 0 级（`ctcaeGrade` 返回 `{ grade: 0 }`），读模型再过滤成 `null`，卡面不显示"0 级"。
- `qtc` 的 `maxGrade: 3`：原文 G3 另有"较基线增加 >60ms"、G4 是心律失常定义，本地无基线概念也无心电结构化数据，故不采用。值 `< 100` 视为填了秒，返回 `needsUnit`，不替用户换算。
- `ctcaeCoveredCodes()` 仍只含血液学四项；全量用 `ctcaeAllCodes()`，只要 ×ULN 型用 `ctcaeUlnCodes()`。原因是骨髓抑制页的两列并置只该出现骨髓项。

---

## 3. 提醒状态机（`marrowSuppression()`）

```
表达面 = symptom_entry.code ∈ {fatigue, dizziness}   （每个 code 取最近一条）
指标面 = metricCards 里 ctcae.grade 非空的那几项

paired   = 两侧都非空   → 看板弹提醒条（两列并置）
labsOnly = 只有指标面   → 不弹提醒；卡片徽章照常显示
只有感受                → 什么也不生成（不拿感受去猜指标）
```

`highestGrade` 取指标面最高级，仅用于排序与将来聚合，界面不写"最重是 3 级"这种结论句。

---

## 4. 文案纪律

- 徽章：`对照 CTCAE v5.0 · 3 级`；背面：`CTCAE v5.0 3 级 · 0.5–<1 10⁹/L · 按通用下限 · 对照不是诊断`。
- 禁用：`偏高 / 偏低 / 异常 / 轻中重 / 需要处理 / 建议复查 / 白细胞低导致头晕`。
- 提醒条收尾固定一句："只把已经记录的内容并列摆出，不推断因果，也不判断是否需要处理。"
- 场景词看治疗记录：有 `kind='chemo'` 才写"化疗后"，否则"治疗期间"。

---

## 5. 验收（对应原则文档 M1–M11）

- [x] M1 分组：指标检测页与一图秀共用 `metricGroupsHTML()`，组名/顺序/项数一致（实测 7 组）。
- [x] M2 无记录指标仍列出、无徽章。
- [x] M3 只有四项有分级；`alt/cr` 等不显示。
- [x] M4 边界单测（`test/ctcae.test.mjs`，13 条）。
- [x] M5 徽章文案固定式，无"偏高/异常"。
- [x] M6 `approx` 显示"按通用下限"；贫血最多 3 级。
- [x] M7 三态：`paired` 弹提醒、`labsOnly` 不弹、只有感受不生成（单测各一条）。
- [x] M8 两列并置、各带日期来源、无因果/处置句；场景词按治疗记录。
- [x] M9 指标检测页可开原文；接口只给这一份 PDF（文件名取自元信息 + 目录边界校验）。
- [x] M10 卡片背面放上区间后页脚可见（截图确认）。
- [x] M11 ≤700px 两列自动堆叠，页面横向溢出 0（1040/900/800/700 四档实测）。

---

## 6. 换版流程

1. 替换 `assets/reference/ctcae/` 的 PDF 与 README（记新 MD5）；
2. 改 `CTCAE_META`（version / published / localPdf）；
3. 改阈值表并同步 `test/ctcae.test.mjs` 的边界断言；
4. 升 minor 版本、写 CHANGELOG（列出阈值变化）；
5. `npm run check` 全绿后重新打包装机。
