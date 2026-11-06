# TASK-068 — US-004 实施计划

## Status

Status：Draft

Owner：Planner（规划）→ 待 Orchestrator 登记并指派 Implementer

Related Task：[TASK-068](./TASK-068.md)；所属 [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md)。

Branch / Base：实施时从 up-to-date `main` 新建 `feature/TASK-068` 独立 worktree（沿 053/056 惯例）。规划期基线为 2026-11-05 的 `main`；目标文件 `shared/services/portfolio/summary.js`、`server/controllers/alert.controller.js`、`shared/models/alertEvent.js` 已亲读核实（见 §3）。

Approval：**未批准**。本计划覆盖 §1～§9 当前设计；`Draft → Approved` 归 Human（[STATES.md](../../../os/process/STATES.md) §4）。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task [TASK-068](./TASK-068.md) 的 §3；覆盖 US-004/AC-19。本卡只做**查询层**隐藏：删除组合后其 `AlertEvent` 不再出现在三个出口（`GET /alerts/events`、`getUnreadCount`、`summary` 的 `unreadAlertCount`），但**库里保留（不删数据、不加字段、不写迁移）**，资产级事件（`portfolioId = null`）**必须保留**。禁止只在客户端过滤。

## 2. Context

需求、任务见 [Story US-004 §3](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) 与 [FS §6.2 B16、§10 R-9、§11 HD-14](../../requirements/specs/FS-portfolio-ia-cleanup.md)。本任务需 ExecPlan：改 shared + server 查询层，三处同源（DEP-04）。

HD-14 已裁「全部隐藏」：事件保留在库（审计价值），仅查询不可见。过滤口径（Spec B16）：
```
$or: [{ portfolioId: { $in: <现存组合 ids> } }, { portfolioId: null }]
```

## 3. Repository Findings（2026-11-05 亲读 `main`，行号为现状）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | `deletePortfolioCascade` 只删 `Transaction` + `RebalanceRecord`，**不删 `AlertEvent`** → 删组合后事件 `portfolioId` 悬空 | `shared/services/portfolio/deletePortfolio.js:10-14` |
| F-02 | 出口 ① `getEvents`：`AlertEvent.countDocuments(filter)` + `AlertEvent.find(filter)`（`:229-232`），filter 无「组合存在」条件 | `server/controllers/alert.controller.js:209-237` |
| F-03 | 出口 ② `getUnreadCount`：`AlertEvent.countDocuments({status:'unread'})`（`:241`），无组合存在条件 | `server/controllers/alert.controller.js:239-246` |
| F-04 | 出口 ③ `computeSummary` 的 `unreadAgg`：`$match: {status:'unread', portfolioId:{$ne:null}}` + `$group by portfolioId`（`:83-87`） | `shared/services/portfolio/summary.js:83-87` |
| F-05 | 资产级事件 `portfolioId = null`（规则 `scope='asset'` 无组合）必须保留 | `shared/models/alertEvent.js:12-16`、`alertEngine.service.js` |
| F-06 | `AlertEvent` 索引 `{portfolioId:1, status:1}`（`:40`）——`$in` 过滤可走索引 | `shared/models/alertEvent.js:40` |

## 4. Proposed Design

1. **共享查询层辅助（新）`shared/services/alertVisibility.js`**（或并入既有 `alertEngine.service.js` 导出，实施时二选一，优先独立文件避免耦合）：
   - `async function getVisiblePortfolioIds()`：`Portfolio.find({}, {_id:1}).lean()` 取现存组合 id 集合（组合数量级为个位数，全量内存集合可接受）。
   - `function visibleAlertFilter(ids)`：返回 `{ $or: [{ portfolioId: { $in: ids } }, { portfolioId: null }] }`。
   - 三处出口复用此单一来源，**禁止**各写一遍导致口径漂移。

2. **出口 ① `getEvents`**：在现有用户 filter 基础上 **`$and`** 上 `visibleAlertFilter`（`filter` 由 `{}` 改为 `{ $and: [userFilter, visibleFilter] }`；用户 filter 为空时等价于仅 `visibleFilter`）。注意：用户显式传 `portfolioId` 查询时，若该组合已被删除，`$and` 后自然无结果（正确行为）。

3. **出口 ② `getUnreadCount`**：`countDocuments({ status:'unread', $or: [...visibleFilter] })`——与出口 ① 同源。注意全局未读计数（Dashboard 顶部徽标）由此出口驱动，删组合后其事件随之减计（对应 AC-19 ②「全站未读计数减 3」）。

4. **出口 ③ `summary.js` 的 `unreadAgg`**：`$match` 增加组合可见性条件：
   ```js
   const visibleIds = await getVisiblePortfolioIds();
   const visibleFilter = { $or: [{ portfolioId: { $in: visibleIds } }, { portfolioId: null }] };
   const unreadAgg = await AlertEvent.aggregate([
     { $match: { status: 'unread', ...visibleFilter } },   // $or 展开进 $match
     { $group: { _id: '$portfolioId', count: { $sum: 1 } } }
   ]);
   ```
   - 注意与 TASK-065 同改 `summary.js`，需协调合并顺序（见 §6）。

5. **零改动红线**：不改模型 / 不写迁移 / 不物理删除 `AlertEvent` / 不新增字段 / 不新增端点；**禁止客户端兜底过滤**。

## 5. Work Breakdown

- [ ] W1：新增 `alertVisibility` 共享辅助（`getVisiblePortfolioIds` + `visibleAlertFilter`），单测覆盖「现存组合 + 资产级 + 已删组合」三态。
- [ ] W2：出口 ③ `summary.js` `unreadAgg` 加过滤（与 TASK-065 合并顺序协调）。
- [ ] W3：出口 ① `getEvents` 与出口 ② `getUnreadCount` 加过滤。
- [ ] W4：测试补齐（§7）：AC-19 的 ①～④ 全断言（删后 3 条消失 + 资产级 1 条保留 + 其它组合 unread 不变 + 全站减 3 + 库中 3 条仍存在 + 负向对照未删时一致）。
- [ ] W5：全量回归 `npm run test:server`；确认 `portfolio.archived.test.js` 与 alert 集成测试不回归。

## 6. Decisions

| 项 | 结果 | 依据 |
|---|---|---|
| 隐藏语义 | 查询层「隐藏」，不物理删除 | HD-14 / R-9 |
| 资产级事件 | `portfolioId = null` 必须保留 | Spec B16 |
| 过滤落点 | 三处出口同源（共享辅助），禁止客户端过滤 | Spec B16 |
| 与 TASK-065 合并顺序 | 同改 `summary.js`；建议 **065 先合入，068 再在其上叠加**（068 的 `unreadAgg` 改动依赖 065 的 `pendingAgg` 上下文），或由 Orchestrator 指定顺序并在 ExecPlan 内注明 | 本计划假设 065 先行 |

无待 Human 新决事项（HD-14 已裁，本卡只落实）。

## 7. Verification

| Task AC | 验证方法 | 预期结果 |
|---|---|---|
| AC-01（删后 3 条消失 + 资产级保留） | 构造组合 A 3 条未读 + 1 条资产级，删 A 后 `GET /alerts/events` | 不返回那 3 条、仍返回资产级 1 条 |
| AC-02（summary/全站计数） | 同上场景查 `summary` 与 `getUnreadCount` | 其它组合 `unreadAlertCount` 不变、全站未读减 3 |
| AC-03（库中保留） | `AlertEvent.countDocuments({portfolioId: A})` | 仍为 3（隐藏非删除） |
| AC-04（负向对照） | 未删除时三处计数 | 三处一致 |
| AC-05（查询层 + 资产级） | 代码审查 + 用例 | 过滤在服务端三处，`portfolioId=null` 始终保留 |
| AC-06（回归） | `npm run test:server` | 全绿 |
| AC-07（cron-worker 零改动） | `git status cron-worker` 空输出（对应 Story AC-14，G-1 补） | 空输出，改动范围不触达 `cron-worker/` |

命令入口见 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md)。**不写测试数量**。

## 8. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 三处漏一处：只改列表、漏 summary/未读计数 | AC-01～AC-04 三处联合断言；共享辅助单一来源 |
| R-2 | 资产级事件误隐藏：`$or` 写错排除 `portfolioId=null` | 过滤必须含 `{portfolioId:null}` 分支；AC-01 断言资产级保留 |
| R-3 | 与 TASK-065 同改 `summary.js` 冲突 | §6 明确合并顺序；ExecPlan 内注明 |

## 9. Rollback

无 schema 变更、无迁移、无数据写入；回退 = `git revert` 该次提交。已隐藏事件在回退后重新可见（无数据损失）。唯一注意：若 065 先行合入，068 的回退不应影响 065 的 `pendingAgg`。

## 10. Implementer Handoff

- **输入**：本计划 §4 设计 + [TASK-068](./TASK-068.md) §3 AC + [FS §6.2 B16、§10 R-9、§11 HD-14](../../requirements/specs/FS-portfolio-ia-cleanup.md)。
- **范围与禁改**：只改 `shared/services/portfolio/summary.js`、`server/controllers/alert.controller.js`、新增 `shared/services/alertVisibility.js`（或等价）+ 测试；**禁改**模型/迁移/客户端。
- **授权**：须 Human 批准本计划后实施。
- **依赖**：与 TASK-065 同改 `summary.js`，需协调合并顺序（见 §6）。
- **预期产出**：三处查询层过滤 + 测试全绿。
- **停止条件**：若实际代码与 §3 Findings 不符，停下上报。
- **验证入口**：`npm run test:server`。

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
