-- 小粉宝乳腺癌工作台 · 0001_initial.sql
-- 来源：docs/SCHEMA-SPEC.md §4 的 7 个 sql 代码块（逐字合并，仅加本文件头）。
-- 评审：G3 通过（2026-10-17，确认人=用户本人，原话「都按 A」），见 docs/G3-REVIEW.md §6。
-- 冻结：本文件写入 schema/freeze-contract.md 的 SHA-256；改动必须新增 0002_*.sql，不得原地改。
-- 规则：docs/SCHEMA-SPEC.md §8 迁移与冻结合同。

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
