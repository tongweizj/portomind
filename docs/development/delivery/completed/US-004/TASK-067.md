# TASK-067 — `PortfolioCard` 四格（总市值 / 持仓资产 / 待办 / 上次再平衡）（FS B15）

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Completed（2026-11-06，独立 Reviewer 判定 `Pass with issues`、无 BLOCKER/MAJOR；Human 确认「检验通过」）**；`Merged` = `d95be45`（2026-11-06，`Merge branch 'feature/TASK-067' into main`） |
| Priority / Owner / Type | `High` / — / `Feature`（纯客户端，零请求零服务端） |
| Created / Updated | 2026-11-05 / 2026-11-06 |
| 所属 Story | [US-004](../../../requirements/stories/active/US-004-dashboard-portfolio-health.md) |
| 覆盖的验收条件 | US-004/AC-17、AC-18 |
| Related Product Spec / ADR | [FS-portfolio-ia-cleanup](../../../requirements/specs/FS-portfolio-ia-cleanup.md) §6.2（B15）、§7（AC41）、§10（R-10）、§11（HD-13） |
| Execution Plan | [Approved：TASK-067-plan](./TASK-067-plan.md)（2026-11-06 Human 确认批准） |

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
- [ ] AC-03：**同源**（D-01 已裁，解 B，2026-11-06 Human）——卡片与健康表（TASK-066）的「待办」「上次再平衡」文案**逐字一致**（「N 条待确认」/「N 条未读」/「从未」/`YYYY-MM-DD`）；「偏离」数据同源取 `stats.drift`（不各算一套），但**卡片 `DriftBadge` 徽标维持现状两态**（「偏离阈值」/「配置正常」），不改语义、不改成健康表四态（P1-1）。逐字一致**不**要求卡片偏离徽标与健康表偏离列字面相同（对应 US-004/AC-18）。
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
| B2 | 与 TASK-066 同源对齐（「待办/上次再平衡」文案逐字一致；偏离徽标维持两态） | 协调 |

## 7. Coordination Notes

**免计划依据**（EXECUTION_PLANS.md §2）：单文件纯展示改动，零请求、零服务端、无架构 / 契约 / 依赖变更。**实施要点**：四格全部从 `portfolio.stats` 派生，不新增请求；「上次再平衡」无值显示「从未」、「待办」为 0 显示「—」；「偏离」文案与 TASK-066 健康表逐字一致。**验证方式**：构造同一组合，比对卡片与健康表「偏离」文本；Network 面板断言 portfolios 请求数不变；`npm run build --workspace client` + eslint。

## 8. Open Questions

- **D-01**：✅ 已裁决（2026-11-06 Human）——AC-18「偏离文案逐字一致」采用**解 B**：逐字一致只约束卡片与健康表重叠的「待办/上次再平衡」文案；卡片 `DriftBadge` 徽标维持两态（P1-1），偏离数据同源即可。
- **D-02**：✅ 已裁决（2026-11-06 Human）——`driftLabels.js` 由 TASK-066（Implementer B）拥有，本卡消费。
- OQ-03「组合卡市值单币种简化」为假设项，实施时按「健康表市值列同样按组合本币显示」执行，不跨币种合计。

---

## 11. Implementation Record（Orchestrator 登记，2026-11-06）

- **交付提交**：`8141275`（`feat(client): TASK-067 add four-cell stats grid to PortfolioCard`），分支 `feature/TASK-067`。
- **改动文件**：`client/src/components/PortfolioCard/index.jsx`（+87）：`MarketValueRow` 替换为 `StatCells` 四格（总市值 / 持仓资产 / 待办 / 上次再平衡），全部从 `usePortfolios()` 的 `stats` 派生，**零新增请求、零服务端改动**；字段缺失按降级态显示「—」/「从未」（不显示 0、不崩）。
- **⚠️ 分支基线陈旧**：`feature/TASK-067` 自 `main` 早期 fork（早于 `d345430`），**不含 065 合入（`6f556aa`）**。故 `git diff main..feature/TASK-067` 会把 065 四字段 + 156 行测试、以及 `BOARD`/`US-004`/prompt 等文档**显示为删除**——属 fork 点陈旧的双向 diff 假象，**并非本卡删除它们**；两路合并会保留双方。评审与合入前**必须先把 067 rebase/merge 到当前 main**。
- **已知妥协**：`main` 尚无 066 的 `driftLabels.js`（D-02 归 B），本卡**临时内联文案**，注释声明待 B 合入后切换为共享常量、绝不新建同名文件；「待办」文案「N 条待确认 / N 条未读」与 066 健康表逐字一致（D-01 解 B）。

## 12. Review Record

**独立审查结论：`Pass with issues`**（2026-11-06，独立 Reviewer；无 BLOCKER / MAJOR，残余 MINOR 不阻塞）。评审前置已按要求在分支上 `git merge main` 得到干净基线 `434a323`（原 `8141275` 基于旧 main，未含 065 合入，旧 diff 的「065 内容删除」为假象）；rebase 后确认 065 四字段与 156 行测试完整保留。完整证据、AC-17/AC-18 逐条判定、负向对照、DoD T-1～T-6 见 [TASK-067-plan.md §12 Review Record](./TASK-067-plan.md#12-review-record)。未改 Task Status，关闭与合入登记归 Human。

### 审查交接（Orchestrator → Reviewer，2026-11-06）

- **可审对象（前置）**：⚠️ 先在 `feature/TASK-067` 上 `git merge main`（或 rebase 到当前 main，含 065 合入 `6f556aa`）得到干净基线后再评审。未 rebase 的裸分支会让 065 字段/测试与文档看似被删，属假象。
- **覆盖 AC**：US-004/AC-17、AC-18（四格呈现、降级态、同源逐字一致、零新增请求）。
- **重点核对**：① 四格全部从 `stats` 派生、Network 中 portfolios 请求数不变（AC-04，运行时验证）；② 「待办」为 0 → 「—」、「上次再平衡」无值 → 「从未」、DOM 无「暂无」（AC-02）；③ 与 TASK-066 健康表「待办/上次再平衡」文案逐字一致、「偏离」同源取 `stats.drift`、卡片 `DriftBadge` 维持两态不扩义（AC-03 / D-01 解 B）；④ `lastExecutedAt` → `YYYY-MM-DD`、分币种不跨币种合计（AC-01 / AC-17）；⑤ 内联文案不得新建 `driftLabels.js`（D-02）；⑥ rebase 后 `summary.js` 仍含 `pendingRebalanceCount`/`dueByTime`/`overThresholdCount`、测试仍 156 行（确认未丢失 065）。
- **验证命令**（DEPLOYMENT §7 为唯一权威）：`npm run build --workspace client` 与 `eslint` 全绿；浏览器进 `/portfolios` 比对卡片四格与健康表、Network 面板断言请求数不变。
- **未授权事项**：Orchestrator 不替代 Reviewer 结论、不替代 Human 关闭。

## 13. Completion Record

### 13.1 结案依据（2026-11-06）

| 项 | 事实 |
|---|---|
| 结案日期 | 2026-11-06 |
| 结案依据 | Human「067 检验通过」 |
| 实现 | `feature/TASK-067` @ `8141275`（四格 stats grid） |
| 基线刷新 | `434a323`（评审前首次刷新）→ `6f5add2`（合入前刷新至 `main` @ `6f0b4df`） |
| 审查记录 | `6e18de2`（§12）；第二遍复跑记录保留于 `1e6ce28` |
| 审查判定 | `Pass with issues`，无 BLOCKER/MAJOR |
| 状态流转 | `Draft` → `Approved` → `Implementing` → `Reviewing` → `Completed` |
| 合入 | **`d95be45`** —— 2026-11-06 经 `Merge branch 'feature/TASK-067' into main` 合入；分支 tip `6f5add2` 已在 `main` 历史中 |

### 13.2 基线陈旧问题已闭环

此前登记的风险：`feature/TASK-067` 基于旧 `main`，不含 065 合入 `6f556aa`，
`git diff main..feature/TASK-067` 会把 065 四字段与 156 行测试**显示为删除**
（双向 diff 假象）。

**处置**：评审前已执行 `git merge main`（`434a323`）。核对：

- `git merge-base --is-ancestor 6f556aa feature/TASK-067` = **是**（分支含 065）
- `git diff --stat main...feature/TASK-067 -- shared/ server/` = **空**（不回退 065 字段与测试）
- merge-base = `96ff382`

### 13.3 DoD 逐条（[DEFINITION_OF_DONE](../../../../os/process/DEFINITION_OF_DONE.md) §3）

| # | 要求 | 结论 |
|---|---|---|
| T-1 | 实现完成 | ✅ §11 |
| T-2 | 验证完成，记录实际结果 | ✅ §11 + §12（Reviewer 独立复跑） |
| T-3 | AC 逐条满足 | ✅ §12.9 AC-01～AC-04 全部满足 |
| T-4 | 审查收敛，无未决 BLOCKER | ✅ `Pass with issues`，无 BLOCKER/MAJOR |
| T-5 | 文档同步 | ✅ §12 审查记录、本卡 §13、BOARD |
| T-6 | 已知妥协已记录 | ✅ §12 残余 5 项 MINOR |

### 13.4 残余 MINOR（不阻塞）

F-01 D-02 临时内联文案（待 066 `driftLabels.js` 合入后切换）、F-02 `formatDate` 容错、
F-03 页面级既有「暂无」、F-04 证据增强、F-05 基线说明。

### 13.5 合入登记

Human 于 2026-11-06 指示完成合并；`feature/TASK-067` @ `6f5add2` 经 merge commit `d95be45` 合入 `main`。
核对：`git merge-base --is-ancestor 6f5add2 main` = **是**，`git merge-base --is-ancestor 8141275 main` = **是**；合入相对原 `main` 未改动 `shared/`、`server/`、`cron-worker/`。

### 13.6 过程目录处置

按 [DOCS.md §1.1](../../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期)，
本卡与计划留在 `development/delivery/completed/US-004/`，待 US-004 关闭后整体归档。
