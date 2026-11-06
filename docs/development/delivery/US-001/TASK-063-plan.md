# TASK-063 — US-001 实施计划

## Status

Status：Approved（2026-11-05，Human 批准当前设计）

Owner：Planner（规划完成）→ 待 Orchestrator 登记并指派 Implementer

Related Task：[TASK-063](./TASK-063.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：实施时从 up-to-date `main` 新建 `feature/TASK-063` 独立 worktree（沿 053/056 惯例）。**实施前置（Human 2026-11-05 裁决「串行」）**：`TASK-057` 与 `TASK-064` 实施并合入 `main` 后才启动本卡实施；规划基线为 2026-11-05 的 `main`（含 053/055/056 交付）。

Approval：**2026-11-05 Human 批准当前设计**（Planner 会话确认「批准 063 计划」）：覆盖 §1～§9。实施前置仍为 057 与 064 合入 `main`（串行）；登记与派发由 Orchestrator 按 [STATES.md §4](../../../os/process/STATES.md) 落实，Planner 不代填状态。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task 的 §3，逐条引用该节、不增删改；覆盖 US-001/AC-02、05～08、10、11（前端接入与整合）。验证映射见 §7。当前计划不允许实现 US-001 范围外的 P1/P2 功能、调度控制或既有汇率方向修复；不实现 `/logs/rebalance` 详情路由（C-07 未立项）。

## 2. Context

需求与未决项见 [Planner回交](./US-001-02-planner-return.md)。本任务需 ExecPlan：跨组件数据/状态/错误分层与共享请求边界。055↔063 的 R-01 接入约定已由 055 交付物冻结（§4-3），不再悬空。D-04（2026-11-04）与 D-01（2026-11-04）已裁决；**2026-11-05 Human 裁决本卡串行**：057/064 合入后实施，AC2/AC3 的「真实记录」证据届时以真实数据验证。

## 3. Repository Findings（2026-11-05 只读核对）

| 事实 | 落点 |
|---|---|
| 055 已交付并在 `main`（`827c1dc` 为 `main` 祖先）：`PriceTaskCard.jsx` 纯展示组件，props 契约 `{label, dataState, dataStateLevel, lastRunAt, runState, requestError, snapshotAt, onRetry}` | `client/src/components/CronStatus/PriceTaskCard.jsx` |
| 055 派生层唯一：`getPriceView({dataState, dataStateLevel, requestError})` 与 `computePercentage`（唯一百分比换算） | `client/src/components/CronStatus/priceDataState.js` |
| **`PriceTaskCard` 尚未被任何组件挂载**（grep 0 命中）——接线即本卡工作 | `LogViewer.jsx` 现仍渲染空骨架 `<BoardShell />` |
| 056 已交付并在 `main`：`getStatusTone(status)` 单一映射 + `StatusLegend`；`TaskCardShell` 卡片文案仍为骨架「未知」（056 审查 F-03），真实文案接线归本卡 | `client/src/components/CronStatus/statusTone.js` |
| client 侧 `cronStatus.service.js` / `useCronStatus` **不存在**，本卡新建；现有解包与错误助手可用 | `client/src/services/api.js`（`api` / `getApiErrorMessage`） |
| 全局 `QueryClient` 仅配 `retry:1` / `staleTime:60s`，**未关** `refetchOnWindowFocus` 等自动路径 → 本卡必须逐查询显式关闭 | `client/src/main.jsx:6-14` |
| API 契约：`GET /api/cron/status` → `{generatedAt, timezone, staleThresholdHours, tasks:[5]}`；每项 `{taskName, lastRun(无记录 null), stale, contractReady, dataState, dataStateLevel(ok\|warn\|bad\|unknown), notes[]}`；057 落地前四卡 `result` 派生值为 `null`（`contractReady=false` + `CONTRACT_NOT_READY`） | [API_CONTRACT.md](../../../handbook/technical/API_CONTRACT.md) |
| `BoardShell` 五卡网格现状为固定 `TaskCardShell`；`SummaryShell` props `{snapshotAt, overallState}`；`unknownValue.js` 的 `UNKNOWN` 语义与 `BOARD_SLOTS` 五槽位 | 053/056 交付物 |

证据边界：未连接数据库、未跑应用/测试；以上为静态源码与文档核对。

## 4. Proposed Design（冻结）

1. **数据层**：新增 `client/src/services/cronStatus.service.js`（经 `api.get('/cron/status')` 解包统一响应）与 `client/src/hooks/useCronStatus.js`：固定 `queryKey:['cron-status']` 全页共享**单次快照**；**逐查询显式关闭** `refetchOnWindowFocus / refetchOnReconnect / refetchInterval` 与挂载重复拉取，仅「首次挂载读取 + 手动 refetch」（OQ5/AC5）。错误文案用 `getApiErrorMessage`；刷新失败但有上次成功数据时**沿用服务端 `generatedAt`** 明示「数据截至 X · 刷新失败/过时」，**绝不**换算为本地当前时间。禁止用 `queryClient.invalidateQueries` 类全局刷新波及本查询。
2. **视图结构**：`BoardShell` 五卡槽位换入真实卡——`price-sync` → `PriceTaskCard`；其余四卡 → 本卡新增数据卡（沿用 053 六区域解剖：任务名/上次运行/运行徽章/数据态条/关键数字/异常入口，可加缺口摘要行），配色一律经 `getStatusTone`。`BoardShell` 只做**向后兼容的槽位组件映射**（如可选 `cardComponents`，缺省仍为 `TaskCardShell`）——只加不改；若破坏 053/056 已验收断言，停下上报（沿 056 §10.2 先例）。`SummaryShell` 填真实总览（5 灯 + 整体徽章 + `generatedAt`）；`StatusLegend` 原样保留。
3. **R-01（已冻结，以 055 交付物为准）**：`PriceTaskCard` 收 `{dataState, dataStateLevel, lastRunAt, runState, requestError, snapshotAt, onRetry}`，由共享快照的价格项 + 请求态映射，**不二次请求**。四张新卡沿用同一 props 风格（任务信封项 + 请求态）；逐卡派生函数集中于新模块（如 `taskDataViews.js`，镜像 `priceDataState` 的单一派生模式），未知值一律 `UNKNOWN`/「—」，**禁止 `|| 0` 类兜底**。
4. **总览判定**：异常优先级 `bad > warn`；仅当五项 `dataStateLevel=ok` 且无缺口才显示「全部正常」；存在 unknown/缺契约/缺记录而无其他异常 → 「数据未就绪」；`stale` 与「契约未就绪」单独说明；**不从 `lastRun.status` 填绿**。
5. **空态四型与 lastSkip（AC4）**：无运行记录（`lastRun=null` →「暂无运行记录」）／契约未就绪（`contractReady=false` →「结果契约未就绪」型文案）／零目标（`expected=0` 型，百分比「—」）／单任务结果异常。`lastSkip`（D-01 已批：独立 TaskSkip 集合，064 读侧**可选**字段）与最新真实运行**分离展示**（「最近跳过 {skippedAt} · {reason}」），字段缺失时整体省略（兼容旧 API）；僵尸 `RUNNING` 基于信封 `stale` 标记展示，不实现 P1 超期未成功提示。
6. **错误分层（D-04/AC5/AC7）**：整体请求失败 → **五卡统一降级**（055 AC8① 归本卡）——有旧快照显示旧数据 + 过时标记 + 刷新失败提示；无快照五卡均「不可用」；原始日志两 tab 独立不受影响。单卡数据格式异常 → 仅该卡局部异常态（派生函数包住容错）。日期一律展示服务端字符串与 `timezone`，不重推业务目标日。
7. **只读硬约束（AC8/NG6）**：新代码无 `useMutation`/写服务/执行按钮；刷新只触发 GET；导航与刷新不触发任何任务。

## 5. Work Breakdown

- [ ] W0（前置门）：确认 057、064 已合入 `main` 且 057 W2 冻结样例可读；未满足即停下等待，不得以 mock 顶替真实结果。
- [ ] W1：service/hook + Query 显式关闭自动路径 + 夹具（成功/无记录/缺契约/零值/单卡异常/整体失败/旧快照/skip/僵尸）。
- [ ] W2：四张数据卡 + 派生模块 + `BoardShell` 槽位映射 + `SummaryShell` 总览 + `PriceTaskCard`/`StatusLegend` 接线。
- [ ] W3：错误分层与空态四型、`lastSkip` 分离展示、stale 标记；`LogViewer` 集成点；056 F-03 卡片文案接线。
- [ ] W4：验证（§7）：夹具 + 真实环境（dev 库含 057 落地后的真实 result）+ 053 原日志回归 + build/lint。

## 6. Decisions

**已裁决/已冻结（随附依据）**：

| 项 | 结果 | 依据 |
|---|---|---|
| D-04（AC6/8/9 澄清） | 三项采纳；整体失败五卡统一降级归本卡 | Human 2026-11-04；见 [TASK-055 §3](./TASK-055.md) |
| D-01（跳过载体） | 独立 TaskSkip 集合；`lastSkip` 为 064 可选字段，本卡「有则展示、无则兼容省略」 | Human 2026-11-04；[TASK-057 计划 §6](./TASK-057-plan.md) |
| R-01（055↔063 接入） | `PriceTaskCard` props 以 055 交付物为准（§4-3），063 不二次请求 | 055 实现 `827c1dc` 已冻结接口 |
| **实施顺序** | **串行**：057 → 064 → 本卡；AC2/AC3 用真实记录验收 | **Human 2026-11-05** |

实施层自由度（不需再审批）：新卡视觉细节与缺省文案措辞、夹具形态、派生模块文件名。Story AC 不改。

## 7. Verification

以下为未来验收设计，未运行；命令入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)，不以历史数量为预期。串行前提下 AC2/AC3 直接以真实数据验证（dev 库含 057 落地后至少一个周期的五任务真实 result，与 057 R-7 同要求）：

| Task AC | 验证方法与期望 |
|---|---|
| AC1 | 真实 GET 五卡固定顺序绑定快照；构造 ok/warn/bad/unknown 混合 → 总览不假绿；缺项补 unknown；仅五项 ok 且无缺口才「全部正常」。 |
| AC2 | 真实 result 渲染四卡：完整性 expected/actual/missing/跳过/gapAssets 摘要；提醒 evaluated/created/failed（created=0 为正常）；汇率仅显示可证实币种观测 + 「不证明汇率方向正确」标注。 |
| AC3 | 父任务 due 分母、生成/未超阈/失败与异常组合原因（真实 perPortfolio）；无父结果显示未知、不推断未到期；DOM 与代码均无 `/logs/rebalance` 详情路由。 |
| AC4 | 四型空态分别断言；构造 skip 记录断言 lastSkip 与 lastRun 分离、不覆盖真实运行；僵尸以 `stale` 标记呈现；无 P1 超期提示。 |
| AC5 | 可控网络/时钟：首挂载恰一次 GET；手动刷新更新 `generatedAt`（服务端值）；窗口聚焦/重连后**零自动请求**（请求数断言，负向对照：打开自动路径须 FAIL）；整体失败旧快照标过时+刷新失败、无快照五卡不可用、原日志独立可用。 |
| AC6 | `/api/cron/status` 请求数恒为 1（含价格卡）；`statusTone` 全卡消费；grep 无 `\|\| 0` 类兜底（负向对照）。 |
| AC7 | 单卡坏数据仅该卡异常；整体失败与单项异常可区分；浏览器 UTC+8/UTC-7 下目标日字符串一致。 |
| AC8 | 限定新代码树 grep 无 `useMutation`/`api.post\|put\|patch\|delete`（负向对照）；DOM 无执行类按钮；053 原日志回归 PASS（`client/scripts/` 既有脚本）；`npm run build --workspace client` + eslint 通过（实际输出记 §11）。 |

同基线有效证据可复用；负向对照在临时副本或夹具操作；验证失败不得改断言掩盖实现问题。

## 8. Risks

| 风险 | 应对 |
|---|---|
| Query 默认窗口聚焦/重挂载自动刷新（`main.jsx` 未关） | §4-1 显式关闭 + AC5 请求数断言与负向对照 |
| 旧快照被误认为新数据 | 只用服务端 `generatedAt` + 显式过时标记（AC5） |
| unknown/缺契约参与总览被误判健康 | §4-4 判定次序 + AC1 混合状态用例 |
| 改动 055/056 已交付契约引发回归 | §4-3 以冻结 props 消费、不改其文件；发现接口不够用停下上报 |
| 槽位映射破坏 053/056 已验收断言 | 只加不改 + 053 结构回归脚本复跑（沿 056 先例） |
| 局部异常拖垮整页 | 卡级容错 + AC7 分层用例 |

## 9. Rollback

撤回 service/hook/新卡与槽位映射，恢复 053 骨架未知占位与两个原日志视图；无数据库/API 变更，不动 055/056 已交付物与已写结果。

## 10. Implementer Handoff

本计划未批准，不构成实施交接。批准后由 Orchestrator 核对 W0 前置（057/064 已合入）、状态与基线，再交 Implementer。边界：仅 `client/src/services/cronStatus.service.js`、`client/src/hooks/useCronStatus.js`、`client/src/components/CronStatus/`（新增卡/派生模块/槽位映射/总览接线）、`LogViewer.jsx` 集成点；**不改** `server/` `shared/` `cron-worker/`、不改 055/056 既有文件契约（其内确有缺陷须停下上报）。交付：文件清单与 SHA256、AC 逐条实测、请求数断言与负向对照、053 回归结果、build/lint 实际输出、妥协与未验证项。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；Planner 自检不等于 Reviewer 判定。

## 13. Completion Record

尚未结案；无 Human 关闭或合入决定。
