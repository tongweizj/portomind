# PortoMind 文档索引

> 本文件是 `docs/` 的**唯一索引入口**。目录职责与「单一归属」规则见 [standards/DOCS.md](./standards/DOCS.md)。

## 手册（manual/）— 按组件 / 部署划分

> 四份手册**单一归属、互不重复、互相交叉引用**。同一主题只在一处详述，其余只写一句话 + 链接。

| 文档 | 读者 | 唯一负责的主题 |
|---|---|---|
| [客户端使用手册 CLIENT](./manual/CLIENT.md) | 使用者 | 界面业务操作、界面手动入口、业务数据口径、常见问题 |
| [服务端使用手册 SERVER](./manual/SERVER.md) | 开发者/运维 | server 进程运行、端口与日志、手动 API 端点、专属排障 |
| [调度进程手册 CRON_WORKER](./manual/CRON_WORKER.md) | 运维/使用者 | cron-worker 进程、5 类调度机制、数据质量程序、CLI、监控排障 |
| [系统部署手册 DEPLOYMENT](./manual/DEPLOYMENT.md) | 部署者/开发者 | 系统架构、本地开发、生产部署、环境变量全表、验证命令、安全边界、备份 |

## 产品（product/）

- [产品需求文档 PRD](./product/specs/PRD.md) — 需求基线，含 AS/TR/CM/RB/AL/FAM 功能编码
- [产品线总览与 INDEX PRODUCT_LINES](./product/PRODUCT_LINES.md) — 产品线划分、依赖关系、评估框架与路线图（**功能全景总入口**）
  - [PL-0 平台基座线](./product/lines/PL-0-platform-foundation.md) — 调度 / 运维 / 设计系统 + 全系统参考附录（API 总表 · 数据模型 · 路由 · 业务规则）
  - [PL-1 投资账本线](./product/lines/PL-1-ledger.md) — 资产 · 交易 · 持仓与成本引擎
  - [PL-2 行情数据线](./product/lines/PL-2-market-data.md) — 行情采集 · 查询 · 估值分位
  - [PL-3 组合与配置线](./product/lines/PL-3-portfolio.md) — 组合主数据 · 目标配置 · 组合洞察
  - [PL-4 再平衡决策线](./product/lines/PL-4-rebalancing.md) — 偏离检测 · 建议生成 · 执行闭环 · 自动巡检
  - [PL-5 提醒与通知线](./product/lines/PL-5-alerting.md) — 规则体系 · 评估引擎 · 通知中心
  - [PL-6 家庭总览线](./product/lines/PL-6-household.md) — 家庭汇总 · 汇率服务 · 提醒入口
- [产品总览 PRODUCT](./product/PRODUCT.md)
- [用户研究 USER_RESEARCH](./product/USER_RESEARCH.md)
- [后续路线图 ROADMAP](./product/ROADMAP.md)
- [认证需求（草稿）](./product/specs/authentication.md)
- [投资品频道合并 FS（已实施 2026-10-18 / TASK-043）](./product/specs/FS-asset-price-consolidation.md) — 资产管理 + 价格 重组为「以投资品为中心」的信息架构（PL-1/PL-2）
- [交易记录收拢进组合管理 FS（✅ 已批准 2026-10-18 / TASK-044）](./product/specs/FS-transaction-consolidation.md) — 交易降为组合子资源、二级导航、单一表格实现
- [交易流水查询与筛选 FS（Backlog / TASK-045）](./product/specs/FS-transaction-query-filters.md) — 时间范围与交易类型筛选，需动 `server/`+`shared/`

## 架构（architecture/）

- [架构总览 ARCHITECTURE](./architecture/ARCHITECTURE.md) — 分层、模块边界、依赖规则
- [ADR 目录](./architecture/adr/) — 架构决策记录：[ADR-002 单一调度器与共享内核](./architecture/adr/ADR-002-single-scheduler.md) · [ADR-001 认证（模板）](./architecture/adr/ADR-001-authentication.md)

> 功能全景与能力边界已归入上方的产品线文档（`product/PRODUCT_LINES.md` + `product/lines/`）。

## 接口（dev/）

- [REST API 契约 API_CONTRACT](./dev/API_CONTRACT.md)

## 规范（standards/）

- [文档结构规范 DOCS](./standards/DOCS.md) — 目录职责与单一归属规则
- [编码规范 CODING](./standards/CODING.md)
- [Git 规范 GIT](./standards/GIT.md)
- [安全规范 SECURITY](./standards/SECURITY.md)
- [测试规范 TESTING](./standards/TESTING.md)

## 流程与协作

- [执行计划流程 EXECUTION_PLANS](./process/EXECUTION_PLANS.md)
- [任务清单 TASKS](./tasks/TASKS.md)
  - 活跃任务：[TASK-044 交易记录收拢进组合管理](./tasks/active/TASK-044-transaction-consolidation.md)（VERIFYING · 待独立审查）
  - 待立项/待排期：[TASK-045 交易流水查询与筛选](./tasks/active/TASK-045-transaction-query-filters.md) · [TASK-046 CSV 二次导入未去重](./tasks/active/TASK-046-csv-import-dedup.md) · [TASK-047 TASK-044 审查遗留整改（M-1/M-2/M-5/M-6）](./tasks/active/TASK-047-review-followups.md) · [TASK-048 Family 分红标签](./tasks/active/TASK-048-family-dividend-label.md)
  - 已完成任务：[TASK-005 统一调度器](./tasks/complete/TASK-005-unify-scheduler.md)（2026-10-15）
- [执行计划模板](./templates/EXEC_PLAN_TEMPLATE.md) · [任务模板](./templates/TASK_TEMPLATE.md)
- Agent 角色：[Orchestrator](./agents/ORCHESTRATOR.md) · [Planner](./agents/PLANNER.md) · [Implementer](./agents/IMPLEMENTER.md) · [Reviewer](./agents/REVIEWER.md)

## 归档

- [系统功能架构清单 functions（已归档 2026-10-15）](./archive/functions.md) — 内容已按功能域并入 [`product/lines/`](./product/lines/)
- [TASK-005 统一调度器 ExecPlan（已完成 2026-10-15）](./exec-plans/complete/TASK-005-unify-scheduler.md)
- [docs/manual 重复与一致性整改记录（2026-10-15）](./exec-plans/complete/DOCS-DEDUP-2026-10-15.md)
- [依赖升级评估 DEPENDENCY_UPGRADES](./exec-plans/complete/DEPENDENCY_UPGRADES.md)
- [执行计划归档](./exec-plans/complete/) · [活跃执行计划](./exec-plans/active/TASK-044-transaction-consolidation.md)

## 项目根

- [仓库 README](../README.md)
- [中文说明（旧入口，已并入本索引）](./README.zh-CN.md)

> 早期版本需求文件（requirements_*.md、需求清单.numbers 等）已被 PRD 取代，已于 2026-08-31 清理。
