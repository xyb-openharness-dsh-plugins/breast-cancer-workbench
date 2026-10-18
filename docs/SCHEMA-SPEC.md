# 小粉宝工作台 · 数据模型规格 SCHEMA-SPEC v0.1

日期：2026-10-17。状态：**草案，待 G3 评审**。评审通过前不改 `schema/`、不建库、不写迁移。
体例参照 `xyb-workbench/docs/design/SCHEMA-SPEC.md` 与 `schema/freeze-contract.md`；本项目的差异在癌种字段与"看法=信息"。

上级文档：[SPEC v0.4 §5](SPEC.md)（数据模型摘要）· [DATA-FLOW-SPEC](DATA-FLOW-SPEC.md)（写入与派生）· [BREAST-DOMAIN](BREAST-DOMAIN.md)（指标字典与领域维度）。

---

## 1. 直接回答：为什么现在必须写 schema

上一版 SPEC 只有一句"实体：Workspace、Subject、Document…"，那是**名词清单，不是数据模型**。它回答不了实现时必须回答的问题：

| 必须回答 | 名词清单给不出 | 本文给出 |
| --- | --- | --- |
| 四点位臂围是一次记录还是四次记录？ | 只说"Measurement" | `arm_set` 1 条 + `measurement` 4 条，`set_id` 外键 |
| "未检测"和"阴性"怎么区分？ | 只说"病理字段" | `biomarker.value_text` 三态：`negative` / `positive` / `not_tested`，NULL 仅表示未知 |
| 用户说"我担心复发"存哪？ | 没有位置 | `viewpoint`，且 `is_conclusion=0` 恒为 0（见 §5.4） |
| 更正的旧值还要不要？ | 只说"支持纠正" | `supersedes_id` 链 + `status='superseded'`，不物理删除 |
| 两页算法会不会不一致？ | 无法约束 | 派生口径写死在 DATA-FLOW §4，不落库 |

**权威是领域模型，不是页面。** 页面只能证明模型漏了东西（例如"术后上肢"要能记活动度，模型就得有 `measurement`），不能反过来决定表结构。本文无任何页面字面量、无 Tab 名、无排序/折叠等界面状态列。

---

## 2. 存储选型与约定

| 项 | 约定 | 理由 |
| --- | --- | --- |
| 引擎 | SQLite（`node:sqlite`），单文件 | 本机工作台，无服务端；与宿主插件同进程 |
| 主键 | `TEXT`，UUIDv7 或 `prefix_` + 时间有序 id | 跨表引用稳定；导出/合并时可去重 |
| 时间 | 日期 `TEXT 'YYYY-MM-DD'`；时刻 `TEXT` ISO-8601 带时区 | 与原型、导出、界面同格式，避免时区歧义 |
| 布尔 | `INTEGER 0/1` + `CHECK (x IN (0,1))` | SQLite 无原生 bool |
| 枚举 | `TEXT` + `CHECK ... IN (...)` | 比关联表轻；取值集中在本文件 |
| 数值 | `REAL`（测量/检验值） | 保留小数；显示精度由 `metric_definition.dec` 决定 |
| 单位 | 值旁必带 `unit`，不依赖指标默认单位 | 同一指标可能换单位，旧值不能悄悄换算 |
| 删除 | 业务数据**逻辑删除**（`status`），不物理删除 | 来源与导出需要回溯 |

---

## 3. 实体关系

```
workspace 1─n subject 1─n document 1─n parse_job
                    │             └─n candidate ──┐
                    │                              ↓
                    ├─n record 1─n source_ref   record 1─n candidate
                    │      ↑ supersedes_id (record 链)
                    ├─n observation ── metric_definition
                    ├─n measure_protocol ─n measurement ─ arm_set 1─n measurement
                    ├─n treatment_event
                    ├─n diagnosis_note / biomarker
                    ├─n symptom_entry / viewpoint / care_entry / subject_stage
                    ├─n task / question / saved_result
                    └─n export_job (快照)   change_log (审计)
```

一条链要记住：**原件不一定有解析结果；解析结果不一定被接受；被接受的才成为 `record`，才有指标与摘要。** 四层不可合并。

---

## 4. DDL（目标结构）

> 下面是**目标结构**，用于评审字段与约束。G3 通过后才拆成 `schema/0001_initial.sql` 并由 `migrate.mjs` 执行。

### 4.1 空间与主体

```sql
CREATE TABLE workspace (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  schema_version TEXT NOT NULL,              -- 与 schema/ 迁移号对应
  created_at    TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}'   -- 工作区级偏好（导出格式默认值等），不含界面状态
);

CREATE TABLE subject (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('patient','caregiver')),
  display_name  TEXT NOT NULL,               -- 允许化名
  birth_year    INTEGER,                     -- 只存年份：够算年龄段，少暴露
  sex           TEXT CHECK (sex IN ('female','male','other','unknown')),
  laterality    TEXT NOT NULL DEFAULT 'unknown'
                CHECK (laterality IN ('left','right','bilateral','unknown')),
  menopause     TEXT CHECK (menopause IN ('pre','peri','post','unknown')),
  created_at    TEXT NOT NULL,
  archived_at   TEXT
);
CREATE INDEX idx_subject_ws ON subject(workspace_id, role);

-- 用户自己声明的当前阶段（不是推断）
CREATE TABLE subject_stage (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL CHECK (stage IN
              ('newly_diagnosed','neoadjuvant','post_op','radiotherapy','endocrine','followup','metastatic')),
  declared_on TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'self_declared'
              CHECK (source IN ('self_declared','caregiver_declared')),
  note        TEXT
);
CREATE INDEX idx_stage_subject ON subject_stage(subject_id, declared_on DESC);
```

### 4.2 材料与解析

```sql
CREATE TABLE document (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN
              ('pathology','imaging','lab','discharge','prescription','rehab_advice','other')),
  filename    TEXT NOT NULL,
  mime        TEXT,
  bytes       INTEGER,
  sha256      TEXT NOT NULL,                 -- 去重与"原件未变"判断
  page_count  INTEGER,
  imported_at TEXT NOT NULL,
  storage_path TEXT NOT NULL,                -- 相对工作区目录
  status      TEXT NOT NULL DEFAULT 'stored'
              CHECK (status IN ('stored','parsed','parse_failed','archived'))
);
CREATE UNIQUE INDEX uq_document_hash ON document(subject_id, sha256);

CREATE TABLE parse_job (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
  engine      TEXT,
  started_at  TEXT,
  finished_at TEXT,
  error_code  TEXT,                          -- 失败也必须留在列表里，可重试
  error_text  TEXT
);
CREATE INDEX idx_parse_doc ON parse_job(document_id, started_at DESC);

-- 待核对候选：来自解析或手工补录，未接受前不进事实层
CREATE TABLE candidate (
  id           TEXT PRIMARY KEY,
  document_id  TEXT REFERENCES document(id) ON DELETE CASCADE,
  record_id    TEXT REFERENCES record(id) ON DELETE SET NULL, -- 接受后回填
  field        TEXT NOT NULL,                -- metric:ca153 / pathology:er / treatment:name …
  value_text   TEXT,
  value_num    REAL,
  unit         TEXT,
  method       TEXT,
  page_ref     TEXT,
  bbox_json    TEXT,
  confidence   REAL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','edited','rejected','needs_review')),
  decided_at   TEXT,
  decided_by   TEXT CHECK (decided_by IN ('patient','caregiver','clinician')),
  UNIQUE (document_id, field, value_text)
);
CREATE INDEX idx_candidate_status ON candidate(status);
```

### 4.3 事实底座

```sql
CREATE TABLE record (
  id             TEXT PRIMARY KEY,
  subject_id     TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN
                 ('lab','pathology','imaging','treatment','measurement','symptom','note','discharge')),
  occurred_on    TEXT NOT NULL,              -- 事件发生在医疗系统里的日期
  recorded_at    TEXT NOT NULL,              -- 录入本机的时间（两者不可混用）
  source_kind    TEXT NOT NULL CHECK (source_kind IN
                 ('report_transcription','patient_reported','caregiver_reported',
                  'clinician_documented','device_imported')),
  source_document_id TEXT REFERENCES document(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'accepted'
                 CHECK (status IN ('accepted','needs_review','superseded','rejected')),
  version        INTEGER NOT NULL DEFAULT 1,
  supersedes_id  TEXT REFERENCES record(id),  -- 更正链：新记录指向旧记录
  reviewed_by    TEXT CHECK (reviewed_by IN ('patient','caregiver','clinician','none')),
  note           TEXT
);
CREATE INDEX idx_record_subject ON record(subject_id, occurred_on DESC);
CREATE INDEX idx_record_status  ON record(status);
CREATE UNIQUE INDEX uq_record_supersedes ON record(supersedes_id) WHERE supersedes_id IS NOT NULL;

-- 出处：一条记录可以引用多处原文（例如一次出院小结里既有诊断又有用药）
CREATE TABLE source_ref (
  id          TEXT PRIMARY KEY,
  record_id   TEXT NOT NULL REFERENCES record(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  page        INTEGER,
  bbox_json   TEXT,
  quote       TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_source_record ON source_ref(record_id);
```

### 4.4 临床事实（转录，不判定）

```sql
CREATE TABLE diagnosis_note (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  record_id     TEXT REFERENCES record(id) ON DELETE SET NULL,
  noted_on      TEXT NOT NULL,
  specimen_site TEXT,                        -- 乳腺/腋窝淋巴结/对侧…
  histology     TEXT,                        -- 浸润性导管癌等，原样转录
  grade         TEXT,
  stage_text    TEXT,                        -- 医生原文，如 "IIA (T2N0M0)"
  er_status     TEXT CHECK (er_status IN ('positive','negative','not_tested','unknown')),
  pr_status     TEXT CHECK (pr_status IN ('positive','negative','not_tested','unknown')),
  her2_status   TEXT CHECK (her2_status IN ('positive','negative','equivocal','not_tested','unknown')),
  ki67_percent  REAL,
  is_transcription INTEGER NOT NULL DEFAULT 1 CHECK (is_transcription IN (0,1)) -- 一期恒为 1：只转录不判定
);
CREATE INDEX idx_dx_subject ON diagnosis_note(subject_id, noted_on DESC);

CREATE TABLE biomarker (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  record_id     TEXT REFERENCES record(id) ON DELETE SET NULL,
  marker        TEXT NOT NULL,               -- ca153 / cea / er / pr / her2 / ki67 …
  value_text    TEXT,                        -- 定性结果
  value_num     REAL,                        -- 定量结果
  unit          TEXT,
  -- 三态必须能分开：阴性、阳性、未检测；NULL 只表示"还不知道"
  result_state  TEXT NOT NULL CHECK (result_state IN ('negative','positive','equivocal','not_tested','unknown')),
  method        TEXT,
  specimen_date TEXT,
  specimen_site TEXT
);
CREATE INDEX idx_biomarker ON biomarker(subject_id, marker, specimen_date DESC);

CREATE TABLE treatment_event (
  id                TEXT PRIMARY KEY,
  subject_id        TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('surgery','chemo','radio','endocrine','targeted','immuno','other')),
  name              TEXT NOT NULL,
  laterality        TEXT CHECK (laterality IN ('left','right','bilateral','na')),
  axillary_procedure TEXT CHECK (axillary_procedure IN ('none','slnb','alnd','unknown')),
  radiation_field   TEXT,                    -- 胸壁/锁骨上/腋窝/全乳…
  planned_start     TEXT,
  planned_end       TEXT,
  actual_start      TEXT,
  actual_end        TEXT,
  status            TEXT NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned','ongoing','completed','stopped','unknown')),
  record_id         TEXT REFERENCES record(id) ON DELETE SET NULL,
  note              TEXT,
  CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start),
  CHECK (actual_end  IS NULL OR actual_start  IS NULL OR actual_end  >= actual_start)
);
CREATE INDEX idx_tx_subject ON treatment_event(subject_id, COALESCE(actual_start, planned_start));
```

### 4.5 指标、协议与测量

```sql
-- 指标字典：版本化。改单位/口径必须发新版本，老数据仍指向旧版本
CREATE TABLE metric_definition (
  code          TEXT NOT NULL,               -- ca153 / wbc / arm_diff / arm_flex / drain_vol …
  version       INTEGER NOT NULL,
  name          TEXT NOT NULL,
  unit          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN
                ('tumor_marker','cbc','chemistry','cardiac_bone','nutrition','rehab','drainage')),
  value_type    TEXT NOT NULL CHECK (value_type IN ('numeric','ordinal','text')),
  dec           INTEGER NOT NULL DEFAULT 1,  -- 显示小数位
  comparable_by TEXT NOT NULL CHECK (comparable_by IN ('lab_method','measure_protocol','none')),
  aliases_json  TEXT NOT NULL DEFAULT '[]',  -- 导入时的名称映射
  effective_from TEXT NOT NULL,
  supersedes    INTEGER,                     -- 上一版本号
  note          TEXT,
  PRIMARY KEY (code, version)
);

-- 测量协议：体位、点位、测量者，决定测量值能否互比
CREATE TABLE measure_protocol (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL,                 -- arm_circ_4pt / arm_flexion / grip
  version     INTEGER NOT NULL,
  label       TEXT NOT NULL,                 -- "坐位·双臂自然下垂·四点位"
  posture     TEXT,
  side_order  TEXT CHECK (side_order IN ('affected_first','healthy_first','paired')),
  points_json TEXT,                          -- ["wrist","forearm_mid","above_elbow_10","below_axilla_10"]
  assessor_required INTEGER NOT NULL DEFAULT 1 CHECK (assessor_required IN (0,1)),
  note        TEXT,
  UNIQUE (code, version)
);

-- 单点测量（1 行 = 1 个点位 1 次）
CREATE TABLE measurement (
  id             TEXT PRIMARY KEY,
  subject_id     TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  set_id         TEXT REFERENCES arm_set(id) ON DELETE CASCADE,  -- 四点位成组时必填
  metric_code    TEXT NOT NULL,
  metric_version INTEGER NOT NULL,
  record_id      TEXT REFERENCES record(id) ON DELETE SET NULL,
  measured_on    TEXT NOT NULL,
  point          TEXT,                       -- wrist / forearm_mid / above_elbow_10 / below_axilla_10
  side           TEXT NOT NULL CHECK (side IN ('left','right','na')),
  value_num      REAL NOT NULL,
  unit           TEXT NOT NULL,
  paired_value_num REAL,                     -- 健侧同点位值（成对测量时）
  derived_diff_num REAL,                     -- 患侧 − 健侧，写入时算一次存档
  protocol_id    TEXT REFERENCES measure_protocol(id),
  assessor_role  TEXT CHECK (assessor_role IN ('patient','caregiver','nurse','therapist','clinician','unknown')),
  device         TEXT,
  note           TEXT,
  FOREIGN KEY (metric_code, metric_version) REFERENCES metric_definition(code, version)
);
CREATE INDEX idx_meas_series ON measurement(subject_id, metric_code, measured_on DESC);
CREATE INDEX idx_meas_set    ON measurement(set_id);
CREATE UNIQUE INDEX uq_meas_point ON measurement(set_id, point, side) WHERE set_id IS NOT NULL;

-- 一次四点位测量 = 1 个 set + 4 个 measurement
CREATE TABLE arm_set (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  measured_on   TEXT NOT NULL,
  protocol_id   TEXT NOT NULL REFERENCES measure_protocol(id),
  assessor_role TEXT NOT NULL CHECK (assessor_role IN ('patient','caregiver','nurse','therapist','clinician','unknown')),
  record_id     TEXT REFERENCES record(id) ON DELETE SET NULL,
  note          TEXT
);
CREATE INDEX idx_armset_subject ON arm_set(subject_id, measured_on DESC);

-- 检验值（可连成趋势的客观值）
CREATE TABLE observation (
  id             TEXT PRIMARY KEY,
  subject_id     TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  metric_code    TEXT NOT NULL,
  metric_version INTEGER NOT NULL,
  record_id      TEXT REFERENCES record(id) ON DELETE SET NULL,
  observed_on    TEXT NOT NULL,
  value_num      REAL NOT NULL,
  unit           TEXT NOT NULL,
  lab_method     TEXT,                       -- 方法不同则不连线
  ref_low        REAL,
  ref_high       REAL,
  flag           TEXT CHECK (flag IN ('low','normal','high','unknown')),
  FOREIGN KEY (metric_code, metric_version) REFERENCES metric_definition(code, version)
);
CREATE INDEX idx_obs_series ON observation(subject_id, metric_code, observed_on DESC);
```

### 4.6 体验与日常（含"看法"）

```sql
CREATE TABLE symptom_entry (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  record_id   TEXT REFERENCES record(id) ON DELETE SET NULL,
  code        TEXT NOT NULL,                 -- arm_heaviness / tightness / swelling / fatigue / hot_flash / joint_pain
  level       INTEGER NOT NULL CHECK (level BETWEEN 0 AND 3),  -- 0 无 / 3 最重，主观强度
  occurred_on TEXT NOT NULL,
  body_side   TEXT CHECK (body_side IN ('left','right','bilateral','na')),
  note        TEXT,
  subject_role TEXT NOT NULL DEFAULT 'patient'
              CHECK (subject_role IN ('patient','caregiver')),
  is_private  INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0,1))
);
CREATE INDEX idx_symptom ON symptom_entry(subject_id, code, occurred_on DESC);

-- 看法/担心：是一条信息，不是结论。is_conclusion 恒为 0，留列是为了让约束显式
CREATE TABLE viewpoint (
  id           TEXT PRIMARY KEY,
  subject_id   TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  speaker_role TEXT NOT NULL CHECK (speaker_role IN ('patient','caregiver')),
  about_code   TEXT,                          -- 关联的指标/话题，可为空
  recorded_on  TEXT NOT NULL,
  is_conclusion INTEGER NOT NULL DEFAULT 0 CHECK (is_conclusion = 0),
  is_private   INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0,1)),
  withdrawn_at TEXT                           -- 可撤回，撤回后不进导出
);
CREATE INDEX idx_viewpoint ON viewpoint(subject_id, recorded_on DESC);

CREATE TABLE care_entry (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  stage       TEXT,                           -- 与 subject_stage.stage 同域
  kind        TEXT NOT NULL CHECK (kind IN
              ('wound','drain_note','rehab_advice','nutrition','mind','daily','followup')),
  title       TEXT NOT NULL,
  detail      TEXT,
  source_kind TEXT CHECK (source_kind IN ('clinician_documented','patient_reported','caregiver_reported','stored_advice')),
  source_date TEXT,                           -- 建议的原始日期：界面上必须显示
  is_private  INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0,1)),
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_care ON care_entry(subject_id, stage, kind);
```

### 4.7 行动与产出

```sql
CREATE TABLE task (
  id           TEXT PRIMARY KEY,
  subject_id   TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  detail       TEXT,
  due_on       TEXT,
  kind         TEXT NOT NULL CHECK (kind IN ('self','hospital','question_prep','followup')),
  owner_role   TEXT NOT NULL DEFAULT 'patient' CHECK (owner_role IN ('patient','caregiver')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  -- 完成待办不生成治疗事件：这是刻意的，见 SPEC A13
  CHECK (status <> 'done' OR completed_at IS NOT NULL)
);
CREATE INDEX idx_task_open ON task(subject_id, status, due_on);

CREATE TABLE question (
  id           TEXT PRIMARY KEY,
  subject_id   TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  supersedes_id TEXT REFERENCES question(id),
  -- 标记这是"看法"还是"待问的事实"，导出分区不同
  kind         TEXT NOT NULL DEFAULT 'fact' CHECK (kind IN ('fact','view')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','asked','answered','dropped')),
  include_in_export INTEGER NOT NULL DEFAULT 1 CHECK (include_in_export IN (0,1)),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_question ON question(subject_id, status, created_at DESC);

-- 已保留结果：快照，不随源数据静默变化
CREATE TABLE saved_result (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('summary','timeline','question_set','agent_reply','report')),
  title         TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,               -- 渲染所需最小集合 + 引用 id/版本
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL,
  stale_at      TEXT,                        -- 源数据更正后置位；不自动重算
  stale_reason  TEXT
);
CREATE INDEX idx_saved ON saved_result(subject_id, created_at DESC);

CREATE TABLE trial_snapshot (
  id          TEXT PRIMARY KEY,
  trial_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  phase       TEXT,
  status_text TEXT,
  criteria_text TEXT,
  source_url  TEXT,
  fetched_at  TEXT NOT NULL,
  is_sample   INTEGER NOT NULL DEFAULT 1 CHECK (is_sample IN (0,1))  -- 一期只做样例
);
CREATE UNIQUE INDEX uq_trial ON trial_snapshot(trial_id, fetched_at);

CREATE TABLE export_job (
  id           TEXT PRIMARY KEY,
  subject_id   TEXT NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  format       TEXT NOT NULL CHECK (format IN ('md','pdf','jpeg','html','docx')),
  scope_json   TEXT NOT NULL,                -- 选入项：哪些指标/问题/段落
  file_path    TEXT,
  content_hash TEXT,
  created_at   TEXT NOT NULL,
  stale_at     TEXT
);
CREATE INDEX idx_export ON export_job(subject_id, created_at DESC);

CREATE TABLE change_log (
  id         TEXT PRIMARY KEY,
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('create','update','supersede','withdraw','delete')),
  actor_role TEXT CHECK (actor_role IN ('patient','caregiver','clinician','system')),
  before_json TEXT,
  after_json  TEXT,
  at         TEXT NOT NULL
);
CREATE INDEX idx_changelog_entity ON change_log(entity, entity_id, at DESC);
```

---

### 4.8 迁移增补（0002，2026-10-17）

实现 M2 时发现 §4.2 的两个实体都缺"日期"，而 DATA-FLOW §5-⑤ 要写 `record.occurred_on`。
按冻结合同"只增不改"新增 `schema/0002_candidate_dates.sql`（不改 §4 的原始 DDL）：

| 表 | 新增列 | 语义 | 约束 |
| --- | --- | --- | --- |
| `document` | `report_date TEXT` | 原件上写明的报告/采样日期 | 可空；`GLOB 'NNNN-NN-NN'` 只验格式，真实日期由 `assertMedicalDate` 验 |
| `candidate` | `occurred_on TEXT` | 这条候选所属医疗事件日期（通常整页继承 `report_date`） | 同上；配 `idx_candidate_occurred` |

两条口径：**可空且不回填**（老数据与读不到日期的原件不能被迫填假日期）；**不拿 `imported_at` 顶替**
（导入时间 ≠ 报告日期 ≠ 采样日期）。取值顺序：候选自带 > 本次传入 > 材料报告日期，都没有就报错。
详见图 [DESIGN-SESSION D35](../docs/DESIGN-SESSION.md) 与 [DATA-FLOW-SPEC §10](DATA-FLOW-SPEC.md)。

## 5. 六条硬约束（评审重点）

### 5.1 事实四层不合并
`document`（原件）→ `candidate`（候选）→ `record`（已接受）→ `observation/measurement`（可计算的指标值）。
跨层引用只允许"上层指下层"。反向查询（元数据能否回到原件）通过 `source_ref` 实现。**解析失败不影响原件存在**，也不产生 `record`。

### 5.2 可比性跟方法走
| 指标类 | 可比条件 | 不满足时 |
| --- | --- | --- |
| 检验值 | 同 `lab_method`（+ 同单位） | 断线，图例标"方法不同" |
| 测量值 | 同 `protocol_id` + 同单位 | 断线，不进同一趋势 |
| 派生差值 | 同一 set 内配对 | 缺健侧则不生成 `derived_diff_num` |

`metric_definition.comparable_by` 是这条规则的机器可读表达，界面文案必须与它一致（DATA-FLOW §4.3）。

### 5.3 未检测 ≠ 阴性 ≠ 未知
`biomarker.result_state` 四值；`diagnosis_note.er_status` 等同理。界面三态文案固定：
"未检测"（没做）、"阴性"（做了且阴性）、"未记录"（不知道做没做）。三者不能合并显示。

### 5.4 看法不是结论（D16）
`viewpoint.is_conclusion` 被 `CHECK (= 0)` 钉死。数据流层面另有两条：
- 看法不参与任何派生计算（不进曲线、不算差值、不进 BMI 类指标）；
- 摘要与导出把看法放独立分区，标题固定"以下是我的看法与担心，不是医生结论"。

加 `is_conclusion` 这一列不是冗余：它让"以后有人想给看法加个结论字段"必须先改约束，改约束就要走 G3 评审。

### 5.5 更正不覆盖
更正 = 新建 `record`（`supersedes_id` 指向旧记录，`version+1`），旧记录 `status='superseded'`。
派生视图取"未被取代的最新版本"；导出与摘要据 `export_job.stale_at` 判断是否过时。**禁止 UPDATE 覆盖历史值。**

### 5.6 界面状态不入库
展开/折叠、当前 Tab、选中指标、缩放比例、排序方式 → 客户端内存或 `localStorage`，**不进业务表**。
唯一例外是"用户声明的阶段"（`subject_stage`）：那是用户对自身状态的事实声明，不是界面状态。

---

## 6. 索引策略（查询驱动）

| 查询 | 索引 |
| --- | --- |
| 一图秀取某指标序列 | `idx_obs_series`、`idx_meas_series` |
| 看板取最近记录与告警 | `idx_record_subject`、`idx_symptom`、`idx_task_open` |
| 臂围按 set 展开 | `idx_meas_set`、`uq_meas_point` |
| 候选待核对列表 | `idx_candidate_status` |
| 导出/快照过时检查 | `idx_saved`、`idx_export` |
| 审计回溯 | `idx_changelog_entity` |

不建"以防万一"的索引：每个索引都要能说出对应查询。

---

## 7. 读模型（不落库，读取时算）

| 读模型 | 输入 | 输出口径 |
| --- | --- | --- |
| `v_metric_series` | `observation` | 按 `metric_code` + 方法分组，供一图秀/卡片 |
| `v_arm_diff_series` | `arm_set` + `measurement` | 每次取四点位 `derived_diff_num` 最大值 |
| `v_recent_changes` | `observation`、`measurement` | 较前次变化；检验用 %，测量用绝对值带单位 |
| `v_attention` | 上述 + 阈值规则 | **只输出"值得和医生讨论"，不输出判断** |
| `v_open_questions` | `question` | 按版本取最新，过滤 `dropped` |

详细计算口径见 [DATA-FLOW-SPEC §4](DATA-FLOW-SPEC.md)。

---

## 8. 迁移与冻结合同

1. **加字段**：允许，需默认值；不得改变老数据语义。
2. **改字段语义/单位**：必须发 `metric_definition` 新版本 + 迁移脚本 + 影响说明；不允许原地改。
3. **删表/删列**：G3 评审 + 备份 + 迁移脚本，一步不能少。
4. **枚举扩容**：`CHECK` 变更必须同版本迁移，且旧值仍合法。
5. 每次迁移一个文件：`schema/0001_initial.sql`、`0002_xxx.sql`…；`schema_version` 与文件名前缀一致。
6. 冻结点：G3 通过时打 tag 记录 `0001_initial.sql` 的 SHA-256；此后任何改动都要在 `freeze-contract.md` 追加一条。

`schema/` 目录在 G3 通过后才创建；现在只有本文档。

---

## 9. 本轮已实测（不是"应该能跑"）

把 §4 的 7 个 SQL 块原样喂给 SQLite（Python `sqlite3`，`:memory:`，`PRAGMA foreign_keys=ON`）：

| 检查 | 结果 |
| --- | --- |
| 建表 | **25 张表**全部创建成功（含前向引用：`candidate → record`、`measurement → arm_set`；SQLite 允许，外键在 DML 时校验） |
| 索引 | 26 个索引创建成功，无重名 |
| `viewpoint.is_conclusion` 必须为 0 | 插入 `is_conclusion=1` 被 `IntegrityError` 拒绝；省略该列时默认 0 |
| `subject.role` 枚举 | 插入 `'doctor'` 被拒 |

**这不等于 schema 已经审定**：它只证明语法与约束能落地。字段是否够用、派生口径是否认同、更正边界是否合适，仍是 G3 要人判断的事。

## 10. 已知未定（不假装已定）

| 未定项 | 影响 | 处理 |
| --- | --- | --- |
| 是否支持多患者/多档案 | 影响 `subject` 唯一性与切换 UI | 结构上已支持（`workspace 1-n subject`），一期默认单档案 |
| 压力袖套、康复动作是否需要实体 | 若二期做，需要 `intervention` 表 | 一期不做，`care_entry` 只存"已存建议" |
| 试验快照的真实来源与更新频率 | 影响 `trial_snapshot` 字段 | 一期只做样例，标 `is_sample=1` |
| 影像报告结构化的粒度 | 影响是否新增 `imaging_finding` | 一期只做文档 + 摘要，不结构化 |
| 加密与访问控制 | 影响存储层与导出 | 待与宿主权限模型对齐后单独评审 |
