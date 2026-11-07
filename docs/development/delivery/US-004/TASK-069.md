# TASK-069 — 契约文档同步（API_CONTRACT + Spec 状态行）（FS B5）

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Implementing（2026-11-06）**：计划已由 Human 批准（`Draft → Approved`，2026-11-06），按 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态) 登记 `Planning → Implementing` 并派发；硬前置 065+068 已合入。**`Merged` = `Pending`** |
| Priority / Owner / Type | `High` / Implementer（待指派） / `Docs` |
| Created / Updated | 2026-11-05 / 2026-11-06 |
| 所属 Story | [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) |
| 覆盖的验收条件 | US-004/AC-16 |
| Related Product Spec / ADR | [FS-portfolio-ia-cleanup](../../requirements/specs/FS-portfolio-ia-cleanup.md) §6.2（B5）、§7（AC35） |
| Execution Plan | [Approved：TASK-069-plan](./TASK-069-plan.md)（2026-11-06 Human 批准） |

> 2026-11-06 启动登记（Orchestrator）：Human 批准计划（原话「批准 069 计划」）后，登记 `Planning → Implementing` 并派发 Implementer。**范围仅文档**：`API_CONTRACT.md` 的 `GET /api/portfolios/summary` 行与 Spec 状态行/§11；不动任何代码。

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
| B1 | 前置 TASK-065（字段契约落定）与 TASK-068（若改 summary 查询层契约） | **已解除（2026-11-06）**：065 合入 `6f556aa`、068 合入 `6f0b4df`，二者均在 `main` |

## 7. Coordination Notes

**免计划依据**（EXECUTION_PLANS.md §2）：文档同步、低风险、无代码变更。**实施要点**：改 `API_CONTRACT.md:87` 字段集与示例；同步 Spec 状态行 / §11；注意「不新增端点、不改路径」。**验证方式**：`npm run docs:check` 0 ERROR。

## 8. Open Questions

无。

## 12. Review Record

**独立审查结论：`Pass with issues`**（2026-11-06，独立 Reviewer；**无 BLOCKER / 无 MAJOR**；3 项 MINOR（F-01 证据不足 / F-02 AC-16 字面「响应示例」口径 / F-03 落地记录范围措辞）已记录、不阻塞）。审查对象 `feature/TASK-069` @ `ba5e5e1`，US-004/AC-16 与卡内 AC-01～AC-03 逐条满足；零代码改动、范围与单一归属守住。完整证据、逐条 AC 判定、负向对照、Findings 与未验证项见 [TASK-069-plan.md §12 Review Record](./TASK-069-plan.md#12-review-record)。判定词不是状态：未改 Task Status、未标 `Completed`、未填 `Merged`、未合入 `main`；关闭与合入登记归 Human。
