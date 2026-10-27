# Feature Spec — 组合详情 IA 收尾与 Dashboard 组合健康表

| 项 | 内容 |
|---|---|
| 状态 | **`Approved`**（2026-10-26 Human 批准；§8 六项 OQ 全部采纳推荐）。**同日 22:40 追加 5 项原型期裁决**（`HD-10`~`HD-14`，见 §11）：`B8a` **作废**、新增 `A17` / `B15` / `B16`、`R-7` 关闭。代码实施仍须各自独立的 `Approved` ExecPlan |
| 作者 | Orchestrator（按 Human 2026-10-26 裁决起草） |
| 日期 | `2026-10-26`（同日追加 `A16`：再平衡提醒的精确落点，源自日志频道边界裁决 —— 提醒详情归组合域，见 [FS-cron-worker-status-board](./FS-cron-worker-status-board.md) `OQ7`；同日晚按 `TASK-059` 原型审查结果补齐 5 项裁决） |
| 交付单元 | **A · 组合详情 IA 收尾**（纯客户端） · **B · Dashboard 组合健康表**（`shared` + `server` + 客户端） |
| 编号说明 | **本 FS 不再预写任务编号**：编号在立项时按 [`TASKS.md`](../../tasks/TASKS.md) 当前最大号顺延确定（占号原则：立项才占号，写进 `active/` 才算数）。原因是 2026-10-26 一天内已发生两次撞号/顺延——`TASK-053`~`TASK-056` 给了 cron-worker 看板的 C-01~C-04，`TASK-057` 又给了 C-05（见 [FS-cron-worker-status-board-tasks](./FS-cron-worker-status-board-tasks.md)），预写编号只会反复过期 |
| 关联产品线 | `PL-3 组合与配置` · `PL-4 再平衡决策` · `PL-5 提醒与通知` · `PL-6 家庭层` |
| 服务端改动 | 交付单元 A：**零**；交付单元 B：`shared/services/portfolio/summary.js`（`stats` + `drift` 字段）+ `server` 的 summary 端点契约 + `alertEvent` 查询层过滤（`B16`；**均不新增端点**） |

> 行号以 2026-10-26 工作树（`main`）为准；若与最新代码不符，以符号名为准。

---

## 0. TL;DR

两个交付单元，解决同一件事：**「系统说你有事，你却看不到事在哪」**。

- **A · 组合详情**：首 Tab 从「持仓概览」改为 **「总览」**（KPI + 目标 vs 实际 + 偏离原因 + 最近一次再平衡）——卡片上的「偏离阈值」徽标第一次有了解释它的落地页。顺带把 **阈值设置** 从「再平衡」Tab 移到总览的配置区（配置与执行不同层）、给 **删除组合** 补上唯一入口（今天只能通过一个零引用页面触达）、修掉恒空的「今日盈亏」卡与恒为「暂无」的「最近再平衡」Chip。
- **B · Dashboard**：在总资产卡下加 **一行分币种小计**，再加一张 **3 行的「组合健康」表**（组合 / 市值 / 偏离 / 待办 / 上次再平衡）。这是首屏唯一能同时回答「哪个账户不对劲」和「有没有我的事」的形态。为此 `GET /api/portfolios/summary` 补三个字段：`lastExecutedAt`、`pendingRebalanceCount`、`drift.dueByTime`。

两处都**不新增页面、不新增端点、不新增渲染路径**：全部复用既有组件与既有接口。

---

## 1. Problem Statement

### 1.1 断层：徽标说「偏离」，点进去看不到「哪偏了」

`PortfolioCard`（`client/src/components/PortfolioCard/index.jsx`）显示「偏离阈值」琥珀徽标，点击落到 `/portfolios/view/:id/positions` —— 而「持仓概览」Tab 是 **4 张 KPI 卡 + 9 列持仓明细表**，**没有目标比例、没有实际比例、没有偏离量、没有偏离原因**（`KpiCards.jsx` + `PositionOverview.jsx`）。用户必须再切一次 Tab 才能看到漂移解释。

`PL-3` 对 `CM-13` 的判定本来就是「**修改**：概览与持仓概念重叠，信息层级不清 → 概览 = KPI + 配置 + 漂移；持仓 = 明细表」，但一直未实施；实码里连「概览」这个 Tab 都不存在（`Detail.jsx:15` 的 `TABS` 只有 `positions / position-history / rebalance / transactions`）。

### 1.2 层级：配置与执行同层，最深处 3 层且不可深链

`Rebalance.jsx` 在「再平衡」Tab 内再套 3 个子 Tab（`suggestions / settings / history`，`:12-14`），子 Tab 状态是 `useState('suggestions')`（`:18`）——刷新回到第一个、无法分享链接、也无法从通知直接落到「历史」。更关键的是把 **改一个阈值数字**（无害配置，随时可改）与 **执行调仓**（写账本、可撤销但有真实资金后果）放在同一个层级，削弱了 PL-4 那条「绝不自动交易」安全边界的表达。

### 1.3 不可达：`CM-19` 判「强化」，实为「入口不存在」

`deletePortfolio` 只出现在 `client/src/pages/Portfolio/Basic.jsx`（`:6`、`:24`），而 `Basic.jsx` **零路由引用**（不在 `TABS`、无 `<Route>`）。级联删除 API、防孤儿逻辑（`deletePortfolioCascade`：子资源清理失败则保留组合）、二次确认设计全都写好了，缺的只是**一个用户能点到的入口**。

### 1.4 假数据位：两个「看起来像功能坏掉」的固定空位

| 位置 | 症状 | 事实 |
|---|---|---|
| `PortfolioHeader.jsx:37` | 「最近再平衡 · 暂无」**恒为暂无** | 读 `portfolio.lastRebalanceAt`，而 `shared/models/portfolio.js` **没有该字段**（`name/description/type/currency/accountType/archived/targets/rebalanceSettings/createdAt`） |
| `KpiCards.jsx:48` | 「今日盈亏」**恒为「—」** | `Price` 无 `change/prevClose`（客户端派生涨跌幅），无前收价 → 硬编码 `'—'` |

`USER_RESEARCH` 的 I5 已指出：用户分不清「正常空态」和「坏了」。首屏两个永久空位，正是这个症状的教科书样本。数据其实都在：`summary.js` 的 `buildPortfolioSummary` **入参就有 `lastExecutedAt`**，`computeSummary` 也确实查了最近一条 `EXECUTED` 记录，只是**没有回传**。

### 1.5 时间维度偏离在列表页不可见

`summary.js` 的 `DRIFT_THRESHOLDS = ['absoluteDeviation', 'relativeDeviation']` 把 `evaluateThresholds` 结果里的 `timeInterval` **显式过滤掉**，`needsRebalance` 也只按过滤后结果计算。后果：**「超过 60 天没动过」这个最典型的再平衡场景，在组合列表与首屏永远不会显示为异常**。而 `checkThresholds` 返回的 `needsRebalance` 是含时间维度的 —— **同一个字段名，两处不同语义**，这是本次要显式命名的口径风险（见 R-1）。

### 1.6 再平衡通知是「三份文档都不认领的孤儿」

`PL-4 §5` 只写到 `RB-11`；`PL-5` 的 `AL-01~10` 全是「用户配规则 → 引擎评估」。而 AUTO 巡检产出的 `AlertEvent`（`ruleId = null`）既不进规则体系、也没有 `active / cooldownDays / 静默` 能力，**不可配、不可静音**。它借用 PL-5 的事件表，但产品上属于 PL-4 的出口。

### 1.7 Dashboard 只回答了一个问题

`/` 现在是「总资产卡 + 提醒事件列表」。总资产回答「我家多少钱」，提醒列表回答「有什么事」，但**没有任何东西回答「哪个账户不对劲、该先动哪个」**——而这正是打开应用 30 秒内最需要的判断。三个组合（CN-稳钱 / CN-长钱 / CA-长钱）的市值、偏离、待办、上次再平衡，全部得再点一次进 `/portfolios` 才能拼出来。

---

## 2. Goals

| # | 目标 |
|---|---|
| G-1 | 组合卡片的「偏离」徽标与详情页的「总览」**语义闭合**：点进去第一屏就能看到目标 vs 实际、偏在哪、偏多少、距上次再平衡多久 |
| G-2 | 组合详情最深交互层级 **3 → 2**，且第二层（再平衡子视图）**可深链、刷新保持** |
| G-3 | 「配置声明」与「运行时动作」在界面上分层：阈值/频率落在总览配置区，建议/历史落在再平衡 Tab |
| G-4 | 组合删除在界面上**可达**，且是不可误触的危险动作 |
| G-5 | 首屏 30 秒内可回答三问：我家多少钱 / 有没有我的事 / **哪个账户该先动** |
| G-6 | 两个交付单元均**不新增页面、不新增 API 端点、不新增表格/列表渲染路径**（唯一例外：`A16` 在**既有**历史表上加一处行内只读展开，不新增页面、不新增端点、不新增请求） |

---

## 3. Non-Goals

| # | 不做 | 理由 |
|---|---|---|
| NG-1 | 家庭资产趋势图、组合市值迷你趋势 | 无市值快照模型（PL-6 `FAM-01` 明确 NG）。不得在首屏做「假装有的趋势」 |
| NG-2 | 把再平衡通知纳入 `AlertRule`（新增 `ruleType: rebalance_due`） | 会出现两套触发源（AUTO 巡检 + 规则引擎）同时对同一组合发事件，去重成本高于收益。改由 `PL-4 RB-12` 正式登记归属，`PL-5` 只保留通道职责（OQ-3 裁决） |
| NG-3 | AUTO 自动执行交易 | 违反产品硬约束 |
| NG-4 | 汇率面板迁出 `/portfolios` | 属运维语义，但搬迁需重新规划其归属页；且 `/portfolios` 已达容量上限（OQ-6），**下一步单独处理**，不在本 FS 内动 |
| NG-5 | `PortfolioCard` 徽标改用 `dueByTime`（让「到期」也在列表页标黄） | 需要同时改徽标文案（「偏离阈值」→「待再平衡」）与 PL-3 `CM-12` 判定；本 FS 只保证**数据可得**（`drift.dueByTime`），展示升级另立（P2） |
| NG-6 | 删除前显示「将删除 N 笔交易」的精确影响面 | `deletePortfolioCascade` 返回的计数是**删除后**的结果，不能作预览；做预览需新端点。本次用「输入组合名确认」代替 |
| NG-7 | 为总览新增「目标 vs 实际」专用 API | 复用 `POST /:id/rebalance/check`（纯计算、无写入），避免第二套偏离判定实现 |
| NG-8 | 修 `TASK-046`（CSV 幂等）/ `TASK-047`（归属守卫）/ `TASK-051`（汇率方向） | 与本 FS 无文件交叠；`TASK-051` 会改变首屏金额，但那是**数据修正**，不是本 FS 的展示问题 |
| NG-9 | 组合详情「总览」内联编辑目标配置 | 目标配置仍只在 `PortfolioForm`；总览只做**只读对比 + 跳转编辑** |

---

## 4. Proposed Information Architecture

### 4.1 组合详情：Tab 与层级

| 现状 | 变更后 |
|---|---|
| 4 Tab：持仓概览 / 持仓历史 / 再平衡 / 交易记录（`DEFAULT_TAB = 'positions'`） | **5 Tab：总览 / 持仓概览 / 持仓历史 / 再平衡 / 交易记录**（`DEFAULT_TAB = 'overview'`） |
| 再平衡 Tab 内 3 子 Tab（`useState`，不可深链） | 再平衡 Tab 内 **2 子 Tab**（建议 / 历史），状态落 **URL query `?sub=`** |
| 阈值设置 = 再平衡 Tab 的子 Tab | 阈值设置 = **总览页「再平衡配置」折叠区**（只读摘要 + 展开可编辑） |
| 删除组合 = 仅 `Basic.jsx`（零引用） | 删除组合 = **详情 Header「更多」菜单 →「删除组合」** |

```
/portfolios/view/:id/overview        ← 新默认落点
┌──────────────────────────────────────────────────────────────┐
│ ‹ 返回   组合名                          [添加交易][编辑][设置目标][⋯]│
│ 类型 · 长期   币种 · CNY   最近再平衡 · 2026-08-27（60 天前）   │
├──────────────────────────────────────────────────────────────┤
│ 总览 │ 持仓概览 │ 持仓历史 │ 再平衡 │ 交易记录                  │
├──────────────────────────────────────────────────────────────┤
│ [持仓总市值] [未实现盈亏] [持有资产] [再平衡状态]   ← KPI 4 卡   │
│                                                              │
│ 目标 vs 实际                              ⚠ 2 项超阈 / 已到期  │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 标的      目标%   实际%   绝对偏离   相对偏离   状态        │ │
│ │ 000191    40.0    48.3    +8.3      +20.8%    ⚠ 绝对+相对  │ │
│ │ 513100    30.0    22.1    −7.9      −26.3%    ⚠ 绝对+相对  │ │
│ │ 511010    30.0    29.6    −0.4      −1.3%     正常         │ │
│ └──────────────────────────────────────────────────────────┘ │
│ 触发原因：绝对偏离 > 5% · 相对偏离 > 10% · 距上次再平衡 60 天   │
│                                                    [去再平衡 →]│
│                                                              │
│ 最近一次再平衡  2026-08-27 · EXECUTED · 手动 · 6 笔建议        │
│                                                              │
│ ▸ 再平衡配置（绝对偏离 5% / 相对偏离 10% / 间隔 60 天 / 每日）  │
└──────────────────────────────────────────────────────────────┘
```

**「再平衡状态」KPI 卡的取值**（四态，互斥，**按此优先级**判定）：

| 态 | 条件 | 文案 |
|---|---|---|
| 未设目标 | `targets.length === 0` | 「未设目标」 |
| 缺价 | `details` 中存在 `absoluteDeviation == null` 且总市值 > 0 | 「部分缺价」 |
| 到期/偏离 | `needsRebalance === true` **或** `dueByTime === true` | `needsRebalance` → 「N 项超阈」（N = `drift.overThresholdCount`）；**仅** `dueByTime` → 「已到期（N 天未调仓）」（**N = 距上次再平衡天数**，不是逾期天数）；`lastExecutedAt === null` 且时间判据生效 → 「从未执行过再平衡」；两者同时成立 → 「N 项超阈 · 已到期」 |
| 正常 | 以上皆否（**既未超阈、也未到期**） | 「正常」 |

> **口径硬约束**：`N 项超阈` 的 N 是**标的数**（`overThresholdCount`），`已到期（N 天）` 的 N 是**天数**。两个 N 不可混用，也不可互相替代——历史上 `triggeredThresholds.length` 是**阈值类型数**，正是 `B8a` 作废的原因（`R-7`）。

### 4.2 再平衡 Tab（2 子 Tab + URL 参数）

```
/portfolios/view/:id/rebalance?sub=suggestions   ← 默认
/portfolios/view/:id/rebalance?sub=history
┌──────────────────────────────────────────────────────────────┐
│ 再平衡                                                        │
│ ┌ 再平衡建议 ┬ 再平衡历史 ┐                                   │
│ │ 检查 → 生成 → 执行（现有 RebalanceSuggester 原样）           │
│ │ 历史记录 + 撤销 + 重新生成（现有 RebalanceHistory 原样）     │
└──────────────────────────────────────────────────────────────┘
```

- `settings` 子 Tab **删除**；配置入口收在总览页（见 4.1）与组合编辑页之间的单一路径：**总览配置区**。
- 子 Tab 用 `?sub=` 而非新增路由段：`PORTFOLIO_TAB` 是 3 段模式，加第 4 段要新增路由规则，成本高于收益。
- 通知事件的跳转（`Dashboard` 里 `navigate(/portfolios/view/:id/rebalance)`）保持有效，自动落到 `?sub=suggestions`；**有精确锚点时改带 `?sub=history&record=<id>`**（见 A16）。

#### 4.2.1 `?record=` 精确落点（A16）

现状：提醒事件里**已经存了锚点**——`alertCenter.notify` 写入 `snapshot: { recordId, suggestionsCount }`，但前端零引用；因此从一条提醒点进去，看到的永远是**最新一次**建议，而不是"提醒说的那一次"。

```
/portfolios/view/<id>/rebalance?sub=history&record=6703f2...
┌──────────────────────────────────────────────────────────────┐
│ 再平衡    ┌ 再平衡建议 ┬ 再平衡历史 ┐                          │
│ ▸ 已定位到 2026-08-27 的记录（如不在最近记录中会有提示）        │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Record ID  Time  Mode #Suggestions Status      操作        │ │
│ │ 6703f2...  ← 高亮   AUTO  4    待确认   [去处理] [撤销][重做]│ │
│ │   └ 展开：建议明细（只读）：000191 卖出 12 股 / …            │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- **只读展示该 record 的 `suggestions`**（数据已随 `GET /:pid/rebalance/history` 返回，**零新增请求**）。
- `PENDING` 记录行尾给「去处理」→ 切 `?sub=suggestions`；`EXECUTED` / `REVOKED` 沿用现有撤销 / 重新生成按钮。
- 该 record **不在最近 100 条**时提示「该建议不在最近记录中」，不空白、不报错（见 R-8 与 P1-4）。

### 4.3 Dashboard

```
/  — 家庭总览
┌──────────────────────────────────────────────────────────────┐
│ 家庭总览                                    [立即评估][规则管理]│
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 家庭总资产（RMB 折算）                                     │ │
│ │ ¥1,234,567.89                                            │ │
│ │ CNY ¥862,300 · US$18,400 · CAD $52,100 · HKD —            │ │  ← 新增：分币种小计
│ │ 数据时点：… · 部分组合折算不完整（缺价或缺汇率）            │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ 组合健康                                        [组合管理 →]  │  ← 新增
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 组合          市值              偏离      待办    上次再平衡│ │
│ │ CN-长钱      ¥82,340 · US$1,200  ⚠ 2 项超阈 2 条待确认  60 天前│
│ │ CA-长钱      C$52,100            ⚠ 已到期   —          61 天前│
│ │ CN-稳钱      ¥68,900            正常        —          12 天前│
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ 待处理提醒                            [未读|全部] [组合筛选 ▾] │  ← 原样保留
│ 事件卡 × N                                                    │
└──────────────────────────────────────────────────────────────┘
```

**健康表列定义**

| 列 | 数据 | 空态 |
|---|---|---|
| 组合 | `name`（+ `accountType` 徽标可选） | — |
| 市值 | `stats.marketValueByCurrency`（分币种并列，不跨币种合计） | 任一币种桶为 `null` → 该桶显示「—」并在行尾加 ⓘ「部分缺价」 |
| 偏离 | `needsRebalance` → 「N 项超阈」（**N = `drift.overThresholdCount`**，即有 `triggeredThresholds` 的 symbol 数，由 `B3` 提供）；否则 `dueByTime` → 「已到期（N 天）」（N = 距上次再平衡天数）；`targets` 为空 → 「未设目标」 | 「—」 |
| 待办 | `pendingRebalanceCount` 条待确认（可点 → `?sub=suggestions`）+ `unreadAlertCount` 条未读（可点 → `/` 并带 `portfolioId` 筛选） | 「—」 |
| 上次再平衡 | `stats.lastExecutedAt` 格式化为 `YYYY-MM-DD` + 距今天数 | 「从未」 |

**排序**：`待办数 > 0` 优先 → 其次 `偏离`（超阈）→ 再次 `已到期` → 最后按 `createdAt` 倒序（稳定兜底）。只有 3 行时排序差异极小，但一旦增加组合，**「有事的在上」比固定顺序更有用**。

---

## 5. User Stories

| # | 故事 | 归属 |
|---|---|---|
| US-1 | 作为组合主人，我看到卡片上「偏离阈值」后点进组合，**第一屏就知道哪只超了、超了多少、为什么判超** | A |
| US-2 | 作为组合主人，我要改再平衡阈值时不会和「执行调仓」混在一起，能明确区分「改配置」和「动钱」 | A |
| US-3 | 作为组合主人，我要删掉一个建错的组合时，能在组合页找到入口，并且知道这会连交易记录一起删掉 | A |
| US-4 | 作为组合主人，我把「再平衡历史」链接发给未来的自己（书签/链接）时，打开就是历史而不是被重置回建议区 | A |
| US-5 | 作为家庭管理者，我早上打开应用 30 秒内知道：家里多少钱、钱分布在哪些币种、哪个账户不对劲、有没有我要动手的事 | B |
| US-6 | 作为家庭管理者，我从首屏发现「CN-长钱有 2 条待确认建议」后，一次点击直达那个组合的待确认建议 | B |
| US-7 | 作为组合主人，我从一条再平衡提醒点进去时，看到的是**提醒说的那一次**记录（含当时的建议明细），而不是"最新一次" | A（A16） |

---

## 6. Requirements

### 6.1 P0 — 交付单元 A：组合详情 IA 收尾（纯客户端）

| # | 需求 | 落点 |
|---|---|---|
| A1 | `Detail.jsx` 的 `TABS` 在最前新增 `{ key: 'overview', label: '总览' }`，`DEFAULT_TAB` 由 `'positions'` 改为 `'overview'`；Tab 顺序固定为 **总览 / 持仓概览 / 持仓历史 / 再平衡 / 交易记录** | `pages/Portfolio/Detail.jsx:15, 23` |
| A2 | 新增 `pages/Portfolio/Overview.jsx`，自上而下四块：① KPI 4 卡 ② 目标 vs 实际表 ③ 触发原因 ④ 最近一次再平衡 + 「再平衡配置」折叠区 | 新文件 |
| A3 | 目标 vs 实际表数据**必须**来自 `POST /api/portfolios/:id/rebalance/check` 的 `details`（含 `targetRatio / currentRatio / absoluteDeviation / relativeDeviation / triggeredThresholds`）与 `reasons` / `triggeredThresholds`。**禁止**前端自行实现偏离/阈值判定（`actualRatios` 返回的 `{symbol,currency,ratio}` **不含 target**，join 目标再本地算阈值 = 第二套口径） | `services/portfolio.service.js` 既有方法 |
| A4 | 「触发原因」行把 `triggeredThresholds` 与 `reasons` 渲染为**人话**：`absoluteDeviation`→「绝对偏离 > {阈值}%」、`relativeDeviation`→「相对偏离 > {阈值}%」、`timeInterval`→「距上次再平衡 {N} 天 > {阈值} 天」、`NEVER_EXECUTED`→「从未执行过再平衡」、`TIME_INTERVAL_EXCEEDED`→同上、`TOTAL_VALUE_ZERO`→「组合总市值为 0，无法判定」。文案映射放组件内常量，不散落 | `Overview.jsx` |
| A5 | KPI 4 卡改为 **持仓总市值 / 未实现盈亏 / 持有资产 / 再平衡状态**；`KpiCards.jsx` 中「今日盈亏」卡**删除**（`value: '—'` 的固定空位） | `KpiCards.jsx:48` |
| A6 | `KpiCards.jsx` 的货币格式器**不得**固定 `currency: 'USD'`：按组合 `currency`（CNY/CAD/USD）选择符号；`currency` 缺失时回落中性格式（不带符号）。**符号口径**与 `utils/priceDisplay.js` 的 `formatMoney` 保持一致（`US$` / `CA$` / `¥`） | `KpiCards.jsx:11-16` |
| A7 | 「再平衡配置」折叠区（默认收起）复用 `PortfolioRebalanceSettings`，展示四项当前值：绝对偏离 / 相对偏离 / 时间间隔 / 检查频率；展开后可编辑并 `PUT /:pid/rebalance-settings`，成功后 invalidate 组合与 summary 两个 query | `Overview.jsx` + 既有组件 |
| A8 | `Rebalance.jsx` 的子 Tab 由 3 个减为 **2 个**（`suggestions` / `history`），删除 `settings` 项；激活态改由 URL query `?sub=` 驱动，默认 `suggestions`；非法 `sub` 值回落默认 | `pages/Portfolio/Rebalance.jsx:12-14, 18` |
| A9 | `PortfolioHeader` 新增「更多」菜单（`MoreHorizontal` 图标 + 下拉），两项：「**归档组合**」（切换 `archived`，复用既有 `PUT /:id`；归档 ≠ 删除，数据保留、退出默认列表与 AUTO 调度）与「**删除组合**」；删除点击弹二次确认：**必须输入组合名**才启用删除按钮，文案明示「将同时永久删除该组合的全部交易记录与再平衡记录，不可恢复；该组合相关的提醒将不再显示」。确认后 `DELETE /api/portfolios/:id`，成功跳 `/portfolios` 并 invalidate portfolios query | `PortfolioHeader.jsx` |
| A10 | `PortfolioHeader` 的「最近再平衡」Chip：**不得**读 `portfolio.lastRebalanceAt`（模型无此字段，`PortfolioHeader.jsx:37`）。`B1` 落地后 `lastExecutedAt` **只**出现在 `GET /api/portfolios/summary` 的 `stats` 上（`getPortfolioById` 返回的是裸 `Portfolio`，**不含**该字段，且**不打算补**——否则每个详情页多一次 `RebalanceRecord` 查询）→ Header 改用 `usePortfolios()`（`queryKey: ['portfolios-summary']`，与 Dashboard/列表页同一缓存，**零新增请求**）按 `id` 取 `stats.lastExecutedAt`；Chip 在 B1 前隐藏，B1 后显示 `YYYY-MM-DD`，`null` 显示「从未」。**该字段共 3 个消费方**：Header Chip / Dashboard 健康表 / 组合列表卡（`B15`），口径必须同源 | `PortfolioHeader.jsx:37` |
| A11 | `Detail.jsx` 中若 `tab === 'basic'`（历史遗留），跳转默认 Tab（`overview`）；`ROUTES.PORTFOLIO_VIEW` 由 `/portfolios/view/:id/basic` 改为 `/portfolios/view/:id/overview` | `constants/routes.js:29` |
| A12 | **删除**零引用文件 `pages/Portfolio/Basic.jsx`、`pages/Portfolio/TargetAllocation.jsx`；删除前 `grep` 确认零引用并记录结果 | 两个文件 |
| A13 | 未设目标配置时（`targets.length === 0`）：目标 vs 实际表替换为**空态**——「尚未设置目标配置，无法判断偏离」+「去设置」按钮跳 `/portfolios/edit/:id`；**不得**渲染全 0% 的假表格 | `Overview.jsx` |
| A14 | 缺价时（`details` 中 `absoluteDeviation === null` 且 `totalValue > 0`）：该行「绝对偏离 / 相对偏离」列显示「—」并在表尾加一行说明「N 项缺最新价，未能参与偏离判定」；**不得**按 0 价参与计算 | `Overview.jsx` |
| A15 | 大类目标模式（`targets` 含 `level: 'asset_class'`）：总览沿用 `check` 返回的大类口径（`details.symbol` 为大类代码），表格首列显示大类中文名；**不得**前端自行摊分到 symbol | `Overview.jsx` |
| A16 | **再平衡提醒的精确落点**：`Dashboard.jsx` 的 `EventCard` 在 `event.snapshot?.recordId` 存在时跳 `/portfolios/view/<pid>/rebalance?sub=history&record=<recordId>`（无 `recordId` 维持现状跳 `?sub=suggestions`）；`RebalanceHistory` 读取 `?record=`：命中则**高亮该行 + 自动展开「建议明细」（只读渲染 `record.suggestions`）**；`?record=` 存在时首次请求用 `pageSize=100`（仅此一路径，常规路径仍 20）；未命中显示「该建议不在最近记录中」提示；`status === 'PENDING'` 的行尾追加「去处理」→ 切 `?sub=suggestions`。**零服务端改动、零新增请求**（`getHistory` 已返回 `suggestions`） | `Dashboard.jsx`、`RebalanceHistory.jsx` |
| A17 | `PortfolioHeader` 新增「**设置目标**」按钮（位于「编辑」与「更多」之间）→ `ROUTES.PORTFOLIO_EDIT(id)`，落到 `PortfolioForm` 的目标配置区。**目标配置仍只在 `PortfolioForm` 维护**（`NG-9` 不变）；该按钮只是把「目标」这条最高频的入口提到详情页 Header，**不得**在详情页内联弹窗编辑目标（会与 `NG-9`、`A13` 的空态跳转形成第二套编辑形态）。**现状**：Header 只有「编辑」「添加交易」两个按钮，本项是纯新增 | `PortfolioHeader.jsx:94-125` |

### 6.2 P0 — 交付单元 B：Dashboard 组合健康表（`shared` + `server` + 客户端）

| # | 需求 | 落点 |
|---|---|---|
| B1 | `buildPortfolioSummary` 返回值新增 **`lastExecutedAt`**（`Date \| null`）。该值**入参已有**，仅需回传，不得为此新增查询 | `shared/services/portfolio/summary.js` |
| B2 | `computeSummary` 输出的 `stats` 新增 **`pendingRebalanceCount`**（该组合 `status: 'PENDING'` 的 `RebalanceRecord` 条数）。**必须**用一次 `$match + $group by portfolioId` 的聚合批量取，**禁止**在 `portfolios.map` 内逐组合 `countDocuments`（N+1） | 同上 |
| B3 | `buildPortfolioSummary` 的 `drift` 新增**两个字段**：**`dueByTime: boolean`**（`timeInterval` 是否触发）与 **`overThresholdCount: number`**（`details` 中 `triggeredThresholds` 非空的 symbol 数 = **超阈标的数**）。**`drift.needsRebalance` 与 `drift.triggeredThresholds` 的既有语义不变**（仍仅含绝对/相对偏离）—— 卡片徽标「偏离阈值」依赖它，改名或扩义会连带改动 PL-3 `CM-12` | 同上 |
| B4 | `drift` 为 `null` 的判定条件不变（无目标 / 无持仓 / 缺价）；`dueByTime` 与 `overThresholdCount` 在 `drift === null` 时不可读，前端按「未设目标」或「—」处理 | 同上 |
| B5 | `GET /api/portfolios/summary` 的接口契约文档同步（`dev/API_CONTRACT.md`）与 `manual/SERVER.md` 相关一行；**不新增端点、不改路径** | `docs/dev`、`docs/manual` |
| B6 | Dashboard 总资产卡内新增**一行分币种小计**：按 `buckets` 逐币种显示 `{币种符号}{金额}`，`null` 桶显示「—」；币种顺序固定 `CNY → USD → CAD → HKD`，其余按字母序追加；无数据时该行整体不渲染（不留空行） | `components/Household/TotalAssetsCard.jsx` |
| B7 | Dashboard 新增「组合健康」区块，位于总资产卡与「待处理提醒」之间，5 列 3 行（组合 / 市值 / 偏离 / 待办 / 上次再平衡）；数据源复用**既有** `usePortfolios()`（`:76` 已在使用，同一 `queryKey`，不新增请求） | `pages/Dashboard.jsx` |
| B8 | 「偏离」列取值优先级：`needsRebalance === true` → 「**N 项超阈**」（N = `drift.overThresholdCount`）；否则 `dueByTime === true` → 「**已到期（N 天）**」（N = `lastExecutedAt` 距今天数；`lastExecutedAt === null` → 「从未执行过再平衡」）；否则 `targets` 为空 → 「未设目标」；否则「正常」。两个 N 量纲不同（标的数 / 天数），**文案必须带单位词**（「项」/「天」） | 客户端派生 |
| ~~B8a~~ | **已作废（2026-10-26 `HD-10`）**。原文「健康表不展示 N，改用『偏离超阈』」与 Human「保留 N」的裁决冲突；`triggeredThresholds.length` 确实是**阈值类型数**这一事实判断不变，但正解是让 `B3` 提供正确的 `overThresholdCount`，而不是砍掉 N。本行仅留存决策轨迹，**不得**据此实施 | — |
| B9 | 「待办」列：`pendingRebalanceCount > 0` → 徽标「N 条待确认」，点击跳 `/portfolios/view/:id/rebalance?sub=suggestions`；`unreadAlertCount > 0` → 徽标「N 条未读」，点击跳 `/` 并把组合筛选设为该 `portfolioId`；两者皆 0 → 「—」 | 客户端派生 |
| B10 | 行排序：`待办数>0` → `needsRebalance`（超阈）→ `dueByTime`（已到期）→ `createdAt` 倒序（同分稳定）。排序结果**不得**因数据刷新而抖动（比较函数须为全序） | 客户端派生 |
| B11 | 表格行可点（整行跳 `/portfolios/view/:id/overview`），且键盘可达（`tabIndex` + `Enter`）；行内徽标为独立可点元素，点击时 `stopPropagation` | 客户端派生 |
| B12 | 已归档组合**不出现**在健康表（`computeSummary` 默认 `archived: {$ne: true}`，不改）；空结果时区块显示「暂无组合，先创建一个」+「新建组合」按钮 | 由既有服务端行为保证 |
| B13 | `summary` 请求失败时，健康表显示局部错误态，**不得**影响总资产卡与提醒列表（沿用总资产卡已经验证过的隔离模式） | `pages/Dashboard.jsx` |
| B14 | 保留现有「待处理提醒」区块（筛选 / 标记已读 / 忽略 / 立即评估 / 规则管理）**逻辑零改动** | 边界 |
| B15 | `PortfolioCard`（`/portfolios` 组合卡）新增四格：**总市值 / 持仓资产 / 待办 / 上次再平衡**。数据**全部**取自既有 `usePortfolios()` 的 `stats`（`marketValueByCurrency` / `positionCount` / `pendingRebalanceCount` + `unreadAlertCount` / `lastExecutedAt`）——**零新增请求、零服务端改动**。**口径必须与健康表同源**：徽标仍用 `drift.needsRebalance`（`P1-1` 未做前不改其语义），「待办」两项的跳转目标与 `B9` 一致，「上次再平衡」缺口按「从未」。⚠️ 这是**新增展示范围**（现状卡片只有「偏离阈值」徽标，`PortfolioCard/index.jsx:36`），由 `HD-13` 裁决纳入本期 | `components/PortfolioCard/index.jsx` |
| B16 | **删除组合后，其全部提醒事件不再出现在任何出口**（`HD-14` 裁决「全部隐藏」）。实现点**唯一**：`AlertEvent` **查询层过滤** —— 取现存组合 id 集合（组合数量级为个位数），条件为 `$or: [{ portfolioId: { $in: ids } }, { portfolioId: null }]`（**资产级事件没有 `portfolioId`，必须保留**）。**三处口径必须一致**：① `GET /api/alerts/events` 列表；② `summary` 的 `stats.unreadAlertCount` 聚合（`summary.js:85-88` 现按 `$group by portfolioId`，须同加过滤）；③ Dashboard 未读计数。**不删数据、不加字段、不写迁移**：事件保留在库（审计价值），仅查询不可见。**禁止**只在客户端过滤（`/alerts` 与 summary 计数会漏） | `shared/services/alert*.js`、`server` alert 路由、`summary.js` |

### 6.3 P1（本 FS 不实施，仅登记）

| # | 需求 | 说明 |
|---|---|---|
| P1-1 | `PortfolioCard` 徽标按 `dueByTime` 显示「待再平衡」（区别于「偏离阈值」） | 依赖 B3 的数据已落地；需同步改 PL-3 `CM-12` 判定与文案 |
| P1-2 | 删除确认弹窗显示「将删除 N 笔交易 / M 条再平衡记录」 | 需新端点 `GET /api/portfolios/:id/delete-impact`（`deletePortfolioCascade` 的计数是删除**后**结果，不能复用） |
| P1-3 | 总览「目标 vs 实际」表支持排序 + 大类/资产级切换 | 需与 `CM-14` 的 `?level=` 对齐 |
| P1-4 | 新增 `GET /api/portfolios/:pid/rebalance/records/:rid`，供 `?record=` 精确取单条 | 现无单条端点（`recorder.getRecord` 有服务函数但未挂路由）。消灭 R-8 的 100 条上限；本次不做（A 单元零服务端改动） |
| P1-5 | 组合再平衡历史行加「查看运行记录」→ `/logs/rebalance?portfolio=<pid>` | 反向缝合入口，需日志频道详情页（`FS-cron-worker-status-board` R10）先落地；本 FS 不做，只保证 A16 单向可用 |

### 6.4 P2 / Future

- 家庭资产趋势（`FAM-01`，需快照模型）
- 组合详情内联编辑目标配置（当前统一走 `PortfolioForm`）
- 汇率面板迁出 `/portfolios`（运维语义归位）
- 再平衡通知升级为可配/可静音（需重新评估是否纳入 `AlertRule`，见 NG-2）

---

## 7. Acceptance Criteria

### 交付单元 A

| # | 验收标准 |
|---|---|
| AC1 | `/portfolios/view/:id` 无 tab 段时落到 `/portfolios/view/:id/overview`；`/portfolios/view/:id/basic` 亦落到 `overview`（无白屏） |
| AC2 | 详情页 Tab 恰为首屏 5 个、顺序为 总览 / 持仓概览 / 持仓历史 / 再平衡 / 交易记录 |
| AC3 | 「总览」页在 1440×900 **不滚动**可见：4 张 KPI 卡、目标 vs 实际表的表头与至少 3 行、触发原因行 |
| AC4 | 目标 vs 实际表的 `绝对偏离` 数值与 `POST /:id/rebalance/check` 返回的 `details[i].absoluteDeviation` **逐项一致**（容差 `1e-6`）；断言用构造数据：目标 40% / 实际 48.3% → 行显示 `+8.3` |
| AC5 | 表格「状态」列与 `details[i].triggeredThresholds` 一致：仅绝对超阈 → 只标「绝对」；两者皆超 → 标两项 |
| AC6 | 触发原因行同时出现 `timeInterval` 对应文案（构造 `lastExecutedAt` 距今 61 天、`timeInterval: 60`），证明**时间维度在详情页可见** |
| AC7 | 未设目标时显示空态文案与「去设置」按钮，页面 DOM 中**不存在** 0.0% 的目标列数据（负向对照：设了目标时该文案不出现） |
| AC8 | 缺价时该行偏离列为「—」且出现「未能参与偏离判定」说明；`totalValue` 与偏离不被零价污染 |
| AC9 | KPI 区**不存在**「今日盈亏」文案；`grep -rn "今日盈亏" client/src` 无结果 |
| AC10 | 币种为 `CAD` 的组合，KPI 金额符号为 `CA$`（注入同 class 参照片取 `getComputedStyle`/文本断言，不硬编码色值）；`CNY` → `¥` |
| AC11 | 再平衡 Tab 恰有 2 个子 Tab；`?sub=history` 直接打开落在历史、刷新后仍在历史；`?sub=xxx` 回落建议 |
| AC12 | 阈值设置不再出现在再平衡 Tab；总览「再平衡配置」折叠区默认收起，展开可编辑，保存成功后 `GET /:pid/rebalance-settings` 与 `summary` 两个 query 均失效刷新 |
| AC13 | Header「更多」→「删除组合」：确认弹窗未输入组合名时删除按钮 disabled；输入**错误**名称仍 disabled；输入正确名称后可删除，删除后跳 `/portfolios` 且列表中该组合消失。**弹窗文案断言**：同时含「永久删除」「交易记录」「再平衡记录」「不可恢复」四个要素，且**不含**「不会级联删除」 |
| AC14 | 删除流程若 API 返回非 2xx，弹窗保留并显示错误，**不**跳转（负向对照） |
| AC15 | Header「最近再平衡」Chip：无 `lastExecutedAt` 时显示「从未」，有值时显示 `YYYY-MM-DD`；DOM 中 `grep` 不到「暂无」 |
| AC16 | `grep -rn "Basic\b" client/src/router.jsx` 与 `grep -rn "TargetAllocation" client/src` 均无结果；两个文件已删除 |
| AC17 | `git status server shared cron-worker` 空输出（交付单元 A 零服务端改动） |
| AC18 | `npm run build --workspace client` exit 0；`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` 0 error |
| AC19 | 独立 Reviewer 复核通过，**不得**由 Implementer 自判 |
| AC37 | 构造一条带 `snapshot.recordId` 的 `action` 级事件 + 对应 `PENDING` 记录，点击事件后：URL 含 `sub=history` 与 `record=<id>`；该行有高亮样式；展开的建议明细行数 = `record.suggestions.length`。**负向对照**：`snapshot` 为空的事件，跳转 URL **不含** `record=` |
| AC38 | `?record=` 指向不存在的 id 时：出现「该建议不在最近记录中」提示，历史表正常渲染（不得空白/报错）；`?record=` 缺失时历史表**不**渲染建议明细展开区（证明断言锚准锚点而非恒显示） |
| AC39 | A16 未新增任何请求：同一 `?record=` 页面在 Network 面板中 `history` 请求数为 1（且访问前后 `RebalanceRecord.countDocuments()` 不变） |
| AC40 | Header 恰有 4 个动作：**添加交易 / 编辑 / 设置目标 / 更多**（**不得**出现「再平衡」按钮）；点「设置目标」落到 `/portfolios/edit/:id` 且目标配置区可见；`grep` 确认详情页内**不存在**目标编辑弹窗（`NG-9` 单一编辑形态） |

### 交付单元 B

| # | 验收标准 |
|---|---|
| AC20 | `GET /api/portfolios/summary` 每项 `stats` 含 `lastExecutedAt`（无记录为 `null`）与 `pendingRebalanceCount`（整数，默认 0）；`drift` 含 `dueByTime`（布尔）与 `overThresholdCount`（整数，`drift === null` 时不可读） |
| AC21 | `drift.needsRebalance` 与 `drift.triggeredThresholds` 在**仅有时间维度触发**时保持 `false` / `[]`，而 `dueByTime === true` —— 三项同断言，证明语义未被扩义 |
| AC22 | 一个组合存在 2 条 `PENDING` 记录时 `pendingRebalanceCount === 2`；`EXECUTED` / `REVOKED` 不计入 |
| AC23 | `computeSummary` 对 N 个组合的 `RebalanceRecord` 查询 = **1 次聚合 + 每组合 1 次 `lastExecuted`（合计 1+N，后者是既有行为、不属本次优化）**；**禁止**的是新增第 2 类 N+1（如 `pendingRebalanceCount` 逐组合 `countDocuments`、`overThresholdCount` 逐组合复算）。判定方式：代码审查 + 在 10 个组合的构造数据上断言 `RebalanceRecord` 查询次数 ≤ 11 且 `countDocuments` 调用次数 = 0（**不得**靠「跑得快」判定） |
| AC24 | 首屏在 1440×900 不滚动可见：总资产金额、分币种小计一行、健康表 3 行 |
| AC25 | 分币种小计与 `/portfolios` 的币种分桶对同一数据源显示一致（同一次 `family-summary` 缓存）；`null` 桶显示「—」 |
| AC26 | 健康表「偏离」列四态各一条构造用例：① 仅超阈 → 「**N 项超阈**」且 N 与 `overThresholdCount` 一致（构造 2 个标的超阈 → 「2 项超阈」；负向：`triggeredThresholds.length === 2` 但只覆盖 1 个标的时须显示「1 项超阈」，证明量纲未用错）；② 仅 `dueByTime` → 「已到期（N 天）」且 N = 距今天数；③ 两者皆无 → 「正常」；④ 无目标 → 「未设目标」 |
| AC27 | 「待办」列点击「N 条待确认」落到 `/portfolios/view/:id/rebalance?sub=suggestions`；点击「N 条未读」落到 `/` 且组合筛选 = 该 `portfolioId`；点徽标**不**触发整行跳转 |
| AC28 | 排序断言：构造 3 个组合（A 有 2 条待确认 / B 仅超阈 / C 正常），渲染顺序为 A → B → C；再次刷新后顺序不变 |
| AC29 | 归档组合不出现在健康表（构造 1 个 `archived: true` 的组合，负向对照：`includeArchived` 打开时 `/portfolios` 能看到它） |
| AC30 | `summary` 请求失败（`route.abort()`）时，健康表显示局部错误态，总资产卡与提醒列表**仍正常渲染**（不得整页白屏或整页错误） |
| AC31 | 健康表有 0 个组合时显示空态与「新建组合」按钮，不出现只有表头的空表格 |
| AC32 | 提醒区筛选（未读/全部、组合）、标记已读、忽略、立即评估、规则管理跳转行为不变 |
| AC33 | `git status cron-worker` 空输出（本单元不涉及调度进程） |
| AC34 | 服务端测试覆盖 B1/B2/B3 三条字段（含 AC21、AC22 的边界），`npm test` 全绿 |
| AC35 | `docs/dev/API_CONTRACT.md` 的 summary 响应示例已更新；本 FS 状态行与 §11 记录一致 |
| AC36 | 独立 Reviewer 复核通过 |
| AC41 | `PortfolioCard` 四格全部呈现且**不新增请求**：进入 `/portfolios` 时 Network 中 portfolios 相关请求数不变（对比改动前的基线）；「上次再平衡」无值显示「从未」；「待办」为 0 显示「—」；卡片「偏离」文案与同组合在健康表的文案**逐字一致**（构造同一组合，比对两处文本） |
| AC42 | 构造「组合 A 有 3 条未读事件 + 1 个资产级（`portfolioId=null`）未读事件」→ 删除组合 A 后：① `GET /alerts/events` 不再返回那 3 条、**仍返回**资产级 1 条；② `summary` 中其它组合的 `unreadAlertCount` 不变、全站未读计数减 3；③ 库里那 3 条 `AlertEvent` **仍存在**（`countDocuments` 校验，证明确实是"隐藏"而非删除）；④ 负向对照：未删除时三处计数一致 |

---

## 8. Open Questions（6 项，均已于 2026-10-26 随 FS 批准按推荐确认）

> 另有 **5 项**在原型审查阶段浮现的裁决（`OQ-A`~`OQ-E`，涉及健康表 N、Header 按钮、修复顺序、组合卡四格、删组合后残留事件）记在 **§11 `HD-10`~`HD-14`**，不占本表编号。

| # | 问题 | 裁决 | 理由 |
|---|---|---|---|
| OQ-1 | 组合详情首 Tab 是否改为「总览」 | **改** | 「卡片说偏了、点进去看不到哪偏」的唯一正解。改动面最大但最值；`PL-3 CM-13` 早已判「修改」，本次是补上实施 |
| OQ-2 | 「阈值设置」是否移出再平衡 Tab | **移出**（并入总览配置区），同时子 Tab 改 URL 参数 | 配置与执行不同层；改一个数字与动一笔钱的风险量级不同，不该同层展示 |
| OQ-3 | 再平衡通知是否正式纳入 `AlertRule`（`ruleType: rebalance_due`） | **不纳入**，写为 Non-goal；`PL-4` 登记 `RB-12` | 纳入会出现两套触发源（AUTO 巡检 + 规则引擎）同时发事件，去重成本高于收益 |
| OQ-4 | Dashboard 是否采纳「组合健康表」（需服务端补 2–3 字段） | **采纳**，独立立项（交付单元 B） | 首屏唯一能同时承载「状态」与「待办」的形态；卡片网格装 3 个组合会留半行空白 |
| OQ-5 | 「删除组合」入口补在哪 | **详情 Header「更多」菜单** | 删除属危险动作，不该在编辑表单里 |
| OQ-6 | `/portfolios` 的容量上限：下一个家庭区块往哪放 | **明确「不再往这加」**，汇率面板后续迁「设置/运维」语义 | TASK-050 删 `/family` 的必然代价；已到容量上限（4 块家庭汇总 + 组合列表 + 汇率面板） |

---

## 9. Phasing

| 阶段 | 内容 | 交付物 |
|---|---|---|
| 阶段 1 | **交付单元 A**（编号立项时确定）：总览 Tab + KPI 修正 + 阈值移出 + 删除入口（归档 + 删除）+ **Header「设置目标」按钮** + 子 Tab URL 化 + `?record=` 精确落点 + 遗留清理 | 独立 `Approved` ExecPlan + 代码 + 审查 |
| 阶段 2 | **交付单元 B**（编号立项时确定）：`summary` 四字段（含 `overThresholdCount`）+ Dashboard 健康表 + 分币种小计 + **组合卡四格** + **删组合后事件隐藏** | 独立 `Approved` ExecPlan + 代码 + 审查 |
| 收尾 | Human 提交 + 最终验收；Ardot 设计稿「组合详情」「Dashboard」两屏同步改版 | 提交 + 设计稿 |

**产物标尺（`HD-14` 配套）**：本线有两份设计产物，各管一件事，**不得互相替代**——
- **Ardot 9 屏设计稿**：管**视觉**（间距 / 组件样式 / design token），改动走设计稿流程；
- **`docs/ui/2.0/portomind-prototype.html` Web 交互原型**：管**行为**（状态机 / 跳转 / 文案 / 空态），实施以它为比对标尺。原型与本文冲突时，**以本文（需求）为准并回改原型**（见 `TASK-059`）。

**顺序建议 A 先于 B**，但不是硬依赖：B 的「待办」列跳转目标 `?sub=suggestions` 依赖 A8 落地（A 未落地时该链接仍可用，只是落到默认子 Tab）。反向不成立：**A10 的 `lastExecutedAt` 依赖 B1** —— 因此 A 中该 Chip 在 B1 前隐藏，B1 后显示。若两个单元必须颠倒，A10 需改为「B1 落地后再补」。

**单元内部依赖**：`A16`（`?record=` 精确落点）依赖 `A8`（子 Tab 由 `?sub=` 驱动）—— A8 未落地时 A16 的 `sub=history` 不生效。二者同属 A 单元，建议同一 ExecPlan 内按 A8 → A16 顺序实现。

---

## 10. Dependencies & Risks

### 依赖

| 编号 | 依赖 | 状态 |
|---|---|---|
| D-1 | `TASK-050`（组合列表页承接家庭区块）完成 | ✅ **已 `Completed`（2026-10-26）** — 已合入 `main` `cafcc5d`（PR #35），`/portfolios` 五区块布局落定，`TotalAssetsCard` 卡片结构未变。交付单元 B 的 B6 可随时启动 |
| D-2 | `TASK-051`（汇率方向）修复 | **不阻塞**：本 FS 不动折算口径。但 `TASK-051` 修复会显著改变首屏金额，验收截图需注明日期 |
| D-3 | Planner 为两个单元各产出 `Approved` ExecPlan | 按纪律，改 `client/` 亦需批准 |

### 风险

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **同名不同义**：`checkThresholds` 的 `needsRebalance` **含**时间维度，`summary` 的 `drift.needsRebalance` **不含**。两处都叫 `needsRebalance` | B3 只加 `dueByTime`、不改既有语义；AC21 用三项联合断言锁住语义；在 PL-3 §6.3 与 PL-4 §6.1 各写一句「两处语义不同，勿合」 |
| R-2 | **用 POST 当读接口**：总览用 `POST /rebalance/check`。若未来给该端点加副作用（写记录/发事件），总览会静默变成写操作 | A3 显式约束「`check` 必须保持无写入」；ExecPlan 中加断言：调用前后 `RebalanceRecord.countDocuments()` 不变 |
| R-3 | **Tab 默认值变更影响既有深链**：把默认落到 `overview` 后，旧书签 `/portfolios/view/:id/positions` 仍有效（只是不再默认） | A1 只改 `DEFAULT_TAB`，不改 tab 键名；AC1 覆盖 `basic` 回落 |
| R-4 | **误删组合**：补入口等于新增一个不可逆动作的触达点 | A9 强制输入名称确认 + 文案明示级联范围；AC13/AC14 覆盖错误名称与 API 失败两条负向路径 |
| R-5 | **首屏请求数**：健康表若另起请求会增加首屏负担 | B7 复用已有 `usePortfolios()`（同一 `queryKey`），AC「请求次数不变」可观测 |
| R-6 | **设计稿漂移**：KPI 币种符号、Tab 数量、首屏新增区块都与 Ardot 设计稿不一致 | 收尾阶段同步改版两屏；FS 内 AC3/AC24 用「不滚动可见」这种结果性标准，不锁死像素 |
| R-7 | **`N 项超阈` 用错量纲**：`triggeredThresholds` 是**阈值类型**数组，不是标的数 | **CLOSED（`HD-10`）**：不再靠"不带 N"回避，而是由 `B3` 提供 `overThresholdCount`（口径 = `details` 中 `triggeredThresholds` 非空的 symbol 数），`B8a` 作废；AC26 用「2 个阈值类型覆盖 1 个标的」的构造数据反证量纲 |
| R-8 | **`?record=` 靠前端模糊匹配**：无单条记录端点，只能拉历史页再匹配，超出 100 条即失配 | A16 用 `pageSize=100` + 明确失配提示；精确方案登记 P1-4（新增 `GET /:pid/rebalance/records/:rid`），本次不做以保住"零服务端改动" |
| R-9 | **删组合后残留事件**：`deletePortfolioCascade` 只删 `Transaction` + `RebalanceRecord`（`deletePortfolio.js:11-12`），**不删 `AlertEvent`** → 事件卡 `portfolioId` 悬空，点进去 404 | **`HD-14` 已裁「全部隐藏」**，由 `B16` 在**查询层**统一过滤（列表 + `unreadAlertCount` + Dashboard 三处同源）；AC42 用「删后库里仍在、接口不可见」双断言锁住"隐藏而非删除" |
| R-10 | **同一指标两处口径不一致**：组合卡与 Dashboard 健康表若各算一套「偏离/待办」，会出现"卡片说正常、表说 2 项超阈" | `B15` 强制卡片复用同一 `stats`；AC41 要求两处文案**逐字一致**（构造同一组合比对文本） |

---

## 11. Human Decisions（裁决记录）

| # | 日期 | 裁决 |
|---|---|---|
| HD-1 | 2026-10-26 | 组合详情首 Tab 改为「总览」（KPI + 目标 vs 实际 + 偏离原因 + 最近再平衡），持仓明细下沉为第二 Tab |
| HD-2 | 2026-10-26 | 「再平衡配置」移出再平衡 Tab，并入总览配置区；再平衡子 Tab 改 URL 参数以便深链 |
| HD-3 | 2026-10-26 | 再平衡通知**不**纳入 `AlertRule`；由 PL-4 登记 `RB-12` 承载归属，PL-5 只保留通道职责 |
| HD-4 | 2026-10-26 | Dashboard 采纳「组合健康表」（形态 A），并接受 `summary` 端点补字段的服务端改动 |
| HD-5 | 2026-10-26 | 「删除组合」入口置于详情 Header 的「更多」菜单 |
| HD-6 | 2026-10-26 | `/portfolios` 明确「不再新增家庭区块」；汇率面板后续迁「设置/运维」语义 |
| HD-7 | 2026-10-26 | **批准本 FS**（`Draft` → `Approved`），§8 六项 OQ 全部采纳推荐值 |
| HD-8 | 2026-10-26 | 健康表排序采用「有事的在上」（待办 → 偏离 → 到期 → `createdAt` 倒序）。**本项为追求可执行性由 Orchestrator 在起草时按推荐定，未经单独裁决**；若偏好固定顺序（CN-稳钱 / CN-长钱 / CA-长钱），改 B10 一处比较函数即可 |
| HD-9 | 2026-10-26 | **再平衡提醒的详情归组合域，不落日志频道**（日志频道写死"只读排障、永不放执行动作"）；提醒点击必须带 `?record=` 精确落点，**并入本 FS 的 A 单元（A16），不新开任务**。与 [FS-cron-worker-status-board](./FS-cron-worker-status-board.md) 的 OQ6 / OQ7 / OQ8 同批裁决 |
| **HD-10** | 2026-10-26 | **健康表「偏离」列保留 N**（`OQ-A`）。`B3` 增 `drift.overThresholdCount`；`B8` 改为「N 项超阈」；**`B8a` 作废**；`R-7` 关闭。起因：原型审查发现「不带 N」这条为回避量纲而牺牲了信息量，正解是补对字段 |
| **HD-11** | 2026-10-26 | **详情 Header 去掉「再平衡」按钮、保留「设置目标」**（`OQ-B`）。实码 Header 本来就没有「再平衡」按钮（只有 编辑 / 添加交易）→ 删它对代码零影响；但「设置目标」实码也没有 → **新增 `A17`**（跳 `PortfolioForm` 目标区，`NG-9` 不变），AC40 锁定 Header 恰 4 个动作 |
| **HD-12** | 2026-10-26 | **原型与需求的所有偏差一次性全改，不分批**（`OQ-C`）。清单见 [TASK-059](../../tasks/active/TASK-059-prototype-alignment-portfolio-ia.md)（29 项 U + 9 项 D；其中 D 组已于同日回写完毕） |
| **HD-13** | 2026-10-26 | **组合列表卡新增四格（总市值 / 持仓资产 / 待办 / 上次再平衡）纳入本期**（`OQ-D` → `B15`）。理由：数据已在 `usePortfolios()` 的 `stats` 上（零新增请求），且卡片与健康表若口径分裂，正是本线要消灭的形态 |
| **HD-14** | 2026-10-26 | **删除组合后，其全部提醒事件「全部隐藏」**（`OQ-E` → `B16`）：查询层过滤、三处出口同源、**库里保留不物理删除**；资产级（`portfolioId=null`）事件必须保留。同时确定「Ardot 管视觉 / Web 原型管行为」的双标尺（见 §9） |

---

## Appendix A — 现状代码事实（2026-10-26 核实）

| 事实 | 落点 |
|---|---|
| 详情 Tab 仅 4 个：`positions / position-history / rebalance / transactions`，`DEFAULT_TAB = 'positions'` | `client/src/pages/Portfolio/Detail.jsx:15` |
| 再平衡 Tab 内 3 子 Tab，状态 `useState('suggestions')`（不可深链） | `client/src/pages/Portfolio/Rebalance.jsx:12-14, 18` |
| `PORTFOLIO_VIEW` 返回 `/portfolios/view/:id/basic`；`basic` 不在 `TABS` → 二次 redirect | `client/src/constants/routes.js:29` |
| Header 读 `portfolio.lastRebalanceAt`；**模型无此字段** | `PortfolioHeader.jsx:37`；`shared/models/portfolio.js`（字段：`name/description/type/currency/accountType/archived/targets/rebalanceSettings/createdAt`） |
| 「今日盈亏」硬编码 `'—'`；货币格式器硬编码 `currency: 'USD'` | `KpiCards.jsx:48`、`:11-16` |
| `deletePortfolio` 仅被零引用页面引用 | `Basic.jsx:6,24`；`Basic.jsx`/`TargetAllocation.jsx` 无路由/无 Tab 引用 |
| `buildPortfolioSummary` 入参含 `lastExecutedAt` 并传给 `evaluateThresholds`，**返回值只有 `{positionCount, marketValueByCurrency, drift}`** | `shared/services/portfolio/summary.js` |
| `DRIFT_THRESHOLDS` 过滤 → `drift` 不含 `timeInterval` | 同上 |
| `computeSummary` 已查每组合最近一条 `EXECUTED` 记录（`lastExecuted.executedAt`），仅未回传 | 同上 |
| `evaluateThresholds` 返回 `{needsRebalance, triggeredThresholds, totalValue, details[{symbol,targetRatio,currentRatio,absoluteDeviation,relativeDeviation,triggeredThresholds}], reasons}` | `shared/services/rebalance/thresholdChecker.js:17-76` |
| `checkThresholds` 对大类目标先聚合伪持仓再评估（总览可直接复用） | 同上 `:78-102` |
| `computeActualRatios` 只返回 `{symbol, currency, ratio}`，**不含 target** | `shared/services/portfolio/actualRatios.js` |
| `deletePortfolioCascade` 返回 `deletedTransactions/deletedRebalanceRecords`，但为**删除后**计数 | `shared/services/portfolio/deletePortfolio.js` |
| `deletePortfolioCascade` **只删** `Transaction` + `RebalanceRecord`，**不删 `AlertEvent`** → 删组合后事件 `portfolioId` 悬空 | `deletePortfolio.js:11-12`（`R-9` / `B16` 的直接依据） |
| Header 只有两个按钮：「编辑」→ `PORTFOLIO_EDIT`、「添加交易」→ `transactions` Tab；**无**「设置目标」、**无**「再平衡」 | `PortfolioHeader.jsx:94-125`（`A17` / `HD-11` 的依据） |
| 列表页 `usePortfolios()` 打的是 **`/portfolios/summary`**（`queryKey: ['portfolios-summary']`），不是 `/portfolios` → `stats` 已在首屏可用，`B15` 零新增请求 | `client/src/hooks/usePortfolios.js:20`、`services/portfolio.service.js:9` |
| `PortfolioCard` 只有「偏离阈值」徽标，**没有**总市值/持仓资产/待办/上次再平衡四格 | `PortfolioCard/index.jsx:36`（`B15` 的新增范围） |
| Dashboard 页头有「立即评估」「规则管理」两个按钮（**无**「同步汇率」）；「待处理提醒」是 `h2` + 筛选栏，不是卡片 | `Dashboard.jsx:95-104`、`:109` |
| Dashboard 已在用 `usePortfolios()`（组合筛选下拉），健康表可复用同一缓存 | `client/src/pages/Dashboard.jsx:76` |
| `familySummary.buckets` 形如 `{ CNY: { amount, cnyValue, rate }, ... }` | `shared/services/familySummary.service.js` |
| 再平衡提醒事件已写入 `snapshot: { recordId, suggestionsCount }`，**前端零引用** → 缺 `?record=` 锚点，不缺页面 | `shared/services/alertCenter.service.js:33-46` |
| 提醒点击落点：有 `symbol` 跳行情历史，否则跳 `/portfolios/view/:id/rebalance`（不带锚点） | `client/src/pages/Dashboard.jsx` `EventCard.handleJump` |
| `getHistory` 返回**完整** `RebalanceRecord`（含 `suggestions` / `triggeredThresholds` / `warnings` / `status`），故 A16 零新增请求；无单条记录路由 | `shared/services/rebalance/recorder.js:25-36` |
| `RebalanceHistory` 已显示 `rec._id` 一列，`#Suggestions` 只显示条数、不能展开明细 | `client/src/pages/Portfolio/RebalanceHistory.jsx:76-92` |
| `TotalAssetsCard` 已含 `totalCny / asOf / 折算不完整`，含加载/错误隔离 | `client/src/components/Household/TotalAssetsCard.jsx` |
| 组合列表页容量：家庭汇总 4 块 + 组合列表 + 汇率面板 | `/portfolios`（TASK-050 产物） |

---

## Appendix B — 文档同步清单（本次已随 FS 一并完成）

| 文件 | 改动 |
|---|---|
| `product/lines/PL-3-portfolio.md` | `CM-09/10` 归属回本线；`CM-13` 判定升级为「强化」并指向本 FS；`CM-19` 补「入口不可达」事实；`CM-12` 补「到期不可见」；§6.3 补 `lastExecutedAt` / `pendingRebalanceCount` / `dueByTime` 与语义区分；§7 补 3 条缺口 |
| `product/lines/PL-4-rebalancing.md` | 功能编码 `RB-01~12`；新增 `RB-12 再平衡通知（异步投递）`；M4.1 移除 `CM-09/10`（改为交叉引用）；§7 补「通知无归属」「子 Tab 不可深链」 |
| `product/lines/PL-5-alerting.md` | §1 补「本线是通道，再平衡通知由 PL-4 写入（`ruleId=null`）」；§4 `AL-07` 注记；§7 补 Non-goal 说明 |
| `product/specs/PRD.md` | `CM-13` Tab 数量与实码对账（4 → 目标态 5）；`CM-09/10/12/19` 备注补注记；§6 更新记录加一行 |
| `readme.md` | 产品 FS 索引新增本文件 |
| `product/PRODUCT_LINES.md` | PL-3 / PL-4 的功能编码范围与模块名同步（PL-4 增 `M4.5`，模块数 4→5、功能点 15→16） |
| `product/lines/PL-0-platform-foundation.md` | §编码索引：`CM` 全归 PL-3（注明 09/10 为声明）、`RB` 范围 `RB-01~12` |
| `product/specs/FS-cron-worker-status-board.md` | 反向对齐：`OQ6` 只读硬约束 / `OQ7` 提醒详情不落日志 / `OQ8` 独立子路由；C-07 的「去组合」链接指向 `A16` 的参数契约 |

### B-2 第二轮同步（2026-10-26 22:40，按 `HD-10`~`HD-14`）

| 文件 | 改动 |
|---|---|
| 本文件 | `B3` 增 `overThresholdCount`；`B8` 改「N 项超阈」；**`B8a` 作废**；新增 `A17`（设置目标按钮）/ `B15`（组合卡四格）/ `B16`（删组合后事件隐藏）；`A9` 补「归档」、`A10` 纠正数据源（`GET /:id` 无该字段，改用 `usePortfolios()` 的 `stats`）并登记**第三消费方**；`AC13/20/23/26` 重写；新增 `AC40/41/42`；`R-7` 关闭、新增 `R-9/R-10`；§4.1 四态表与 §4.3 线框图补正（去掉不存在的「同步汇率」）；§9 补双标尺；§11 补 `HD-10`~`HD-14`；Appendix A 补 6 条实码事实 |
| `product/lines/PL-3-portfolio.md` | §6.3 字段表由三字段扩为**四字段**（加 `drift.overThresholdCount`，注明 N 是标的数、与「已到期 N 天」的天数不可混用）；§6.3「同名不同义」约定补一句「文案里的 N 一律取 `overThresholdCount`，不用 `triggeredThresholds.length`」 |
| `tasks/active/TASK-059-prototype-alignment-portfolio-ia.md` | 原型整改清单（29 项 U + 9 项 D）作为本 FS 的**行为比对标尺**；本轮只更新需求，原型改动由该卡执行 |
