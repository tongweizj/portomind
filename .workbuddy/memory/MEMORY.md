# PortoMind 项目长期备忘

## 文档结构约定（2026-10-15 固化）

- **唯一索引入口**：`docs/readme.md`。新增/搬迁文档必须同步登记。
- **目录职责**：`manual/`(人读手册) / `product/`(需求·产品) / `product/lines/`(各产品线明细) / `architecture/`(分层·ADR) / `dev/`(API 契约) / `standards/`(强制规范) / `process/` / `tasks/` / `templates/` / `agents/` / `exec-plans/`(一次性产物归档) / `archive/`(已归档历史文档)。完整规则见 `docs/standards/DOCS.md`。
- **单一归属规则（核心）**：每个主题只在一处详述，其余文档一句话 + 链接。手册归属边界：
  - `manual/USER_GUIDE.md` = 业务操作 · 业务口径 · 常见问题
  - `manual/DEVELOPMENT.md` = 本地环境 · 依赖 · 基线数据 · **验证/测试命令**
  - `manual/DEPLOY.md` = 生产部署 · 生产环境变量 · PM2/Nginx · **备份** · **安全边界**
  - `manual/OPERATIONS.md` = **调度所有权与覆盖矩阵** · 定时任务 · 价格同步 · **完整性检查** · 历史回补 · TaskRun · **命令行手动入口** · 排障
- **不要写会漂移的硬数字**（测试用例数、覆盖率、精确版本）→ 用「以 `npm test` 实际输出为准」；带日期的历史数量只留在 PRD 需求状态条目。
- 改文档涉及开关/默认值/端点的陈述前，**先与源码对账**；当前不生效的配置必须标注「不生效」并说明原因。
- **功能文档结构（2026-10-15 重组）**：总入口 = `product/PRODUCT_LINES.md`（定位 · 划分原则 · 依赖图 · 评估框架与总览统计 · 路线图 + **产品线 INDEX**）；每条产品线一份 `product/lines/PL-0~PL-6.md`（含 成熟度快评 · 产品模块归属 · 全量功能评估 · 已实现功能点清单 · 架构实现明细）；**跨线参考（API 总表 / 数据模型清单 / 路由与组件 / 业务规则速查 / 编码索引）集中在 PL-0**。原 `architecture/functions.md` 已归档至 `docs/archive/functions.md`；原 `product/FUNCTION_INVENTORY.md` 已删除（内容并入子文件）。

## 关键架构事实

- **两进程 + 两代码模块**（TASK-005 后）：`client`(Vite SPA) / `server`(Express API，**不注册任何 cron**) / `cron-worker`(唯一调度所有者) 三个进程，加 `shared/` —— **`shared/` 是代码库不是进程**，被 server 与 cron-worker 共同加载，承载全部业务内核（models/services/tasks/fetchers/constants/config/utils，**唯一实现**）。三端共享同一 MongoDB。
- **调度唯一所有者 = `cron-worker`（已收口）**：`server` 侧已无任何调度启动路径，`SCHEDULER_ENABLED` 只由 worker 读取。5 类定时任务**全部**由 worker 注册：价格同步 `0 3`、完整性检查 `30 3`、提醒评估 `0 4`、汇率采集 `30 9`、自动再平衡 `0 0`。启动自检日志 `SCHEDULERS_STARTED {"count":5}`。
- ✅ **TASK-005 已落地（原「双份调度实现」+「调度覆盖缺口」两项技术债已清偿）**：业务内核收敛到 `shared/`，`server/tasks/*` 与 `cron-worker/src/tasks/*` 只剩 CLI 薄壳；ADR 见 `docs/architecture/adr/ADR-002-single-scheduler.md`。**关键认知（仍成立）**：迁移的是「调度触发权」，不是「业务能力」——server 的 API 手动触发端点（`POST /api/alerts/evaluate`、`POST /api/family/fx/sync`、`/api/portfolios/:pid/rebalance/*`）保留，与 worker 定时触发走**同一函数**。
- **AUTO 再平衡改为「单日分发」**：`rebalanceScheduler` 固定注册一个 cron（`0 0 * * *`），每次遍历未归档组合按 `rebalanceSchedule` 判到期（daily=每天 / weekly=周一 / monthly=每月 1 日）；到期规则硬编码在 `SCHEDULE_DUE_RULES`——**新增频率取值必须同步补规则，否则静默永不触发**。`runKey` 仍为 `{schedule}:{periodKey}`，防重语义与迁移前一致。
- **CORS 当前开放**：`server/app.js` 用 `cors({ origin: true })` 允许任意来源，白名单实现被注释、`CORS_ORIGINS` **未被读取**。已按「承认开放 + 文档如实说明」处理（`DEPLOY.md` §安全边界）；上线前需二选一收口。
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

## ⚠️ 未决问题

- **`docs/architecture/ARCHITECTURE.md` 是未填充的英文模板**（627 行占位符，含 PostgreSQL/Prisma/OAuth/Teams 等本项目不存在的示例），却被 `docs/readme.md`、`functions.md`、任务单多处引用为「架构总览 — 分层、模块边界、依赖规则」。**待用户裁决是否补齐**（需按 shared/server/cron-worker/client 四模块 + 「跨包引用规则」重写）。
