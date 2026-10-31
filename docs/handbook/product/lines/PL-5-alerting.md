# PL-5 提醒与通知线（Alerting）

> 版本：v1.1 · 日期：2026-10-26
> 归属：[PRODUCT_LINES.md](../PRODUCT_LINES.md)「产品线 INDEX」中 **PL-5** 的明细子文件
> v1.1 修订：§1 开头补一句指向 [PRODUCT_LINES.md §1](../PRODUCT_LINES.md) 的链接（产品级定义唯一归属，路线 B）；本线内容未动。
> 内容范围：① 成熟度快评（总表 §2.4） ② 产品线 → 产品模块归属（总表 §3） ③ 全量功能评估 ④ 已实现功能点清单 ⑤ 架构实现明细（合并自原 `os/architecture/functions.md` §4.7，原文件已归档）
> 功能编码：`AL-01~10`，沿用 [PRD](../../../development/requirements/PRD.md)

---

## 1. 定位与价值主张

> 产品是什么、三条硬边界、价值主线：见 [PRODUCT_LINES.md §1](../PRODUCT_LINES.md)（唯一权威定义）。本节只写本线专属的定位与价值。

**价值主张：把「该看 / 该买 / 该卖」变成可行动的站内信号。**

本线把用户的投资纪律固化成规则，并每天自动判定。它是产品「主动监控」属性的兑现方式，也是跟随外部建议（如 E大 / 有知有行）的载体——`signal` 类型允许用户把外部的买卖方向 + 理由 + 有效期登记为常显信号。

- **上游依赖**：PL-2 价格与估值分位、PL-3 漂移、PL-1 盈亏。
- **下游影响**：通知中心是「待办」的统一入口；家庭总览（PL-6）的提醒入口即本线落地形态。
- **边界约定**：**恰好等于阈值不触发**，严格大于 / 小于才触发。
- **角色边界：本线是「通道」，不是「全部事件的作者」**。`AlertEvent` 有两个写入方：① 本线的规则引擎（`AL-05`，事件带 `ruleId`，受 `cooldownDays`/静默/`active` 管控）；② **PL-4 再平衡通知（`RB-12`，`ruleId = null`）**，AUTO 巡检命中后直接投递。后者**不属本线产品能力**：没有规则可配、没有 `active`、没有冷却与静默。本线只负责事件表、去重机制、通知中心渲染与未读数——把 `RB-12` 纳入 `AlertRule` 是明确的 Non-goal（2026-10-26 裁决，见 [FS-portfolio-ia-cleanup](../../../development/requirements/specs/FS-portfolio-ia-cleanup.md) OQ-3）。

---

## 2. 成熟度快评

| 维度 | 评价 | 说明 |
|---|---|---|
| 功能覆盖 | 高 | 8 类规则 + 评估引擎 + 事件中心齐全 |
| 用户体验 | 中高 | 通知中心与铃铛成熟；但规则表单偏重、缺模板 |
| 数据可信 | 中 | 评估引擎稳；静默策略偏粗、无数据时易「静默不触发」 |

**主要短板**：① 规则表单重（8 种类型）；② 估值规则易「静默不触发」（依赖 AS-11 手动数据）。

---

## 3. 产品线 → 产品模块归属

| 模块 | 包含功能 | 用户价值 | 现状 |
|---|---|---|---|
| **M5.1 规则体系** | AL-01 规则 CRUD、AL-02 规则类型 MVP、AL-03 signal 信号、AL-08 规则管理、AL-09 52周高低、AL-10 估值分位 | 把投资纪律固化为可执行规则 | 完整；表单重、缺模板 |
| **M5.2 评估引擎** | AL-05 评估引擎、AL-06 去重静默 | 每日自动判定并产出事件 | 完整；静默策略偏粗 |
| **M5.3 通知中心** | AL-04 事件模型、AL-07 通知中心 UI | 集中处理「待办级」信息 | 完整；缺筛选持久化 / 批量操作 |

---

## 4. 全量功能评估

> 判定标准见 [PRODUCT_LINES.md](../PRODUCT_LINES.md) §评估框架。判定不改变任何代码。

| 编号 | 功能 | 判定 | 理由（产品视角） | 建议动作 | 优先级 |
|---|---|---|---|---|---|
| AL-01 | 规则 CRUD | 保留 | 作用域 / 参数 / 启停完整 | — | — |
| AL-02 | 规则类型 MVP | **合并** | `price_above/below` 与 `high_52w/low_52w` 同属「价格类」，规则面板应按语义分组呈现 | 交互层面归组（不改数据模型），降低表单认知负担 | P2 |
| AL-03 | signal 信号 | 保留 | 「方向 + 理由 + 有效期 + 过期归档」是跟随外部建议（E大 / 有知有行）的核心差异化 | 后续可加「一键从原文登记」的半自动录入 | — |
| AL-04 | AlertEvent | 保留 | 不可删 + 快照，审计友好 | — | — |
| AL-05 | 评估引擎 | 保留 | 逐规则故障隔离 + 同日幂等 | — | — |
| AL-06 | 去重静默 | **强化** | `cooldownDays` 仅规则级抑制，冷却期内「条件恢复又触发」会被压掉，可能漏报 | 增加「条件恢复后可重触发」策略或按值分档静默 | P2 |
| AL-07 | 通知中心 | **强化** | 缺筛选条件持久化、事件搜索、批量已读；且与家庭视图信息存在重叠。另：事件流里混着**不可配、不可静音**的再平衡通知（`ruleId=null`），用户会误以为「这么多提醒应该能关掉一个」 | 增加筛选记忆 / 搜索 / 批量操作；明确本页为唯一事件入口；对 `ruleId=null` 的事件在 UI 上标注来源（「再平衡」），不做静默入口 | P2 |
| AL-08 | 规则管理 | **强化** | 8 种类型表单偏重，新用户门槛高 | 提供「规则模板」（到价 / 浮亏 / 漂移 / 跟随信号）与一键克隆 | **P1** |
| AL-09 | 52周高低 | 保留 | 严格突破、恰等不触发，口径清晰 | — | — |
| AL-10 | 估值分位规则 | **强化** | 依赖 AS-11 手动数据，**无数据时静默不触发**，用户易误判为「功能坏了」 | 规则面板展示「数据状态：缺失 / 最新日期」，缺失时给出录入引导 | P1 |

---

## 5. 已实现功能点清单

### M5.1 规则体系

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| AL-01 | 规则 CRUD | `AlertRule`：`scope(asset/portfolio)` / `portfolioId` / `symbol` / `name` / `ruleType` / `params` / `direction` / `reason` / `validUntil` / `cooldownDays`（默认 7，0–365）/ `active` | `/alerts/rules` |
| AL-02 | 规则类型（MVP 集） | `price_above`（价格高于，info）、`price_below`（价格低于，info）、`gain_loss_pct`（盈亏比例：`pct≥0` 浮盈 info / `pct<0` 浮亏 warning）、`drift_exceed`（组合偏离，warning）、`signal`（人工信号，**action**） | 规则表单 |
| AL-03 | signal 人工信号 | 绑定方向（buy/sell/hold）+ 理由 + 有效期 `validUntil`；有效期内**常显**于通知中心，过期自动 `active=false` 归档，事件保留历史 | 规则表单 |
| AL-09 | 52 周新高 / 新低 | `high_52w` / `low_52w`，`lookbackDays` 默认 365（1–3650）；窗口取历史**不含今日**最高 / 最低，最新价**严格突破**才触发 | 规则表单 |
| AL-10 | 估值分位规则 | `valuation_percentile`：`indexCode` + `metric(pe\|pb)` + `threshold(0–100)` + `direction(above\|below)`；严格比较；above → warning、below → info；输入来自 AS-11 | 规则表单 |
| AL-08 | 规则管理页 | 规则表（名称 / 类型 / 参数 / 作用域 / 状态）；参数随类型动态渲染的表单；表单校验（资产级需 symbol、组合级需 portfolioId、signal 需 direction、估值分位需 indexCode 且阈值 0–100）；触发历史展开、编辑、删除（**事件保留**）、状态列点击切换 `active` | `/alerts/rules` |

> **边界约定**：恰好等于阈值**不触发**，严格大于 / 小于才触发。

### M5.2 评估引擎

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| AL-05 | 评估引擎 | 每日跑批（默认 **04:00**，`ALERT_EVAL_CRON`）：取全部 `active` 规则 → `signal` 单独处理（过期归档 / 有效期内常显）→ 批量聚合最新价 / 持仓 / 漂移 / 52 周区间 / 估值分位 → **逐规则故障隔离**评估 → 去重 → 创建 `AlertEvent`；返回 `{evaluated, created, archived, failed}` | 定时 + `POST /api/alerts/evaluate` |
| AL-06 | 去重静默 | 同规则 `cooldownDays` 内不重复（`0` = 仅同日幂等）；**同日市场日相同也抑制** | `alertEngine` |

### M5.3 通知中心

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| AL-04 | 事件模型 | `AlertEvent`（**不可删除**，审计留存）：`ruleId` / `portfolioId` / `symbol` / `level(info/warning/action)` / `title` / `content` / `snapshot`（触发时条件快照）/ `triggeredAt` / `status(unread/read/dismissed)`。**`ruleId` 为 `null` 表示该事件来自外部写入方（当前唯一：PL-4 `RB-12` 再平衡通知），不受规则体系管控** | 引擎写入 / PL-4 投递 |
| AL-07 | 通知中心 | `Dashboard`（`/`）：状态筛选（未读 / 全部）+ 组合筛选；事件卡（level 色条、未读点、级别标签）；点击跳转（有 symbol → 价格历史；否则有 portfolioId → 再平衡 Tab）；标记已读 / 忽略；「立即评估」+「规则管理」入口 | `/` |
| — | 顶栏未读铃铛 | 未读数（`useUnreadAlertCount` **5 秒轮询**），`>0` 显红点，`>99` 显「99+」 | `AppLayout` 顶栏 |
| — | 提醒 API | `GET /alerts/events/unread-count`、`GET /alerts/events`（按 status/level/portfolioId/ruleId 筛选）、`PATCH /alerts/events/:id/read`、`POST /alerts/evaluate`、`GET/POST /alerts/rules`、`GET/PUT/DELETE /alerts/rules/:id` | API |

---

## 6. 架构实现明细（合并自原 functions.md §4.7）

**承载**：`shared/services/alertEngine.service.js`、`shared/services/alertCenter.service.js`、`cron-worker/src/schedulers/alertScheduler.js`、`client/src/pages/Alerts/AlertRules.jsx`、`client/src/pages/Dashboard.jsx`

### 6.1 规则体系（AL-01 ~ AL-03, AL-09, AL-10）

**AlertRule** 字段：`scope`（`asset`/`portfolio`）、`portfolioId`、`symbol`、`name`、`ruleType`、`params`、`direction`（仅 signal：`buy/sell/hold`）、`reason`、`validUntil`、`cooldownDays`（默认 7，0–365）、`active`。

| ruleType | 中文 | 参数 | 触发条件 | 级别 |
|---|---|---|---|---|
| `price_above` | 价格高于 | `threshold` | 最新价 > 阈值 | info |
| `price_below` | 价格低于 | `threshold` | 最新价 < 阈值 | info |
| `gain_loss_pct` | 盈亏比例 | `pct` | `pct≥0` 浮盈 > pct（info）；`pct<0` 浮亏 < pct（warning） | info/warning |
| `drift_exceed` | 组合偏离 | `drift` | 组合触发阈值 | warning |
| `signal` | 人工信号 | `direction` + `validUntil` + `reason` | 有效期内常显，过期自动归档 | **action** |
| `high_52w` | 52 周新高 | `lookbackDays`（默认 365，1–3650） | 最新价 > 历史窗口（不含今日）最高（严格突破） | info |
| `low_52w` | 52 周新低 | `lookbackDays` | 最新价 < 历史窗口最低（严格突破） | info |
| `valuation_percentile` | 估值分位 | `indexCode` + `metric(pe\|pb)` + `threshold(0–100)` + `direction(above\|below)` | 分位 >/< 阈值（严格） | above=warning / below=info |

> **边界约定**：**恰好等于阈值不触发**，严格大于/小于才触发。

### 6.2 评估引擎（AL-05）

`alertEngine.evaluateAll()`：每日跑批（默认 **04:00**，`ALERT_EVAL_CRON`）：

1. 取全部 `active` 规则；`signal` **单独处理**（过期置 `active=false` 归档；有效期内未 dismissed 则常显）。
2. 资产规则批量聚合最新价 / 持仓 / 漂移 / 52 周区间 / 估值分位。
3. **逐规则评估（故障隔离，单规则异常不中断批次）** → 去重 → 创建 `AlertEvent`。
4. 返回 `{evaluated, created, archived, failed}`。

### 6.3 去重静默（AL-06）

`shouldSuppress`：同规则 `cooldownDays` 内不重复（`0` = 仅同日幂等）；**同日市场日相同也抑制**。

### 6.4 事件与通知中心（AL-04, AL-07）

**AlertEvent**（**不可删除**，审计留存）：`ruleId`（再平衡通知为 null）、`portfolioId`、`symbol`、`level`（`info/warning/action`）、`title`、`content`、`snapshot`（触发时条件快照）、`triggeredAt`、`status`（`unread/read/dismissed`）。

**前端**：

- `Dashboard`（`/`，即通知中心）：状态筛选（未读/全部）+ 组合筛选；事件卡（`level` 色条、未读点、级别标签）；点击跳转（有 symbol → 价格历史；否则有 portfolioId → 再平衡 Tab）；**标记已读 / 忽略**；「立即评估」+「规则管理」入口。
- 顶栏**铃铛**：未读数（`useUnreadAlertCount` **5 秒轮询**），`>0` 显红点，`>99` 显「99+」。

### 6.5 规则管理（AL-08）

`AlertRules`（`/alerts/rules`）：规则表（名称/类型/参数/作用域/状态）；新建/编辑表单（参数随类型动态渲染）；表单校验（资产级需 symbol、组合级需 portfolioId、signal 需 direction、估值分位需 indexCode 且阈值 0–100）；行操作：触发历史展开、编辑、删除（事件保留）；状态列点击切换 `active`。

### 6.6 提醒 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/alerts/events/unread-count` | 未读数 `{count}` |
| GET | `/api/alerts/events` | 事件列表：`status,level,portfolioId,ruleId` |
| PATCH | `/api/alerts/events/:id/read` | 标记 `read`/`dismissed` |
| POST | `/api/alerts/evaluate` | 手动触发全量评估 |
| GET / POST | `/api/alerts/rules` | 规则列表 / 创建 |
| GET / PUT / DELETE | `/api/alerts/rules/:id` | 详情 / 更新 / 删除（**不级联删事件**） |

**数据模型**

| 模型 | 关键字段 | 唯一索引 / 主索引 |
|---|---|---|
| **AlertRule** | `scope`、`portfolioId`、`symbol`、`name`、`ruleType`、`params`、`direction`、`reason`、`validUntil`、`cooldownDays`、`active` | `{active,ruleType}`、`{portfolioId,active}`、`{symbol,active}` |
| **AlertEvent** | `ruleId`、`portfolioId`、`symbol`、`level`、`title`、`content`、`snapshot`、`triggeredAt`、`status` | `{status,triggeredAt:-1}`、`{ruleId,triggeredAt:-1}`、`{portfolioId,status}` |

---

## 7. 边界与已知缺口

- **静默失败风险**（AL-10 / AS-11）：估值分位无数据时规则不触发，且**不告知用户**——最易被误判为「功能坏了」。
- **静默策略偏粗**（AL-06）：冷却期内条件恢复再触发会被压掉，可能漏报。
- **表单门槛**（AL-08）：8 种类型 + 动态参数，新用户上手成本高。
- **再平衡通知不可配**（`RB-12`，属 PL-4 出口）：`ruleId=null` 的事件没有 `active` / `cooldownDays` / 静默能力。**Non-goal**：不通过给 `AlertRule` 增加 `ruleType: rebalance_due` 来解决——那会引入第二套触发源（AUTO 巡检 + 规则引擎）并需要对同一组合的事件去重。若未来要支持静音，须在 PL-4 侧重新设计触发源。

---

## 8. 相关文档

- [PRODUCT_LINES.md](../PRODUCT_LINES.md) — 产品线总览与 INDEX（本文件的上级）
- [PL-2 行情数据线](./PL-2-market-data.md) — 价格与估值分位输入（AS-11）
- [PL-4 再平衡决策线](./PL-4-rebalancing.md) — `RB-12` 再平衡通知：本线的**外部写入方**（`ruleId=null`）
- [PL-6 家庭总览线](./PL-6-household.md) — FAM-03 即本线通知中心的落地形态
- [FS-portfolio-ia-cleanup](../../../development/requirements/specs/FS-portfolio-ia-cleanup.md) — 明确「再平衡通知不纳入 `AlertRule`」的裁决与 Dashboard 组合健康表
- [PRD.md](../../../development/requirements/PRD.md) — 需求基线（功能编码来源）
- functions.md（已归档） — 本文 §6 的原始来源
