# US-001：Planner → Orchestrator 回交

日期：2026-10-30。Planner 已按 Human 本轮指令完成源码只读核对、任务覆盖与 Draft 计划。**没有代码实施、测试实跑、数据库操作、计划批准或任务关闭。**

> §1～§6 保留 Planner 回交时的快照；随后 Orchestrator 的接收、任务登记和 Human 审阅入口见 [§7](#7-orchestrator-接收与-human-审阅清单)。当前任务状态以卡片为准，不以历史快照中的数量或待登记描述为准。

## 1. 交付与当前状态

- 复用 TASK-053～057，补上所属Story及Story AC反向字段；054的Completed和Merged登记不变，未补建054实施计划。
- 新增两份待登记任务内容：[TASK-063](./TASK-063.md) 五卡真实接入；[TASK-064](./TASK-064.md) 读侧结果兼容。编号已保留，但未由Planner填写Status，不计入已登记Task数量；已按Human指令迁入Story交付目录，仍待Orchestrator正式登记。
- 053/055/056/057/063/064各有一份Draft，均未批准；现有卡保留原状态与AC，计划里的澄清建议不覆盖原文。
- 当前Story保持Planning。已登记Task仍5项（4 Backlog+1 Completed）；另有2份待登记内容。规划不是实施许可，不能把新增任务提案直接计为已进入执行队列。

## 2. 源码与证据核对

只读源码目录D:/projects/portomind，分支chore/agent-rules-refactor，HEAD=2bde9131b8d47e4460ce9f87ea801839e37e1f7f；工作区有既有未提交改动，未覆盖或清理。本轮对下列核心文件的git diff --stat为空；git merge-base --is-ancestor c7389d1 HEAD返回0，确认054提交是当前HEAD祖先。此为源码祖先核对，不代Human更新Merged。

| 事实 | 本轮亲读位置（相对真实源码根） |
|---|---|
| TaskRun无result、状态仅四态，taskName/runKey全局唯一索引仍在schema | shared/models/taskRun.js:3～35；实际数据库索引未查 |
| normalizeCounts只保留四类计数字段；两条跳过仅日志+返回；真实TaskRun.create后执行、update后完成 | shared/services/taskRunner.js:6～37、50～66 |
| 价格目标日/数据态已实现，dataState不提供百分比字段 | shared/services/cronStatus.service.js:219起；API_CONTRACT的价格字段与之对应 |
| 数字汇率normalize时ok仅识别true或'ok'，空对象被视为contractReady | shared/services/cronStatus.service.js:464～512；确认054历史P1/P2问题的代码条件仍在，未运行复现 |
| 五任务周期表和staleFactor已有单一来源，当前阈值48h | shared/constants/cronStatus.constants.js:24～39、57起；不重新设常量 |
| runRebalanceCheck未包父TaskRun、只逐组合跟踪，无perPortfolio；返回summary含dueCount等 | cron-worker/src/schedulers/rebalanceScheduler.js:56～131；现有测试断言调用与flat summary，需保留原语义 |
| FX provider校验三币后依次写入，成功后才返回全部记录；中途写失败可能有部分持久化但函数抛出 | shared/services/fxRate.service.js:fetchFromProvider/syncLatestRates；不能称数据库写入为原子“全或无” |
| 提醒返回stats但顶层多字段会被runner吞；完整性返回totals/checked/skipped/assets等 | cron-worker/src/schedulers/alertScheduler.js:execute，cron-worker/src/tasks/integrityCheck.js:205～383 |
| 日志页只有server/task两视图，client已有统一axios解包与认证处理 | client/src/pages/LogViewer.jsx:1～139；client/src/services/api.js:1～56 |
| 系统色token尚未有独立四态；项目有Query依赖，但没有client test脚本 | client/src/constants/design-tokens.js；client/package.json |

为避免HEAD掩盖工作区状态，保存输入指纹供后续比较（SHA256，不是测试通过证明）：

| 源文件 | SHA256 |
|---|---|
| shared/models/taskRun.js | c366c084c32484b200da6a5454b76a69983fb3526c39a5feada6e933c99dff2a |
| shared/services/taskRunner.js | 810a7e650727cea1bbb1e43b0e9508126f12101dfc8faa6d4490aec5330ecf16 |
| shared/services/cronStatus.service.js | 27a3cc561e12d997df730a27b6709202d3ef51ed0c7d615bca2f418929cac261 |
| shared/constants/cronStatus.constants.js | 736fb285b0a67609ed44ef926ae84a55d0f3ecbb46dfa3ab42ffa582d30e87b5 |
| cron-worker/src/schedulers/rebalanceScheduler.js | 5e075a73cb75ac3628f0b134aa7830b6dbaf743f4ab91f4c4eee6953a7130a55 |
| cron-worker/src/schedulers/cronScheduler.js | 4cda565017111fe4fe88b070a2fb86aee55e9d28ae50f6b6ec598a4f7a2a3b1c |
| cron-worker/src/schedulers/fxScheduler.js | 17c52ce94e93c63737d71c154e46a1077b940b2a046e25d589a8c30ae1b55f15 |
| cron-worker/src/schedulers/alertScheduler.js | da315847e91632638d06d3354a7eb3cba359791c14d5be58ab853ca220a12903 |
| cron-worker/src/tasks/integrityCheck.js | 2a7059cbfae2ebd603891fa8047eed03fe2286c97be18d65d5b5ecd16c68a33b |
| shared/tasks/dailySync.js | ef35cb9661934646c478acea632161067b7bfd6a3d357a29c4b414830f66d812 |
| shared/services/fxRate.service.js | fdf80ebc76285baa3a473d0210bd3770a9a962104c135da8a1c12a4aa7b1030d |
| client/src/pages/LogViewer.jsx | 9dbe0c126c08ec699ff7b2ac34a6ea2aeb4ed42844efb54f9c319521807c2f0c |
| client/src/services/api.js | 705d0376bef51aa095ebf561e1e864c254e4ccd8889b41173fed8158a9ae45e2 |
| client/src/constants/design-tokens.js | 386b56e796958e51db9129e289557617cf8edfaed698dbd8ae6bd75fb1e3affc |
| server/test/integration/cronStatus.service.test.js | e71fbcb0d44d510d0f5b8112a67783710b3853a44a90e36612359c866b58baec |
| server/test/integration/cronStatus.api.test.js | f94fa3c38deeeef5e6c91c0e1433b4cf24c637d55f031b5dc10b4eff84694f2c |
| server/test/integration/taskrun.logging.test.js | dd8a4b5f07fca9ac3b8a62aa6751b8480c5ddc3aed9a9953ae68ce2e970e4338 |
| cron-worker/test/rebalanceScheduler.test.js | 27508fa12c9c0b48d2ea5ec8284304ec0dbaa3ed20733ac414bd8b48fec63b13 |

未核实：运行Mongo版本、开发/生产实际索引、数据库结果、实时API、浏览器、当前测试结果。未读取或输出.env/凭据。054历史证据见其计划§11～§13；现有cronStatus测试明确使用模型stub，不冒充Mongo持久化验证。

**054复用结论：** 当前源码具备该接口与测试入口，历史实施版本可追溯；可复用既有字段设计和静态代码事实。未确认相同运行环境，不把历史测试通过当作本次实跑。057改变输入结果后必须验证新契约，数字/空对象问题由064承接，保持054历史关闭不变。

附加源码核对：cronStatus.service.js:546～635 的 buildRebalanceRows 用 result.due===true 将 null 变为false；rebalanceLevel 用 generatedCount<due 判bad，无法区别正常未超阈与未处理。064已纳入相应归一化与状态修正草案，避免057接通后错误放大；未实施或重新打开054。

## 3. Story AC 覆盖与新增任务理由

| Story AC | Task AC / 计划工作项 | 覆盖说明 |
|---|---|---|
| AC-01 | 053 AC1/2/5；053 W1/W2 | 入口、URL、原日志行为 |
| AC-02 | 053 AC3/4；056 AC2/4/6；063 AC1/6；054既有快照 | 骨架与真实五卡/总览明确分开 |
| AC-03 | 055 AC1～3/7；054价格派生 | 真实应采已采与missing，数据态不由运行态填色 |
| AC-04 | 055 AC4/5/10；054有效目标日 | 价格格式比例与整体失败澄清待D-04，未改原AC |
| AC-05 | 057 AC1～3/8；064 AC1～3；063 AC2 | producer→adapter→UI完整链；汇率部分写失败信息局限待D-02 |
| AC-06 | 057 AC4；064 AC3；063 AC3 | 父结果+首屏异常摘要，不扩到P1详情页 |
| AC-07 | 053 AC7；055 AC9（待澄清）；057 AC8；064 AC2/3；063 AC4/5/7 | 缺记录、缺契约、全请求失败分别处理 |
| AC-08 | 057 AC5/6；064 AC4；063 AC4 | 推荐分离lastSkip与lastRun，不以skip覆盖真实运行；载体待D-01 |
| AC-09 | 056 AC1～8；063 AC6 | 四态、图例、非颜色标识及消费方接入 |
| AC-10 | 063 AC5～7；055 AC8（待澄清）；053 AC5/7 | 共享一次快照、手动刷新、过时提示及原日志隔离 |
| AC-11 | 053 AC5/6；063 AC8；064 AC5；054既有只读 | 新代码同样受只读与原日志回归约束 |

063只填补原053骨架之外的接入缺口，避免扩大053范围；064在新Task承接既有读侧缺陷和新观测读取，不把写侧057扩展为前端/读API修改，也不重写054的结案历史。原卡AC无正文变更；冲突明确列D-04供Human决定。覆盖关系已可逐条追踪，但D-01～D-04未定，不能声称所有AC已具备无条件可实施方案。

## 4. 待 Human 决定的具体方案

### D-01：跳过记录载体（057 OQ-1）

**推荐独立TaskSkip集合（原方案D），保留TaskRun唯一索引与runKey。** 两类跳过作为事件持久化，064读取可选lastSkip；真实lastRun不变。代价是新模型、写权限/容量和一次批量读取，计划均已列出，不宣称零成本。

备选B合成runKey无索引迁移但改变runKey稳定语义，需明确批准放宽原约束。备选C只记一种跳过不满足两路径可观测性，不推荐。备选A部分唯一索引仍需迁移并与原AC6的同key记录数量约束冲突；原示例status:$ne不在[MongoDB官方partialFilterExpression支持列表](https://www.mongodb.com/docs/manual/core/index-partial/)中，不能直接执行。官方现行文档不等于部署版本已核实，不能把列表中较新运算符直接套到未知版本。若改选A需重写并验证正向过滤/历史数据/唯一性与回滚，不沿用原示例。

Human需决定：是否采用推荐新集合与可选API字段，或改选方案并明确允许的契约变化。本轮未执行DDL、创建集合或写入数据。

### D-02：result摘要及汇率可观测性（057 OQ-2/OQ-4）

推荐完整性保存totals/checked/skipped/completenessRatio与gapAssets摘要，不保存全量缺口区间；提醒使用evaluated/created/archived/failed；汇率使用显式currencies对象，ok仅说明本次实际写入完成，值来自真实返回，不能证明汇率方向正确。中途失败可能部分写入；本次建议失败运行显示FAILED+数据未知，不为三币补造成功或失败标志。若产品要求精确逐币种失败轨迹，需明确扩大观测范围并调整Draft，不能在规划中虚构已有能力。

读侧兼容旧数字形态与空对象由064实现，数值合法仅说明数值观测可读。Human需确认摘要裁剪、值/标志含义和失败时未知的边界；TASK-051方向修复不并入。

### D-03：父任务位置及键（057 OQ-3）

推荐在runRebalanceCheck内部跟踪父任务，父runKey为marketDate(now,timezone)，逐组合runKey及原调度规则不变；保留公开函数原flat summary字段。与只包scheduler回调相比，直接函数入口也可观测，代价是测试要区分父/子调用，父跟踪增加批次防重。此行为应明确批准，不能因“避免改测试”而只覆盖一个入口。

子任务已跳过时不能猜本次生成结果；引用同key真实既有result或保留unknown。Human需确认内部入口、父级防重影响及测试兼容方案。旧“2×周期”阈值已由源码常量覆盖，本轮不另提审批或重复定义。

### D-04：055原AC6/8/9澄清（不改Story AC）

推荐：AC6允许一处纯展示比例helper，业务expected/fetched/目标日仍只由后端派生；AC8区分整体请求失败与单项失败，有上次成功快照时明确旧数据+失败，无快照则五卡不可用，原日志独立；AC9区分无记录与缺契约，不把所有dataState缺失写成“暂无运行记录”。

理由：实际API没有百分比字段，单个聚合请求abort无法证明其他四卡仍获得新数据。保留接口不增加多个请求以“做绿”旧断言。Human批准澄清后再由相应负责人修改原Task AC；本轮原文未动，055和063涉及部分不能先实施。

## 5. 计划必要性、依赖与授权缺口

| Task | 本轮产出 | 计划依据 / 前置 |
|---|---|---|
| 053 | [Draft](./TASK-053-plan.md) | 保留原卡要求，路由/原日志重构及多组件边界；无额外产品决定，仍待Human计划批准 |
| 054 | 既有完成计划引用，不新增 | 核实存在与祖先关系；不重新批准/关闭 |
| 055 | [Draft](./TASK-055-plan.md) | 跨状态/日期/价格展示；D-04先决，依赖053/056/063接入约定 |
| 056 | [Draft](./TASK-056-plan.md) | 保留原卡要求，token/映射/图例跨消费者；批准后可先准备并与053集成 |
| 057 | [Draft](./TASK-057-plan.md) | schema/防重/父任务；D-01～D-03和数据库核查未闭环 |
| 063 | [Draft](./TASK-063-plan.md) | 多卡数据/共享请求与异常集成；先正式登记，D-04及最终契约决定后实施 |
| 064 | [Draft](./TASK-064-plan.md) | 共享读侧兼容、可选字段/新增查询；先正式登记，依赖D-01/D-02 |

没有为本轮任务强行选择免计划；常规多角色交接本身不是依据。所有Draft未批准，不能把“可提交评审”表述为“可开始实施”。

建议顺序：先决定契约和D-04；053与056可先提交计划评审，批准后按文件冲突串行集成；057与064冻结同一结果样例并成对验证；055/063在shell与token就位后集成。不同分支成功不等于完整Story通过，最终需真实读写结果与浏览器整体验收。

## 6. 回交 Orchestrator

1. 登记接收本轮规划，保留Story Planning；053/055/056/057是否转Planning由Orchestrator核对Human本次优先级依据后登记，Planner本轮未改状态。
2. 063/064已平铺归入所属Story交付目录；正式登记时填写合法Status和Owner，核对计划、Story、索引及回交链接；同时更新注册Task数。此前看板仅列“待登记内容”，不计入六态汇总。
3. 向Human提交D-01～D-04及对应Draft。053/056无新的产品分叉，可先评审；其余待受影响决定闭环后批准，勿要求逐张重复立项。
4. 054保持Completed，不重开；064处理新修正，不把已完成状态当作新功能已通过。
5. 无计划处于Approved；目前可进行审阅和补证，**无Task可因本轮回交直接实施**。不运行数据库变更、worker、接口服务或全量测试来替代批准。

本轮自检只验证文档链接、编号、覆盖关系和原Task AC/Status保留，不是独立Reviewer审查或完整交付流程通过。

## 7. Orchestrator 接收与 Human 审阅清单

日期：2026-10-30。登记角色：Orchestrator。依据：Human 本轮明确要求接收 US-001 规划、核对后登记 TASK-063/064、同步看板并提交决定与 Draft；状态权限见 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态)。本节是接收与调度记录，不是 Planner 的新设计、Reviewer 结论或 Human 批准。

### 7.1 已登记与核对结果

- 已正式登记 [TASK-063](./TASK-063.md)、[TASK-064](./TASK-064.md)，初始 Status 为 Planning，Priority 为 High，Owner 为待指派。两卡补齐现有 Story 的接入与读侧缺口，未增加 Story 范围；登记沿用当前 Story 授权，不另造立项批准。
- 已接收 TASK-053/055/056/057 的 Draft，将四卡原 BACKLOG 登记为 Planning，分别在卡片保留原阶段和本轮依据。六张待实施卡统一处于规划审阅阶段；没有进入 Implementing。
- [TASK-054](../../tasks/completed/TASK-054-cron-status-aggregate-api.md) 仍为 Completed，[既有计划](../../exec-plans/completed/TASK-054-cron-status-aggregate-api.md) 与 BOARD 中的 Merged #36 均未改变；不重开、不重复批准、不将其历史结果当作本轮运行。
- 规划材料已具备提交审阅的入口：七张关联卡、六份 Draft、§3 的 11 项 Story AC 覆盖矩阵及任务/计划反向链接均已核对。覆盖表示有承担任务，不表示已验证、已批准或所有依赖已解决。
- 结果写侧→读侧适配→前端分别由 057→064→063 承担；053 提供骨架，056 提供统一映射，055 提供价格组件，054 提供既有读侧支撑。055 与 063 的接入依赖仍需明确接口，见 R-01。
- 当前 Story 保持 Planning；已登记关联 Task 为 7 项：6 Planning、1 Completed。没有待登记卡，没有实施者或独立 Reviewer 已被指派。

### 7.2 待 Human 决定：D-01～D-04

以下推荐均来自 Planner，Orchestrator 仅整理提交；“推荐”不构成默认批准。完整依据与方案见本文件 §4 及 [TASK-057 §7](./TASK-057.md#7-open-questions需-human--pm-裁决)。

| 决定 | 问题、选项与 Planner 建议 | 影响及需要 Human 明确确认的内容 |
|---|---|---|
| D-01：跳过记录载体 | 同一业务键必须防重，两种跳过又都需持久化。推荐 D：独立 TaskSkip 集合；备选 A 为重建部分唯一索引、B 为合成 runKey、C 为只记录一种跳过。A 的原索引示例不可直接执行，C 不满足现行两路径观测要求。 | 是否采用新集合、保留原 TaskRun 唯一索引/runKey，并允许 064 的可选 lastSkip 读取。影响 057/064/063、权限、容量、索引与查询成本；改选方案需 Planner 先对齐相关 Draft，不能直接套推荐计划。 |
| D-02：结果摘要与汇率含义 | 推荐完整性摘要加 gapAssets，不存全量区间；提醒保留真实统计；汇率记录可证实的 currencies 值及标志。失败可能已部分写入，建议显示 FAILED 与结果未知，不补造逐币种成败。备选为更完整 report、topN 摘要或扩展逐币种失败观测。 | 确认摘要字段/裁剪边界、显式成功标志的证据、旧数字结果的读取含义，以及“失败后未知”的产品表达是否可接受。正数可读不证明同步或汇率方向正确；TASK-051 不并入。需要更细失败轨迹时应先调整规划。影响 057/064/063。 |
| D-03：再平衡父任务 | 推荐在 runRebalanceCheck 内部跟踪，父键采用市场日，保留公开函数的原 flat summary 和逐组合调度键；备选只包 scheduler 回调，会漏掉直接函数调用。 | 确认跟踪入口、父级每日防重对重复调用的影响及父/子测试适配；不得弱化原调度与隔离断言。影响 057、064 归一化与 063 展示；既有僵尸阈值不另立一套。 |
| D-04：055 AC6/8/9 | 推荐允许唯一的纯展示比例 helper；区分全请求失败与单卡异常；区分无记录与缺契约。有旧快照时显示过时与刷新失败，无快照时五卡均不可用，原日志独立。备选为保留原 AC，退 Planner 重拟可满足原文的方案。 | 确认是否接受这三项澄清。获明确同意后，由有权限的负责人更新原 Task AC，并由 Planner 对齐 055/063 Draft；本轮未改 AC。影响 055/063，以及最终整合验证；Story AC 不改。 |

### 7.3 计划审阅与批准登记

初次接收规划时六份文件均为Draft。随后2026-10-30，Human明确仅批准TASK-053当前设计，Orchestrator代登记为Approved，批准不含其他任务或D-01～D-04；其§1～§9设计未改。当前其余5份计划仍为Draft。决定某个D项不自动批准其他计划，未失效的同一设计批准不重复索取。053工作区及未派发交接见其计划§10。

| Task / 计划 | 本次审阅重点 | 实施前仍需满足 |
|---|---|---|
| [053 · Approved](./TASK-053-plan.md) | Human已批准当前设计，仅覆盖本卡；不吞并063真实接入 | [启动核对](./TASK-053-plan.md#10-implementer-handoff) 已确认真实源码和相关基线，但独立feature工作区尚未就绪；Task保持Planning，Owner待指派，交接未派发。 |
| [056](./TASK-056-plan.md) | 四态 token、单一映射、文字/图标与对比度验证 | 本计划明确批准；命名与候选色随设计冻结；与 053 的图例插槽及改动顺序协调。无新增产品分叉，可先审阅。 |
| [055](./TASK-055-plan.md) | 目标日只读、价格比例与缺失清单、局部/全请求错误 | D-04 闭环并按权限更新必要 AC；R-01 的 props/请求边界；053/056/063 接入约定及计划批准。 |
| [057](./TASK-057-plan.md) | result 持久化、跳过事件、父任务、防重与真实 Mongo 证据 | D-01～D-03；R-02/R-03；计划批准；数据库版本、实际索引与环境权限核对。不得先运行 DDL、worker 或写库。 |
| [063](./TASK-063-plan.md) | 单快照五卡、总览、首次读取/刷新与旧快照、只读约束 | 已登记；D-01/D-02/D-03 的最终结果契约和 D-04；R-01/R-03；053/055/056 组件及 057/064 联调、计划批准。不能靠 mock 关闭 Story。 |
| [064](./TASK-064-plan.md) | 汇率/再平衡归一化、可选 lastSkip、查询预算与旧数据降级 | 已登记；D-01～D-03；R-03；与 057 对齐、计划批准及真实环境核对。不重开 054。 |

### 7.4 仍缺材料与后续负责人

| 编号 | 尚未齐备的材料 / 差异 | 后续处理及权限边界 |
|---|---|---|
| R-01 | 055 消费 063 的共享快照，063 又依赖 055 价格组件；跨组件 props、请求/缓存/错误接口与合入顺序未冻结。 | 待 Planner 补齐接口约定，区分组件自身验证与最终接入，避免互相以“对方已完成”作为硬前置。本轮只列待补项，未分派或声称 Planner 已开始补写。 |
| R-02 | 057 原 AC10 写“全量 229 条全绿”，Draft §7 使用当前实际回归数量；两种口径尚未得到明确处理。 | Planner 提供基线/回归范围核对与必要变更建议；若要改变原 AC，由 Human 明确决定。D-04 只涉及 055，不默认为本项豁免；本轮未改 AC，也没有重跑应用测试。 |
| R-03 | D-01～D-03 尚未决定，producer→adapter→consumer 的成功、缺失、失败、跳过、旧数据、未超阈与未知样例未形成同一冻结版本。 | 待 Human 选择后，由 Planner 对齐 057/064/063 及必要 API 文档，再提交受影响 Draft；登记新卡不代表样例已完成或新字段已批准。 |
| R-04 | 本副本未包含业务源码。053本次已只读核对D:/projects/portomind的基线及相关前端文件，细节见计划§10；仍缺独立feature实施工作区。其他任务基线、Mongo版本/真实索引、权限、数据与运行环境仍未核实。 | 先为053准备独立工作区并复核后再指派；其他任务继续按其前置处理。未重新核实的项目不得记为本轮通过，不以历史测试数量代替当前结果。 |

初次接收只登记与提交审阅；随后Human仅批准053设计，其计划已登记Approved，但工作区尚未就绪，未指派或派发实施。其余Draft及D-01～D-04仍待Human处理；需补材料或修订设计时交相应负责人，批准且前置齐备后才另行安排实施。当前没有Task Implementing，没有Task/Story关闭或Merged登记变化。
