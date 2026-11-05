# TASK-055 — US-001 实施计划

## Status

Status：Approved

Owner：Planner（规划已完成）→ 待指派 Implementer

Related Task：[TASK-055](./TASK-055.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：从 `main` 的 `53edb8e` 新建 `feature/TASK-055`，在**独立 worktree** 中实施。规划期只读基线为 `chore/agent-rules-refactor` @ `2bde913`（该提交是 `main` 祖先）。**关键前置已就绪**：`TASK-056` 的 `status*` token 与 `statusTone.js` 已随 `53edb8e` 合入 `main`，AC2 可直接引用。

Approval：**2026-11-04，Human 指示「完成合并了！现在开始 055」，据此登记 Draft → Approved。** D-04 三项裁决已折入 AC6/AC8/AC9（见 Task §3 与卡内「D-04 裁决记录」），本计划 §4/§5/§6/§7/§8 已同步对齐。批准覆盖本文件 §1～§9 当前设计，不含其他任务。

启动核对：2026-11-04 完成只读核对，见 §10。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task 的 §3，逐条引用该节、不增删改；覆盖 US-001/AC-03、04、07、10。验证映射见 §7。当前计划不允许实现US-001范围外的P1/P2功能、调度控制或既有汇率方向修复。

## 2. Context

需求、任务和未决项见 [Planner回交](./US-001-02-planner-return.md)。本任务需 ExecPlan：跨组件数据/导航或状态逻辑，保留原卡计划要求。不新增审批层。

## 3. Repository Findings

本轮只读源码核实位置、SHA256和证据边界见 [回交 §2](./US-001-02-planner-return.md)。未连接数据库、未执行应用/测试或DDL；部署Mongo版本、实际索引/集合与当前数据库数据均未核实。054历史测试日志只作既有证据，不能当成本次运行。

## 4. Proposed Design

价格组件消费063提供的单次快照props，不另发请求、不自行取市场日。targetMarketDate按字符串展示；多市场差异和TARGET_LAGGED等由后端byMarket/notes解释，不用浏览器本地Date重新定日。

expected/fetched只取dataState，配色只取dataStateLevel并使用056映射，运行状态仅放运行徽章。**D-04 已裁决（2026-11-04）**：允许唯一纯展示 helper 由 `fetched / expected` 计算显示百分比并钳制 0～100，该 helper 不重算业务口径（不得改 expected/fetched/目标日，不得用 lastRun 反推）；`expected = 0` 时显示"—"且灰色，无效/缺失显示 unknown，绝不把 null 当 0。

missing列表按symbol/name/market展示和折叠；缺失总数用实际数组。**D-04 已裁决**：失败分两层——整体请求失败由063统一降级（五卡一致、原日志独立、有旧快照时明示过时），单价格数据异常只影响本卡；空态分三型（无应采资产 / 全缺疑似整体故障 / 请求失败），**不设 `dataState === null` 分支**（价格卡恒为对象）。

## 5. Work Breakdown

- [ ] W1：核对054价格dataState字段（已确认无percentage、`contractReady` 恒 true），按 D-04 裁决口径确定唯一展示 helper 与三型空态分支。
- [ ] W2：按批准口径实现纯展示helper、进度/缺失清单与056映射。
- [ ] W3：接063共享请求状态，区分无应采/全缺/请求失败；不自算目标日。
- [ ] W4：执行0/0、过量、时区、假绿、清单、单卡异常与整体失败验证。

## 6. Decisions

**D-04 已由 Human 裁决（2026-11-04），三项全部采纳推荐方案**，原 AC6 / AC8 / AC9 已按裁决更新（见 [TASK-055 §3](./TASK-055.md) 与卡内「D-04 裁决记录」）。本节记录裁决后的实施口径：

| 子项 | 裁决结果 | 对实施的约束 |
|---|---|---|
| **AC6** | 允许前端做 `fetched / expected` 的**纯展示**换算 | 只能有**一处** helper；不得改 `expected` / `fetched` / `targetMarketDate`；不得用 `lastRun` 反推；结果钳制 0–100 |
| **AC8** | 失败分**两层**验收 | ① 整体失败（请求挂）→ 五卡统一降级、原日志不受影响；② 单卡数据异常 → 只影响价格卡。**本卡只实现价格卡侧**，共享请求层归 `TASK-063` |
| **AC9** | 空态分**三型** | 无应采资产（`expected===0`，灰）/ 全缺（`fetched===0 && expected>0`，红，"疑似整体故障"）/ 请求失败（"快照获取失败"）。**不写 `dataState === null` 分支**——价格卡恒为对象 |

**仍未决、影响实施范围的两项**（不阻塞，但需在交接时标注）：

- **AC2（四态配色）**：`TASK-056` 未实施，`design-tokens.js` 无 `status*` token。本卡不得自建色值 → 建议本轮以中性灰 + `data-state` 占位，AC2 待 056 落地后补。
- **AC8 ①（整体失败）**：依赖 `TASK-063` 的共享请求层，本卡无法独立验收该条。

决定详情与选项见回交 §4。其余未决内容不得按推荐值擅自实现。

## 7. Verification

以下为未来验收设计，未运行。适用命令入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)，不以历史数量作为预期。每条AC均有映射：

| Task AC | 验证方法与期望 |
|---|---|
| AC1～AC3 | 目标日/应采/已采/百分比与缺失清单；正数齐全/部分/全缺四态场景。 |
| AC4、AC5 | 0/0显示—不NaN/Infinity/0%；超量不溢出，异常不默认为健康。 |
| AC6 | **已裁决（2026-11-04）**：允许一处纯展示 helper 做 `fetched / expected` 换算。验证：① `grep -c "\* 100"` 在实现目录内 ≤ 1；② 该 helper 不修改 `expected`/`fetched`/`targetMarketDate`；③ 结果钳制 0–100。 |
| AC7 | SUCCEEDED但fetched=0时仍为bad，运行徽章与数据态独立。 |
| AC8 | **已裁决（2026-11-04）**：分两层。① 整体失败——请求 abort/5xx 时五卡统一降级，**两个原始日志 tab 仍可加载**（可实测）；有旧快照时显示"旧数据 + 刷新失败"。② 单卡数据异常——构造价格段字段缺失/非数，断言仅价格卡异常、其余四卡正常。 |
| AC9 | **已裁决（2026-11-04）**：三型空态分别验证——`expected=0` → 灰 + "无应采资产"，无 0%；`fetched=0 && expected>0` → 红 + "疑似整体故障"，不逐条列 missing；请求失败 → "快照获取失败"。均不得出现绿色或"全部正常"。 |
| AC10 | 切换浏览器UTC+8/UTC-7，目标日字符串一致。 |
| AC11 | client build/lint执行并记录实际结果。 |

**本轮不可独立验收的两条**（须在交接时显式标注，不得记为通过）：
- **AC2**：`TASK-056` 未实施，无 `status*` token；本轮以中性灰 + `data-state` 占位，AC2 待 056 落地后补验。
- **AC8 ①**（整体失败）：依赖 `TASK-063` 共享请求层；本卡只能验"原始日志不受影响"与"本卡降级表现"，五卡统一降级归 063 集成验证。

同基线有效证据可复用；只对新增/关键断言补负向对照，在临时副本或夹具操作，不污染被审实现。验证失败不得改断言掩盖实现问题。

## 8. Risks

未批准即改写AC、时区偏移、null变零、整体失败被伪装局部成功；以分层错误场景（整体失败/单卡异常/三型空态）与 D-04 已裁决口径控制。另：**展示换算 helper 扩散**——若同一换算被复制到第二处即违反 AC6，用 `grep -c "\* 100"` ≤ 1 卡住。

## 9. Rollback

撤回价格组件及其props接入，不修改API和历史数据；保留骨架unknown状态。

## 10. Implementer Handoff

### 10.1 启动核对结果（2026-11-04，Orchestrator）

依据：Human 指示「完成合并了！现在开始 055」；状态权限见 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态)。

**结论：设计有效，AC1～AC11 可实施，无硬阻塞。**

| 启动项 | 核对事实 |
|---|---|
| 基线 | `main` = `53edb8e`（056 已合入）；`feature/TASK-055` 分支**不存在**，需新建 + worktree |
| 依赖 B4（054） | ✅ `GET /api/cron/status` 已在 `main`（`server/routes/cronStatus.routes.js`，`app.js:121` 挂载） |
| 依赖 B5（053 骨架） | ✅ 已在 `main`（PR #41） |
| 依赖 B6（056 token） | ✅ **已解除**：`statusOk/Warn/Bad/Idle` + `statusTone.js` + `StatusLegend.jsx` 随 `53edb8e` 进 `main` |
| 数据契约（实测） | 价格 `dataState` = `{ targetMarketDate, calendarPrevOpenDay, expected, fetched, missing[], byMarket, notListed, unsupportedMarkets, dayPriceSymbolCount }`；外层 `dataStateLevel`（ok/warn/bad/unknown）、`contractReady`（价格恒 `true`）。**无 `percentage` 字段**，`dataState` 恒为对象不会 `null` |
| AC6 依据 | 接口无百分比 → 前端必须算；D-04 已裁决允许**唯一一处**纯展示 helper |
| AC8 分层 | 单端点返回五卡数据 → ①整体失败归 `TASK-063`；②单卡数据异常归本卡 |
| 验证入口 | [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md#7-验证与测试命令)：`cd client && npm run build && npm run lint`。`client` 无 `test` 脚本；eslint v9.39.5 |

### 10.2 已准备、尚未派发的交接

- **需求**：[TASK-055](./TASK-055.md) §1～§4。
- **设计与验证**：本计划 §4 / §5 / §7。
- **写入边界**：仅 `client/` 下与价格卡相关的文件；不改 `server/` `shared/` `cron-worker/`，不改行情页/持仓页/KPI 卡/账号页配色，不改 053/056 已交付的组件契约。
- **AC8① 边界**：整体失败的五卡统一降级归 `TASK-063`；本卡只实现本卡降级表现 + 原始日志不受影响，交付时须显式标注。
- **交付要求**：文件清单与 SHA256、AC1～AC11 逐条结果、负向对照记录（AC2/AC4/AC7/AC9）、build/lint 实际输出、妥协与未验证项。

### 10.3 剩余启动动作

从 `main`（`53edb8e`）建 `feature/TASK-055` 独立 worktree，记录路径/分支/基线/工作区状态/工具可用性，然后指派 Implementer。本轮**未执行**该动作，未切换或清理主工作区。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；本轮Planner自检不等于Reviewer判定。

## 13. Completion Record

尚未结案；无Human关闭或合入决定。
