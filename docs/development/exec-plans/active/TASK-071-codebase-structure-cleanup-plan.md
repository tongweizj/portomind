# TASK-071 — 代码结构清理实施计划（零行为变更）

## Status

Status：Approved（2026-11-11，Human 指令「一次性完成 071、072 两个任务」；`Draft → Approved` 归 Human）

Related Task：[TASK-071](../../tasks/active/TASK-071-codebase-structure-cleanup.md)（独立维护任务，无 Story）。

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

（实施时填写。）

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
