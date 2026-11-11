# TASK-071 — 代码结构清理实施计划（零行为变更）

## Status

Status：Completed（2026-11-11，Task 已 `Completed` 并合入 `main`；计划由 `Approved` 同步为 `Completed`）

Related Task：[TASK-071](../../tasks/completed/TASK-071-codebase-structure-cleanup.md)（独立维护任务，无 Story）。

Branch / Base：`main` @ `a7b2da8`（基线已封板 `v1.0.0` / `release/v1.0` @ `d87f81d`）。实施时从最新 `main` 开 `feature/TASK-071-structure-cleanup`。

Approval：**已批准（2026-11-11，Human）**。依据 Human 指令「写一个提示词，让开发一次性完成 071，072 两个任务」；本计划覆盖 §1～§9 当前设计（[STATES.md](../../../os/process/STATES.md) §4）。

## 1. Intent

在不改变任何业务行为、API 契约与计算口径的前提下，降低代码阅读成本、重建结构认知：

1. 确认并标注**新旧代码边界**；
2. 删除**零引用**代码（附证据）；
3. 统一命名（页面 PascalCase、service 后缀、后端 controller/service/route 词根）；
4. 前端路由只保留**实际使用**的路由；
5. 每个业务域**只有一个前端 API service**。

验收口径见任务卡 §3（AC-01～AC-07）。**硬约束**：`shared/` 业务实现、HTTP 路径、请求/响应字段、错误码、计算结果一律不变。

## 2. Context

- 版本基线：`v1.0.0`（US-004 交付单元 B 完成），发行分支 `release/v1.0`；主干 `main`。
- 客户端 `client/src` 共 108 个 `.js/.jsx`；无路径别名（全部相对 import）；无 TypeScript。
- 服务端 12 组 `controller` + `routes`，业务实现集中在 `shared/services/**`；`server/` 只做协议层，符合 [ARCHITECTURE.md §7](../../../os/architecture/ARCHITECTURE.md)。
- 前端 HTTP 调用已被 `services/*.service.js` 收口，页面/组件**无**直接 `import { api }`（现状良好，需保持）。
- 文档/证据：`docs:check` 可用；构建与测试命令见 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md)。

## 3. Repository Findings（2026-11-09 亲读 + 引用图扫描）

### 3.1 引用扫描结果（客户端）

方法：对 `client/src` 全部 108 个模块建立相对 import 图（解析 `./x`、`../x`、`x/index.jsx`），统计入度；入口 `main.jsx` 单独排除。

- **已引用 91 个，零引用 17 个**（其中 `main.jsx` 为入口，实际死代码 16 个，见任务卡 §4 表）。
- 5 个为 0 行空文件：`components/common/{ErrorAlert,Loading}.jsx`、`components/layout/MainLayout.jsx`、`utils/{chartConfig,helpers}.js`。

### 3.2 新旧代码边界（可直接判定的证据）

| 旧（应淘汰） | 新（现行） | 判定证据 |
|---|---|---|
| `components/common/Header.jsx`（标题「ETF 基金价格追踪系统」） | `components/layout/AppLayout.jsx` | 旧标题为改名前产品名；`AppLayout` 由 `router.jsx` 直接引用 |
| `components/layout/{Header,MainLayout}.jsx` | `components/layout/AppLayout.jsx` | 两者入度 0；`MainLayout` 为空文件 |
| `components/common/{Loading,ErrorAlert}.jsx` | `components/DataState/index.jsx` | 空文件；`DataState` 被 20+ 文件引用 |
| `pages/Portfolio/Basic.jsx` | `pages/Portfolio/PositionOverview.jsx` | `Detail.jsx` 的 `TABS` 只含 positions / position-history / rebalance / transactions |
| `pages/Portfolio/TargetAllocation.jsx` | `pages/Portfolio/Rebalance.jsx` + `PortfolioRebalanceSettings.jsx` | 同上；旧文件入度 0 |
| `components/AddTransactionForm.jsx` | `pages/Transaction/AddTransaction.jsx` | 旧组件入度 0；路由指向新页面 |
| `models/{portfolio,transaction}.js` | — | 仅 JSDoc `@typedef`，无任何 import |
| `utils/{chartConfig,formatters,helpers,marketUtils,symbolUtils}.js` | `utils/priceDisplay.js` 等在用模块 | 入度 0 |

### 3.3 命名不一致（现网实际）

| 层 | 现状 | 问题 |
|---|---|---|
| 客户端 services | `api.js`、`authSession.js`；其余 `*.service.js` | 两个文件无统一后缀 |
| 客户端 services | `cronStatus.service.js`（驼峰） | 与目录内全小写风格不一致 |
| 客户端 pages | `Portfolio/` 下 12 个文件里 **10 个是 Tab 子组件**，非路由页面 | `pages` 语义被稀释 |
| 服务端 routes | `logs.routes.js` ↔ `log.controller.js` | 单复数不一致 |
| 服务端 routes | `rebalanceRecord.routes.js` ↔ `rebalance.controller.js` | 词根不一致 |
| 服务端 | `cronStatus.controller.js` / `cronStatus.routes.js` | 驼峰，与其它文件风格不一 |
| 共享 services | `alertCenter.service.js` 等带后缀，`alertVisibility.js`、`taskRunner.js` 不带 | 后缀规则不一致 |
| 术语 | UI/路由 `instruments`，服务层/接口 `assets` | 双轨（**本期不统一**，见 §6） |

### 3.4 前端 API service 现状

13 个文件：`api`、`alert`、`asset`、`auth`、`authSession`、`cronStatus`、`family`、`log`、`portfolio`、`position`、`price`、`rebalance`、`transaction`。

- `auth.service.js` 同时包含**认证**（login/logout/session/change-password/profile）与**用户管理**（list/create/update/resetPassword）→ 跨业务域；
- `position.service.js` 实为 `/portfolios/:id/stats/positions` 与 `/portfolios/:id/positions/history`，属 portfolio 子资源 → 与 `portfolio.service.js` 重复域；
- 其余业务域各一个，符合目标。

### 3.5 路由现状

- `client/src/router.jsx`：**没有**注释掉的旧路由；有 3 条 `/assets*` → `/instruments*` 兼容重定向、1 条 `*` 兜底。
- 旧路由族 `/transactions`、家庭视图页已按 TASK-044 / TASK-050 删除，只剩说明性注释（保留，属设计说明而非死路由）。
- 因此 AC-03 的实际工作是：**决定 3 条兼容重定向去留**、并把说明性注释与真实路由在结构上分离。

## 4. Proposed Design

### 4.1 三条铁律

1. **只做重命名、移动、删除；不改语句。** 任何 diff 中出现逻辑变化即回退该文件。
2. **URL / payload / 计算冻结**：`server/routes/**`、`shared/**` 只允许出现 import 路径变化（因改名），函数体零变更。
3. **一阶段一提交一验收**：每阶段独立 build/lint/test，失败只回滚该阶段。

### 4.2 命名标准（本期生效）

| 对象 | 规则 | 示例 |
|---|---|---|
| React 页面/组件文件 | PascalCase，一文件一默认导出组件 | `PositionOverview.jsx` |
| Hook | `useXxx.js`（camelCase） | `usePortfolios.js` |
| 前端业务 service | `<domain>.service.js`（小写单词，单词间 `-`） | `cron-status.service.js`、`portfolio.service.js` |
| 基础设施模块 | 不带 `.service`，但需显式后缀表明性质 | `api.client.js`、`auth-session.bus.js` |
| 后端 controller | `<domain>.controller.js` | `log.controller.js` |
| 后端 route | 与 controller **同词根 + 复数资源名** | `log.routes.js`（挂 `/api/logs`） |
| shared 顶层 service | `<domain>.service.js`；域内子模块放子目录且用 camelCase 文件名 | `alert/visibility.js`、`portfolio/summary.js` |

> 服务端 API 路径不动（`/api/logs` 保持复数），只改文件名与 import。

### 4.3 目标前端目录（收敛后）

```text
client/src/
  pages/                       # 仅路由页面：与 router.jsx 一一对应
    Dashboard.jsx  Account.jsx  AccountUsers.jsx  Login.jsx  LogViewer.jsx
    Alerts/AlertRules.jsx
    Asset/{AssetList,AssetDetail,AssetForm}.jsx
    Portfolio/{List,Detail,PortfolioForm}.jsx
    Prices/{Today,History}.jsx
    Transaction/{TransactionList,AddTransaction,EditTransaction,ImportTransactions}.jsx
  components/
    portfolio/                 # 从 pages/Portfolio 移入的 Tab 子组件
      PositionOverview.jsx  PositionHistory.jsx  Rebalance.jsx
      RebalanceHistory.jsx  RebalanceSuggester.jsx  Transactions.jsx
      KpiCards.jsx  PortfolioHeader.jsx  PortfolioRebalanceSettings.jsx
      rebalanceTabContext.js
    layout/  auth/  common/  household/  dashboard/  cron-status/
```

### 4.4 前端 service 目标（每业务一个）

| 业务域 | 目标文件 | 动作 |
|---|---|---|
| 基础设施 | `api.client.js` | `api.js` 改名 |
| 会话事件 | `auth-session.bus.js` | `authSession.js` 改名 |
| 认证 | `auth.service.js` | 保留 login/logout/session/change-password/profile |
| 用户 | `user.service.js`（新） | 从 `auth.service.js` 拆出 list/create/update/resetPassword |
| 组合（含持仓） | `portfolio.service.js` | 吸收 `position.service.js` 的 2 个函数 |
| 交易 | `transaction.service.js` | 不变 |
| 价格 | `price.service.js` | 不变 |
| 标的 | `asset.service.js` | 不变（术语不动，见 §6） |
| 提醒 | `alert.service.js` | 不变 |
| 家庭 | `family.service.js` | 不变 |
| 再平衡 | `rebalance.service.js` | 不变 |
| 日志 | `log.service.js` | 不变 |
| 调度状态 | `cron-status.service.js` | `cronStatus.service.js` 改名 |

结果：**11 个业务 service + 2 个基础设施模块**，每个业务域恰一个。

## 5. Work Breakdown（按模块分批：一次只清一个模块）

### 5.0 执行规则

- **一轮 = 一个模块 = 一个提交**；不得把两个模块混在同一提交里。
- 每轮结束都必须实跑：`npm run build --workspace client`、`npm run lint --workspace client`、`npm run test:server`、`npm run docs:check`，全绿才算该轮完成。
- 每轮开始前先 `git merge main`；失败只回滚该轮，不连带后续。
- 每轮提交信息格式：`refactor(TASK-071): M<编号> <模块名>`。
- 删除类模块必须附「全仓 grep 0 命中」证据；重命名类模块必须 `git diff -M` 显示 rename。

| 轮次 | 模块 | 范围 | 风险 | 主要 AC |
|---|---|---|---|---|
| M0 | 基线取证（不改代码） | 16 个待删文件的 grep 证据 + 四项基线输出 | 无 | AC-07 |
| M1 | 旧布局与通用组件 | `components/common/{ErrorAlert,Header,Loading}.jsx`、`components/layout/{Header,MainLayout}.jsx`、`components/AddTransactionForm.jsx` | 低 | AC-01 |
| M2 | 死工具 / 模型 / hook | `utils/{chartConfig,formatters,helpers,marketUtils,symbolUtils}.js`、`models/{portfolio,transaction}.js`、`hooks/useTransactions.js`、`shared/fetchers/IFetcher.js` | 低 | AC-01 |
| M3 | 旧 Tab 页面 | `pages/Portfolio/{Basic,TargetAllocation}.jsx` | 低 | AC-01 |
| M4 | 前端 services 改名 | `api.js→api.client.js`、`authSession.js→auth-session.bus.js`、`cronStatus.service.js→cron-status.service.js` | 中 | AC-04 |
| M5 | 前端 service 收敛 | 拆出 `user.service.js`；`position.service.js` 并入 `portfolio.service.js` | 中 | AC-02 |
| M6 | 前端路由 | 兼容层结构化；`/assets*` 按 D-2 保留 | 低 | AC-03 |
| M7 | 目录归位 | 10 个 Tab 组件 + `rebalanceTabContext.js` → `components/portfolio/` | 中高 | AC-04 |
| M8 | 服务端命名 | `logs.routes→log.routes`、`rebalanceRecord.routes→rebalance.routes`、`cronStatus.*→cron-status.*` | 中 | AC-04 |
| M9 | shared 命名（**受限**） | 仅给 `taskRunner.js` 加文件头说明；`alertVisibility.js` 按 D-3 **待定、跳过** | 中 | AC-04 |
| M10 | 收尾 | `CLIENT_DEV.md` 目录说明、计划 §11、独立审查 | 低 | AC-05 / AC-07 |

**依赖顺序**：M1→M2→M3 互不重叠、可任意先后；M4 必须早于 M5；M3 必须早于 M7（先删死文件再移动目录）；M6 独立；M8/M9 与前端解耦，可插在任意轮之后。

### M0 · 基线取证（0.5h）

- [ ] 记录 `git rev-parse main`、四项命令的当前输出。
- [ ] 对 M1/M2/M3 将删的每个文件执行 `grep -rn "<basename>" client/src client/scripts server shared cron-worker`，0 命中才允许删除；输出存档。
- **产出**：基线日志 + 证据表；不改代码。

### M1 · 旧布局与通用组件（低风险）

- [ ] 删除 `components/common/{ErrorAlert,Header,Loading}.jsx`（其中 2 个为 0 字节空文件，删前确认）。
- [ ] 删除 `components/layout/{Header,MainLayout}.jsx`（`MainLayout` 为空文件；现行顶栏在 `AppLayout`）。
- [ ] 删除 `components/AddTransactionForm.jsx`（已被 `pages/Transaction/AddTransaction.jsx` 取代）。
- **验收**：build / lint / test / docs:check 全绿；`git diff -M --stat` 只有删除。

### M2 · 死工具 / 模型 / hook（低风险）

- [ ] 删除 `client/src/utils/{chartConfig,formatters,helpers,marketUtils,symbolUtils}.js`。
- [ ] 删除 `client/src/models/{portfolio,transaction}.js`。
- [ ] 删除 `client/src/hooks/useTransactions.js`。
- [ ] 删除 `shared/fetchers/IFetcher.js`（仅注释式 `@interface`，文件头仍写旧路径）。
- **验收**：同 M1；另外 `grep -rn "IFetcher" shared server` 应为 0。

### M3 · 旧 Tab 页面（低风险）

- [ ] 删除 `pages/Portfolio/Basic.jsx`、`pages/Portfolio/TargetAllocation.jsx`（`Detail.jsx` 的 `TABS` 已不含它们）。
- **验收**：build；手点组合详情 4 个 Tab（positions / position-history / rebalance / transactions）。

### M4 · 前端 services 改名（中风险，Windows 两段式）

- [ ] `api.js` → `api.client.js`；`authSession.js` → `auth-session.bus.js`；`cronStatus.service.js` → `cron-status.service.js`。
- [ ] 用 `git mv a tmp && git mv tmp b` 两段式改名，避免大小写/缓存问题；更新全部 import。
- **验收**：`git diff -M --stat` 全部显示 rename（相似度 100%）；build / lint 全绿。

### M5 · 前端 service 收敛（中风险）

- [ ] 新建 `user.service.js`：把 `listUsers / createUser / updateUser / resetUserPassword` 从 `auth.service.js` **原样搬移**（函数体与 URL 不变），更新 `useUsers`、`AccountUsers` 引用。
- [ ] 把 `position.service.js` 的 2 个函数并入 `portfolio.service.js`，删除原文件，更新 `PositionOverview` / `PositionHistory` 引用。
- [ ] 复核：`grep -rn "import { api }" client/src/pages client/src/components` 必须为 0。
- **验收**：build / lint；手点 `/portfolios`、组合详情 4 Tab、`/account/users`。

### M6 · 前端路由整理（低风险）

- [ ] `router.jsx`：把 3 条 `/assets*` 兼容重定向与 `*` 兜底集中到文件末尾「兼容层」注释块；实际路由与兼容路由分组清晰。
- [ ] 按 D-2 保留 `/assets*`（一个版本周期）；`constants/routes.js` 保持 `ROUTE_PATTERNS` 与 `ROUTES` 一一对应。
- **验收**：`router.jsx` 中不存在被注释掉的 `<Route>`；手测 `/assets`、`/assets/new`、`/assets/edit/:id` 三条跳转。

### M7 · 目录归位（中高风险，改动面最大）

- [ ] `git mv` 这 10 个文件到 `client/src/components/portfolio/`：`PositionOverview`、`PositionHistory`、`Rebalance`、`RebalanceHistory`、`RebalanceSuggester`、`Transactions`、`KpiCards`、`PortfolioHeader`、`PortfolioRebalanceSettings`、`rebalanceTabContext.js`。
- [ ] `pages/Portfolio/` 最终只留 `List.jsx`、`Detail.jsx`、`PortfolioForm.jsx`。
- **验收**：build；手点组合详情全部 Tab；`router.jsx` 每条路由可达。

### M8 · 服务端命名（中风险，只改文件名与 require）

- [ ] `logs.routes.js` → `log.routes.js`；`rebalanceRecord.routes.js` → `rebalance.routes.js`；`cronStatus.controller.js` / `cronStatus.routes.js` → `cron-status.*`。
- [ ] 更新 `server/app.js` 与相关 `require`；**挂载路径不变**（`/api/logs`、`/api/rebalance`、`/api/cron`）。
- **验收**：`test:server` 全绿（数量不变，不含 TASK-072 新增用例）。

### M9 · shared 命名（受限）

- [ ] 仅给 `shared/services/taskRunner.js` 加文件头注释：「内部工具，不加 service 后缀」。
- [ ] `shared/services/alertVisibility.js` 按 **D-3 待定**，本轮**跳过**并在交付报告中点名。
- **验收**：build / test 全绿；报告明确写出「D-3 未执行」。

### M10 · 收尾

- [ ] 若 `docs/handbook/technical/CLIENT_DEV.md` 列了旧路径，同步更新。
- [ ] 计划 §11 写每轮提交 SHA、删除清单、rename 映射、验证输出。
- [ ] 交独立 Reviewer：`git diff -M --stat` 应只见 rename / delete；`shared/**` 与 `server/routes/**` 函数体零变更。

## 6. Decisions（需 Human 决定）

| # | 事项 | 选项 | 建议 |
|---|---|---|---|
| D-1 | `asset` ↔ `instrument` 术语双轨是否本期统一 | (a) 不统一，仅文档记录映射；(b) 统一为 `instrument`（前端）并保留 `/api/assets` | **(a)**：统一需改路由与页面名，风险远超本期目标；建议后续单独立项 |
| D-2 | `/assets*` 三条兼容重定向去留 | (a) 保留一个版本周期；(b) 立即删除 | **(a)**：有书签/历史链接价值，且不影响「路由只含实际使用」的实质（它们是被使用的兼容路由） |
| D-3 | `shared/services/alertVisibility.js` 归宿 | (a) 改名 `alert/visibility.js` 归入 alert 域；(b) 仅加 `.service.js` 后缀 | **(a)**：与 `portfolio/`、`rebalance/` 的域目录风格一致 |

## 7. Verification

| AC | 验证方法 | 预期 |
|---|---|---|
| AC-01 死代码清理 | 每文件 grep 0 命中 + `git status` 确认删除 + build | 16+1 文件删除，build exit 0 |
| AC-02 每业务一个 service | `ls client/src/services` 对照 §4.4 表；`grep -rn "from '.*services/api'" client/src/pages client/src/components` | 11 业务 + 2 基础设施；页面零直连 api |
| AC-03 路由只含实际使用 | 人工通读 `router.jsx`；`grep` 无注释路由；路由可达性清单 | 无注释旧路由；兼容层显式 |
| AC-04 命名统一 | `ls` 三处目录对照 §4.2 规则 | 全部符合；例外有文件头说明 |
| AC-05 行为零变更 | `git diff -M --stat main...HEAD`；`git diff main...HEAD -- shared server/routes` 只应见 import 行 | 无逻辑 diff |
| AC-06 验证通过 | `npm run build --workspace client`、`npm run lint --workspace client`、`npm run test:server`、`npm run docs:check` | 全 0 失败 |
| AC-07 无误删 | P0 证据表 + 独立 Reviewer 抽查 | 无「仍被引用却删除」 |

手工回归清单（每阶段末尾各跑一次相关部分）：

- `/`（Dashboard：健康表、分币种小计、组合卡四格）
- `/portfolios`、`/portfolios/new`、`/portfolios/view/:id/{positions,position-history,rebalance,transactions}`
- `/portfolios/transactions`（跨组合聚合）、`/portfolios/:id/transactions/{new,edit,import}`
- `/instruments`、`/instruments/new`、`/instruments/:id`、`/assets*` 重定向
- `/prices`、`/prices/:symbol/history`、`/alerts/rules`、`/account`、`/account/users`、`/logs`、`/login`

## 8. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| 误判活代码 | 运行时崩溃 | P0 全仓 grep + 构建 + 手点；按文件粒度提交便于 revert |
| Windows 大小写改名失效 | import 断裂 | 两段式 `git mv`；改名后 `git diff -M` 复核 |
| 改名引入漏改 import | build 失败 | 每阶段 build；报错即修，不跨阶段 |
| 大范围移动触发 review 疲劳 | 漏审行为变更 | 每阶段单独 PR；Reviewer 以 `git diff -M` 抽查函数体 |
| 与其它任务并行冲突 | 合并冲突 | 本期串行执行；开工前 `git merge main` |

## 9. Rollback

- 每阶段一个提交（或一个小 PR），失败即 `git revert <sha>`；
- P5（目录移动）影响面最大，必要时 `git revert` 整段并保留 P1～P4；
- 无数据/迁移/依赖变更，回滚无副作用。

## 10. Implementer Handoff

- **输入**：本计划 §4 命名标准与目标目录、任务卡 §3 AC、§4 死代码清单；
- **授权**：须 Human 批准本计划（`Draft → Approved`）后实施；
- **边界**：不改 `shared/**` 与 `server/routes/**` 的函数体；不改 HTTP 路径与字段；不升级依赖；不统一 `asset/instrument` 术语（除非 D-1 改判）；
- **产出**：6 个阶段提交 + §11 实施记录 + 独立审查；
- **验证入口**：`DEPLOYMENT.md §7` + 本计划 §7 清单。

## 11. Implementation Record

**实施日期**：2026-11-11 ｜ **分支**：`feature/TASK-071-structure-cleanup` ｜ **改动范围**：`b90df89..d1e353d`（10 个模块提交）

> **基线说明（重要）**：本分支**基于 `b90df89`（TASK-072 分支末端）而非 `main`**。原因：`main` 上 `npm run lint --workspace client` 仍有 TASK-072 负责的 3 个 error，若从 `main` 开工会让「每轮 lint 全绿」无法成立，验收失去可信基线。等到 TASK-072 的 PR 由 Human 合入后，本分支可直接快进/变基到新 `main`，其自身 diff 仍是下面这 10 个提交。

### 11.1 M0 · 基线取证（不改代码）

`git rev-parse main` = `83be5e670fc8212137169bb2349c341095114bdb`。

**引用证据（两种方法交叉验证）**

方法一：对每个 basename 执行 `grep -rn "<basename>" client/src client/scripts server shared cron-worker`（排除 `node_modules`，只统计 `*.js/*.jsx/*.cjs/*.mjs`）。
方法二：对 `client/src` 全部模块建立相对 import 图，统计目标文件的入度。

结论：**16 个目标文件入度全部为 0**（`files with indegree>0: 0 / 16`）。方法一的剩余命中均为「文件自身内部的注释」或与目标无关的同名子串（如 `Header` 命中 `setHeader`/`authHeaders`、`Loading` 命中 `LoadingState`/`isLoading`），逐条核对后确认不是对目标文件的引用：

| # | 文件 | 字节 | 行 | basename 精确引用 | indegree |
|---|---|---:|---:|---|---:|
| 1 | `components/common/ErrorAlert.jsx` | 0 | 0 | 0 | 0 |
| 2 | `components/common/Header.jsx` | 284 | 12 | 0 | 0 |
| 3 | `components/common/Loading.jsx` | 0 | 0 | 0 | 0 |
| 4 | `components/layout/Header.jsx` | 580 | 20 | 0 | 0 |
| 5 | `components/layout/MainLayout.jsx` | 0 | 0 | 0 | 0 |
| 6 | `components/AddTransactionForm.jsx` | 1185 | 31 | 仅文件自身第 1 行注释 | 0 |
| 7 | `utils/chartConfig.js` | 0 | 0 | 0 | 0 |
| 8 | `utils/formatters.js` | 693 | 21 | 0 | 0 |
| 9 | `utils/helpers.js` | 0 | 0 | 0 | 0 |
| 10 | `utils/marketUtils.js` | 693 | 11 | 0 | 0 |
| 11 | `utils/symbolUtils.js` | 368 | 10 | 0 | 0 |
| 12 | `models/portfolio.js` | 975 | 28 | 0 | 0 |
| 13 | `models/transaction.js` | 822 | 28 | 0 | 0 |
| 14 | `hooks/useTransactions.js` | 734 | 25 | 仅文件自身第 1 行注释 | 0 |
| 15 | `pages/Portfolio/Basic.jsx` | 2547 | 54 | 0 | 0 |
| 16 | `pages/Portfolio/TargetAllocation.jsx` | 3927 | 94 | 0 | 0 |
| 17 | `shared/fetchers/IFetcher.js`（附加项） | 678 | 27 | 仅文件自身 | 0 |

**5 个 0 字节空文件**已逐一 `stat` 确认：`common/ErrorAlert.jsx`、`common/Loading.jsx`、`layout/MainLayout.jsx`、`utils/chartConfig.js`、`utils/helpers.js`。

`shared/index.js` 按任务卡 §4 说明**保留未删**（它是 `@portomind/shared` 的 `main` 入口）。

### 11.2 逐模块提交清单

| 模块 | 提交 | 内容 | 验证 |
|---|---|---|---|
| M1 | `675a03a` | 删 6 个旧布局/通用组件 | build/lint/test/docs 全绿 |
| M2 | `2204119` | 删 9 个死工具/模型/hook + `IFetcher` | 同上；`IFetcher` 全仓 0 命中 |
| M3 | `f89b533` | 删 2 个旧 Tab 页面 | 同上；`Detail.TABS` 已无二者 |
| M4 | `bf26368` | services 改名 3 个（两段式 `git mv`） | 同上；`git diff -M` 均识别为 rename |
| M5 | `c351c0b` | 拆 `user.service.js`、`position` 并入 `portfolio` | 同上；`import { api }` 在 pages/components 为 0 |
| M6 | `41ae21b` | 路由兼容层结构化 | 同上；无注释掉的 `<Route>` |
| M7 | `be0211b` | 11 个文件移入 `components/portfolio/` | 同上；18 页模块 + 5 个 Tab 组件全部解析成功 |
| M8 | `f124e07` | 服务端 4 个文件改名 | 同上；`test:server` 248 不变 |
| M9 | `6f9ebbd` | `taskRunner.js` 加文件头说明（受限） | 同上；`alertVisibility.js` 零改动 |
| M10 | `d1e353d` | 同步 `CLIENT_DEV.md` | docs:check 0 ERROR |

### 11.3 删除清单（17 个，合计 −361 行业务代码 + 附加项）

M1（6）：`components/common/{ErrorAlert,Header,Loading}.jsx`、`components/layout/{Header,MainLayout}.jsx`、`components/AddTransactionForm.jsx`
M2（9）：`utils/{chartConfig,formatters,helpers,marketUtils,symbolUtils}.js`、`models/{portfolio,transaction}.js`、`hooks/useTransactions.js`、`shared/fetchers/IFetcher.js`
M3（2）：`pages/Portfolio/{Basic,TargetAllocation}.jsx`

### 11.4 rename 映射

**前端 services（M4，两段式 `git mv`）**

| 原 | 新 | 相似度 |
|---|---|---|
| `services/api.js` | `services/api.client.js` | 98% |
| `services/authSession.js` | `services/auth-session.bus.js` | 96% |
| `services/cronStatus.service.js` | `services/cron-status.service.js` | 85% |

> 未达 100% 的原因：三处文件头注释与内部 import 同步改了名（`from './api'` → `from './api.client'` 等），**函数体与导出语义零变更**。

**其余文件移动/改名**

| 原 | 新 | 相似度 |
|---|---|---|
| `pages/Portfolio/{KpiCards,PortfolioHeader,PositionHistory,PositionOverview,Rebalance,RebalanceHistory,RebalanceSuggester,Transactions}.jsx` | `components/portfolio/同名` | 96~99%（仅注释/import 行） |
| `pages/Portfolio/{PortfolioRebalanceSettings.jsx,rebalanceTabContext.js}` | `components/portfolio/同名` | 100% |
| `server/routes/logs.routes.js` | `server/routes/log.routes.js` | 100% |
| `server/routes/rebalanceRecord.routes.js` | `server/routes/rebalance.routes.js` | 100% |
| `server/routes/cronStatus.routes.js` | `server/routes/cron-status.routes.js` | 75% |
| `server/controllers/cronStatus.controller.js` | `server/controllers/cron-status.controller.js` | 97% |

**service 收敛（M5）**：`position.service.js` 的 `getPositions` / `getPositionHistory` 原样并入 `portfolio.service.js`，原文件删除；`auth.service.js` 的 `listUsers/createUser/updateUser/resetUserPassword` 原样迁至新建 `user.service.js`。

### 11.5 收尾四项实跑（`d1e353d`）

```
$ npm run build --workspace client   → ✓ built in 2.70s（exit 0）
$ npm run lint --workspace client    → ✖ 5 problems (0 errors, 5 warnings)（exit 0）
$ npm run test:server                → ℹ tests 248 / pass 248 / fail 0
$ npm run docs:check                 → 扫描 138 份文档；链接 1421 条；ERROR 0；WARN 0
```

`test:server` 保持 **248**（含 TASK-072 新增的 8 条），服务端命名调整未触碰任何断言。

### 11.6 零行为变更证明

```
$ git diff --stat b90df89..HEAD -- server/controllers
（仅 cronStatus.controller.js -> cron-status.controller.js 的文件头注释 1 行）

$ git diff b90df89..HEAD -- server/app.js
（仅 3 条 require 路径变化；app.use('/api/logs' | '/api/rebalance' | '/api/cron') 未变）

$ git diff --stat b90df89..HEAD -- shared server/routes server/controllers
（8 files：4 个 rename 的注释/require 行、IFetcher.js 删除、taskRunner.js +7 行注释）
```

- **HTTP 路径零变更**：`/api/logs`、`/api/rebalance`、`/api/cron` 挂载点字节级未动。
- **`shared/` 业务实现零变更**：唯一改动是 `taskRunner.js` 的 7 行文件头注释；`IFetcher.js` 为死文件删除。
- **`server/controllers/` 逻辑零变更**：diff 中除文件头注释外没有任何代码行。
- **API 契约零变更**：本任务未修改 `API_CONTRACT.md`（符合 AC-05「无需修改」）。
- **前端产物无行为变化**：`client/dist/assets/` 的单包体积由 `index-DLXIi7Z5.js`（1,002,780 B）变为 `index-Cczvr2Wb.js`（1,002,777 B），**差 −3 B**；hash 变化源于模块路径/注释变动，体积差异在噪声量级，无功能增删（删除的文件本就未被任何模块 import）。**注意：hash 与产物名确实变了，不能声称「产物字节完全一致」**。

### 11.7 AC 对照

| AC | 证据 | 状态 |
|---|---|---|
| AC-01 死代码清理 | 17 个文件删除，逐个 indegree=0 + basename grep 取证；build 通过 | ✅ |
| AC-02 每业务一个 service | 11 业务 service + 2 基础设施；`import { api }` 在 pages/components 为 0 | ✅ |
| AC-03 路由只含实际使用 | 无注释掉的 `<Route>`；`/assets*` 按 D-2 保留并集中为兼容层 | ✅ |
| AC-04 命名统一 | 页面 PascalCase 保持；services 统一 `.service.js`（2 个基础设施例外已在文件头声明）；服务端 route/controller 同词根 | ✅ |
| AC-05 行为零变更 | 见 §11.6 | ✅ |
| AC-06 验证通过 | build / lint / test:server / docs:check 全绿 | ✅ |
| AC-07 无被引用代码误删 | §11.1 双重取证 + 构建 + 静态可达性校验（18 页面模块、5 个 Tab 组件全部解析） | ✅ |

### 11.8 未执行 / 需后续处理（如实报告）

1. **D-3 未执行**：`shared/services/alertVisibility.js` 的归宿（改名 `alert/visibility.js` 或加 `.service` 后缀）Human 未决定，本轮**跳过未动**，`git status` 确认该文件零改动。
2. **未做浏览器手点回归**：环境无可用浏览器，M3/M5/M7 的「手点 Tab / 页面」改为**静态可达性校验**（页面模块与 Tab 组件逐个解析存在性、导出形态），并配合 build 通过作为替代证据；**这不是真实点击**，Reviewer 若要求运行时证据需补做。
3. **发现但未修的既有缺陷**（不属本任务「只删/改名/移动」范围，仅记录）：
   - `ROUTES.PORTFOLIO_VIEW(id)` 生成 `/portfolios/view/:id/basic`，`basic` 已不在 `TABS` 内，靠 `Detail` 一次 redirect 兜底（`CLIENT_DEV.md` §8.2 已记录）；
   - `ROUTES` 存在 `PORTFOLIO_TX_TAB` 别名而无对应 `ROUTE_PATTERNS` 键（生成器别名，非路由，本轮未动）；
   - `deletePortfolio` 无任何页面调用 → 界面仍无删除组合入口（B2 级功能缺口）。
4. **PR 未创建**：本机无 `gh` CLI，环境亦无 GitHub API token（仅配置 SSH 推送）。分支已推送，PR 正文已拟好，**未合入 main**。


## 12. Review Record

**2026-11-11**：本任务**未执行独立 Reviewer 复核**——由 Human 直接确认完成并合入（PR #53）。按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §5.3 的独立复核要求，这属于**流程缺口**，已如实记录，不以「已验证」表述掩盖。建议后续如需强化，可对 `git diff -M` 做一次只读复核（重点：`shared/**`、`server/routes/**` 函数体零变更）。

## 13. Completion Record

**结案（2026-11-11）**

| 项 | 事实 |
|---|---|
| 覆盖 AC | AC-01～AC-07 全部满足（逐项证据见 §11 与任务卡） |
| 实现（M1～M10） | `675a03a` M1 · `2204119` M2 · `f89b533` M3 · `bf26368` M4 · `c351c0b` M5 · `41ae21b` M6 · `be0211b` M7 · `f124e07` M8 · `6f9ebbd` M9 · `d1e353d` M10 · `97c4b2c` §11 记录 |
| 删除量 | 16 个客户端零引用文件 + `shared/fetchers/IFetcher.js`（每个删除附全仓 grep 0 命中证据，见 §11） |
| 重命名 | `api.js→api.client.js`、`authSession.js→auth-session.bus.js`、`cronStatus.service.js→cron-status.service.js`；`logs.routes→log.routes`、`rebalanceRecord.routes→rebalance.routes`、`cronStatus.*→cron-status.*`（`git diff -M` 均为 rename，挂载路径不变） |
| 验证（2026-11-11 在 `main` 复跑） | build ✓；lint **0 error**（5 warning）；`test:server` **248 pass / 0 fail**；`docs:check` **0 ERROR / 0 WARN** |
| 行为零变更 | `shared/**` 与 `server/routes/**` 仅因改名产生 import 变化；HTTP 路径、payload、计算口径、API 契约均未改 |
| 关闭依据 | Human 2026-11-11 确认「071、072 已经完成」；按 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态) 登记 `Completed` |
| 合入 | **PR #53** → **`ff118f4`**；`Merged` = `ff118f4` |
| 残余 | ① **D-3 未执行**：`alertVisibility.js` 未改名（待单独立项）；② `deletePortfolio` 无界面入口（既有缺口，不属本任务）；③ `ROUTES.PORTFOLIO_TX_TAB` 为生成器别名、无对应 `ROUTE_PATTERNS` 键（未动） |

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
