# TASK-065 — `summary` 四字段（`lastExecutedAt` / `pendingRebalanceCount` / `drift.dueByTime` / `drift.overThresholdCount`）（FS B1～B4）

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Completed（2026-11-06，Human 确认验收通过并关闭）**；**`Merged` = `6f556aa`**（2026-11-06 经 `Merge branch 'feature/TASK-065' into main` 合入 `main`；`git merge-base --is-ancestor 5f807a3 main` = 是，Orchestrator 核验） |
| Priority / Owner / Type | `High` / Implementer A / `Feature`（shared 内核 + server 契约） |
| Created / Updated | 2026-11-05 / 2026-11-06 |
| 所属 Story | [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) |
| 覆盖的验收条件 | US-004/AC-01～AC-04、AC-14（AC-14 的 cron-worker 零改动断言落在本卡） |
| Related Product Spec / ADR | [FS-portfolio-ia-cleanup](../../requirements/specs/FS-portfolio-ia-cleanup.md) §6.2（B1～B4）、§7（AC20～AC23）、§10（R-1、R-7）；[API_CONTRACT.md](../../../handbook/technical/API_CONTRACT.md) `GET /api/portfolios/summary` |
| Execution Plan | [Approved：TASK-065-plan](./TASK-065-plan.md)（2026-11-06 Human 确认批准） |

## 1. 问题

首屏要回答「哪个账户该先动」，依赖 `GET /api/portfolios/summary` 每项 `stats` 提供四个字段：`lastExecutedAt`（上次再平衡时间）、`pendingRebalanceCount`（待确认再平衡条数）、`drift.dueByTime`（时间维度是否到期）、`drift.overThresholdCount`（超阈标的数）。当前 `buildPortfolioSummary` 只返回 `{positionCount, marketValueByCurrency, drift}`：`lastExecutedAt` 入参已有但**未回传**；`pendingRebalanceCount` **完全缺失**；`drift` 被 `DRIFT_THRESHOLDS` 显式过滤掉 `timeInterval`，时间维度在首屏永远不可见。

## 2. 已核实的事实（2026-11-05 亲读 `main` 源码）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | `buildPortfolioSummary` 入参已含 `lastExecutedAt`（`:29`）并传给 `evaluateThresholds`（`:58`），但返回值只有 `{positionCount, marketValueByCurrency, drift}`（`:70`） | `shared/services/portfolio/summary.js:25-71` |
| F-02 | `DRIFT_THRESHOLDS = ['absoluteDeviation','relativeDeviation']`（`:18`），把 `timeInterval` 过滤掉 → `drift` 不含时间维度 | 同上 `:18`、`:61-63` |
| F-03 | `computeSummary` 已用一次 `$match+$group` 聚合取 `unreadAlertCount`（`:83-87`）；每组合再 `Promise.all([tracker.aggregate, RebalanceRecord.findOne({EXECUTED})])`（`:89-95`）——`lastExecutedAt` 已按组合各查一次 EXECUTED 记录 | 同上 `:79-117` |
| F-04 | `evaluateThresholds` 返回 `{needsRebalance, triggeredThresholds, totalValue, details[{symbol,...,triggeredThresholds}], reasons}`；`timeInterval` 触发时顶层 `triggered` 集合加 `'timeInterval'`（`:63-66`）；`details[i].triggeredThresholds` 是**该标的**触发的阈值类型数组 | `shared/services/rebalance/thresholdChecker.js:17-76` |
| F-05 | `RebalanceRecord.status` 枚举 `['PENDING','EXECUTED','REVOKED']` | `shared/models/rebalanceRecord.js:38-42` |
| F-06 | 既有测试含「仅时间间隔触发不计入漂移徽标」用例（断言 `needsRebalance===false && triggeredThresholds===[]`）——本卡新增字段**不得破坏该语义** | `server/test/integration/portfolio.summary.test.js:113-125` |

> ⚠️ **量纲关键**：`overThresholdCount` = `details` 中 `triggeredThresholds` **非空的标的数**（`details.filter(d => d.triggeredThresholds.length > 0).length`），**不得**取顶层 `triggeredThresholds.length`（那是阈值**类型**数，正是 Spec `B8a` 作废、`R-7` 关闭的原因）。`drift === null`（无目标 / 无持仓 / 缺价）时 `dueByTime` 与 `overThresholdCount` **不可读**，不进 `drift` 对象。

## 3. Acceptance Criteria

- [ ] AC-01：`buildPortfolioSummary` 返回值 `stats` 新增 `lastExecutedAt`（`Date | null`，入参已有，**不得**为此新增查询）；`stats` 新增 `pendingRebalanceCount`（整数，默认 0）；`drift` 新增 `dueByTime`（布尔）与 `overThresholdCount`（整数）。`drift === null` 时后两字段不出现（不可读）。
- [ ] AC-02：**语义不扩义**——某组合仅时间维度触发时，`drift.needsRebalance === false`、`drift.triggeredThresholds === []`、`drift.dueByTime === true`，三项同断言（对应 US-004/AC-02）。
- [ ] AC-03：`pendingRebalanceCount` 用**一次** `$match + $group by portfolioId` 的聚合批量取（`status:'PENDING'`），**禁止**在 `portfolios.map` 内逐组合 `countDocuments`；`EXECUTED` / `REVOKED` 不计入（对应 US-004/AC-03）。
- [ ] AC-04：`overThresholdCount` 从 `evaluateThresholds` 已返回的 `details` 派生，**不得**逐组合复算；在 10 个组合的构造数据上断言 `RebalanceRecord` 查询次数 ≤ 11（1 次聚合 + 每组合 1 次 `lastExecuted` 既有查询）且 `countDocuments` 调用次数 = 0（对应 US-004/AC-04，**不靠耗时判定**）。
- [ ] AC-05：新增单测覆盖 AC-01～AC-04 边界（含 AC-02 三项同断言、AC-03 的 EXECUTED/REVOKED 排除、AC-04 的查询次数断言）；`npm test` 全绿（数量以实际为准）；既有 `portfolio.summary.test.js` 与 `portfolio.archived.test.js` 不回归。
- [ ] AC-06：交付后 `git status cron-worker` 空输出——本卡不改调度进程，改动范围不触达 `cron-worker/`（对应 US-004/AC-14，PM G-1 缺口补）。

## 4. Scope

**In Scope**

- `shared/services/portfolio/summary.js`：`buildPortfolioSummary` 返回值补四字段；`computeSummary` 补一次 `pendingRebalanceCount` 聚合并按组合透传
- 服务端契约：`GET /api/portfolios/summary` 响应随之变化（**不新增端点、不改路径**）
- 测试：`server/test/integration/portfolio.summary.test.js` 补字段断言与 N+1 断言

**Out of Scope**

- 不改 `client/`（健康表 TASK-066、组合卡 TASK-067 消费这些字段，但本卡不写前端）
- 不改 `cron-worker/`
- 不改 `drift.needsRebalance` / `drift.triggeredThresholds` 既有语义（`CM-12` 卡片徽标依赖它）
- 不新增端点、不改 `getPortfolioById`（裸 `Portfolio` 不含 `lastExecutedAt`，且不补）
- 删除组合后事件过滤（属 TASK-068）

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **同名不同义**（Spec R-1）：`checkThresholds` 的 `needsRebalance` 含时间维度，`summary` 的不含 | 只加 `dueByTime`、不改既有语义；AC-02 三项同断言锁住 |
| R-2 | **N+1**：`pendingRebalanceCount` 若逐组合 `countDocuments` 即违反禁令 | AC-04 断言查询次数 ≤ 11 且 `countDocuments = 0` |
| R-3 | **量纲混用**（Spec R-7）：误用 `triggeredThresholds.length` 当标的数 | 从 `details` 派生 `overThresholdCount`；AC 用「2 阈值类型覆盖 1 标的」构造数据反证 |

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| B1 | 需 Planner 产出 **Approved ExecPlan**（DEP-04） | 待办理 |
| B2 | 无硬前置：`lastExecutedAt` 入参已有、`pendingRebalanceCount` 需 `RebalanceRecord` 查询，均可独立完成 | 已满足 |

> **下游（本卡是被依赖方）**：TASK-066（健康表四字段）、TASK-067（组合卡四格）、US-003 AC-16（`lastExecutedAt` Chip）。三者应按「字段缺失即降级」设计，不得因等本卡而阻塞。

## 7. Coordination Notes

下一角色：Planner（出 ExecPlan）→ Implementer。ExecPlan 需覆盖：`pendingRebalanceCount` 聚合形态（单次 `$match+$group`）、`drift` 字段结构（`dueByTime`/`overThresholdCount` 与既有 `needsRebalance`/`triggeredThresholds` 并列）、测试清单、回滚。交接时把本卡 AC、Spec §6.2 B1～B4、§10 R-1/R-7 一并给出。

## 8. Open Questions

无（本卡无未决 OQ）。注意 OQ-01（健康表排序档位）属 TASK-066，与本卡无关。

---

## 11. Implementation Record（Orchestrator 登记，2026-11-06）

- **交付提交**：`8fde289`（`feat(TASK-065): summary stats 四字段与 PENDING 批量聚合`），分支 `feature/TASK-065`，**尚未合入 `main`**（`git merge-base --is-ancestor feature/TASK-065 main` = 否）。
- **改动文件**（diff `main..feature/TASK-065`）：
  - `shared/services/portfolio/summary.js`（+34）：`buildPortfolioSummary` 回传 `lastExecutedAt` / `pendingRebalanceCount`；`drift` 新增 `dueByTime`（`timeInterval` 是否触发，**不扩义** `needsRebalance`）与 `overThresholdCount`（从 `details` 派生，标的数非阈值类型数）；`computeSummary` 以**一次** `$match+PENDING` + `$group by portfolioId` 批量取 `pendingRebalanceCount`，空列表不查询。
  - `server/test/integration/portfolio.summary.test.js`（+156）：新增 AC-01~AC-04 表驱动单测与查询预算断言（AC-03 的 `countDocumentsCalls===0`、AC-04 的 10 组合 `aggregateCalls===1` + `findOneCalls===10` ≤ 11）。
  - `docs/handbook/technical/API_CONTRACT.md`：`GET /api/portfolios/summary` 字段集同步四字段与量纲说明。
- **量纲核对**：`overThresholdCount` 取自 `result.details.filter(d=>Array.isArray(d.triggeredThresholds) && d.triggeredThresholds.length>0).length`，未取顶层 `triggeredThresholds.length`；`drift===null` 时后两字段不出现。
- **禁改范围**：未动 `client/`、`cron-worker/`、`server/routes/`、既有 `needsRebalance` 语义（AC-02 三项同断言保留）。
- **已知妥协**：交付仍在分支，真实库集成跑与浏览器侧未在 `main` 复验；由 Reviewer 在分支/真实库复核。本卡无未决 OQ。

## 12. Review Record

### 审查交接（Orchestrator → Reviewer，2026-11-06）

- **可审对象**：分支 `feature/TASK-065` @ `8fde289`（未合入 main；可在该分支或 cherry 至干净工作区核验）。
- **覆盖 AC**：US-004/AC-01~AC-04、AC-14（`cron-worker` 零改动，diff 不含 `cron-worker/`，可由 `git status cron-worker` 验证）。
- **Implementer 自测**：`server/test/integration/portfolio.summary.test.js` 新增用例随提交；建议独立 Reviewer 在分支基线重跑 `npm run test:server` 取真实结果。
- **重点核对**：① `overThresholdCount` 量纲（标的数 vs 阈值类型数）；② AC-02 `dueByTime` 不扩义 `needsRebalance`；③ AC-03/AC-04 查询预算（无 N+1、`countDocuments===0`）；④ `drift===null` 时字段不可读；⑤ `API_CONTRACT.md` 与实际契约一致。
- **未授权事项**：本 Orchestrator 不替代 Reviewer 出具结论，不替代 Human 关闭；`Merged` 与 `Completed` 归 Human。

### 审查结论（2026-11-06）

- **Verdict**：**Pass with issues**（独立 Reviewer 复核；Human 确认验收通过并授权关闭）。
- **判定**：US-004/AC-01~AC-04、AC-14 全部满足；无 BLOCKER。
- **重点项复核结果**：① `overThresholdCount` 量纲正确（从 `details` 派生，标的数非阈值类型数）；② AC-02 `dueByTime` 不扩义 `needsRebalance`（三项同断言成立）；③ AC-03/AC-04 查询预算满足（一次 `$match+PENDING` `$group`，无 N+1，`countDocuments===0`）；④ `drift===null` 时 `dueByTime`/`overThresholdCount` 不可读；⑤ `API_CONTRACT.md` 字段集与实际契约一致。
- **已知妥协 / 残留**：实现仍在分支未合入 `main`；真实库集成跑与浏览器侧未在主干复验（由合入后回归覆盖）。无 MAJOR 需 Human 接受项。

## 13. Completion Record

- **关闭依据**：Human 2026-11-06 明确确认「065 已经验收通过」，按 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态) 登记 `Reviewing → Completed`（Task → Completed 与关闭归 Human）。
- **AC 证据**：US-004/AC-01~AC-04、AC-14 由独立 Reviewer 复核满足（§12）；测试随 `feature/TASK-065` @ `5f807a3`（原 `8fde289`，后 rebase 至 `5f807a3`）提交，建议合入前在分支重跑 `npm run test:server` 取真实输出。
- **Merged**：**`6f556aa`** —— 2026-11-06 经 `Merge branch 'feature/TASK-065' into main` 合入 `main`；`git merge-base --is-ancestor 5f807a3 main` = 是，已由 Orchestrator 据实核验登记（合入动作由 Human 执行）。
- **下游影响**：066/067 依赖本卡 B1~B4 字段，现已可取真实值（解除降级态）；**068 硬串行前置已随本卡合入 `main` 解除，可派发**（仍建议 068 在 067 合入后再派，避免同改 `summary.js` 冲突）。
- **归档与移交**：Story 整体验收与归档待 065/066/067 全部完成后由 PM 汇总、Human 关闭 Story；本卡过程资料留 `delivery/US-004/`，不单独搬迁。
