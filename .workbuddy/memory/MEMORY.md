# PortoMind 项目长期备忘

## 文档结构约定（2026-10-15 固化）

- **唯一索引入口**：`docs/readme.md`。新增/搬迁文档必须同步登记。
- **目录职责**：`manual/`(人读手册) / `product/`(需求·产品) / `product/lines/`(各产品线明细) / `architecture/`(分层·ADR) / `dev/`(API 契约) / `standards/`(强制规范) / `process/` / `tasks/` / `templates/` / `agents/` / `exec-plans/`(一次性产物归档) / `archive/`(已归档历史文档)。完整规则见 `docs/standards/DOCS.md`。
- **单一归属规则（核心）**：每个主题只在一处详述，其余文档一句话 + 链接。手册按**组件/部署**四份划分（2026-10-17 重构，取代原 USER_GUIDE/DEVELOPMENT/DEPLOY/OPERATIONS）：
  - `manual/CLIENT.md` = 客户端使用手册：界面业务操作 · 界面手动入口 · 业务数据口径 · 常见问题
  - `manual/SERVER.md` = 服务端使用手册：server 进程运行 · 端口与日志 · 手动 API 端点 · 专属排障
  - `manual/CRON_WORKER.md` = 调度进程手册：**调度所有权** · 5 类调度机制 · 再平衡单日分发 · 防重 · 数据质量程序（价格同步/完整性检查/历史回补）· **CLI 手动入口** · TaskRun/监控/排障
  - `manual/DEPLOYMENT.md` = 系统部署手册：系统架构 · 本地开发搭建 · 生产部署 · **环境变量全表** · **验证/测试命令** · **安全边界** · **备份与迁移**
- **不要写会漂移的硬数字**（测试用例数、覆盖率、精确版本）→ 用「以 `npm test` 实际输出为准」；带日期的历史数量只留在 PRD 需求状态条目。
- 改文档涉及开关/默认值/端点的陈述前，**先与源码对账**；当前不生效的配置必须标注「不生效」并说明原因。
- **功能文档结构（2026-10-15 重组）**：总入口 = `product/PRODUCT_LINES.md`（定位 · 划分原则 · 依赖图 · 评估框架与总览统计 · 路线图 + **产品线 INDEX**）；每条产品线一份 `product/lines/PL-0~PL-6.md`（含 成熟度快评 · 产品模块归属 · 全量功能评估 · 已实现功能点清单 · 架构实现明细）；**跨线参考（API 总表 / 数据模型清单 / 路由与组件 / 业务规则速查 / 编码索引）集中在 PL-0**。原 `architecture/functions.md` 已归档至 `docs/archive/functions.md`；原 `product/FUNCTION_INVENTORY.md` 已删除（内容并入子文件）。

## 关键架构事实

- **两进程 + 两代码模块**（TASK-005 后）：`client`(Vite SPA) / `server`(Express API，**不注册任何 cron**) / `cron-worker`(唯一调度所有者) 三个进程，加 `shared/` —— **`shared/` 是代码库不是进程**，被 server 与 cron-worker 共同加载，承载全部业务内核（models/services/tasks/fetchers/constants/config/utils，**唯一实现**）。三端共享同一 MongoDB。
- **调度唯一所有者 = `cron-worker`（已收口）**：`server` 侧已无任何调度启动路径，`SCHEDULER_ENABLED` 只由 worker 读取。5 类定时任务**全部**由 worker 注册：价格同步 `0 3`、完整性检查 `30 3`、提醒评估 `0 4`、汇率采集 `30 9`、自动再平衡 `0 0`。启动自检日志 `SCHEDULERS_STARTED {"count":5}`。
- ✅ **TASK-005 已落地（原「双份调度实现」+「调度覆盖缺口」两项技术债已清偿）**：业务内核收敛到 `shared/`，`server/tasks/*` 与 `cron-worker/src/tasks/*` 只剩 CLI 薄壳；ADR 见 `docs/architecture/adr/ADR-002-single-scheduler.md`。**关键认知（仍成立）**：迁移的是「调度触发权」，不是「业务能力」——server 的 API 手动触发端点（`POST /api/alerts/evaluate`、`POST /api/family/fx/sync`、`/api/portfolios/:pid/rebalance/*`）保留，与 worker 定时触发走**同一函数**。
- **AUTO 再平衡改为「单日分发」**：`rebalanceScheduler` 固定注册一个 cron（`0 0 * * *`），每次遍历未归档组合按 `rebalanceSchedule` 判到期（daily=每天 / weekly=周一 / monthly=每月 1 日）；到期规则硬编码在 `SCHEDULE_DUE_RULES`——**新增频率取值必须同步补规则，否则静默永不触发**。`runKey` 仍为 `{schedule}:{periodKey}`，防重语义与迁移前一致。
- **CORS 当前开放**：`server/app.js` 用 `cors({ origin: true })` 允许任意来源，白名单实现被注释、`CORS_ORIGINS` **未被读取**。已按「承认开放 + 文档如实说明」处理（`DEPLOYMENT.md` §9 安全边界）；上线前需二选一收口。
- **无认证授权**（ADR-001 仅模板）→ API 不可暴露公网。
- **前端孤儿页已核实**：`pages/Portfolio/TargetAllocation.jsx`、`Basic.jsx` 零外部引用；目标配置的真实落地是 `PortfolioForm.jsx` 内联实现。
- **核心业务引擎为纯函数**：`positionCalculator`（移动平均成本）、`thresholdChecker`、`suggestionGenerator`（先卖后买）、`assetClassAggregator`。
- **两条保守原则**：缺价时估值字段为 `null` 不按零价误算；家庭 RMB 折算「宁可少报不可错报」。
- **硬约束**：AUTO 再平衡只生成建议 + 提醒，绝不自动交易。
- `ASSET_*` 枚举**两份复制**（原三份，TASK-005 后已收敛）：`shared/constants/asset.constants.js`（server + worker 共用）与 `client/src/constants/enums.js`，改动需**双向同步**。

## 工程约定（TASK-005 引入）

- **monorepo**：npm workspaces，四个 workspace `shared` / `server` / `cron-worker` / `client`；**在仓库根目录一次 `npm ci`** 安装。根脚本：`test` / `test:server` / `test:worker` / `dev:server` / `dev:worker` / `dev:client` / `sync:prices` / `check:integrity`。
- **跨包引用必须用包名** `require('@portomind/shared/...')`；`shared/` 内部保留原目录结构，故**包内相对 `require` 零改动**（这是搬迁时把「2800 行路径重构」压成可枚举替换的关键技巧）。禁止 `../models` 式跨包相对引用。
- **日志目录**：`LOG_DIR` 不设置时默认**仓库根 `logs/`**（`shared/config/logger.js` 以 `__dirname` 推导绝对路径），server 与 worker 共用同一目录，`app-*.log` / `task-*.log` 文件名不冲突。
- **任务/ExecPlan 生命周期**：沿用 `active/` → `complete/` 两段目录，完成后**移动**并更新所有引用方（`docs/tasks/complete/` 已于 TASK-005 建立）。

## 代理角色与审查纪律（2026-10-18，TASK-043 越权事件后确立）

- 角色定义在 `docs/agents/`：`ORCHESTRATOR.md`（原有，§3 列四条禁令）/ `PLANNER.md` / `IMPLEMENTER.md`（2026-10-18 由 Orchestrator 起草，**待 Human 审核**）/ `REVIEWER.md`（**仍为空文件**）。
- **硬纪律**：① 任何业务代码改动必须先有 `Approved` 状态的 ExecPlan；② **「需求文档已批准」≠「实施方案已批准」**，Plan Review 不得跳过；③ 实现与审查不得由同一角色在同一轮完成——**自查 build/lint 通过不能作为交付或验收依据**。
- **ExecPlan 必须显式记录流程偏离**（本次做法：§8 Process Deviations & Human Ratification，含事实经过表 / 违反条款 / 根因 / 裁决 / **追认边界**）。例外必须可审计，不得静默。
- **教训**：涉及时间/阈值/缺口的分支，必须验证其前置条件在真实数据流下是否成立，否则会写成**不可达代码**——TASK-043 首轮「≥3 天缺口标红」即因列表底座用了只返回当日记录的接口，导致该分支永不触发。
- 审查应看「功能是否可能生效」，而不只是「构建是否通过」。
- **验证的期望值不得从被测实现反推**（TASK-043 曾被独立审查判定为「自证循环」：期望值照抄实现公式，模型错了也全绿）。期望值必须来自**业务事实或日历事实**，可被人独立复算。
- **数字类自评不可作为证据**：同一任务内两次报错断言数量（24→实为 27、31→实为 33），必须实测统计（如 `grep -c "^PASS"`）。
- **不得引用尚不存在的章节**：曾在代码注释写「详见 ExecPlan §10.8」而该章当时不存在。
- **验证必须可复现**：一次性脚本落在临时目录等于没有验证，应落地到仓库并提供运行命令。
- **mock 比真实更宽松 = 假阳性**（TASK-046 发现）：单元测试的 mock 无视 Mongoose `select()` 投影，把真实查询拿不到的字段也返回，导致「幂等去重」缺陷在 **12/12 全绿**的测试下存活。凡 mock 数据库查询，必须使 mock 返回值 ⊆ 真实投影字段；关键行为需「先在旧实现上验红，再在新实现上验绿」。
- 已知角色文件缺口：`docs/agents/REVIEWER.md` 仍为空（审查依据暂取 `EXECUTION_PLANS.md` §6/§7）。

## 行情数据关键事实（TASK-043 核实）

- `Price` 模型**无 `change`/`prevClose`** → 涨跌幅必须客户端派生；已含 `name`/`currency`/`market`。
- **`getTodayPrices` 只返回当日记录，不可用于判断「最近更新/缺口」**；判断缺口须用 `getPricesByDate` 回溯多日或 `getPriceHistory`。
- 价格 cron `0 3 * * *`（时区 `America/Toronto`）；`dailySync` **只同步 `active` 资产**（停用标的永不更新，会永久显示缺口）；fetcher 存的是**行情自身日期**（Yahoo `regularMarketTime` / Eastmoney `f86`），`saveLatest` 按市场日归桶；**休市直接跳过不写价**。
- 由此产生一个易被误判为缺口的正常现象：US/CA 标的在**周一 00:00–周二 03:00**（约 27h）最新记录仍是上周五，自然日差 3–4 天。
- 分页硬上限：assets `pageSize ≤ 100`；prices history/byDate `≤ 200`；`from/to` 为 `YYYY-MM-DD`。
- 客户端 eslint **不能 `npx eslint`**（会拉 v10 与 `eslint-plugin-react` 不兼容崩溃）。正确调用：**`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"`** —— 二进制被 npm workspaces 提升到**根** `node_modules/.bin/`（`client/node_modules/.bin/eslint` 不存在），而配置 `client/eslint.config.js` 要求在 client 目录下执行；在仓库根直接跑会报 "couldn't find eslint.config.js"。（2026-10-19 评审实测修正，原记录误写为本地路径）
- **数据缺口判定的最终方案 = 相对基准法**（TASK-043 四轮审查后由 Human 裁定）：同市场标的由同一次 cron 同步，正常应停在同一天 → 按 market 分组取「有价标的中最新的日期」为基准，只判个别标的落后 ≥3 个**工作日**。这样周末/法定假日/春节国庆长假（全组一致停更）天然不误报，**无需在客户端复制 `shared/services/calendar.service.js`**（客户端也引用不了，R5 又禁止新增接口）。
  - 实现：`client/src/utils/priceDisplay.js`（`annotateGapFields` / `weekdaysBetween` / `describeGap`）。
  - **固有盲点**：全市场同时停更（cron 整体故障）时无人落后 → 不告警，依赖服务端 `integrityCheck`；单数据源市场（仅 1 个有价标的）不判缺口。
  - **详情页口径收窄**：单标的无法建基准，有数据只中性显示「N 天前」；仅 90 天全无价格才标红。缺口告警职责归列表页。
  - 可复跑验证：`node client/scripts/verify-price-display.cjs`（18 场景组 / 42 断言）。
  - 曾走过的弯路：先按「自然日差 ≥3」（周一必误报）→ 再按「星期几常量」推算正常滞后（周二凌晨/节假日仍误报）→ 最终相对基准法。

## 交易导入幂等（TASK-046 发现，未修复）

- `shared/services/transaction.service.js#importTransactions` 的幂等键 = `portfolioId|symbol|action|quantity|price|yyyy-mm-dd(date)|fee`（`dayKey` 按日，规避时刻差异）。
- **已知缺陷**：`:233` 的 `select('symbol action quantity price date fee')` **漏 `portfolioId`**，而 `:238` 拼键读 `String(tx.portfolioId)` → 恒为 `"undefined"`；因 `portfolioId` 是键的第一段，库内键与待导入键**永不相等** → `skipped` 恒 0，二次导入同一 CSV 会整份重复写入（静默污染成本/持仓）。
- 批次内去重（`seen` Set）仍有效——两侧都来自 `normalized`，字段完整。故「跳过重复 0 条」不代表去重没实现。
- **测试假阳性**：`server/test/integration/transaction.enhanced.test.js:111-118` 的 mock 返回了投影外的 `portfolioId`，断言 `skipped===1` 照样通过（实测 12/12 绿）。修复时必须同时修 mock，并加「连续导入两次」用例且先在旧实现上验红。
- 导入上限 500 行/批；非法行整批回滚（不写入任何记录）；成功批次**不可撤销**（TR-09 的 P1 缺口，独立任务）。

## ⚠️ 未决问题

- **`docs/architecture/ARCHITECTURE.md` 是未填充的英文模板**（627 行占位符，含 PostgreSQL/Prisma/OAuth/Teams 等本项目不存在的示例），却被 `docs/readme.md`、`functions.md`、任务单多处引用为「架构总览 — 分层、模块边界、依赖规则」。**待用户裁决是否补齐**（需按 shared/server/cron-worker/client 四模块 + 「跨包引用规则」重写）。
- **`docs/agents/REVIEWER.md` 仍为空文件**（2026-10-18 未获授权补全）。补齐前，Reviewer 的审查依据取自 `docs/process/EXECUTION_PLANS.md` §6 `Reviewing` 与 §7 `Ownership`。
- **TASK-043 待 Human 裁定 2 项高优先级**（见 ExecPlan §10.4）：① 缺口阈值按**自然日差**还是「超出正常同步节奏的额外天数」——前者会让 US/CA 标的每周一整表误标红；② 最新记录 >13 天会掉出 14 日窗口，长尾断更退化为灰色「无数据」而非标红。
- **`EXECUTION_PLANS.md §3` 写 `docs/exec-plans/completed/`，实际仓库用 `complete/`**（历史目录名），文档与目录名不一致，后续可统一。
- **交易「归属不可变」已裁定（2026-10-19，TASK-047）**：`PUT /api/transactions/:id` 当前**接受任意 `portfolioId` 改写**（`transaction.service.js:128` 入参优先 + `:137` 直接写回），配合前端 `EditTransaction.jsx:42-47` 用 URL 的 id 覆盖真实归属 → URL 不符即静默迁移组合、两侧持仓重算。**Human 选方案②：后端拒绝改写，归属由数据层保证**；TASK-047 因此放开「零服务端改动」（仅限 `updateTransaction` 归属守卫，AC7）。
  - **实现陷阱**：`EditTransaction.jsx:82` 提交恒带 `portfolioId`（值来自路由）→ 守卫必须判「**值是否变化**」，不可判「字段是否存在」；也不可从 `WRITABLE_FIELDS` 删该字段（`createTransaction` 共用该表）。校验插在 `transaction.service.js:128` 之前。
- **`docs/readme.md` 有两条既有死链**（2026-10-19 发现）：`product/ROADMAP.md`、`product/specs/authentication.md` 均不存在。待决定补文件还是摘链接。

## 本机开发环境事实（2026-10-19 实测）

- **Mongo 真实库 = `portomind`**（4 组合 / 44 资产 / 50 交易 / 79828 价格），主机 `192.168.2.140:27017`。`portomind_dev` 是**空库**；`server/.env` 的 MONGO_URI 指向 `192.168.1.140`，**该主机已不可达**（启动 server 需用环境变量覆盖 MONGO_URI）。
- **客户端 API 通路**：`client/src/services/api.js` 优先读 `VITE_API_URL`；空则同源 `/api` 走 `client/vite.config.js` 的 proxy。仓库内现有 `client/.env`（`VITE_API_URL=http://localhost:8080/api`）+ proxy target `http://127.0.0.1:8080`。
- **坑 ①**：环境里有 `HTTP_PROXY=http://127.0.0.1:59155`，`curl http://localhost:8080/...` 会被劫持返回 502「upstream connect failed」，易误判「后端挂了」→ 必须 `curl --noproxy '*'`。
- **坑 ②**：vite dev server 只监听 `[::1]:5173`（IPv6），`127.0.0.1:5173` 不通，要用 `localhost`。
- **坑 ③**：改 `vite.config.js` 或新增 `client/.env` 后**必须重启** dev server，否则仍走旧 proxy。
- **坑 ④**：`client/vite.config.js` 里 `process.env.VITE_API_PROXY_TARGET` **只读真实 shell 环境变量，不读 `client/.env`**（2026-10-19 用隔离探针实测：`.env` 里写该变量，target 仍为默认 8080）。要让 `.env` 生效必须在配置里用 `loadEnv(mode, process.cwd(), '')`。当前是「shell 导出」语义。
- **E2E 走查做法（可复用）**：复制真实库 → `portomind_e2e`，API 指向副本；浏览器驱动用 `npm i playwright-core --no-save` + 本机 Chrome（`chromium.launch({executablePath})`，不下载浏览器）。脚本示例：`client/scripts/e2e-task-044.mjs`（38 断言）。
