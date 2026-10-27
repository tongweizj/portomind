# Feature Spec 草稿 — cron-worker 运行看板（日志频道增强）

> 状态：**需求已锁定（OQ1–OQ8 已决），已拆分任务卡片，待排期/指派执行**（cron-worker 产品线首个需求草稿，负责人：产品通 / PM，owner：Max）
> 提出日期：2026-10-26
> 最近修订：2026-10-26（OQ6 只读硬约束 / OQ7 提醒详情不落本频道 / OQ8 详情页形态选**独立路由 B**；并按实码核查补 §7.2 数据契约缺口 6 条）
> 关联手册：[cron-worker 产品介绍](../../manual/CRON_WORKER_PRODUCT.md)、[cron-worker 开发文档](../../dev/CRON_WORKER_DEV.md)（TaskRun 契约见其 §5）
> 关联代码：`client/src/pages/LogViewer.jsx`（当前日志频道）、`server/routes/logs.routes.js`、`server/controllers/log.controller.js`
> 关联缺陷（已知，见 §7）：采集滞后一天无回补、完整性检查形同虚设、symbol 写法不一致致再平衡 FAILED、汇率方向反、taskrun.successCount 计数失真

---

## 0. TL;DR

把 client「日志」频道从"原始日志表格"升级为**带「任务运行看板」的监控视图**：在保留原有「服务器日志 / 任务日志」两个原始视图的同时，**新增一个置顶的「任务运行看板」标签页**，一眼呈现 cron-worker 5 大定时任务的健康度。

核心主张：**"任务跑绿了"不等于"数据到位了"**。看板必须同时呈现两层信号——

- **运行态**：任务是否按时跑了、是否报错（来自 `taskruns` 的 4 态）。
- **数据态**：该跑的数据到底采没采齐（派生指标，例如价格同步 = "应采资产数 vs 已采资产数"）。

只给"运行态绿灯"会掩盖已知的"全绿但缺数"陷阱（见 §7）。本草稿的看板以**数据态为完成度主信号**。

**频道定位（OQ6 已决，硬约束）**：`/logs` 是**只读排障频道**——只回答"系统有没有干活、干成了没有"，**永不放任何执行动作**（执行/撤销/重做/手动触发一律不进本频道）。原因是本频道与组合域的主语不同：这里的主语是 cron，组合域的主语是"我的钱"。

**详情页形态（OQ8 已决）**：再平衡采用**独立路由详情页 `/logs/rebalance`（形态 B）**，而非卡内行内展开。详见 §4.5。

**不做的事（OQ7 已决）**：**「再平衡提醒详情」（建议明细 + 执行/撤销）不落本频道**，它归组合域（`/portfolios/view/:id/rebalance`）。两个"再平衡详情"同名不同义，见 §4.5.2。

---

## 1. 背景与问题陈述

**用户痛点**：Max 每天打开 PortoMind，想知道"今天价格抓全了没有、汇率更新了没有、有没有组合该再平衡了"。但当前 `/logs` 只有按行翻的原始日志（Server Log / Task Log），需要人肉在几百行 JSON 里找线索，且日志文件的 `task-{date}.log` 与真实的 `taskruns` 集合并不一致。

**为什么现在做**：cron-worker 是 PortoMind 的"数据更新引擎"（手册 §1），但它**没有面向使用者的运行可视化**。已知多个生产问题（§7）都表现为"任务报告显示正常，但数据其实没到位"——这恰好说明：缺少一个"一眼看完成度"的视图，是使用者和 PM 都无法及时发现数据异常的根因。

**证据（来自代码与手册）**：
- `LogViewer.jsx`：仅 `getLogs` / `getTaskLogs` 两个原始日志分页视图，无任务聚合、无状态徽章、无完成度。
- `server/routes/logs.routes.js` + `log.controller.js`：`/api/logs`、`/api/logs/tasks` 都是**按日期读日志文件**（`app-{date}.log` / `task-{date}.log`），**完全不读 `taskruns` 集合**。
- `taskruns` 集合（开发文档 §5）实际字段为 `taskName / runKey / trigger / status(RUNNING|SUCCEEDED|PARTIAL|FAILED) / startedAt / endedAt / durationMs / totalCount / successCount / failureCount / failures[]`；**没有 `result` 字段**，`SKIPPED` 只作返回值不落库（详见 §7.2）。且**当前没有任何 REST 接口把它暴露给前端**。
- 5 大任务的稳定 `taskName`：`daily-price-sync`、`price-integrity-check`、`alert-evaluate`、`fx-rate-sync`、`rebalance-suggestions:<portfolioId>`（§5.1）。

**不解决的代价**：数据异常（缺价、缺口、再平衡失败、汇率方向错）长期潜伏，使用者凭肉眼翻日志才能发现，信任度持续受损。

---

## 2. 目标 / 非目标

### Goals
- **G1（一眼总览）**：打开看板，0 次点击即可看到 5 大任务的"健康灯"与本周期总览（整体绿/黄/红/灰）。
- **G2（价格完成度可证）**：对价格同步，能明确看到"目标市场日 X：应采 N / 已采 M（完成度 M/N）"，以及未采到的标的清单。
- **G3（运行态 + 数据态分离）**：每个任务同时展示"是否跑了/报错"与"数据是否到位"，杜绝"绿灯即安心"。
- **G4（下钻不丢原始视图）**：保留现有原始日志（服务器日志 / 任务日志）作为排障深水区，看板是入口而非替代。
- **G5（追责到组合）**：再平衡能下钻到「逐组合 × 到期与否 × 跑成没有 × 失败原因」，并一键跳到该组合的业务记录；同时**不放任何执行动作**（与 NG6 一致——看得到、动不了，动手去组合域）。

### Non-Goals
- **NG1 不做调度控制**：看板只读展示，不提供"在前端手动触发任务"（手动入口走 CLI / API，见运维手册 §6）。
- **NG2 不改 cron 调度本身**：不改触发时间、周期、防重逻辑。
- **NG3 不重算价格 / 汇率 / 再平衡**：只读取既有 `taskruns` 与 `assets`/`prices` 的聚合结果，不引入新计算逻辑。
- **NG4 不做历史趋势图（v1）**：本期只展示"最近一次运行"的快照；历史趋势（多日成功率）留 P2。
- **NG5 不做告警推送**：看板是"被动查看"，主动通知（邮件/站内）不在范围。
- **NG6（硬约束）本频道只读排障、永不放执行动作**：`/logs` 下任何页面**不得**出现「执行再平衡」「撤销」「重做」「手动触发任务」「编辑阈值」等写操作入口。本频道的失败态只提供两条出口——「查看原始日志」与「去组合域处理」。「让系统重跑一次」属运维语义，走 CLI/API（运维手册 §6），不进前端。
- **NG7 不做「再平衡提醒详情」**：再平衡建议的明细、执行、撤销、重做属于**组合域**（`/portfolios/view/:id/rebalance`）。本频道只呈现"这次分发跑成没跑成、哪些组合没生成"，不呈现"该买卖什么"。
- **NG8 不做提醒的设置能力**：本频道不提供"再平衡通知的开关/静音/冷却"（`rb-12` 当前不可配的现状见 [PL-4](../lines/PL-4-rebalancing.md) §5，属另一议题）。

---

## 3. 核心设计决策：运行态 vs 数据态（本草稿最关键的一条）

历史上 `taskruns` 的 `status=SUCCEEDED` 被当作"任务健康"的代名词，但已知缺陷表明它**不足以证明数据到位**：

- `successCount` 在 `persistPrice()` 之后计数 → "任务全绿"可能只是"没有抛异常"，不代表"有新价格写入"（§7-D）。
- 价格同步 03:00 实际写入的是**前一交易日**的价，且单日失败即永久丢失（§7-A）。
- 完整性检查每天 `SUCCEEDED` 但 ok=0/44（§7-B），`status` 完全无法反映缺口。

**因此看板完成度的主信号必须是"数据态"派生指标，而非 `status` 单字段。** `status` 仅作为"运行态"辅助信号，用于解释"为什么数据态没达标"（如 `FAILED` / `SKIPPED`）。

### 颜色语义（系统状态色，与价格红涨绿跌无关）
| 色 | 含义 | 用法 |
|---|---|---|
| 绿 | 成功 / 完成 / 数据齐 | 数据态达标 |
| 黄 | 部分 / 需关注 | 数据态部分达标，或运行态 PARTIAL |
| 红 | 失败 / 缺数据 | 数据态严重缺失，或运行态 FAILED |
| 灰 | 跳过 / 未跑 / 无数据 | SKIPPED、预期为 0、或超期未运行 |

> ⚠️ 与本项目价格"红涨绿跌"惯例**严格区分**：此处红=坏、绿=好，是系统状态通用语义。

---

## 4. 看板设计

### 4.1 入口与信息架构
- 频道：`/logs`（日志）保持现有导航项不变（延续"不向导航加低频项"的既有原则）。
- 在 `LogViewer` 内**新增置顶标签页「任务运行看板」**，原「服务器日志」「任务日志」作为第二、第三个 tab 保留。
- 看板页内结构：**顶部总览条 → 5 任务卡片网格 →（再平衡卡）详情入口**。
- **新增子路由 `/logs/rebalance`（再平衡分发详情页，OQ8 形态 B）**：不在导航栏出现，只能从再平衡卡进入；面包屑「日志 / 任务运行看板 / 再平衡分发」；返回落看板 tab 不丢状态。
  - 选独立路由而非行内展开的理由：详情要多维筛选（组合 / 状态 / 日期）、要能带参深链（从组合域反向跳入）、还要承载"逐组合 × 逐日期"的历史矩阵。行内展开装不下这三件事，且会把 5 卡网格撑成一张可变高度的长表。
  - 代价（已知并接受）：多一条路由要维护，`/logs` 从"单页"变成"轻量子应用"。**约束**：本频道最多只允许这一条子路由；新增第二个详情页前必须重新评估是否该独立成"系统健康"导航项。

### 4.2 顶部总览条（一眼看）
- 一行 5 个"健康灯"（每个任务一个圆点 + 任务短名），颜色取该任务"数据态"色。
- 右侧一个**整体健康徽章**：5 灯全绿=「全部正常」；任一红=「存在失败」；任一黄=「需关注」；灰灯超过预期=「可能停滞」。
- 顶部一行小字：数据快照时间（"基于 taskruns 最近一次运行 + 价格库当前态，更新于 HH:MM"）。

### 4.3 5 大任务卡片（每张同构）
每张卡统一字段：`任务名 / 上次运行时间 / 运行态徽章（RUNNING / SUCCEEDED / PARTIAL / FAILED / SKIPPED / STALE 僵尸，后两者需 C-05c 落地才有数据载体）/ 数据态进度条+百分比 / 关键数字 / 异常入口`。

各任务"数据态"定义（**完成度算法**）：

| 任务 | 数据态完成度算法 | 关键数字展示 | 未达到的判定 |
|---|---|---|---|
| **① 价格同步** | 目标市场日 = 上一开市日（注意滞后，非"今天"）。expected = 该日应开市且 `active` 的资产数；fetched = 其中已有 `Price(date=目标日)` 的数量。完成度 = fetched/expected。 | "目标 2026-10-17：38/40" + 进度条 | fetched<expected → 黄，可展开 missing[] 清单；fetched=0 → 红；expected=0（节假日）→ 灰 |
| **② 完整性检查** | 来自其运行输出 `{ok, gap, skippedNoLaunchDate}`。完成度 = ok / (ok+gap)。 | "完整 40 / 缺口 2 / 跳过 1" | gap>0 → 黄（列缺口区间）；skippedNoLaunchDate>0 → 灰提示"未填成立日" |
| **③ 提醒评估** | status + `alertsFired`（命中规则产生的提醒数）。完成度 = 1 当 SUCCEEDED 且无异常。 | "命中 3 条提醒" | PARTIAL/FAILED → 红/黄；静默（0 命中）属正常，不报警 |
| **④ 汇率同步** | status + 各币种成功情况（USD/CAD/HKD）。完成度 = 成功币种 / 3。 | "USD✓ CAD✓ HKD✗" | 任一缺失 → 黄；全缺 → 红（影响跨币折算） |
| **⑤ 再平衡分发** | **依赖 C-05 的父任务 `rebalance-check`**：`result.perPortfolio[]` 提供 `due / needsRebalance / suggestionsCount`。完成度 = 已生成建议的组合数 / 到期组合数。逐组合列出 FAILED（已知多因 symbol 写法不一致）。 | "到期 2 / 已生成 2" + 失败组合名 | 到期未生成 → 红，列失败组合；**父任务 `result` 缺失 → 灰「数据契约未就绪」，不得按"未到期"渲染** |

> 注：⑤ 的 `taskName` 形如 `rebalance-suggestions:<portfolioId>`，看板按 portfolioId 聚合为 1 张卡；卡上「查看详情」进入**独立子路由 `/logs/rebalance`「再平衡分发记录」**（OQ4 + OQ8 已决，见 §4.5 与卡片 C-07）。**该页只呈现运行结果（到期/跑成/失败原因），不呈现建议明细、不含任何执行动作**（NG6 / NG7）。

### 4.4 滞后 / 停滞判定（通用）
对任意任务：若 `now - 上次成功运行时间 > 该任务周期 + 缓冲（建议 26h）`，即使状态非 FAILED，也标"⚠ 可能停滞"灰黄提示。这能兜住"进程挂了但不报错"的场景。

### 4.5 再平衡分发详情页（`/logs/rebalance`，OQ8 形态 B）

#### 4.5.1 页面结构

```
/logs/rebalance                          ← 只读，子路由，不进导航
┌───────────────────────────────────────────────────────────────────────┐
│ ‹ 返回看板      再平衡分发记录                    [刷新]  快照 10-26 03:00│
├───────────────────────────────────────────────────────────────────────┤
│ 应检 3 · 到期 2 · 生成成功 1 · 失败 1        （数据契约未就绪时此处降级）│
├───────────────────────────────────────────────────────────────────────┤
│ 日期 [10-26 ▾]  组合 [全部 ▾]  状态 [全部 ▾]  频率 [全部 ▾]            │
├───────────────────────────────────────────────────────────────────────┤
│ 组合        计划   到期  运行态     生成结果    建议数  失败原因   操作  │
│ CN-长钱     daily  是    已运行     ✅ 已生成    4      —         [日志][去组合]│
│ CA-长钱     weekly 否    —          —           —      —         [日志]  │
│ CN-稳钱     daily  是    已运行     ❌ 失败      —      SYMBOL_NOT_FOUND [日志]│
├───────────────────────────────────────────────────────────────────────┤
│ ⓘ 本页只读。「执行 / 撤销 / 重做」在组合域完成 —— 点「去组合」跳转。      │
└───────────────────────────────────────────────────────────────────────┘
```

#### 4.5.2 列定义与数据来源

| 列 | 值 | 来源 | C-05 落地前 |
|---|---|---|---|
| 组合 | 组合名 + `accountType` | `Portfolio`（按 `archived != true`） | 可显示 |
| 计划 | `daily / weekly / monthly` | `portfolio.rebalanceSettings.rebalanceSchedule` | 可显示 |
| 到期 | 是 / 否 | **父任务 `result.perPortfolio[].due`** | **不可得 → 「—」** |
| 运行态 | 已运行 / 失败 / 跳过 / 无记录 | 逐组合 taskrun `status` | 部分可得（无 SKIPPED 载体） |
| 生成结果 | 已生成 / 未触发（未超阈）/ 失败 | **父任务 `result.perPortfolio[].needsRebalance`** | 不可得（真/假无法区分） |
| 建议数 | 整数 | **父任务 `result.perPortfolio[].suggestionsCount`** | 不可得 |
| 失败原因 | `failures[].category` + `message` | 逐组合 taskrun `failures[]` | **可得（唯一无阻塞项）** |
| 操作 | 「查看原始日志」「去组合」 | 链接 | 可显示 |

**降级规则**：父任务 `result` 缺失（即 C-05 未落地）时，页面顶部显示黄条「数据契约未就绪：无法区分『到期未生成』与『未到期』，本页仅展示运行态」，且隐藏「到期 / 生成结果 / 建议数」三列——**不得**用「无记录」冒充「未到期」。

#### 4.5.3 与组合域「再平衡」的边界（同名不同义，勿合）

| 维度 | 本页（`/logs/rebalance`） | 组合域「再平衡」Tab |
|---|---|---|
| 主语 | cron-worker 有没有把事干成 | 这个组合要不要动、动什么 |
| 数据源 | `taskruns`（父 + 逐组合） | `RebalanceRecord`（suggestions / triggeredThresholds / 状态机） |
| 动作 | **无（只读）** | 执行 / 撤销 / 重做（写 `Transaction`） |
| 失败处置 | 「查看原始日志」定位技术原因 | 「重新生成待确认」重试业务动作 |
| 命名约束 | **必须叫「再平衡分发记录」**，禁止叫「再平衡详情」 | 保持「再平衡」 |

#### 4.5.4 互链（本频道的唯一对外写行为：导航）

- 本页 → 原始日志：`/logs?tab=task&task=rebalance-suggestions:<pid>&date=<YYYY-MM-DD>`（R7）。
- 本页 → 组合域：`/portfolios/view/<pid>/rebalance?sub=history&record=<recordId>`；`recordId` 不可得时退 `?sub=suggestions`。
- 反向（组合域 → 本页）：**本期只有一条** —— 提醒事件点击由 [FS-portfolio-ia-cleanup](./FS-portfolio-ia-cleanup.md) 的 `A16` 带 `?record=` 落到组合域记录，再由该记录的「查看运行记录」进入本页。**反向链接不在本期实现**（登记为 `FS-portfolio-ia-cleanup` 的 `P1-5`），本页只保证 `?portfolio=<pid>` 深链可用，供未来单向挂载。
- 本页支持 `?portfolio=<pid>` 与 `?date=` 深链，刷新保持。

#### 4.5.5 空态与失败态

| 情形 | 呈现 | 禁止 |
|---|---|---|
| 该日无任何分发记录 | 「该日无再平衡分发记录」+ 两种可能说明（未到期 / worker 未运行）+ 「查看任务日志」按钮 | **不得**渲染为「全部正常」绿色 |
| 有记录但全部失败 | 顶部汇总标红 + 逐行原因 | 不得只显示「已运行」 |
| 接口失败 | 局部错误态 + 重试按钮 | 不得整页白屏，不得影响看板其他卡 |

### 4.6 原型（线框）
见 §附录 线框图（由本草稿生成，套用项目 design token：主色 #635BFF / 浅紫 #EEEDFF / 边框 #E3E8EE；状态色独立定义如上）。

---

## 5. 用户故事

1. **US1（每日使用者）**：作为每天看盘的人，我希望打开日志频道即看到 5 大任务的健康灯，以便 0 点击判断"今天数据齐不齐"。
2. **US2（价格关注者）**：作为使用者，我希望在价格同步卡上看到"目标市场日 X：应采 N / 已采 M"，并能展开未采到的标的清单，以便确认是否全齐。
3. **US3（排障者）**：作为使用者，当某任务标黄/红时，我希望一键下钻到该任务的原始任务日志，以便定位原因。
4. **US4（再平衡关注者）**：作为使用者，我希望看到"今天哪些组合到期、是否都生成了建议、有没有失败的组合"，以便及时跟进。
5. **US5（防骗灯）**：作为 PM，我希望看板明确区分"任务跑了"和"数据齐了"，以免被"全绿"误导。
6. **US6（追责到组合）**：作为使用者，当再平衡卡显示"到期 2 / 生成 1"时，我希望进入详情页看到逐个组合「到期与否 / 跑成没有 / 为什么失败」，并能一键跳到那次的组合域记录，以便立刻处理真正有事的那一个。
7. **US7（边界感）**：作为使用者，我在日志频道里只做"看和判断系统"，不会误以为能在这里执行调仓——所有动手都发生在组合页。

---

## 6. 需求

### P0 — Must Have（不交付则方案不成立）
- **R1 新增「任务运行看板」标签页**：在 `/logs` 内置于「服务器日志」「任务日志」之前；含顶部总览条 + 5 任务卡片。
  - *验收*：打开 `/logs` 默认显示看板；5 灯 + 整体徽章可见；原两个原始日志 tab 仍可访问。
- **R2 新增后端聚合接口 `GET /api/cron/status`**（当前**不存在**，需新建）：返回每个任务的最近一次 `taskruns` 记录 + 派生数据态指标。
  - 对价格同步：服务端需联合 `assets`（active + 市场开市判定）+ `prices`（目标市场日）计算 expected/fetched/missing[]。**这正是 §7-D 缺陷所在——不能只返回 `taskruns.status`。**
  - 对完整性检查：返回 {ok, gap, skippedNoLaunchDate}（需确保任务把该结果写入 `taskruns`，见 R5）。
  - 对汇率：返回各币种成功标志。
  - 对再平衡：按 portfolioId 聚合。**「到期」这个分母当前不可从 `taskruns` 推出**（未到期组合不产生任何记录，整批崩溃同样零记录——两者不可区分，见 §7.2-D）。因此必须**补一条父任务 `rebalance-check` 的 taskrun**，其 `result` 携带 `{totalPortfolios, dueCount, skippedCount, failureCount, perPortfolio[{portfolioId, due, needsRebalance, suggestionsCount, recordId, status}]}`；看板与本页均以此为准，**不得**用「无记录」推断「未到期」。
  - 同一接口支持 `?detail=rebalance&date=&portfolioId=` 返回 §4.5 的逐组合明细（**不新增第二个端点**）。
  - *验收*：接口返回结构覆盖 5 任务的数据态；前端看板据此渲染，不依赖前端重算。
  - *验收*：某组合 `status=FAILED` 的记录在 `failures[]` 中带 `category/message`，前端可直接展示原因（此路径**无数据契约阻塞**）。
- **R3 价格同步"完成度"以数据态为主信号**：展示"目标市场日 + 应采/已采 + 进度条 + missing 清单"。
  - *验收*：当某 active 资产缺当日价时，卡片标黄且可展开 missing 列表；全部齐 → 绿。
- **R4 颜色语义遵循 §3 状态色**（绿/黄/红/灰），并与价格红涨绿跌明确区分（UI 文案或图例说明）。
  - *验收*：看板含状态色图例；无"红=涨"误用。
- **R5 数据契约增强（`taskruns` 可承载结果）** —— *原 P1，2026-10-26 升级为 P0（对应卡片 C-05）：它是 R2 / R10 能否成立的前提，未落地时后两者只能展示运行态*。当前 `taskruns` **根本没有 `result` 字段**（`shared/models/taskRun.js`），且 `taskRunner.normalizeCounts()` 是**白名单**只留四个计数（`shared/services/taskRunner.js:7-14`）——即使任务 `return {ok,gap,...}` 也会被丢弃。故拆三条前置：
  - **R5a** `TaskRun` schema 新增 `result: Mixed`；`runTrackedTask` 的 `updateOne` 写入 `result`。
  - **R5b** `normalizeCounts` 改为「保留 `totalCount/successCount/failureCount/failures` + 透传调用方显式声明的 `result`」。
  - **R5c** `status` 枚举补 `SKIPPED`（当前跳过只返回值 + 打日志、不落库），并对崩溃遗留的 `RUNNING` 定义判定阈值（如 `startedAt > 2×周期` 视为僵尸）。
  - *验收*：完整性检查运行后 `taskruns.result` 含 `{ok,gap,skippedNoLaunchDate}`（**查库可读到**，非仅返回值）；汇率含各币种标志；**再平衡父任务** `rebalance-check` 含 `perPortfolio[]`（见 R2）；跳过产生 `status=SKIPPED` 的持久化记录。
- **R12 只读硬约束的可验证化**（NG6 的执行手段）：`/logs` 路由子树**不得**引用任何 mutation hook（`useMutation` / 写服务方法）；以 `grep` 与代码审查双重把关，并在 ExecPlan 中列为检查项。

### P1 — Should Have
- **R6 滞后/停滞判定**：超过周期+缓冲未成功运行 → "⚠ 可能停滞"提示（§4.4）。**再平衡的判定锚点是父任务 `rebalance-check`**，逐组合记录不可作锚点（未到期组合本来就没有记录）。
- **R7 一键下钻**：卡片的"查看日志"跳转到对应任务的「任务日志」tab 并带日期/筛选。
- **R10 再平衡分发详情页（`/logs/rebalance`，形态 B）**：独立子路由，逐组合 × 状态 × 失败原因矩阵，支持 `?date= / ?portfolio= / ?status= / ?schedule=` 深链与筛选；只读（NG6）。
  - *验收*：从再平衡卡「查看详情」进入本页且面包屑正确；`?portfolio=<pid>` 深链刷新后筛选保持；页面**不存在**任何执行/撤销/重做控件（DOM 断言 + 代码审查）。
  - *验收*：C-05 未落地时显式降级（黄条 + 隐藏三列），**不得**把「无记录」渲染成「未到期」或「正常」。
- **R11 互链（本频道唯一的对外行为）**：本页「去组合」→ `/portfolios/view/<pid>/rebalance?sub=history&record=<recordId>`；「查看原始日志」→ 任务日志 tab 带 task/date。反向入口由 [FS-portfolio-ia-cleanup](./FS-portfolio-ia-cleanup.md) `A16` 提供（提醒点击带 `?record=`）。

### P2 — Future
- **R8 历史趋势**：多日成功率 / 完成度趋势小图（NG4 的延伸）。
- **R9 launchDate 缺位治理入口**：对 `skippedNoLaunchDate` 资产，提供"去补成立日"的引导链接（呼应手册 §3.4）。

---

## 7. 与已知缺陷的对账（必须避免重蹈覆辙）

### 7.1 已确认生产缺陷（A–E）

本草稿直接针对以下已确认生产缺陷设计，实现时不可绕开：

| 编号 | 已知缺陷 | 本草稿如何防住 |
|---|---|---|
| A | 采集滞后一天且无回补（03:00 写前一交易日；单日失败永久丢失） | R3 明确"目标市场日=上一开市日"而非"今天"；missing 清单暴露单日失败；R6 滞后判定兜底"进程挂了" |
| B | 完整性检查形同虚设（每天 SUCCEEDED 但 ok=0/44） | R5 要求把 `ok/gap/skipped` 写入 `taskruns.result`；R2 看板展示真实 ok/gap 数，不用 `status` 冒充完成度 |
| C | symbol 写法不一致致再平衡 FAILED（41 天） | R2 再平衡卡逐组合列 FAILED；让用户看到"哪个组合没生成建议"而非被淹没 |
| D | `taskruns.successCount` 在 persistPrice 后计数 → "全绿≠有新数据" | §3 明确"数据态为主信号"；R2/R3 用 assets×prices 派生完成度，不信任 `status`/`successCount` |
| E | 汇率方向反（USD/CAD 低估、HKD 高估） | R2 汇率卡展示各币种实际抓取值 + 成功标志，便于使用者肉眼复核方向是否异常 |

### 7.2 数据契约缺口（2026-10-26 实码核查，直接决定 R2 / R5 / R10 能不能落地）

> 这一节是本 FS 的**前提条件**。此前 R5 / OQ3 / C-05 都假设「把结果写进 `taskruns.result` 即可」，实码核查表明该假设不成立——三处硬缺口，不补齐则看板必然退化为运行态展示。

| 编号 | 缺口 | 证据 | 影响 | 对策 |
|---|---|---|---|---|
| **D1** | `TaskRun` schema **没有 `result` 字段**，mongoose strict 默认为真 → 写入被**静默丢弃**（不报错） | `shared/models/taskRun.js` | 任何"把派生指标写进 taskruns"的方案都无效，且失败无声 | R5a 加字段 |
| **D2** | `normalizeCounts()` 是**白名单**，只保留 `totalCount/successCount/failureCount/failures` | `shared/services/taskRunner.js:7-14` | 任务 `return {ok,gap,alertsFired}` 同样被吞 | R5b 放开显式 `result` 透传 |
| **D3** | `status` 枚举为 `RUNNING \| SUCCEEDED \| PARTIAL \| FAILED`，**无 `SKIPPED`**；跳过只作为返回值 + 日志，不落库；`RUNNING` 会因进程崩溃留下僵尸 | `shared/models/taskRun.js`、`taskRunner.js:17-23` | 看板"灰=跳过"无数据载体；僵尸 RUNNING 会被误读为"正在跑" | R5c 补枚举 + 僵尸判定 |
| **D4** | **再平衡没有父级 taskrun**：`createCronScheduler` 直接 `await execute()`，`runRebalanceCheck` 只逐组合写 `rebalance-suggestions:<pid>`；未到期 / 归档 / 整批崩溃一律**零记录** | `cron-worker/src/schedulers/cronScheduler.js:37-43`、`rebalanceScheduler.js:60-109` | **「到期 N」分母不可得**；空数据无法与"全健康"区分（§3 批判的"全绿误导"换位重演） | R2 补父任务 taskrun + `perPortfolio[]` |
| **D5** | 逐组合 taskrun 无论 `needsRebalance` 真假都 `return {totalCount:1, successCount:1, failureCount:0}` | `rebalanceScheduler.js:96-107` | 「生成了几条建议」不可区分；详情页「生成结果 / 建议数」两列为空 | R5 + R2 的 `perPortfolio[].needsRebalance / suggestionsCount` |
| **D6** | 组合失败原因**可显示**：`failures[]` 有 `item/category/message`，外层 `catch` 也写 `failures` | `rebalanceScheduler.js:110-116` | 无阻塞 | 直接展示 |

**结论**：C-07（详情页）的真实前置是 **C-05（数据契约）**，不是 C-02。C-05 未落地时详情页只能显示"有没有跑"这一半，且必须显式降级（§4.5.2）。

---

## 8. 成功指标

> 自托管、样本极小（n=2），以下为方向性参考。

- **领先**：使用者"判断今日数据是否齐"所需点击数从"翻多页日志"降为 0（看板首屏即得）；价格 missing 清单被查看并处理的次数。
- **滞后**：数据异常（缺价/缺口/再平衡失败/汇率异常）从"被发现于翻日志"提前到"看板首屏标色即见"的平均时延下降。
- **质量**：因"全绿误导"而误以为数据正常的情况归零（R3/R5 保证数据态真实）。

---

## 9. 开放问题（OQ1–OQ8 均已裁决）

| # | 问题 | 状态 |
|---|---|---|
| OQ1 | 看板是否作为 `/logs` 内的新 tab（推荐，不动导航），还是独立导航项？ | **已决：作为 `/logs` 内新 tab（置顶），不动导航栏** |
| OQ2 | 价格同步"目标市场日"的界定：用"上一开市日"还是"今天"？需与采集滞后事实对齐（推荐上一开市日）。 | **已决：上一开市日**（对齐采集滞后一天的事实；非"今天"） |
| OQ3 | R5 要求任务把结果写入 `taskruns.result`——是否需要同步改 cron-worker 代码（属 NG2 例外，因当前仅打日志）？ | **已决（PM 默认）：必须改**。这是看板"数据态为主信号"的数据契约前置；否则看板退化为运行态展示、重蹈 §7 缺陷。已拆为独立前置卡片 **C-05（数据契约）**。 |
| OQ4 | 再平衡分发在 5 卡中如何呈现：聚合为 1 张"再平衡分发"卡（内含逐组合），还是每个组合 1 张？是否提供下钻？ | **已决：聚合为 1 张卡（内含逐组合），并提供「再平衡详情」页查看全部 + 可按组合过滤**（卡片 C-07） |
| OQ5 | 看板数据刷新：手动刷新按钮 + 打开时拉取，还是需要自动轮询（如 60s）？ | **已决：手动刷新**（打开时拉取 + 刷新按钮；不做自动轮询） |
| OQ6 | 日志频道是否要明确"只读排障、永不放执行动作"的硬约束？ | **已决：写死为硬约束**，落在 §2 `NG6` + R12（可验证化），任何页面不得出现执行/撤销/重做/手动触发/编辑阈值入口。 |
| OQ7 | 「再平衡提醒详情」（建议明细 + 执行/撤销）能否落在日志频道？ | **已决：不能**。日志频道只承接"运行详情"（跑没跑成），"提醒详情"归组合域。判据：频道只读契约、接口契约污染（`/api/cron/status` 不读 `RebalanceRecord`）、与 Dashboard 待处理提醒语义重复、受众与未来权限不同。 |
| OQ8 | 再平衡分发详情：行内展开（形态 A）还是独立子路由 `/logs/rebalance`（形态 B）？ | **已决：形态 B（独立子路由）**。理由：需要多维筛选 + 深链 + 逐组合 × 逐日期矩阵，行内展开装不下；接受"多一条路由"的代价，并以"本频道最多一条子路由"设上限（§4.1）。 |

---

## 10. 后端 / 数据依赖

- **新增接口**：`GET /api/cron/status`（无则看板无从渲染）。需在 `server/routes/` 新增 `cronStatus.routes.js` + controller，读取 `taskruns` 集合并联合 `assets`/`prices` 派生指标。**详情页复用同一接口**（`?detail=rebalance&date=&portfolioId=`），不新增第二个端点。
- **数据契约增强（`shared` 层，影响 API 与 worker 两侧）**：`shared/models/taskRun.js` 加 `result` 字段 + `status` 枚举补 `SKIPPED`；`shared/services/taskRunner.js` 的 `normalizeCounts` 放开 `result` 透传（R5a/R5b/R5c）。**这是共享内核改动，必须回归全部 5 个任务**（它们都走 `runTrackedTask`）。
- **父级 taskrun**：`rebalance-check` 需自身 `runTrackedTask` 并写 `result.perPortfolio[]`（R2 / D4）。当前 `startRebalanceScheduler` 未包父任务，需在 `runRebalanceCheck` 外层补一层（不改 cron 表达式与逐组合防重键，符合 NG2 边界）。
- **复用**：`shared/services/taskRunner.js`（taskruns 读写）、`shared/services/asset.service.js`、`price.service.js`。
- **零破坏**：前端仅在 `LogViewer` 内加 tab + 一条子路由，不删除现有日志视图（G4）；不改 `/api/logs` 与 `/api/logs/tasks` 两个既有接口。

---

## Appendix A — 现状代码映射（供实现者）

| 关注点 | 文件 |
|---|---|
| 日志频道页面（改造对象） | `client/src/pages/LogViewer.jsx` |
| 前端日志服务 | `client/src/services/log.service.js` |
| 后端日志路由（仅读文件，不读 taskruns） | `server/routes/logs.routes.js`、`server/controllers/log.controller.js` |
| TaskRun 契约（稳定字段/状态） | `docs/dev/CRON_WORKER_DEV.md §5` |
| taskruns 读写 | `shared/services/taskRunner.js` |
| 五大任务实现 | `cron-worker/src/schedulers/*`、`cron-worker/src/tasks/*` |
| 设计 token | `client/src/constants/design-tokens.js`（主色 #635BFF、浅紫 #EEEDFF、边框 #E3E8EE） |
| ⚠ TaskRun schema **无 `result` 字段**、`status` 无 `SKIPPED` | `shared/models/taskRun.js` |
| ⚠ `normalizeCounts` 白名单（吞掉非计数结果） | `shared/services/taskRunner.js:7-14` |
| ⚠ 再平衡**无父级 taskrun**，逐组合记录不区分 `needsRebalance` 真假 | `cron-worker/src/schedulers/rebalanceScheduler.js`、`cronScheduler.js:37-43` |
| 再平衡提醒事件（`snapshot.recordId` 已写入但前端零引用；属组合域，非本频道） | `shared/services/alertCenter.service.js`、`client/src/pages/Dashboard.jsx` |
