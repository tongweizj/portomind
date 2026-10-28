# Tasks

## Active

> **在途**：`TASK-058`（账号与访问控制）**REVIEWED**——U1（后端认证内核）已实施且独立 Reviewer 三轮 PASS（211/0 + 77/0 + 真实 Mongo E2E 15/15）；**U2（前端登录/账户/守卫/401/顶栏下拉）+ U3（管理员系统设置页）已于 2026-10-27 晚实施完成并通过独立 Reviewer 真实浏览器验收 28/28 PASS**（真实 Chrome + 真 server + 真 Mongo 临时库 + vite dev；代码复核无 BLOCKER/MAJOR，6 条 MINOR 不阻塞）；待 Human 合入。`68f040c` 那次「feat(client) 零文件」的 `FAIL` 记录保留在卡内 §10。**原型线三卡 `TASK-059` / `TASK-060` / `TASK-061` 已于 2026-10-27 同日结案并归档 `complete/`**（四套断言 174 条全绿）。`TASK-054`（`GET /api/cron/status`）**已完成 2026-10-27 并归档 `complete/`**（三轮独立复核 + 第四轮回归复核全 PASS，180-0 / 77-0；**代码仍在分支 `c7389d1`，尚未合入 `main`**）；`TASK-050` 已于 2026-10-26 结案并合入 `main`（`cafcc5d` / PR #35）。
>
> 分支现状（2026-10-27 核实）：`main` = `origin/main` = **`1895530`**；`feature/TASK-054-cron-status-aggregate-api` = `c7389d1`（**未合并**，待 Human 提 PR）。**`main` 是最全基线，新任务直接从 `main` 拉分支。**
>
> **`Approved` ExecPlan 现有 2 份**（均 `TASK-058`）：U1（2026-10-26，`Completed` 待归档）与 U2/U3（2026-10-27，`Completed` 待归档，`TASK-058-authentication-client.md`）。`TASK-054` 的 ExecPlan 已随任务结案归档（`exec-plans/complete/`）。下表 Backlog 中的其余任务均需 Human 先确认优先级、再由 Planner 产出 `Approved` ExecPlan 才能动代码。**原型类任务免 ExecPlan（先例已结案）**：`TASK-059` / `TASK-060` / `TASK-061` 都是文档/原型整改（零业务代码），清单确认即可执行；同类任务沿用。

| ID | Task | Priority | Status | Owner | ExecPlan |
|---|---|---|---|---|---|
| TASK-058 | 账号与访问控制（用户模块；U1 后端内核 + U2 前端登录/账户 + U3 用户管理页） | **Critical** | **REVIEWED**（2026-10-27 晚）**待 Human 合入**：U1 已完成且独立 Reviewer **三轮复核 PASS**（第一轮 3 MAJOR+8 MINOR 全整改，第二/三轮无遗留）。U1 产出：`User`/`Session` 模型 + `user/session.service` + `requireAuth`/`requireAdmin` + `/api/auth/*`（5）+ `/api/users/*`（4）+ 默认 `admin/admin` seed + 登录限速 + CORS 白名单 + JSON-only + `TRUST_PROXY` + 8 个既有 HTTP 测试改造；验证 211/0、77/0、真实 Mongo E2E 15/15。**U2/U3 已完成并通过独立真实浏览器验收 28/28 PASS（EXIT=0）**：`AuthProvider`（`['session']`）/`RequireAuth`/`safeNext`/axios 401 拦截/强制改密闸门 + `/login`/`/account`/`/account/users` + 顶栏头像下拉（身份行 + 账户设置 + 系统设置〔仅 admin〕+ 提醒规则 + 退出登录）+ 侧栏 5→4 并删除假「退出登录」+ 用户表格/新建/停用启用/重置密码/改角色/唯一启用 admin 禁用态；服务端仅追加 `lastLoginAt`（D-2）与开发态 CORS 6600（D-3）；`client/.env*` 改同源默认 + axios `withCredentials`。代码复核无 BLOCKER/MAJOR（6 条 MINOR 不阻塞，见 U2/U3 ExecPlan §12.4）。验证：build 0 / 2423 modules、`eslint src` 0-0、server 211/0、worker 77/0、E2E 28/28。⚠️ **发布约束：U1 与 U2 必须同批上线**（U1 单独上线 = 全站 401）。`68f040c` 那次「`feat(client)` 零文件」的 `FAIL` 记录保留在卡内 §10（含 §10.7 全量复核）与 §11 重实施记录。 | `Planner`（已交付）→ `Implementer`（U1；U2/U3 Lead + `users-admin`）→ 独立 `Reviewer`（U1 三轮 PASS；U2/U3 `ui-verify` 28/28 PASS）→ `Human`（待合入） | U1 [`exec-plans/active/TASK-058`](../exec-plans/active/TASK-058-authentication-kernel.md)（`Completed` 待归档）· U2/U3 [`exec-plans/active/TASK-058-client`](../exec-plans/active/TASK-058-authentication-client.md)（`Completed` 待归档） |

## Backlog

> 已立项但**不排期**。启动前需 Human 重新确认优先级。

| ID | Task | Priority | 说明 | Spec |
|---|---|---|---|---|
| TASK-045 | 交易流水查询与筛选 | Medium | 由 TASK-044 的 OQ1 拆出，本次不做；需动 `server/` + `shared/` 且可能新增索引 | `docs/product/specs/FS-transaction-query-filters.md` |
| TASK-046 | CSV 二次导入未去重（幂等失效） | High | **根因已定位**：`transaction.service.js:233` 的 `select()` 漏 `portfolioId`，库内比对键恒为 `undefined\|...`，永不命中 → `skipped` 恒 0；既有测试 mock 无视投影故全绿。修 1 行 + 修测试 | `docs/tasks/active/TASK-046-csv-import-dedup.md` |
| TASK-047 | TASK-044 审查遗留整改（M-1/M-2/M-5/M-6） | High | **M-2 已定方案②（2026-10-19 Human 裁决）**：URL 组合 id 与交易归属不符时**静默迁移归属**，后端 `updateTransaction` 亦接受改写 → **后端拒绝改写 `portfolioId`**（放开 `shared/`，仅限该守卫）+ 前端报错。另含导航无高亮回归（M-1）、E2E 恒真断言（M-5）、路由脚本复制表（M-6）。M-3 已拆出 TASK-048（✅ 2026-10-20 已完成结案）；M-4 文档索引已闭环。**唯一阻塞：待 Planner 产出 ExecPlan** | `docs/tasks/active/TASK-047-review-followups.md` |
| TASK-051 | 家庭折算汇率方向反了（`rateToCny` 存成 `1 CNY = X 外币`） | High | 由 `TASK-050` 实施期 **F-1** 立项（2026-10-21）。采集端取 `open.er-api.com/v6/latest/CNY`（`1 CNY = X 外币`）却当 `rateToCny`（`1 外币 = X 人民币`）入库，折算再乘 → **USD/CAD 严重低估、HKD 反被高估 37.6%**；真实数据实测 `totalCny` 3,151 vs 修正后 76,128（**偏差 24 倍**）。`fxRate.service` 零单测、既有测试手填 `7.2` 绕过采集端故全绿；手动录入 `7.2` 可修但次日 09:30 cron 覆盖回错值。**待 Human 裁决 OQ1（修采集端 / 折算端 / 双字段）与 OQ2（历史数据处置）** | `docs/tasks/active/TASK-051-fx-rate-direction.md` |
| TASK-052 | Agent 运行规则（docs 治理层）审计与整改 | High | 两轮审计合并：2 份 0 字节（`REVIEWER.md` / `EXEC_PLAN_TEMPLATE.md`）、1 份断尾（`EXECUTION_PLANS.md`）、5 份未本地化模板被引为权威、状态词三套并存、任务卡模板合规 52.7%、看板与事实 12 处失配。整改分三批（文档修复 / 规则补全 / `docs:check` 校验环），**不碰 `client/ server/ shared/ cron-worker/`**。待 Human 批准范围与顺序 | `docs/tasks/active/TASK-052-agent-rules-update.md` |
| TASK-053 | 日志频道「任务运行看板」tab 骨架（FS **C-01**） | High | `FS-cron-worker-status-board` P0 卡片转卡。`/logs` 内新增置顶 tab（含总览条 + 5 卡网格），原两个原始视图零回归；tab 状态落 URL；`/logs` 子树**只读**（NG6）。**无技术依赖，可与 TASK-056 先行**。⚠️ 检测式须限定 `/logs` 子树——`useMutation` 全仓存在（`hooks/useAlerts` / `useFamily`） | `docs/tasks/active/TASK-053-log-board-tab-skeleton.md` |
| TASK-055 | 价格同步「数据态完成度」展示（FS **C-03**） | High | 价格卡的「目标市场日（上一开市日）+ 应采/已采 + 进度条 + missing 清单」；四态色阶（绿/黄/红/灰）、`0/0` 不出 `NaN`、`fetched>expected` 不溢出、接口失败不拖垮全页。**硬前置 `TASK-053` 仍待做；`TASK-054` 已完成（2026-10-27），B4 已解除**；颜色引用 TASK-056 的 token | `docs/tasks/active/TASK-055-price-completeness-display.md` |
| TASK-056 | 看板系统状态色语义与图例（FS **C-04**） | High | 新增 4 个**系统状态** token（禁复用行情 `up`/`down`）+ 首屏图例 + "红=坏绿=好"文案；非颜色标识兜底（色盲）；对比度 ≥4.5:1。⚠️ 实证：`priceDisplay.js` **已把红色同时用于"涨"和"缺口"**，是本卡的直接动因。**无数据依赖，可与 TASK-053 先行** | `docs/tasks/active/TASK-056-status-color-semantics.md` |
| TASK-057 | `taskruns` 数据契约增强（`result` / `SKIPPED` / 再平衡父任务）（FS **C-05**） | High | **P0 批次的数据底座**：① schema 加 `result: Mixed`（现无 → strict **静默丢弃**）；② `normalizeCounts` 白名单放开**显式** `result` 透传；③ `SKIPPED` 落库；④ 补父任务 `rebalance-check` + `result.perPortfolio[]`。⚠️ **实库核查（204 条）**：含 `result` 的 **0 条**、父任务记录 **0 条**、僵尸 `RUNNING` **1 条已僵 62 天**、唯一索引 `(taskName,runKey)` **真实存在** → **与「SKIPPED 落库」直接冲突**，须先裁 **OQ-1**（partial index / 合成 runKey / 只记 ALREADY_RUNNING / 独立集合）。另发现汇率"各币种成功标志"因采集**全或无**而恒全绿（OQ-4）。~~先于 TASK-054 的字段冻结~~ → **不再阻塞 054**：054 的对外 API 字段已在自身 ExecPlan §4.3 冻结，`result` 内部键名由 057 冻结、054 用适配器承接（054 ExecPlan §4.8 **D-21**）；两卡谁先落地都可，054 首日按 `contractReady=false` 降级 | `docs/tasks/active/TASK-057-taskrun-result-contract.md` |

## Blocked

| ID | Task | Reason |
|---|---|---|
| — | 无 | 当前无技术阻塞。`TASK-051` / `TASK-046` / `TASK-047` 不是被依赖卡住，而是**等 Human 裁决或排期**；`TASK-053`~`TASK-057` 的先后顺序：~~`TASK-054`~~ ✅ **已于 2026-10-27 完成归档**（其接口未合入 `main` 前，下游只能按「接口 404」的空态开发）、`TASK-057` 与之**互不阻塞**（见 057 行说明）、`TASK-053` / `TASK-056` 无数据依赖可先行、`TASK-055` 的 054 前置已解除、仅剩 `TASK-053`。**`TASK-053` / `TASK-055` / `TASK-056` / `TASK-057` 四卡均未开工** |

## Done

| ID | Task | Completed | 产出 |
|---|---|---|---|
| TASK-061 | 2.0 原型「日志」频道实现 cron 运行看板（FS-cron-worker-status-board） | 2026-10-27 | 任务卡 [`complete/TASK-061`](./complete/TASK-061-cron-board-prototype.md)。产出：`/logs` 置顶「任务运行看板」tab（5 健康灯 + 数据态卡 + 四态图例 + 手动刷新）+ `/logs/rebalance` 独立子路由 + 只读约束；`_audit-cron-board.cjs` 44/44、`_audit-cron-f13.cjs` 23/23。**结案要点**：结构层 AC1~AC11 一次通过，Reviewer 唯一阻断项 `F1`（跨 tab mock 两套口径 → 从 FAILED 点进去看到 SUCCEEDED）已修；`F4` 按 Human 裁决改为「chip 文案与颜色均 = 数据态」。卡内 §13 为完成记录 |
| TASK-060 | 用户模块原型整改（auth 原型并入主原型 + 用户区） | 2026-10-27 | 任务卡 [`complete/TASK-060`](./complete/TASK-060-user-module-prototype-remediation.md)。产出：19 项 A/M 整改 + `N-1`~`N-7` 复审项全修；两原型合并为单文件（`portomind-auth-prototype.html` 退为 69 行跳转壳）；`D8`~`D12` 需求回写进 `FS-authentication` v1.3。**结案要点**：`safeNext` 拒绝 `//host`（会污染 U2 的开放重定向规则）· 顶栏改粗分组名消除同屏双标题 · 强制改密态改密表单进首屏。`_audit-auth.cjs` 59/59。卡内 §12 为完成记录 |
| TASK-059 | 组合线原型稿整改（对齐 `FS-portfolio-ia-cleanup`） | 2026-10-27 | 任务卡 [`complete/TASK-059`](./complete/TASK-059-prototype-alignment-portfolio-ia.md)。产出：29 项 U + 9 项 D（需求回写）+ 二轮 `V-1`~`V-5` 与 `VI-1`~`VI-23` 全修。**结案要点**：`driftOf` 扩为六态（`unvaluable`/`missing`/`over`/`never`/`due`/`ok`），缺价优先于超阈，修掉「全缺价仍判配置正常」这个 P0 假成功；`overN` 量纲按 `FS B8` 统一为**标的数**（`V-3` 方案 A）；Topbar 回归「位置」语义、非总览 Tab 改单行身份条、颜色语义分域。`_audit.cjs` 由 37 条扩到 **48 条**全绿。卡内 §12 为完成记录 |
| TASK-054 | 后端聚合接口 `GET /api/cron/status`（FS **C-02**） | 2026-10-27 | **代码在分支 `feature/TASK-054-cron-status-aggregate-api` = `c7389d1`，⚠️ 尚未合入 `main`**（`main`/`origin/main` = `1895530`）；任务卡 [`complete/TASK-054`](./complete/TASK-054-cron-status-aggregate-api.md)；ExecPlan [`complete/TASK-054`](../exec-plans/complete/TASK-054-cron-status-aggregate-api.md)。产出：`shared/services/cronStatus.service.js`（派生唯一实现）+ `shared/constants/cronStatus.constants.js`（阈值/同步时点）+ `server/{routes,controllers}/cronStatus.*` + `app.js` 1 行注册（`/api` 挂载 9→10）+ 28 条测试（U1–U17 + A1–A11）+ 5 份文档同步（`ARCHITECTURE` / `API_CONTRACT` / `SERVER` / `PRODUCT_LINES` / `readme`）。归档前复跑：`test:server` **180-0**、`test:worker` **77-0**；AC1 路由恰 1 行 / AC8 单端点 / AC10 零写 / AC11 worker 零 diff 全达标。沉淀：**有效目标日**（周末、休市、03:00 前不报假缺口）、`notes[]`、`contractReady` 降级（057 未落地时四项 `null`，不用 `status` 冒充）、`dataStateLevel` 只由数据态决定。遗留：P1/P2 FX 适配器数字形态/空对象误判 `bad` → `TASK-057`；`SERVER.md` 的 `CORS_ORIGINS`「未被读取」既有错述 → `TASK-052`；FS §4.3 旧字段名待 PM 回改 |
| TASK-050 | 组合列表页承接家庭五区块，`/family` 下线 | 2026-10-26 | 合并入 `main` **`cafcc5d`**（PR #35，含 `9baa4cd` + `a9fad6e`）；任务卡 [`complete/TASK-050`](./complete/TASK-050-portfolio-list-household-blocks.md)；ExecPlan [`complete/TASK-050`](../exec-plans/complete/TASK-050-portfolio-list-household-blocks.md)。产出：`components/Household/` 5 组件（`CurrencyBuckets` / `ContributionBar` / `RecentTransactions` / `RecentRebalance` / `FxPanel`）+ `List.jsx` 七段结构与状态下沉 + 删 `pages/Family.jsx` / `/family` 路由 / 侧栏项（6→5 项）+ `enums.js` 增 `CURRENCY_LABELS` / `REBALANCE_STATUS_LABELS` + `priceDisplay.js` 增 `householdSymbol` / `formatMoney`。归档前在 `main` 复跑：build 0（2408 modules）/ eslint 0-0 / test:server 152-0 / test:worker 77-0。遗留：**A-2/A-3 文档旧名词 4 处**（`PL-0:209,427` 死引用已删的 `Family.jsx`；`DEPLOYMENT:302` / `SERVER:102`「家庭视图」）、A-4 首屏抖动、`_check-contributionbar-empty.mjs` 随 PR 原样入库未规范化 → 建议并入 `TASK-052` |
| TASK-048 | Family 页分红类交易标签修正（M-3） | 2026-10-20 | 提交 `fb5fdaf` + `c463c85`（`feature/TASK-048-family-dividend-label`，已随 PR #34 合入 `main`）；任务卡 [`complete/TASK-048`](./complete/TASK-048-family-dividend-label.md)；ExecPlan [`complete/TASK-048`](../exec-plans/complete/TASK-048-family-dividend-label.md)。沉淀：`constants/enums.js` 的 `TRANSACTION_ACTION_LABELS` 成为全仓唯一派生（3 处 → 1 处），`TASK-050` 的 AC16 直接复用。遗留：**F-6/R-2** 任务卡 §1 与 AC1 措辞为恒真断言，待 Human 改写（`Family.jsx` 已随 TASK-050 删除，该措辞现已无验证对象）；`N-2` 两处表单 `<option>` 硬编码仍未收敛 |
| TASK-049 | Dashboard 承接家庭总资产卡 | 2026-10-19 | 提交 `69576ad` + `56c6507`（`feature/TASK-049-dashboard-household-total`，已随 PR #35 合入 `main`）；任务卡 [`complete/TASK-049`](./complete/TASK-049-dashboard-household-total.md)；ExecPlan [`complete/TASK-049`](../exec-plans/complete/TASK-049-dashboard-household-total.md)。遗留：`R-2` 顶栏铃铛 `title="提醒中心"` 名实不符 → 仍未处理（`TASK-050` 已结案且未涉及），现归 `TASK-047` |
| TASK-044 | 交易记录收拢进组合管理 | 2026-10-19 | 提交 `30dc525`；任务卡 [`complete/TASK-044`](./complete/TASK-044-transaction-consolidation.md)；ExecPlan [`complete/TASK-044`](../exec-plans/complete/TASK-044-transaction-consolidation.md) |
| TASK-043 | 标的频道合并（资产管理 + 价格） | 2026-10-19 | 提交 `891d0f7`（2026-10-18）；任务卡 [`complete/TASK-043`](./complete/TASK-043-asset-price-consolidation.md)；ExecPlan [`complete/TASK-043`](../exec-plans/complete/TASK-043-asset-price-consolidation.md)。遗留：FS 的 R6/验收标准措辞待 PM/Human 同步为新口径（§11 Final Notes） |

---

## Roadmap

1. 将资产管理和价格，合并。—— ✅ TASK-043
2. 将交易记录，收拢进组合管理 —— ✅ TASK-044
3. 家庭视图，融入进 dashboard —— ✅ **已完成（2026-10-26 收官）**：`TASK-049` 总资产卡 → `/`（2026-10-19 结案）；`TASK-050` 其余五块 → `/portfolios` 且 `/family` 下线（2026-10-21 实施 → R-1 返修 → 复验通过 → **2026-10-26 合入 `main` `cafcc5d`，PR #35**）。需求：[`FS-household-view-split.md`](../product/specs/FS-household-view-split.md)
4. 交易线遗留修复（建议顺序）：`TASK-046`（CSV 幂等失效，P0 数据风险，修 1 行 + 修 mock）→ `TASK-047`（M-2 归属守卫等）→ ~~`TASK-048`（分红标签）~~ ✅ **已完成 2026-10-20**
5. 家庭线遗留（本 FS 明确不做，需独立立项）：家庭总资产趋势（`FAM-01` P1，无快照模型）· 家庭视图按账户类型/大类分组（PRD `CM-05`/`AS-09` 声称已就绪，实现中 `familySummary` 既无 `accountType` 也无大类聚合）
6. dashboard，增加组合健康表，内容是最新的3个提示。一个url ，跳转全部
