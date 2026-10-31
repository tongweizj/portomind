# TASK-056 — US-001 实施计划

## Status

Status：Draft

Owner：Planner（本轮已完成规划草案；实施者及独立Reviewer待指派）

Related Task：[TASK-056](./TASK-056.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：未来在真实源码工作区从已核对基线新建 feature/TASK-056；本轮只读基线为 chore/agent-rules-refactor，HEAD 2bde9131b8d47e4460ce9f87ea801839e37e1f7f，工作区已有无关改动，不得清理或覆盖。

Approval：未批准。新增/调整AC的建议和条件分支均不是Human决定。原任务AC保持不变，冲突见 §6。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task 的 §3，逐条引用该节、不增删改；覆盖 US-001/AC-02、09。验证映射见 §7。当前计划不允许实现US-001范围外的P1/P2功能、调度控制或既有汇率方向修复。

## 2. Context

需求、任务和未决项见 [Planner回交](./US-001-02-planner-return.md)。本任务需 ExecPlan：保留原卡计划要求，跨共享token、映射与图例消费方。不新增审批层。

## 3. Repository Findings

本轮只读源码核实位置、SHA256和证据边界见 [回交 §2](./US-001-02-planner-return.md)。未连接数据库、未执行应用/测试或DDL；部署Mongo版本、实际索引/集合与当前数据库数据均未核实。054历史测试日志只作既有证据，不能当成本次运行。

## 4. Proposed Design

在 client/src/constants/design-tokens.js 仅新增系统状态token，不修改up/down及现有消费者。推荐命名statusOk/statusWarn/statusBad/statusIdle，草案候选文字色为#166534/#854D0E/#B91C1C/#475569；实施时测白底文字对比度，不达4.5:1则调整本次新增色，不声称本轮已测色。

components/CronStatus/statusTone.js 维护ok/warn/bad/unknown到token、文字、图标的一处映射；StatusLegend在053shell首屏插槽显示“红=坏、绿=好”。颜色由实际dataStateLevel驱动，运行徽章独立；unknown只能表示未知/未跑/跳过说明，不能替代业务成功。055与063仅消费此映射，不创建自有色值。

## 5. Work Breakdown

- [ ] W1：核对现有design tokens及up/down消费集合，确定新增范围。
- [ ] W2：新增token、单一映射和非颜色状态标识。
- [ ] W3：在053shell集成首屏图例，给055/063导出稳定props和token接口。
- [ ] W4：测对比度、灰态不成功、既有行情消费集合及client验证。

## 6. Decisions

候选命名与色值属于计划设计，Human批准本计划前不算冻结；如计划批准前需要设计取舍，直接在本节记录。

决定详情与选项见回交 §4。Human批准前不得开始代码实施；有未决内容影响的分支不得按推荐值擅自实现。

## 7. Verification

以下为未来验收设计，未运行。适用命令入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)，不以历史数量作为预期。每条AC均有映射：

| Task AC | 验证方法与期望 |
|---|---|
| AC1～AC3 | 检查新增命名与映射；渲染四态取计算色对照token；限定看板无行情语义token，临时夹具负向验证。 |
| AC4、AC5 | 首屏图例可见；四态都有文字或图标，不依赖颜色。 |
| AC6 | 无记录/unknown样例不出现“正常/全部良好”。 |
| AC7 | 记录候选前景/背景的实际对比度，低于4.5:1不通过。 |
| AC8 | 对照up/down消费方集合与既有页面配色不变。 |
| AC9 | client build/lint入口通过，记录实际输出。 |

同基线有效证据可复用；只对新增/关键断言补负向对照，在临时副本或夹具操作，不污染被审实现。验证失败不得改断言掩盖实现问题。

## 8. Risks

系统色与涨跌色混淆、文字色不达对比度、消费者硬编码；用单一映射与原消费集合检测。

## 9. Rollback

先撤回消费者再撤新增token，或原子撤回同一交付；不更改数据库及行情颜色。

## 10. Implementer Handoff

本计划未批准，不构成实施交接。批准后由Orchestrator核对状态、依赖和对应版本，再交Implementer。仅按§4/§5修改范围内文件；不能读到必要源码、触及范围/AC/重大设计变化或数据库前置缺失时暂停受影响部分。提交实际文件清单、版本、AC结果、妥协与未验证项。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；本轮Planner自检不等于Reviewer判定。

## 13. Completion Record

尚未结案；无Human关闭或合入决定。
