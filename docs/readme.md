# PortoMind 文档索引

> 本文件是 `docs/` 的**唯一索引入口**。目录职责与「单一归属」规则见 [standards/DOCS.md](./standards/DOCS.md)。

## 手册（manual/）— 按组件 / 部署划分

> 四份手册**单一归属、互不重复、互相交叉引用**。同一主题只在一处详述，其余只写一句话 + 链接。

| 文档 | 读者 | 唯一负责的主题 |
|---|---|---|
| [客户端使用手册 CLIENT](./manual/CLIENT.md) | 使用者 | 界面业务操作、界面手动入口、业务数据口径、常见问题 |
| [服务端使用手册 SERVER](./manual/SERVER.md) | 开发者/运维 | server 进程运行、端口与日志、手动 API 端点、专属排障 |
| [调度进程总览 CRON_WORKER](./manual/CRON_WORKER.md) | 所有人（入口） | cron-worker 进程模型、五大任务地图、三视角导航 | 子文档： [运维](./manual/CRON_WORKER_OPS.md) · [产品介绍](./manual/CRON_WORKER_PRODUCT.md) · [开发](./dev/CRON_WORKER_DEV.md) |
| [cron-worker 运维手册 OPS](./manual/CRON_WORKER_OPS.md) | 运维/SRE | 安装/启动/关闭/CLI 手动入口/监控巡检/故障排查 |
| [cron-worker 产品介绍 PRODUCT](./manual/CRON_WORKER_PRODUCT.md) | 使用者/产品 | 五大任务功能介绍（非 PRD）、数据质量程序价值、launchDate 意义 |
| [cron-worker 开发文档 DEV](./dev/CRON_WORKER_DEV.md) | 开发者 | 调度引擎/再平衡分发/两层防重/TaskRun 契约/新增调度器/目录结构 |
| [系统部署手册 DEPLOYMENT](./manual/DEPLOYMENT.md) | 部署者/开发者 | 系统架构、本地开发、生产部署、环境变量全表、验证命令、安全边界、备份 |

## 产品（product/）

- [产品需求文档 PRD](./product/specs/PRD.md) — 需求基线，含 AS/TR/CM/RB/AL/FAM 功能编码
- [产品线总览与 INDEX PRODUCT_LINES](./product/PRODUCT_LINES.md) — 产品线划分、依赖关系、评估框架与路线图（**功能全景总入口**）
  - [PL-0 平台基座线](./product/lines/PL-0-platform-foundation.md) — 调度 / 运维 / 设计系统：成熟度、模块归属、功能判定、能力清单、功能域编码、技术债
  - [PL-1 投资账本线](./product/lines/PL-1-ledger.md) — 资产 · 交易 · 持仓与成本引擎
  - [PL-2 行情数据线](./product/lines/PL-2-market-data.md) — 行情采集 · 查询 · 估值分位
  - [PL-3 组合与配置线](./product/lines/PL-3-portfolio.md) — 组合主数据 · 目标配置 · 组合洞察
  - [PL-4 再平衡决策线](./product/lines/PL-4-rebalancing.md) — 偏离检测 · 建议生成 · 执行闭环 · 自动巡检
  - [PL-5 提醒与通知线](./product/lines/PL-5-alerting.md) — 规则体系 · 评估引擎 · 通知中心
  - [PL-6 家庭总览线](./product/lines/PL-6-household.md) — 家庭汇总 · 汇率服务 · 提醒入口
- [产品总览 PRODUCT](./product/PRODUCT.md)
- [用户研究 USER_RESEARCH](./product/USER_RESEARCH.md)
- [后续路线图（任务板 TASKS）](./tasks/TASKS.md) — 原 `product/ROADMAP.md` 未建立，路线统一在任务板维护
- [账号与访问控制 FS（✅ 已批准 2026-10-26 / TASK-058）](./product/specs/FS-authentication.md) — 单租户多账号（`admin`/`member`，**无自助注册**、不加 `tenantId`）· 服务端会话存 Mongo · 首登强制改密 · 用户只停用不删除 · CORS 白名单与认证**同批**收敛；技术依据 [ADR-001](./architecture/adr/ADR-001-authentication.md)
- [投资品频道合并 FS（已实施 2026-10-18 / TASK-043）](./product/specs/FS-asset-price-consolidation.md) — 资产管理 + 价格 重组为「以投资品为中心」的信息架构（PL-1/PL-2）
- [交易记录收拢进组合管理 FS（✅ 已批准 2026-10-18 / TASK-044）](./product/specs/FS-transaction-consolidation.md) — 交易降为组合子资源、二级导航、单一表格实现
- [交易流水查询与筛选 FS（Backlog / TASK-045）](./product/specs/FS-transaction-query-filters.md) — 时间范围与交易类型筛选，需动 `server/`+`shared/`
- [家庭视图拆分 FS（✅ 已交付 2026-10-26 / TASK-049 + TASK-050 均结案）](./product/specs/FS-household-view-split.md) — 总资产卡进 Dashboard，其余五块并入组合管理，`/family` 下线
- [组合详情 IA 收尾与 Dashboard 组合健康表 FS（✅ 已批准 2026-10-26 / 交付单元 A+B）](./product/specs/FS-portfolio-ia-cleanup.md) — 首 Tab 改「总览」、阈值入口移出再平衡（PL-3/PL-4）、删除入口补齐、提醒点击带 `?record=` 精确落点（A16）、首屏 3 行健康表（需 `summary` 补字段）
- [cron-worker 运行看板 FS（需求已锁定 2026-10-26，OQ1–OQ8 已决）](./product/specs/FS-cron-worker-status-board.md) — 日志频道新增「任务运行看板」tab（数据态为主信号）；频道**只读排障、永不放执行动作**（硬约束）；再平衡配独立子路由 `/logs/rebalance`「再平衡分发记录」；含 §7.2 数据契约缺口 6 条
- [cron-worker 运行看板 · 任务卡片](./product/specs/FS-cron-worker-status-board-tasks.md) — 由 FS 拆出的 10 张 PM 任务卡片（C-01~C-10，含验收/依赖/边界；C-05 数据契约已升级 P0）

## 架构（architecture/）

- [架构总览 ARCHITECTURE](./architecture/ARCHITECTURE.md) — 架构风格、**技术栈**、**外部集成**、模块边界与依赖规则、数据流、持久化架构、架构约束、已知架构债
- [ADR 目录](./architecture/adr/) — 架构决策记录：[ADR-002 单一调度器与共享内核](./architecture/adr/ADR-002-single-scheduler.md) · [ADR-001 认证（`Accepted`，U1 后端已实施）](./architecture/adr/ADR-001-authentication.md)

> 功能全景与能力边界已归入上方的产品线文档（`product/PRODUCT_LINES.md` + `product/lines/`）。

## 接口与开发参考（dev/）

- [REST API 契约 API_CONTRACT](./dev/API_CONTRACT.md) — 端点、请求/响应、错误码
- [数据模型参考 DATA_MODEL](./dev/DATA_MODEL.md) — `shared/models/` 全部模型的字段、枚举、索引、引用关系，以及已知契约缺口
- [前端开发文档 CLIENT_DEV](./dev/CLIENT_DEV.md) — 目录结构、路由与 `ROUTES` 常量、Query 数据层、service、组件清单、设计 token

## 设计与原型（ui/）

- [Web 设计稿本地存档](./ui/README.md) — Ardot 9 屏 PNG/PDF 快照；画板 id ↔ 路由映射、本轮投资组合改版的落点（FS 交付单元 A/B）、设计稿与现状的差异清单

## 规范（standards/）

- [文档结构规范 DOCS](./standards/DOCS.md) — 目录职责与单一归属规则
- [编码规范 CODING](./standards/CODING.md)
- [Git 规范 GIT](./standards/GIT.md)
- [安全规范 SECURITY](./standards/SECURITY.md)
- [测试规范 TESTING](./standards/TESTING.md)

## 流程与协作

- [执行计划流程 EXECUTION_PLANS](./process/EXECUTION_PLANS.md)
- [任务清单 TASKS](./tasks/TASKS.md)
  - 活跃任务：[TASK-058 账号与访问控制（U1 认证内核）](./tasks/active/TASK-058-authentication-and-accounts.md)（`REVIEWED`：U1 后端已实施，独立 Reviewer 三轮复核 PASS；211/0 + 77/0、真实 Mongo E2E 15/15；待 Human 合入并与 U2 同批发布）—— **状态一律以 [`TASKS.md`](./tasks/TASKS.md) 为准**
  - 已结案待合入：[TASK-054 后端聚合接口 `GET /api/cron/status`](./tasks/complete/TASK-054-cron-status-aggregate-api.md)（2026-10-27 归档；**代码仍在 `feature/TASK-054-cron-status-aggregate-api` = `c7389d1`，未合入 `main`**）
  - 阻塞中：无
  - 待排期（[cron-worker 运行看板](./product/specs/FS-cron-worker-status-board.md) P0 批次；**C-02 已完成 2026-10-27**）：[TASK-053 看板 tab 骨架](./tasks/active/TASK-053-log-board-tab-skeleton.md) · [TASK-055 价格完成度展示](./tasks/active/TASK-055-price-completeness-display.md) · [TASK-056 状态色语义与图例](./tasks/active/TASK-056-status-color-semantics.md) · [TASK-057 `taskruns` 数据契约增强（`result`/`SKIPPED`/父任务）](./tasks/active/TASK-057-taskrun-result-contract.md)
  - 待立项/待排期：[TASK-045 交易流水查询与筛选](./tasks/active/TASK-045-transaction-query-filters.md) · [TASK-046 CSV 二次导入未去重](./tasks/active/TASK-046-csv-import-dedup.md) · [TASK-047 TASK-044 审查遗留整改（M-1/M-2/M-5/M-6）](./tasks/active/TASK-047-review-followups.md) · [TASK-051 家庭折算汇率方向反了](./tasks/active/TASK-051-fx-rate-direction.md) · [TASK-052 Agent 运行规则审计与整改](./tasks/active/TASK-052-agent-rules-update.md)
  - 已完成任务：[TASK-061 cron 运行看板原型](./tasks/complete/TASK-061-cron-board-prototype.md)（2026-10-27）· [TASK-060 用户模块原型整改](./tasks/complete/TASK-060-user-module-prototype-remediation.md)（2026-10-27）· [TASK-059 组合线原型稿整改](./tasks/complete/TASK-059-prototype-alignment-portfolio-ia.md)（2026-10-27）· [TASK-054 后端聚合接口 `GET /api/cron/status`](./tasks/complete/TASK-054-cron-status-aggregate-api.md)（2026-10-27）· [TASK-050 组合列表页承接家庭五区块](./tasks/complete/TASK-050-portfolio-list-household-blocks.md)（2026-10-26）· [TASK-048 Family 页分红类交易标签修正](./tasks/complete/TASK-048-family-dividend-label.md)（2026-10-20）· [TASK-049 Dashboard 承接家庭总资产卡](./tasks/complete/TASK-049-dashboard-household-total.md)（2026-10-19）· [TASK-044 交易记录收拢进组合管理](./tasks/complete/TASK-044-transaction-consolidation.md)（2026-10-19）· [TASK-043 标的频道合并](./tasks/complete/TASK-043-asset-price-consolidation.md)（2026-10-18）· [TASK-005 统一调度器](./tasks/complete/TASK-005-unify-scheduler.md)（2026-10-15）
- [执行计划模板](./templates/EXEC_PLAN_TEMPLATE.md) · [任务模板](./templates/TASK_TEMPLATE.md)
- Agent 角色：[Orchestrator](./agents/ORCHESTRATOR.md) · [Planner](./agents/PLANNER.md) · [Implementer](./agents/IMPLEMENTER.md) · [Reviewer](./agents/REVIEWER.md)

## 归档

- [系统功能架构清单 functions（已归档 2026-10-15）](./archive/functions.md) — 内容已按功能域并入 [`product/lines/`](./product/lines/)
- [TASK-005 统一调度器 ExecPlan（已完成 2026-10-15）](./exec-plans/complete/TASK-005-unify-scheduler.md)
- [docs/manual 重复与一致性整改记录（2026-10-15）](./exec-plans/complete/DOCS-DEDUP-2026-10-15.md)
- [依赖升级评估 DEPENDENCY_UPGRADES](./exec-plans/complete/DEPENDENCY_UPGRADES.md)
- [执行计划归档](./exec-plans/complete/)（含 TASK-054 cron 状态聚合接口 / TASK-050 家庭五区块承接 / TASK-048 分红标签 / TASK-049 Dashboard 承接 / TASK-044 交易记录收拢 / TASK-043 标的频道合并 / TASK-005 统一调度器）· [活跃执行计划](./exec-plans/active/)（[TASK-058 认证内核](./exec-plans/active/TASK-058-authentication-kernel.md) `Approved`）

## 项目根

- [仓库 README](../README.md)
- [中文说明（旧入口，已并入本索引）](./README.zh-CN.md)

> 早期版本需求文件（requirements_*.md、需求清单.numbers 等）已被 PRD 取代，已于 2026-08-31 清理。
