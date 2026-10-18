# schema

G3（数据模型与数据流）已于 **2026-10-17** 通过，用户原话「都按 A」（[G3-REVIEW](../docs/G3-REVIEW.md) §6）。本目录从"空目录冻结"转为"已冻结的迁移"。

| 文件 | 作用 |
| --- | --- |
| `0001_initial.sql` | 初始结构，25 张表 / 26 个索引；由 [SCHEMA-SPEC](../docs/SCHEMA-SPEC.md) §4 的 7 个 sql 块**逐字合并**（只加了文件头注释） |
| `0002_candidate_dates.sql` | 补 `document.report_date` 与 `candidate.occurred_on`（均可空、不回填，加 1 个索引）——解决 DATA-FLOW-SPEC §10 的日期缺口，见 [DESIGN-SESSION D35](../docs/DESIGN-SESSION.md) |
| `freeze-contract.md` | 冻结记录（sha256）与变更规则 |
| `README.md` | 本文件 |

## 三条硬规则

1. **不改已冻结的迁移**（现为 `0001`、`0002`）。改一个字节，`scripts/check-schema.mjs` 就失败（它比对 `freeze-contract.md` 里的 sha256）。要改结构就新增 `0002_*.sql`，并把新文件与哈希追加进合同表。
2. **一次迁移一个文件**，命名 `NNNN_名称.sql`；`schema_version.version` 与编号前缀一致，`dsh/migrate.js` 会强制。
3. **迁移只增不改**：加字段要有默认值且不改老数据语义；改单位/口径要发 `metric_definition` 新版本；删表删列要 G3 复审 + 备份。

## 怎么跑

```bash
npm run check:schema   # 只校验冻结哈希
npm test               # 含建表、约束拒绝、更正链、四点位差值
```

代码侧入口是 `dsh/migrate.js`（执行迁移）与 `dsh/store.js`（`openStore()` 打开库并自动迁移 + 写字典种子）。真实文件库的路径必须由用户在设置里选定，**不猜路径、不静默建目录**（A21/A22）。
