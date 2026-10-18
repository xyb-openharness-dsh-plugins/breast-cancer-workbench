# 数据架构演进约束与变化矩阵 v0.3

日期：2026-10-17。状态：约束说明，未冻结生产表/API。

**v0.3 定位调整（D19）**：实体定义与 DDL 的权威文档改为 [SCHEMA-SPEC](SCHEMA-SPEC.md)，写入与派生语义见 [DATA-FLOW-SPEC](DATA-FLOW-SPEC.md)。本文只保留两件事——**四层边界**与**变化走查矩阵**——因为这两条回答的是"什么变了要迁移、什么变了不用迁"，与具体表结构解耦。字段名以 SCHEMA-SPEC 为准，本文出现差异时按 SCHEMA-SPEC 执行。

v0.2 增测量类实体（臂围/活动度/引流量）、指标定义版本与可比性；v0.3 增 `viewpoint`（看法=信息）、`subject_stage`（用户声明阶段），并把"术后上肢"定为模块与话题名（D15）。HTML 原型 state 仍不是数据库结构。

## 1. 四层边界（不变）

| 层 | 拟管理内容 | 变化责任 |
| --- | --- | --- |
| 领域事实/证据 | 主体、文档、标本/病灶、观察、测量、实际治疗、来源、核对状态及 revision | 真实语义/关系变化才迁移；不按 Tab 建副本 |
| 用例/工作流 | 整理任务、步骤、依赖、跳过/重开/取消、安排 | 流程改变不重建患者档案；完成待办不推导实际治疗 |
| 页面读模型 | 看板、资料、指标、一图秀、术后恢复、上肢监测、摘要 | 由同一事实投影，版本化；重排导航不改权威事实 |
| 交互偏好/派生结果 | 展开/翻转、筛选、时间窗、字体；缓存、问题、Agent 结果、报告快照 | 偏好可变；快照保留来源版本，更正后标旧版 |

## 2. 新增/修订实体

### 2.1 MetricDefinition（指标定义，版本化）

```
id, code, displayName, category, unit, valueType(numeric|ordinal|boolean|text),
displayForm(line|bar|dot|band|marker), comparableBy(lab_method|measure_protocol|none),
precision, refRange?, effectiveFrom, supersededBy?
```

要点：
- 定义有版本。改单位、改分类、改显示形态都升版本，旧 Observation 保留旧 `metricDefinitionId`。
- `comparableBy` 决定能否连线：检验看实验室方法，康复测量看测量协议（点位/体位/设备/测量者）。
- 参考区间不是判定器，只用于画参考带；不生成"异常/正常"结论。

### 2.2 Observation（检验/检查值，沿用）

```
id, subjectId, metricDefinitionId, valueNum?, valueRaw, unitRaw,
occurredAt, sourceDocumentId, sourceLocator, methodCode?, labName?,
status(candidate|accepted|rejected|superseded), revisionOf?, createdAt
```

- `valueRaw` 永远保留原文（含 `<0.5`、`阴性`、`未检测`）。
- 四态分开：`not_tested` / `not_entered` / `pending` / `negative` 用不同枚举，不用 null 混表。

### 2.3 Measurement（康复/体格测量，新增）

与 Observation 分开建模，因为可比性维度不同，且需要成对测量。

```
id, subjectId, metricDefinitionId, protocolId,
occurredAt, side(left|right|bilateral), valueNum, unitRaw,
pairedValueNum?,        // 健侧同点位值
derivedDiffNum?,        // 患-健差值，写入时计算并固化
assessorRole(self|caregiver|clinician|therapist), assessorNote?,
deviceCode?, positionNote?,
sourceDocumentId?, sourceEntryId, status, revisionOf?
```

臂围一次测量 = 一个 `ArmCircumferenceSet` + 4 条 `Measurement`：

```
ArmCircumferenceSet: id, subjectId, occurredAt, protocolId, positionNote, assessorRole
  └ Measurement × 4（点位：wrist / forearm_mid / above_elbow_10 / below_axilla_10）
```

- `derivedDiffNum` 固化写入值，避免读取时用不同算法重算导致历史不一致。
- 协议变更（点位方案改）→ 新 `protocolId`；旧序列在新协议下不可比，图表断线。
- 体积法/BIS 是另一种 protocol，不与周径差值互换。

### 2.4 SymptomEntry（症状，ordinal）

```
id, subjectId, code(le_symptom|ai_joint|hot_flash|fatigue|skin_rxn),
occurredAt, intensity 0–3, bodySite?, impact?, note?, ownerRole, privacy
```

不进折线图；一图秀以轨道色块呈现。`privacy=private` 时不进摘要、导出、Agent。

### 2.5 TreatmentEvent（修订）

增加：`setting(neoadjuvant|adjuvant|metastatic)`、`intent`、`regimenCode`、`cycleNo`、`startAt/endAt`、`planVsActual`、`laterality?`、`radiationField?`、`axillaryProcedure?`。

- 腋窝处理与放疗野是**独立字段**，不从手术名称推断。
- 治疗带渲染只读 `planVsActual=actual` 的区间；计划单独一层淡色带。

## 3. 关系

```
Workspace → Subject
Document → Candidate → Record
Record → specimen/lesion/source/revision
Observation → MetricDefinition(version)
Measurement → MetricDefinition(version) + Protocol
ArmCircumferenceSet → Measurement × 4
TreatmentEvent → Subject（不挂到 Document 上）
CareEntry/SymptomEntry → Subject + ownerRole
Task/Question/SavedResult → 引用 recordId + version
```

一份资料只保留一个权威来源 ID；同一观察可投影到指标、一图秀、摘要，但只存一份事实。

## 4. 变化走查矩阵（新增行）

| 变化 | 稳定部分 | 预期改动 | 兼容/恢复要求 | 当前证据 |
| --- | --- | --- | --- | --- |
| 指标升为一级/重排导航 | 文档/观察 ID | 路由与读模型 | 旧链接重定向；不迁移患者值 | 设计约束 |
| **新增一个指标** | 既有一切 | MetricDefinition 新行 + 可选显示 | 旧端容忍未知 code；缺失不当 0 | 原型已演示 16 个指标配置化 |
| **修改臂围点位方案** | 历史 Measurement | 新 protocolId，新序列 | 旧序列断线并标注，不静默拼接 | 原型演示（A10） |
| **测量者从本人换成治疗师** | 历史值 | `assessorRole` 变更 | 图表标注测量者变化，不自动视为同质 | 设计约束 |
| **单位/实验室变更** | 历史 Observation | 新 methodCode | 断线 + 断点注释 | 原型演示 |
| **更正一条测量** | recordId | 新 revision + derivedDiff 重算 | 三页同步；旧导出标"已过时" | 原型演示（A14） |
| **删除一份来源文档** | 派生记录 | 撤销可见性 + 传播 | 派生记录标"来源不可用"，不静默删除 | 未实现 |
| **私密标记变化** | 主体与权限 | 可见性审计 | 新分享不泄露；已外发文件无法承诺收回 | 待讨论 |
| 重复写入/双操作者冲突 | commandId/recordId | 幂等键 + expectedRevision | 明确冲突、保留草稿 | 未实现 |
| 旧库升级失败 | 用户原始数据 | 递增迁移 + ledger + 备份 | 一致性备份；应用回退与库降级分开 | 未实现 |
| **新增"看法/担心"**（D16） | 事实层与全部图表 | 只写 `viewpoint`，不进任何派生 | 导出分区标题固定"不是医生结论"；撤回后不再导出 | 原型演示（A17） |
| **用户改当前阶段**（D15） | 历史记录 | `subject_stage` 追加一条，不覆盖 | 旧记录不重算、不改归属；阶段只影响默认展示 | 原型演示（阶段切换） |
| **模块改名（肩→术后上肢）** | 表与字段 | 仅显示名与文案变更；`arm_flex` 字段名不变 | 无需迁移；导出历史标题保留原文 | 本轮设计决定 |

## 5. 待定合同

字段类型/精度、病理与分期版本、时区、单位目录、错误码、分页、幂等与并发、文件相对路径、SQLite 运行条件与备份、派生数据与私密字段传播、多主体与家属代记权限。

**本轮新增待定**：四点位协议编号规则、体积法设备元数据、症状量表来源（0–3 自拟还是引用量表）、`derivedDiffNum` 的精度与四舍五入规则。

## 6. 原型 state 与领域模型的关系

`prototypes/v0.2/app.js` 的 `state` 只用于演示交互（选中指标、翻转集合、时间窗、模拟记录）。其中 `metrics` 配置的字段名刻意与 MetricDefinition 对齐（code/unit/category/comparableBy），便于后续迁移；但**不把它当表结构**，也不从 UI 状态反推数据库设计。
