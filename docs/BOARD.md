# Story 交付与任务调度

> 更新日期：2026-10-30。默认一次推进一个 Story，不采用 Sprint。
> 状态与权限唯一依据：[STATES.md](./os/process/STATES.md) §2.2–§4；卡片字段是真相，本文件仅汇总。取消条目按 §2.3 排除，单独保留退出索引。历史任务不强制补建 Story。

## 当前 Story

| 项目 | 当前情况 |
|---|---|
| Story / 用户价值 | [US-001](./development/requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)：首屏判断五类任务运行与数据完整性（FS P0） |
| Status | Planning：053设计已批准，独立实施工作区尚未就绪；尚未实施 |
| 交付目录 | [US-001 过程资料](./development/delivery/US-001)（6张专属任务卡、1份Approved计划、5份Draft、2份交接记录；复用054保持唯一原位置） |
| PM / 验收负责人 | PM（本 chat 需求整理）/ Human |
| 下一步 | 先按 [053启动核对](./development/delivery/US-001/TASK-053-plan.md#10-implementer-handoff) 准备独立feature工作区，再指派Implementer并登记任务实施；本轮未派发。其他5份Draft及D-01～D-04继续按 [审阅清单](./development/delivery/US-001/US-001-02-planner-return.md#7-orchestrator-接收与-human-审阅清单) 处理 |
| 阻塞 / 待决策 | 053源码目录仍是有既有改动的chore分支，缺独立实施目录，按Human要求保持Planning。D-01～D-04及其他任务材料仍未决，不构成本卡骨架的数据硬前置；没有新增状态或自动置Blocked |

### 下挂 Task

| Task | 工作 | 覆盖 Story AC | Status | Owner | 依赖 / 下一步 | ExecPlan |
|---|---|---|---|---|---|---|
| [TASK-053](./development/delivery/US-001/TASK-053.md) | 看板入口及骨架 | AC-01、02、07、10、11 | Planning | 待指派 | Human已批准设计；缺独立feature工作区，交接材料已准备但未派发 | [Approved](./development/delivery/US-001/TASK-053-plan.md)，仅053设计 |
| [TASK-054](./development/tasks/completed/TASK-054-cron-status-aggregate-api.md) | 聚合快照读侧（既有产出） | AC-02～08、10、11 的读侧支撑 | Completed | 既有结案记录 | 复用证据前核对真实项目版本 | [已归档计划](./development/exec-plans/completed/TASK-054-cron-status-aggregate-api.md) |
| [TASK-055](./development/delivery/US-001/TASK-055.md) | 价格完成度 | AC-03、04、07、10 | Planning | 待指派 | 待D-04；053/056/063接入约定及计划批准 | [Draft](./development/delivery/US-001/TASK-055-plan.md)，未批准 |
| [TASK-056](./development/delivery/US-001/TASK-056.md) | 系统状态色与图例 | AC-02、09 | Planning | 待指派 | 待Human审阅设计；与053协调插槽及顺序 | [Draft](./development/delivery/US-001/TASK-056-plan.md)，未批准 |
| [TASK-057](./development/delivery/US-001/TASK-057.md) | 结果写侧及再平衡父任务 | AC-05～08 的写侧支撑 | Planning | 待指派 | 待D-01～03、AC10口径、环境核对及计划批准 | [Draft](./development/delivery/US-001/TASK-057-plan.md)，未批准 |
| [TASK-063](./development/delivery/US-001/TASK-063.md) | 五卡接入、总览与刷新 | AC-02、05～08、10、11 | Planning | 待指派 | 已登记；待D-01～04、055接口约定及最终契约 | [Draft](./development/delivery/US-001/TASK-063-plan.md)，未批准 |
| [TASK-064](./development/delivery/US-001/TASK-064.md) | 读侧结果兼容与skip观测 | AC-02、05～08、11 | Planning | 待指派 | 已登记；待D-01～03、057结果契约及计划批准 | [Draft](./development/delivery/US-001/TASK-064-plan.md)，未批准 |

> 2026-10-30：Orchestrator 按本轮 Human 指令及 STATES.md §4 登记063/064，并接收053/055/056/057规划，将四卡原BACKLOG登记为Planning。各卡记录依据，Owner均待指派；没有卡进入Implementing。

> 随后Human仅批准053当前设计，Orchestrator代登记其计划Approved；真实源码只读核对已完成，但工作区未就绪，Task/Story仍Planning，未指派Implementer。其他计划、D-01～D-04、054完成及Merged记录未变。

### 进度汇总

| 统计范围 | 总数 | Backlog | Planning | Implementing | Reviewing | Blocked | Completed |
|---|---:|---:|---:|---:|---:|---:|---:|
| 全部已登记 Story（排除取消） | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| 当前 Story 已关联 Task | 7 | 0 | 6 | 0 | 0 | 0 | 1 |
| 尚未关联 Story 的未完成 Task | 5 | 1 | 4 | 0 | 0 | 0 | 0 |

> 统计来自卡片；旧词按 STATES.md §7.1 映射，不证明当前实施授权。已关联任务不重复计入未关联任务。TASK-054 的既有 Completed 计为 1 个支撑任务完成，不表示当前 Story 已验收。共 11 条历史完成记录保留作证据索引，与本 Story 进度不可相加；本轮新增登记2卡已计入，现无待登记卡。

## Story Backlog

| Story | 用户价值 | Priority | 准备情况 | 依赖 / 待决策 |
|---|---|---|---|---|
| — | 暂无其他 Story；US-001 已列为当前规划项 | — | — | — |

> PM 按已确认的优先级维护队列，原有 Task 与 Spec 不自动变成 Story。Story 文档入口见 [STORIES.md](./development/requirements/stories/STORIES.md)；状态统一按 STATES.md §6 汇总。

## 已完成 Story

| Story | 交付结果 | 完成日期 | 验收记录 |
|---|---|---|---|
| — | 暂无 | — | — |

## 已退出 Story

| Story | 退出日期 | 原因 / Human 决定 | 归档链接 |
|---|---|---|---|
| — | 暂无 | — | — |

## 未关联 Story 的任务

> 兼容既有任务与独立维护工作。US-001 已关联 TASK-053～057及063/064（其中054保持既有完成记录）；反向关联已核对，登记结果见上表。其余未确认关联的任务仍在下表；本轮未改变这些独立任务的状态、优先级或安排。

| Task | 工作 | Story | Status | Priority | 待处理 / 下一步 |
|---|---|---|---|---|---|
| [TASK-045](./development/tasks/active/TASK-045-transaction-query-filters.md) | 交易流水查询与筛选 | 未关联 | Backlog | Medium | 待排期 |
| [TASK-046](./development/tasks/active/TASK-046-csv-import-dedup.md) | CSV 二次导入未去重（幂等失效） | 未关联 | Planning | High | 待确认优先级与排期 |
| [TASK-047](./development/tasks/active/TASK-047-review-followups.md) | TASK-044 审查遗留整改（M-1/M-2/M-5/M-6） | 未关联 | Planning | High | 待 Planner 产出计划 |
| [TASK-051](./development/tasks/active/TASK-051-fx-rate-direction.md) | 家庭折算汇率方向反了（`rateToCny` 存成 `1 CNY = X 外币`） | 未关联 | Planning | High | 待 Human 裁决汇率方案及历史数据处置 |
| [TASK-062](./development/tasks/active/TASK-062-agent-role-boundary-and-overhead.md) | Agent 角色权限边界与执行开销整改 | 未关联 | Planning | High | 待审阅范围及裁决；提案未批准，不作为现行规则 |

## 历史完成 Task

> 本表汇总任务卡与 Human 的合入登记。权限与字段含义见 [STATES.md](./os/process/STATES.md) §1 / §4；仅 Human 可填写 Merged。

| Task | 工作 | 完成日期 | Merged | 记录 |
|---|---|---|---|---|
| TASK-052 | Agent 运行规则（docs 治理层）审计与整改 | 2026-10-29 | `Pending` | [任务卡](./development/tasks/completed/TASK-052-agent-rules-update.md)（含明确接受的未满足项，详见卡片） |
| TASK-058 | 账号与访问控制（用户模块；U1 后端内核 + U2 前端登录/账户 + U3 用户管理页） | 2026-10-28 | `Merged` #38 | [任务卡](./development/tasks/completed/TASK-058-authentication-and-accounts.md) |
| TASK-061 | 2.0 原型「日志」频道实现 cron 运行看板（FS-cron-worker-status-board） | 2026-10-27 | `Merged` #36 | [任务卡](./development/tasks/completed/TASK-061-cron-board-prototype.md) |
| TASK-060 | 用户模块原型整改（auth 原型并入主原型 + 用户区） | 2026-10-27 | `Merged` #36 | [任务卡](./development/tasks/completed/TASK-060-user-module-prototype-remediation.md) |
| TASK-059 | 组合线原型稿整改（对齐 `FS-portfolio-ia-cleanup`） | 2026-10-27 | `Merged` #36 | [任务卡](./development/tasks/completed/TASK-059-prototype-alignment-portfolio-ia.md) |
| TASK-054 | 后端聚合接口 `GET /api/cron/status`（FS **C-02**） | 2026-10-27 | `Merged` #36 | [任务卡](./development/tasks/completed/TASK-054-cron-status-aggregate-api.md) |
| TASK-050 | 组合列表页承接家庭五区块，`/family` 下线 | 2026-10-26 | `Merged` #35 | [任务卡](./development/tasks/completed/TASK-050-portfolio-list-household-blocks.md) |
| TASK-048 | Family 页分红类交易标签修正（M-3） | 2026-10-20 | `Merged` #34 | [任务卡](./development/tasks/completed/TASK-048-family-dividend-label.md) |
| TASK-049 | Dashboard 承接家庭总资产卡 | 2026-10-19 | `Merged` #33 | [任务卡](./development/tasks/completed/TASK-049-dashboard-household-total.md) |
| TASK-044 | 交易记录收拢进组合管理 | 2026-10-19 | `Merged` #32 | [任务卡](./development/tasks/completed/TASK-044-transaction-consolidation.md) |
| TASK-043 | 标的频道合并（资产管理 + 价格） | 2026-10-19 | `Merged` #32 | [任务卡](./development/tasks/completed/TASK-043-asset-price-consolidation.md) |


## Roadmap


1. 将资产管理和价格，合并。—— ✅ TASK-043
2. 将交易记录，收拢进组合管理 —— ✅ TASK-044
3. 家庭视图，融入进 dashboard —— ✅ **已完成（2026-10-26 收官）**：`TASK-049` 总资产卡 → `/`（2026-10-19 结案）；`TASK-050` 其余五块 → `/portfolios` 且 `/family` 下线（2026-10-21 实施 → R-1 返修 → 复验通过 → **2026-10-26 合入 `main` `cafcc5d`，PR #35**）。需求：[`specs/completed/FS-household-view-split.md`](./development/requirements/specs/completed/FS-household-view-split.md)
4. 交易线遗留修复（建议顺序）：`TASK-046`（CSV 幂等失效，P0 数据风险，修 1 行 + 修 mock）→ `TASK-047`（M-2 归属守卫等）→ ~~`TASK-048`（分红标签）~~ ✅ **已完成 2026-10-20**
5. 家庭线遗留（本 FS 明确不做，需独立立项）：家庭总资产趋势（`FAM-01` P1，无快照模型）· 家庭视图按账户类型/大类分组（PRD `CM-05`/`AS-09` 声称已就绪，实现中 `familySummary` 既无 `accountType` 也无大类聚合）
6. dashboard，增加组合健康表，内容是最新的3个提示。一个url ，跳转全部


## 看板维护与交接

- PM 维护当前 Story、Story 队列及验收摘要；Orchestrator 按权限登记 Task 状态。先改权威卡片，再同步看板，不单独在看板推进状态。
- Human 确认优先级 → PM 准备 Story → Orchestrator 分派 Planner → Implementer 实施 → Reviewer 提供结论 → PM 汇总 Story 验收 → Human 关闭。
- Task 明确所属 Story 和覆盖的 AC；状态按卡片投影。必要 Task 完成后进入整体验收，不能自动关闭 Story。
- 已完成 Story 移入完成索引，取消项移入退出索引；下一项按已确认优先级选择。卡片搬迁时修复链接，保留编号与历史证据。
- 汇总按稳定编号去重，未知写“待确认”；独立维护任务不计入当前 Story。更新看板复用已有证据，不触发额外技术复验。
