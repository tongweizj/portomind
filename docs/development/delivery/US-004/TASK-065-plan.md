# TASK-065 — US-004 实施计划

## Status

Status：Completed（2026-11-06，Task 已 `Completed`，Human 确认验收通过；计划同步 `Approved → Completed`）

Owner：Planner（规划）→ Implementer A（2026-11-06 指派）

Related Task：[TASK-065](./TASK-065.md)；所属 [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md)。

Approval：**2026-11-06，Human 明确确认「我已经批准了」**（Orchestrator 会话核对时，本文件仍为 `Draft`、无 Approval 段；经 Human 当面确认后由 Orchestrator 据其决定登记，**不是自行批准**）。批准覆盖本文件 §1～§9 当前设计，不含其他任务。此登记不改变设计内容。

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
| AC-06（cron-worker 零改动） | `git status cron-worker` 空输出（对应 Story AC-14，G-1 补） | 空输出，改动范围不触达 `cron-worker/` |

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

**状态：** 实施完成（2026-11-06）。Task Status 保持 `Implementing`（未改 Reviewing/Completed，权限归 Orchestrator/Human）；计划 Status 保持 `Approved`，未改 AC/Scope。

### 11.1 环境

| 项 | 实际值 |
|---|---|
| Worktree | `D:\projects\portomind-065`（独立；主工作区与其他 worktree 未触碰） |
| Branch / Base | `feature/TASK-065` / `main @ 0189c04` |
| Node / npm | `v24.20.0` / `12.2.1`；worktree 无 `node_modules`，已 `npm ci`（隔离安装） |
| 目标文件 | `shared/services/portfolio/summary.js`、`server/test/integration/portfolio.summary.test.js`、`docs/handbook/technical/API_CONTRACT.md` |
| 禁用面 | 未改 `client/`、`cron-worker/`、`server/routes/`、`getPortfolioById` |

### 11.2 改动文件与 SHA256

| 文件 | 变化 | SHA256 |
|---|---|---|
| `shared/services/portfolio/summary.js` | `buildPortfolioSummary` 回传四字段；`computeSummary` 单次 PENDING 聚合 | `8f294728a4da6479f84ce90a8797cefa8c2013008cb2d181d83314659ac9b663` |
| `server/test/integration/portfolio.summary.test.js` | 新增 5 条 US-004 用例（AC-01～04）+ AC-02 三项同断言 | `b83077cfb81ffbd311abeb9fce924e7b047141eb02e828532bfb7cea558eca7d` |
| `docs/handbook/technical/API_CONTRACT.md` | summary `stats` 字段集与语义 | `c516e8a3111592def48be842d91c04b963e62e2be1110e0927844509894eef00` |

### 11.3 AC-01～AC-06 实测结果

| AC | 结果 | 证据 |
|---|---|---|
| AC-01 四字段 | **PASS** | `buildPortfolioSummary` 纯函数断言：`lastExecutedAt` 原样回传（Date/null）、`pendingRebalanceCount` 默认 0、`drift.dueByTime` 布尔、`drift.overThresholdCount` 整数；`drift === null` 时对象为 null、不构造后两字段 |
| AC-02 语义不扩义 | **PASS** | 仅 `timeInterval` 触发用例同断言：`needsRebalance === false`、`triggeredThresholds === []`、`dueByTime === true`；`overThresholdCount === 0` |
| AC-03 pending 批量 | **PASS** | 单次 `$match {status:'PENDING'} + $group {_id:'$portfolioId',count:{$sum:1}}`；构造 2 条 p1 PENDING + 1 条 p2 PENDING + 1 条 EXECUTED + 1 条 REVOKED，p1=2、p2=1；测试断言 `countDocuments` 0 次 |
| AC-04 不复算 / 查询预算 | **PASS** | `overThresholdCount` 从 `details.filter(d => d.triggeredThresholds.length > 0).length` 派生；构造“1 个标的触发 absolute+relative 两种类型、另两个标的未超阈”，断言 `overThresholdCount === 1`、顶层 `triggeredThresholds.length === 2`。10 组合构造数据：`RebalanceRecord.aggregate` **1 次** + `findOne` **10 次** = **11 次**（≤11）；`countDocuments` **0 次** |
| AC-05 回归 | **PASS** | `npm run test:server`：**237 tests / 237 pass / 0 fail**；`portfolio.summary.test.js` 15/15、`portfolio.archived.test.js` 7/7；既有“仅时间间隔”用例保留并增强 |
| AC-06 cron-worker 零改动 | **PASS** | `git status --porcelain -- cron-worker` **空输出**；`git status cron-worker` 仅显示 clean 提示（无改动） |

**实际命令输出：**

```text
npm run test:server
ℹ tests 237
ℹ pass 237
ℹ fail 0

node --test test/integration/portfolio.summary.test.js test/integration/portfolio.archived.test.js
ℹ tests 22
ℹ pass 22
ℹ fail 0
```

### 11.4 查询次数实测（AC-03/AC-04）

```text
2 组合（AC-03）:
  RebalanceRecord.aggregate  ×1   （$match status=PENDING + $group by portfolioId）
  RebalanceRecord.findOne    ×2   （每组合既有 EXECUTED lastExecuted 查询）
  RebalanceRecord.countDocuments ×0

10 组合（AC-04）:
  RebalanceRecord.aggregate  ×1
  RebalanceRecord.findOne    ×10  （既有 lastExecuted，每组合一次）
  合计 = 11（≤ 11）
  RebalanceRecord.countDocuments ×0
```

生产代码 `grep countDocuments shared/services/portfolio/summary.js` 仅命中注释，无调用；未新增 `lastExecutedAt` 查询（直接使用既有 `findOne` 结果）。

### 11.5 负向对照

| AC | 临时缺陷 | 实际结果 | 恢复 |
|---|---|---|---|
| AC-02 | `dueByTime: driftTriggered.length > 0`（从 `needsRebalance` 派生） | `仅时间间隔触发不计入漂移徽标` FAIL（actual false / expected true） | 恢复 `8f294728…b663` |
| AC-03 | 改为每组合 `RebalanceRecord.countDocuments(...)` | AC-03 FAIL（actual 0 / expected 2）；AC-04 FAIL（countDocuments actual 10 / expected 0） | 恢复同上 |
| AC-04 | `overThresholdCount: result.triggeredThresholds.length`（顶层类型数） | `AC-04：overThresholdCount 是标的数…` FAIL（actual 2 / expected 1） | 恢复同上 |

恢复后重跑 `npm run test:server` 仍为 **237/237**。

### 11.6 已知妥协与未验证项

1. **未连真实 Mongo**：AC-03/AC-04 的查询次数通过 Node test 对 Mongoose 模型方法计数验证，不是运行时 explain/真实库查询计划；字段值由真实 `evaluateThresholds` 纯函数计算，但 DB 聚合未在真实库执行。
2. **空组合列表跳过 pending 聚合**：`portfolios.length === 0` 时不发 `RebalanceRecord.aggregate`；这是避免无意义查询的优化，N>0 时严格一次聚合。既有 `portfolio.archived.test.js` 因此无需新增 DB stub，全部保持通过。
3. 测试输出存在既有 `summary ↔ thresholdChecker ↔ portfolio/index` 循环依赖的 Node warning（“Accessing non-existent property…”），不影响退出码或断言；本卡未改该既有结构。
4. 未改前端（TASK-066/067 消费）；`lastExecutedAt` 从既有 `lastExecuted` 结果直接回传，没有新增该字段的查询。
5. API_CONTRACT 只更新 summary 行；未新增端点、未改路径。

### 11.7 交付状态

实现、单测、查询预算断言与三条负向对照完成；待 Orchestrator 登记 Reviewing 并安排独立 Reviewer。Task Status / Merged 未改。

## 12. Review Record

### 12.1 独立性声明与审查对象

- 依据 [REVIEWER.md §5/§7](../../../os/roles/REVIEWER.md)。**独立 Reviewer，未参与本卡实现或验收脚本编写**；Implementer 自述不作结论，全部实跑复核。
- **基线澄清（重要）**：任务指定审查对象 `8fde289`（父 `0189c04`），但复核期间 `feature/TASK-065` 已 rebase 到新 `main`（`3b74dcb`）之上，当前 HEAD = **`5f807a3`**，原 `8fde289` 成为悬空提交（`git branch --contains 8fde289` 无输出）。经比对 `git diff 8fde289 5f807a3 -- shared/ server/ docs/handbook/technical/API_CONTRACT.md` **为空**，两提交的审查相关代码/测试/契约内容**完全一致**；两提交各自相对其父的 diff 均为同 4 文件 +270/-6。故**以当前可审分支 HEAD `5f807a3` 为审查对象**，结论同样适用于 `8fde289` 的代码内容。
- 工作区 `D:/projects/portomind-065`，`git status --porcelain` 空（审查后临时探针全部删除）。
- **范围口径**：`main` 在复核期间持续前进（由 `3b74dcb` → `4d3e247`，Orchestrator 在 main 登记 065 `Reviewing` 等状态），故 `git diff --stat main..feature/TASK-065` 会随 main 漂移而多出 `docs/BOARD.md` 等**假改动**（非 Implementer 所为）。以 **merge-base `3b74dcb`..HEAD**（= Implementer 自身提交 `5f807a3`）为正确范围判定：恰好 4 文件 —— `TASK-065-plan.md`、`API_CONTRACT.md`、`portfolio.summary.test.js`、`shared/services/portfolio/summary.js`。
- 被审文件 SHA256：`summary.js` `8f294728…b663`；`portfolio.summary.test.js` `367ac8d1…a0ffb`；`API_CONTRACT.md` `c516e8a3…ef00`。

### 12.2 实跑证据（不靠代码阅读下结论）

| 命令 | 实际输出 |
|---|---|
| `npm run test:server` | **ℹ tests 237 / pass 237 / fail 0**，exit 0 |
| `node --test server/test/integration/portfolio.summary.test.js` | **15/15 pass**（7 条既有 + 5 条 AC-01～04 新增 + 3 条 HTTP 契约）；含 `AC-04：overThresholdCount 是标的数…`、`AC-03：pendingRebalanceCount 单次聚合…`、`AC-04：10 个组合…≤ 11，countDocuments = 0`、`仅时间间隔触发不计入漂移徽标` 全绿 |
| `node --test server/test/integration/portfolio.archived.test.js` | **7/7 pass**（无回归） |
| 自建独立探针（临时，已删） | **16/16 PASS**：真实 `buildPortfolioSummary`/`computeSummary`，只 stub 模型方法构造世界，不 mock 被审逻辑 |
| 真实 HTTP 层契约探针（临时，已删） | 1/1 pass：`GET /api/portfolios/summary` 返回 `stats` = `drift,lastExecutedAt,marketValueByCurrency,pendingRebalanceCount,positionCount`，`drift` = `dueByTime,needsRebalance,overThresholdCount,triggeredThresholds` |
| 负向对照 ×3 | 见 §12.5，均使关键断言 FAIL 后还原 |

### 12.3 AC 逐条判定

| AC | 判定 | 独立实测证据 |
|---|---|---|
| **AC-01** 四字段 | **满足** | 自建探针：真实 `stats` 字段集 = `{positionCount, marketValueByCurrency, lastExecutedAt, pendingRebalanceCount, drift}`；`lastExecutedAt` 原样回传入参 `Date`（`2026-01-02T03:04:05.000Z`）、无记录时 `null`（`findOne` 结果直用，未新增查询）；`pendingRebalanceCount` 整数默认 0；`drift` 非 null 含 `dueByTime`（布尔）/`overThresholdCount`（整数）。`drift===null` 三场景（无目标/无持仓/缺价）两字段均不可读（对象为 `null`，`in` 检查为 false）。计划 §11.3 与 15/15 用例佐证 |
| **AC-02** 不扩义 | **满足** | 自建探针「仅时间维度触发」同断言：`needsRebalance=false`、`triggeredThresholds=[]`、`dueByTime=true` 三项并存，`overThresholdCount=0`；既有 F-06 用例 `仅时间间隔触发不计入漂移徽标` 保留并增强（15/15）。`dueByTime` 取自 `result.triggeredThresholds.includes('timeInterval')`，`needsRebalance` 仍由 `DRIFT_THRESHOLDS`（仅绝对/相对）过滤后计算，语义零改动 |
| **AC-03** PENDING 批量 | **满足** | 自建探针：`computeSummary` 发 **1 次** `RebalanceRecord.aggregate`，pipeline = `[{$match:{status:'PENDING'}},{$group:{_id:'$portfolioId',count:{$sum:1}}}]`；构造 2 PENDING(p1)+1 PENDING(p2)+1 EXECUTED+1 REVOKED → p1=2、p2=1（EXECUTED/REVOKED 排除）；`countDocuments=0`；生产代码 `grep countDocuments shared/services/portfolio/summary.js` 仅命中注释 `:102`，无调用 |
| **AC-04** 查询预算/量纲 | **满足** | 自建探针 10 组合：`RebalanceRecord.aggregate=1` + `findOne=10` = **11（≤11）**、`countDocuments=0`、`result.length=10`；`overThresholdCount` 仅从 `evaluateThresholds.details` 派生（`detail.triggeredThresholds.length>0` 计数），**量纲反证**：构造「1 个标的（XEQT）同时触发 absolute+relative 两类、另 2 标的未超阈」→ `triggeredThresholds.length=2` 但 `overThresholdCount=1`，证实不是顶层类型数 |
| **AC-05** 测试与回归 | **满足** | 新增 5 条 AC 用例 + 既有 10 条全绿（237/237、15/15、7/7）；AC-02 三项同断言、AC-03 EXECUTED/REVOKED 排除、AC-04 查询次数断言均在 `portfolio.summary.test.js` 实跑通过 |
| **AC-06 / AC-14** cron-worker 零改动 | **满足** | `git status --porcelain -- cron-worker` 空输出；`git diff --stat <merge-base>..HEAD -- cron-worker` 空；正确范围（merge-base..HEAD）4 文件无 `cron-worker/` |
| 覆盖 Story AC-01～04 | 满足 | 见上（AC-01～04 全绿） |

### 12.4 五点重点核对（用户指定）

1. **量纲**：✅ `overThresholdCount` = `details.filter(d => d.triggeredThresholds.length>0).length`；「1 标的触发 2 类阈值」反证 `overThresholdCount=1` 而非 `2`（`triggeredThresholds.length=2`）。负向对照 NEG-A 改顶层类型数即 FAIL。
2. **AC-02 不扩义**：✅ 三项同断言并存（自建探针 + 测试文件 `:118-133`）；`dueByTime` 与 `needsRebalance` 独立来源。负向对照 NEG-C 从 `needsRebalance` 派生即 FAIL。
3. **AC-03/04 查询预算**：✅ 无 N+1，`countDocuments=0`，10 组合下 `RebalanceRecord` = 1 聚合 + 10 `findOne` = **11 ≤ 11**。负向对照 NEG-B 注入逐组合 `countDocuments` 即 FAIL（count=10）。
4. **drift===null 不可读**：✅ 三场景（无目标/无持仓/缺价）`drift` 为 `null`，`dueByTime`/`overThresholdCount` 均不出现。
5. **契约一致**：✅ `API_CONTRACT.md:87` 字段集 `{positionCount, marketValueByCurrency, lastExecutedAt, pendingRebalanceCount, drift}` 与 `buildPortfolioSummary` 真实返回及**真实 HTTP 响应**一致；`drift` 非 null 时 `{needsRebalance, triggeredThresholds, dueByTime, overThresholdCount}` 一致；文档明写「超阈标的数（非阈值类型数）」「后两字段不可读」，与实现一致。

### 12.5 负向对照记录（临时篡改 `summary.js` → 断言 FAIL → 还原 → `git status` 空）

| # | 临时缺陷 | 断言表现 | 还原 |
|---|---|---|---|
| NEG-A | `overThresholdCount: result.triggeredThresholds.length`（顶层类型数） | `① 量纲` FAIL（actual 2 / expected 1）；14/16 PASS | 备份还原，SHA256 回 `8f294728…` |
| NEG-B | `computeSummary` 中每组合 `await RebalanceRecord.countDocuments(...)` | `③ 总查询 ≤ 11 且 countDocuments = 0` FAIL（count=10） | 备份还原 |
| NEG-C | `dueByTime: driftTriggered.length > 0`（从 needsRebalance 派生） | `② AC-02 三项同断言` FAIL（dueByTime=false） | 备份还原 |

还原后自建探针回到 **16/16 PASS**，`npm run test:server` 保持 237/237；`git status --porcelain` 空（临时探针 `review065-indep.cjs` / `review065-http.cjs` 已删）。

### 12.6 Findings（编号 / 严重度 / 位置 / 修法）

| # | 严重度 | 位置 | 现象 | 修法方向 |
|---|---|---|---|---|
| F-01 | **MINOR** | `server/test/integration/portfolio.summary.test.js:315-330`（HTTP 契约测试） | 该用例 stub `computeSummary` 返回的 `stats` 仍是**旧字段集**（仅 `positionCount, marketValueByCurrency, drift{needsRebalance,triggeredThresholds}`），未在 HTTP 层断言新增四字段。契约一致性由纯函数用例 + 本人 HTTP 探针补齐，但 Implementer 自带 HTTP 用例本身不覆盖新字段 | 建议将 HTTP stub 的 `stats` 换成真实 `buildPortfolioSummary` 输出，并断言 `lastExecutedAt/pendingRebalanceCount/drift.dueByTime/drift.overThresholdCount` 出现在响应中；属测试覆盖增强，不阻塞 |
| F-02 | **MINOR** | `API_CONTRACT.md:87` vs 实际 `computeSummary` 返回 | 文档 `stats` 字段集列 5 项，实际 `computeSummary` 还带既有 `unreadAlertCount`（`summary.js:141`，CM-12 既有字段，文档从未列出）。本卡未新增该字段，非本卡引入的契约不一致 | 属既有文档欠账；如要求「字段集完全一致」，另立/顺手补 `unreadAlertCount`；不阻塞本卡 AC（用户指定的 5 项字段集一致已验证） |
| F-03 | **MINOR** | 分支基线漂移 | 指定提交 `8fde289` 已被 rebase 为 `5f807a3`（代码内容一致）；`main` 复核期间仍在前进，`main..HEAD` 会显示 `BOARD.md` 等假改动 | 以 merge-base / Implementer 自身提交判范围；合入前 rebase 最新 main 并复跑 `test:server`。非 Implementer 缺陷 |
| F-04 | MINOR | 计划 §11.6 已记录 | 未连真实 Mongo（查询次数由模型方法计数验证，非真实库 explain）；空组合列表跳过 pending 聚合；既有循环依赖 warning | 计划已如实标注，不阻塞 |

**无 BLOCKER、无 MAJOR**。`git diff --stat main..feature/TASK-065` 中一度出现的 `docs/BOARD.md` / `US-004-prompts.md` / `US-004-04-dispatch-record` 差异均为 main 前进造成的基点漂移假改动；正确范围（merge-base..HEAD）**不含** `client/`、`cron-worker/`、`server/routes/`，禁改范围满足；`thresholdChecker.js` 零改动，`DRIFT_THRESHOLDS` 未变，既有 `needsRebalance` 语义（AC-02 锁定）未改变。

### 12.7 DoD（[DEFINITION_OF_DONE.md §3](../../../os/process/DEFINITION_OF_DONE.md) T-1～T-6）

| # | 要求 | 满足 | 证据 |
|---|---|---|---|
| T-1 | 实现完成、改动清单与 Implementing 退出物证一致 | ✅ | 4 文件（plan/API_CONTRACT/test/summary.js），与计划 §10 范围一致；`git status` 干净 |
| T-2 | 验证完成（运行类记录实际结果） | ✅ | `test:server` 237/237、`portfolio.summary.test.js` 15/15、`portfolio.archived.test.js` 7/7、自建探针 16/16、HTTP 探针 1/1、3 条负向对照；静态检查（diff/grep/SHA256）记录对象与方法 |
| T-3 | AC 逐条满足 | ✅ | AC-01～06 逐条实测（§12.3/§12.4） |
| T-4 | 审查结论收敛（无 BLOCKER；MAJOR 整改或 Human 接受） | ✅ | 本 §12 独立判定 Pass with issues，无 BLOCKER/MAJOR，残余 MINOR 已记录 |
| T-5 | 文档同步 | ✅ | `API_CONTRACT.md:87` 已更新 summary 字段集与语义；plan §11 实施记录节已填、任务卡仅引用（本 §12 回填） |
| T-6 | 已知妥协已记录 | ✅ | 计划 §11.6 列 5 项（未连真实 Mongo / 空列表跳过聚合 / 循环依赖 warning 等）；本 §12 F-04 复核 |

> DoD 满足 ≠ 已合入 main；`Merged` 与 Status 推进、关闭 Task 归 Human（本审查未改 Task Status，未 `git add/commit/push`）。

### 12.8 残余风险与未验证项

- 未连接真实 Mongo：查询次数以模型方法计数验证（非真实库查询计划/explain）；`evaluateThresholds` 为真实纯函数，但 DB 聚合未在真实库执行（计划 §11.6 已声明）。
- `main` 持续前进：合入前须 rebase 最新 main 并复跑 `npm run test:server`；`docs:check`/跨模块一致性由 Human 合入前决定（DoD §4 明确不强制单任务全量回归）。
- HTTP 契约测试的 stub 未覆盖新字段（F-01）；`unreadAlertCount` 既有文档欠账（F-02）。
- 未跑 `npm test`（全 workspace）；按 AC-05 以 `npm run test:server` 为入口，既有两测试文件已单独实跑。

### 12.9 判定

**Pass with issues** —— AC-01～AC-06 / Story AC-01～04、AC-14 全部满足并经独立实跑复核：量纲（1 标的触发 2 类阈值反证）、AC-02 三项同断言、查询预算（10 组合 11 次、countDocuments=0）、drift===null 不可读、API_CONTRACT 字段集与真实 HTTP 响应一致，五点重点全部通过；237/237、15/15、7/7 全绿无回归；3 条负向对照证明断言非恒真；禁改范围（client/cron-worker/server/routes）与既有 needsRebalance 语义均守住；DoD T-1～T-6 逐条满足。**无 BLOCKER / MAJOR**；残余 4 项 MINOR（F-01 HTTP stub 覆盖、F-02 unreadAlertCount 文档、F-03 基点漂移、F-04 未连真实 Mongo），均不阻塞。

判定词不是状态，不构成合入许可。Task Status 仍 `Implementing`/`Reviewing`（登记归 Orchestrator）、`Merged` 与关闭归 Human；本 Reviewer 未改状态、未提交、未合入。

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。`Merged` 仅引用 Human 登记。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
