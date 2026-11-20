# TASK-073～078 开发顺序与交付记录

2026-11-20 核对。六项均已完成开发、提交并归档。各任务卡维护正式状态，各执行计划 §11–§13 保存实施、审查和结案证据。

① 073 → ② 077 → ③ 075 → ④ 078 → ⑤ 074 → ⑥ 076

| 顺序 | 交付 | Git 证据 | 验收记录 |
|---|---|---|---|
| ① TASK-073 | ADR-003 共享 symbol 派生、价格链路接线和全跳过数据态 | 主干 PR #58，`fc1c728` | [TASK-073 结案记录](./TASK-073-price-pipeline-p0-data-correctness-plan.md#13-completion-record) |
| ② TASK-077 | 在获批隔离镜像迁移历史 symbol，按 D-b 处理双键价格，交付只读探测工具 | 主干包含 `f182d7e`、`f452a25`，归档提交 `38368ce` | [TASK-077 结案记录](./TASK-077-symbol-historical-data-migration-plan.md#13-completion-record) |
| ③ TASK-075 | 按 ADR-003 对齐今日行情键并完成浏览器验收 | 主干 PR #59，`f7ef68a` | [TASK-075 结案记录](./TASK-075-today-symbol-case-mismatch-plan.md#13-completion-record) |
| ④ TASK-078 | 分组价格采集、净值日期校验和看板目标日 | 主干 PR #60，`a8d8837` | [TASK-078 结案记录](./TASK-078-price-collection-timing-bucketing-plan.md#13-completion-record) |
| ⑤ TASK-074 | 复用全跳过数据态，增加旧价、连续缺价提示与分源熔断 | 主干 PR #61，`e9f81d2` | [TASK-074 结案记录](./TASK-074-price-pipeline-observability-and-robustness-plan.md#13-completion-record) |
| ⑥ TASK-076 | 上市日期、手动资产完整性检查和第六张看板卡 | 功能分支提交 `cd70bda`，尚未进入 `origin/main` | [TASK-076 结案记录](./TASK-076-asset-information-completeness-check-plan.md#13-completion-record) |

## 交付依赖

- TASK-073 提供共享 symbol 派生。TASK-077 用它迁移存量数据，TASK-075 在迁移后的验收库验证 API 键与实际页面显示。
- TASK-078 承接价格采集调度和目标日。TASK-074 复用 TASK-073 的 D-d 全跳过语义，并在 TASK-078 合入后复验分组批次和看板派生。
- TASK-076 的资产信息检查使用 [TASK-053 的六槽验收修订](../../delivery/completed/US-001/TASK-053.md)，具体执行与复审证据见本任务计划。
