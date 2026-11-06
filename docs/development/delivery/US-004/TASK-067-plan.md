# TASK-067 — US-004 实施计划

## Status

Status：Draft

Owner：Planner（规划）→ 待 Orchestrator 登记并指派 Implementer

Related Task：[TASK-067](./TASK-067.md)；所属 [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md)。

Branch / Base：实施时从 up-to-date `main` 新建 `feature/TASK-067` 独立 worktree。规划期基线为 2026-11-05 的 `main`；目标文件 `client/src/components/PortfolioCard/index.jsx`、`client/src/hooks/usePortfolios.js` 已亲读核实（见 §3）。

Approval：**未批准**。本计划覆盖 §1～§9 当前设计；`Draft → Approved` 归 Human（[STATES.md](../../../os/process/STATES.md) §4）。注意：本卡 Task 卡原标注「免计划」，因 Human 明确要求「逐一为每个 task 编写 execplan」，本计划据此编制。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task [TASK-067](./TASK-067.md) 的 §3；覆盖 US-004/AC-17、AC-18。本卡给 `PortfolioCard`（`/portfolios` 组合卡）新增四格：总市值 / 持仓资产 / 待办 / 上次再平衡。**零新增请求、零服务端改动**，且与 TASK-066 健康表同源、文案逐字一致。

## 2. Context

需求、任务见 [Story US-004 §3](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) 与 [FS §6.2 B15、§10 R-10、§11 HD-13](../../requirements/specs/FS-portfolio-ia-cleanup.md)。

关键约束：
- **零请求零服务端**：四格数据全部取自 `usePortfolios()` 返回的 `stats`（TASK-065 落地后含 `lastExecutedAt`/`pendingRebalanceCount`）。
- **同源逐字一致**（R-10）：卡片「偏离」文案与健康表（TASK-066）逐字一致。
- **不扩义**：徽标仍用 `drift.needsRebalance`（P1-1 未做前不改语义）。

## 3. Repository Findings（2026-11-05 亲读 `main`，行号为现状）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | 现有卡片：`MarketValueRow`（市值 + `positionCount`）`:18-29`；`DriftBadge`（偏离阈值/配置正常）`:31-38`；`unreadAlertCount` 徽标 `:79-83` | `client/src/components/PortfolioCard/index.jsx` |
| F-02 | `usePortfolios()` 返回 `stats: {positionCount, marketValueByCurrency, drift, unreadAlertCount}`；TASK-065 落地后新增 `lastExecutedAt`/`pendingRebalanceCount` | `client/src/hooks/usePortfolios.js:18-27` |
| F-03 | `GET /api/portfolios/summary` 已含 `stats`（零新增请求前提成立） | `client/src/services/portfolio.service.js:8-9` |
| F-04 | 卡片徽标仍用 `drift.needsRebalance`（`:35`），P1-1 未做前不改 | `index.jsx:35` |

## 4. Proposed Design

1. **`PortfolioCard/index.jsx` 新增四格展示区**（数据全部从 `portfolio.stats` 派生）：
   - ① 总市值：`marketValueByCurrency` 分币种并列（沿用 `CURRENCY_SYMBOLS` 与 `formatBucket`），**不跨币种合计**。
   - ② 持仓资产：`positionCount`。
   - ③ 待办：`pendingRebalanceCount`（「N 条待确认」）+ `unreadAlertCount`（「N 条未读」）；两者皆 0 → 「—」。
   - ④ 上次再平衡：`lastExecutedAt` → `YYYY-MM-DD`，`null` → 「从未」。
   - 布局沿用卡片既有 Tailwind 风格（`text-sm text-gray-*`），不引入新设计 token。
   - 徽标跳转目标与 TASK-066 `B9` 一致（「N 条待确认」→ `?sub=suggestions`，「N 条未读」→ `/` 组合筛选）；本卡主要做展示，跳转行为与健康表约定一致即可。

2. **同源逐字一致**：卡片「偏离」文案（`DriftBadge`）与 TASK-066 健康表「偏离」列文案**逐字一致**——建议两处共享同一文案常量（如 `client/src/constants/driftLabels.js`，或在两卡各写但用测试锁定一致，实施时选共享常量更稳）。

3. **零改动红线**：不改 `shared`/`server`/`cron-worker`；不改 `drift.needsRebalance` 徽标语义；不新增请求（复用 `stats`）。

## 5. Work Breakdown

- [ ] W1：`PortfolioCard` 新增四格展示（含 `lastExecutedAt`/`pendingRebalanceCount` 降级态：字段缺失时「待办」「上次再平衡」显示「—」/「从未」）。
- [ ] W2：与 TASK-066 对齐「偏离」文案（共享常量或测试锁定逐字一致）。
- [ ] W3：验证（§7）：Network 请求数不变、四格呈现、`grep` 不到「暂无」、文案逐字一致。
- [ ] W4：`npm run build --workspace client` + eslint。

## 6. Decisions

| 项 | 结果 | 依据 |
|---|---|---|
| 市值口径 | 按组合本币分币种并列，不跨币种合计（OQ-03 假设：市值单币种简化） | Spec OQ-03 / 产品硬约束 |
| 与 TASK-066 同源 | 「偏离」文案逐字一致，建议共享常量 | Spec R-10 / AC-18 |

无待 Human 新决事项。

## 7. Verification

| Task AC | 验证方法 | 预期结果 |
|---|---|---|
| AC-01（四格呈现） | 进入 `/portfolios` 观察卡片 | 总市值/持仓资产/待办/上次再平衡四格全部呈现 |
| AC-02（空态） | 构造待办=0、无 lastExecutedAt | 「待办」显示「—」、「上次再平衡」显示「从未」；`grep -rn "暂无" client/src` 无结果 |
| AC-03（逐字一致） | 构造同一组合，比对卡片与健康表「偏离」文本 | 文案逐字一致 |
| AC-04（零请求） | Network 面板对比改动前基线 | portfolios 相关请求数不变 |

命令入口见 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md)。

## 8. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 口径分裂：卡片与健康表偏离文案不一致 | 共享常量或测试锁定；AC-03 |

## 9. Rollback

纯客户端改动，回退 = `git revert` 该次提交，无数据影响。

## 10. Implementer Handoff

- **输入**：本计划 §4 + [TASK-067](./TASK-067.md) §3 AC + [FS §6.2 B15](../../requirements/specs/FS-portfolio-ia-cleanup.md)。
- **范围与禁改**：只改 `client/src/components/PortfolioCard/index.jsx`（+ 按需共享常量）；**禁改** `shared`/`server`/`cron-worker`、`drift.needsRebalance` 语义。
- **授权**：须 Human 批准本计划后实施。
- **依赖**：前置 TASK-065（字段）；与 TASK-066 同源对齐。
- **预期产出**：四格展示 + 请求数不变 + 文案一致。
- **停止条件**：若与 TASK-066 文案约定冲突，停下协调。
- **验证入口**：`npm run build --workspace client` + eslint。

## 11. Implementation Record

（实施时填写。）

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
