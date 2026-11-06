# TASK-067 — `PortfolioCard` 四格（总市值 / 持仓资产 / 待办 / 上次再平衡）（FS B15）

## Metadata

| 字段 | 内容 |
|---|---|
| Priority / Owner / Type | `High` / 待指派 / `Feature`（纯客户端，零请求零服务端） |
| Created / Updated | 2026-11-05 / 2026-11-05 |
| 所属 Story | [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) |
| 覆盖的验收条件 | US-004/AC-17、AC-18 |
| Related Product Spec / ADR | [FS-portfolio-ia-cleanup](../../requirements/specs/FS-portfolio-ia-cleanup.md) §6.2（B15）、§7（AC41）、§10（R-10）、§11（HD-13） |
| Execution Plan | [Draft：TASK-067-plan](./TASK-067-plan.md)（原免计划，按 Human 要求补计划） |

> 待 Orchestrator 正式登记的任务内容，当前不含 Status，不属于已登记任务或实施队列。

## 1. 问题

`PortfolioCard`（`/portfolios` 组合卡）现状只有「市值 + 持仓数」行、「偏离阈值」徽标、「N 条未读提醒」徽标。缺四格：**总市值 / 持仓资产 / 待办 / 上次再平衡**。且卡片与健康表若各算一套「偏离/待办」，会出现「卡片说正常、表说 2 项超阈」的口径分裂（Spec R-10）。

## 2. 已核实的事实（2026-11-05 亲读 `main` 源码）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | 现有卡片：`MarketValueRow`（市值 + `positionCount`）`:18-29`；`DriftBadge`（偏离阈值/配置正常）`:31-38`；`unreadAlertCount` 徽标 `:79-83` | `client/src/components/PortfolioCard/index.jsx` |
| F-02 | `usePortfolios()` 返回 `stats: {positionCount, marketValueByCurrency, drift, unreadAlertCount}`；TASK-065 落地后新增 `lastExecutedAt` / `pendingRebalanceCount` | `client/src/hooks/usePortfolios.js:18-27`、`shared/services/portfolio/summary.js` |
| F-03 | 数据**已在** `stats` 上（`GET /api/portfolios/summary`），四格**零新增请求、零服务端改动** | `client/src/services/portfolio.service.js:8-9` |
| F-04 | 卡片徽标仍用 `drift.needsRebalance`（`P1-1` 未做前不改其语义） | `index.jsx:35` |

## 3. Acceptance Criteria

- [ ] AC-01：卡片新增四格全部呈现：① 总市值（`marketValueByCurrency` 分币种并列，不跨币种合计）② 持仓资产（`positionCount`）③ 待办（`pendingRebalanceCount` + `unreadAlertCount`）④ 上次再平衡（`lastExecutedAt` → `YYYY-MM-DD`，`null` → 「从未」）（对应 US-004/AC-17）。
- [ ] AC-02：「待办」为 0 显示「—」；「上次再平衡」无值显示「从未」，DOM 中 `grep` 不到「暂无」（对应 US-004/AC-17）。
- [ ] AC-03：**同源逐字一致**——同一组合在卡片与健康表（TASK-066）的「偏离」文案逐字一致（对应 US-004/AC-18）。
- [ ] AC-04：进入 `/portfolios` 时 Network 中 portfolios 相关请求数**不变**（对比改动前基线，零新增请求）（对应 US-004/AC-17）。

## 4. Scope

**In Scope**

- `client/src/components/PortfolioCard/index.jsx`：新增四格展示（总市值 / 持仓资产 / 待办 / 上次再平衡）

**Out of Scope**

- 不改 `shared/`、`server/`、`cron-worker/`
- 不改 `drift.needsRebalance` 徽标语义（`P1-1` 不在本期）
- 不改 Dashboard 健康表（TASK-066）

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **口径分裂**（Spec R-10）：卡片与健康表「偏离/待办」各算一套 | 数据全部取 `stats`（同源）；AC-03 要求与健康表文案逐字一致 |

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| B1 | 前置 TASK-065：`stats` 新增 `lastExecutedAt` / `pendingRebalanceCount` | 待办理（缺字段时「待办/上次再平衡」显示降级态，验收需真实字段） |
| B2 | 与 TASK-066 同源对齐（文案逐字一致） | 协调 |

## 7. Coordination Notes

**免计划依据**（EXECUTION_PLANS.md §2）：单文件纯展示改动，零请求、零服务端、无架构 / 契约 / 依赖变更。**实施要点**：四格全部从 `portfolio.stats` 派生，不新增请求；「上次再平衡」无值显示「从未」、「待办」为 0 显示「—」；「偏离」文案与 TASK-066 健康表逐字一致。**验证方式**：构造同一组合，比对卡片与健康表「偏离」文本；Network 面板断言 portfolios 请求数不变；`npm run build --workspace client` + eslint。

## 8. Open Questions

无（OQ-03「组合卡市值单币种简化」为假设项，实施时按「健康表市值列同样按组合本币显示」执行，不跨币种合计）。
