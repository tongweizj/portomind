# US-004：Dashboard 组合健康表——首屏回答「哪个账户该先动」

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| Story ID | US-004 |
| Status | Planning |
| 准备情况 | 5 卡已拆（TASK-065～069）；OQ-01/02/04/05 已裁决、G-1/G-2 覆盖缺口已闭合。当前 065/066/067/068 `Completed` 且**均已合入 `main`**、069 `Planning`（计划 `Draft` 待批准）；Story 状态仍 `Planning`（推进归 PM） |
| 产品负责人 | PM；方向、优先级、范围变更与关闭由 Human 决定 |
| 优先级 | High（Roadmap 第 6 条「dashboard 增加组合健康表」的实体；`FS-portfolio-ia-cleanup` 交付单元 B） |
| 创建日期 | 2026-11-05 |
| 最近更新 | 2026-11-06 |
| 交付目录 | docs/development/delivery/US-004/（启动时建立） |
| 需求来源 | Human 2026-11-05 指示整理 `specs/` 遗留需求；本 Story 承接 [FS-portfolio-ia-cleanup](../../specs/FS-portfolio-ia-cleanup.md) **交付单元 B**（B1～B16） |

> 状态、转换权限与取消处理唯一依据 [STATES.md](../../../../os/process/STATES.md) §2.2–§4；本卡 Status 为权威，目录不决定状态。
>
> **状态依据（2026-11-05，PM）**：按 [DOCS.md §1.1](../../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期) 与 [STATES.md §2.2](../../../../os/process/STATES.md#22-story-状态) 的预研规则，Story 可由 PM 登记为 `Planning`——该态允许「拆 Task、写 ExecPlan、写提示词等前期准备」，**不进入实施**。本 Story 属此类：US-001 为当前 Story（`Implementing`），US-004 为那唯一的预研 Story。登记依据为 PM 权限（[STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态)：Story → Backlog / Planning 归 PM），不需 Human 批准；但**进入实施**（`Implementing`）仍须 Human 决定并经 Orchestrator 登记 Task 状态。

## 2. 用户问题与价值

**用户与场景：** 家庭管理者。早上打开应用，想知道家里怎么样、有没有要他动手的事。

**当前问题：** 首屏只有「总资产卡 + 提醒事件列表」。总资产回答「我家多少钱」，提醒列表回答「有什么事」，但**没有任何东西回答「哪个账户不对劲、该先动哪个」**。三个组合（CN-稳钱 / CN-长钱 / CA-长钱）的市值、偏离、待办、上次再平衡，全部得再点一次进 `/portfolios` 才能拼出来。而 `PortfolioCard` 上的「偏离阈值」徽标点进去，还要再切 Tab 才看得到解释（由 US-003 解决详情侧）。

**用户故事：** 作为家庭管理者，我希望打开应用 30 秒内看到一张「组合健康」表，一眼看出哪个组合有钱、有没有事、上次什么时候动过，以便决定今天要不要处理、先处理哪一个。

**交付后的改善：** 首屏从「一个总数 + 一堆提醒」变成「一个总数 + 每个账户的状态 + 排序后的待办」。有事的组合排在上面。总资产卡下方多了分币种小计，不用再心算。从健康表一行可以直接跳到该组合的总览或待确认建议。

## 3. 本次范围与产品规则

### 本次交付

- **`GET /api/portfolios/summary` 补三个字段**（**不新增端点、不改路径**）：
  - `stats.lastExecutedAt`（`Date | null`，入参已有，仅需回传）
  - `stats.pendingRebalanceCount`（该组合 `PENDING` 的 `RebalanceRecord` 条数，**必须**一次 `$match + $group` 批量取，禁止逐组合 `countDocuments`）
  - `drift.dueByTime`（布尔）与 `drift.overThresholdCount`（整数，= `details` 中 `triggeredThresholds` 非空的 **symbol 数**）
- **Dashboard「组合健康」区块**：5 列 3 行（组合 / 市值 / 偏离 / 待办 / 上次再平衡），位于总资产卡与「待处理提醒」之间；数据源复用既有 `usePortfolios()`（同一 `queryKey`，零新增请求）。
- **总资产卡分币种小计**：按 `buckets` 逐币种显示，`null` 桶显示「—」，币种顺序固定 `CNY → USD → CAD → HKD`。
- **`PortfolioCard` 新增四格**（总市值 / 持仓资产 / 待办 / 上次再平衡），零新增请求、零服务端改动，口径必须与健康表同源。
- **删除组合后其提醒事件在查询层隐藏**（不删数据、不加字段、不写迁移）。

### 范围外事项

- 组合详情「总览」Tab、删除入口、`?record=` 落点——归 **US-003**。
- 家庭资产趋势图、组合市值迷你趋势（无快照模型，Spec NG-1）。
- 把再平衡通知纳入 `AlertRule`（Spec NG-2，两套触发源会互相打架）。
- `PortfolioCard` 徽标改按 `dueByTime` 显示「待再平衡」（P1-1，需同步改 PL-3 `CM-12`）。
- 汇率面板迁出 `/portfolios`（Spec NG-4，单独处理）。

### 必要规则与约束

- **`drift.needsRebalance` 与 `drift.triggeredThresholds` 的既有语义不变**——仍仅含绝对 / 相对偏离。卡片徽标依赖它，改名或扩义会连带改动 PL-3 `CM-12`。新增语义放在新字段 `dueByTime` 上。
- **两个 N 不可混用**：「N 项超阈」的 N = `overThresholdCount`（**标的数**）；「已到期（N 天）」的 N = 距上次再平衡**天数**。文案必须带单位词（「项」/「天」）。历史上把 `triggeredThresholds.length` 当标的数用，正是 Spec 中 `B8a` 作废的原因。
- **禁止 N+1**：`pendingRebalanceCount` 不得在 `portfolios.map` 内逐组合查询；`overThresholdCount` 不得逐组合复算。判定方式是代码审查 + 在 10 个组合的构造数据上断言查询次数，**不得**用「跑得快」判定。
- **健康表与组合卡必须同源**：两处「偏离 / 待办」若各算一套，会出现「卡片说正常、表说 2 项超阈」。同一组合在两处的文案必须**逐字一致**。
- **已归档组合不出现**在健康表（沿用 `archived: {$ne: true}`）。
- **`summary` 失败不得整页白屏**：健康表显示局部错误态，总资产卡与提醒列表照常渲染。
- **删除组合后的事件处理是「隐藏」不是「删除」**：库里保留（审计价值），仅查询不可见；**资产级事件（`portfolioId = null`）必须保留**。三处出口（`GET /alerts/events` 列表、`summary` 的 `unreadAlertCount`、Dashboard 未读计数）口径必须一致，**禁止**只在客户端过滤。

### 相关资料

- Spec：[FS-portfolio-ia-cleanup.md](../../specs/FS-portfolio-ia-cleanup.md) —— §4.3（Dashboard）、§5（US-5、US-6）、§6.2（B1～B16）、§7 交付单元 B 的 AC20～AC36 / AC41～AC42、§10（R-1、R-5、R-9、R-10）、§11（HD-4/8/10/13/14）
- 行为标尺：[portomind-prototype.html](../../../prototypes/2.0/portomind-prototype.html) —— `vDashboard()` 的「组合健康」区块、`driftOf()` / `driftChipHTML()`、健康表全序排序实现
- 关联 Story：[US-003](./US-003-portfolio-detail-overview-ia.md)（B1 提供其 AC-16 所需字段；其 AC-11 提供本 Story「待办」列跳转目标）
- 现行契约：[API_CONTRACT.md](../../../../handbook/technical/API_CONTRACT.md) 的 `GET /api/portfolios/summary`
- 提示词存档：[US-004-prompts.md](../../../delivery/US-004/US-004-prompts.md) —— 本 Story 全程使用的 Agent 提示词集中存档（Planner 拆分提示词等）

## 4. 验收条件

| 编号 | 前提 / 场景 | 用户动作或触发事件 | 可观察的预期结果 |
|---|---|---|---|
| AC-01 | 调用 `GET /api/portfolios/summary` | 检查响应 | 每项 `stats` 含 `lastExecutedAt`（无记录为 `null`）与 `pendingRebalanceCount`（整数，默认 0）；`drift` 含 `dueByTime`（布尔）与 `overThresholdCount`（整数；`drift === null` 时不可读） |
| AC-02 | 某组合仅时间维度触发 | 检查响应 | `drift.needsRebalance === false`、`drift.triggeredThresholds === []`，而 `dueByTime === true` —— 三项同断言，证明既有语义未被扩义 |
| AC-03 | 某组合有 2 条 `PENDING` 记录 | 检查响应 | `pendingRebalanceCount === 2`；`EXECUTED` / `REVOKED` 不计入 |
| AC-04 | 构造 10 个组合的数据 | 检查查询次数 | `RebalanceRecord` 查询次数 ≤ 11 且 `countDocuments` 调用次数 = 0（禁止新增第二类 N+1；不得靠耗时判定） |
| AC-05 | 1440×900 视口 | 打开 Dashboard | 不滚动即可见：总资产金额、分币种小计一行、健康表 3 行 |
| AC-06 | 同一次 `family-summary` 缓存 | 对比分币种小计与 `/portfolios` 的币种分桶 | 同一数据源显示一致；`null` 桶显示「—」 |
| AC-07 | 构造四种偏离状态 | 查看健康表「偏离」列 | ① 仅超阈 →「N 项超阈」且 N = `overThresholdCount`（构造 2 个标的超阈 → 「2 项超阈」；**负向对照**：`triggeredThresholds.length === 2` 但只覆盖 1 个标的时须显示「1 项超阈」）；② 仅 `dueByTime` →「已到期（N 天）」且 N = 距今天数；③ 皆无 →「正常」；④ 无目标 →「未设目标」 |
| AC-08 | 健康表某行有待办 | 点击「N 条待确认」/「N 条未读」 | 分别落到 `/portfolios/view/:id/rebalance?sub=suggestions` 与 `/` 且组合筛选 = 该 `portfolioId`；点徽标**不**触发整行跳转 |
| AC-09 | 构造 3 个组合（A 有 2 条待确认 / B 仅超阈 / C 正常） | 查看渲染顺序 | 顺序为 A → B → C；再次刷新后顺序不变 |
| AC-10 | 存在 `archived: true` 的组合 | 查看健康表 | 该组合不出现。负向对照：`includeArchived` 打开时 `/portfolios` 能看到它 |
| AC-11 | `summary` 请求失败（`route.abort()`） | 打开 Dashboard | 健康表显示局部错误态，总资产卡与提醒列表**仍正常渲染**（不整页白屏、不整页错误） |
| AC-12 | 0 个组合 | 打开 Dashboard | 健康表显示空态与「新建组合」按钮，不出现只有表头的空表格 |
| AC-13 | 提醒区已有功能 | 操作筛选、标记已读、忽略、立即评估、规则管理 | 行为与改动前一致（逻辑零改动） |
| AC-14 | 交付完成 | 检查改动范围 | `git status cron-worker` 空输出（本单元不涉及调度进程） |
| AC-15 | 服务端改动 | 运行测试 | 覆盖 B1/B2/B3 三条字段（含 AC-02、AC-03 的边界），`npm test` 全绿 |
| AC-16 | 交付完成 | 检查文档 | `API_CONTRACT.md` 的 summary 响应示例已更新；Spec 状态行与 §11 记录一致 |
| AC-17 | 进入 `/portfolios` | 观察 Network | portfolios 相关请求数不变（对比改动前基线）；组合卡四格全部呈现；「上次再平衡」无值显示「从未」；「待办」为 0 显示「—」 |
| AC-18 | 同一组合同时出现在组合卡与健康表 | 比对两处文案 | 「偏离」文案**逐字一致**（证明两处同源，未各算一套） |
| AC-19 | 组合 A 有 3 条未读事件 + 1 个资产级（`portfolioId=null`）未读事件 | 删除组合 A 后检查三处 | ① `GET /alerts/events` 不再返回那 3 条、**仍返回**资产级 1 条；② `summary` 中其它组合的 `unreadAlertCount` 不变、全站未读计数减 3；③ 库里那 3 条 `AlertEvent` **仍存在**（`countDocuments` 校验，证明是「隐藏」而非删除）；④ 负向对照：未删除时三处计数一致 |
| AC-20 | 交付完成 | 独立复核 | 由独立 Reviewer 复核通过，不由 Implementer 自判 |

## 5. 依赖、假设与待决策事项

| 编号 | 类型 | 内容及影响 | 负责角色 | 解决 / 解除条件 | 当前结论及依据 |
|---|---|---|---|---|---|
| DEP-01 | 依赖 | AC-08 的「N 条待确认」跳转目标 `?sub=suggestions` 由 US-003 的 AC-11 落地 | PM | 顺序协调 | Spec §9：A 未落地时该链接仍可用，只是落到默认子 Tab |
| DEP-02 | 依赖 | 本 Story 的 B1 提供 US-003 的 AC-16 所需字段 | PM / Planner | 顺序协调 | 若本 Story 先做，US-003 的 Chip 无需临时隐藏 |
| DEP-03 | 依赖 | `TASK-050` 已完成并合入 `main`（`cafcc5d`，PR #35），`/portfolios` 五区块布局落定 | Orchestrator | 已满足 | Spec §10 D-1 已记 ✅；B6 可随时启动 |
| DEP-04 | 依赖 | 本单元改 `shared/services/portfolio/summary.js` + 服务端契约 + `alertEvent` 查询层，属共享内核与服务端改动 | Planner | 实施前须有 `Approved` ExecPlan | 按 [EXECUTION_PLANS.md](../../../../os/process/EXECUTION_PLANS.md) §2，多模块 + 契约变更通常需要 |
| OQ-01 | 已裁决 | 健康表排序规则：Spec 写的是「有事的在上」（HD-8 由 Orchestrator 起草时按推荐定，**未经单独裁决**）；原型实现多加了 `unvaluable` / `missing` 两档 | Human | 确认排序档位 | ✅ 已裁决（2026-11-05 Human，2026-11-05 PM 经 Human 复核确认）：**有事的在上**（待办→超阈→到期→`createdAt` 倒序），原型多加的 `unvaluable`/`missing` 两档**不采用** |
| OQ-02 | 已裁决 | 本 Story 与 US-003 的实施顺序（同 US-003 的 OQ-01） | Human | 给出顺序决定 | ✅ 已裁决（2026-11-05 Human，2026-11-05 PM 经 Human 复核确认）：二者**无硬依赖**，US-003 未排期不阻塞本 Story；**本 Story 可先行**。US-004「待办」跳转 `?sub=suggestions` 在 US-003 AC-11 落地前落到默认子 Tab（行为等价） |
| OQ-03 | 假设 | 组合卡的「市值」实现为单币种简化（原型标注「市值单币种简化」），不跨币种合计 | PM / Planner | 实施时确认 | 符合产品硬约束「货币换算只发生在家庭层」；健康表市值列同样按组合本币显示 |
| OQ-04 | 已裁决 | AC-18「偏离文案逐字一致」口径（D-01）：卡片 `DriftBadge` 两态 vs 健康表四态 | Human | 定「逐字一致」边界 | ✅ 已裁决（2026-11-06 Human，**解 B**）：逐字一致只约束「待办/上次再平衡」；卡片偏离徽标维持两态（P1-1），偏离数据同源取 `stats.drift` |
| OQ-05 | 已裁决 | 共享文案常量 `driftLabels.js` 归属（D-02） | Human | 定拥有方 | ✅ 已裁决（2026-11-06 Human）：由 TASK-066（Implementer B）拥有，TASK-067 消费 |

**当前下一步：** 拆分已完成（TASK-065～TASK-069，见 §6）。OQ-01 / OQ-02 均已裁决，**无待决 OQ 阻塞实施**；DEP-04 仍要求 TASK-065 / TASK-068 实施前先出 `Approved` ExecPlan。Task 状态登记与派发归 Orchestrator（[STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态)），PM 不代登记；本 Story 保持 `Planning`（预研），进入实施需 Human 决定。

## 6. 关联 Task 与验收覆盖

已由 Planner 拆分（2026-11-05），5 张卡平铺在 [delivery/US-004/](../../../delivery/US-004/)，编号从 TASK-065 顺延（BOARD 当前最大号为 064）。

| Task | 工作摘要 | 覆盖的验收条件 | 必要性 / 关联说明 |
|---|---|---|---|
| [TASK-065](../../../delivery/US-004/TASK-065.md) | `summary` 四字段（`lastExecutedAt` / `pendingRebalanceCount` / `drift.dueByTime` / `drift.overThresholdCount`）（B1～B4） | AC-01～AC-04、AC-14 | **✅ 已结案（2026-11-06，Human 确认验收通过）**；`Merged`=`6f556aa`（已合入 `main`）；服务端与 `shared` 改动；计划 `Completed` |
| [TASK-066](../../../delivery/US-004/TASK-066.md) | Dashboard 健康表与分币种小计（B6～B13） | AC-05～AC-13 | **✅ 已结案并合入（2026-11-06，Human 确认检验通过）**；独立 Reviewer `Pass with issues`，无 BLOCKER/未决 MAJOR；F-01 MAJOR 由 `353d583` 整改（唯一 UTC `lastRebalanceDateStr`，066/067 共用）；`Merged`=`af1f4d2`（PR #42）；纯客户端，排序按 OQ-01 口径 |
| [TASK-067](../../../delivery/US-004/TASK-067.md) | 组合卡四格（B15） | AC-17、AC-18 | **✅ 已结案并合入（2026-11-06，Human 确认检验通过）**；Reviewer `Pass with issues`，无 BLOCKER/MAJOR；`Merged`=`d95be45`（已合入 `main`）；基线陈旧问题已由 `434a323`/`6f5add2` 刷新闭环 |
| [TASK-068](../../../delivery/US-004/TASK-068.md) | 删组合后事件查询层过滤（B16） | AC-19、AC-14 | **✅ 已结案并合入（2026-11-06）**：首轮 Reviewer `Fail`（F-01 BLOCKER / F-02 MAJOR）→ `3226dd4` 返工（240/240）→ 二审复检 `Pass with issues`（plan §12.11）→ Human 确认完成并合入；`Merged`=`6f0b4df`；三处同源 |
| [TASK-069](../../../delivery/US-004/TASK-069.md) | 契约文档同步（B5） | AC-16 | **🟡 `Implementing`（2026-11-06）**：计划已获 Human 批准（`Draft → Approved`）；硬前置 065+068 已合入；纯文档、零代码，唯一缺口为契约行补 `stats.unreadAlertCount` + 语义校正 |

> AC-20（独立 Reviewer 复核）是整体交付要求，不拆成单独卡。
>
> **覆盖核对（2026-11-05，PM）→ 已由 Planner 补齐（2026-11-06）**：PM 交回的两处 AC 覆盖缺口已闭合，见下：
>
> | 缺口 | 涉及 AC | 原问题 | 处置（2026-11-06 Planner） |
> |---|---|---|---|
> | G-1 | **AC-14**（`git status cron-worker` 空输出） | 无卡列为验收断言 | 已补：TASK-065 新增 AC-06、TASK-068 新增 AC-07，两卡「覆盖的验收条件」字段均加 `AC-14` |
> | G-2 | **AC-05**（1440×900 不滚动可见） | 视口条件实质未覆盖 | 已补：TASK-066 新增 AC-10（1440×900 不滚动可见：总资产金额、分币种小计、健康表 3 行），计划 §7 加验证行 |
>
> 至此 AC-01～AC-19 均有卡承接，AC-20 为整体验收要求。

## 7. 需求变更记录

| 日期 | 变更内容及原因 | 对范围 / AC / Task 的影响 | 决策人及依据 |
|---|---|---|---|
| 2026-11-05 | 首次建卡。原 Spec 于 2026-10-26 `Approved`，但从未拆 Task | — | PM 按 [REQUIREMENTS.md](../../../../os/process/REQUIREMENTS.md) 拆 Story |

## 8. 整体验收记录

| 验收项 | 结论 | 证据链接 / 对应版本 | 问题或豁免依据 |
|---|---|---|---|
| AC-01～AC-04（TASK-065 覆盖） | **已验证（2026-11-06）** | [TASK-065 §12 审查结论](../../../delivery/US-004/TASK-065.md)；Reviewer `Pass with issues`，Human 授权关闭 | 065 已合入 `main`（`6f556aa`） |
| AC-17、AC-18（TASK-067 覆盖） | **已验证（2026-11-06）** | [TASK-067 §12/§13](../../../delivery/US-004/TASK-067.md)；Reviewer `Pass with issues`，无 BLOCKER/MAJOR，Human 确认结案 | `Merged`=`d95be45`（已合入 main） |
| AC-05～AC-13（TASK-066 覆盖） | **已验证（2026-11-06）** | [TASK-066 §12 审查结论](../../../delivery/US-004/TASK-066.md)；Reviewer `Pass with issues`，AC-05～AC-13 逐条满足，`verify066.cjs` 34/34（mock 取证），F-01 MAJOR 已整改复审收敛 | 剩余 MINOR F-02～F-05（mock 取证局限等）记录在案；`Merged`=`af1f4d2`（PR #42） |
| AC-19（TASK-068 覆盖） | **已验证（2026-11-06）** | [TASK-068 §12.11 二审复检](../../../delivery/US-004/TASK-068.md) 与 plan §12.11：`Pass with issues`，F-01/F-02 已整改并经负向对照确认，AC-01～AC-07 全满足；`Merged`=`6f0b4df` | 残余 MINOR F-03/F-05 记录在案，不阻塞 |
| AC-16（TASK-069 覆盖） | 未验证 | 069 `Implementing`（计划已批准，2026-11-06）；硬前置 065+068 已合入 | 无豁免 |
| AC-20（独立 Reviewer 复核） | 部分（065、066、067、068 已独立复核；069 待派发） | 整体交付时再汇总 | 无豁免 |
| 团队完成标准 | 未验证 | [DEFINITION_OF_DONE.md](../../../../os/process/DEFINITION_OF_DONE.md) | 无豁免 |

**验收日期：** 待验收

**验收版本：** 待确认

**验收结论：** 未实施整体验收，未关闭。

**验收责任人：** PM（汇总）→ Human（关闭）

## 9. 关闭与交付记录

| 项目 | 记录 |
|---|---|
| 交付摘要 | 尚未交付 |
| 关闭日期 | 未关闭 |
| 关闭责任人及授权依据 | 待 Human 实际验收与关闭 |
| 相关产品文档同步 | 实施后须更新 `API_CONTRACT.md`、`handbook/ops/SERVER.md` 相关行、PL-3 §6.3 字段表 |
| 过程资料归档 | 待 Story 关闭后按 [DOCS.md §1.1](../../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期) 归档 |
| 遗留事项及去向 | P1-1 徽标改文案、家庭资产趋势（`FAM-01`）、汇率面板归位：均未建 Story |

### 退出 / 恢复记录

| 日期 | 事件（取消 / 恢复） | 原因 | Human 决定引用 | 退出前状态 / 恢复阶段 | 下挂 Task 处置 |
|---|---|---|---|---|---|
| — | 无 | — | — | — | — |
