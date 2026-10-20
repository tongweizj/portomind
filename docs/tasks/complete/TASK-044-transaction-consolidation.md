# TASK-044 — 交易记录收拢进组合管理

## Metadata

**Status:**  
`COMPLETED` — **2026-10-19**。全链路闭环：`Approved`（2026-10-18）→ 实现 → 两轮独立评审（§9 / ExecPlan §11.9）→ R-1/R-2 整改（§10）→ 全系统验证 build / lint / 路由 13-13 / `npm test` 229-229（ExecPlan §11.10）→ **Human 提交 `30dc525`** → **Human 最终验收通过**（§11 Completion Record）。

**Priority:**  
`High`

**Owner:**  
`Human`（提交合并 + 最终验收，2026-10-19）→ 已关闭；遗留项移交 `TASK-046` / `TASK-047` / `TASK-048`

**Created:**  
`2026-10-18`

**Updated:**  
`2026-10-19`（`Completed`，归档记录见 §11）

**Related Product Spec:**  
`docs/product/specs/FS-transaction-consolidation.md`（**✅ 已批准 2026-10-18**）

**Related ADR:**  
`None`

**Execution Plan:**  
`docs/exec-plans/complete/TASK-044-transaction-consolidation.md`（**✅ Approved 2026-10-18 → Completed 2026-10-19**）

---

## 1. Goal

把「交易记录」从与组合并列的顶层频道，收拢为**组合的子资源**：侧边栏引入二级导航（「组合管理」下挂「组合列表」与「全部交易」），顶层导航 7 → 6；组合详情「交易记录」Tab 补全读写；新增 `/portfolios/transactions` 跨组合聚合页；CSV 导入仅在组合内发起；旧 `/transactions` 路由族删除且不做重定向；交易表格收敛为单一实现并修复三个既有缺陷。

## 2. Why

- **数据层早已收拢，UI 层却割裂**：`Transaction.portfolioId` 必填 + 索引，交易不可能脱离组合存在，但界面上它是独立频道。
- **组合内是死胡同**：`PortfolioHeader.jsx:112` 已有按钮跳组合内交易 Tab，但该 Tab 纯只读，用户无法在组合里新增交易，必须退回顶层再手动选组合。
- **同一份数据两套实现**：顶层自建 `<table>`（零筛选）与组合内 `TransactionTable`（只读、英文表头）行为持续漂移，已产生三个实际缺陷（分红显示为卖出、`$` 硬编码、`assetType` 英文）。
- **跨组合查账能力必须保留**：用户为「3 个独立组合 + 家庭层」结构，收拢不能以丢功能为代价。

## 3. Scope

**In Scope**：FS §6 的 R1–R8（P0）；附录 A 的 Bug-1/2/3 修复。

**Out of Scope**：数据模型改动、数据迁移、「再平衡建议 → 一键记账」闭环、CSV 导入批次回滚、交易业务口径（成本/超卖/fee/分红/整手）任何变更、认证授权。（详见 FS §3）

## 4. Blocking Dependencies

| 编号 | 依赖 | 状态 | 说明 |
|---|---|---|---|
| **B1** | **FS 评审批准（Human Intent）** | ✅ **已解除** | `FS-transaction-consolidation.md` 已于 **2026-10-18 经 Human 批准**（范围 R1–R8 / P0），构成 Human Intent。ExecPlan 可据此产出。 |
| ~~B2~~ | ~~OQ1（是否动服务端）~~ | ✅ **已解除** | Human 裁决：交易查询筛选**拆为独立需求** `FS-transaction-query-filters.md`（TASK-045，Backlog），本次不做。**本任务确认为「仅前端改动」**，不新增任何服务端查询参数。 |

## 5. Acceptance Criteria

| # | 验收标准 | 对应 |
|---|---|---|
| AC1 | 侧边栏顶层为 **6** 项；「组合管理」可展开，其下为「组合列表」与「全部交易」；顶层无「交易记录」 | R1 |
| AC2 | 组合详情「交易记录」Tab 可就地完成新增 / 编辑 / 删除 / 导入；`portfolioId` 锁定为当前组合且不可手动修改 | R2 |
| AC3 | `/portfolios/transactions` 可跨组合列出流水，含**组合**列，支持按组合与标的筛选、分页，行内可跳回所属组合的交易 Tab；页面由**改造后的 `TransactionList.jsx`** 承载，不新起页面 | R3 / OQ5 |
| AC4 | 写操作路由为 `/portfolios/:id/transactions/{new, edit/:txId, import}`，`portfolioId` 取自路径且不可手选；`/portfolios/transactions` **不被 `:id` 模式误匹配** | R4 / OQ2 |
| AC5 | 全仓无 `/transactions` 路由；无任何指向 `/transactions` 的残留跳转（含 `navigate('/transactions')`） | R5 |
| AC6 | 交易表格**仅一处实现**，两处使用点共用；组合列在聚合页显示、在组合内隐藏 | R6 |
| AC7 | CSV 导入入口只在组合内出现；导入页无组合下拉选择器 | R7 |
| AC8 | `buy/sell/div_cash/div_reinvest` 两处显示一致且均为中文（分红两类不再显示为「卖出」） | R8 / Bug-1 |
| AC9 | 价格按交易自身 `currency` 显示，不再硬编码 `$`；`assetType` 显示中文 | Bug-2 / Bug-3 |
| AC10 | 交易业务口径零回归：超卖校验、`fee` 含费/扣费、分红两类语义、A 股整手提示全部保持现状，且**写路径仍经服务端校验**（不得前端绕过） | NG4 / FS D5 |
| AC11 | 「组合管理」二级导航展开态**不持久化**，刷新后回到默认态 | OQ4 |
| AC12 | **零服务端改动**：`server/` 与 `shared/` 无本次引入的 `.js` 变更（交易查询筛选已拆出至 TASK-045） | OQ1 / NG7 |

## 6. Risks

| 编号 | 风险 | 应对 |
|---|---|---|
| R-1 | ~~与 TASK-043 的文件交叉~~ | **已解除**：TASK-043 改动固化于 commit `891d0f7`，已在 `TASKS.md` 标记 Done。本任务在其之上继续修改 `Sidebar.jsx` / `router.jsx` 属正常增量演进 |
| R-2 | 删除旧路由后的外部书签失效 | Human 已裁决「删除，不做处理」，接受 |
| R-3 | 双表格合并时把只读逻辑直接复用，导致写路径绕过校验 | AC10 + Reviewer 必须独立验证写路径 |
| R-4 | PL-1 文档判定冲突 | FS 批准后同步修订 `PL-1-ledger.md` §4/§5 的 TR-01 |

## 7. Coordination Notes

- 由 Orchestrator 于 2026-10-18 登记。**七项 Human 裁决**已固化于 FS §11：方案甲 / 二级导航 + `/portfolios/transactions` / 导入仅组合内 / 旧路由删除不重定向 / OQ1 拆出独立需求 / 写操作路由带组合 id / 展开态不持久化 / 旧列表页改造复用。
- **2026-10-18 FS 获批**（Human 口头指令「请设置为已批准」）→ B1 解除，本任务进入 `PLANNING`，交接 Planner。
- **范围已确定收敛为「仅前端」**：交易查询筛选拆至 TASK-045（Backlog），本任务不新增服务端参数（AC12 可验证）。
- **2026-10-18 ExecPlan 已产出并获批**：`docs/exec-plans/complete/TASK-044-transaction-consolidation.md`（原在 `active/`，2026-10-19 归档）经 Human 完成 Plan Review，状态 `Plan Review` → **`Approved`**。批准范围 R1–R8（P0）+ Bug-1/2/3，零服务端改动不变；§6 声明无待决项，批准无遗留未决。
- 下一步：派 **Implementer** 按 ExecPlan §4 设计 / §5 拆解实施 → 自查构建与 lint → 交**独立 Reviewer** 审查（禁止 Implementer/Orchestrator 自判通过，见 TASK-043 四轮审查教训）→ 通过后 Integrator 收口。

---

## 8. Implementation Handoff（2026-10-18）

**已实现，进入 `VERIFYING`。** 变更明细、与计划的 6 处差异（D-1~D-6）、自测结果见 ExecPlan §10。

要点：

- **改动面全部在 `client/`**：`server/`、`shared/`、`cron-worker/`、`client/package.json` 均无改动（AC12 已验证）。
- **单表化落点**：`client/src/components/TransactionTable/` 为唯一实现，两处使用点 = 「全部交易」聚合页（`showPortfolio`）与组合详情交易 Tab（`onEdit/onDelete`）。
- **路由**：`/portfolios/transactions`（聚合）与 `/portfolios/:id/transactions/{new,edit/:txId,import}`（写）已实测互不误匹配，旧 `/transactions` 族无残留。
- **自测**：build exit 0；eslint 0 error / 0 warning；`node client/scripts/verify-transaction-routes.mjs` → `PASS 13 / 13`；**真实浏览器走查 `PASS 38 / 38`**（`client/scripts/e2e-task-044.mjs`，跑在 `portomind_e2e` 副本上，未触碰真实库，详见 ExecPlan §10.4）。
- **走查中发现、未处理**：同一 CSV 二次导入时后端未跳过重复（属 TR-09 既有缺口 / NG4 交易口径，需另立项）。
  - → **已立项 `TASK-046`**（2026-10-19，`docs/tasks/active/TASK-046-csv-import-dedup.md`）。根因已定位：`shared/services/transaction.service.js:233` 投影漏 `portfolioId` → 库内比对键恒为 `undefined|…` → 永不命中。**与本任务无关**，本任务仍维持 `server/`、`shared/` 零改动。

---

## 9. Review Record（独立 Reviewer，2026-10-19）

**结论：有条件通过。** 完整评审记录（实测命令与输出、逐条判定、证据行号、整改要求）见 ExecPlan **§11**。

- **已独立复核**：构建 exit 0（2403 modules）、`eslint` 0 error/0 warning、`verify-transaction-routes.mjs` PASS 13/13、AC5 死链 grep、AC6 单表 grep、AC12 `server/shared/cron-worker` 零改动、`currency` 字段确实存在（Bug-2 修复成立）、写路径仍经服务端（AC10）。
- **未独立复核**：§8 所述浏览器走查 38/38 未由 Reviewer 重跑（需实时 API + DB 副本），仍属实现者举证；已审读脚本，断言计数确为 38，但发现 2 处恒真断言（M-5）。
- **须处理（阻塞 Integrating）**：R-1 两处未申报改动（`client/vite.config.js` dev proxy、`docs/manual/CRON_WORKER.md` 重排版并删去「（同一实现）」）；R-2 `CLIENT.md` 保留已失效陈述「与库里完全相同的记录自动跳过」（与 TASK-046 事实冲突）。
- **建议（不阻塞）**：M-1 写路由侧边栏无激活态（回归）· M-2 编辑页跨组合静默改归属 · M-3 `Family.jsx` 第三处二元 action 映射（分红渲染为 `undefined`）· M-4 `docs/readme.md` 未登记新文档 · M-5 E2E 两处恒真断言 · M-6 路由验证脚本复制路由表。
- **角色纪律**：本次评审**未修改任何业务代码**；`Completed` 与最终验收属 Human。

---

## 10. R-1 / R-2 整改记录（Implementer，2026-10-19）

按 ExecPlan §11.4 与 §11.7 第 1 步处理，**未采纳 M-1~M-6**（待 Human 决定去向）。

| # | 处理 | 落点 | 结果 |
|---|---|---|---|
| **R-1a** | dev proxy **保留改动但改为 env 可覆盖**（申报为 ExecPlan §10.2 D-8） | `client/vite.config.js:12` → `process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080'` | 默认本机 8080；`VITE_API_PROXY_TARGET=http://10.0.0.9:9999` 实测生效 → 不再把个人地址硬编码进共享配置 |
| **R-1b** | `CRON_WORKER.md` **整文件回退**（申报为 D-9） | `git checkout -- docs/manual/CRON_WORKER.md` | 该文件已不在 `git status` 中；被误删的事实性表述「（同一实现）」已恢复（TASK-005 后该表述仍成立） |
| **R-2** | `CLIENT.md` 失效陈述**显式标注** | `docs/manual/CLIENT.md:71` | 改为「重复记录**本应**自动跳过，但该去重当前**不生效**（见 TASK-046），导入前请自行确认」 |

**整改后重跑验证**

| 项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build --workspace client` | exit 0，2403 modules |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | 0 error / 0 warning |
| AC4/AC5 路由 | `node client/scripts/verify-transaction-routes.mjs` | `PASS 13 / 13` |
| AC12 零服务端 | `git status --short server shared cron-worker client/package.json` | 无输出 |

**已处理（更正记录，2026-10-19 Orchestrator）**：`docs/product/lines/PL-1-ledger.md:179` 的「幂等去重」**已新增失效标注**「⚠️ 当前实现失效（2026-10-19 核实）…缺陷跟踪 TASK-046」，与 `CLIENT.md:71` 口径一致。

> 为何判定应改而非「口径不同可并存」：该行位于 `PL-1` §6「**架构实现明细**」→ `TR-09 CSV 导入功能细节` → 「后端：… 2. **幂等去重** …」，描述的是**代码实际行为**，不是需求意图。文档声称「已实现幂等」而实现失效，属事实错误。仅加标注，未改需求语义；TASK-046 修复后由 PM 删除该标注。详见 ExecPlan §11.8。
>
> ~~原记录曾写「未擅改，提请 Human 裁决」~~ → 已按上述判断执行，见 ExecPlan §11.9 **N-2**（记录与事实不符，现已更正）。

---

## 11. Completion Record（2026-10-19）

| 项 | 内容 |
|---|---|
| 状态流转 | `Approved`（2026-10-18 Plan Review）→ `Implementing` → `Verifying` → `Reviewing`（两轮独立评审）→ `Integrating`（全系统验证）→ **`Completed`（2026-10-19）** |
| 提交 | `30dc525` — `TASK-044 交易记录收拢进组合管理`（Human 执行） |
| 提交后工作区 | `git status --short` 空输出 |
| 最终验收 | Human 于 2026-10-19 声明已提交并指令置 `Completed`；依 `EXECUTION_PLANS.md §7 Ownership`，最终验收属 Human，此为一次有效表达 |
| 归档位置 | 任务卡 `docs/tasks/complete/TASK-044-transaction-consolidation.md`；ExecPlan `docs/exec-plans/complete/TASK-044-transaction-consolidation.md` |
| 验收结果 | AC1–AC12 全部满足；AC12「零服务端改动」由 `git status server shared cron-worker` 空输出确认 |
| 用户可见结果 | 侧边栏顶层 7 → 6 项（「组合管理」下挂「组合列表」/「全部交易」）；`/portfolios/transactions` 跨组合聚合；写操作走 `/portfolios/:id/transactions/{new,edit/:txId,import}`；旧 `/transactions` 族删除且无重定向；交易表格收敛为 `components/TransactionTable` 单一实现（1 定义 2 使用）；顺带修复分红显示为卖出、`$` 硬编码、`assetType` 显示英文三个既有缺陷 |
| 遗留移交 | `TASK-046` CSV 幂等失效（P0 数据风险）· `TASK-047` M-1/M-2/M-5/M-6 · `TASK-048` M-3 分红标签 · `TASK-045` OQ1 筛选查询（Backlog） |
| 未做 | Orchestrator 未执行任何 `git` 写操作（无合并授权）；未改验收标准；未动 `server/` `shared/` `cron-worker/` |

> 本卡归档后不再变更。后续问题一律在对应任务卡内跟踪，不回写本文。
