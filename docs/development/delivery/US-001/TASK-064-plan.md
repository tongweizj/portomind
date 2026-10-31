# TASK-064 — US-001 实施计划

## Status

Status：Draft

Owner：Planner（本轮已完成规划草案；实施者及独立Reviewer待指派）

Related Task：[TASK-064](./TASK-064.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：未来在真实源码工作区从已核对基线新建 feature/TASK-064；本轮只读基线为 chore/agent-rules-refactor，HEAD 2bde9131b8d47e4460ce9f87ea801839e37e1f7f，工作区已有无关改动，不得清理或覆盖。

Approval：未批准。新增/调整AC的建议和条件分支均不是Human决定。原任务AC保持不变，冲突见 §6。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task 的 §3，逐条引用该节、不增删改；覆盖 US-001/AC-02、05～08、11（读侧兼容）。验证映射见 §7。当前计划不允许实现US-001范围外的P1/P2功能、调度控制或既有汇率方向修复。

## 2. Context

需求、任务和未决项见 [Planner回交](./US-001-02-planner-return.md)。本任务需 ExecPlan：共享API归一化与潜在新增查询，跨模型及调用方契约。不新增审批层。

## 3. Repository Findings

本轮只读源码核实位置、SHA256和证据边界见 [回交 §2](./US-001-02-planner-return.md)。未连接数据库、未执行应用/测试或DDL；部署Mongo版本、实际索引/集合与当前数据库数据均未核实。054历史测试日志只作既有证据，不能当成本次运行。

## 4. Proposed Design

集中在shared/services/cronStatus.service.js修正normalizeCurrencies/buildFxDataState；预期币种USD/CAD/HKD必须分别有可解析项，拒绝数组和非对象容器。对象形态按显式ok与rateToCny读取；历史数字形态仅可解释为数值观测，不能自动证明provider方向正确。建议兼容旧计划数值>0作为可读观测并在notes注明“仅数值观测”，是否记同步ok以D-02批准为准；空容器/缺必要字段contractReady=false、unknown并有说明，不裸bad或空集合all-green。

对齐057的totals/created/currencies/perPortfolio结果，保持旧键兼容分支与null含义。stale只复用既有常量，目标日、价格字段和路由参数不改。另修正buildRebalanceRows将result.due=null读成false的问题：只有显式boolean才视为已知；核对perPortfolio完整性及必要字段，缺项标unknown并解释。rebalanceLevel不能只因generatedCount<due就判bad，已到期且检查完成但needsRebalance=false是正常未超阈；有明确失败才判bad/相应异常，缺判定则unknown。保持生成数量本身真实，不把未超阈数加进generatedCount。共享函数影响detail时必须做旧详情回归，不新增P1页面。

若D-01选TaskSkip，主视图在已有聚合之外新增一次按taskName分组的TaskSkip最新事件查询，使用{taskName,skippedAt}索引。五项新增可选lastSkip（不存在为null）；不让skip替代lastRun，lastRun继续来自TaskRun。权限仍由原GET认证路径控制。详情非本Story交付，但已有detail不应回归。旧集合不存在应按明确可控的无记录处理，不通过捕获任意DB错误来假装数据正常。

新增lastSkip为API可选字段及查询预算变化，需本计划批准后实施，API_CONTRACT与DATA_MODEL同步。数据库/索引的创建归057，不在GET中自动创建或修复。

## 5. Work Breakdown

- [ ] W1：核对057最终决定和现行服务/test夹具，给正常/数字/空对象/缺币种列归一化期望。
- [ ] W2：落实D-02批准的汇率读取规则，补解释性notes和unknown边界。
- [ ] W3：D-01批准后增加批量skip只读聚合及可选lastSkip；无事件不改lastRun。
- [ ] W4：验证字段兼容、查询预算、目标日/detail/错误参数不回归，与057成功/缺失结果联调。

## 6. Decisions

D-01为独立skip查询的前置，D-02为数值形态语义的前置；新增可选字段与查询需要本计划Human批准。无需重开054，原结案证据保持历史，只在本Task记录新修正。

决定详情与选项见回交 §4。Human批准前不得开始代码实施；有未决内容影响的分支不得按推荐值擅自实现。

## 7. Verification

以下为未来验收设计，未运行。适用命令入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)，不以历史数量作为预期。每条AC均有映射：

| Task AC | 验证方法与期望 |
|---|---|
| AC1 | 数字值、显式对象、零/负/NaN、已知方向错误但合法正值分别按获批语义显示；不声称方向已修。 |
| AC2 | 空对象/数组/缺USD或CAD或HKD/非法项不能假绿或无解释bad；区分显式失败与未知。 |
| AC3 | 057批准的完整/缺项/历史无result映射；due=null不转false；未超阈为正常而非未生成失败；价格目标日与详情参数回归。 |
| AC4 | 最近skip不覆盖lastRun，首跑RUNNING/完成仍保持；无集合/无事件返回兼容null，真实DB错误不能吞成成功。 |
| AC5 | 捕获模型查询数量与形状，新查询为一次批量聚合；GET不触发任务、不写集合，参数行为及五任务顺序不变。 |
| AC6 | stub单测只证明读侧映射；复用057真实Mongo结果样例做读侧集成；未做的标缺证据。 |

同基线有效证据可复用；只对新增/关键断言补负向对照，在临时副本或夹具操作，不污染被审实现。验证失败不得改断言掩盖实现问题。

## 8. Risks

合法数值被当业务成功、只提供一个币种却整体绿、跳过掩盖真实失败、无条件catch隐藏数据库故障；要求notes、完整预期集及分离lastSkip。

## 9. Rollback

撤回新读取逻辑和lastSkip可选字段消费者；保留数据库事实，不删除TaskSkip；旧客户端忽略新可选字段，回退前记录重新暴露的旧缺陷。

## 10. Implementer Handoff

本计划未批准，不构成实施交接。批准后由Orchestrator核对状态、依赖和对应版本，再交Implementer。仅按§4/§5修改范围内文件；不能读到必要源码、触及范围/AC/重大设计变化或数据库前置缺失时暂停受影响部分。提交实际文件清单、版本、AC结果、妥协与未验证项。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；本轮Planner自检不等于Reviewer判定。

## 13. Completion Record

尚未结案；无Human关闭或合入决定。
