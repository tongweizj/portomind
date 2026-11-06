# TASK-067 — US-004 实施计划

## Status

Status：Approved（2026-11-06，Human 确认已批准当前设计）

Owner：Planner（规划）→ Implementer C（2026-11-06 指派）

Related Task：[TASK-067](./TASK-067.md)；所属 [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md)。

Approval：**2026-11-06，Human 明确确认「我已经批准了」**（Orchestrator 会话核对时本文件仍为 `Draft`、无 Approval 段；经 Human 当面确认后由 Orchestrator 据其决定登记，**不是自行批准**）。批准覆盖本文件 §1～§9 当前设计，不含其他任务。此登记不改变设计内容。

Branch / Base：实施时从 up-to-date `main` 新建 `feature/TASK-067` 独立 worktree。规划期基线为 2026-11-05 的 `main`；目标文件 `client/src/components/PortfolioCard/index.jsx`、`client/src/hooks/usePortfolios.js` 已亲读核实（见 §3）。

Approval：**未批准**。本计划覆盖 §1～§9 当前设计；`Draft → Approved` 归 Human（[STATES.md](../../../os/process/STATES.md) §4）。注意：本卡 Task 卡原标注「免计划」，因 Human 明确要求「逐一为每个 task 编写 execplan」，本计划据此编制。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task [TASK-067](./TASK-067.md) 的 §3；覆盖 US-004/AC-17、AC-18。本卡给 `PortfolioCard`（`/portfolios` 组合卡）新增四格：总市值 / 持仓资产 / 待办 / 上次再平衡。**零新增请求、零服务端改动**，且与 TASK-066 健康表同源、文案逐字一致。

## 2. Context

需求、任务见 [Story US-004 §3](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) 与 [FS §6.2 B15、§10 R-10、§11 HD-13](../../requirements/specs/FS-portfolio-ia-cleanup.md)。

关键约束：
- **零请求零服务端**：四格数据全部取自 `usePortfolios()` 返回的 `stats`（TASK-065 落地后含 `lastExecutedAt`/`pendingRebalanceCount`）。
- **同源（D-01 解 B，已裁）**：卡片与健康表「待办」「上次再平衡」文案**逐字一致**；「偏离」数据同源取 `stats.drift`，但卡片 `DriftBadge` 徽标维持两态（P1-1），不改成语健康表四态。逐字一致**不**要求偏离徽标与健康表偏离列字面相同。
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

2. **同源（D-01 解 B）**：卡片「待办」「上次再平衡」文案与 TASK-066 健康表**逐字一致**，共享同一文案常量 `client/src/constants/driftLabels.js`（**由 TASK-066 / Implementer B 拥有，本卡消费**，D-02 已裁）。「偏离」数据同源取 `stats.drift`（不各算一套），卡片 `DriftBadge` 徽标维持现状两态，不改成四态。

3. **零改动红线**：不改 `shared`/`server`/`cron-worker`；不改 `drift.needsRebalance` 徽标语义；不新增请求（复用 `stats`）。

## 5. Work Breakdown

- [ ] W1：`PortfolioCard` 新增四格展示（含 `lastExecutedAt`/`pendingRebalanceCount` 降级态：字段缺失时「待办」「上次再平衡」显示「—」/「从未」）。
- [ ] W2：消费 TASK-066 拥有的 `driftLabels.js` 共享常量，对齐「待办/上次再平衡」文案（逐字一致）；偏离徽标维持两态。
- [ ] W3：验证（§7）：Network 请求数不变、四格呈现、`grep` 不到「暂无」、文案逐字一致。
- [ ] W4：`npm run build --workspace client` + eslint。

## 6. Decisions

| 项 | 结果 | 依据 |
|---|---|---|
| 市值口径 | 按组合本币分币种并列，不跨币种合计（OQ-03 假设：市值单币种简化） | Spec OQ-03 / 产品硬约束 |
| D-01（逐字一致口径） | 解 B：逐字一致只约束「待办/上次再平衡」；偏离徽标维持两态、数据同源 | 2026-11-06 Human 裁决 |
| D-02（常量归属） | `driftLabels.js` 由 TASK-066（Implementer B）拥有，本卡消费 | 2026-11-06 Human 裁决 |

无待 Human 新决事项。

## 7. Verification

| Task AC | 验证方法 | 预期结果 |
|---|---|---|
| AC-01（四格呈现） | 进入 `/portfolios` 观察卡片 | 总市值/持仓资产/待办/上次再平衡四格全部呈现 |
| AC-02（空态） | 构造待办=0、无 lastExecutedAt | 「待办」显示「—」、「上次再平衡」显示「从未」；`grep -rn "暂无" client/src` 无结果 |
| AC-03（同源逐字一致，解 B） | 构造同一组合，比对卡片与健康表「待办」「上次再平衡」文本；确认偏离徽标仍两态 | 「待办/上次再平衡」文案逐字一致；偏离徽标维持「偏离阈值/配置正常」两态，数据同源 |
| AC-04（零请求） | Network 面板对比改动前基线 | portfolios 相关请求数不变 |

命令入口见 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md)。

## 8. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 口径分裂：卡片与健康表「待办/上次再平衡」文案不一致 | 共享 `driftLabels.js` 常量（D-02：066 拥有）；AC-03 |

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

（Implementer C，2026-11-06，基线 `main` @ `0189c04`，worktree `D:/projects/portomind-067`，分支 `feature/TASK-067`）

### 改动范围

| 文件 | 说明 | SHA256 |
|---|---|---|
| `client/src/components/PortfolioCard/index.jsx` | 新增四格展示（总市值 / 持仓资产 / 待办 / 上次再平衡），并删除原 `MarketValueRow` 与旧「N 条未读提醒」徽标（其职责并入「待办」格） | `f270472379285afe522a3a85cac607594945a6c4c8d08dd1258d9ccf10d05974` |

唯一改动文件。未改 `shared/`、`server/`、`cron-worker/`、Dashboard 健康表、`drift.needsRebalance` 徽标语义。

### driftLabels.js 处理方式（D-02）

- `main` @ `0189c04` 上**无** `client/src/constants/driftLabels.js`（已核实），本卡**未新建**该文件。
- 交付时本卡临时内联文案（见组件顶部注释），文案字面与 TASK-066 已建常量 `PENDING_LABELS` / `LAST_REBALANCE_LABELS` **逐字一致**（已核对 066 worktree `feature/TASK-066` @ `f72f40f` 的 `client/src/constants/driftLabels.js`：`pendingRebalance: ${count} 条待确认`、`unreadAlert: ${count} 条未读`、`lastRebalance never: 从未`）。
- **待 B 的 driftLabels.js 合入 main 后切换为 import**（组件顶部已标注 TODO 注释，含切回点）。

### AC 逐条结果

| AC | 结果 | 证据 |
|---|---|---|
| AC-01 四格呈现 | ✅ | SSR 渲染真实 `PortfolioCard`：总市值 `¥82,340.5 + US$1,200`（分币种并列、无跨币种合计 83540）、持仓资产 `3 个`、待办 `2 条待确认 + 1 条未读`、上次再平衡 `2026-08-27`。 |
| AC-02 空态 | ✅ | 待办 0 → 「—」；`lastExecutedAt: null` → 「从未」；`grep "暂无" client/src/components/PortfolioCard/` 无结果（exit 1）。 |
| AC-03 同源逐字一致（解 B） | ✅ | 待办/上次再平衡文案与 066 `driftLabels.js` 逐字一致（`N 条待确认`/`N 条未读`/`从未`/`YYYY-MM-DD`）；偏离数据同源取 `stats.drift`（无各算一套）；`DriftBadge` 维持两态「偏离阈值/配置正常」。 |
| AC-04 零新增请求 | ✅ | 组件仅新增 `lucide-react`/`constants/enums`（均为既有 import），无 `useQuery`/`service`/`fetch`/`axios` 引入；数据全部取自 `portfolio.stats`（`usePortfolios()` 既有 `portfolios-summary` 查询），改动前后请求路径不变。 |

### 验证命令

- `cd client && npm run build` → exit 0（vite build 成功，2438 modules）。
- `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` → exit 0（0 error）。
- 渲染实测：19 项断言全部 PASS（四格真实值 / 降级态 / 待办 0 → — / 无值 → 从未 / 无「暂无」/ 字段缺失不崩不显 0 / 无 stats 兜底 / 仅未读 / 仅待确认）。
- 负向对照：把 `DriftBadge` 换成四态文案后，卡片与健康表偏离列字面不一致（「偏离阈值」≠「2 项超阈」），AC-03 逐字一致断言会失败——证明本卡未改徽标语义。

### 待 065 合入后补验清单

- 真实 `pendingRebalanceCount` / `lastExecutedAt` 落到 `stats` 后，四格「待办」「上次再平衡」显示真实值（当前以字段缺失降级态验证：不崩、不显 0、显示「—」/「从未」）。
- 与 TASK-066 健康表对**同一真实组合**做端到端文案逐字比对（当前为常量表核对 + 组件级 SSR 断言）。
- 切回 `driftLabels.js` import（B 合入后）并复跑 build + eslint。

### 已知妥协与未验证项

- 未做真实浏览器 Network 面板截图（无后端运行环境）；AC-04 以「无新增请求入口 + 数据源复用既有 query」静态证明，配合 `usePortfolios()` 既有 `queryKey: ['portfolios-summary']` 缓存机制佐证。
- 「待办」跳转目标（B9：`?sub=suggestions` / `/` 组合筛选）属 TASK-066 健康表 AC-03 口径；本卡四格为纯展示，未加跳转（与计划 §4「本卡主要做展示」一致）。

### 提交

- 提交到 `feature/TASK-067`，正文带 `TASK-067`。不 merge main、不改 Task 状态、不填 Merged。

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
