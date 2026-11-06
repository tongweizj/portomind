# TASK-069 — US-004 实施计划

## Status

Status：Draft

Owner：Planner（规划）→ 待 Orchestrator 登记并指派 Implementer

Related Task：[TASK-069](./TASK-069.md)；所属 [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md)。

Branch / Base：文档同步，建议在 TASK-065 / TASK-068 合入 `main` 后，于其分支或收尾提交中完成；也可独立小提交。规划期基线为 2026-11-05 的 `main`。

Approval：**未批准**。本计划覆盖 §1～§9 当前设计；`Draft → Approved` 归 Human（[STATES.md](../../../os/process/STATES.md) §4）。注意：本卡 Task 卡原标注「免计划」，因 Human 明确要求「逐一为每个 task 编写 execplan」，本计划据此编制。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task [TASK-069](./TASK-069.md) 的 §3；覆盖 US-004/AC-16。本卡同步 `API_CONTRACT.md` 的 summary 端点字段集，并使 Spec 状态行与 §11 记录与实施一致。

## 2. Context

需求、任务见 [Story US-004 §3](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) 与 [FS §6.2 B5、§7 AC35](../../requirements/specs/FS-portfolio-ia-cleanup.md)。纯文档同步，无代码变更。

## 3. Repository Findings（2026-11-05 亲读）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | `API_CONTRACT.md:87` summary 端点 `stats` 仍写 `{positionCount, marketValueByCurrency, drift}`，未含四字段 | `docs/handbook/technical/API_CONTRACT.md:87` |
| F-02 | Spec 状态行 `Approved`（`:5`），§11 已含 `HD-10`~`HD-14`（含 `B15`/`B16`），实施完成后需同步状态行与 §11 记录一致 | `FS-portfolio-ia-cleanup.md:5`、`:417-434` |

## 4. Proposed Design

1. **`API_CONTRACT.md:87`** 的 `GET /api/portfolios/summary` 行更新 `stats` 字段集为：
   `{positionCount, marketValueByCurrency, drift:{needsRebalance, triggeredThresholds, dueByTime, overThresholdCount}, lastExecutedAt, pendingRebalanceCount, unreadAlertCount}`，并注明：
   - `lastExecutedAt`：`Date | null`（无记录为 null）；
   - `pendingRebalanceCount`：整数（PENDING 的 RebalanceRecord 条数，默认 0）；
   - `drift.dueByTime`：布尔（timeInterval 是否触发）；`drift.overThresholdCount`：整数（超阈标的数）；`drift === null` 时后两者不可读；
   - `needsRebalance`/`triggeredThresholds` 语义不变（仍仅绝对/相对偏离）。
   - 响应示例（若有）同步补字段。
2. **`FS-portfolio-ia-cleanup.md`**：状态行与 §11 记录同步（记 TASK-065～TASK-069 落地情况；§11 为裁决记录，实施状态一般记在 Story 卡而非 Spec 裁决表，按 [DOCS.md](../../../os/standards/DOCS.md) 单一归属原则，仅当 Spec 明确要求「状态行与 §11 一致」时补记，避免重复）。

## 5. Work Breakdown

- [ ] W1：更新 `API_CONTRACT.md:87` 字段集与语义说明（含响应示例）。
- [ ] W2：核对 Spec 状态行是否需要同步（避免与 Story 卡 §8 重复记录）。
- [ ] W3：`npm run docs:check` 0 ERROR。

## 6. Decisions

无待 Human 新决事项。

## 7. Verification

| Task AC | 验证方法 | 预期结果 |
|---|---|---|
| AC-01（字段集） | 检查 `API_CONTRACT.md` summary 行 | 含四字段及语义说明、`needsRebalance` 语义不变注明 |
| AC-02（Spec 状态一致） | 检查 Spec 状态行/§11 | 与实施结果一致（避免与 Story 卡重复） |
| AC-03（docs:check） | `npm run docs:check` | 0 ERROR |

命令入口见 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md) 与 [DOCS.md §5](../../../os/standards/DOCS.md)。

## 8. Risks

无（纯文档同步）。唯一注意：避免与 Story 卡 §8 验收记录重复（DOCS.md 单一归属原则）。

## 9. Rollback

纯文档，回退 = `git revert`，无数据影响。

## 10. Implementer Handoff

- **输入**：本计划 §4 + [TASK-069](./TASK-069.md) §3 AC + TASK-065 实际字段形状。
- **范围与禁改**：只改 `docs/handbook/technical/API_CONTRACT.md`（+ 按需 Spec 状态行）；**禁改**任何代码。
- **授权**：须 Human 批准本计划后实施。
- **依赖**：前置 TASK-065（字段契约落定）与 TASK-068（若改 summary 查询层）。
- **预期产出**：契约文档字段集同步 + docs:check 0 ERROR。
- **验证入口**：`npm run docs:check`。

## 11. Implementation Record

（实施时填写。）

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录；极小文档变更可由 Human 直接独立复核，条件见其 §5.3。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
