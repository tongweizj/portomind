# TASK-057 — US-001 实施计划

## Status

Status：Completed（2026-11-05，审查通过后结案）

Owner：Planner（规划）→ Implementer（2026-11-05 实施，`5bb47ea`）→ Reviewer（`Pass with issues`，`54136c2`）→ Human（2026-11-05 确认）

Related Task：[TASK-057](./TASK-057.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：未来在真实源码工作区从 up-to-date `main` 新建 `feature/TASK-057` 独立 worktree（沿 053/056 惯例）。规划期只读基线为 chore/agent-rules-refactor @ `2bde913`；**2026-11-04 复核**：四个目标文件 SHA256 与 [回交 §2](./US-001-02-planner-return.md) 记录逐一吻合（`taskRun.js` `c366c084…` / `taskRunner.js` `810a7e65…` / `rebalanceScheduler.js` `5e075a73…` / `cronStatus.service.js` `27a3cc56…`），shared/worker 未被 053/056 触及，既有发现仍有效。主工作区另有 `US-001-01-planner-handoff.md` 未提交改动（git 提交被沙箱拦截），不得清理或覆盖。

Approval：**2026-11-05 Human 批准当前设计**（Planner 会话明确选择「批准 TASK-057 计划」）：批准覆盖 §1～§9 当前设计，含 §6 已冻结的 D-01～D-03 契约与 AC10 口径，不含其他任务。Task 的 `Planning → Implementing` 登记、工作区准备与派发由 Orchestrator 按 STATES.md §4 落实；Planner 不代填状态。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task 的 §3，逐条引用该节、不增删改；覆盖 US-001/AC-05～08（写侧支撑）。验证映射见 §7。当前计划不允许实现US-001范围外的P1/P2功能、调度控制或既有汇率方向修复。

## 2. Context

需求、任务和未决项见 [Planner回交](./US-001-02-planner-return.md)。本任务需 ExecPlan：共享schema、任务执行与数据库可观测性变化，且涉及未决契约。不新增审批层。

## 3. Repository Findings

本轮只读源码核实位置、SHA256和证据边界见 [回交 §2](./US-001-02-planner-return.md)。未连接数据库、未执行应用/测试或DDL；部署Mongo版本、实际索引/集合与当前数据库数据均未核实。054历史测试日志只作既有证据，不能当成本次运行。

## 4. Proposed Design

**以下设计随 2026-11-04 Human 对 D-01～D-03 的裁决冻结**（§6）；字段名为 producer→adapter→consumer 契约，`TASK-064` 消费、不得各自命名。

1. **`shared/models/taskRun.js`（零迁移）**：新增可选 `result: Schema.Types.Mixed`；`status` 枚举与 `{taskName, runKey}` **唯一索引零改动**，不新增 SKIPPED 状态（跳过不落 taskruns）。`taskRunner.normalizeCounts` 仍只保留 `totalCount/successCount/failureCount/failures`，额外**仅**透传调用方显式包进 `result` 键的内容，顶层裸字段（`ok`/`gap` 等）继续丢弃（AC2 负向对照）。

2. **D-01（冻结）：新增独立 `shared/models/taskSkip.js`（集合 `taskskips`）**：
   `{ taskName, runKey, trigger, reason: 'ALREADY_RUNNING' | 'DUPLICATE_RUN_KEY', skippedAt, activeRunKey? }`，索引 `{ taskName: 1, skippedAt: -1 }`。
   两条跳过分支均记 `TaskSkip.create` 事件；真实 TaskRun 不覆盖（正在跑的记录不得被改 SKIPPED）、execute 不二次执行。观测写失败只记受控错误日志 + 未持久化标志，不因写失败放行业务、不谎称可查询。`TASK-064` 只读最近事件作可选 `lastSkip`，不替换 `lastRun`。新集合的写权限/容量/备份在 W1 环境核对时确认；**本次不加 TTL**。

3. **D-02（冻结）：`result` 形状**：
   - 完整性 `price-integrity-check`：`{ totals:{expectedCount,actualCount,missingCount}, checkedCount, skippedCount, completenessRatio, gapAssets:[{symbol,missingCount}] }`——**不**全量存 `assets[]`/`missingRanges[]`，不存堆栈。
   - 提醒 `alert-evaluate`：`{ evaluated, created, archived, failed }`。
   - 汇率 `fx-rate-sync`：`{ fxCount, currencies:{ USD:{ok:true, rateToCny:<实际入库值>}, CAD:{…}, HKD:{…} } }`（OQ-4 收敛为③：数值+完成标志）；`ok:true` 仅表示该币种本次真实写入完成，数值取真实返回；采集/写入失败的运行记 FAILED 且 **不补造**三币成功标志，错误信息照常显示，不声称有细粒度失败轨迹。方向正确性不归本卡（`TASK-051`）。
   - 价格 `daily-price-sync`：`{ skippedCount }`（休市跳过数）。
   - 再平衡父任务见第 4 点。

4. **D-03（冻结）：父任务 `rebalance-check` 在 `runRebalanceCheck` 函数内部包裹**：`runTrackedTask('rebalance-check', runKey=marketDate(now, timezone), trigger=真实来源)` 包住分发主体；拆出内部分发 body。公开函数保留原 flat summary 字段（`totalCount/dueCount/skippedCount/failureCount/failures`）给既有调用者，额外结果进 `result.perPortfolio`，每项 `{portfolioId, due, needsRebalance, suggestionsCount, recordId, status, failureReason?}`，长度 = 未归档组合数（动态基数，不写死）。判定规则：未到期 `due=false` 且不猜 `needsRebalance`（`null`）；未超阈 `needsRebalance=false, suggestionsCount=0, recordId=null`；生成建议则 `recordId` 非空且 `suggestionsCount>0`；失败保留阶段性事实；子任务本次被跳过（无 execute 结果）不得猜，读到同 key 真实既有 result 才引用，否则 `unknown` + 标明 SKIPPED 原因。父任务生成数按真实 `suggestions/recordId`，不把 `successCount` 等同生成数。

5. **既有语义零改动（AC9）**：逐组合 `runKey`、调度 cron、`SCHEDULE_DUE_RULES`、归档过滤、两层防重（进程内 + DB 唯一键）全部不变；`server/` 仍不注册 cron（ADR-002）。状态判定零改动（AC7）：`failureCount>0 → PARTIAL`、否则 `SUCCEEDED`、未捕获异常 `→ FAILED`，`result` 存在与否不影响 status。既有 `rebalanceScheduler.test.js` 断言适配新增父记录（D-03），**只做加法适配**，不删除归档/到期/单组合失败隔离断言，理由写 §11。

6. **stale 阈值（OQ-5 已收敛，无需再裁）**：复用 `cronStatus.constants.js` 的 `TASK_PERIOD_HOURS`/`STALE_FACTOR`（daily=48h）单一来源，本卡不新建阈值、不回填历史僵尸 `RUNNING`（读侧 stale 判定归 054/064）。`TASK-064` 承接读侧归一化、skip 查询与降级边界；server/前端不夹带进本卡。

### 冻结样例（2026-11-05 补充，W2 产出物：§4-2～§4-4 的样例化展开，不改已批准设计）

> 字段名以 `shared/models/taskRun.js` 实际 schema 为准（`taskName/runKey/trigger/status/startedAt/endedAt/durationMs/totalCount/successCount/failureCount/failures` + 新增 `result`）。`runKey` 具体形态沿用既有 `runTrackedTask` 调用方产出，样例值仅示意、**不新造前缀**。样例数值仅为形态示意，不构成业务期望值。

**S1 成功（价格同步）** `daily-price-sync`，`status:'SUCCEEDED'`：

```js
// TaskRun 的 $set 部分
{ totalCount: 40, successCount: 38, failureCount: 0, failures: [],
  result: { skippedCount: 2 } }        // 休市跳过数；不含任何百分比
```

**S2 零值正常（提醒评估）** `alert-evaluate`，零命中**不是失败**：

```js
{ totalCount: 1, successCount: 1, failureCount: 0, failures: [],
  result: { evaluated: 12, created: 0, archived: 0, failed: 0 } }
```

**S3 部分缺口（完整性检查）** `price-integrity-check`，摘要 + gapAssets：

```js
{ totalCount: 40, successCount: 38, failureCount: 2, failures: [/*…*/],
  result: {
    totals: { expectedCount: 40, actualCount: 38, missingCount: 2 },
    checkedCount: 40, skippedCount: 1, completenessRatio: 0.95,
    gapAssets: [ { symbol: '000191', missingCount: 3 } ]   // 只留 symbol/missingCount
} }                                  // 禁止 assets[] 全量 / missingRanges[] / 堆栈
```

**S4 失败（汇率）** `fx-rate-sync` 抛错 → catch 路径，**不补造 currencies**：

```js
{ status: 'FAILED', failureCount: 1,
  failures: [{ item: 'fx-rate-sync', category: 'NETWORK', message: 'provider timeout' }] }
// result 整体缺省 = 结果未知；禁止写 currencies:{USD:{ok:false}} 之类补造标志
```

**S5 成功（汇率数值 + 完成标志）**：

```js
{ totalCount: 1, successCount: 1, failureCount: 0, failures: [],
  result: { fxCount: 3, currencies: {
    USD: { ok: true, rateToCny: 7.13 },
    CAD: { ok: true, rateToCny: 5.21 },
    HKD: { ok: true, rateToCny: 0.92 } } } }
// ok:true 仅表示该币种本次真实写入完成；数值取真实返回（方向正确性不归本卡，TASK-051）
```

**S6 父任务（rebalance-check）** 4 组合四种语义各一：

```js
// taskName:'rebalance-check'，runKey = marketDate(now,timezone)（如 '2026-11-05'）
{ totalCount: 4, dueCount: 2, skippedCount: 1, failureCount: 1, failures: [/*…*/],  // 顶层 flat 保留
  result: { perPortfolio: [
    { portfolioId: 'p1', due: true,  needsRebalance: true,  suggestionsCount: 2,    recordId: 'rec_a1', status: 'SUCCEEDED' },
    { portfolioId: 'p2', due: true,  needsRebalance: false, suggestionsCount: 0,    recordId: null,     status: 'SUCCEEDED' }, // 未超阈
    { portfolioId: 'p3', due: false, needsRebalance: null,  suggestionsCount: null, recordId: null,     status: 'SUCCEEDED' }, // 未到期不猜
    { portfolioId: 'p4', due: true,  needsRebalance: null,  suggestionsCount: null, recordId: null,
      status: 'FAILED', failureReason: 'DB_TIMEOUT' }                                // 失败保留阶段性事实
] } }
```

**S7 子任务本次被跳过** 不猜结果，仅当读到同 key 真实既有 result 才引用：

```js
{ portfolioId: 'p5', due: true, needsRebalance: null, suggestionsCount: null, recordId: null,
  status: 'SKIPPED', failureReason: 'SKIPPED:DUPLICATE_RUN_KEY' }
```

**S8 跳过事件（`taskskips`，D-01 独立集合）** 两条路径各一条：

```js
{ taskName: 'daily-price-sync', runKey: '<沿用既有形态>', trigger: 'SCHEDULED',
  reason: 'ALREADY_RUNNING',   skippedAt: ISODate('…'), activeRunKey: '<正在跑的 runKey>' }
{ taskName: 'daily-price-sync', runKey: '<沿用既有形态>', trigger: 'MANUAL',
  reason: 'DUPLICATE_RUN_KEY', skippedAt: ISODate('…') }        // 无 activeRunKey
```

**S9 缺契约（历史兼容，AC8）** 现存 276 条文档无 `result` 键（10 个既有字段原样）→ 064 读侧 `contractReady=false`、数值 `null`、**不渲染成 0 缺口**。

**S10 负向对照基准（AC2/AC7）**：

```js
// execute 返回顶层裸字段 { ok: 1, gap: 2 }（未包 result）→ 落库文档不得出现 ok/gap 任何一键
// execute 返回合法 result 但 failureCount=0 → status 必须仍为 'SUCCEEDED'（result 不改状态机）
```

**兼容说明（064/063 对齐基准）**：① `result` 一律**嵌套**写入，禁止摊平到 `$set` 顶层（R-6）；② `result == null`（历史/失败）语义 =「契约未就绪/结果未知」，不是 `{}`、不是 0 缺口；③ 文档体量预算：`gapAssets` ≤ 资产数（当前约 40），单条 `result` 目标 < 2KB，W4 实测记录，超出即 R-2 违例；④ `lastSkip`（064 可选字段）只来源于 `taskskips` 最近事件，与 `lastRun` 分离，无集合/无记录时 `null` 并兼容。

## 5. Work Breakdown

- [x] W1：先核实部署Mongo版本、TaskRun实际索引、数据权限和已有字段；数据库检查在安全开发库进行。**（2026-11-05 已完成**：dev 库在家庭服务器 `192.168.2.140`，只读实测 276 条 taskruns / 0 条含 result / `{taskName,runKey}` unique 在 / 未归档组合 4 个，见卡片启动核对记录）**
- [x] W2：按 §4 冻结契约产出 producer→adapter→consumer **冻结样例**（成功/缺契约/零值/失败/跳过/未超阈/未知各一）交 064/063 对齐，样例与兼容说明存档；仍不先写 schema 或索引。**（2026-11-05 已冻结**：S1～S10 + 兼容说明见 §4「冻结样例」节）**
- [ ] W3：修改可选result和严格透传；新增获批的跳过载体、两条分支持久化及失败观测。
- [ ] W4：为五类任务补真实result，内部包父任务并保持既有调用者字段；每项区分生成/未超阈/失败/未知。
- [ ] W5：补单元与真实Mongo验证、原防重/五任务回归，更新TaskRun及运维文档，联调064。

## 6. Decisions

**Human 裁决记录（2026-11-04，本 chat 逐项确认）**：

| 决定 | 结果 | 含义与影响 |
|---|---|---|
| **D-01** 跳过载体 | ✅ **独立 TaskSkip 集合**（原选项 D） | 两条跳过路径均落 `taskskips` 事件；`taskruns` 唯一索引与 `runKey` 语义**零改动**；partial-index / 合成 runKey / 只记一种跳过的备选路线全部废止；新模型/集合与 064 可选 `lastSkip` 读侧配套获准 |
| **D-02** result 摘要与汇率 | ✅ **摘要 + 汇率记实际数值与完成标志** | 完整性存 totals/gapAssets 摘要不存全量；`currencies{USD/CAD/HKD:{ok:true, rateToCny}}`（OQ-4 收敛为③）；失败运行 FAILED + 结果未知，**不补造**逐币种成败；全量 report / topN / 纯标志路线废止 |
| **D-03** 父任务包裹 | ✅ **`runRebalanceCheck` 函数内部包裹** | 父名 `rebalance-check`、父 runKey=`marketDate(now,timezone)`；任何调用路径可观测；既有测试对新增父记录只做加法适配，不弱化归档/到期/隔离断言 |
| **AC10 措辞（R-02）** | ✅ **更正为动态数量** | 卡片 AC10 已更新为「全量回归全绿、数量以实际为准」，229 条（152+77）记为 2026-10-26 旧基线；「改测试须写明理由」约束保留 |

OQ-5 确认**无需裁决**（源码已有 `TASK_PERIOD_HOURS`/`STALE_FACTOR` 单一常量来源，见 §4-6）。以上裁决冻结本计划 §4 设计。**计划已于 2026-11-05 获 Human 批准**（见文件头 Approval），实施已由 Orchestrator 登记启动。

## 7. Verification

以下为未来验收设计，未运行。适用命令入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)，不以历史数量作为预期。每条AC均有映射：

| Task AC | 验证方法与期望 |
|---|---|
| AC1 | 真实Mongo连接在隔离开发库：写result后findById回读；无字段基线应失败，禁止只mock更新返回值。 |
| AC2 | 只允许显式result，顶层裸ok/gap不落库；非法/缺result的约定样例回归。 |
| AC3 | 逐类任务回读实际结果，不使用固定历史资产数；成功/失败/零提醒/缺币种各有样例，方向正确性不在本卡。 |
| AC4 | 父result按未归档组合动态基数；验证到期/未到期/未超阈/生成失败/子任务跳过与未知，recordId和suggestionsCount对应真实业务结果。 |
| AC5、AC6 | 两类跳过均可查询事件；同业务键真实TaskRun仍至多一条且唯一索引不变，首跑RUNNING不被覆盖、不重复执行。并发和跨进程分支在真实Mongo证明。 |
| AC7 | failureCount/status算法零改变，合法result不改变既有PARTIAL/SUCCEEDED/FAILED分类。 |
| AC8 | 旧无result记录unknown，不把缺失或空对象当0缺口；与064读侧降级对照。 |
| AC9 | diff核对cron、到期、逐组合runKey、防重、server无cron均不改变；父记录与新增观测需对应D-01/D-03批准。 |
| AC10 | 执行 `test:server` 与 `test:worker` 全量回归，均 exit 0、全绿，**数量以实际为准**（2026-10-26 旧基线 152+77=229 条仅作历史参考；卡片 AC10 已按 Human 2026-11-04 裁决更正措辞）。既有 `rebalanceScheduler.test.js` 断言按 D-03 只做加法适配，理由写 §11，不得为过测而弱化断言。 |
| AC11、AC12 | 文档记录实际result与跳过观测载体；独立Reviewer提供证据与结论，不能自判通过。 |

同基线有效证据可复用；只对新增/关键断言补负向对照，在临时副本或夹具操作，不污染被审实现。验证失败不得改断言掩盖实现问题。

## 8. Risks

partial索引/合成键可能弱化防重；父锁与子锁语义冲突；result数据量扩大；FX已知方向缺陷被误解为新修复。推荐方案不改已有唯一索引，父/子分层防重，并以事实字段和限量摘要控制。数据库版本与真实索引为实施前待验证事实。

## 9. Rollback

D-01 已定独立集合路线（§6）：**无既有索引迁移**。撤回读取/写入代码后保留已写 `result` 及 `taskskips` 数据，不自动删集合、不回填旧 RUNNING；任何删数据由 Human 明确决定。

## 10. Implementer Handoff

### 10.1 实施交接（2026-11-05，Planner → Implementer）

- **Task / AC**：[TASK-057](./TASK-057.md)，覆盖 US-001/AC-05～08；AC 唯一来源为卡片 §3，逐条对照、不增删改。
- **批准依据**：计划 `Approved`（2026-11-05 Human，覆盖 §1～§9 当前设计）；D-01～D-03 与 AC10 口径已裁决冻结（§6）。
- **工作区**：`D:/projects/portomind-057`（`feature/TASK-057`，基于 `main` @ `aa2c877`，当前干净）。
- **前置已齐**：W1 环境核对完成（dev 库 `192.168.2.140`/`portomind_dev`，只读实测与计划记录吻合）；W2 冻结样例 S1～S10 就位（§4）。
- **实施约束（卡片启动核对记录）**：276 条历史数据是 AC8 被测对象，**不得清库**；写入验证使用独立 runKey / 测试组合，不污染既有业务记录。
- **改动边界**：`shared/models/taskRun.js`（+`result`）、新增 `shared/models/taskSkip.js`、`shared/services/taskRunner.js`、五任务 `execute` 返回值、`cron-worker/src/schedulers/rebalanceScheduler.js`、测试与 `CRON_WORKER_DEV.md §5` 文档；**不改** `server/` `client/`、cron 表达式、防重语义（AC9）。
- **验证入口**：[DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)；AC→验证映射见 §7；查库断言**不得**用函数返回值替代。
- **已知问题/妥协预告**：R-2 文档体量须实测记录；R-3 父任务 `PARTIAL` 语义不改状态机；R-9 僵尸不参与防重；`rebalanceScheduler.test.js` 3 处断言只做加法适配并写明理由。
- **回交要求**：实际文件清单与 SHA256、AC 逐条实测、负向对照、测试回归实际输出、妥协与未验证项写 §11；触及范围/AC/重大设计变化或前置缺失时暂停受影响部分并上报。

## 11. Implementation Record

**状态：** 实施完成（2026-11-05）。Task Status **未改动**（仍为 `Implementing`，状态权限归 Orchestrator / Human）；计划 Status 未改（worktree 基于 `aa2c877`；主工作区另有尚未提交的「Approved」文档改动，本 worktree 未复制、未覆盖）。

### 11.1 环境与数据库

| 项 | 实际值 |
|---|---|
| Worktree | `D:\projects\portomind-057`（主工作区 `D:\projects\portomind` 的未提交 docs 未触碰） |
| Branch / BASE | `feature/TASK-057` / `main @ aa2c877` |
| Node / npm | `v24.20.0` / `12.2.1`；`npm ci` 隔离安装（515 packages） |
| DB | `portomind_dev`（家庭服务器，`server/.env` 的 `MONGO_URI`；未打印口令） |
| taskruns 基线 | **276 条**，含 `result` 的 **0 条** |
| 索引 | `_id`；`{startedAt:-1, taskName:1}`；**`{taskName:1, runKey:1} unique=true`** |
| 未归档组合 | **4**（AC4 动态基数实测） |
| 历史 `RUNNING` 僵尸 | 1 条；**未回填**（读侧归 054/064） |
| 写入保护 | 只用 `test:057:<timestamp>` 测试键与专用历史日期 `2000-01-03`；不 drop、不清库；脚本结束只删除本次创建的 14 条 TaskRun + 2 条 TaskSkip，前后均为 **276** 条 |

### 11.2 改动文件与 SHA256

| 文件 | 说明 | SHA256 |
|---|---|---|
| `shared/models/taskRun.js` | 仅新增可选 `result: mongoose.Schema.Types.Mixed`；status 枚举/唯一索引零改动 | `78e201e4…96eb` |
| `shared/models/taskSkip.js` | 新增 `taskskips` 事件模型 + `{taskName:1,skippedAt:-1}` 索引；无 TTL | `8187ca6c…5051` |
| `shared/services/taskRunner.js` | result 显式透传；两条跳过路径写 TaskSkip + `skipPersisted`；状态机不变 | `0a7641c4…b7f` |
| `shared/tasks/dailySync.js` | 价格 execute 返回 `result.skippedCount` | `138bca05…781b` |
| `cron-worker/src/tasks/integrityCheck.js` | 完整性 execute 返回 D-02 摘要（totals/checked/skipped/ratio/gapAssets） | `cff1f209…a789` |
| `cron-worker/src/schedulers/alertScheduler.js` | 提醒 result 四字段；可选 `runKey/trigger`（默认值不变） | `1b253258…3279` |
| `cron-worker/src/schedulers/fxScheduler.js` | 汇率 result.currencies 数值 + ok；可选 `runKey/trigger`（默认值不变） | `7b00e365…82b6` |
| `cron-worker/src/schedulers/rebalanceScheduler.js` | D-03 父任务 `rebalance-check` 包裹 + `result.perPortfolio`；flat summary 保留 | `73978968…acad` |
| `cron-worker/test/rebalanceScheduler.test.js` | D-03 加法适配（test 2 补 TaskRun mock）+ 新父 result 用例 | `e69d83ab…fe5a` |
| `server/test/integration/taskrun.logging.test.js` | TaskSkip mock、result 透传/裸字段/状态机/skip 写失败/index 用例 | `ac029d5a…b026` |
| `scripts/verify-task-057.cjs` | 真实 Mongo + 真实代码的 AC1–AC8 验收脚本（根 scripts，不占 server 路由） | `0be41b10…e665` |
| `docs/handbook/technical/CRON_WORKER_DEV.md` | §5.1/5.2/5.3 + 新增 §5.5（result/SKIPPED 口径/父任务） | `5771bd3d…0111` |
| `docs/handbook/ops/CRON_WORKER_OPS.md` | 巡检位置/命令/SKIPPED 状态表与新口径一致 | `053558ee…4109` |
| `docs/development/delivery/US-001/TASK-057-plan.md` | 本实施记录（§11） | 见交付消息（写入后计算，自引用无法内嵌） |

**未改：** `client/`、`server/src` 路由/中间件、`cron-worker` 的 cron 注册与调度算法、`shared/services/cronStatus.service.js`（读侧归一化归 064）、status 枚举、TaskRun 唯一索引。

### 11.3 实现要点（对应冻结契约）

- **D-01**：`runTrackedTask` 的两条跳过分支均 `TaskSkip.create`；TaskRun 不写 SKIPPED、正在跑的记录不被覆盖；写失败 `skipPersisted=false` + 受控日志 `TASK_SKIP_RECORD_FAILED`，业务仍跳过。
- **D-02**：`normalizeCounts` 保留 4 个计数字段 + 仅 `hasOwnProperty('result')` 时透传；各任务 result 形状按冻结字段；完整性不存 `assets[]`/`missingRanges[]`；汇率只记真实返回的币种记录，不补造。
- **D-03**：`runRebalanceCheck` 内部 `runTrackedTask('rebalance-check', runKey=marketDate(now,tz), trigger)`；父 `result` 含 `totalPortfolios/dueCount/skippedCount/perPortfolio`；`perPortfolio` 长度 = 未归档组合数；未到期 `needsRebalance=null`、未超阈 `false/0/null`、生成 `recordId` 非空且 `suggestionsCount>0`、失败保留 `failureReason`；子任务跳过时先查同 key 既有 result，否则 unknown + `skipReason`。
- **AC9**：默认 cron 常量仍为 `0 3 / 30 3 / 0 4 / 30 9 / 0 0`；`SCHEDULE_DUE_RULES` 未变；逐组合 `runKey` 仍为 `${schedule}:${periodKey}`；父任务 runKey 为 `marketDate(now,tz)`（D-03 新增，属批准范围）；`server/` 无 `node-cron`/`cron.schedule`。
- **测试适配理由**：`rebalanceScheduler.test.js` 第 2 个用例原先只 mock `Portfolio.find`，D-03 后父任务也会写 TaskRun，故**只补** `TaskRun.create/updateOne` mock（未删/未弱化任何到期、归档、故障隔离断言）；新增 1 条父 result 用例。

### 11.4 AC1～AC12 逐条结果

| AC | 结果 | 实测证据 |
|---|---|---|
| AC1 schema result + findById 回读；先红后绿 | **PASS** | 改 schema 前：`PRE_CHANGE_RESULT_FIELD= undefined (RED)`；改后实库回读 `result={"kept":{"a":1},"nested":"yes"}`（findById/查库，不是返回值） |
| AC2 白名单 + 负向对照 | **PASS** | `normalizeCounts` 结果键为 `failureCount/failures/result/successCount/totalCount`；实库文档无顶层 `ok/gap`；负向：临时改为 `Object.assign(normalized,result)` 后 AC2 单测 FAIL（`actual` 出现 `ok/gap`），恢复后 PASS |
| AC3 五类任务 result 查库 | **PASS** | 价格 `{"skippedCount":1}`；完整性 `totals{2,1,1}/checkedCount1/skippedCount0/ratio0.5/gapAssets[1]`；提醒 `evaluated3/created1/archived0/failed2`；汇率 `currencies{USD 7.1,CAD 5.2,HKD 0.91, ok:true}`；父任务见 AC4 |
| AC4 父任务 record + perPortfolio | **PASS** | `rebalance-check` 落库，`result.perPortfolio.length=4` = 未归档组合数；每项含 6 字段；生成项 `recordId=test-record-057,suggestionsCount=2,needsRebalance=true`；未超阈项 `false/0/null`；flat summary `totalCount4/dueCount4/skippedCount0` |
| AC5 两条跳过路径 + 首跑不被覆盖 | **PASS** | ALREADY_RUNNING：`taskskips` 1 条、`activeRunKey` 为测试首跑键、`skipPersisted=true`；首跑 TaskRun 最终 `SUCCEEDED`；DUPLICATE：`taskskips` 1 条；既有 TaskRun 仍 `SUCCEEDED` |
| AC6 防重 + 唯一索引 | **PASS** | 实库索引 `{taskName:1,runKey:1} unique=true`；二次触发后同 key 计数 `1` |
| AC7 状态机 | **PASS** | 合法 result + failureCount0 → `SUCCEEDED`；failureCount1 → `PARTIAL`；未捕获异常 → 落库 `FAILED`；负向：临时改状态判定后 PARTIAL 用例 FAIL，恢复后 PASS |
| AC8 历史无 result 兼容 | **PASS** | 实库 276 条无 result 可读；`getStatus` 不报错，`rebalance-check.contractReady=false`（不把 null 当 {} 渲染 0 缺口） |
| AC9 调度语义零改动 | **PASS** | 默认 cron/`SCHEDULE_DUE_RULES` 未变；逐组合 runKey 未变；`server/` 无 cron；父 runKey 为 D-03 新增 |
| AC10 全量回归 | **PASS** | `test:server` **214/214**；`test:worker` **78/78**；均 exit 0 |
| AC11 文档 | **PASS（本卡范围）** | 更新 DEV §5.1/5.2/5.3 + §5.5、OPS 7.1/7.2/7.3 状态表；`docs:check` 仍有**既有** `docs/readme.md:66` broken link（与本卡无关，未修） |
| AC12 独立 Reviewer | **未进行** | 本记录为 Implementer 自测，不构成 Reviewer 判定；不得记为通过 |

**实库验收汇总：`TASK057_ENV=D:/projects/portomind/server/.env node scripts/verify-task-057.cjs` → 29/29 PASS。**

### 11.5 负向对照记录

| AC | 临时缺陷 | 结果 | 恢复 |
|---|---|---|---|
| AC1 | 改 schema 前先写 result 并回读 | `PRE_CHANGE_RESULT_FIELD= undefined`（RED） | 随后新增 schema 字段，回读非空（GREEN） |
| AC2 | `normalizeCounts` 改为 `Object.assign(normalized,result)` | `AC2 normalizeCounts...` FAIL（actual 出现 `gap/ok`）+ result 用例 FAIL | 恢复备份；SHA256 `0a7641c4…b7f` |
| AC5 | `recordSkip` 不写 TaskSkip，仅返回 `skipPersisted:true` | 两条 AC5 断言 FAIL（`taskskips` 0 条），26/28 PASS | 恢复；SHA256 `0a7641c4…b7f` |
| AC7 | 有 result 时强制 `SUCCEEDED`，覆盖 failureCount 判定 | `AC7 failureCount>0 → PARTIAL` FAIL（实际 SUCCEEDED），27/28 PASS | 恢复；SHA256 `0a7641c4…b7f` |

每次恢复后重新跑真实库验收均回到 **29/29 PASS**；测试写入全部清理，TaskRun 276 条不变。

### 11.6 数据库实测输出（前后对比）

```text
DB=portomind_dev taskruns_before=276
...（29/29 PASS）...
cleanup: taskruns=14, taskskips=2
after: taskruns=276 (with_result=0, test_keys=0, taskskips=0)

taskskips_indexes = [
  {key:{_id:1}},
  {key:{taskName:1, skippedAt:-1}, background:true}
]
taskruns_indexes = [
  {key:{_id:1}},
  {key:{startedAt:-1,taskName:1}, background:true},
  {key:{taskName:1,runKey:1}, background:true, unique:true}
]
```

> `taskskips` 集合与索引由新模型首次写入创建；没有 drop、没有清库、没有改既有索引。历史 276 条与 4 个未归档组合未被修改。

### 11.7 回归与验证命令

```text
$ npm run test:server   → 214 pass / 0 fail（exit 0）
$ npm run test:worker   →  78 pass / 0 fail（exit 0）
$ TASK057_ENV=... node scripts/verify-task-057.cjs → 29/29 PASS
$ npm run docs:check    → 既有 docs/readme.md:66 broken link（非本卡文件；本卡新增链接可达）
```

### 11.8 已知妥协与未验证项

1. **AC12 未进行**：需 Orchestrator 安排独立 Reviewer；本记录不替代审查。
2. **业务引擎在实库脚本中使用 mock**：价格 fetcher、完整性 countAsset、提醒 evaluateAll、汇率 provider、再平衡 ThresholdChecker/SuggestionGenerator/AlertCenter 均用可控返回，避免真实外部调用与业务数据写入；验证的是**落库契约/形状**，不是真实行情/再平衡业务运行。
3. **AC4 父任务**使用真实 dev 的 4 个未归档组合 + 专用历史日期 `2000-01-03`，并对生成分支使用 mock 建议（recordId `test-record-057`）；未创建真实 `rebalancerecords`/提醒。脚本已清理 14 条测试 TaskRun。
4. **未跑满一个真实调度周期**：没有等 5 类任务在生产节奏各跑一次；AC8 的「上线首日读侧降级」以历史 276 条 + `getStatus` 验证，不宣称已生产就绪。
5. **`taskskips` 无 TTL/容量评估**（D-01 明确本次不加）；事件量增长与清理策略未验证。
6. **skipPersisted=false 的消费方**：当前只记录标志，TASK-064 读侧尚未消费；不得把未持久化事件当成可查询。
7. **汇率方向**不归本卡（TASK-051）；`currencies` 记录真实数值后可能直接暴露已知方向错误，属预期。
8. 未改动历史僵尸 `RUNNING`；未做 `taskruns` TTL/归档。
9. `docs:check` 的既有 broken link 未修（非本卡范围）。

### 11.9 交付状态

实现、实库验证、全量回归、文档同步完成；**Task Status 保持 `Implementing`**，未改 AC/Scope/status 枚举/唯一索引/调度语义。等待 Orchestrator 登记 `Reviewing` 并安排独立 Reviewer（AC12）。

## 12. Review Record

### 12.1 审查对象与基线

| 项 | 事实 |
|---|---|
| 审查角色 | 独立 Reviewer（独立会话，非实现者，未自审通过；AC12 在此落地） |
| 工作目录 | `D:/projects/portomind-057`（独立 worktree） |
| 分支 / SHA | `feature/TASK-057` @ `5bb47ea`（父 `aa2c877` = main） |
| 工作区状态 | 干净（`git status --porcelain` 空；交付已全部提交；审查后 temp 探针全部删除） |
| 环境观察 | `git worktree list` 实际只有 2 条（main + 057），与交接预期「三条」不符——056 worktree 已注销，属环境事实，不影响本卡审查 |
| 真实数据库 | `portomind_dev`（家庭服务器，`server/.env` 的 `MONGO_URI`，未打印口令）；连接 OK |
| 被审文件 SHA256 | `taskRun.js` `78e201e4…96eb`；`taskSkip.js` `8187ca6c…5051`；`taskRunner.js` `0a7641c4…70b7f`；`dailySync.js` `138bca05…781b`；`integrityCheck.js` `cff1f209…a789`；`alertScheduler.js` `1b253258…3279`；`fxScheduler.js` `7b00e365…82b6`；`rebalanceScheduler.js` `73978968…acad` |

### 12.2 方法声明（独立性）

- 未直接采纳 Implementer 的 29/29、server 214/214、worker 78/78 或 Orchestrator 复跑为结论；均自行重跑确认。
- **自建真实库探针** `review-057-probe.cjs`（临时，已删）：真实 `portomind_dev` + 真实 `shared`/`cron-worker` 代码 + **自有 runKey 命名空间 `review:057:<ts>:*` 与专用历史日 `2000-01-04`**；跑完只删自己的键，最终 DB 复原为 276/0/0。
- 对 **AC2 / AC5 / AC7** 各做一次负向对照（临时篡改 `taskRunner.js` → 断言 FAIL → 还原 → 验证 `git status` 空 + DB 276）。
- Implementer 的 `verify-task-057.cjs`（自带 cleanup，29/29）作为**取证来源之一**自行重跑：确认其"库里查不到 057 痕迹是正常"的关键特征（before=276 → 写入 14+2 → cleanup → after=276），不据此判"未实施"。

### 12.3 AC1–AC12 逐条判定（独立实测）

| AC | 判定 | 证据（本探针 / 独立核对） |
|---|---|---|
| AC1 | 满足 | `TaskRun.findById`/`findOne` 真实库回读 `result={"kept":{"nested":true}}` 非空；schema 仅新增可选 `result: mongoose.Schema.Types.Mixed`；status 枚举仍 `RUNNING/SUCCEEDED/PARTIAL/FAILED`（无 SKIPPED）；`{taskName,runKey}` 唯一索引 `unique:true` 零改动 |
| AC2 | 满足（已负向对照） | `normalizeCounts` 仅在 `hasOwnProperty('result')` 时透传；实库文档 keys 无 `ok`/`gap`；**负向**：改为 `Object.assign(normalized,result)` 全量透传后断言 FAIL（keys 出现 gap/ok），还原 PASS |
| AC3 | 满足 | 五类 result 形状（实库 + 代码双重）：价格 `{skippedCount}`；完整性 `{totals{expectedCount,actualCount,missingCount},checkedCount,skippedCount,completenessRatio,gapAssets[]}`（**不**存全量 `assets[]`/`missingRanges[]`）；提醒 `{evaluated,created,archived,failed}`；汇率 `{fxCount,currencies{USD/CAD/HKD:{ok:true,rateToCny:<数值>}}}`（三币数值+完成标志，D-02）；父任务见 AC4 |
| AC4 | 满足 | 自建探针真实调用 `runRebalanceCheck`（mock 2 个未归档组合 + 专用日 `2000-01-04`）并**自己查库**：`rebalance-check` 落库、`result.perPortfolio.length=2`=未归档组合数；未超阈项 `needsRebalance=false/suggestionsCount=0/recordId=null`，生成项 `recordId='review-record-1'/suggestionsCount=2/needsRebalance=true`；**两者可区分（D5 正面）**；每项 6 字段齐全 |
| AC5 | 满足（已负向对照，最高风险） | 并发首跑进行中（RUNNING）触发第二次 → 返回 `SKIPPED/ALREADY_RUNNING/skipPersisted=true`，首跑事后仍 **SUCCEEDED**（未被改 SKIPPED）；`taskskips` 落 1 条且 `activeRunKey`=首跑键；DUPLICATE_RUN_KEY 亦落 1 条；既有 SUCCEEDED 记录未被覆盖、同 key 仅 1 条；`recordSkip` 写失败仅 `skipPersisted=false`+受控日志，不放行业务。**负向**：把 `recordSkip` 改成只返回不写 → 两条「落 taskskips」断言 FAIL，还原 PASS |
| AC6 | 满足 | 实库索引实测 `{taskName:1,runKey:1} unique=true` 仍在；同 `(taskName,runKey)` 二次触发 `count=1`；进程内 `activeTasks` Map + DB 唯一键两层防重零改动 |
| AC7 | 满足（已负向对照） | 合法 result + `failureCount=0` → SUCCEEDED；`failureCount>0` → PARTIAL；未捕获异常 → 落库 FAILED（Implementer 脚本及单测佐证）。**负向**：有 result 时强制 SUCCEEDED → PARTIAL 断言 FAIL（实际 SUCCEEDED），还原 PASS |
| AC8 | 满足 | 原始 276 条 `result` 全缺失（`$exists:false`=276、`with_result=0`）；读侧 `getStatus` 不报错且 `rebalance-check.contractReady=false`（不把 null 当 `{}` 渲染 0 缺口） |
| AC9 | 满足（NG2 守住） | diff 逐个核对：默认 cron `0 3 / 30 3 / 0 4 / 30 9 / 0 0`、`SCHEDULE_DUE_RULES`、`isScheduleDue`、逐组合 runKey `${schedule}:${periodKey}`、`daily:<date>` 默认形、两层防重全部未变；alert/fx 仅加**可选** `options.runKey/trigger/now`，默认值不变；父 `runKey=marketDate()` 为 D-03 批准新增，不引入新锁、不改子任务 runKey；`server/src` 无 `node-cron`/`cron.schedule`（ADR-002） |
| AC10 | 满足 | 自行重跑 `test:server` **214/214**、`test:worker` **78/78**，均 exit 0；`rebalanceScheduler.test.js` +60 行 diff 逐行核对为**加法适配**：2 个 import、既有测试仅补 `TaskRun.create/updateOne` mock（注释明确"为保持原断言不变"）、新增 1 条父 result 用例；**未删除/未弱化**归档、到期、单组合失败隔离断言；`taskrun.logging.test.js` 同为加法 |
| AC11 | 满足 | `CRON_WORKER_DEV.md §5.1/5.2/5.3 + 新增 §5.5` 补 `result` 字段、SKIPPED 落库口径（`taskskips` 事件、不写 `taskruns`、schema 枚举仍 4 态）、父任务 `rebalance-check` taskName；`CRON_WORKER_OPS.md` 状态表（`:176` 等）与新口径一致：`SKIPPED` 为返回值、事件查 `taskskips`、父任务行已加。`docs:check` 既有 `docs/readme.md:66` broken link 与本卡无关（Implementer 已如实记录） |
| AC12 | 满足 | 本 §12 即独立 Reviewer 复核结论；Implementer 未自判通过（卡片 §11.4 AC12 明写「未进行」） |

### 12.4 Findings

| # | 严重度 | 位置 | 现象 | 对应 AC | 修法方向 |
|---|---|---|---|---|---|
| F-01 | MINOR | `scripts/verify-task-057.cjs` 及本卡验收方式 | 业务引擎（价格 fetcher/完整性 countAsset/提醒/汇率 provider/再平衡 ThresholdChecker·SuggestionGenerator·AlertCenter）在实库脚本中均为可控 mock；验证的是**落库契约/形状**，不是真实业务运行；AC8「上线首日读侧降级」以历史 276 条验证，未跑满一个真实调度周期 | AC3/AC4/AC8 | 063/064 联调与上线后跑满一个周期再确认数据就绪；已在计划 §11.8 如实标注，不阻塞 |
| F-02 | MINOR | `taskskips` 集合（D-01） | 无 TTL / 容量评估（D-01 明确本次不加）；`skipPersisted=false` 的消费方（TASK-064 读侧 `lastSkip`）尚未实现，当前只记录标志 | AC5/低优先级 | 留待 064/容量议题，不阻塞 |
| F-03 | MINOR | `docs:check` | 既有 `docs/readme.md:66` broken link 非本卡文件，未修 | AC11 | 非本卡范围，另立/顺手修 |
| F-04 | — | 环境 | `git worktree list` 实际 2 条（预期 3 条）；056 worktree 已注销 | 环境 | 记录事实，不影响审查 |

无 BLOCKER / MAJOR。**§8 停下上报条件逐条排除**：DB 连接 OK；status 枚举/唯一索引未改；调度语义（cron/runKey/防重）未改；既有测试未被弱化（纯加法）；正在跑的 TaskRun 未被改 SKIPPED（并发实证）；无需改 `client/`/读侧归一化（`server/src`、`client/` 零改动）。

### 12.5 负向对照记录（篡改 `taskRunner.js` → 断言 FAIL → 还原 → `git status` 空 + DB 276）

| AC | 临时缺陷 | 断言表现 | 还原 |
|---|---|---|---|
| AC2 | `normalizeCounts` 改 `Object.assign(normalized, result)` 全量透传 | `AC2 normalizeCounts…` FAIL（keys 出现 `gap/ok`）；20/21 PASS | 备份还原，SHA256 回 `0a7641c4…` |
| AC5 | `recordSkip` 改成只 `return { skipPersisted: true }` 不写 TaskSkip | `AC5 ALREADY_RUNNING 落 taskskips` FAIL、`AC5 DUPLICATE_RUN_KEY 落 taskskips` FAIL；19/21 PASS | 备份还原 |
| AC7 | 状态判定改为 `result.result ? 'SUCCEEDED' : …` 覆盖 failureCount | `AC7 failureCount>0 → PARTIAL` FAIL（实际 SUCCEEDED）；20/21 PASS | 备份还原 |

还原后重跑自建探针 **21/21 PASS**；每次 `git status --porcelain` 均为空（仅余 temp 探针，最终全部删除），DB 始终 276/0/0。

### 12.6 数据库前后条数对比（未污染证明）

| 时点 | taskruns | with_result | taskskips | rebalance-check | test_keys | unique_index |
|---|---|---|---|---|---|---|
| 审查前（基线） | **276** | 0 | 0 | 0 | 0 | true |
| Implementer `verify-task-057.cjs` 运行中（本人重跑取证） | 276 → +14 TaskRun / +2 TaskSkip → cleanup | — | — | — | — | true |
| verify 脚本后 | **276** | 0 | 0 | 0 | 0 | true |
| 自建探针运行中（本人，8 条自有键） | 276 → +8 → cleanup | — | — | — | — | true |
| **审查结束（最终）** | **276** | **0** | **0** | **0** | **0** | **true** |

最终权威查库：`db=portomind_dev taskruns=276 with_result=0 taskskips=0 rebalance_check=0 test_keys=0 unique_index=true status_enum=[RUNNING,SUCCEEDED,PARTIAL,FAILED]`。历史 276 条（AC8 被测对象）未被删改；唯一索引未 drop/重建；`taskskips` 集合由模型首次写入自动创建、无 TTL；所有自有测试键已清理。

### 12.7 残余风险与未验证项

- 未跑满一个**真实调度周期**（5 类任务各一次生产节奏）；业务引擎在实库脚本中为 mock（F-01）。上线首日数据就绪由 054/064 读侧降级 + 本卡写侧共同保证，本卡不宣称已生产就绪。
- `taskskips` 容量/TTL、`skipPersisted=false` 消费方（064 `lastSkip`）未验证（F-02）。
- 汇率方向错误（TASK-051）不归本卡；`currencies` 记真实数值后可能直接暴露该已知缺陷，属预期，不当作本卡回归。
- 历史僵尸 `RUNNING` 1 条未回填（读侧 stale 归 054/064），按范围约定不改。
- `docs:check` 既有 broken link 未修（F-03）。
- 未做 `taskruns` TTL/归档、暗色/前端渲染（Out of Scope，`client/` 零改动）。

### 12.8 判定

**Pass with issues** —— AC1～AC12 全部满足并经独立复核：AC2/AC5/AC7 负向对照证明断言非恒真；AC4 父任务可区分性（D5 解药）、AC5 并发首跑不被改 SKIPPED、AC9 调度语义零改动、AC10 既有测试纯加法适配、AC6 唯一索引、AC8 历史兼容均以真实库/diff 独立取证；Implementer 与 Orchestrator 数据（29/29、214、78、before=after=276）经自行重跑逐一吻合。无 BLOCKER / MAJOR；残余均为 MINOR（F-01 mock 边界与未跑满周期、F-02 taskskips 容量/064 消费、F-03 既有 docs broken link、F-04 环境观察），均不阻塞。

本结论为**判定词而非状态**；未改 Task Status / AC / Scope / 合入状态，未 `git add / commit / push`，未关闭 Task 或 Story。是否登记 `Reviewing`、合入与关闭由 Orchestrator / Human 依 STATES.md §4 处理。

> **2026-11-05 更新**：独立审查已完成，判定 `Pass with issues`（无 BLOCKER/MAJOR），记录见 §12.1～§12.8（worktree 提交 `54136c2`）。上句为规划期占位，保留以显示流转。

## 13. Completion Record

### 13.1 结案依据（2026-11-05）

| 项 | 事实 |
|---|---|
| 结案日期 | 2026-11-05 |
| 结案依据 | Human「reviewer 检验完成了，请更新所有文档状态」 |
| 实现 | `feature/TASK-057` @ `5bb47ea`（14 文件 +961/−84） |
| 审查记录 | `54136c2`（§12） |
| 审查判定 | `Pass with issues`，无 BLOCKER/MAJOR |
| 状态流转 | `Draft` → `Approved`（2026-11-05）→ `Implementing` → `Reviewing` → `Completed`（2026-11-05） |
| 合入 | **`Merged`** —— merge commit `1e421db`（2026-11-05 21:15），分支 tip `54136c2` |

### 13.2 DoD 逐条（[DEFINITION_OF_DONE](../../../os/process/DEFINITION_OF_DONE.md) §3）

| # | 要求 | 结论 |
|---|---|---|
| T-1 | 实现完成 | ✅ §11.2（14 文件） |
| T-2 | 验证完成，记录实际结果 | ✅ §11（29/29 实库）+ §12.6（Reviewer 独立复核） |
| T-3 | AC 逐条满足 | ✅ §12.3（AC1～AC12 全部满足） |
| T-4 | 审查收敛，无未决 BLOCKER，MAJOR 已整改 | ✅ `Pass with issues`，无 BLOCKER/MAJOR |
| T-5 | 文档同步 | ✅ §11 的 `CRON_WORKER_DEV.md` §5 / `CRON_WORKER_OPS.md`；本卡与计划 §12～§13、BOARD |
| T-6 | 已知妥协已记录 | ✅ §11.8 + §12.7（F-01～F-04） |

> 按 DoD §4，「合入 `main`」不属于任务级 DoD；`Merged` 字段单列，由 Human 判定。当前为 `Merged`（`1e421db`）。

### 13.3 遗留（不阻塞结案）

- **F-01**：业务引擎在实库脚本中为 mock，未跑满真实调度周期——上线后需跑满一个周期确认。
- **F-02**：`taskskips` 无 TTL / 容量评估；`skipPersisted=false` 消费方待 064 实现。
- **F-03**：`docs/readme.md:66` 既有 broken link，非本卡文件。
- **F-04**：worktree 数量与预期不符（056 已注销），环境事实。

### 13.4 对下游的影响（阻断 064）

`TASK-064` 计划已于 2026-11-05 批准，W0 前置为「057 合入 `main`」。本卡的 `shared/models/taskSkip.js` 与真实 `result` 写入是 064 的读取对象，**057 未合入前 064 不可开工**。

### 13.5 过程目录处置

按 [DOCS.md §1.1](../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期)，本卡与计划**留在** `development/delivery/US-001/`，待 Human 关闭 US-001 后整体归档。
