# PL-4 再平衡决策线（Rebalancing）

> 版本：v1.0 · 日期：2026-10-15
> 归属：[PRODUCT_LINES.md](../PRODUCT_LINES.md)「产品线 INDEX」中 **PL-4** 的明细子文件
> 内容范围：① 成熟度快评（总表 §2.4） ② 产品线 → 产品模块归属（总表 §3） ③ 全量功能评估 ④ 已实现功能点清单 ⑤ 架构实现明细（合并自原 `architecture/functions.md` §4.6，原文件已[归档](../../archive/functions.md)）
> 功能编码：`RB-01~11` + `CM-09/10`（阈值参数），沿用 [PRD](../specs/PRD.md)

---

## 1. 定位与价值主张

**价值主张：偏离阈值 → 给出先卖后买的可执行建议 → 确认后生成内部交易 → 可撤销 / 重做；永不自动交易。**

本线是产品最核心的差异化：它把「我该不该动、怎么动」从人的判断变成系统的可执行清单。同时它有一条清晰的**安全边界**——AUTO 调度只生成建议与提醒，绝不自动下单。

- **上游依赖**：PL-2 价格（缺价即无法生成建议）、PL-3 目标配置与漂移。
- **下游影响**：生成内部交易回写 PL-1 账本；产出提醒写入 PL-5 通知中心。
- **硬约束**：`executeRebalance` 强制 `mode=MANUAL`，AUTO 传入即 `AUTO_EXECUTION_DISABLED`。

---

## 2. 成熟度快评

| 维度 | 评价 | 说明 |
|---|---|---|
| 功能覆盖 | 高 | 检测 → 建议 → 执行 → 撤销 / 重做 → AUTO 巡检全闭环 |
| 用户体验 | 中 | 双环饼图直观，但建议不可手动微调 |
| 数据可信 | 高 | 纯函数引擎、建议与记录严格比对、费用可对账 |

**主要短板**：① 建议缺「整手 / 最小金额」约束，**差一步可执行**；② 建议不可行内微调。

---

## 3. 产品线 → 产品模块归属

| 模块 | 包含功能 | 用户价值 | 现状 |
|---|---|---|---|
| **M4.1 偏离检测** | CM-09 阈值参数、CM-10 检查频率、RB-01 阈值检测 | 客观回答「现在偏不偏」 | 完整 |
| **M4.2 建议生成** | RB-02 建议生成、RB-03 建议输入、RB-04 警告体系、RB-10 费用模型、RB-11 大类层 | 给出「先卖后买」的具体交易清单 | 完整；缺整手 / 最小金额约束 |
| **M4.3 执行闭环** | RB-05 执行、RB-06 撤销、RB-07 重做、RB-09 前端可视化 | 一键落账 + 后悔药 | 完整；建议不可手动微调 |
| **M4.4 自动巡检** | RB-08 AUTO 调度 | 自动发现偏离并提醒（**永不自动交易**） | 完整，安全边界清晰 |

---

## 4. 全量功能评估

> 判定标准见 [PRODUCT_LINES.md](../PRODUCT_LINES.md) §评估框架。判定不改变任何代码。

| 编号 | 功能 | 判定 | 理由（产品视角） | 建议动作 | 优先级 |
|---|---|---|---|---|---|
| RB-01 | 阈值检测 | **强化** | 检测扎实，但漂移无历史趋势；用户看不到「什么时候开始偏的」 | 增加漂移历史曲线与「上次正常」时间点 | P2 |
| RB-02 | 建议生成 | **强化** | 「先卖后买 + 资金池」逻辑正确，但**建议数量未按整手 / 最小金额取整**，A股 / 部分券商不可直接执行 | 增加「整手取整」与「最小交易金额」选项，输出可直接抄单的清单 | **P1** |
| RB-03 | 建议输入 | 保留 | 可投入现金 + 费率假设 | — | — |
| RB-04 | 警告体系 | 保留 | 缺价跳过、资金不足、总值为零三类告警清晰 | — | — |
| RB-05 | 执行 | 保留 | 建议与记录严格比对、生成本地交易，防误操作 | — | — |
| RB-06 | 撤销 | 保留 | 倒序生成反向交易，可回退 | — | — |
| RB-07 | 重做 | 保留 | `sourceRecordId` 链，闭环完整 | — | — |
| RB-08 | AUTO 调度 | 保留 | 「只生成建议、绝不自动交易」的安全边界是产品亮点 | — | — |
| RB-09 | 前端可视化 | **强化** | 双环饼图直观，但建议**不可手动微调**（改数量 / 跳过某条）后再执行 | 支持建议项行内编辑与勾选后再提交 | **P1** |
| RB-10 | 费用口径 | 保留 | 建议费用 = 执行 fee，可对账 | — | — |
| RB-11 | 大类层再平衡 | 保留 | 类内摊分保持结构，边界告警到位 | 同样依赖资产补分类 | — |

---

## 5. 已实现功能点清单

### M4.1 偏离检测

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| CM-09 | 再平衡参数 | 绝对偏离阈值（默认 5%）、相对偏离阈值（默认 10%）、时间间隔（默认 60 天），三项**可独立启停** | 组合表单 / 再平衡设置 |
| CM-10 | 检查频率 | `daily / weekly / monthly`，默认 `daily` | 再平衡设置 |
| RB-01 | 阈值检测 | **纯函数** `evaluateThresholds`：逐 symbol 算 `currentRatio / absoluteDeviation / relativeDeviation`，绝对或相对超阈即触发；时间间隔在 `NEVER_EXECUTED` 或 `TIME_INTERVAL_EXCEEDED` 触发；`totalValue≤0` 记 `TOTAL_VALUE_ZERO`；大类模式用**大类伪持仓**评估 | `POST /:pid/rebalance/check` |
| — | 阈值设置前端 | `PortfolioRebalanceSettings`：三类阈值「启用勾选 + 数值」 | 组合详情「再平衡」Tab |

### M4.2 建议生成

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| RB-02 | 建议生成 | **纯函数** `buildSuggestions`：校验全部持仓有最新价 → `investableValue = 总市值 + cashBudget` → **先卖后买**（卖出净所得计入资金池）→ 买入按缺口比例分配（扣固定费与比例费）→ 每条含 `postRebalanceRatio`；返回 `suggestions + warnings + funding{cashBudget, saleProceeds, availableForBuys, buySpend, remainingCash}` | `POST /:pid/rebalance/suggestions` |
| RB-03 | 建议输入 | 本次可投入现金 `cashBudget`（≥0）+ 费率假设 | 建议参数区 |
| RB-04 | 警告体系 | `MISSING_MARKET_PRICE:symbol`（缺价跳过）、`BUYS_LIMITED_BY_AVAILABLE_CASH`（资金不足）、`TOTAL_VALUE_ZERO`（去重后返回） | 建议结果 |
| RB-10 | 费用模型 | `normalizeFeeModel`（`{fixedFee, ratioFee, taxRate}` 非负、费率 ≤1）+ `estimateTradeCost`（`estimatedFee = fixedFee + grossValue×ratioFee`；**买入不计税**）；执行时交易 `fee = estimatedCost`，可对账 | `costEstimator` |
| RB-11 | 大类层再平衡 | 大类目标 → 类内市值占比摊分 symbol 级建议（保持类内结构）；新大类无持仓记 `CLASS_NO_POSITIONS`、未分类持仓记 `UNCLASSIFIED_POSITIONS`；建议标注 `assetClass`，记录记 `classMode` | 建议结果 |

### M4.3 执行闭环

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| RB-05 | 执行 | 仅 `MANUAL`、仅 `PENDING` 可执行；严格比对提交建议与记录（symbol/action 精确、quantity/price 容差 `1e-8`，不一致报 `SUGGESTIONS_CHANGED`）；按**先卖后买**生成内部交易（不连券商）；状态 → `EXECUTED` + `executedTransactionIds` | `POST /:pid/rebalance/execute` |
| RB-06 | 撤销 | 仅 `EXECUTED` 可撤销：**倒序**生成反向交易（buy↔sell，数量/价格/费用一致）；状态 → `REVOKED` + `reversalTransactionIds`；持仓与成本恢复 | `POST /rebalance/:recordId/revoke` |
| RB-07 | 重做 | 仅 `REVOKED` 可重做：基于原建议创建**新 `PENDING`** 记录（`sourceRecordId` 链），仍需再次确认 | `POST /rebalance/:recordId/reexecute` |
| RB-09 | 前端可视化 | `RebalanceSuggester`（检查 / 生成 / 执行 + 参数区 + 阈值明细表 + 建议表 + **双环饼图**「当前 vs 建议后」）；`RebalanceHistory`（记录表 + 撤销 + 重新生成待确认） | 组合详情「再平衡」Tab（3 子 Tab） |

### M4.4 自动巡检

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| RB-08 | AUTO 自动巡检 | `cron-worker` 的 `rebalanceScheduler`，默认 `0 0 * * *`，**单日分发**：遍历全部未归档组合，按 `rebalanceSchedule` 判到期（daily=每天 / weekly=周一 / monthly=每月 1 日）→ 阈值检查 → 生成建议 → `alertCenter.notify` 写 `AlertEvent`；`runKey = {schedule}:{periodKey}` **防重语义与迁移前一致**；逐组合故障隔离 | 定时（cron-worker） |
| — | 硬约束 | `executeRebalance` 强制 `mode=MANUAL`，AUTO 传入即 `AUTO_EXECUTION_DISABLED`——**自动调度只生成建议 + 提醒，绝不自动交易** | 引擎层 |

---

## 6. 架构实现明细（合并自原 functions.md §4.6）

**承载**：`shared/services/rebalance/*`、`client/src/pages/Portfolio/Rebalance*.jsx`

### 6.1 阈值检测（RB-01）

`thresholdChecker.evaluateThresholds()`（**纯函数**）：逐 symbol 计算 `currentRatio / absoluteDeviation / relativeDeviation`；绝对偏离 > 阈值 **或** 相对偏离 > 阈值触发；时间间隔在 `lastExecutedAt` 为空（`NEVER_EXECUTED`）或 `elapsedDays ≥ timeInterval`（`TIME_INTERVAL_EXCEEDED`）触发；`totalValue ≤ 0` 记 `TOTAL_VALUE_ZERO`。返回 `{needsRebalance, triggeredThresholds, totalValue, details, reasons}`。大类模式用**大类伪持仓**评估。

### 6.2 建议生成（RB-02 ~ RB-04, RB-11）

`suggestionGenerator.buildSuggestions()`（纯函数）：

1. **校验全部持仓有最新价**，否则 `MISSING_MARKET_PRICE`（RB-04）。
2. `investableValue = 当前总市值 + cashBudget`；≤0 返回空 + `TOTAL_VALUE_ZERO`。
3. **先卖后买**：先处理 `currentValue > desiredValue` 的卖出（数量 `min(现有持仓, 超配额/价)`），卖出净所得（扣费）计入资金池。
4. 买入按 `(目标缺口 / 总缺口) × 可用资金` 分配，扣除固定费与比例费反算可承受毛利；资金不足告警 `BUYS_LIMITED_BY_AVAILABLE_CASH`。
5. 每条建议计算 `postRebalanceRatio`；排序：先卖后买，同类按 symbol。
6. 返回 `{suggestions, warnings, funding{cashBudget, saleProceeds, availableForBuys, buySpend, remainingCash}}`。

**大类模式**（RB-11）：缺口告警 `CLASS_NO_POSITIONS:<class>`（新大类无持仓）/ `UNCLASSIFIED_POSITIONS`（未分类持仓）；建议标注 `assetClass`；`RebalanceRecord` 记 `classMode`。

### 6.3 费用模型（RB-10）

`costEstimator.normalizeFeeModel()`：`{fixedFee, ratioFee, taxRate}` 非负，`ratioFee/taxRate ≤ 1`。
`estimateTradeCost()`：`estimatedFee = fixedFee + grossValue × ratioFee`；`estimatedTax = (action==='sell') ? grossValue × taxRate : 0`（**买入不计税**）。

### 6.4 执行 / 撤销 / 重做（RB-05 ~ RB-07）

| 操作 | 前置条件 | 行为 |
|---|---|---|
| **执行** | 仅 `MANUAL`；record 为 `PENDING` | 严格比对提交建议与记录（symbol/action 精确，quantity/price 容差 `1e-8`，不一致 `SUGGESTIONS_CHANGED`）；按**先卖后买**生成 Transaction（`fee = estimatedCost`）；状态 → `EXECUTED` + `executedTransactionIds` |
| **撤销** | 仅 `EXECUTED` | **倒序**生成反向交易（buy↔sell，数量/价格/费用一致）；状态 → `REVOKED` + `reversalTransactionIds` |
| **重做** | 仅 `REVOKED` | 基于原建议创建**新 `PENDING`** 记录，`sourceRecordId` 指向原记录；仍需再次确认 |

> **硬约束**：`executeRebalance` 强制 `mode=MANUAL`，AUTO 传入即 `AUTO_EXECUTION_DISABLED`。**自动调度只能生成建议，绝不自动交易。**

### 6.5 AUTO 调度（RB-08）

**载体**：`cron-worker/src/schedulers/rebalanceScheduler.js`（TASK-005 前是 API 进程内的 `scheduleManager.js`，现已在 `shared/services/rebalance/` 移除）。

**设计变更——「单日分发」**：AUTO 再平衡过去依赖「每个组合注册一个独立的 node-cron 实例」。调度迁到独立进程后，API 进程新增组合时无法跨进程动态注册 cron，因此改为**单一调度器每日分发**：

- 固定注册**一个** cron：默认 `0 0 * * *`（`REBALANCE_CHECK_CRON`，即每日 00:00）。
- 每次触发遍历全部**未归档**组合，按 `rebalanceSettings.rebalanceSchedule` 判断「今天是否到期」：

| `rebalanceSchedule` | 到期规则 |
|---|---|
| `daily` | 每天都到期 |
| `weekly` | 仅**周一**到期（对应原 `0 0 * * 1`） |
| `monthly` | 仅**每月 1 日**到期（对应原 `0 0 1 * *`） |

- 未到期的组合直接 `continue`，不产生 `TaskRun`；到期的组合逐个执行，**逐组合故障隔离**（单个组合抛错不影响后续组合）。

**语义保持**：`runKey` 仍按 `{schedule}:{periodKey}` 构造、`taskName` 仍为 `rebalance-suggestions:<portfolioId>`，因此 TaskRun 的**防重语义与迁移前完全一致**（同一周期不会重复生成建议）。

运行时**三层防护**：查库确认组合存在且未归档（否则 `REBALANCE_SCHEDULE_SKIPPED_ARCHIVED`）→ `runTrackedTask` 防重 → `checkThresholds` 无需再平衡则跳过；否则 `getSuggestions(mode=AUTO)` → `alertCenter.notify` 写 `AlertEvent`（level=action）。

> ⚠️ **隐式契约**：到期规则硬编码在 `SCHEDULE_DUE_RULES`，新增 `rebalanceSchedule` 取值时必须同步补规则，否则该频率**静默永不触发**（见 [PL-0](./PL-0-platform-foundation.md) §技术债）。

### 6.6 再平衡 API 与前端

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/portfolios/:pid/rebalance/check` | 阈值检测 |
| POST | `/api/portfolios/:pid/rebalance/suggestions` | 生成建议（`feeModel` / `cashBudget`） |
| POST | `/api/portfolios/:pid/rebalance/execute` | 执行（`recordId` + `suggestions` + `mode=MANUAL`） |
| GET | `/api/portfolios/:pid/rebalance/history` | 历史记录（分页） |
| POST | `/api/rebalance/:recordId/revoke` | 撤销 |
| POST | `/api/rebalance/:recordId/reexecute` | 重做 |

**前端**（组合详情「再平衡」Tab 内 3 个子 Tab）：

- `RebalanceSuggester`：检查再平衡 / 生成建议 / 执行建议（确认「先卖后买」）；参数区（可投入现金、固定费、比例费、卖出税率）；阈值明细表；建议表；**双环饼图**（当前 vs 建议后比例）。
- `PortfolioRebalanceSettings`：三类阈值「启用勾选 + 数值」。
- `RebalanceHistory`：记录表 + 撤销（仅 EXECUTED）/ 重新生成待确认（仅 REVOKED，成功后跳建议子 Tab）。

**数据模型**

| 模型 | 关键字段 | 唯一索引 / 主索引 |
|---|---|---|
| **RebalanceRecord** | `portfolioId`、`mode`(AUTO/MANUAL)、`suggestions[]`、`status`(PENDING/EXECUTED/REVOKED)、`triggeredThresholds[]`、`thresholdDetails[]`、`warnings[]`、`feeModel`、`cashBudget`、`funding`、`classMode`、`executedTransactionIds[]`、`reversalTransactionIds[]`、`sourceRecordId`、`executedAt`、`revokedAt` | — |

---

## 7. 边界与已知缺口

- **建议不可直接执行**（RB-02 / RB-09）：未按整手 / 最小金额取整，且不可行内微调——差异化在最后一步流失。
- **`SCHEDULE_DUE_RULES` 硬编码**：新增检查频率需同步补规则，否则静默永不触发。
- **漂移无历史趋势**（RB-01）：看不到「什么时候开始偏的」。

---

## 8. 相关文档

- [PRODUCT_LINES.md](../PRODUCT_LINES.md) — 产品线总览与 INDEX（本文件的上级）
- [PL-3 组合与配置线](./PL-3-portfolio.md) — 本线上游：目标配置与漂移
- [PL-5 提醒与通知线](./PL-5-alerting.md) — AUTO 建议的落地形态（AlertEvent）
- [PL-0 平台基座线](./PL-0-platform-foundation.md) — 调度清单与硬编码风险
- [PRD.md](../specs/PRD.md) — 需求基线（功能编码来源）
- [functions.md（已归档）](../../archive/functions.md) — 本文 §6 的原始来源
