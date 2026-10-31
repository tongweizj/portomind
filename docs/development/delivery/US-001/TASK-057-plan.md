# TASK-057 — US-001 实施计划

## Status

Status：Draft

Owner：Planner（本轮已完成规划草案；实施者及独立Reviewer待指派）

Related Task：[TASK-057](./TASK-057.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：未来在真实源码工作区从已核对基线新建 feature/TASK-057；本轮只读基线为 chore/agent-rules-refactor，HEAD 2bde9131b8d47e4460ce9f87ea801839e37e1f7f，工作区已有无关改动，不得清理或覆盖。

Approval：未批准。新增/调整AC的建议和条件分支均不是Human决定。原任务AC保持不变，冲突见 §6。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task 的 §3，逐条引用该节、不增删改；覆盖 US-001/AC-05～08（写侧支撑）。验证映射见 §7。当前计划不允许实现US-001范围外的P1/P2功能、调度控制或既有汇率方向修复。

## 2. Context

需求、任务和未决项见 [Planner回交](./US-001-02-planner-return.md)。本任务需 ExecPlan：共享schema、任务执行与数据库可观测性变化，且涉及未决契约。不新增审批层。

## 3. Repository Findings

本轮只读源码核实位置、SHA256和证据边界见 [回交 §2](./US-001-02-planner-return.md)。未连接数据库、未执行应用/测试或DDL；部署Mongo版本、实际索引/集合与当前数据库数据均未核实。054历史测试日志只作既有证据，不能当成本次运行。

## 4. Proposed Design

以下为推荐待批准方案，不是已实现或已裁决：

1. shared/models/taskRun.js 增可选result:Mixed；taskRunner.normalizeCounts仍只保留四个计数/失败项，额外只透传调用者显式result，不透传任意顶层字段。原RUNNING/SUCCEEDED/PARTIAL/FAILED及唯一索引保持。
2. D-01推荐新建独立TaskSkip模型/集合（建议taskskips）：{taskName,runKey,trigger,status:'SKIPPED',reason,skippedAt,activeRunKey?}，索引{taskName:1,skippedAt:-1}；两条跳过分支均记新事件，真实TaskRun不覆盖，execute不二次执行。观测写失败时只记录受控错误和未持久化标志，不因此执行被防重阻止的业务，不谎称可查询。064只读最近事件，使用可选lastSkip，不污染lastRun。新集合写权限、容量与备份需在部署前核对；本次不自动加TTL。
3. result建议结构：完整性保留totals{expectedCount,actualCount,missingCount}、checkedCount/skippedCount/completenessRatio、gapAssets[{symbol,missingCount}]；不全量存assets或堆栈。提醒存evaluated/created/archived/failed；价格存skippedCount；汇率存fxCount及currencies{USD/CAD/HKD:{ok:true,rateToCny:<实际入库值>}}，仅在真实完成该币种写入时记成功。采集/写入失败不补造三币均成功的结果，错误信息和运行FAILED继续显示，暂不声称有细粒度失败轨迹。是否扩展部分写入结果另由D-02批准，不修方向。
4. D-03推荐在runRebalanceCheck内部包runTrackedTask，父名rebalance-check，runKey为marketDate(now,timezone)，trigger保持真实来源；拆出内部分发body并保留公开函数原有flat summary字段（dueCount/skippedCount/failureCount等）给现有调用者，额外结果放result.perPortfolio。每项记录portfolioId/due/needsRebalance/suggestionsCount/recordId/status和必要失败原因；未到期due=false，其余无法判定为null；未超阈为false/0/null；失败保留阶段性事实，不假定未生成。跳过的子任务没有本次execute结果，不能猜needsRebalance，读取到同key真实既有记录时才引用其result，否则显示unknown并标明SKIPPED原因。
5. 父任务生成数按真实suggestions/recordId，不把successCount（执行没报错）等同生成数。原逐组合runKey、调度cron、到期规则和归档过滤不变。原测试TaskRun调用会多出父记录，改测试只适配新父记录，不删除归档/到期/单组合失败隔离断言。
6. 复用现有cronStatus.constants.js的TASK_PERIOD_HOURS、STALE_FACTOR及staleThresholdHours，当前每日任务48h，057不再新建阈值或回填僵尸。064承接读侧格式、skip查询与边界，不把server/前端夹带到057。

## 5. Work Breakdown

- [ ] W1：先核实部署Mongo版本、TaskRun实际索引、数据权限和已有字段；数据库检查在安全开发库进行，当前未做。
- [ ] W2：获得D-01～D-03决定，冻结producer/adapter/consumer样例及兼容说明，不先写schema或索引。
- [ ] W3：修改可选result和严格透传；新增获批的跳过载体、两条分支持久化及失败观测。
- [ ] W4：为五类任务补真实result，内部包父任务并保持既有调用者字段；每项区分生成/未超阈/失败/未知。
- [ ] W5：补单元与真实Mongo验证、原防重/五任务回归，更新TaskRun及运维文档，联调064。

## 6. Decisions

D-01：载体选择待Human批准，推荐独立TaskSkip，不执行旧partial-index示例；需允许新模型/集合及064读侧配套。D-02：摘要裁剪与汇率可观测性待确认。D-03：内部父包裹、父runKey及测试兼容待批准。OQ-5已在源码有单一常量，本轮无需重新设阈值；若需要改变调度周期再提出。所有推荐均待决定，TASK-057原AC5/6/9不改。

决定详情与选项见回交 §4。Human批准前不得开始代码实施；有未决内容影响的分支不得按推荐值擅自实现。

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
| AC10 | 执行适用server/worker回归，数量以实际为准；原卡229条为旧基线而非当前验收目标。保留原断言并说明父记录导致的新增调用预期；需要更正AC10固定数量措辞时交Human。 |
| AC11、AC12 | 文档记录实际result与跳过观测载体；独立Reviewer提供证据与结论，不能自判通过。 |

同基线有效证据可复用；只对新增/关键断言补负向对照，在临时副本或夹具操作，不污染被审实现。验证失败不得改断言掩盖实现问题。

## 8. Risks

partial索引/合成键可能弱化防重；父锁与子锁语义冲突；result数据量扩大；FX已知方向缺陷被误解为新修复。推荐方案不改已有唯一索引，父/子分层防重，并以事实字段和限量摘要控制。数据库版本与真实索引为实施前待验证事实。

## 9. Rollback

推荐独立集合路径无既有索引迁移。撤回读取/写入代码后保留已写result及taskskips数据，不自动删集合、不回填旧RUNNING。任何删数据另由Human明确决定。若Human改选partial-index则必须另补获批的迁移、恢复及停机验证，不能直接套本回退方案。

## 10. Implementer Handoff

本计划未批准，不构成实施交接。批准后由Orchestrator核对状态、依赖和对应版本，再交Implementer。仅按§4/§5修改范围内文件；不能读到必要源码、触及范围/AC/重大设计变化或数据库前置缺失时暂停受影响部分。提交实际文件清单、版本、AC结果、妥协与未验证项。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；本轮Planner自检不等于Reviewer判定。

## 13. Completion Record

尚未结案；无Human关闭或合入决定。
