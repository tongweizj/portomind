# TASK-071 — 代码结构清理（不改业务行为）

## Metadata

| 字段 | 内容 |
|---|---|
| Status | **Implementing（2026-11-11）**：计划已由 Human 批准（`Draft → Approved`），按 [STATES.md](../../../os/process/STATES.md#4-谁可以改变状态) 登记 `Planning → Implementing`；**按模块分批实施**（一次只清一个模块） |
| Priority / Owner / Type | `High` / Implementer（待指派） / `Refactor`（结构清理，零行为变更） |
| Created / Updated | 2026-11-09 / 2026-11-11 |
| 所属 Story | 无（独立维护任务；不新建 Story） |
| 覆盖的验收条件 | 见 §3（AC-01～AC-07） |
| Related | [ARCHITECTURE.md §7](../../../os/architecture/ARCHITECTURE.md)、[GIT.md](../../../os/standards/GIT.md)、[TESTING.md](../../../os/standards/TESTING.md) |
| Execution Plan | [Draft：TASK-071-plan](../../exec-plans/active/TASK-071-codebase-structure-cleanup-plan.md) |

## 1. 问题

US-004 交付完成后（`v1.0.0`，`release/v1.0` @ `d87f81d`），仓库里积累了多轮迭代留下的结构债：

- **死代码**：前端 16 个文件已无任何引用（含 3 个 0 行空文件、1 个旧产品名占位 Header、2 个已被 Tab 取代的旧页面），共约 361 行；
- **命名不一致**：服务端 `logs.routes.js` ↔ `log.controller.js`、`rebalanceRecord.routes.js` ↔ `rebalance.controller.js`；前端 `api.js` / `authSession.js` 无 `.service` 后缀；`cronStatus.*` 驼峰与其它文件名风格不同；
- **业务边界错位**：`auth.service.js` 同时承载认证与用户管理；`position.service.js` 是 portfolio 子资源却独立成文件；
- **目录语义混淆**：`client/src/pages/Portfolio/` 下 10 个文件其实是 Tab 子组件而非路由页面；
- **术语双轨**：UI/路由用 `instruments`，服务/页面/接口用 `asset`，阅读时需来回换算。

结果：新人和 Agent 都要花额外时间判断「哪个是现行实现、哪些是历史残留」。

## 2. Scope

**In Scope**

- 删除零引用文件（附引用证明）
- 纯重命名 + 更新 import（文件/目录名，不改导出语义）
- 目录归位（`pages/` 中非页面组件移出）
- 前端 API service 按业务收敛（拆分/合并文件，函数与 URL 不变）
- 前端路由文件清理（注释、遗留重定向的显式化）

**Out of Scope**

- 任何业务逻辑、计算口径、校验规则变更
- 任何 HTTP 路径、请求/响应字段、错误码变更
- `shared/` 业务实现重构、数据库/模型/迁移变更
- 依赖升级、构建工具替换、引入 TypeScript
- 视觉/交互调整

## 3. Acceptance Criteria

- [ ] **AC-01 死代码清理**：§4 清单内 16 个零引用文件删除；每个删除附「全仓 grep 无引用」证据；`npm run build --workspace client` exit 0。
- [ ] **AC-02 每类业务只有一个前端 API service**：目标业务域 = 认证、用户、组合（含持仓）、交易、价格、标的、提醒、家庭、再平衡、日志、调度状态，各恰一个 `*.service.js`；页面/组件不得直接 `import { api }`（现状已满足，需保持）。
- [ ] **AC-03 路由文件只包含实际使用的路由**：`client/src/router.jsx` 与 `constants/routes.js` 无注释掉的旧路由；遗留重定向（`/assets*`）逐条保留或删除并记录理由；`*` 通配保留。
- [ ] **AC-04 命名统一**：页面组件 PascalCase（已满足，需在迁移后保持）；`client/src/services/*` 统一 `.service.js` 后缀（基础设施例外显式声明）；服务端 `controller` / `routes` 一一对应且同词根。
- [ ] **AC-05 行为零变更**：服务端路由表、`shared/` 业务实现、API 契约零 diff（重命名文件除外）；`docs/handbook/technical/API_CONTRACT.md` 无需修改。
- [ ] **AC-06 验证通过**：`npm run build --workspace client` exit 0；`npm run lint --workspace client`（或 `npx eslint`）0 error；`npm run test:server` 全绿；`npm run docs:check` 0 ERROR。
- [ ] **AC-07 无被引用代码误删**：删除前逐文件 `grep -rn "<basename>" client/src client/scripts server shared cron-worker` 为 0 命中；构建与人工抽查关键页面通过。

## 4. 已核实的死代码清单（2026-11-09，引用扫描）

扫描方法：对 `client/src` 108 个 `.js/.jsx` 建立相对 import 图（含目录 `index.jsx` 解析），统计入度；对 `shared/server/cron-worker` 另做 `@portomind/shared/*` 解析。**入度 0 且非入口**：

| # | 文件 | 行数 | 判定依据 |
|---|---|---:|---|
| 1 | `client/src/components/AddTransactionForm.jsx` | 31 | 已被 `pages/Transaction/AddTransaction.jsx` 取代 |
| 2 | `client/src/components/common/ErrorAlert.jsx` | 0 | 空文件；现行错误态用 `components/DataState` |
| 3 | `client/src/components/common/Header.jsx` | 12 | 旧占位标题「ETF 基金价格追踪系统」；现行用 `layout/AppLayout` |
| 4 | `client/src/components/common/Loading.jsx` | 0 | 空文件；现行 `DataState.LoadingState` |
| 5 | `client/src/components/layout/Header.jsx` | 20 | 无引用；现行顶栏在 `AppLayout` |
| 6 | `client/src/components/layout/MainLayout.jsx` | 0 | 空文件 |
| 7 | `client/src/hooks/useTransactions.js` | 25 | 0 引用；交易页直接用 `transaction.service` |
| 8 | `client/src/models/portfolio.js` | 28 | 仅 JSDoc typedef，无 import |
| 9 | `client/src/models/transaction.js` | 28 | 同上 |
| 10 | `client/src/pages/Portfolio/Basic.jsx` | 54 | 旧 Tab，已被 `PositionOverview` 取代（`Detail.jsx` 的 `TABS` 无此项） |
| 11 | `client/src/pages/Portfolio/TargetAllocation.jsx` | 94 | 旧 Tab，已被 `Rebalance` + `PortfolioRebalanceSettings` 取代 |
| 12 | `client/src/utils/chartConfig.js` | 0 | 空文件 |
| 13 | `client/src/utils/formatters.js` | 21 | 0 引用 |
| 14 | `client/src/utils/helpers.js` | 0 | 空文件 |
| 15 | `client/src/utils/marketUtils.js` | 11 | 0 引用 |
| 16 | `client/src/utils/symbolUtils.js` | 10 | 0 引用 |

合计 **361 行**（其中 5 个为 0 行空文件）。

另：`shared/fetchers/IFetcher.js`（27 行，仅注释 `@interface`，文件头写的是旧路径 `server/services/fetchers/`）— 0 引用，建议同批删除。

> 保留但需说明：`shared/index.js` 是 `@portomind/shared` 的 `main` 入口（`shared/package.json`），即使内部无人 import 也不是死代码，**不删**。

## 5. 风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 误删被判活 | 扫描未覆盖动态 `import()` / 字符串 require | 删除前 grep 全仓（含 scripts/tests/docs），构建 + 手点关键页 |
| 重命名打断 import | Windows 大小写不敏感，改名可能不生效或漏改 | 用 `git mv` 两段式改名（先改临时名再改正式名），每步跑 build/eslint |
| 术语统一引发大面积改动 | `asset`↔`instrument` 跨 UI/路由/接口 | **本期不统一术语**，只在注释/文档层记录映射，代码名保持 |
| 与评审并行冲突 | 大范围改名互相覆盖 | 按 §阶段分批提交、每批一个 PR |

## 6. 依赖与顺序

1. 基线已封板：`v1.0.0` / `release/v1.0`；
2. 计划已由 Human 批准（`Draft → Approved`，2026-11-11），任务已登记 `Implementing`；
3. **按模块分批，一次只清一个模块**（详见计划 §5）：`M1` 旧布局组件 → `M2` 死工具/模型/hook → `M3` 旧 Tab → `M4` services 改名 → `M5` service 收敛 → `M6` 路由 → `M7` 目录归位 → `M8` 服务端命名 → `M9` shared 命名（`alertVisibility` 按 D-3 待定、跳过）→ `M10` 收尾。每轮一个提交、一轮一验收。

## 7. Coordination Notes

- 每阶段单独提交、单独验收；**任一阶段 build 失败即回滚该阶段**，不连带后续。
- 不修改 `shared/` 业务实现；若发现 `server/controllers` 内有业务逻辑，只记录、不在本任务搬移（属后续独立任务）。
- 本卡不含 `Status` 推进动作；`Planning → Implementing` 由 Orchestrator 在计划获批后登记。
