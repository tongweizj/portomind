# TASK-068 — 删除组合后事件查询层过滤（隐藏非删除）（FS B16）

## Metadata

| 字段 | 内容 |
|---|---|
| Status | Implementing（2026-11-06，计划已 `Approved`、065 已合入 `main`；Orchestrator 登记） |
| Priority / Owner / Type | `High` / Implementer / `Feature`（shared + server 查询层） |
| Created / Updated | 2026-11-05 / 2026-11-06 |
| 所属 Story | [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) |
| 覆盖的验收条件 | US-004/AC-19、AC-14（AC-14 的 cron-worker 零改动断言落在本卡） |
| Related Product Spec / ADR | [FS-portfolio-ia-cleanup](../../requirements/specs/FS-portfolio-ia-cleanup.md) §6.2（B16）、§7（AC42）、§10（R-9）、§11（HD-14） |
| Execution Plan | [Approved：TASK-068-plan](./TASK-068-plan.md)（2026-11-06 Human 批准） |

## 启动核对与实施交接（2026-11-06，Orchestrator）

按 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态) 登记 `Planning` → **`Implementing`**，依据「当前设计的有效计划批准记录」。

| 启动项 | 核对事实 |
|---|---|
| 计划批准 | ✅ 2026-11-06 Human 确认「批准」，[计划](./TASK-068-plan.md) `Draft` → `Approved` |
| **硬前置（串行解除）** | ✅ **TASK-065 已合入 `main`**（`6f556aa` `Merge branch 'feature/TASK-065' into main`，父 `49d4e0a` + `beb6882`）；`git merge-base --is-ancestor 5f807a3 main` = 是 |
| 同改文件冲突 | ✅ 已解除。`summary.js` 上 `unreadAgg`（`:96`）、`pendingAgg`（`:105`）均在位；068 的 `unreadAgg` 改动叠在 065 之后，不再存在并行冲突 |
| 068 范围 | `summary.js` + `server/controllers/alert.controller.js` + 新增 `shared/services/alertQuery.js`（三处同源出口） |
| `main` 基线 | `6f556aa` |
| G-1 覆盖 | ✅ AC-14（`cron-worker` 零改动）已在 068 AC-07 |

**实施要点**（来自计划 §3 事实）：规划期行号已因 065 合入漂移，以**符号名**为准 —— `unreadAgg` / `AlertEvent.aggregate` / `getEvents` / `getUnreadCount`，不要硬套旧行号。

**未做的事**：未建 worktree、未改代码、未跑验证。

## 1. 问题

删除组合后，其 `AlertEvent` 仍然存在（`deletePortfolioCascade` 只删 `Transaction` + `RebalanceRecord`，**不删** `AlertEvent`），事件卡 `portfolioId` 悬空、点进去 404。需要**查询层**隐藏（库里保留，审计价值），且三处出口口径一致。

## 2. 已核实的事实（2026-11-05 亲读 `main` 源码）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | `deletePortfolioCascade` 只删 `Transaction` + `RebalanceRecord`，**不删 `AlertEvent`** → 删组合后事件 `portfolioId` 悬空 | `shared/services/portfolio/deletePortfolio.js:10-14` |
| F-02 | 三处出口 ①：`getEvents` 用 `AlertEvent.countDocuments(filter)` + `AlertEvent.find(filter)`（`:229-232`），当前 filter 无「组合存在」条件 | `server/controllers/alert.controller.js:209-237` |
| F-03 | 三处出口 ②：`getUnreadCount` 用 `AlertEvent.countDocuments({status:'unread'})`（`:241`），无组合存在条件 | `server/controllers/alert.controller.js:239-246` |
| F-04 | 三处出口 ③：`computeSummary` 的 `unreadAgg` 用 `$match: {status:'unread', portfolioId:{$ne:null}}` + `$group by portfolioId`（`:83-87`） | `shared/services/portfolio/summary.js:83-87` |
| F-05 | 资产级事件 `portfolioId = null` 必须保留（规则 `scope='asset'` 时无组合） | `shared/models/alertEvent.js:12-16`、`alertEngine.service.js` |

> **过滤口径**（Spec B16 / HD-14）：取现存组合 id 集合（组合数量级为个位数），条件 `$or: [{ portfolioId: { $in: ids } }, { portfolioId: null }]`。**资产级事件没有 `portfolioId`，必须保留**。**禁止只在客户端过滤**（`/alerts` 与 summary 计数会漏）。

## 3. Acceptance Criteria

- [ ] AC-01：构造「组合 A 有 3 条未读事件 + 1 个资产级（`portfolioId=null`）未读事件」→ 删除组合 A 后：`GET /alerts/events` 不再返回那 3 条、**仍返回**资产级 1 条（对应 US-004/AC-19 ①）。
- [ ] AC-02：`summary` 中其它组合的 `unreadAlertCount` 不变、全站未读计数（`getUnreadCount`）减 3（对应 US-004/AC-19 ②）。
- [ ] AC-03：库里那 3 条 `AlertEvent` **仍存在**（`countDocuments` 校验，证明是「隐藏」而非「删除」，对应 US-004/AC-19 ③）。
- [ ] AC-04：负向对照——未删除时三处计数一致（对应 US-004/AC-19 ④）。
- [ ] AC-05：过滤在**查询层**（三处统一），不得只在客户端过滤；资产级（`portfolioId=null`）事件始终保留。
- [ ] AC-06：不删数据、不加字段、不写迁移；`npm test` 全绿（覆盖 alert 相关集成测试）。
- [ ] AC-07：交付后 `git status cron-worker` 空输出——本卡不改调度进程，改动范围不触达 `cron-worker/`（对应 US-004/AC-14，PM G-1 缺口补）。

## 4. Scope

**In Scope**

- `shared/services/portfolio/summary.js`：`unreadAgg` 加「组合存在」过滤（同源出口 ③）
- `server/controllers/alert.controller.js`：`getEvents`（出口 ①）与 `getUnreadCount`（出口 ②）加同源过滤
- 建议沉淀一个共享查询层辅助（如 `shared/services/alertQuery.js`：取现存组合 id 集合 + 构造 `$or` 过滤条件），避免三处各写一遍
- 测试：`server/test/integration/alert.api.test.js` 等补删除组合后事件隐藏断言

**Out of Scope**

- 不改模型 / 不写迁移 / 不物理删除 `AlertEvent` / 不新增字段
- 不改客户端过滤逻辑（禁止客户端兜底）
- 不新增端点

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **三处漏一处**：只在客户端或只改列表，summary 计数 / 未读计数仍会漏 | AC-05 强制三处查询层同源；AC-01～AC-04 三处联合断言 |
| R-2 | **资产级事件误隐藏**：过滤条件写错把 `portfolioId=null` 排除 | 过滤必须 `$or: [{portfolioId:{$in:ids}}, {portfolioId:null}]`；AC-01 断言资产级保留 |

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| B1 | 需 Planner 产出 **Approved ExecPlan**（DEP-04） | 待办理 |
| B2 | 无硬前置（独立于 TASK-065，但同改 `summary.js`，需协调合并冲突） | 已满足 |

## 7. Coordination Notes

下一角色：Planner（出 ExecPlan）→ Implementer。ExecPlan 需覆盖：共享查询层形态（取现存组合 id 集合 + `$or` 过滤）、三处落点、测试清单（AC-42 的「删后库里仍在、接口不可见」双断言）、与 TASK-065 同改 `summary.js` 的合并顺序。交接时把本卡 AC、Spec §6.2 B16、§10 R-9、§11 HD-14 一并给出。

## 8. Open Questions

无（HD-14 已裁「全部隐藏」，本卡只落实查询层过滤，不再开题）。
