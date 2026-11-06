# TASK-065 — US-004 实施计划

## Status

Status：Draft

Owner：Planner（规划）→ 待 Orchestrator 登记并指派 Implementer

Related Task：[TASK-065](./TASK-065.md)；所属 [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md)。

Branch / Base：实施时从 up-to-date `main` 新建 `feature/TASK-065` 独立 worktree（沿 053/056 惯例）。规划期基线为 2026-11-05 的 `main`；目标文件 `shared/services/portfolio/summary.js` 与 `server/test/integration/portfolio.summary.test.js` 已亲读核实（见 §3）。

Approval：**未批准**。本计划覆盖 §1～§9 当前设计；`Draft → Approved` 归 Human（[STATES.md](../../../os/process/STATES.md) §4），批准后 Task 的 `Planning → Implementing` 登记与派发由 Orchestrator 落实，Planner 不代填状态。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task [TASK-065](./TASK-065.md) 的 §3，逐条引用该节、不增删改；覆盖 US-004/AC-01～AC-04。本卡只做 `GET /api/portfolios/summary` 的 `stats` 四字段补齐（`lastExecutedAt` / `pendingRebalanceCount` / `drift.dueByTime` / `drift.overThresholdCount`），**不新增端点、不改路径**；不写前端、不写 cron-worker、不改 `drift.needsRebalance`/`drift.triggeredThresholds` 既有语义（`CM-12` 卡片徽标依赖它）。

## 2. Context

需求、任务和待决项见 [Story US-004 §3/§5](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) 与 [FS §6.2 B1～B4、§10 R-1/R-7](../../requirements/specs/FS-portfolio-ia-cleanup.md)。本任务需 ExecPlan：改 `shared/services/portfolio/summary.js` + 服务端契约，属多模块 + 契约变更（DEP-04）。

关键约束（Spec 硬规则）：
- **禁止 N+1**：`pendingRebalanceCount` 用一次 `$match + $group by portfolioId` 聚合，禁止逐组合 `countDocuments`；`overThresholdCount` 从 `evaluateThresholds` 已返回的 `details` 派生，禁止逐组合复算。
- **两个 N 不可混用**：`overThresholdCount` 的 N 是**标的数**，`dueByTime` 后续展示的「已到期（N 天）」N 是**天数**。本卡只出数据，文案归消费方（TASK-066/067）。
- **同名不同义**（R-1）：`checkThresholds` 的 `needsRebalance` 含时间维度，`summary` 的不含。本卡只加 `dueByTime`、不改既有语义。

## 3. Repository Findings（2026-11-05 亲读 `main`，行号为现状）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | `buildPortfolioSummary` 入参已含 `lastExecutedAt`（`:29`）并传给 `evaluateThresholds`（`:58`），但返回值只有 `{positionCount, marketValueByCurrency, drift}`（`:70`） | `shared/services/portfolio/summary.js:25-71` |
| F-02 | `DRIFT_THRESHOLDS = ['absoluteDeviation','relativeDeviation']`（`:18`）过滤掉 `timeInterval` → `drift` 不含时间维度；`driftTriggered` 由过滤后数组计算 `needsRebalance`（`:61-67`） | 同上 `:18`、`:61-67` |
| F-03 | `computeSummary` 已用一次 `$match+$group` 聚合取 `unreadAlertCount`（`:83-87`）；每组合再 `Promise.all([tracker.aggregate, RebalanceRecord.findOne({status:'EXECUTED'})])`（`:89-95`） | 同上 `:79-117` |
| F-04 | `evaluateThresholds` 返回 `{needsRebalance, triggeredThresholds, totalValue, details[{symbol,...,triggeredThresholds}], reasons}`；`timeInterval` 触发时顶层 `triggered` 集合加 `'timeInterval'`（`:63-66`）；`details[i].triggeredThresholds` 是**该标的**触发的阈值类型数组 | `shared/services/rebalance/thresholdChecker.js:17-76` |
| F-05 | `RebalanceRecord.status` 枚举 `['PENDING','EXECUTED','REVOKED']` | `shared/models/rebalanceRecord.js:38-42` |
| F-06 | 既有测试「仅时间间隔触发不计入漂移徽标」断言 `needsRebalance===false && triggeredThresholds===[]`（`:113-125`）——新增字段**不得破坏** | `server/test/integration/portfolio.summary.test.js:113-125` |
| F-07 | 既有契约测试 stub 了 `computeSummary`（`:161-176`），HTTP 层对字段变化不敏感；`API_CONTRACT.md:87` 仍写旧字段集 | 同上 `:161-191`；`docs/handbook/technical/API_CONTRACT.md:87` |

> ⚠️ **量纲关键**：`overThresholdCount` = `details` 中 `triggeredThresholds` **非空的标的数**（`details.filter(d => d.triggeredThresholds.length > 0).length`），**不得**取顶层 `triggeredThresholds.length`（那是阈值**类型**数，Spec `B8a` 作废、`R-7` 关闭的根因）。`drift === null`（无目标 / 无持仓 / 缺价）时 `dueByTime` 与 `overThresholdCount` **不可读**，不进 `drift` 对象。

## 4. Proposed Design

1. **`buildPortfolioSummary`（纯函数）返回值扩展**：
   - `stats` 新增 `lastExecutedAt`：直接把入参 `lastExecutedAt`（已是 `Date | null`）回传，**不得**为此新增查询（B1）。
   - `drift` 对象新增两个字段（仅 `drift !== null` 时存在）：
     - `dueByTime: boolean` = `result.triggeredThresholds.includes('timeInterval')`（B3，来自 `evaluateThresholds` 顶层集合）。
     - `overThresholdCount: number` = `result.details.filter(d => Array.isArray(d.triggeredThresholds) && d.triggeredThresholds.length > 0).length`（B3，标的数）。
   - `needsRebalance` / `triggeredThresholds` 保持既有口径（仅绝对/相对），**零语义改动**（AC-02 三项同断言锁定）。

2. **`computeSummary`（编排层）新增一次 `pendingRebalanceCount` 聚合**：
   - 与 `unreadAgg` 并列，新增：
     ```js
     const pendingAgg = await RebalanceRecord.aggregate([
       { $match: { status: 'PENDING' } },
       { $group: { _id: '$portfolioId', count: { $sum: 1 } } }
     ]);
     const pendingByPortfolio = new Map(pendingAgg.map(item => [item._id.toString(), item.count]));
     ```
   - 每组合 `stats` 合并 `pendingRebalanceCount: pendingByPortfolio.get(portfolio._id.toString()) || 0`（整数，默认 0）。
   - 查询次数：`RebalanceRecord` 共 **1 次聚合 + N 次 `findOne`（既有 lastExecuted）** = `1+N`，无新增第 2 类 N+1（AC-04）。

3. **契约不变**：`GET /api/portfolios/summary` 路径、响应信封、`includeArchived` 语义、`unreadAlertCount` 聚合全部不变；只扩展 `stats` 字段。

4. **零改动红线**：不改 `client/`、`cron-worker/`、`server/routes/`、`getPortfolioById`（裸 `Portfolio` 不含 `lastExecutedAt` 且不补）；不新增端点；删除组合后事件过滤属 TASK-068，不进本卡。

## 5. Work Breakdown

- [ ] W1：`buildPortfolioSummary` 返回扩展（`lastExecutedAt` / `drift.dueByTime` / `drift.overThresholdCount`），先写纯函数单测（红）。
- [ ] W2：`computeSummary` 加 `pendingRebalanceCount` 聚合并透传（红 → 绿）。
- [ ] W3：测试补齐（§7）：四字段存在性、AC-02 三项同断言、AC-03 EXECUTED/REVOKED 排除、AC-04 查询次数断言（10 组合构造数据）。
- [ ] W4：既有 `portfolio.summary.test.js` / `portfolio.archived.test.js` 回归，确保 F-06 用例不破；`npm run test:server` 全绿。
- [ ] W5：`API_CONTRACT.md:87` summary 行更新字段集与语义说明（与 TASK-069 协调，或直接由本卡 W5 完成、TASK-069 复核）。

## 6. Decisions

| 项 | 结果 | 依据 |
|---|---|---|
| `overThresholdCount` 口径 | 从 `evaluateThresholds.details` 派生（标的数），**不用**顶层 `triggeredThresholds.length` | Spec `B8a` 作废 / `R-7` 关闭 / `HD-10` |
| `dueByTime` 口径 | `triggeredThresholds.includes('timeInterval')`，不改 `needsRebalance` 语义 | Spec R-1 / B3 |
| `drift === null` 时新字段 | 不可读、不进 `drift` 对象 | Spec B4 |

无待 Human 新决事项（OQ-01 已裁，属 TASK-066 消费侧，与本卡无关）。

## 7. Verification

| Task AC | 验证方法 | 预期结果 |
|---|---|---|
| AC-01（四字段） | `buildPortfolioSummary` 纯函数单测 + `computeSummary` 契约测试 | `stats.lastExecutedAt` 为 `Date\|null`；`stats.pendingRebalanceCount` 整数默认 0；`drift.dueByTime` 布尔、`drift.overThresholdCount` 整数；`drift===null` 时后两字段不出现 |
| AC-02（语义不扩义） | 构造「仅 timeInterval 触发」用例，三项同断言 | `needsRebalance===false`、`triggeredThresholds===[]`、`dueByTime===true` |
| AC-03（pending 口径） | 构造 2 条 PENDING + 1 条 EXECUTED + 1 条 REVOKED | `pendingRebalanceCount===2` |
| AC-04（N+1） | 构造 10 个组合，断言 `RebalanceRecord` 查询次数 ≤ 11 且 `countDocuments===0` | 1 聚合 + 10 次 findOne = 11；无逐组合 countDocuments |
| AC-05（回归） | `npm run test:server`（命令入口见 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md)） | 全绿；既有 `portfolio.summary.test.js` F-06 用例不破 |

命令入口：`npm run test:server`（server 单测）；`npm test`（全部 workspace，按需）。**不写测试数量**（以实际输出为准）。

## 8. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 同名不同义：`needsRebalance` 两处语义被混淆 | AC-02 三项同断言；§4 明确只加 `dueByTime` |
| R-2 | N+1：`pendingRebalanceCount` 逐组合 `countDocuments` | AC-04 查询次数 + `countDocuments===0` 断言 |
| R-3 | 量纲混用：误用 `triggeredThresholds.length` 当标的数 | 从 `details` 派生；AC-04/§4 锁定 |
| R-4 | 破坏既有测试（F-06「仅时间间隔不触发漂移」） | W4 回归；新增字段不改 `needsRebalance` 计算路径 |

## 9. Rollback

纯函数 + 聚合扩展，无 schema 变更、无迁移、无数据写入。回退 = `git revert` 该次提交即可，无残留数据、无不可逆影响。唯一下游影响是消费方（TASK-066/067）在字段缺失时需按「缺失即降级」处理——已写入其 Scope。

## 10. Implementer Handoff

- **输入**：本计划 §4 设计 + [TASK-065](./TASK-065.md) §3 AC + [FS §6.2 B1～B4、§10 R-1/R-7](../../requirements/specs/FS-portfolio-ia-cleanup.md)。
- **范围与禁改**：只改 `shared/services/portfolio/summary.js` 与 `server/test/integration/portfolio.summary.test.js`（+ 按需 `API_CONTRACT.md`）；**禁改** `client/`、`cron-worker/`、`server/routes/`、既有 `needsRebalance` 语义。
- **授权**：须 Human 批准本计划（`Draft → Approved`）后方可实施。
- **依赖**：无硬前置（独立）。
- **预期产出**：四字段落地 + 测试全绿 + `API_CONTRACT.md` 字段集更新。
- **停止条件**：若实际代码与 §3 Findings 不符（文件结构变动）或既有测试断言语义与计划冲突，停下上报，不擅自改需求。
- **验证入口**：`npm run test:server`。

## 11. Implementation Record

（实施时填写：实际改动、基线与版本、偏差及依据、验证结果、遗留事项。）

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。`Merged` 仅引用 Human 登记。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
