# TASK-064 — US-001 实施计划

## Status

Status：Approved（2026-11-05，Human 批准当前设计）

Owner：Planner（规划完成）→ 待 Orchestrator 登记并指派 Implementer

Related Task：[TASK-064](./TASK-064.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：实施时从 up-to-date `main` 新建 `feature/TASK-064` 独立 worktree（沿 053/056 惯例）。**实施前置（串行，衔接 057 W5）**：`TASK-057` 合入 `main` 后启动——`shared/models/taskSkip.js` 与真实 `result` 写入是本卡的读取对象。规划期基线为 2026-11-05 的 `main`；目标文件 `shared/services/cronStatus.service.js` SHA256 `27a3cc56…` 与规划期记录一致（057 是写侧、文件零重叠，未触碰本卡目标）。

Approval：**2026-11-05，Human 明确「批准 task064」，据此登记 Draft → Approved。** 批准覆盖本文件 §1～§9 当前设计，**含 §6 所列契约变化**（API 新增可选 `lastSkip`、主视图查询预算 +1、FX 与再平衡判级语义修正），不含其他任务。上游 D-01/D-02/D-03 已裁决（[TASK-057 计划 §6](./TASK-057-plan.md)），本计划不重复索取。批准前不构成实施授权；批准后仍须满足 §10 的 W0 前置（057 合入 `main`）。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task 的 §3，逐条引用该节、不增删改；覆盖 US-001/AC-02、05～08、11（读侧兼容）。验证映射见 §7。本卡只修正共享读侧归一化错误 + 新增可选 `lastSkip` 只读观测；不重开 054（其结案历史保持原样，新修正记录在本卡），不新增详情功能，不改业务目标日，不做汇率方向修复（`TASK-051`）。

## 2. Context

契约基准唯一来源：[TASK-057 计划 §4「冻结样例」S1～S10](./TASK-057-plan.md)（producer→adapter→consumer 样例 + 4 条兼容说明）。本卡是其中 **adapter** 环：把 057 写入的 `taskruns.result` / `taskskips` 归一化为 API 信封，供 063 消费。串行顺序（Human 2026-11-05 裁决）：057 → **本卡** → 063。

## 3. Repository Findings（2026-11-05 亲读，行号为现状）

| # | 缺陷 / 缺口 | 位置 | 现状后果 |
|---|---|---|---|
| F1 | 标量数值分支 `ok: value===true \|\| value==='ok'` | `normalizeCurrencies` `cronStatus.service.js:475` | 数值 `7.13` 被判 `ok:false` → 假失败（AC1 违例；S5 兼容说明④） |
| F2 | `contractReady = currencies !== null`；不拒绝数组容器 | `buildFxDataState:499`、`normalizeCurrencies:465` | 空对象 `{}` 判「契约就绪」且无解释；数组不拒绝（AC2 违例） |
| F3 | 判级只看已有 entries（`okCount===entries.length`） | `buildFxDataState:501-507` | 只给 1 个币种也整体绿（AC2 违例；§8「只提供一个币种却整体绿」） |
| F4 | `due: result ? result.due === true : null` | `buildRebalanceRows:578` | `due=null`（未到期不猜，S6 p3）被读成 `false`（AC3 违例） |
| F5 | `generatedCount` 用 `(row.suggestionsCount ?? 0) > 0` | `buildRebalanceRows:618-620` | 未知（null）被当 0 计入（掩盖未知） |
| F6 | `rebalanceLevel` `due>0 && generatedCount<due → 'bad'` | `rebalanceLevel:626-631` | 正常未超阈（S6 p2）被判 `bad`（AC3 违例） |
| F7 | `contractReady = Array.isArray(perPortfolio)` | `buildRebalanceRows:560` | `perPortfolio` 缺项也标「契约齐备」（AC3 违例） |
| F8 | 无 `lastSkip` 读取路径 | 全文件 | AC4 新增（D-01 已批独立 TaskSkip 集合，S8） |

其余事实：预期币种单一来源 `SUPPORTED_CURRENCIES = ['USD','CAD','HKD']`（`fxRate.service.js:10`，未导出）；`loadFxCount`/价格目标日/detail 路由参数已正确、不动；既有测试 `server/test/integration/cronStatus.service.test.js` / `cronStatus.api.test.js` 用模型 stub（不冒充 Mongo 持久化，回交 §2 边界）；2026-11-05 环境实测（卡片启动核对）：dev 库 276 条 taskruns 全部无 `result`、`taskskips` 尚不存在（057 未落地）。证据边界：本轮未跑应用/测试。

## 4. Proposed Design（冻结）

1. **FX 归一化重写（F1～F3，AC1/AC2）**：
   - 预期币种集合**单一来源**：`fxRate.service.js` 的 `SUPPORTED_CURRENCIES` 加导出（只加 `module.exports` 条目，不改值），`cronStatus.service.js` 引用；**禁止**另抄一份。
   - 对象形态（S5，057 契约）：逐币种读显式 `ok`（`true`/`false` 皆为显式标志）与 `rateToCny`；`ok===true` 且 `rateToCny` 为正有限数才算「本次写入完成的观测」。
   - 标量数值形态（历史/兼容）：**仅数值观测**——`ok: null`、`rateToCny: <值>`、note `NUMERIC_OBSERVATION_ONLY`（「仅数值观测，不证明同步成功或汇率方向正确」）；正数**不得**判成功、**不得**判失败（AC1）。
   - 容器校验：数组、非对象、空对象 `{}`、缺任何预期币种、非法项（`ok` 非布尔、`rateToCny` 非正有限数）→ `contractReady=false` + 解释 note（`CONTRACT_NOT_READY` / `CURRENCY_MISSING` / `CURRENCY_INVALID` 列明缺什么），**不裸 `bad`、不假绿**（AC2）。显式失败标志与缺记录**可区分**：`ok:false` → 显示失败语义；缺项/未知 → 显示未知语义。
   - FX 判级表（冻结）：三币种齐且全 `ok===true` → `ok`；存在显式 `ok===false`：全败 → `bad`、混合 → `warn`；无显式失败但存在缺失/仅观测项：有 ≥1 个 `ok===true` → `warn`，否则 → `unknown`。任何非 `ok` 情形必带解释 note。

2. **再平衡归一化修正（F4～F7，AC3）**：
   - `due` **只认显式布尔**（`typeof result.due === 'boolean'`），`null`/缺失保持 `null`（未知），绝不转 `false`（S6 p3）。
   - `suggestionsCount` 仅显式非负有限数可读；`null` 保持未知，**不参与 `?? 0` 折算**（S6 p3/p4）。
   - `perPortfolio` **齐全性核对**：对照未归档组合集合逐项比对 `portfolioId`；缺项 → `contractReady=false` + note（`PER_PORTFOLIO_INCOMPLETE`，列缺项数）——数组存在 ≠ 契约齐备。脏项（null/非对象）逐项剔除并计 note，不打 500（沿现状防御）。
   - `rebalanceLevel` 新判级表（冻结）：`bad` = 存在显式失败（`status:'FAILED'` 或 failures 非空）；`warn` = 无失败但存在到期未解决（`due===true` 且 `needsRebalance===null`）、或 `status:'SKIPPED'` 项、或混合未知；`ok` = 全部项判定完整（到期项均已「生成建议」或「明确未超阈」）且无失败；`unknown` = `contractReady=false` 或判定字段缺失。**未超阈（`needsRebalance:false, suggestionsCount:0`）是正常完成，不是失败**。
   - `generatedCount` 只统计显式 `suggestionsCount > 0` 的项；未知项单独计数（`unknownCount`，可选字段）或在 note 体现，**不折算 0**、不把未超阈数加进 generatedCount（保持生成数真实）。
   - 子任务跳过项（S7）按 `status:'SKIPPED'` 呈现跳过语义，不用跳过冒充成功；其 `needsRebalance/suggestionsCount` 保持 `null`（不猜）。

3. **`lastSkip` 只读观测（F8，AC4 / D-01）**：
   - 仅**主视图**新增一次批量聚合（detail 视图零变化）：`TaskSkip.aggregate` 按 `taskName ∈ {daily-price-sync, price-integrity-check, alert-evaluate, fx-rate-sync, rebalance-check}` 分组取最新事件（`$sort skippedAt:-1` + `$group $first`），走 057 创建的 `{taskName:1, skippedAt:-1}` 索引；再平衡卡用**父名** `rebalance-check`，逐组合跳过经 S7 的 `perPortfolio[].status` 呈现。
   - 信封每任务新增**可选** `lastSkip: {taskName, runKey, reason, skippedAt, trigger} | null`；`lastRun` 照旧来自 TaskRun，`lastSkip` **不替换、不覆盖**、不冒充成功结果；不改任何正在跑的记录（只读）。
   - 无集合/无记录 → `lastSkip: null` 并兼容（063 按「有则展示、无则省略」）。错误处理**精确**：只捕获「命名空间不存在」类明确错误（Mongo `NamespaceNotFound`/code 26）按无记录处理；其余 DB 错误**如实抛出**，不吞成正常（§8）。

4. **查询预算（AC5）**：主视图聚合查询 **+1**（批量 skip 查询，一次拿五项）；写入 [API_CONTRACT.md](../../../handbook/technical/API_CONTRACT.md) 与 §11 实测记录；detail、错误参数（`detail?/date?/portfolioId?`）、五任务顺序、既有字段、价格目标日/`timezone` 语义**零回归**。仅 GET 只读，不触发任务、不写任何集合；不自动创建集合/索引（创建归 057）。

5. **文档同步（AC5/卡片 Scope）**：`API_CONTRACT.md` 补 `lastSkip` 可选字段、FX 判级语义、再平衡判级语义、查询预算 +1；`DATA_MODEL.md` 补 `taskskips` 读取口径与 `result` 契约引用（写侧定义归 057 的 `CRON_WORKER_DEV.md §5`，此处只链接不复制）。

6. **零改动红线**：不改 cron/任务执行/汇率采集业务规则、`server/` 路由与认证、价格目标日计算、054 结案历史与既有 detail 行为；不新建索引/集合（057 归属）；不写库。

## 5. Work Breakdown

- [ ] W0（前置门）：确认 057 已合入 `main`（`taskSkip.js` 模型 + result 写入落地）；核对实际落地形态与 [S1～S10](./TASK-057-plan.md) 一致，**有偏差停下上报**，不得自行改写契约。
- [ ] W1：按 S1～S10 列归一化期望表（正常/数值/空对象/缺币种/缺 result/四语义 perPortfolio/skip），作为用例蓝本。
- [ ] W2：FX 归一化重写（F1～F3）+ 判级表 + 解释 notes + `SUPPORTED_CURRENCIES` 导出；AC1/AC2 用例与负向对照。
- [ ] W3：再平衡归一化修正（F4～F7）+ 新判级表 + 齐全性核对；**既有 detail 回归**（`detail=rebalance` 行为零变化）。
- [ ] W4：`lastSkip` 批量聚合 + 信封可选字段 + 命名空间错误精确处理（F8）；查询预算记录。
- [ ] W5：验证与文档（§7）：单测/集成测试、真实 Mongo 联调（复用 057 W5 真实结果）、`API_CONTRACT.md`/`DATA_MODEL.md` 同步、全量回归。

## 6. Decisions

**上游已裁决（引用，不重复索取）**：

| 项 | 结果 | 依据 |
|---|---|---|
| D-01 跳过载体 | 独立 TaskSkip 集合 → 本卡按 AC4 增可选 `lastSkip` | Human 2026-11-04；[TASK-057 计划 §6](./TASK-057-plan.md) |
| D-02 result 摘要/汇率 | `currencies{USD/CAD/HKD:{ok, rateToCny}}`（S5）；失败运行不补造（S4） | 同上 |
| D-03 父任务 | 内部包裹、`perPortfolio`（S6/S7） | 同上 |

**本计划的契约变化**（卡片 §6 指明须随本计划批准）：API 新增可选字段 `lastSkip` + 主视图查询预算 +1 + FX/再平衡判级语义修正。**Human 批准本计划即覆盖上述契约变化**。实施层自由度（不需再审批）：notes 文案措辞、聚合管道写法、`unknownCount` 是否输出（不输出则全在 notes）。

## 7. Verification

以下为未来验收设计，未运行；命令入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)，不以历史数量为预期。stub 单测只证明读侧映射；**真实持久化证据由 057 提供**，读侧 stub 不得冒充写侧证据（AC6）。每条 AC 映射：

| Task AC | 验证方法与期望 |
|---|---|
| AC1 | S5 显式对象、S5' 数值形态、0/负/NaN、已知方向错误但合法正值（如 USD 0.14）分别断言：数值仅「观测可读」、不判失败不判成功、带 `NUMERIC_OBSERVATION_ONLY` note；不声称方向已修。 |
| AC2 | 空对象 `{}`、数组容器、缺 USD/CAD/HKD 任一、非法项（`ok` 非布尔/`rateToCny` 非正有限）逐个断言：`contractReady=false` + 解释 note、不假绿、不无解释 bad；显式 `ok:false` 与缺记录的展示语义可区分；判级表六分支各一用例。 |
| AC3 | S6 四语义 + S7 跳过逐项断言：`due=null` 保持未知（不转 false）、未超阈 `suggestionsCount=0` 判 `ok` 不判 bad、缺项 → `contractReady=false` + `PER_PORTFOLIO_INCOMPLETE`、S9 历史无 result 保持降级；`detail=rebalance` 既有行为回归用例零改动通过。 |
| AC4 | 构造 S8 两条 skip 事件断言：`lastSkip` 与 `lastRun` 分离（skip 不覆盖、不冒充成功）、首跑 `RUNNING` 记录原样保留；无集合/无记录 → `null` 兼容；**注入非命名空间 DB 错误必须抛出**（负向对照：吞错 → FAIL）。 |
| AC5 | 捕获查询次数断言：主视图 = 原查询数 +1 且为单次批量聚合（负向对照：N+1 逐项查询 → FAIL）；GET 不触发任务、不写集合；五任务顺序、`detail?/date?/portfolioId?` 错误参数行为逐项回归。 |
| AC6 | 用例覆盖：数字汇率/空对象/非法缺币种/完整与缺 result/skip 覆盖/RUNNING+STALE 保留；真实 Mongo 集成复用 057 W5 产出的真实结果（S1～S10 实例），未取得的项标「缺证据」，不以 stub 顶替。 |

同基线有效证据可复用；负向对照在临时副本或夹具操作；验证失败不得改断言掩盖实现问题。

## 8. Risks

| 风险 | 应对 |
|---|---|
| 合法数值被当业务成功 / 只给一个币种整体绿 | §4-1 判级表 + AC1/AC2 全分支用例 |
| 跳过掩盖真实失败 / skip 冒充成功 | `lastSkip` 与 `lastRun` 分离 + AC4 断言 |
| 无条件 catch 吞数据库故障 | 只捕获命名空间缺失类明确错误，其余抛出 + AC4 负向对照 |
| 修复判级影响 063/055 既有消费 | 055 只消费价格卡（不受影响）；063 未实施、按本卡修正后的语义开发（已在 063 计划 W0 引用本契约） |
| 新查询拖慢主视图 | 单次批量聚合 + 索引（057 建）+ 查询预算记录 |
| detail 视图被顺手改动 | W3 明确「detail 回归零变化」+ 回归用例 |

## 9. Rollback

撤回读侧修正与 `lastSkip` 可选字段（旧客户端忽略新字段，天然兼容）；保留数据库事实、不删除 `taskskips`；回退前记录重新暴露的旧缺陷（F1～F7 将复现）。无 DDL、无数据变更。

## 10. Implementer Handoff

**2026-11-05：本计划已批准，构成实施交接依据；但 W0 前置未满足（057 尚未合入 `main`），暂不派发。**

- **Task / AC**：[TASK-064](./TASK-064.md) §3，AC1～AC6 逐条对照。
- **契约基准**：[TASK-057 计划 §4 冻结样例 S1～S10](./TASK-057-plan.md) + 4 条兼容说明；落地形态与样例不符时**停下上报**。
- **改动边界**：`shared/services/cronStatus.service.js`、`shared/services/fxRate.service.js`（**仅**加 `SUPPORTED_CURRENCIES` 导出）、`server/test/integration/*`、`docs/handbook/technical/API_CONTRACT.md` / `DATA_MODEL.md`；**读** `shared/models/taskSkip.js`（057 所有，不改）。不改 `cron-worker/`、任务执行、汇率采集规则、路由与认证。
- **验证入口**：[DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)；查询预算与真实 Mongo 联调结果记 §11。
- **回交要求**：文件清单与 SHA256、AC 逐条实测、负向对照、查询预算前后对比、detail 回归结果、妥协与未验证项写 §11。

### 10.1 启动核对结果（2026-11-05，Orchestrator）

依据：Human 指示「批准 task064」；状态权限见 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态)。

**结论：设计有效，F1～F7 缺陷经 Orchestrator 亲读逐一核实属实（含行号）；但 W0 前置未满足——057 未合入 `main`，本卡不可开工。**

| 启动项 | 核对事实 |
|---|---|
| 基线 | `main` = `65d2030`；`feature/TASK-064` 分支**不存在** |
| **W0 前置（阻断）** | **`git merge-base --is-ancestor 5bb47ea main` = 否**。`feature/TASK-057` @ `5bb47ea` 仍停在 `Reviewing` 的 worktree 里，**未合入**。故 `shared/models/taskSkip.js` 与真实 `result` 写入在 `main` 上**均不存在** |
| F1（`normalizeCurrencies`） | ✅ 属实：`ok: value === true \|\| value === 'ok'` → 数值 `7.13` 判 `ok:false` |
| F2（`contractReady`） | ✅ 属实：`contractReady = currencies !== null`，空对象 `{}` 判就绪；数组不拒绝 |
| F3（判级只看已有 entries） | ✅ 属实：`okCount === entries.length` → 只给 1 币种也整体绿 |
| F4（`due` 转 false） | ✅ 属实：`due: result ? result.due === true : null` → `null` 被读成 `false` |
| F5（`?? 0` 折算） | ✅ 属实：`(row.suggestionsCount ?? 0) > 0` |
| F6（判级误报 bad） | ✅ 属实：`due > 0 && generatedCount < due → 'bad'` |
| F7（`Array.isArray` 即齐备） | ✅ 属实：`contractReady = Array.isArray(perPortfolio)` |
| F8（无 lastSkip） | ✅ 属实：全文件无 `lastSkip` 读取 |
| 目标文件 | `shared/services/cronStatus.service.js` SHA256 `27a3cc56…` 与计划记录一致；057 是写侧、文件零重叠 |

**处置**：W0 未满足前**不登记 `Implementing`、不派发**。待 057 审查通过并合入 `main` 后，按本计划 §10 派发。

**未做的事**：未建分支或 worktree；未改任何代码；未运行测试。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；Planner 自检不等于 Reviewer 判定。

## 13. Completion Record

尚未结案；无 Human 关闭或合入决定。
