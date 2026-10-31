# TASK-063 — US-001 实施计划

## Status

Status：Draft

Owner：Planner（本轮已完成规划草案；实施者及独立Reviewer待指派）

Related Task：[TASK-063](./TASK-063.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：未来在真实源码工作区从已核对基线新建 feature/TASK-063；本轮只读基线为 chore/agent-rules-refactor，HEAD 2bde9131b8d47e4460ce9f87ea801839e37e1f7f，工作区已有无关改动，不得清理或覆盖。

Approval：未批准。新增/调整AC的建议和条件分支均不是Human决定。原任务AC保持不变，冲突见 §6。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task 的 §3，逐条引用该节、不增删改；覆盖 US-001/AC-02、05～08、10、11（前端接入与整合）。验证映射见 §7。当前计划不允许实现US-001范围外的P1/P2功能、调度控制或既有汇率方向修复。

## 2. Context

需求、任务和未决项见 [Planner回交](./US-001-02-planner-return.md)。本任务需 ExecPlan：跨组件数据/导航或状态逻辑，保留原卡计划要求。不新增审批层。

## 3. Repository Findings

本轮只读源码核实位置、SHA256和证据边界见 [回交 §2](./US-001-02-planner-return.md)。未连接数据库、未执行应用/测试或DDL；部署Mongo版本、实际索引/集合与当前数据库数据均未核实。054历史测试日志只作既有证据，不能当成本次运行。

## 4. Proposed Design

建议新增cronStatus.service.js经现有api.get('/cron/status')读取并解包统一响应，useCronStatus通过固定queryKey复用单快照；不启用refetchInterval，手动refetch之外关闭会使任务自动轮询的选项，初次挂载读取。query错误通过getApiErrorMessage展示，保持上次成功数据时使用其原generatedAt并明确“刷新失败/旧快照”，不得更新为本地当前时间。

CronBoard接053shell并消费055价格组件、056图例；按固定taskName查找五项，不假定数组始终完整。总览优先bad、再warn，存在unknown/缺记录而无其他异常时提示“数据未就绪”，只有五项dataStateLevel=ok且无缺口才显示全部正常；stale/缺契约单独解释，不从runStatus填绿。

完整性显示actualCount/expectedCount/missingCount/skippedNoLaunchDate和gapAssets；提醒显示evaluated/created/failed，created=0不是失败；汇率显示预期币种的记录和值并标注只是同步观测；再平衡显示due/generatedCount/失败及有问题组合列表，未超阈独立文案，不创建/logs/rebalance。

运行徽章以lastRun.status及stale派生，已发生但缺result显示未知数据；新增lastSkip只作“最近跳过尝试/原因/时间”，不把它覆盖到最新真实运行或数据完成度。未知字段不生成伪数据。卡片级容错应包住各卡格式读取；整个请求失败与单项格式异常按D-04区分。只读组件不引入mutation、写服务或任务触发。

## 5. Work Breakdown

- [ ] W1：按054/057/064契约产出成功、缺记录、缺result、skip、僵尸、零值和错误的前端夹具。
- [ ] W2：D-04明确后实现统一service/hook、初次读取、手动刷新与缓存过时提示。
- [ ] W3：把非价格四卡和总览真实字段绑定到053shell，接055/056，兼容旧API无lastSkip。
- [ ] W4：完成任务级错误隔离、未知/失败说明、五卡边界及原日志回归验证。

## 6. Decisions

D-04全请求失败与展示比例口径批准后才能满足被影响原AC；D-01若未选择独立TaskSkip，lastSkip展示设计需对齐最终方案。现行Story AC不改，条件设计只覆盖其既有价值。

决定详情与选项见回交 §4。Human批准前不得开始代码实施；有未决内容影响的分支不得按推荐值擅自实现。

## 7. Verification

以下为未来验收设计，未运行。适用命令入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)，不以历史数量作为预期。每条AC均有映射：

| Task AC | 验证方法与期望 |
|---|---|
| AC1 | 五卡稳定顺序/缺项补unknown，总览混合状态不假绿；只有五项ok才全部正常。 |
| AC2、AC3 | 完整性/提醒/汇率/再平衡均正常和缺失、部分失败；零提醒正常，未超阈不等于生成成功，无父任务unknown。 |
| AC4 | 无记录/缺契约/零目标/skip/STALE分别断言，skip时间与lastRun不同不覆盖正在运行。 |
| AC5 | 控制时间的首次读取/手动刷新/失败场景；有旧快照标明过时，无快照五卡不可用；原日志独立，确认无轮询。 |
| AC6、AC7 | 共享一次请求，055不重复拉取；数组缺项、单卡坏数据和跨时区目标日显示。 |
| AC8 | DOM和限定代码树无写入口；必要build/lint及原日志回归；真实读写契约接通后再做整体验收，不仅靠mock结案。 |

同基线有效证据可复用；只对新增/关键断言补负向对照，在临时副本或夹具操作，不污染被审实现。验证失败不得改断言掩盖实现问题。

## 8. Risks

请求失败时旧快照伪装新数据、unknown参与总览被误判、查询默认行为形成自动刷新、跨卡职责重叠；关闭轮询并用可控时钟/网络验证。

## 9. Rollback

撤回统一数据层和绑定组件，恢复053的未知占位及两个原日志视图。无数据库变更，不改已写结果。

## 10. Implementer Handoff

本计划未批准，不构成实施交接。批准后由Orchestrator核对状态、依赖和对应版本，再交Implementer。仅按§4/§5修改范围内文件；不能读到必要源码、触及范围/AC/重大设计变化或数据库前置缺失时暂停受影响部分。提交实际文件清单、版本、AC结果、妥协与未验证项。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；本轮Planner自检不等于Reviewer判定。

## 13. Completion Record

尚未结案；无Human关闭或合入决定。
