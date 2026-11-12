# schema 冻结合同

G3 已通过（2026-10-17，确认人=用户本人，原话「都按 A」，三个问题均取 A 方案）。见 [G3-REVIEW](../docs/G3-REVIEW.md) §6。

## 冻结记录

| 文件 | SHA-256 | 冻结点 | 依据 |
| --- | --- | --- | --- |
| 0001_initial.sql | 89dddfbf5dccdfe02ecf4e5707b03301edb552a773fe5e80b3f21ebd7af97da9 | v0.3.0 · 2026-10-17 | SCHEMA-SPEC v0.1 §4 的 7 个 sql 块逐字合并（25 表 / 26 索引），G3 通过 |
| 0002_candidate_dates.sql | 9107d734adea5696a710c5d48f60bf319a18022b084097b464711513a12652b6 | v0.3.0 · 2026-10-17 | 补 `document.report_date` 与 `candidate.occurred_on`（均可空、不回填），解决 DATA-FLOW-SPEC §10 的日期缺口；用户确认「ok」（D35） |

## 校验

```bash
node scripts/check-schema.mjs
```

规则：`schema/` 下每个 `NNNN_*.sql` 都必须在上面这张表里有一条记录，且当前 sha256 与记录一致。不一致即失败——说明有人改了已执行的历史迁移。

## 变更规则

1. **已冻结文件不得修改**，包括"顺手补个注释"。真要改，新增 `0002_*.sql`。
2. 加字段：允许，必须有默认值，且不改变老数据语义。
3. 改字段语义或单位：先发 `metric_definition` 新版本 + 迁移脚本 + 影响说明，不原地改。
4. 删表/删列：G3 复审 + 备份 + 迁移脚本，一步不能少。
5. 枚举扩容：`CHECK` 变更必须同版本迁移，且旧值仍合法。
6. 每次迁移一个文件，`schema_version.version` 与文件名前缀一致（`migrate.js` 会强制）。
7. 新迁移写完后，把新文件与新的 sha256 追加到本表，再跑 `npm run check`。

| `0003_subject_is_demo.sql` | 407b33fcaa4540f4af3031e607d010f67340b8fc0aaef43b76f4d0455291e9e1 | 2026-11-13 | 新增 `subject.is_demo`（默认 0；demo 播种写 1）——演示档案与真实档案分开标记 |

依据：[SCHEMA-SPEC §8](../docs/SCHEMA-SPEC.md)、[DEV-PLAN](../docs/DEV-PLAN.md) M1。
