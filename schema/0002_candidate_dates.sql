-- 0002_candidate_dates.sql
-- 补两列"医疗事件日期"，解决 DATA-FLOW-SPEC §10 记下的结构缺口：
-- candidate 与 document 原本都没有日期列，而第 ⑤ 步要写 record.occurred_on。
--
-- 依据：2026-10-17 用户确认「ok」（DESIGN-SESSION D35）。
-- 两列都可空：老数据一律 NULL，**不回填**、也不拿 imported_at 顶替
-- （导入时间 ≠ 报告日期 ≠ 采样日期 ≠ 出院日期，混用会让一图秀画错横轴）。
--
-- document.report_date  —— 原件上写明的报告/采样日期，解析器读到就存，用户核对时可改。
-- candidate.occurred_on  —— 这条候选属于哪一次医疗事件；通常整页继承 report_date，逐条可覆盖。

ALTER TABLE document ADD COLUMN report_date TEXT
  CHECK (report_date IS NULL OR report_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');

ALTER TABLE candidate ADD COLUMN occurred_on TEXT
  CHECK (occurred_on IS NULL OR occurred_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');

CREATE INDEX idx_candidate_occurred ON candidate(occurred_on);
