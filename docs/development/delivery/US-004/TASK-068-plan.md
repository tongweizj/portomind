# TASK-068 — US-004 实施计划

## Status

Status：Approved（2026-11-06，Human 批准当前设计）

Owner：Planner（规划）→ Implementer（2026-11-06 指派）

Related Task：[TASK-068](./TASK-068.md)；所属 [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md)。

Branch / Base：实施时从 up-to-date `main` 新建 `feature/TASK-068` 独立 worktree（沿 053/056 惯例）。规划期基线为 2026-11-05 的 `main`；**2026-11-06 复核**：TASK-065 已合入 `main`（merge `6f556aa`），`summary.js` 行号已变——`unreadAgg` 现为 `:96-99`、`pendingAgg` 为 `:105-108`、`unreadByPortfolio` 透传为 `:141`（以符号名 `unreadAgg` / `AlertEvent.aggregate` 为准，行号仅参考）。`alert.controller.js` 的 `getEvents`/`getUnreadCount` 行号未变（`:209` / `:239`）。

Approval：**2026-11-06，Human 明确「批准」当前设计**（Orchestrator 核对时本文件仍为 `Draft`、Approval 段写「未批准」；经 Human 当面确认后由 Orchestrator 据其决定登记，**不是自行批准**）。批准覆盖 §1～§9 当前设计，不含其他任务。前置已满足：TASK-065 已合入 `main`（`6f556aa`），`summary.js` 同改冲突解除。

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
| F-04 | 出口 ③ `computeSummary` 的 `unreadAgg`：`$match: {status:'unread', portfolioId:{$ne:null}}` + `$group by portfolioId`（**065 合入后现为 `summary.js:96-99`**，符号名 `unreadAgg` 不变） | `shared/services/portfolio/summary.js:96-99` |
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

**状态：** 实施完成（2026-11-06）。Task Status 保持 `Implementing`（未改 Reviewing/Completed，权限归 Orchestrator/Human）；计划 Status 保持 `Approved`，未改 AC/Scope。

### 11.1 环境

| 项 | 实际值 |
|---|---|
| Worktree | `D:\projects\portomind-068` |
| Branch / Base | `feature/TASK-068` / `main @ 96ff382`（已从登记提交 `5083429` fast-forward 到最新 main） |
| Node / npm | `v24.20.0` / `12.2.1`；worktree 无 `node_modules`，已 `npm ci`（隔离安装） |
| 禁改面 | 未改 `client/`、`cron-worker/`、模型、迁移；未物理删除 `AlertEvent` |

### 11.2 改动文件与 SHA256

| 文件 | 变化 | SHA256 |
|---|---|---|
| `shared/services/alertVisibility.js` | 新增：`getVisiblePortfolioIds` + `visibleAlertFilter` 单一来源 | `640565f5b8e6968d575194f7bee6d0b0e664c6d90e21e6bddf030c53c02859bc` |
| `shared/services/portfolio/summary.js` | `unreadAgg` 的 `$match` 加入组合可见性 | `d4705d748bf5656a4ff9e5ef7b29825e8d652d630c30926f5480b4883185c658` |
| `server/controllers/alert.controller.js` | `getEvents` / `getUnreadCount` 加同源过滤 | `7914678c3a9ccd491c0e7dc2008cc4f6419ea06fbd18afffcff067e25c359e14` |
| `server/test/integration/alert.api.test.js` | 过滤形状 + 删除组合/资产级保留用例 | `5615fa7bf8e6e194cbdd07cbda6ecc0e855a6d67494f337a5df470a80bbfd76c` |
| `server/test/integration/portfolio.summary.test.js` | summary unreadAgg 可见性断言；`Portfolio.find` stub 兼容 helper 的 `.lean()` | `30a1ed2b963cc84060d3399d5b5566ab1d62158d2e8fb8a058458bae1c1a0743` |
| `server/test/integration/portfolio.archived.test.js` | 既有 `Portfolio.find` stub 补 `.lean()`（不弱化断言） | `ea6e48ee871d1fa6b3bed940f74124d7ca33a48603fc028aeecbf5d456c54897` |

### 11.3 AC-01～AC-07 实测结果

| AC | 结果 | 证据 |
|---|---|---|
| AC-01 删 A 后列表隐藏、资产级保留 | **PASS** | 构造 A 3 条未读 + B 1 条未读 + 资产级 1 条；`Portfolio.find` 在删 A 后只返回 B；`GET /alerts/events` 从 5 条降为 **2 条**（B + 资产级），A 三条不返回；资产级 `portfolioId:null` 仍返回 |
| AC-02 summary/全站计数 | **PASS** | 同一场景全站未读 **5 → 2**（减 3）；summary 测试在 A 存在/删除两态下 B 的 `unreadAlertCount` 都保持 **1**，A 删除后不再出现；`unreadAgg` 的 `$match` 两态分别含 `$in:[A,B]` / `$in:[B]` + `null` 分支 |
| AC-03 库中保留（隐藏非删除） | **PASS** | 删除后直接 `AlertEvent.countDocuments({portfolioId:A}) === 3`；生产 `deletePortfolioCascade` 未改，无 AlertEvent 删除逻辑；测试夹具中的 A 事件始终在 `allEvents` |
| AC-04 负向对照（未删时三处一致） | **PASS** | 删除前列表 **5**、全局未读 **5**；删除后 **2 / 2**；资产级始终保留 |
| AC-05 查询层三处同源 | **PASS** | `shared/services/alertVisibility.js` 被 controller 两出口与 summary 共用；controller 过滤为 `{ $and: [userFilter, visibleAlertFilter] }`，summary 为 `$match: { status:'unread', ...visibleFilter }`；无客户端过滤改动 |
| AC-06 不改模型/不迁移/全绿 | **PASS** | 未改 `alertEvent` 模型、无迁移、无物理删除；`npm run test:server` **239/239 pass** |
| AC-07 cron-worker 零改动 | **PASS** | `git status --porcelain -- cron-worker` 空输出 |

**实际命令输出：**

```text
npm run test:server
ℹ tests 239
ℹ pass 239
ℹ fail 0

node --test test/integration/alert.api.test.js
ℹ tests 11
ℹ pass 11
ℹ fail 0

node --test test/integration/portfolio.summary.test.js test/integration/portfolio.archived.test.js
ℹ tests 23
ℹ pass 23
ℹ fail 0
```

### 11.4 查询与过滤形状

- 可见组合：`Portfolio.find({}, { _id: 1 }).lean()`（组合数量级个位数；归档组合仍算现存，仅删除组合消失）。
- 共享条件：`{ $or: [{ portfolioId: { $in: ids } }, { portfolioId: null }] }`。
- `getEvents`：`{ $and: [userFilter, visibleFilter] }`；数量与列表共用同一 filter。
- `getUnreadCount`：`{ status:'unread', ...visibleFilter }`。
- `summary`：`AlertEvent.aggregate([{ $match: { status:'unread', ...visibleFilter } }, { $group by portfolioId }])`；资产级 null 组不会匹配到具体组合，但事件本身不被过滤。

### 11.5 已知妥协与未验证项

1. **测试使用 mock/内存过滤，不连真实 Mongo**：AC-01～04 的删除场景通过 mock `Portfolio.find` 与内存 AlertEvent 过滤器验证，不是真实库删除事务；AC-03 的“库中仍存在”用同一内存集合计数。真实代码未增加删除逻辑，模型/迁移未动。
2. `getEvents` 现在即使无用户筛选也使用 `$and: [{}, visibleFilter]`；语义等价，保留统一形状。
3. 为适配 `getVisiblePortfolioIds` 的 `.lean()` 查询，修改了 `portfolio.summary.test.js` / `portfolio.archived.test.js` 中既有 `Portfolio.find` stub（增加 `lean`）；断言未弱化，回归全绿。
4. 未更新 `API_CONTRACT.md`（本卡 Scope 未列、计划留给 TASK-069 收尾）；三出口行为已在测试中验证。
5. 未连真实库/未跑全 workspace `npm test`；按本卡验证入口运行 `npm run test:server`。

### 11.6 交付状态

实现、单测、AC-01～07 验证完成；待 Orchestrator 登记 Reviewing 并安排独立 Reviewer。Task Status / Merged 未改。

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
