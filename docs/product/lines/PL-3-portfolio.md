# PL-3 组合与配置线（Portfolio）

> 版本：v1.0 · 日期：2026-10-15
> 归属：[PRODUCT_LINES.md](../PRODUCT_LINES.md)「产品线 INDEX」中 **PL-3** 的明细子文件
> 内容范围：① 成熟度快评（总表 §2.4） ② 产品线 → 产品模块归属（总表 §3） ③ 全量功能评估 ④ 已实现功能点清单 ⑤ 架构实现明细（合并自原 `architecture/functions.md` §4.5，原文件已[归档](../../archive/functions.md)）
> 功能编码：`CM-01~20`，沿用 [PRD](../specs/PRD.md)

---

## 1. 定位与价值主张

**价值主张：把每个真实账户建成独立记账单元，设定目标配置，看清结构与漂移。**

本线是「决策层」的入口：账本（PL-1）回答「我现在是什么」，组合与配置回答「我**应该**是什么、现在偏了多少」。它为 PL-4 提供目标基准，为 PL-6 提供聚合单元。

- **上游依赖**：PL-1 持仓与成本、PL-2 价格。
- **下游影响**：PL-4 偏离检测与建议、PL-5 组合偏离规则、PL-6 组合贡献。
- **关键设计**：目标配置（`targets`）与账户类型（`accountType`）正交——前者是「配置意图」，后者是「真实载体」。

---

## 2. 成熟度快评

| 维度 | 评价 | 说明 |
|---|---|---|
| 功能覆盖 | 高 | 组合 CRUD / 归档 / 级联删除 / 目标配置 / 洞察齐全 |
| 用户体验 | 中高 | 详情 Tab 与卡片成熟；但卡片偏静态、目标校验只拒绝不辅助 |
| 数据可信 | 中 | 口径基本自洽；**组合记账币种缺 HKD** 与资产层不一致 |

**主要短板**：① 卡片缺趋势；② 币种枚举与资产层不一致（CM-04）；③ 大类目标依赖 PL-1 补分类工具才能真正好用。

---

## 3. 产品线 → 产品模块归属

| 模块 | 包含功能 | 用户价值 | 现状 |
|---|---|---|---|
| **M3.1 组合主数据** | CM-01~05、CM-11~13、CM-18~20 | 一个真实账户 = 一个组合，可归档不删除 | 完整 |
| **M3.2 目标配置** | CM-06 目标配置、CM-07 校验反馈、CM-08 大类目标层 | 定义「应该长什么样」，是漂移判断的基准 | 完整；校验只拒绝不辅助 |
| **M3.3 组合洞察** | CM-14 实时比例、CM-15 汇总统计、CM-16 持仓概览、CM-17 持仓历史 | 看清结构、比例与盈亏 | 较完整；缺汇总行 / 导出 / 趋势 |

---

## 4. 全量功能评估

> 判定标准见 [PRODUCT_LINES.md](../PRODUCT_LINES.md) §评估框架。判定不改变任何代码。

| 编号 | 功能 | 判定 | 理由（产品视角） | 建议动作 | 优先级 |
|---|---|---|---|---|---|
| CM-01 | 组合 CRUD | 保留 | 应用层级联、失败保留组合避免孤儿，处理谨慎 | — | — |
| CM-02 | 基本属性 | 保留 | 名称 + 描述够用 | — | — |
| CM-03 | 组合类型 | **修改** | 活钱 / 稳健 / 长期 三档偏少，跨 CN/CA 场景可能不够表达 | 保留三档默认，但允许扩展或自定义标签 | P3 |
| CM-04 | 基础币种 | **修改** | 仅 CNY/CAD/USD，而资产层已支持 HKD——**枚举不一致**，含港股的组合无合适记账币种 | 补 `HKD`，与 `ASSET_CURRENCIES` 对齐 | **P1** |
| CM-05 | 账户类型 | 保留 | 与风险定位正交互补，语义清晰 | — | — |
| CM-06 | 目标配置 | 保留 | 资产级 / 大类级二选一、合计 100% 硬约束 | — | — |
| CM-07 | 目标校验反馈 | **强化** | 合计 ≠100% 只「拒绝」，不「辅助」；用户需自己算差多少 | 提供「差 x.x%，一键补齐到某项」或自动归一化建议 | P2 |
| CM-08 | 大类目标层 | 保留 | 聚合伪持仓复用 symbol 口径，设计良好 | 依赖 AS-03/AS-09 补分类工具才能真正好用 | — |
| CM-09 | 再平衡参数 | 保留 | 三类阈值独立启停 | — | — |
| CM-10 | 检查频率 | 保留 | daily / weekly / monthly | — | — |
| CM-11 | 列表卡片 | **合并** | 与 CM-12 描述同一组件，属拆条描述 | 与 CM-12 合并为「组合卡片」一个条目 | P3 |
| CM-12 | 卡片增强 | **强化** | 缺「今日盈亏 / 总资产趋势」，卡片仍偏静态 | 增加市值趋势迷你图与「一键再平衡」快捷入口 | P2 |
| CM-13 | 详情 Tab | **修改** | 「概览」与「持仓概览」概念重叠，信息层级不清 | 明确职责：概览 = KPI + 配置 + 漂移；持仓 = 明细表 | P3 |
| CM-14 | 实时比例 | 保留 | 支持大类级视角 | — | — |
| CM-15 | 汇总统计 | 保留 | — | — | — |
| CM-16 | 持仓概览 | **强化** | 9 列信息密度高，但缺汇总行 / 排序记忆 / 导出 | 增加合计行、列排序持久化、导出 CSV | P2 |
| CM-17 | 持仓历史 | 保留 | 多币种分行、成本线叠加，口径一致 | — | — |
| CM-18 | 组合内交易视图 | 保留 | 增删改统一走交易模块，避免双写 | — | — |
| CM-19 | 级联删除 | **强化** | 删除谨慎，但删除前无「将删除 N 笔交易」影响预览 | 确认弹窗列出影响面（交易数 / 再平衡记录数） | P2 |
| CM-20 | 组合归档 | 保留 | 归档不删数据、三层调度防护，设计良好 | — | — |

---

## 5. 已实现功能点清单

### M3.1 组合主数据

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| CM-01 | 组合 CRUD | 创建 / 查询 / 更新 / 删除；删除执行**应用层级联** | `/portfolios`、`/portfolios/new`、`/portfolios/edit/:id` |
| CM-02 | 基本属性 | `name`（必填）、`description` | `PortfolioForm` |
| CM-03 | 组合类型（风险定位） | `活钱 / 稳健 / 长期`，默认「稳健」 | `PortfolioForm` |
| CM-04 | 基础币种 | `CNY / CAD / USD`，默认 `CAD`；**仅记账币种，不参与折算** | `PortfolioForm` |
| CM-05 | 账户类型（账户载体） | `tiantian / xueqiu / tfsa / rrsp / resp / taxable / other`，默认 `other`；与 CM-03 **正交**，用于家庭视图按真实账户分组 | `PortfolioForm` |
| CM-11 | 列表卡片 | 卡片展示名称、描述、类型、币种 | `/portfolios` |
| CM-12 | 卡片增强 | 卡片追加**市值（按币种分桶）**、持仓资产数、漂移状态徽标（「偏离阈值」琥珀 / 「配置正常」绿）、**未读提醒数** | `PortfolioCard` |
| CM-13 | 详情 Tab | 组合详情 4 个生效 Tab：持仓概览 / 持仓历史 / 再平衡 / 交易记录 | `/portfolios/view/:id[/:tab]` |
| CM-18 | 组合内交易视图 | 组合内交易流水，分页；增删改统一走交易模块（不双写） | 组合详情「交易记录」Tab |
| CM-19 | 级联删除 | 先删交易与再平衡记录再删组合；子资源清理失败则**保留组合**避免孤儿记录 | `DELETE /api/portfolios/:id` |
| CM-20 | 组合归档 | `archived=true`：不参与家庭市值、默认列表与再平衡调度，**数据完整保留**；三层调度防护（查库/防重/运行时守卫） | 组合表单归档勾选 |
| — | 组合列表页 | 卡片网格 + 「显示已归档」开关 + 归档数量提示 | `Portfolio/List` |
| — | 组合表单 | 基本信息（名称 / 类型 / 账户类型 / 币种 / 描述 / 归档）+ 目标配置（资产级 / 大类级切换、合计实时提示、提交前校验） | `PortfolioForm` |
| — | 组合详情头部 | `PortfolioHeader`：返回 / 编辑 / 添加交易 + 类型 / 币种 / 最近再平衡 Chip | `PortfolioHeader` |

### M3.2 目标配置

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| CM-06 | 目标配置 | 按 `symbol` 设置目标比例；目标不可重复；非空合计**精确 100%**（容差 `1e-6`） | 组合表单 / 目标配置 |
| CM-07 | 目标校验反馈 | 合计 ≠100% 时保存被拒（`INVALID_PORTFOLIO_TARGETS`）并提示 | 前端提示 |
| CM-08 | 大类目标层 | `targets.level ∈ {asset, asset_class}` **二选一、混合禁止**；大类模式按「类内市值占比」摊分到 symbol，保持大类内部结构；未分类持仓归入 `UNCLASSIFIED` 使偏离可见 | 目标配置页层级切换 |
| — | 校验与规范化（前后端同构） | `validateTargets`（symbol 必填唯一 / 比例 0–100 / 大类代码校验 / 禁止混合 / 合计 100%）与 `normalizeTargets`（asset→大写、asset_class→小写） | `shared/services/portfolio/validateTargets.js` + `client/src/utils/portfolioValidation.js` |

### M3.3 组合洞察

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| CM-14 | 实时比例 | 目标 vs 实际比例；支持 `?level=asset_class`（**币种内**大类占比） | `GET /:id/stats/actual-ratios` |
| CM-15 | 汇总统计 | 组合汇总统计（按 symbol 的统计数组，金额保留 2 位） | `GET /:id/stats` |
| CM-16 | 持仓概览 | 份额、平均成本、剩余成本、最新价、市值、未实现盈亏、盈亏比；支持搜索与按市值 / 盈亏比排序分页 | 组合详情「持仓概览」Tab |
| CM-17 | 持仓历史 | 市值与剩余成本趋势（日 / 周 / 月粒度），**币种分组，不跨币种合计** | 组合详情「持仓历史」Tab |

---

## 6. 架构实现明细（合并自原 functions.md §4.5）

**承载**：`client/src/pages/Portfolio/*`、`shared/services/portfolio/*`、`server/controllers/portfolio.controller.js`、`shared/models/portfolio.js`

| 功能 | 说明 |
|---|---|
| CM-01 组合 CRUD | 创建/查询/更新/删除；删除执行**应用层级联** |
| CM-02 基本属性 | `name`（必填）、`description` |
| CM-03 组合类型（风险定位） | `活钱 / 稳健 / 长期`，默认「稳健」 |
| CM-04 基础币种 | `CNY / CAD / USD`，默认 `CAD`；**仅记账币种，不参与折算** |
| CM-05 账户类型（账户载体） | `tiantian / xueqiu / tfsa / rrsp / resp / taxable / other`，默认 `other`；与 CM-03 **正交** |
| CM-06 目标配置 | 按 symbol 设置目标比例；不可重复；非空合计精确 **100%** |
| CM-07 目标校验反馈 | 合计 ≠100% 时保存被拒并提示 |
| CM-08 大类目标层 | `targets.level ∈ {asset, asset_class}` **二选一，混合禁止**；大类模式按类内市值占比摊分到 symbol |
| CM-09 再平衡参数 | 绝对偏离（默认 5%）、相对偏离（默认 10%）、时间间隔（默认 60 天），三项**可独立启停** |
| CM-10 检查频率 | `daily / weekly / monthly`，默认 `daily` |
| CM-11 列表卡片 | 名称、描述、类型、币种 |
| CM-12 卡片增强 | 市值（按币种分桶）、持仓资产数、漂移状态徽标、**未读提醒数** |
| CM-13 详情 Tab | 概览 / 持仓历史 / 再平衡 / 交易记录（实际生效 4 个 Tab） |
| CM-14 实时比例 | 目标 vs 实际比例，支持 `?level=asset_class`（币种内大类占比） |
| CM-15 汇总统计 | `GET /:id/stats` |
| CM-16 持仓概览 | 份额、平均成本、剩余成本、最新价、市值、未实现盈亏、盈亏比；搜索 + 排序分页 |
| CM-17 持仓历史 | 市值与剩余成本趋势（日/周/月），币种分组 |
| CM-18 组合内交易视图 | 分页；增删改统一走交易模块 |
| CM-19 级联删除 | 先删交易与再平衡记录，再删组合；子资源清理失败则**保留组合**避免孤儿 |
| CM-20 组合归档 | `archived=true`：不参与家庭市值、默认列表与再平衡调度，**数据保留** |

### 6.1 目标配置校验（CM-06/07/08）

`validateTargets`（`shared/services/portfolio/validateTargets.js`，前后端同构 `client/src/utils/portfolioValidation.js`）：

- `symbol` 必填且唯一；`targetRatio ∈ [0, 100]`；`level ∈ {asset, asset_class}`。
- `asset_class` 级 symbol 必须是大类代码（`equity/bond/gold/cash`）。
- **禁止混合**：存在任一大类目标则全部必须为大类。
- **合计必须 100%**（容差 `1e-6`），否则 `INVALID_PORTFOLIO_TARGETS`。
- `normalizeTargets`：`asset` → symbol 大写；`asset_class` → symbol 小写。

### 6.2 大类聚合（CM-08）

`shared/services/portfolio/assetClassAggregator.js`：

- `UNCLASSIFIED`：未分类持仓归入该桶，使偏离**可见**而非静默丢失。
- `aggregateByAssetClass`：按大类聚合市值（缺价持仓不参与）。
- `buildClassPositions`：把持仓聚合为「大类伪持仓」`{symbol, marketValue, currency:'AGG'}`，供 `evaluateThresholds` **复用 symbol 级口径**。
- `deriveSymbolTargets`：**大类目标 → symbol 目标摊分** = 大类目标 × symbol 市值在该大类内占比；未分类持仓目标为 0。

### 6.3 组合汇总卡片（CM-12 / CM-20）

`shared/services/portfolio/summary.js`：

- 按币种分桶市值（**币种内缺价 → 该桶为 `null`**）。
- `drift` 复用 `evaluateThresholds` 口径（**仅取绝对/相对偏离，不含时间间隔**）；无目标/无持仓/缺价时为 `null`。
- 聚合每组合未读 `AlertEvent` 计数 → `stats.unreadAlertCount`。
- 默认**排除归档**，`?includeArchived=true` 包含。

### 6.4 组合 API 与前端

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/portfolios` | 创建（含 `targets` 规范化校验） |
| GET | `/api/portfolios` | 分页列表（`createdAt` 倒序） |
| GET | `/api/portfolios/summary` | 汇总卡片（`includeArchived`） |
| GET / PUT / DELETE | `/api/portfolios/:id` | 详情 / 更新 / 级联删除 |
| GET | `/api/portfolios/:id/stats/actual-ratios` | 实时比例（`level`） |
| GET | `/api/portfolios/:id/stats` | 汇总统计 |
| GET / PUT | `/api/portfolios/:pid/rebalance-settings` | 阈值读写 |

**前端页面**

- `List`：卡片网格 + 「显示已归档」开关 + 归档数量提示。
- `PortfolioForm`：基本信息（名称/类型/账户类型/币种/描述/归档）+ 目标配置（资产级/大类级切换、合计实时提示、提交前校验）。
- `Detail`：`PortfolioHeader`（返回/编辑/添加交易 + 类型/币种/最近再平衡 Chip）+ 4 Tab。
- `PortfolioCard`：市值分桶行、类型/账户/币种、`DriftBadge`（「偏离阈值」琥珀 / 「配置正常」绿）、未读提醒数。

**数据模型**

| 模型 | 关键字段 | 唯一索引 / 主索引 |
|---|---|---|
| **Portfolio** | `name`、`description`、`type`(活钱/稳健/长期)、`currency`、`accountType`、`archived`、`targets[{symbol,targetRatio,level}]`、`rebalanceSettings{absoluteDeviation,relativeDeviation,timeInterval,rebalanceSchedule}` | — |

> **未接入页面（遗留）**：`pages/Portfolio/Basic.jsx`（组合基本+删除）与 `pages/Portfolio/TargetAllocation.jsx`（目标回显）**未挂载任何路由或 Tab**，属历史实现；已核实为**零外部引用**。目标配置的真实落地是 `PortfolioForm.jsx` 内联实现。`KpiCards.jsx` 已被 `PositionOverview` 引用（有效）。

---

## 7. 边界与已知缺口

- **组合记账币种缺 HKD**（CM-04）：与 `ASSET_CURRENCIES` 不一致，含港股的组合无合适记账币种。
- **未接入遗留**：`pages/Portfolio/Basic.jsx`、`pages/Portfolio/TargetAllocation.jsx` 零引用（删除前需再核实，见 [PL-0](./PL-0-platform-foundation.md) §文档一致性）。
- **大类目标依赖补分类工具**：AS-03 / AS-09 未补齐前，CM-08 / RB-11 难以真正好用。

---

## 8. 相关文档

- [PRODUCT_LINES.md](../PRODUCT_LINES.md) — 产品线总览与 INDEX（本文件的上级）
- [PL-1 投资账本线](./PL-1-ledger.md) — 本线上游：持仓与成本
- [PL-4 再平衡决策线](./PL-4-rebalancing.md) — 本线下游：目标基准 → 建议生成
- [PL-6 家庭总览线](./PL-6-household.md) — 组合是家庭汇总的聚合单元
- [PRD.md](../specs/PRD.md) — 需求基线（功能编码来源）
- [functions.md（已归档）](../../archive/functions.md) — 本文 §6 的原始来源
