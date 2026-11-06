# TASK-069 — 契约文档同步（API_CONTRACT + Spec 状态行）（FS B5）

## Metadata

| 字段 | 内容 |
|---|---|
| Priority / Owner / Type | `High` / 待指派 / `Docs` |
| Created / Updated | 2026-11-05 / 2026-11-05 |
| 所属 Story | [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) |
| 覆盖的验收条件 | US-004/AC-16 |
| Related Product Spec / ADR | [FS-portfolio-ia-cleanup](../../requirements/specs/FS-portfolio-ia-cleanup.md) §6.2（B5）、§7（AC35） |
| Execution Plan | [Draft：TASK-069-plan](./TASK-069-plan.md)（原免计划，按 Human 要求补计划） |

> 待 Orchestrator 正式登记的任务内容，当前不含 Status，不属于已登记任务或实施队列。

## 1. 问题

`GET /api/portfolios/summary` 响应契约已随 TASK-065 变化（`stats` 增四字段），但 `API_CONTRACT.md` 仍写旧字段集；Spec 状态行与 §11 记录需与实施一致（AC-16）。

## 2. 已核实的事实（2026-11-05）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | `API_CONTRACT.md:87` 的 summary 端点行，`stats` 仍描述为 `{positionCount, marketValueByCurrency, drift}`，未含新字段 | `docs/handbook/technical/API_CONTRACT.md:87` |
| F-02 | Spec 状态行为 `Approved`，§11 已含 `HD-10`~`HD-14`（含 `B15`/`B16`），实施完成后需同步状态行与 §11 记录一致 | `FS-portfolio-ia-cleanup.md:5`、`:417-434` |

## 3. Acceptance Criteria

- [ ] AC-01：`API_CONTRACT.md` 的 `GET /api/portfolios/summary` 行（及响应示例，若有）补 `stats.lastExecutedAt`（`Date | null`）、`stats.pendingRebalanceCount`（整数）、`drift.dueByTime`（布尔）、`drift.overThresholdCount`（整数，`drift === null` 时不可读），并注明「`needsRebalance`/`triggeredThresholds` 语义不变」（对应 US-004/AC-16）。
- [ ] AC-02：Spec 状态行与 §11 记录与实施结果一致（记录 TASK-065～TASK-069 的落地情况）。
- [ ] AC-03：`npm run docs:check` 0 ERROR（链接可解析、卡片 Status 合法）。

## 4. Scope

**In Scope**

- `docs/handbook/technical/API_CONTRACT.md`（summary 端点行 + 响应示例）
- `docs/development/requirements/specs/FS-portfolio-ia-cleanup.md`（状态行 / §11 记录，按需）

**Out of Scope**

- 不改任何代码（`shared`/`server`/`client`/`cron-worker`）
- 不改 `handbook/ops/SERVER.md` 之外无关文档

## 5. Risks

无（纯文档同步）。

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| B1 | 前置 TASK-065（字段契约落定）与 TASK-068（若改 summary 查询层契约） | 待办理（可在 065/068 合入后完成） |

## 7. Coordination Notes

**免计划依据**（EXECUTION_PLANS.md §2）：文档同步、低风险、无代码变更。**实施要点**：改 `API_CONTRACT.md:87` 字段集与示例；同步 Spec 状态行 / §11；注意「不新增端点、不改路径」。**验证方式**：`npm run docs:check` 0 ERROR。

## 8. Open Questions

无。
