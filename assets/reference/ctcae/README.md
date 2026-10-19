# CTCAE v5.0（本地对照标准）

## 这是什么

`CTCAE_v5.0_Quick_Reference_5x7.pdf` 是美国国家癌症研究所（NCI）癌症治疗评估计划（CTEP）发布的
**Common Terminology Criteria for Adverse Events（不良事件通用术语标准）v5.0** 快速参考手册
（5×7 英寸小册版），出版日期 2017-11-27，U.S. Department of Health and Human Services。

- 官方页面：https://ctep.cancer.gov/protocoldevelopment/electronic_applications.htm
- 本文件下载源：https://dctd.cancer.gov/research/ctep-trials/for-sites/adverse-events/ctcae-v5-5x7.pdf（下载于 2026-10-20；ctep.cancer.gov 直链当时被防爬页拦，ClinicalTrials.gov 官方登记多处引用此 dctd 地址为 CTCAE v5.0 文档）
- 首页水印：`Common Terminology Criteria for Adverse Events (CTCAE) Version 5.0, Published: November 27, 2017`

## 使用原则（与 docs/23 号沉淀原则一致）

1. **只做对照，不做诊断**：工作台把已记录的化验值对照 CTCAE 阈值给出"1–4 级"标签，
   分级是国际通行的客观区间对照，**不是**诊断、疗效或处理建议；是否处理由治疗团队判断。
2. **只对有定义的指标做**：目前覆盖血液学四项（白细胞、中性粒细胞绝对值、血红蛋白、血小板）。
   ALT/AST/肌酐等"×ULN"型指标需要化验单参考范围上限，本地未结构化前**不启用**，不近似。
3. **来源必须可见**：界面上出现分级的地方都要能看到 "CTCAE v5.0" 字样与免责句
   （"分级是对照，不是诊断；处置由治疗团队判断"）。
4. **更新版本 = 换文件 + 改代码常量 + 升版本号**：CTCAE 出新版（如 v6）时，替换本目录 PDF、
   更新 `dsh/ctcae.js` 的 `CTCAE_META`，按 VERSIONING 升工作台版本。

## 版权说明

CTCAE 是 NCI/CTEP 的公开出版物，本仓库（private、MIT 但 assets 例外）仅**本地留存副本**
用于患者个人对照查看，不随公开分发物再分发；`package.json` 的 `files` 含 `assets` 时，
发布公开 npm 包前需确认再分发政策（当前 `private: true`，不受影响）。

## 代码对应

`dsh/ctcae.js` 内置了本项目 18 项指标中可分级的子集与阈值（抄录自本 PDF 的血液学条目），
由 `test/ctcae.test.mjs` 钉住。阈值与本 PDF 冲突时，以 PDF 为准并修代码。
