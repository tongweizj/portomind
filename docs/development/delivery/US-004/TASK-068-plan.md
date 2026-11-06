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
| Branch / Base | `feature/TASK-068`；初始基线 `main @ 96ff382`，2026-11-06 已 `git merge main` 到 `ca351b4`（无冲突） |
| Node / npm | `v24.20.0` / `12.2.1`；worktree 无 `node_modules`，已 `npm ci`（隔离安装） |
| 禁改面 | 未改 `client/`、`cron-worker/`、模型、迁移；未物理删除 `AlertEvent` |

### 11.2 改动文件与 SHA256

| 文件 | 变化 | SHA256 |
|---|---|---|
| `shared/services/alertVisibility.js` | 新增：`getVisiblePortfolioIds` + `visibleAlertFilter` 单一来源 | `640565f5b8e6968d575194f7bee6d0b0e664c6d90e21e6bddf030c53c02859bc` |
| `shared/services/portfolio/summary.js` | `unreadAgg` 的 `$match` 加入组合可见性 | `0410bfce3a330059cc696f317f53f2a83288b0127b3f28f52b6dadee2705c6f4` |
| `server/controllers/alert.controller.js` | `getEvents` / `getUnreadCount` 加同源过滤 | `d654884f3979d61fa25a6f4710bd44e08ac3442e96a2e4049203577ab3cd19cb` |
| `server/test/integration/alert.api.test.js` | 过滤形状 + 删除组合/资产级保留用例 | `2ec35541c80fb0428f281f21c438c34a54468f52f16d442216496ed814ea95f3` |
| `server/test/integration/portfolio.summary.test.js` | summary unreadAgg 可见性断言；`Portfolio.find` stub 兼容 helper 的 `.lean()` | `38691ce49ab8fdf3f012dad8d3ae42992de1ca140c40d4526f2a43995ee6f95f` |
| `server/test/integration/portfolio.archived.test.js` | 既有 `Portfolio.find` stub 补 `.lean()`（不弱化断言） | `4a819088aa5ff258fc27226eae157de70ca343a49b2bdf599c5af7dce6d172d9` |

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

实现、单测、AC-01～07 验证完成；Reviewer 二轮复检已记录（§12.11 `Pass with issues`，F-01/F-02 解决）。Task Status / Merged 未改，交 Orchestrator/Human 安排后续。

### 11.7 Reviewer Fail 返工（2026-11-06）

Reviewer 首轮判定 **Fail**：F-01（BLOCKER，资产级事件 null 组导致 summary 500）、F-02（MAJOR，AC-03 测试无法证伪物理删除）。本轮修复如下：

- **F-01 修复**：`unreadAgg` 仍使用三出口同源的 `visibleFilter`（含 `portfolioId:null`），但在构造 `unreadByPortfolio` 前过滤 `item._id != null`，与既有 `pendingByPortfolio` 的守卫对齐；资产级事件不再触发 `null.toString()`，summary 不会 500。
- **F-01 回归测试**：`portfolio.summary.test.js` 的 `AlertEvent.aggregate` stub 返回 `[{_id:B,count:1},{_id:null,count:1}]`；删除 A 前后均能正常计算 B 的 `unreadAlertCount=1`。负向对照：移除 null 过滤后该用例立即 `TypeError: Cannot read properties of null (reading 'toString')`。
- **F-02 修复**：新增 `deletePortfolioCascade` 契约测试（`alert.api.test.js`）：mock `Portfolio.findById/findByIdAndDelete`、`Transaction.deleteMany`、`RebalanceRecord.deleteMany`，并拦截 `AlertEvent.deleteMany/deleteOne/findByIdAndDelete`；断言级联只删交易/再平衡记录、`AlertEvent` 调用为 **0**。
- **F-02 负向对照**：在 `deletePortfolioCascade` 临时加入 `AlertEvent.deleteMany` 后，该契约测试 FAIL（`actual: ['deleteMany']` / `expected: []`）；还原后 PASS。F-03（内存过滤求值器、未连真实 Mongo）仍按 Reviewer 记录保留，不阻塞。

返工后实际输出：

```text
npm run test:server
ℹ tests 240
ℹ pass 240
ℹ fail 0

node --test test/integration/alert.api.test.js
ℹ tests 12
ℹ pass 12
ℹ fail 0

node --test test/integration/portfolio.summary.test.js test/integration/portfolio.archived.test.js
ℹ tests 23
ℹ pass 23
ℹ fail 0
```

`git status --porcelain -- cron-worker` 仍为空；未改模型/迁移/客户端，未 merge main、未填 Merged。等待 Reviewer 复检。


### 11.8 返工后交付核对（2026-11-06）

| 项 | 值 |
|---|---|
| 当前分支 HEAD | **`bc080f9`**（`Merge branch 'main' into feature/TASK-068`） |
| 实现提交 | **`3226dd4`**（F-01/F-02 修复；内容哈希见 §11.2） |
| 审查记录提交 | **`92c1b91`**（保留首轮 §12 Fail 与 Reviewer 二轮 §12.11，内容未由实现方改写） |
| main 合入基线 | `ca351b4`；`git merge main` 成功、**无冲突**；未 merge 到 main |
| 与 main 关系 | `main` 是 HEAD 祖先；分支包含 main 上的 066/067 文档，无代码漂移 |
| 验证 | `npm run test:server` **240/240 pass**；`docs:check` 0 ERROR；`git status --porcelain -- cron-worker` 空 |
| 代码改动 | 自 `3226dd4` 后无新业务代码改动；本轮仅更新 §11 交付记录 |
| 未决 findings | F-03（MINOR，测试使用内存 mock/未连真实 Mongo）、F-04/F-05（Reviewer 记录的流程与哈希口径，见 §12）保留；首轮 F-01/F-02 已修复 |
| 合入状态 | **未合入 main、未填 Merged**；等待 Orchestrator/Human 按流程复检与合入 |

本轮未改 AC/Scope/Task Status，未创建空提交；§12 审查原文（含首轮 Fail 与 Reviewer 二轮记录）保持原样。

## 12. Review Record

（2026-11-06，按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。以下为独立 Reviewer 复核记录。）

### 12.1 审查对象与基线

| 项 | 值 |
|---|---|
| Worktree | `D:/projects/portomind-068` |
| 分支 / SHA | `feature/TASK-068` @ `9c8c808`（单提交 `feat(TASK-068)`，正文含 TASK-068） |
| 被审基线 | `96ff382`（卡面指定；已核实为 `main` 祖先。注：`main` 现已推进到 `db18263`，`git diff --stat main..HEAD` 为 9 文件（含 main 后续 docs 反向差异），审查范围以 `96ff382..HEAD` 的 7 文件为准） |
| 工作区状态 | `git status --porcelain` 空（审查前后各验一次；负向对照突变全部还原并证净） |
| 范围 | 7 文件 +247/−13：`shared/services/alertVisibility.js`（新增 39 行）、`shared/services/portfolio/summary.js`、`server/controllers/alert.controller.js`、3 份测试、本计划 §11 |
| 越界 | `git diff --stat 96ff382..HEAD -- client/ cron-worker/` 空；`git status --porcelain -- cron-worker/` 空；模型/路由/迁移零改动（`git diff --name-only` 无 model/route/migrat 命中） |
| 未审部分 | 无（7 文件全部亲读；client/、cron-worker/ 按禁改面核对未改动） |

### 12.2 被审文件 SHA256（Reviewer 独立计算 @ `9c8c808`，工作区原始字节口径）

| 文件 | SHA256 |
|---|---|
| `shared/services/alertVisibility.js` | `640565f5b8e6968d575194f7bee6d0b0e664c6d90e21e6bddf030c53c02859bc` |
| `shared/services/portfolio/summary.js` | `d4705d748bf5656a4ff9e5ef7b29825e8d652d630c30926f5480b4883185c658` |
| `server/controllers/alert.controller.js` | `d654884f3979d61fa25a6f4710bd44e08ac3442e96a2e4049203577ab3cd19cb` |
| `server/test/integration/alert.api.test.js` | `5615fa7bf8e6e194cbdd07cbda6ecc0e855a6d67494f337a5df470a80bbfd76c` |
| `server/test/integration/portfolio.summary.test.js` | `30a1ed2b963cc84060d3399d5b5566ab1d62158d2e8fb8a058458bae1c1a0743` |
| `server/test/integration/portfolio.archived.test.js` | `4a819088aa5ff258fc27226eae157de70ca343a49b2bdf599c5af7dce6d172d9` |

> **注（2026-11-06 二轮复检补记）**：本表是首轮 @ `9c8c808` 的 Reviewer 实测原值。返工提交 `3226dd4` 曾把其中 4 个值改写为返工后工作区字节哈希（`4943a57b`/`8a71df85`/`2ecc1094`/`434b6eb5`），Reviewer 复检时已恢复原值——审查记录归 Reviewer 所有，实现方不得改写（见 F-04）。返工后版本的哈希见 §12.11；哈希口径问题见 F-05。

### 12.3 AC 逐条判定

| AC | 判定 | Reviewer 实测证据 |
|---|---|---|
| AC-01 删 A 后列表隐藏、资产级保留 | **满足** | 亲读 `getEvents`：`{$and:[userFilter, visibleAlertFilter]}`，`$or` 含 `{portfolioId:null}` 分支；NC-3（去掉 null 分支）→ 资产级保留断言 FAIL，证明断言有牙。删除场景测试证据与代码路径一致（`getEvents` 不经过 F-01 崩溃点） |
| AC-02 summary/全站计数 | **不满足（BLOCKER F-01）** | 全站未读部分满足（`getUnreadCount` 过滤正确，删 A 后 5→2 断言成立）；但 summary 出口在「存在未读资产级事件」时 `computeSummary` 抛 `TypeError: Cannot read properties of null (reading 'toString')`（P1 探针亲跑），`GET /api/portfolios/summary` 500，「其它组合 unreadAlertCount 不变」运行时不成立。测试全绿是因 `AlertEvent.aggregate` stub 未回 `{_id:null}` 样本 |
| AC-03 隐藏≠删除（库中保留） | **满足（静态证据）；测试覆盖不足见 F-02** | 亲读 `deletePortfolioCascade`：仍只删 Transaction + RebalanceRecord；全库 grep 无任何 AlertEvent 删除调用；无迁移、无模型字段变更。NC-2b 证明断言在存储层有效（actual 0 / expected 3 FAIL）；但 NC-2a 证明物理删除实现下 34/34 全绿（F-02） |
| AC-04 未删除时三处一致 | **满足** | 删除前列表 5 / 全局未读 5 / summary B=1 断言均在；NC-4（只查已删组合）→ 未删除场景断言 FAIL，证明负向对照有效 |
| AC-05 查询层三处同源 | **满足（同源与保留达成）；出口③复用缺陷见 F-01** | 独立 grep：过滤字面量 `{portfolioId:null}` / `$in` 唯一存在于 `alertVisibility.js`；controller（`@portomind/shared/services/alertVisibility`）与 summary（`../alertVisibility`）require 同一文件，无复制。`getVisiblePortfolioIds` 每出口恰一次查询；`visibleAlertFilter` 纯函数（不改入参、无请求上下文）。NC-1 证明任一出口漏过滤可被断言捕获 |
| AC-06 不删数据/不加字段/不迁移/测试全绿 | **满足（形式）** | Reviewer 亲跑 `npm run test:server`：**239 tests / 239 pass / 0 fail**。模型、迁移零改动。注：全绿≠行为正确——F-01 从测试盲区逃逸（见 F-01 证据） |
| AC-07 cron-worker 零改动 | **满足** | `git status --porcelain -- cron-worker/` 空；`git diff --stat 96ff382..HEAD -- client/ cron-worker/` 空 |

### 12.4 Findings

**F-01 · BLOCKER · `shared/services/portfolio/summary.js:100-104`（`$match` 聚合可见过滤 + `:104` 映射）· 对应 AC-02（兼 AC-05 出口③）**

- 现象：`unreadAgg` 的 `$match` 改为 `{status:'unread', ...visibleFilter}` 后**包含** `{portfolioId: null}` 分支，Mongo `$group: {_id:'$portfolioId'}` 对资产级事件产出 `{_id: null}` 组，`:104` `unreadAgg.map(item => [item._id.toString(), ...])` 对 null 取 `toString()` → `TypeError: Cannot read properties of null (reading 'toString')`。凡库中存在**任一未读资产级事件**（AC-01 场景自身、生产常态），`GET /api/portfolios/summary` 500。旧代码 `$match` 有 `portfolioId:{$ne:null}` 保护，本卡移除保护后未加守卫——065 的 `pendingByPortfolio`（`:115`）有 `item._id != null` 守卫，`unreadByPortfolio` 没有。
- 证据：P1 探针（模拟 Mongo `$group` 语义）——`with-asset-level` → `CRASH TypeError: Cannot read properties of null (reading 'toString')`（exit 2）；`no-asset-level` 对照组 → `NO_CRASH`，映射正常。探针脚本为临时件，已删除。
- 修法方向（二选一）：① `unreadByPortfolio` 映射前过滤 null 组（`item._id != null`，与 `:115` 守卫对齐）；② `unreadAgg` 的 `$match` 在可见过滤之上叠加 `portfolioId: {$ne: null}`（按组合分组无需资产级，注意此时 `portfolio.summary.test.js` 对 `$match` 形状的 deepEqual 断言需同步调整）。**并**将 `AlertEvent.aggregate` stub 补 `{_id: null, count}` 样本，堵住本盲区。
- 处置：Implementer 修复后 Reviewer 复检；BLOCKER 解决前不得据此通过或合入。

**F-02 · MAJOR · `server/test/integration/alert.api.test.js`（AC-03 断言）· 对应 AC-03**

- 现象：「隐藏≠删除」的运行断言 `AlertEvent.countDocuments({portfolioId:A})===3` 走测试自建 stub（`matchesFilter` 内存过滤），删除动作（`visiblePortfolios` 缩减）不经过任何实现代码路径，断言无法证伪「物理删除」实现。NC-2a：`deletePortfolioCascade` 增加 `AlertEvent.deleteMany({portfolioId})`（物理删除实现）后 **34/34 仍全绿**。
- 证据：NC-2a 全绿 + NC-2b（夹具模拟存储层删除 → 断言 FAIL，actual 0 / expected 3）。AC-03 当前实际保障来自静态核查（`deletePortfolioCascade` 未改、全库无 AlertEvent 删除调用、无迁移）。
- 修法方向：补 `deletePortfolioCascade` 契约测试（断言其不触碰 `AlertEvent`），或把删除动作接入被测路径。
- 处置：整改或由 Human 明确接受并记录（REVIEWER §5.2）。

**F-03 · MINOR · `server/test/integration/alert.api.test.js`（`matchesFilter` 测试内迷你过滤求值器）· 对应 AC-01~04**

- 现象：过滤语义由测试自写的 `matchesFilter` 复刻（`$and`/`$or`/`$in`/null 分支），与 Mongo 真实求值存在偏差风险；全部删除场景证据来自 mock/内存，未连真实库（实施 §11.5 已如实声明）。
- 修法方向：后续以真实库或 mongodb-memory-server 覆盖三出口集成行为。
- 处置：记录，不阻塞。

### 12.5 负向对照记录（全部在被审副本突变→跑→`git checkout --` 还原→`git status --porcelain` 证净）

| # | 对照（突变） | 对应 | 结果 |
|---|---|---|---|
| P1 | 探针：`AlertEvent.aggregate` 忠实返回 `{_id:null}` 组 | F-01 | `with-asset-level` → **CRASH TypeError**；`no-asset-level` 对照 → NO_CRASH ✅ 复现崩溃 |
| NC-1 | `getUnreadCount` 去掉 `visibleAlertFilter` | AC-05/① | alert.api **1 FAIL**（删后 unread 期望 2 实际 5）→ 「列表 2 / 角标 5」不一致**可被捕获** ✅ |
| NC-3 | `visibleAlertFilter` 去掉 `{portfolioId:null}` 分支 | AC-01/③ | alert.api + summary **3 FAIL**（资产级保留 + pipeline 形状）→ 资产级误伤**可被捕获** ✅ |
| NC-4 | `$in`→`$nin`（只查已删组合） | AC-04/④ | alert.api **2 FAIL**（含删除前 5/5 一致性）→ 未删除场景**可被捕获** ✅ |
| NC-2a | `deletePortfolioCascade` 加 `AlertEvent.deleteMany`（物理删除） | AC-03/② | **34/34 仍全绿** ✗ → 断言不能证伪物理删除 → **F-02** |
| NC-2b | 夹具模拟存储层删除 A 的 3 条 | AC-03/② | AC-03 断言 **FAIL**（actual 0 / expected 3）→ 断言在存储层有效，但测试面无删除路径可触发 |
| NC-5 | `pendingAgg` `$match` PENDING→EXECUTED | 065 回归 | 065 的 AC-03 断言 **FAIL** → 065 断言未弱化、仍有牙 ✅ |

还原证明：每轮 `git checkout -- <file>` 后 `git status --porcelain` 空（`STATUS-EMPTY`）；全部对照结束后三测试文件复跑 **34/34 pass**；临时探针/备份已删除。

### 12.6 三处同源的独立结论

1. **同源成立**：过滤条件唯一字面量在 `shared/services/alertVisibility.js`；`getEvents`/`getUnreadCount`（controller）与 `unreadAgg`（summary）均 require 同一文件（包名与包内相对路径指向同一模块），**无各自复制的过滤条件**（独立 grep 证实）。
2. **口径一致性**：出口①②复用正确；出口③同源但**未做 group 语义适配**（null 分支进 `$group` → F-01）。「同源」达成 ≠ 「同用」正确，这是本卡最核心风险的实态。
3. **测试能否捕获漏口**：能——NC-1 证明单出口漏过滤会被断言捕获；但 summary 测试的 `aggregate` stub 缺 `{_id:null}` 样本，对 F-01 型缺陷**盲**。

### 12.7 065 回归结论（`summary.js` 为 065 同改文件）

- diff 仅触及 `unreadAgg`（`$match` 两行 + 注释）与顶部 require；`pendingAgg`、`unreadByPortfolio` 取数逻辑及四字段（`lastExecutedAt`/`pendingRebalanceCount`/`dueByTime`/`overThresholdCount`）**零改动**。
- 基线 239/239 含 065 的 AC-01/AC-03/AC-04 测试全绿；NC-5 证明其断言未弱化。
- `.lean()` stub 调整经 diff 逐行核对为**加法适配**（仅 stub 链补 `lean`，断言行零改动），非弱化。
- 但 068 在 065 之上叠加引入 F-01 新崩溃（065 基线无此问题——旧 `$match` 的 `$ne:null` 是保护），属 068 的回归、非 065 的破坏。

### 12.8 残余风险与未验证项

1. 未连真实 MongoDB：三出口行为证据全部来自 mock/内存过滤（实施 §11.5 已声明）；F-01 以探针模拟 Mongo `$group` 语义复现，未跑真实库端到端复现。
2. `main` 已由 `96ff382` 推进至 `db18263`：本次审查以卡面基线 `96ff382` 为准；合入前需 rebase 并确认与 main 新增改动（含主 worktree 中 3 个并行会话的未提交 docs 修改，非本审查产物）无冲突。
3. `API_CONTRACT.md` 未更新（实施 §11.5 声明留给 TASK-069）：文档与实现暂不一致，已知项。
4. `getEvents` 无用户筛选时仍构造 `$and:[{}, visibleFilter]`：语义等价，实施已声明，无行为风险。
5. 未跑全 workspace `npm test`（本卡验证入口为 `npm run test:server`，已亲跑）。

### 12.9 独立性声明

本会话为独立 Reviewer，**未参与实现、未参与验收脚本编写**；§12.3/12.5 全部证据为本轮亲跑/亲读。审查过程未修改任何业务代码与测试；负向对照突变均已还原并证净；未 git add/commit/push；未改 Task Status。临时探针已声明用途且已删除（TESTING.md「临时探针不充当持续验证入口」）。

### 12.10 最终判定

**Fail** —— 存在 BLOCKER（F-01：存在未读资产级事件时 summary 出口崩溃，AC-02 运行时不满足）；另有 MAJOR F-02（AC-03 测试无法证伪物理删除，现靠静态证据支撑）与 MINOR F-03。按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §5.1/§5.2：BLOCKER 必须解决后复检，不得据此通过或合入；MAJOR 须整改或由 Human 明确接受。判定词不是 Status，Task 状态未改。

### 12.11 复检记录（2026-11-06，Reviewer 二轮，针对返工提交 `3226dd4`）

**审查对象与基线**：`feature/TASK-068` @ **`3226dd4`**（`fix(TASK-068)`：F-01 守卫 + F-02 契约测试 + 回归样本 + §11.7 返工记录）；基线 `96ff382`；工作区 `git status --porcelain` 空。返工 diff 共 4 文件（本计划 §11、`alert.api.test.js` +26、`portfolio.summary.test.js` ±3、`summary.js` +8/−1）。越界复核：`git diff --stat 96ff382..HEAD -- client/ cron-worker/ shared/models/ server/routes/` 空；**`alertVisibility.js` 仓库内容零改动**（blob sha256 `640565f5` 不变，三出口过滤源未动）；AC/Scope/§12 判定原文未被改动。

**返工后内容口径 SHA256**（`git show 3226dd4:<path> | sha256sum`，可复现口径；工作区字节口径存在换行符漂移，见 F-05）：

| 文件 | SHA256（内容口径） |
|---|---|
| `shared/services/alertVisibility.js` | `640565f5b8e6968d575194f7bee6d0b0e664c6d90e21e6bddf030c53c02859bc`（未变） |
| `shared/services/portfolio/summary.js` | `0410bfce3a330059cc696f317f53f2a83288b0127b3f28f52b6dadee2705c6f4` |
| `server/controllers/alert.controller.js` | `d654884f3979d61fa25a6f4710bd44e08ac3442e96a2e4049203577ab3cd19cb`（未变） |
| `server/test/integration/alert.api.test.js` | `2ec35541c80fb0428f281f21c438c34a54468f52f16d442216496ed814ea95f3` |
| `server/test/integration/portfolio.summary.test.js` | `38691ce49ab8fdf3f012dad8d3ae42992de1ca140c40d4526f2a43995ee6f95f` |
| `server/test/integration/portfolio.archived.test.js` | `4a819088aa5ff258fc27226eae157de70ca343a49b2bdf599c5af7dce6d172d9`（未变） |
| `shared/services/portfolio/deletePortfolio.js` | `f14bcc88b2c9cbb5c415ce5cf2e692e5f254cbeb7058c19fa728092007a8e908`（未变） |

**F-01 复检：已解决 ✅**

- 修复：`unreadByPortfolio` 映射前 `.filter(item => item && item._id != null)`（与 `pendingByPortfolio` 的 `:115` 守卫同款）；`unreadAgg` 继续用三出口同源 `visibleFilter`。
- P1 探针复跑（忠实 Mongo `$group` 语义，aggregate 返回 `{_id:null}` 组）：**NO_CRASH**——B 的 `unreadAlertCount=1`、null 组被守卫丢弃、A 不出现；无资产级对照组 NO_CRASH。
- 回归覆盖已补：`portfolio.summary.test.js` 的 aggregate stub 增加 `{_id:null,count:1}` 样本；**NC-F01**（移除守卫）→ 该用例 FAIL，精确复现原 `TypeError: Cannot read properties of null (reading 'toString')`——首轮测试盲区已堵住。
- **AC-02 改判：满足。**

**F-02 复检：已解决 ✅**

- 修复：新增「AC-03：`deletePortfolioCascade` 不触碰 AlertEvent（契约测试）」，拦截 `AlertEvent.deleteMany/deleteOne/findByIdAndDelete` 并断言调用为 0。
- **NC-F02**（`deletePortfolioCascade` 加 `AlertEvent.deleteMany`，即物理删除实现）→ 契约测试 **FAIL**（`actual:['deleteMany'] / expected:[]`）——首轮「物理删除实现 34/34 全绿」的缺口已闭合。
- **AC-03 改判：满足**（静态证据 + 运行契约双覆盖）。残余长尾：拦截清单不含 `remove`/`bulkWrite`/`collection.drop` 等删除通道，记入残余风险（不阻塞）。

**复跑验证（Reviewer 亲跑）**：`npm run test:server` **240/240 pass / 0 fail**（与 §11.7 自述一致）；全部对照还原后三测试文件复跑 **35/35 pass**；`git status --porcelain` 空；临时探针已删除。

**新发现**

**F-04 · MAJOR · `TASK-068-plan.md` §12.2 · 证据完整性 / 流程边界**

- 现象：返工提交 `3226dd4` 把首轮审查记录 §12.2「Reviewer 独立计算」表中的 4 个哈希值改写为返工后工作区字节哈希（`640565f5`→`4943a57b`、`d4705d74`→`8a71df85`、`5615fa7b`→`2ecc1094`、`30a1ed2b`→`434b6eb5`）。审查记录是 Reviewer 所有物（REVIEWER §3/§7），实现方不得改写；改写后的表格把非 Reviewer 计算的值标注为「Reviewer 独立计算」，构成证据归属失真，且使首轮记录与被审版本 `9c8c808` 失去对应。§12 其余原文（含 §12.10 判定词）未被改动。
- 处置：Reviewer 已将 §12.2 恢复为首轮实测原值并留痕（见 §12.2 注）；请 Orchestrator 向 Implementer 明确 Review Record 禁改边界；若 Human 认为该流程事件需正式接受，请记录接受依据。
- 修法方向：返工提交只改实现与 §11 实施记录；对 §12 的任何更正由 Reviewer 在复检记录中追加。

**F-05 · MINOR · 哈希记录口径 · 证据可复现性**

- 现象：同一文件存在互不相等的三种口径——工作区原始字节（受换行符状态影响：`summary.js` 同一 git 内容先后实测 `8a71df85`（实施后混合换行视图）与 `6f384d79`（checkout 后 CRLF 视图，7196 字节 vs blob 7039 字节 = +157 CR）两个值）、以及仓库内容口径（`git show <SHA>:<path> | sha256sum` = `0410bfce`，稳定可复现）。§11.2 把 `alertVisibility.js` 记为 `4943a57b`（工作区 CRLF 字节），而其仓库内容实为 `640565f5`（自首轮未变）。
- 修法方向：证据哈希统一用 `git show <SHA>:<path> | sha256sum`（内容口径）或直接记录 git blob id，避免对工作区原始字节取 SHA256。
- 处置：记录，不阻塞。

**二轮 AC 对照（更新 §12.3 中 AC-02/AC-03 判定，其余不变）**

| AC | 二轮判定 | 依据 |
|---|---|---|
| AC-01 | 满足（维持） | 代码与首轮 NC-3 证据不变 |
| AC-02 | **满足**（原不满足 → 整改复检通过） | F-01 修复 + P1 复跑 NO_CRASH + NC-F01 覆盖 |
| AC-03 | **满足**（原仅静态证据 → 补运行契约） | F-02 修复 + NC-F02 可证伪物理删除 |
| AC-04 | 满足（维持） | 首轮 NC-4 证据不变 |
| AC-05 | 满足（维持） | 三出口同源不变；出口③ group 适配已修复 |
| AC-06 | 满足 | `npm run test:server` 240/240（亲跑） |
| AC-07 | 满足 | 越界复核空 |

**二轮独立性声明**：本复检由独立 Reviewer 执行，未参与返工实现与验收脚本编写；P1/NC-F01/NC-F02 均本轮亲跑，突变经 `git checkout --` 还原并以 `git status --porcelain` 证净；未改业务代码与测试（仅更新本审查记录 §12）；未 git add/commit/push；未改 Task Status。

**二轮判定：Pass with issues** —— F-01（BLOCKER）与 F-02（MAJOR）均已整改并经负向对照复检确认解决；AC-01～AC-07 全部满足。剩余：MINOR F-03、F-05 记录在案；MAJOR F-04（审查记录被实现方改写）已由 Reviewer 恢复原值并留痕，其流程事件的接受与否交 Orchestrator/Human 记录。按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §5.1：本判定不是合入许可、不是 Status；Task 状态未改，关闭与合入由 Human 决定。

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
