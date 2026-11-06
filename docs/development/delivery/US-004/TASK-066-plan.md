# TASK-066 — US-004 实施计划

## Status

Status：Approved（2026-11-06，Human 确认已批准当前设计）

Owner：Planner（规划）→ Implementer B（2026-11-06 指派）

Related Task：[TASK-066](./TASK-066.md)；所属 [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md)。

Approval：**2026-11-06，Human 明确确认「我已经批准了」**（Orchestrator 会话核对时本文件仍为 `Draft`、无 Approval 段；经 Human 当面确认后由 Orchestrator 据其决定登记，**不是自行批准**）。批准覆盖本文件 §1～§9 当前设计，不含其他任务。此登记不改变设计内容。

Branch / Base：实施时从 up-to-date `main` 新建 `feature/TASK-066` 独立 worktree。规划期基线为 2026-11-05 的 `main`；目标文件 `client/src/pages/Dashboard.jsx`、`client/src/components/Household/TotalAssetsCard.jsx`、`client/src/hooks/usePortfolios.js` 已亲读核实（见 §3）。

Approval：**未批准**。本计划覆盖 §1～§9 当前设计；`Draft → Approved` 归 Human（[STATES.md](../../../os/process/STATES.md) §4）。注意：本卡 Task 卡原标注「免计划」，因 Human 明确要求「逐一为每个 task 编写 execplan」，本计划据此编制（Human 直接指令优先，见 Task §7 免计划依据的历史标注仍保留于卡，此处以计划为实施依据）。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task [TASK-066](./TASK-066.md) 的 §3；覆盖 US-004/AC-05～AC-13。本卡做两件事：① Dashboard 在总资产卡与「待处理提醒」之间插入「组合健康」区块（5 列 3 行）；② 总资产卡内加一行分币种小计。纯客户端，零新增请求（复用 `usePortfolios()` 同一 `queryKey`）。

## 2. Context

需求、任务见 [Story US-004 §3](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) 与 [FS §4.3、§6.2 B6～B13、§10 R-5](../../requirements/specs/FS-portfolio-ia-cleanup.md)。

关键约束：
- **零新增请求**：复用 `usePortfolios()`（`queryKey: ['portfolios-summary']`，与列表页同缓存）。
- **同源**：健康表「偏离/待办」数据全部取 `stats`，与 TASK-067（组合卡四格）同源，文案逐字一致。
- **OQ-01 已裁（2026-11-05 Human）**：排序「有事的在上」= `待办数>0 → needsRebalance（超阈）→ dueByTime（到期）→ createdAt 倒序兜底`；原型多加的 `unvaluable`/`missing` 两档**不采用**。
- **局部错误隔离**：`summary` 失败时健康表局部错误态，总资产卡与提醒列表照常（R-3/AC-06）。

## 3. Repository Findings（2026-11-05 亲读 `main`，行号为现状）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | Dashboard 已在用 `usePortfolios()`（`:76`），`queryKey:['portfolios-summary']` 与列表页同缓存 | `client/src/pages/Dashboard.jsx:76`、`client/src/hooks/usePortfolios.js:20` |
| F-02 | 页面结构：`TotalAssetsCard`（`:109`）→「待处理提醒」`h2`（`:112`）→ 筛选栏 → 事件列表 | `client/src/pages/Dashboard.jsx:108-146` |
| F-03 | `TotalAssetsCard` 用 `useFamilySummary()`（`queryKey:['family-summary']`），`data.buckets` 形如 `{CNY:{amount,cnyValue,rate},...}` | `client/src/components/Household/TotalAssetsCard.jsx:16`、`shared/services/familySummary.service.js:47-93` |
| F-04 | `usePortfolios` 返回 `data`（数组，`:19`），Dashboard 已解构 `data: portfolios = []` | `client/src/hooks/usePortfolios.js:19`、`Dashboard.jsx:76` |
| F-05 | 健康表四态取值优先级、排序、列定义见 Spec §4.3 | `FS-portfolio-ia-cleanup.md` §4.3 |

## 4. Proposed Design

1. **新增组件 `client/src/components/Dashboard/PortfolioHealthTable.jsx`**（自管 loading / 局部 error / empty）：
   - 输入 `portfolios`（`usePortfolios()` 的 `data`，含 `stats`）。
   - 5 列：组合 / 市值 / 偏离 / 待办 / 上次再平衡。
   - 「偏离」四态取值优先级（OQ-01 已裁）：
     - `needsRebalance === true` → 「N 项超阈」（N = `drift.overThresholdCount`）；
     - 否则 `dueByTime === true` → 「已到期（N 天）」（N = `lastExecutedAt` 距今天数；`lastExecutedAt === null` → 「从未执行过再平衡」）；
     - 否则 `targets` 为空 → 「未设目标」；
     - 否则「正常」。
     - 两个 N 量纲不同，文案必须带单位词「项」/「天」。
   - 「待办」：`pendingRebalanceCount > 0` → 徽标「N 条待确认」→ 跳 `/portfolios/view/:id/rebalance?sub=suggestions`；`unreadAlertCount > 0` → 徽标「N 条未读」→ 跳 `/` 并设 `portfolioFilter`；皆 0 → 「—」。
   - 「上次再平衡」：`stats.lastExecutedAt` → `YYYY-MM-DD`，`null` → 「从未」。
   - 排序（全序，不抖动）：`待办数>0` → `needsRebalance` → `dueByTime` → `createdAt` 倒序。
   - 行可点整行跳 `/portfolios/view/:id/overview`，键盘可达（`tabIndex`+`Enter`）；徽标 `stopPropagation`。
   - 空态：0 组合 → 「暂无组合，先创建一个」+「新建组合」按钮（不出现只有表头的空表格）。
   - 局部错误态：`summary` 失败时本组件显示 `ErrorState`，不向上抛。

2. **`Dashboard.jsx`**：
   - 在 `TotalAssetsCard`（`:109`）与「待处理提醒」`h2`（`:112`）之间插入 `<PortfolioHealthTable portfolios={portfolios} />`。
   - 组合筛选状态 `portfolioFilter` 需能被健康表「N 条未读」徽标调用（把 `setPortfolioFilter` 传入或通过跳转 `navigate('/?portfolio=<id>')` + 初始化读取；实施时选简单可靠方案，保持提醒区行为不变）。

3. **`TotalAssetsCard.jsx`**：
   - 在总资产金额与「数据时点」之间加一行分币种小计：按 `data.buckets` 逐币种显示 `{符号}{金额}`，`null` 桶显示「—」，币种顺序固定 `CNY → USD → CAD → HKD`，其余字母序追加；无数据时该行整体不渲染。
   - 符号口径与 `priceDisplay.formatMoney` 一致（`¥` / `US$` / `CA$` / `HK$`，HKD 需确认既有符号常量）。

4. **零改动红线**：不改 `shared/`、`server/`、`cron-worker/`；不改提醒区逻辑（AC-08）；不改 `PortfolioCard` 徽标 `drift.needsRebalance` 语义。

## 5. Work Breakdown

- [ ] W1：新增 `PortfolioHealthTable` 组件（骨架 + 5 列 + 四态偏离 + 待办 + 上次再平衡 + 排序）。
- [ ] W2：接入 `Dashboard.jsx`（插槽 + 组合筛选联动）。
- [ ] W3：`TotalAssetsCard` 加分币种小计一行。
- [ ] W4：测试/验证（§7）：四态各一条（含负向对照）、全序稳定、局部错误态、币种顺序与 `null` 桶、空态。
- [ ] W5：`npm run build --workspace client` + `npm run lint --workspace client`（或 eslint）。

## 6. Decisions

| 项 | 结果 | 依据 |
|---|---|---|
| 排序档位 | 「有事的在上」= 待办→超阈→到期→`createdAt` 倒序；不采用原型 `unvaluable`/`missing` | OQ-01 已裁（2026-11-05 Human） |
| 与 US-003 顺序 | 无硬依赖；`?sub=suggestions` 未落地时落到默认子 Tab（行为等价）；本 Story 先行 | OQ-02 已裁（2026-11-05 Human） |
| 共享常量归属 | 本卡（Implementer B）拥有 `driftLabels.js`，TASK-067 消费 | D-02 已裁（2026-11-06 Human） |

无待 Human 新决事项。

## 7. Verification

| Task AC | 验证方法 | 预期结果 |
|---|---|---|
| AC-01（区块位置 + 零请求） | 浏览器 Network 对比改动前基线 | 区块在总资产卡与提醒之间；portfolios 请求数不变 |
| AC-02（四态偏离） | 构造四种数据 + 负向对照 | ①「N 项超阈」N=overThresholdCount（2 阈值覆盖 1 标的 → 「1 项超阈」）；②「已到期（N 天）」；③「正常」；④「未设目标」 |
| AC-03（待办跳转 + 不触发整行） | 点击徽标 | 落点正确，`stopPropagation` 生效 |
| AC-04（全序） | 构造 A(2 待办)/B(仅超阈)/C(正常)，刷新 | 顺序 A→B→C 稳定 |
| AC-05（归档/空态） | 构造 `archived:true` 组合 + 0 组合 | 归档不出现（负向对照 `/portfolios` 可见）；空态 + 新建按钮 |
| AC-06（局部错误） | `route.abort()` 模拟 summary 失败 | 健康表错误态，总资产卡与提醒列表正常 |
| AC-07（分币种小计） | 构造 buckets | 顺序 CNY→USD→CAD→HKD；null 桶「—」；无数据不渲染 |
| AC-08（提醒区不变） | 回归筛选/已读/忽略/立即评估/规则管理 | 行为与改动前一致 |
| AC-09（构建） | `npm run build --workspace client` + eslint | exit 0 / 0 error |
| AC-10（视口不滚动） | 1440×900 视口打开 Dashboard（浏览器实测，不留像素锁死） | 总资产金额、分币种小计一行、健康表 3 行**不滚动可见**（对应 Story AC-05，G-2 缺口补） |

命令入口见 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md)。**不写测试数量**。

## 8. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 同源分裂：与 TASK-067 各算一套偏离/待办 | 数据全取 `stats`；与 TASK-067 文案逐字一致（AC-18 属 067，但文案常量建议共享或约定一致） |
| R-2 | 排序抖动：比较函数非全序 | `createdAt` 倒序兜底；AC-04 构造断言稳定 |
| R-3 | 局部错误隔离失败：summary 失败整页白屏 | 组件内 catch；AC-06 |

## 9. Rollback

纯客户端改动，回退 = `git revert` 该次提交，无数据/迁移影响。前端构建产物随部署回滚。

## 10. Implementer Handoff

- **输入**：本计划 §4 + [TASK-066](./TASK-066.md) §3 AC + [FS §4.3](../../requirements/specs/FS-portfolio-ia-cleanup.md)。
- **范围与禁改**：只改 `client/`（`Dashboard.jsx`、`TotalAssetsCard.jsx`、新增 `PortfolioHealthTable.jsx`）；**禁改** `shared`/`server`/`cron-worker`、提醒区逻辑。
- **授权**：须 Human 批准本计划后实施。
- **依赖**：前置 TASK-065（四字段）——可用「字段缺失降级」先做骨架，验收需真实字段。
- **预期产出**：健康表 + 分币种小计 + 测试通过。
- **停止条件**：若 OQ-01 排序语义与 §6 不符，停下上报。
- **验证入口**：`npm run build --workspace client` + eslint。

## 11. Implementation Record

（实施时填写。）

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
