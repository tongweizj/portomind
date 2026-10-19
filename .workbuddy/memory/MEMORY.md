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
- 已知角色文件缺口：`docs/agents/REVIEWER.md` 仍为空（审查依据暂取 `EXECUTION_PLANS.md` §6/§7）。

## 行情数据关键事实（TASK-043 核实）

- `Price` 模型**无 `change`/`prevClose`** → 涨跌幅必须客户端派生；已含 `name`/`currency`/`market`。
- **`getTodayPrices` 只返回当日记录，不可用于判断「最近更新/缺口」**；判断缺口须用 `getPricesByDate` 回溯多日或 `getPriceHistory`。
- 价格 cron `0 3 * * *`（时区 `America/Toronto`）；`dailySync` **只同步 `active` 资产**（停用标的永不更新，会永久显示缺口）；fetcher 存的是**行情自身日期**（Yahoo `regularMarketTime` / Eastmoney `f86`），`saveLatest` 按市场日归桶；**休市直接跳过不写价**。
- 由此产生一个易被误判为缺口的正常现象：US/CA 标的在**周一 00:00–周二 03:00**（约 27h）最新记录仍是上周五，自然日差 3–4 天。
- 分页硬上限：assets `pageSize ≤ 100`；prices history/byDate `≤ 200`；`from/to` 为 `YYYY-MM-DD`。
- 客户端 eslint **必须用 `./node_modules/.bin/eslint`（本地 v9.39.5）**；`npx eslint` 会拉 v10 并与 `eslint-plugin-react` 不兼容而崩溃。
- **数据缺口判定的最终方案 = 相对基准法**（TASK-043 四轮审查后由 Human 裁定）：同市场标的由同一次 cron 同步，正常应停在同一天 → 按 market 分组取「有价标的中最新的日期」为基准，只判个别标的落后 ≥3 个**工作日**。这样周末/法定假日/春节国庆长假（全组一致停更）天然不误报，**无需在客户端复制 `shared/services/calendar.service.js`**（客户端也引用不了，R5 又禁止新增接口）。
  - 实现：`client/src/utils/priceDisplay.js`（`annotateGapFields` / `weekdaysBetween` / `describeGap`）。
  - **固有盲点**：全市场同时停更（cron 整体故障）时无人落后 → 不告警，依赖服务端 `integrityCheck`；单数据源市场（仅 1 个有价标的）不判缺口。
  - **详情页口径收窄**：单标的无法建基准，有数据只中性显示「N 天前」；仅 90 天全无价格才标红。缺口告警职责归列表页。
  - 可复跑验证：`node client/scripts/verify-price-display.cjs`（18 场景组 / 42 断言）。
  - 曾走过的弯路：先按「自然日差 ≥3」（周一必误报）→ 再按「星期几常量」推算正常滞后（周二凌晨/节假日仍误报）→ 最终相对基准法。

## ⚠️ 未决问题

- **`docs/architecture/ARCHITECTURE.md` 是未填充的英文模板**（627 行占位符，含 PostgreSQL/Prisma/OAuth/Teams 等本项目不存在的示例），却被 `docs/readme.md`、`functions.md`、任务单多处引用为「架构总览 — 分层、模块边界、依赖规则」。**待用户裁决是否补齐**（需按 shared/server/cron-worker/client 四模块 + 「跨包引用规则」重写）。
- **`docs/agents/REVIEWER.md` 仍为空文件**（2026-10-18 未获授权补全）。补齐前，Reviewer 的审查依据取自 `docs/process/EXECUTION_PLANS.md` §6 `Reviewing` 与 §7 `Ownership`。
- **TASK-043 待 Human 裁定 2 项高优先级**（见 ExecPlan §10.4）：① 缺口阈值按**自然日差**还是「超出正常同步节奏的额外天数」——前者会让 US/CA 标的每周一整表误标红；② 最新记录 >13 天会掉出 14 日窗口，长尾断更退化为灰色「无数据」而非标红。
- **`EXECUTION_PLANS.md §3` 写 `docs/exec-plans/completed/`，实际仓库用 `complete/`**（历史目录名），文档与目录名不一致，后续可统一。
