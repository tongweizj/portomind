# TASK-063 — 五卡真实数据接入、总览与手动刷新

> Orchestrator 已于 2026-10-30 正式登记并接收规划。本卡处于 Planning，等待 Human 审阅相关决定和 Draft；登记不构成实施授权。

## Metadata

| 字段 | 内容 |
|---|---|
| Status | Reviewing（2026-11-05，实现与自测完成于 worktree `D:/projects/portomind-063` @ `9b90fdc`，等待独立 Reviewer 复核） |
| Priority / Owner / Type | High / Reviewer（待指派） / Feature |
| Created / Updated | 2026-10-30 / 2026-11-05 |
| 所属 Story | [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md) |
| 覆盖的验收条件 | US-001/AC-02、05～08、10、11（前端接入与整合） |
| Related Spec | [FS P0](../../requirements/specs/FS-cron-worker-status-board.md) |
| Execution Plan | [Approved](./TASK-063-plan.md)（2026-11-05 Human 批准当前设计；实施前置为 057/064 合入） |

## 1. 问题

TASK-053 只做占位骨架、055 只做价格卡、057 不改前端，当前没有任务承接其余卡片和整个看板的数据读取、刷新与错误处理。

## 2. 已核实的事实

只读源码事实、基线、文件位置与证据限制见 [Planner 回交说明](./US-001-02-planner-return.md) §2。该文件为事实唯一记录，不把设计写成已实现。

## 3. Acceptance Criteria

- [ ] AC1：使用统一 API 客户端读取 GET /cron/status，固定五卡及总览绑定真实快照；总览不把 unknown、契约未就绪或缺记录归为全部正常。
- [ ] AC2：完整性卡显示 expected/actual/missing、跳过和缺口摘要；提醒卡显示 evaluated/created/failed 等真实记录，零命中不当失败；汇率只显示结果可证明的币种观测，标明同步不证明汇率方向正确。
- [ ] AC3：再平衡首屏摘要使用父任务到期分母，显示生成/未超阈/失败与异常组合原因；无父结果不推断未到期；不创建详情路由。
- [ ] AC4：分别处理无运行记录、契约未就绪、零目标和单任务结果异常；与最新真实运行分离展示 lastSkip（若 D-01 推荐方案获批），僵尸基于 API stale 标记，不实现 P1 超期未成功提示。
- [ ] AC5：首次打开读取；手动刷新更新 generatedAt，不自动轮询。共享请求失败时不得假装四卡仍有新数据：有上次成功快照时明确标为过时并显示刷新失败；无快照时五卡均提示不可用；原始日志仍独立可用。**D-04 已于 2026-11-04 裁决**：本卡按 055 AC8 ① 实现「整体失败」——五卡统一降级、旧快照标过时、原日志隔离；055 只负责单卡数据异常与三型空态。
- [ ] AC6：TASK-055 价格组件接入共享快照，不单独再发同一请求；TASK-056 图例与映射全卡复用；未知值不使用 || 0 兜底。
- [ ] AC7：局部数据格式异常只影响对应卡；整体请求错误与单项错误区分；日期用后端字符串与 timezone，不重新推导业务目标日。
- [ ] AC8：新组件无写服务调用、mutation 或执行按钮；只读导航和刷新不触发任务；覆盖五卡正常/缺失/失败/零值、刷新、原日志回归及必要 build/lint 检查。

## 4. Scope

建议修改 client/src/services/cronStatus.service.js、hooks/useCronStatus.js、components/CronStatus/ 下新增的数据卡/总览与 LogViewer.jsx 的集成点；复用 API/error helper、Query 与 DataState。骨架归053、价格归055、色彩归056；不改 server/shared/worker，不实现 P1/P2，不触发重跑。

## 5. Risks

整体未知被误判健康；局部异常使整页失败；缓存被误认为新快照；共享请求与组件重复拉取。对应用例和过时提示验证。

## 6. Blocking Dependencies

053 骨架、055 价格、056 映射均已在 `main`（055/056 已结案）；054 读侧已存在。**2026-11-05 Human 裁决：本卡串行**——057 与 064 实施并合入后才启动本卡实施，AC2/AC3 届时以真实记录验收（不以 mock 顶替）。D-01 已批（独立 TaskSkip 集合），lastSkip 为 064 可选字段、缺失兼容。**计划已于 2026-11-05 获 Human 批准。**

## 7. Coordination Notes

新增本任务填补 Story 既有 AC 的实现缺口，不扩展 Story 范围。ExecPlan 已获 Human 批准（2026-11-05）；实施按串行等待 057/064 合入，由 Orchestrator 派发。

## 8. Open Questions

D-04：**已于 2026-11-04 裁决**（旧055 AC6/8/9 澄清，三项全部采纳）——AC6 允许一处纯展示换算；AC8 分两层，本卡承接①整体失败；AC9 空态分三型，价格卡不设 null 分支。详见 [TASK-055 §3](./TASK-055.md) 与 [回交 §4](./US-001-02-planner-return.md#d-04055原ac689澄清不改story-ac)。D-01 已于 2026-11-04 裁决为独立 TaskSkip 集合：lastSkip 为 064 读侧可选字段，本卡按「有则独立展示、无则兼容省略」实现，无待决。

## 9. 记录

2026-10-30，Orchestrator 正式登记：依据 Human 本轮“接收 US-001 规划、条件满足后登记 TASK-063/064”的明确指令、当前 Story 的既有 High 优先级，以及 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态) 对已授权 Story 内常规拆分的权限。已核对所属 Story、AC 关联、范围、依赖及对应 Draft；本卡只承接既有五卡接入/刷新需求。初始 Status 为 Planning，Owner 待指派；Planner 为既有规划产出角色，不代填实施者。D-01～D-04 中受影响决定、055/063 接入约定及计划批准尚未齐备，不可实施。接收与审阅清单见 [Orchestrator 接收记录](./US-001-02-planner-return.md#7-orchestrator-接收与-human-审阅清单)。

规划已准备；实施、审查与关闭尚未发生。后续证据写对应计划；本卡仅引用。

2026-11-05，Planner：按 Human 两项裁决更新规划——①本卡改为**串行**（057/064 合入后实施，AC2/AC3 以真实记录验收）；②TASK-057 计划已获批准。[TASK-063 计划](./TASK-063-plan.md) 已按冻结契约重写（API 信封、055 props、056 statusTone、lastSkip 可选、R-01 落定），仍为 Draft 待 Human 批准。

2026-11-05，Planner（续）：Human 确认「批准 063 计划」——TASK-063 计划登记 **Approved**（覆盖 §1～§9）。实施仍按串行等待 057/064 合入，登记与派发由 Orchestrator 按 [STATES.md §4](../../../os/process/STATES.md) 落实。

## Orchestrator 启动核对与实施交接（2026-11-05）

依据：计划已 `Approved`（2026-11-05）、Human 指示开始 063；状态权限见 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态)。

**结论：串行前置已全部满足，AC1～AC8 可完整实施，无缺口。**

| 启动项 | 核对事实 |
|---|---|
| 基线 | `main` = `cde811f`（064 合入后）；`feature/TASK-063` 分支**不存在**，需新建 + worktree |
| **串行前置①（057）** | ✅ 已合入 `main`（`1e421db`）；`shared/models/taskSkip.js` 与 `TaskRun.result` 在位 |
| **串行前置②（064）** | ✅ 已合入 `main`（`cde811f`）；`lastSkip` 读取路径在位（`cronStatus.service.js:947` / `:990`），`NUMERIC_OBSERVATION_ONLY` / `PER_PORTFOLIO_INCOMPLETE` note 已实现 |
| 053 骨架 | ✅ `BoardShell` / `SummaryShell` / `TaskCardShell` / `unknownValue` 均在 `main` |
| 055 价格卡 | ✅ `PriceTaskCard.jsx` + `priceDataState.js` 在位；**尚未被任何组件挂载**（grep 0 命中）——接线即本卡核心工作 |
| 056 映射 | ✅ `statusTone.js` + `StatusLegend.jsx` + 四个 `status*` token 在位 |
| API 信封 | ✅ 每项 `{taskName, lastRun, lastSkip, stale, contractReady, dataState, dataStateLevel, notes[]}` |
| `check-docs` 修复 | ✅ `c11bb64` 未被 064 合入回退（`:48` 仍为 `> 2`）；`docs:check` 0 ERROR |

**状态登记**：Task `Planning` → **`Implementing`**，Owner → `Implementer`。

**未做的事**：未建分支或 worktree；未改任何代码；未运行测试。

## Orchestrator 交付接收记录（2026-11-05）

依据 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态)：「Task → Reviewing：Implementer 提供改动清单、自测证据、可审对象和已知妥协」。四项齐备，故登记 `Implementing` → **`Reviewing`**。

| 项 | 事实 |
|---|---|
| Worktree | `D:/projects/portomind-063` |
| 分支 / 提交 | `feature/TASK-063` @ **`9b90fdc`**（父 `0487ba8` = `main`） |
| 改动规模 | **12 文件**，+1637/−44：新增 `CronBoard` / `DataTaskCard` / `taskDataViews` / `cronStatus.service` / `useCronStatus` + 夹具与验收脚本；改 `BoardShell` / `SummaryShell` / `LogViewer` |
| 范围核对 | 无 `server/` `shared/` `cron-worker/` 改动 ✓ |

**Orchestrator 独立复验（本轮全部亲跑）**

| 项 | 结果 |
|---|---|
| `client/scripts/verify-task-063.cjs` | **41/41 PASS** ✓ |
| `npm run build --workspace client` | **exit 0**（2.77s）✓ |
| `eslint "src/**/*.{js,jsx}"` | **exit 0** ✓ |
| 轮询关闭 | `useCronStatus.js:19` 显式 `refetchInterval: false` ✓ |
| 写操作 | `useMutation` / `api.post/put/patch/delete` **0 命中** ✓ |
| `|| 0` 兜底 | `taskDataViews` / `CronBoard` **0 命中** ✓ |
| 总览优先级 | `buildOverview` 实现 bad > warn > 数据未就绪 > 全部正常 ✓ |
| 053 回归 | 脚本含「默认 BoardShell 五卡结构未回退」「默认总览五灯仍 unknown + 图例保留」两条断言，均 PASS ✓ |

**⚠️ 需 Reviewer 重点核对的契约变更（非越界，但须确认向后兼容）**

交付修改了 053/056 的两个已交付组件，均属**加法式**改动：

1. **`BoardShell.jsx`**：新增可选 props `cardComponents`（槽位 → 卡组件映射）与 `summary.overallLevel` / `summary.levels`。**缺省时仍用 `TaskCardShell`，053 骨架行为不变**。
2. **`SummaryShell.jsx`**：`HealthDot` 新增可选 `level`，颜色改由 `getStatusTone(level)` 驱动。**不传时仍为 `unknown` + 中性灰，053 行为不变**。

计划 §4 未明文禁止此改动，且 063 必须让五灯显示真实状态、让价格卡替换骨架卡——**不改这两个组件无法实现 AC1/AC6**。但这是对已验收组件契约的实质扩展，**须由 Reviewer 独立确认「缺省行为零回归」**（脚本已覆盖，但应独立复验）。

**未做的事**：未改 AC / Scope；未提交、未合入、未填 `Merged`、未关闭。
