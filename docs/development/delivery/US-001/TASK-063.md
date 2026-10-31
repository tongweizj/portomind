# TASK-063 — 五卡真实数据接入、总览与手动刷新

> Orchestrator 已于 2026-10-30 正式登记并接收规划。本卡处于 Planning，等待 Human 审阅相关决定和 Draft；登记不构成实施授权。

## Metadata

| 字段 | 内容 |
|---|---|
| Status | Planning |
| Priority / Owner / Type | High / 待指派 / Feature |
| Created / Updated | 2026-10-30 / 2026-10-30 |
| 所属 Story | [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md) |
| 覆盖的验收条件 | US-001/AC-02、05～08、10、11（前端接入与整合） |
| Related Spec | [FS P0](../../requirements/specs/FS-cron-worker-status-board.md) |
| Execution Plan | [Draft](./TASK-063-plan.md)，未批准 |

## 1. 问题

TASK-053 只做占位骨架、055 只做价格卡、057 不改前端，当前没有任务承接其余卡片和整个看板的数据读取、刷新与错误处理。

## 2. 已核实的事实

只读源码事实、基线、文件位置与证据限制见 [Planner 回交说明](./US-001-02-planner-return.md) §2。该文件为事实唯一记录，不把设计写成已实现。

## 3. Acceptance Criteria

- [ ] AC1：使用统一 API 客户端读取 GET /cron/status，固定五卡及总览绑定真实快照；总览不把 unknown、契约未就绪或缺记录归为全部正常。
- [ ] AC2：完整性卡显示 expected/actual/missing、跳过和缺口摘要；提醒卡显示 evaluated/created/failed 等真实记录，零命中不当失败；汇率只显示结果可证明的币种观测，标明同步不证明汇率方向正确。
- [ ] AC3：再平衡首屏摘要使用父任务到期分母，显示生成/未超阈/失败与异常组合原因；无父结果不推断未到期；不创建详情路由。
- [ ] AC4：分别处理无运行记录、契约未就绪、零目标和单任务结果异常；与最新真实运行分离展示 lastSkip（若 D-01 推荐方案获批），僵尸基于 API stale 标记，不实现 P1 超期未成功提示。
- [ ] AC5：首次打开读取；手动刷新更新 generatedAt，不自动轮询。共享请求失败时不得假装四卡仍有新数据：有上次成功快照时明确标为过时并显示刷新失败；无快照时五卡均提示不可用；原始日志仍独立可用。此行为与055旧AC冲突需 D-04 决定后才能实施相关部分。
- [ ] AC6：TASK-055 价格组件接入共享快照，不单独再发同一请求；TASK-056 图例与映射全卡复用；未知值不使用 || 0 兜底。
- [ ] AC7：局部数据格式异常只影响对应卡；整体请求错误与单项错误区分；日期用后端字符串与 timezone，不重新推导业务目标日。
- [ ] AC8：新组件无写服务调用、mutation 或执行按钮；只读导航和刷新不触发任务；覆盖五卡正常/缺失/失败/零值、刷新、原日志回归及必要 build/lint 检查。

## 4. Scope

建议修改 client/src/services/cronStatus.service.js、hooks/useCronStatus.js、components/CronStatus/ 下新增的数据卡/总览与 LogViewer.jsx 的集成点；复用 API/error helper、Query 与 DataState。骨架归053、价格归055、色彩归056；不改 server/shared/worker，不实现 P1/P2，不触发重跑。

## 5. Risks

整体未知被误判健康；局部异常使整页失败；缓存被误认为新快照；共享请求与组件重复拉取。对应用例和过时提示验证。

## 6. Blocking Dependencies

053 骨架、055 价格、056 映射；054读侧已存在。完整验收须057真实结果、064读侧兼容与 lastSkip（若方案获批）。可先以已冻结读侧契约规划/开发未知态，但不能仅以 mock 完成整体验收。

## 7. Coordination Notes

新增本任务填补 Story 既有 AC 的实现缺口，不扩展 Story 范围。需 ExecPlan：涉及跨组件接口、状态处理或共享读侧兼容，当前 Draft 未获批准。当前不实施。

## 8. Open Questions

D-04：旧055 AC6/8/9与现行接口和统一请求设计的处理，由PM/Human确认；D-01 选择的跳过载体影响 lastSkip 字段。

## 9. 记录

2026-10-30，Orchestrator 正式登记：依据 Human 本轮“接收 US-001 规划、条件满足后登记 TASK-063/064”的明确指令、当前 Story 的既有 High 优先级，以及 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态) 对已授权 Story 内常规拆分的权限。已核对所属 Story、AC 关联、范围、依赖及对应 Draft；本卡只承接既有五卡接入/刷新需求。初始 Status 为 Planning，Owner 待指派；Planner 为既有规划产出角色，不代填实施者。D-01～D-04 中受影响决定、055/063 接入约定及计划批准尚未齐备，不可实施。接收与审阅清单见 [Orchestrator 接收记录](./US-001-02-planner-return.md#7-orchestrator-接收与-human-审阅清单)。

规划已准备；实施、审查与关闭尚未发生。后续证据写对应计划；本卡仅引用。
