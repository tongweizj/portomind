# TASK-066 — US-004 实施计划

## Status

Status：Completed（2026-11-06，Task 已 `Completed`；审查 `Pass with issues`、F-01 整改复检通过。计划由 `Approved` 同步为 `Completed`）

Owner：Planner（规划）→ Implementer B（2026-11-06 指派）

Related Task：[TASK-066](./TASK-066.md)；所属 [US-004](../../../requirements/stories/active/US-004-dashboard-portfolio-health.md)。

Approval：**2026-11-06，Human 明确确认「我已经批准了」**（Orchestrator 会话核对时本文件仍为 `Draft`、无 Approval 段；经 Human 当面确认后由 Orchestrator 据其决定登记，**不是自行批准**）。批准覆盖本文件 §1～§9 当前设计，不含其他任务。此登记不改变设计内容。

Branch / Base：实施时从 up-to-date `main` 新建 `feature/TASK-066` 独立 worktree。规划期基线为 2026-11-05 的 `main`；目标文件 `client/src/pages/Dashboard.jsx`、`client/src/components/Household/TotalAssetsCard.jsx`、`client/src/hooks/usePortfolios.js` 已亲读核实（见 §3）。

Approval：**未批准**。本计划覆盖 §1～§9 当前设计；`Draft → Approved` 归 Human（[STATES.md](../../../../os/process/STATES.md) §4）。注意：本卡 Task 卡原标注「免计划」，因 Human 明确要求「逐一为每个 task 编写 execplan」，本计划据此编制（Human 直接指令优先，见 Task §7 免计划依据的历史标注仍保留于卡，此处以计划为实施依据）。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task [TASK-066](./TASK-066.md) 的 §3；覆盖 US-004/AC-05～AC-13。本卡做两件事：① Dashboard 在总资产卡与「待处理提醒」之间插入「组合健康」区块（5 列 3 行）；② 总资产卡内加一行分币种小计。纯客户端，零新增请求（复用 `usePortfolios()` 同一 `queryKey`）。

## 2. Context

需求、任务见 [Story US-004 §3](../../../requirements/stories/active/US-004-dashboard-portfolio-health.md) 与 [FS §4.3、§6.2 B6～B13、§10 R-5](../../../requirements/specs/FS-portfolio-ia-cleanup.md)。

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

命令入口见 [DEPLOYMENT.md §7](../../../../handbook/ops/DEPLOYMENT.md)。**不写测试数量**。

## 8. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 同源分裂：与 TASK-067 各算一套偏离/待办 | 数据全取 `stats`；与 TASK-067 文案逐字一致（AC-18 属 067，但文案常量建议共享或约定一致） |
| R-2 | 排序抖动：比较函数非全序 | `createdAt` 倒序兜底；AC-04 构造断言稳定 |
| R-3 | 局部错误隔离失败：summary 失败整页白屏 | 组件内 catch；AC-06 |

## 9. Rollback

纯客户端改动，回退 = `git revert` 该次提交，无数据/迁移影响。前端构建产物随部署回滚。

## 10. Implementer Handoff

- **输入**：本计划 §4 + [TASK-066](./TASK-066.md) §3 AC + [FS §4.3](../../../requirements/specs/FS-portfolio-ia-cleanup.md)。
- **范围与禁改**：只改 `client/`（`Dashboard.jsx`、`TotalAssetsCard.jsx`、新增 `PortfolioHealthTable.jsx`）；**禁改** `shared`/`server`/`cron-worker`、提醒区逻辑。
- **授权**：须 Human 批准本计划后实施。
- **依赖**：前置 TASK-065（四字段）——可用「字段缺失降级」先做骨架，验收需真实字段。
- **预期产出**：健康表 + 分币种小计 + 测试通过。
- **停止条件**：若 OQ-01 排序语义与 §6 不符，停下上报。
- **验证入口**：`npm run build --workspace client` + eslint。

## 11. Implementation Record

### 11.1 基线与分支

| 项 | 事实 |
|---|---|
| 工作区 | `D:/projects/portomind-066`（独立 worktree，未碰主工作区 / 065 / 067） |
| 初始基线 | `0189c04`；065 合入后 `git rebase main feature/TASK-066` 干净完成 → `4e26dca` on `6f556aa`（无冲突，driftLabels.js 完好） |
| 依赖 | `npm ci`（lockfile 与主工作区逐字节一致）；`playwright-core` 以 `--no-save` 补装用于验收（不在 lockfile、不入库） |
| 工具链 | node v24.20.0 / npm 12.2.1；基线构建 exit 0 / 2438 modules |

### 11.2 改动清单

| 文件 | 类型 | SHA256 |
|---|---|---|
| `client/src/constants/driftLabels.js` | 新增（独立提交 `4e26dca`，D-02 由 066 拥有） | 见 git |
| `client/src/components/Dashboard/PortfolioHealthTable.jsx` | 新增 | 见 git |
| `client/src/pages/Dashboard.jsx` | 修改 | 见 git |
| `client/src/components/Household/TotalAssetsCard.jsx` | 修改 | 见 git |
| `client/scripts/verify066.cjs` | 新增（验收脚本，依赖 playwright-core + 本机 Chrome） | 见 git |

> 说明：SHA256 以提交内容为准，交付时由 `git show` / `sha256sum` 取；此处不写会漂移的硬编码值。

**实现要点**
- 健康表复用 `usePortfolios()` 传入的 `data`（同一 `queryKey: ['portfolios-summary']`），**组件自身零请求**（AC-01）。
- 四态偏离优先级按 FS §6.2 B8：① `drift.needsRebalance` → `DRIFT_STATE_LABELS.overThreshold(drift.overThresholdCount)`；② `drift.dueByTime` → `dueByTime(daysSince(lastExecutedAt))`，`lastExecutedAt===null` → `dueByTimeNever`；③ `targets.length===0` → `noTarget`；④ 其余 `normal`。**N 取 `overThresholdCount`（标的数），不用 `triggeredThresholds.length`**。
- 排序全序：`待办数>0` → `needsRebalance` → `dueByTime` → `createdAt` 倒序（AC-04）。
- 徽标 `stopPropagation`；整行可点 + `tabIndex`/`Enter`（AC-03）。
- 分币种小计：`CNY→USD→CAD→HKD` + 其余字母序，`null` 桶 `—`，无 `buckets` 整行不渲染（AC-07）；复用 `formatMoney`（不自建符号）。
- 提醒区逻辑零改动（AC-08）；只读约束：本卡新增文件无 `useMutation` / 无 `api.post|put|patch|delete`。

### 11.3 验证结果（本轮实跑，2026-11-06）

| 验证 | 命令 / 方式 | 结果 |
|---|---|---|
| AC-01~AC-08、AC-10 | `node client/scripts/verify066.cjs`（真实 Chrome + vite dev + 桩服务） | **29/29 PASS**（EXIT=0） |
| AC-09 构建 | `cd client && npm run build` | **exit 0 / 2440 modules** |
| AC-09 lint | `../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | **0 error / 0 warning（97 文件）** |

**AC 逐条证据**

| AC | 结果 | 关键证据 |
|---|---|---|
| AC-01 | PASS | `/api/portfolios/summary` 恰好 1 次；全部 API 5 次，无新增端点 |
| AC-02 | PASS | 四态各一条 + 负向对照：`triggeredThresholds=2` 且 `overThresholdCount=1` → 显示「1 项超阈」（非 2）；`overThresholdCount=3` → 「3 项超阈」；「已到期（61 天）」；「正常」；「未设目标」 |
| AC-03 | 部分验证 | 徽标 `stopPropagation` 已实现；跳转目标静态检查通过（未做点击 URL 断言，见 11.5） |
| AC-04 | PASS | 顺序 `超阈组合 → 到期组合 → 待办组合 → 超阈组合2 → 无目标组合 → 正常组合`；负向对照：≠ 输入顺序；重载后顺序不变 |
| AC-05 | PASS | 归档不出现；0 组合显示「暂无组合，先创建一个」+「新建组合」按钮，**无 table** |
| AC-06 | PASS | `route.abort()` → 健康表「数据加载失败，请稍后重试」；总资产卡（含分币种小计）与提醒列表仍渲染；非白屏非登录页 |
| AC-07 | PASS | `¥862,300 · US$18,400 · CA$52,100 · —`，顺序正确；负向对照：无 `buckets` 时该行整体不渲染 |
| AC-08 | PASS | 标题/未读/全部/立即评估/规则管理 DOM 齐全 |
| AC-09 | PASS | build 0 / lint 0-0 |
| AC-10 | PASS | 1440×900：总资产卡 bottom=306；健康表前 3 行 bottom=474/515/556，均 ≤ 900；截图 `%TEMP%/066-shots/066-viewport.png` |

### 11.4 负向对照记录

| 对照 | 结果 |
|---|---|
| AC-02 ① | `triggeredThresholds.length=2` 但 `overThresholdCount=1` → 显示「1 项超阈」，未误显示「2 项超阈」 |
| AC-04 | 输出顺序 `≠` 数据注入顺序（证明排序生效，非原样透传） |
| AC-06 | abort 状态下整页仍含「家庭总览」、非登录页、非白屏 |
| AC-07 | 无 `buckets` 时不出现 `US$` / `CA$` → 该行整体不渲染 |

### 11.5 已知妥协与未验证项

- **AC-03 未做点击级 URL 断言**：徽标 `stopPropagation` 与 `navigate(...)` 在代码中静态核对，未用浏览器验证点击后的 URL 与「组合筛选设为该 portfolioId」的联动。属未验证项，交 Reviewer 复核。
- **验证使用桩数据（route.fulfill）注入构造的 `stats`**，非真实 DB 端到端：四态/排序/空态/错误态的**渲染逻辑**已验证，但真实 `computeSummary` 产出的字段值与这些构造值是否一致不在本卡范围（属 065 已验收内容）。
- 视口验证用构造数据（6 组合）；真实数据下 3 行是否仍不滚动未在真实库复核。
- `verify066.cjs` 依赖本机 Chrome 绝对路径与 `playwright-core`，未纳入 `npm test`（client 无 test 脚本）。
- 未改 `shared/` / `server/` / `cron-worker/`；未改 Task 状态；未 merge main；未填 Merged。

### 11.6 实施过程发现（供 Orchestrator / Reviewer 参考）

1. **开工时误写主工作区**：首轮把 `driftLabels.js` 写到了 `D:/projects/portomind`（默认 cwd），立即删除并确认主工作区恢复干净、分支/HEAD 未变。此后所有写入均用 `-066` 绝对路径。主工作区出现的 `US-004-prompts.md` 等改动是 Orchestrator 的派发登记，未触碰。
2. **验收脚本两个坑**（已修并留注释）：`page.route` 在导航后被清理（改用每场景新建 page）；`**/api/alerts/events*` 漏拦截 `/unread-count` → 真实服务器 401 → 全局 `notifyUnauthorized()` 跳登录页（改用 `**/api/**` 兜底）。这解释了早期「有时 6 行有时 0 行」的间歇性结果。
3. 服务用 `nohup` 启动以存活；`.env` 从主工作区复制（gitignored，未入库），临时服务 8080/6601 在交付后停止。
4. **§11 写入时再次误落主工作区并复制重复内容**：已 `git checkout --` 还原主工作区，并在 066 内修复重复段落；主工作区仅保留 Orchestrator 的 3 个文档改动。

### 11.7 F-01 整改（2026-11-06，复审 MAJOR）

**触发**：独立 Reviewer 首轮判定 `Pass with issues`，F-01（MAJOR）——健康表用本地时区格式化 `lastExecutedAt` 且带「（N 天前）」后缀，与 067 组合卡的 UTC 日期可能相差一天；Human 裁决 R2 = Option A（去后缀）、R1 = 抽唯一 UTC formatter 由 066/067 共用（§12.6.1）。

**基线**：`git merge main` @ `8b863f0` → 合并提交 `67298c4`（带入 067 卡、068 修复与最新文档）；F-01 代码见随后提交。

**改动**

| 文件 | 改动 |
|---|---|
| `client/src/utils/priceDisplay.js` | 新增 `lastRebalanceDateStr(value)` **唯一实现**：`null → null`；`Date → toISOString().slice(0,10)`；字符串取前 10 位并校验 `^\d{4}-\d{2}-\d{2}`，非法 → `null`；UTC 口径，不用本地 getters |
| `client/src/components/Dashboard/PortfolioHealthTable.jsx` | `formatLastRebalance` 改用 helper，去掉「（N 天前）」后缀；`null → LAST_REBALANCE_LABELS.never`；该列不再用 `daysSince` |
| `client/src/components/PortfolioCard/index.jsx`（067） | `formatDate` 改为同一 helper；「待办 / 上次再平衡」改用 `PENDING_LABELS` / `LAST_REBALANCE_LABELS`（关闭 067 的 D-02 TODO），文案逐字不变 |
| `client/scripts/verify066.cjs` | 新增 5 条单元格级断言：UTC 日期（Toronto 下旧实现应为 2026-09-06）、无后缀、`null → 从未`、两视图日期逐字一致、`null` 卡片逐字一致 |

**验证（本轮实跑）**

| 项 | 结果 |
|---|---|
| `npm run build --workspace client` | exit 0（2440 modules，2.77s） |
| `eslint "src/**/*.{js,jsx}"` | 0 error / 0 warning |
| `node client/scripts/verify066.cjs` | **34/34 PASS**（原 29 + F-01 5）。健康表对 `2026-09-07T00:00:00Z` 在 America/Toronto 显示 `2026-09-07`，组合卡同值 |
| 自建双时区探针（临时脚本，已删） | America/Toronto 与 Asia/Shanghai 下健康表/组合卡均为 `2026-09-07`，逐字一致 |
| 负向对照 ① | `lastRebalanceDateStr` 改回本地 getters → F-01 UTC 断言 FAIL（cell=`2026-09-06`），**33/34**；还原后 sha256 复核 |
| 负向对照 ② | 健康表临时恢复「（1 天前）」→ 3 条 F-01 断言 FAIL（31/34）；还原后 sha256 复核 |

**范围与遗留**：本卡改动不涉及 `shared/` / `server/` / `cron-worker/`（未新增业务逻辑）；`verify066.cjs` 仍为 `page.route` mock 取证，F-03（非真实 DB 端到端）不变。未改 Task 状态、未标 Completed、未合入 `main`、未填 `Merged`；复检由独立 Reviewer 执行。

## 12. Review Record

### 12.1 独立性声明与审查对象

- 依据 [REVIEWER.md §5/§7](../../../../os/roles/REVIEWER.md)。**首次独立审查**；独立 Reviewer，未参与本卡实现或 `verify066.cjs` 编写。Implementer 自述、Orchestrator 亲跑结果均不作为结论，全部独立复跑取证。判定词不是状态，不构成合入许可。
- **首轮基线**：`feature/TASK-066` @ `7cdefa0`（另 `4e26dca` 建立 `driftLabels.js`），worktree `D:/projects/portomind-066`；当时 `main` = `ca351b4`（065 合入 `6f556aa` 已在 main 与 HEAD，merge-base = `6f556aa`，无 stale-base 假象）；`git status --porcelain` 空。
- **复审基线（F-01 整改后）**：HEAD `353d583`（`fix(TASK-066): unify last-rebalance date on shared UTC formatter`），其父 `67298c4`（`git merge main` @ `8b863f0`，带入 067 卡/068 修复/最新文档）；`main` = `8b863f0` 已是 HEAD 祖先；正确范围 `main..HEAD` = 8 文件（`verify066.cjs`、`PortfolioHealthTable.jsx`、`TotalAssetsCard.jsx`、`PortfolioCard/index.jsx`、`driftLabels.js`、`Dashboard.jsx`、`priceDisplay.js`、plan），**无 shared/server/cron-worker**。
- 正确范围（`6f556aa..HEAD`）：6 文件 —— `verify066.cjs`、`PortfolioHealthTable.jsx`、`TotalAssetsCard.jsx`、`driftLabels.js`、`Dashboard.jsx`、`TASK-066-plan.md`；**无** `shared/`、`server/`、`cron-worker/`（AC-14 ✓）。
- 被审文件 SHA256（**复审基线 `353d583`**）：`PortfolioHealthTable.jsx` `5fb93338…d896`；`priceDisplay.js` `c6ac66bc…9968`；`PortfolioCard/index.jsx` `6390ff9e…f0ac`；`driftLabels.js` `0bb77916…c45e`（未变）；`TotalAssetsCard.jsx` `4c151bb5…15d3`（未变）；`Dashboard.jsx` `ad2e573f…0271`（未变）；`verify066.cjs` `e04f3b0d…8ae8`。（首轮基线 `7cdefa0` 的旧哈希见 git 历史。）

### 12.2 实跑证据（本人复跑，非引用自述）

| 命令 | 实际输出 |
|---|---|
| `npm run build --workspace client` | `✓ built in 2.94s / 2.77s`，exit 0（仅既有 chunk >500 kB 警告） |
| `eslint "src/**/*.{js,jsx}"` | exit 0，0 error / 0 warning |
| `node client/scripts/verify066.cjs`（vite 6601 + 本机 Chrome + `page.route` mock）——**首轮** | **29/29 PASS**，EXIT=0（与 Orchestrator 亲跑一致；本人另起 6601 独立复跑） |
| 自建独立浏览器探针（我的数据集，`/tmp/review066-indep.cjs`，已删） | **19/19 PASS** —— 覆盖 AC-09 排序（A 待办→B 超阈→C 正常）、四态、同源逐字、分币种顺序/null 桶、1440×900 三行不滚动、abort 隔离、空态、提醒区 |
| 自建点击级探针（AC-08，补计划 §11.5 未验证项） | **6/7 PASS**：「2 条待确认」→ `/portfolios/view/pA/rebalance?sub=suggestions` ✓；「1 条未读」→ 组合筛选 `pA` ✓；两徽标均不触发整行跳转 ✓；整行点击落 `/portfolios/view/pA/positions`（`overview` 路由重定向，OQ-02 已裁「US-003 前落默认子 Tab，行为等价」，非缺陷） |
| 自建日期格式探针（纯逻辑） | 见 F-01：066/067 同一 UTC 时间戳在 `America/Toronto` 下渲染**不同日期** |
| 3 条自建负向对照 | 见 §12.5，均 FAIL→还原→全绿 |
| **F-01 整改提交** | `353d583 fix(TASK-066): unify last-rebalance date on shared UTC formatter`（5 文件：`priceDisplay.js` +22、`PortfolioHealthTable.jsx` +11/-?、`PortfolioCard/index.jsx` 改用共享 helper/常量、`verify066.cjs` +37、plan） |
| **F-01 复审实跑（2026-11-06 第二遍）** | `npm run build --workspace client` **exit 0**（`built in 3.00s`）；`eslint` **0/0**；`verify066.cjs` **34/34 PASS**（含新增 5 条 F-01 单元格级/跨视图断言）；**自建双时区探针 4/4 PASS**（Toronto / Asia-Shanghai / UTC 三时区，同一 `2026-09-07T00:00:00Z` → 健康表与组合卡均 `2026-09-07`，null 均「从未」，**跨时区文本完全一致**） |
| **F-01 复审负向对照** | 见 §12.5 NEG-A/NEG-B，均 FAIL→还原→复绿 |

### 12.3 AC-05～AC-13（Story US-004）逐条判定

> 任务卡 §3 用 AC-01～AC-10（卡内编号），Story §4 用 AC-05～AC-13；下表按 **Story 编号** 逐条判定，括号内为卡内编号。

| Story AC | 判定 | 独立证据 |
|---|---|---|
| **AC-05**（1440×900 不滚动可见，G-2；卡 AC-10） | **满足** | 真实浏览器：总资产卡 bottom=306、前 3 行 bottom=474/515/556，均 ≤900；我的探针独立复现（3 行 top433/474/515）。分币种小计与总资产同块，亦在视口内 |
| **AC-06**（分币种小计同源 family-summary、null 桶「—」、不跨币种合计；卡 AC-07） | **满足** | 我的探针把 FAMILY.buckets 键故意乱序（HKD,CAD,USD,CNY）→ 渲染 `¥862,300 · US$18,400 · CA$52,100 · —`，顺序固定 CNY→USD→CAD→HKD；小计行无跨币种合计（家庭总换算 `¥1,234,567.89` 是独立 `totalCny` 字段）；负向对照：无 buckets 时该行整体不渲染（verify066 + 我的探针） |
| **AC-07**（偏离四态 + N=overThresholdCount 负向对照；卡 AC-02） | **满足** | 首轮 29/29、复审 34/34 与我的 19/19 三证据：① `triggeredThresholds.length=2` 但 `overThresholdCount=1` → 「1 项超阈」（非 2）；`overThresholdCount=3` → 「3 项超阈」；② 「已到期（61 天）」；③ 「正常」；④ 「未设目标」。四态文案来自 `driftLabels.js` 常量（NEG-2 篡改即 FAIL） |
| **AC-08**（待办跳转 + stopPropagation；卡 AC-03） | **满足** | 本人点击级探针实测：点「2 条待确认」→ `/portfolios/view/pA/rebalance?sub=suggestions`；点「1 条未读」→ `select=pA`（组合筛选设置），均不触发整行跳转。**补上了计划 §11.5 声明的未验证项** |
| **AC-09**（排序「有事的在上」全序稳定；卡 AC-04） | **满足** | 我的数据集（输入顺序 C,B,A 打乱）→ 输出 `A-待办 → B-超阈 → C-正常`；verify066 六组合全序 + 独立重载顺序不变；负向对照：去掉待办优先级 → 我的排序断言 FAIL（NEG-1） |
| **AC-10**（已归档不出现；卡 AC-05） | **满足** | verify066 AC-05 PASS；`usePortfolios()` 默认 `includeArchived=false`（既有 hook，diff 未改）——`git diff 6f556aa..HEAD -- client/src/hooks/` 空 |
| **AC-11**（summary 失败局部错误隔离；卡 AC-06） | **满足** | `route.abort()` → 健康表「数据加载失败，请稍后重试」；总资产卡（含小计 `US$18,400`）与「待处理提醒」仍渲染；整页含「家庭总览」、非登录页、非白屏（首轮 29/29、复审 34/34 + 我的探针） |
| **AC-12**（0 组合空态 + 新建按钮 + 无空表；卡 AC-05） | **满足** | 空态「暂无组合，先创建一个」+「新建组合」按钮 + `table` count=0 |
| **AC-13**（提醒区逻辑零改动；卡 AC-08） | **满足** | `git diff 6f556aa..HEAD -- Dashboard.jsx` 仅 3 处加法（import、usePortfolios 解构出 isLoading/isError、插入 `<PortfolioHealthTable>`）；提醒区筛选/标记已读/忽略/立即评估/规则管理 DOM 齐全且逻辑未动 |
| AC-14（cron-worker 零改动） | **满足** | 正确范围 diff 无 `shared/`/`server/`/`cron-worker/` |
| 卡 AC-09（build/eslint） | **满足** | build exit 0 / eslint 0-0 |

### 12.4 重点风险核对

- **零新增请求**：verify066 实测 `/api/portfolios/summary` = 1、全部 API = 5（session/family/summary/alerts/unread-count）；我的探针独立复现 count=1。组件 `PortfolioHealthTable.jsx` 无 `useQuery/useMutation/fetch/axios/api.*`，`Dashboard.jsx` 复用既有 `usePortfolios()`（同一 `queryKey`）✓
- **数据源只读 stats、不计算 drift 阈值、不跨币种合计**：`grep` 新增组件 0 命中 `evaluateThresholds/DRIFT_THRESHOLDS/absoluteDeviation`；市值列 `formatMarketValue` 分币种并列（产品不变量 ✓）；分币种小计用 `formatMoney` 不自建符号 ✓
- **排序口径**（OQ-01 已裁「有事的在上」）：`comparePortfolios` 待办>0 → needsRebalance → dueByTime → createdAt 倒序，全序 ✓
- **同源/逐字一致（D-01 解 B、D-02）**：`PENDING_LABELS.pendingRebalance/unreadAlert/none`、`LAST_REBALANCE_LABELS.never` 由 `driftLabels.js` 单一拥有，**067 已改为 `import` 消费（内联副本与 TODO 一并消除）**；「上次再平衡」经共享 `lastRebalanceDateStr` 统一为 UTC `YYYY-MM-DD`，**两视图逐字一致已实测**（三时区相同）。健康表四态文案来自 `driftLabels.js` ✓
- **065 已合入、降级前提解除**：`summary.js` 四字段在 main；组件直接读 `pendingRebalanceCount/lastExecutedAt/dueByTime/overThresholdCount` 真值（`:66/:69/:91/:101/:162`），无「字段缺失降级掩盖」；仅 `?? 0` 为展示兜底（065 保证字段存在，见 F-03 MINOR）
- **禁改范围**：✓（AC-14）

### 12.5 负向对照（本人自建，篡改→断言 FAIL→还原→`git status` 空）

| # | 临时缺陷 | 断言表现 | 还原 |
|---|---|---|---|
| NEG-1（AC-09 排序） | 删除 `if (hasTodoA !== hasTodoB) return hasTodoB - hasTodoA;` | `AC-09 排序` FAIL（输出 `["B-超阈","C-正常","A-待办"]`）；18/19 | 备份还原 |
| NEG-2（同源文案） | `driftLabels.js` `normal: '无异常'` | `同源：健康表「正常」` FAIL（`["无异常",…]`）；18/19 | 备份还原 |
| NEG-3（分币种不合计） | `SUBTOTAL_ORDER = []`（纯字母序） | `AC-06 分币种顺序` FAIL（CNY@42 USD@57 CAD@30）及 null 桶断言 FAIL；17/19 | 备份还原 |

**F-01 复审追加（针对整改提交 `353d583`）**：

| # | 临时缺陷 | 断言表现 | 还原 |
|---|---|---|---|
| NEG-A（R1 日期基准） | `priceDisplay.lastRebalanceDateStr` 改回本地时区 `getFullYear/getMonth/getDate` | Toronto：健康表/卡片均 `2026-09-06`（错，应为 `2026-09-07`）→ 2 条「按 UTC 日期显示」FAIL + 「跨时区文本完全一致」FAIL；**2/4 PASS** | 备份还原（`git diff` 空） |
| NEG-B（R2 后缀） | 健康表 `formatLastRebalance` 回加 `` `${d}（${daysSince()} 天前）` `` | 「不带后缀」FAIL + 「两视图逐字一致」FAIL（`health="2026-09-07（60 天前）"` vs `card="2026-09-07"`）；**1/4 PASS** | 备份还原（`git diff` 空） |

另复核 Implementer `verify066.cjs` 声称的 4 处负向对照（脚本内 4 条 `负向对照` 断言 + AC-02① 内嵌 1 条 = 5 处）：AC-02①「1 项超阈 vs 2 项超阈」、AC-04「顺序 ≠ 输入顺序」、AC-06「abort 非白屏」、AC-07「无 buckets 不渲染」——本人 29/29（复审 34/34）复跑确认均生效；其中 AC-04/AC-07 已由我的 NEG-1/NEG-3 以不同篡改再次证明非恒真。**结论：5 处负向对照确能证明断言非恒真** ✓

### 12.6 Findings

| # | 严重度 | 位置 | 现象 | 修法方向 |
|---|---|---|---|---|
| **F-01** | ~~MAJOR~~ → **已整改复检通过（2026-11-06）** | `client/src/components/Dashboard/PortfolioHealthTable.jsx:80-81`（现 `formatLastRebalance`）+ `client/src/utils/priceDisplay.js:71`（`lastRebalanceDateStr`） | ① 用 `new Date(lastExec)` + **本地时区** `getFullYear/getMonth/getDate` 格式化，而 067 `PortfolioCard/index.jsx:23-27` 用 UTC `String(v).slice(0,10)`：同一 `2026-08-27T03:00:00Z` 在 `America/Toronto` 下健康表渲染 `2026-08-26（71 天前）`、卡片渲染 `2026-08-27` —— **同一 stats 两处显示不同日期**（实测，Implementer 自己的 29/29 输出亦可见 `2026-09-06T00:00:00Z → 2026-09-05（61 天前）`）。② 单元格追加 `（N 天前）` 后缀，与**批准计划 §4:53**（`lastExecutedAt → YYYY-MM-DD，null → 「从未」`）不符；**FS Spec §7:216** 允许「`YYYY-MM-DD` + 距今天数」——Spec/Plan 冲突，已交 Human 裁决（见下）。③ D-01 解 B 要求「上次再平衡」逐字一致：完整单元格文本不一致 | **已按 §12.6.1 整改并复检通过**：`353d583` 新增唯一实现 `lastRebalanceDateStr`（UTC，`priceDisplay.js:71`），066 `:81` 与 067 `:54` 共用；去掉 `（N 天前）` 后缀，`null → 从未`。复审：三时区（Toronto/Asia-Shanghai/UTC）同一 `2026-09-07T00:00:00Z` 两视图均显示 `2026-09-07` 且**逐字一致**、null 均「从未」；负向对照 NEG-A/NEG-B 均 FAIL 后还原。**F-01 已收敛** |
| **F-02** | **MINOR** | `client/src/components/Dashboard/PortfolioHealthTable.jsx:66`、`:72` | `drift.overThresholdCount ?? 0`、`days ?? 0` 展示兜底：065 已合入保证 `overThresholdCount` 存在，理论上不会触发；若上游异常返回 null，会显示「0 项超阈」（掩盖未知，触碰「不猜缺失数字」不变量） | 改为 `?? null` 时显示 `DRIFT_STATE_LABELS.unknown`（`—`），与 `driftLabels.js:32` 的 unknown 口径一致；非当前路径，不阻塞 |
| **F-03** | **MINOR** | `client/scripts/verify066.cjs` / 计划 §11.5 | **mock 取证局限（F-03 类残留）**：全部 29 条断言用 `page.route` 注入构造的 `stats` 快照，**非真实后端/DB 端到端**；验证的是渲染逻辑、请求数、分页/错误隔离，不证明真实 `computeSummary` 产出的 `lastExecutedAt/pendingRebalanceCount/overThresholdCount` 与构造值一致（该部分归 065 已验收）。视口 AC-05 亦为构造 6 组合数据，真实数据下 3 行是否仍不滚动未复核 | 上线前用真实 dev 库（或 065 真值夹具）跑一遍 Dashboard，核对字段值与视口；计划 §11.5 已如实声明 |
| **F-04** | **MINOR** | `client/src/components/Dashboard/PortfolioHealthTable.jsx:33-44` vs `TotalAssetsCard.jsx:15-26` | 币种排序常量 `CURRENCY_ORDER` / `SUBTOTAL_ORDER` 两处各写一份（值相同 `CNY,USD,CAD,HKD`），有双源漂移风险 | 抽到共享常量（可放 `driftLabels.js` 或新 `currencyOrder.js`）；不阻塞 |
| **F-05** | **MINOR** | `client/scripts/verify066.cjs:11-12` | 依赖本机 Chrome 绝对路径与 `VERIFY_BASE=6601` vite，未纳入 `npm test`（client 无 test 脚本）；本人复跑时 `edit` 工具在 `client/scripts/` 产生 `.tmpdir` 触发 vite watcher `EBUSY` 崩溃一次（工具/环境artifact，非产品缺陷，已把探针移出监视树解决） | 记录为交付方式限制；CI 化另行决定 |

#### 12.6.1 F-01 处置（Human 裁决 + 整改口径）

**2026-11-06 Human 裁决：R2 采用 Option A —— 去掉 `（N 天前）` 后缀，只显示 `YYYY-MM-DD` / 「从未」。** 该裁决解决了 Spec（§7:216 允许 +距今天数）与批准 Plan（§4:53 纯日期）的口径冲突，**以批准 Plan §4:53 为准**；FS Spec §7:216 的「+距今天数」不在本期健康表落点（如需该信息，后续单独立项并两卡同步）。

整改范围（交 Implementer，Reviewer 不代改）：

| 子项 | 要求 | 落点 |
|---|---|---|
| **R1（必修）** | 统一日期基准为「后端 ISO 字符串的 UTC 日期」，消除跨视图漂移；**唯一实现**，066/067 共用 | 建议在 `client/src/utils/priceDisplay.js`（已是日期/金额格式唯一实现，`daysSince` 在 `:51`）新增 `lastRebalanceDateStr(value)`：`value == null → null`；`Date → toISOString()`；字符串取前 10 位且校验 `^\d{4}-\d{2}-\d{2}`；非法 → `null`。**不要**放 `driftLabels.js`（该文件契约「不做计算、不 import」），**不要**复用 `localDateStr`（按本地时区取「今天」，口径不同） |
| **R2（已裁 Option A）** | 去掉 `（N 天前）` 后缀；`null` → 「从未」 | `PortfolioHealthTable.jsx:79-87` 的 `formatLastRebalance` 改为 `lastRebalanceDateStr(stats?.lastExecutedAt) ?? LAST_REBALANCE_LABELS.never`；`daysSince` 不再用于该列 |
| 连带 | 067 `PortfolioCard/index.jsx:21-27` 的 `formatDate` 改为同一 helper（行为不变，保证逐字一致） | 067 侧（其自身 D-02 TODO 一并处理） |
| 复检（Reviewer） | ① Playwright `timezoneId: 'America/Toronto'` 与 `'Asia/Shanghai'` 各跑一次，同一 `lastExecutedAt` 在两视图文本必须逐字相同；② 负向对照：formatter 改回本地 getters → 断言必须 FAIL；③ `verify066.cjs` 增加**单元格级**「与 067 常量逐字一致」断言（现仅断言偏离四态文案，正是漏掉 F-01 的原因） | — |

#### 12.6.2 F-01 复审结果（2026-11-06，对整改提交 `353d583`）

| 复检项 | 结果 |
|---|---|
| R1 唯一实现 | `priceDisplay.js:71 lastRebalanceDateStr`（`Date` 走 `toISOString().slice(0,10)`；字符串取前 10 位并 `^\d{4}-\d{2}-\d{2}$` 校验；非法/空 → `null`）；`grep` 全仓仅此一处定义；引用方仅 066 `:81` 与 067 `:54` ✓ |
| R2 去后缀 | `PortfolioHealthTable.jsx:80-81` → `lastRebalanceDateStr(...) ?? LAST_REBALANCE_LABELS.never`；`daysSince` 仅保留用于「已到期（N 天）」（`:71`，语义未变）✓ |
| 067 连带 | `PortfolioCard/index.jsx` 改用同一 helper，并 **import** `PENDING_LABELS`/`LAST_REBALANCE_LABELS`（内联副本与 D-02 TODO 一并消除）✓ |
| 双时区逐字一致 | **Toronto / Asia-Shanghai / UTC 三时区**：同一 `2026-09-07T00:00:00Z` → 健康表与卡片均 `2026-09-07`；`null` → 两处均「从未」；**跨时区文本完全相同** ✓ |
| 负向对照 | NEG-A（改回本地 getters）→ Toronto 显示 `2026-09-06`、跨时区不一致 → **FAIL**；NEG-B（回加后缀）→ 「无后缀」「逐字一致」**FAIL**；均还原后复绿 ✓ |
| 回归 | build exit 0；eslint 0/0；`verify066.cjs` **34/34**（含 5 条新增 F-01 断言）；禁改范围（无 shared/server/cron-worker）✓ |

**结论：F-01（MAJOR）已整改并复检通过，收敛。** 剩余 4 项 MINOR（F-02/F-03/F-04/F-05）不阻塞。

### 12.7 DoD（[DEFINITION_OF_DONE §3](../../../../os/process/DEFINITION_OF_DONE.md) T-1～T-6）

| # | 要求 | 满足 | 证据 |
|---|---|---|---|
| T-1 实现完成 | 改动清单与 Implementing 退出物证一致 | ✅ | 首轮 6 文件 + F-01 整改新增 `priceDisplay.js` 与 067 卡片回改（`main..HEAD` 8 文件）；均在 §10 范围（纯 client）；工作区干净 |
| T-2 验证完成 | 运行类记录实际结果、静态记录对象方法 | ✅ | build 0 / lint 0 / verify066 **34/34**（本人复跑，含 5 条 F-01 断言）/ 自建探针 19/19 + 点击探针 6/7（失败项为 OQ-02 预期重定向）/ 双时区探针 4/4 / 负向对照 5 条（3 首轮 + NEG-A/NEG-B 复审）；mock 局限已记 F-03 |
| T-3 AC 逐条满足 | 对照 Story AC-05～AC-13 | ✅ | §12.3 九条 Story AC + 卡内 AC-09/10 全部满足；F-01 已整改复检（§12.6.2），D-01 逐字一致实测成立 |
| T-4 审查结论收敛 | 无未决 BLOCKER；MAJOR 已整改或 Human 明示接受 | ✅ **已收敛** | 无 BLOCKER；**F-01（MAJOR）已按 Human 裁决 R2=Option A 整改（`353d583`）并经本人复检通过**（§12.6.2）；剩余 MINOR 已记录 |
| T-5 文档同步 | 记录节已填、任务卡仅引用 | ✅ | 计划 §11 实施记录已填；本 §12 回填；任务卡加一行结论 + 链接 |
| T-6 已知妥协已记录 | 改动清单含「已知妥协」 | ✅ | 计划 §11.5 列 5 项（mock 快照、视口构造数据、AC-03 点击未验证[本人已补]、Chrome 路径、范围）；本 §12 F-03/F-05 复核 |

### 12.8 残余风险与未验证项

- ~~F-01 待整改~~ → **已整改复检通过**（§12.6.2），不在残余风险内。
- **mock 取证局限（F-03）**：未连真实后端/DB；AC-05 视口为构造 6 组合数据；真实 065 字段值未端到端复核。
- 未跑 `npm test` 全 workspace（客户端无 test 脚本）；未做真实 UI 走查之外的其他视口/暗色主题。
- 067 的 `driftLabels.js` 消费切换（D-02 TODO）**已随本次整改完成**（067 现 import 共享常量），不再遗留。

### 12.9 判定

**Pass with issues** —— Story US-004 AC-05～AC-13（含 G-2 补齐的 AC-05 视口）与卡内 AC-01～AC-10 **逐条满足**，本人独立复跑：build 0 / eslint 0 / `verify066.cjs` **34/34**（6601 vite + 本机 Chrome + page.route mock）、自建独立探针 **19/19**（不同数据集）、点击级探针补上计划 §11.5 未验证的 AC-08 跳转、双时区探针 **4/4**、5 条负向对照（3 首轮 + NEG-A/NEG-B）证明排序/文案同源/分币种不合计/日期基准/去后缀断言非恒真；零新增请求（`/portfolios/summary`=1）、四态偏离 N 取 `overThresholdCount`、全序排序、局部错误隔离、禁改范围（shared/server/cron-worker 零改动）、065 真值字段无降级掩盖均实证成立。**无 BLOCKER**。

**F-01（MAJOR）已整改复检通过、收敛**：`353d583` 按 Human 裁决（R2=Option A）新增唯一 UTC 实现 `lastRebalanceDateStr`（`priceDisplay.js:71`），066 `:81` 与 067 `:54` 共用；去掉 `（N 天前）` 后缀。复审：Toronto / Asia-Shanghai / UTC 三时区同一 `2026-09-07T00:00:00Z` → 两视图均 `2026-09-07`、`null` 均「从未」、**跨时区文本完全一致**；NEG-A/NEG-B 均 FAIL 后还原（§12.6.2）。剩余 4 项 MINOR（F-02 展示兜底、F-03 mock 取证局限、F-04 币种顺序双源、F-05 验证方式限制）均不阻塞。

依 [REVIEWER.md §5.1](../../../../os/roles/REVIEWER.md)：AC 满足、无未决 BLOCKER/MAJOR、剩余 MINOR 已记录 → **`Pass with issues`**。判定不是合入许可；`Merged` 与关闭归 Human（DoD §4）。

判定词不是状态，不构成合入许可。本 Reviewer 未改 Task Status、未标 Completed、未 `git add/commit/push`、未合入 main、未填 Merged；关闭与合入登记归 Human / Orchestrator（STATES.md §4）。

## 13. Completion Record

**结案（2026-11-06）**

| 项 | 事实 |
|---|---|
| 覆盖 AC | US-004 / AC-05～AC-13（含 G-2 补齐的 AC-05 视口）逐条满足，见 §12.3 |
| 实现 | `4e26dca`（`driftLabels.js` 共享常量）→ `7cdefa0`（健康表 + 分币种小计）→ `67298c4`（merge `main` @ `8b863f0`）→ `353d583`（F-01 整改：唯一 UTC `lastRebalanceDateStr`，066/067 共用） |
| 审查 | 首轮 `Pass with issues` + F-01（MAJOR：本地时区格式化与 067 卡差一天、带「N 天前」后缀）→ `353d583` 整改 → 复审 **`Pass with issues`**（F-01 收敛，无 BLOCKER/未决 MAJOR） |
| 残余 | MINOR F-02（`?? 0` 展示兜底）、F-03（`verify066` mock 取证局限，非真实后端）、F-04（币种顺序常量双源）、F-05（验证依赖本机 Chrome/vite）——均不阻塞，记录在案 |
| 验证 | `npm run build --workspace client` exit 0（2440 modules）；`eslint` 0 error / 0 warning；`verify066.cjs` **34/34 PASS**；自建独立探针 19/19、点击级探针补 AC-08、双时区探针 4/4；5 条负向对照均 FAIL 后还原 |
| 关闭依据 | Human 2026-11-06 确认检验通过；按 [STATES.md §4](../../../../os/process/STATES.md#4-谁可以改变状态) 登记 `Completed` |
| 合入 | **已合入（2026-11-06）**：**PR #42** → `af1f4d2` `Merge pull request #42 from tongweizj/feature/TASK-066`（分支合入前以 `f8903c3` merge 最新 `main`）；`Merged` = `af1f4d2` |

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
