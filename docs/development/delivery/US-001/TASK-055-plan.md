# TASK-055 — US-001 实施计划

## Status

Status：Draft

Owner：Planner（本轮已完成规划草案；实施者及独立Reviewer待指派）

Related Task：[TASK-055](./TASK-055.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：未来在真实源码工作区从已核对基线新建 feature/TASK-055；本轮只读基线为 chore/agent-rules-refactor，HEAD 2bde9131b8d47e4460ce9f87ea801839e37e1f7f，工作区已有无关改动，不得清理或覆盖。

Approval：未批准。新增/调整AC的建议和条件分支均不是Human决定。原任务AC保持不变，冲突见 §6。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task 的 §3，逐条引用该节、不增删改；覆盖 US-001/AC-03、04、07、10。验证映射见 §7。当前计划不允许实现US-001范围外的P1/P2功能、调度控制或既有汇率方向修复。

## 2. Context

需求、任务和未决项见 [Planner回交](./US-001-02-planner-return.md)。本任务需 ExecPlan：跨组件数据/导航或状态逻辑，保留原卡计划要求。不新增审批层。

## 3. Repository Findings

本轮只读源码核实位置、SHA256和证据边界见 [回交 §2](./US-001-02-planner-return.md)。未连接数据库、未执行应用/测试或DDL；部署Mongo版本、实际索引/集合与当前数据库数据均未核实。054历史测试日志只作既有证据，不能当成本次运行。

## 4. Proposed Design

价格组件消费063提供的单次快照props，不另发请求、不自行取市场日。targetMarketDate按字符串展示；多市场差异和TARGET_LAGGED等由后端byMarket/notes解释，不用浏览器本地Date重新定日。

expected/fetched只取dataState，配色只取dataStateLevel并使用056映射，运行状态仅放运行徽章。推荐唯一presentation helper对expected>0且数值合法时计算显示百分比并将进度宽度钳制0～100；expected=0显示—且灰色，无效/缺失显示unknown，绝不把null当0。该格式计算不重算业务expected/fetched；与原AC6的禁除法措辞冲突，必须D-04批准后改原AC才能实施。

missing列表按symbol/name/market展示和折叠；缺失总数用实际数组。全请求失败由063统一错误/过时快照；单价格数据错误只影响本卡。D-04批准前保留原AC8/AC9，不宣称此推荐已满足旧AC。

## 5. Work Breakdown

- [ ] W1：核对054价格dataState确无percentage，列出与原AC6/8/9的差异，等待D-04。
- [ ] W2：按批准口径实现纯展示helper、进度/缺失清单与056映射。
- [ ] W3：接063共享请求状态，区分无记录/缺契约/请求失败；不自算目标日。
- [ ] W4：执行0/0、过量、时区、假绿、清单、局部异常与整体失败验证。

## 6. Decisions

D-04 必须先决：建议修改原AC6允许唯一展示比例helper；AC8区分整请求失败与单项失败；AC9区分无记录、缺契约与缺失dataState。Planner本轮未改原AC正文，不通过“补注释”绕过验收标准。

决定详情与选项见回交 §4。Human批准前不得开始代码实施；有未决内容影响的分支不得按推荐值擅自实现。

## 7. Verification

以下为未来验收设计，未运行。适用命令入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)，不以历史数量作为预期。每条AC均有映射：

| Task AC | 验证方法与期望 |
|---|---|
| AC1～AC3 | 目标日/应采/已采/百分比与缺失清单；正数齐全/部分/全缺四态场景。 |
| AC4、AC5 | 0/0显示—不NaN/Infinity/0%；超量不溢出，异常不默认为健康。 |
| AC6 | 现行API无percentage，原文存在冲突，待D-04批准明确验证唯一展示helper；未决定前不得判为满足。 |
| AC7 | SUCCEEDED但fetched=0时仍为bad，运行徽章与数据态独立。 |
| AC8、AC9 | 待D-04明确后的全请求失败/单卡异常/旧快照及无记录/缺契约分别验证；原AC暂保留。 |
| AC10 | 切换浏览器UTC+8/UTC-7，目标日字符串一致。 |
| AC11 | client build/lint执行并记录实际结果。 |

同基线有效证据可复用；只对新增/关键断言补负向对照，在临时副本或夹具操作，不污染被审实现。验证失败不得改断言掩盖实现问题。

## 8. Risks

未批准即改写AC、时区偏移、null变零、整体失败被伪装局部成功；以D-04门槛与分层错误场景控制。

## 9. Rollback

撤回价格组件及其props接入，不修改API和历史数据；保留骨架unknown状态。

## 10. Implementer Handoff

本计划未批准，不构成实施交接。批准后由Orchestrator核对状态、依赖和对应版本，再交Implementer。仅按§4/§5修改范围内文件；不能读到必要源码、触及范围/AC/重大设计变化或数据库前置缺失时暂停受影响部分。提交实际文件清单、版本、AC结果、妥协与未验证项。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；本轮Planner自检不等于Reviewer判定。

## 13. Completion Record

尚未结案；无Human关闭或合入决定。
