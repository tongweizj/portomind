# TASK-057 — US-001 实施计划

## Status

Status：Draft

Owner：Planner（本轮已完成规划草案；实施者及独立Reviewer待指派）

Related Task：[TASK-057](./TASK-057.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：未来在真实源码工作区从 up-to-date `main` 新建 `feature/TASK-057` 独立 worktree（沿 053/056 惯例）。规划期只读基线为 chore/agent-rules-refactor @ `2bde913`；**2026-11-04 复核**：四个目标文件 SHA256 与 [回交 §2](./US-001-02-planner-return.md) 记录逐一吻合（`taskRun.js` `c366c084…` / `taskRunner.js` `810a7e65…` / `rebalanceScheduler.js` `5e075a73…` / `cronStatus.service.js` `27a3cc56…`），shared/worker 未被 053/056 触及，既有发现仍有效。主工作区另有 `US-001-01-planner-handoff.md` 未提交改动（git 提交被沙箱拦截），不得清理或覆盖。

Approval：**计划本身未批准**。D-01～D-03 契约与 AC10 措辞更正已于 2026-11-04 经 Human 裁决（见 §6），本计划 §4 设计据此冻结；「批准需求/裁决分叉」不等于「批准计划」——计划批准仍需 Human 明确覆盖当前设计（STATES.md §4），获批前不构成实施授权。

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

## 5. Work Breakdown

- [ ] W1：先核实部署Mongo版本、TaskRun实际索引、数据权限和已有字段；数据库检查在安全开发库进行，当前未做。
- [ ] W2：按 §4 冻结契约产出 producer→adapter→consumer **冻结样例**（成功/缺契约/零值/失败/跳过/未超阈/未知各一）交 064/063 对齐，样例与兼容说明存档；仍不先写 schema 或索引。
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

OQ-5 确认**无需裁决**（源码已有 `TASK_PERIOD_HOURS`/`STALE_FACTOR` 单一常量来源，见 §4-6）。以上裁决冻结本计划 §4 设计；**计划本身**的批准仍待 Human 明确覆盖当前设计（STATES.md §4），批准前不得开始代码实施。

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

本计划未批准，不构成实施交接。批准后由Orchestrator核对状态、依赖和对应版本，再交Implementer。仅按§4/§5修改范围内文件；不能读到必要源码、触及范围/AC/重大设计变化或数据库前置缺失时暂停受影响部分。提交实际文件清单、版本、AC结果、妥协与未验证项。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；本轮Planner自检不等于Reviewer判定。

## 13. Completion Record

尚未结案；无Human关闭或合入决定。
