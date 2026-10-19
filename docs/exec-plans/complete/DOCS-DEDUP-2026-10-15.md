# docs/manual 重复与一致性审查 · 整改记录

> 版本：v2.0（已执行） · 日期：2026-10-15
> 原审查产物：`docs/manual/REVIEW-duplication.md`（已按 DOCS 规范迁出 `manual/`）
> 关联规则：`docs/standards/DOCS.md`

## 1. 裁决结果

| 编号 | 问题 | 裁决 | 状态 |
|---|---|---|---|
| Q1 | 16 个重复主题 | **① 按「单一归属」重构 4 份手册** | ✅ 已执行 |
| Q2 | CORS 文档与代码不符 | **承认开放（改文档，不改代码）** | ✅ 已执行 |
| Q3 | 两份 `.env.example` 均 `SCHEDULER_ENABLED=true` | **worker 为默认所有者** | ✅ 已执行 |
| Q4 | USER_GUIDE 引用不存在的「组合详情 → 目标配置」 | 改为「组合管理 → 编辑组合 → 表单内」 | ✅ 已执行 |
| Q5 | USER_GUIDE 称家庭视图可录估值分位 | 删「家庭视图」，只留 API | ✅ 已执行 |
| Q6 | 硬编码测试数字 157/157 | 改为「以实际输出为准」 | ✅ 已执行 |
| Q7 | 34 条失效链接 | 按搬迁映射批量修正 | ✅ 已执行 |
| Q8 | 索引重叠且均失效、新目录未入索引 | 合并为单一入口并补齐 | ✅ 已执行 |
| Q9 | 无文档结构规范 | 新增 `docs/standards/DOCS.md` | ✅ 已执行 |

## 2. 执行变更清单

| 文件 | 变更 |
|---|---|
| `server/.env.example` | `SCHEDULER_ENABLED` → `false`（worker 为默认所有者）；新增 `ALERT_EVAL_CRON` / `FX_SYNC_CRON`；CORS 注释如实标注「不生效」 |
| `cron-worker/.env.example` | 明确标注为**默认调度所有者**，并警示覆盖范围只有价格同步 + 完整性检查 |
| `docs/manual/CLIENT.md` | 重定位为「业务操作」唯一归属：删除环境搭建细节、命令行排障、status 表、备份段，改为链接；§6 改为「界面手动入口」；修正目标配置路径与估值录入入口；定时任务表补「哪些进程会跑」列 |
| `docs/manual/DEPLOYMENT.md` | 重定位为「本地环境 + 验证命令」唯一归属：删除「定时任务所有权」整节与完整性检查原理段，改为链接；CORS 说明改为「不校验来源」；删除硬编码测试数字 |
| `docs/manual/DEPLOYMENT.md` | 重定位为「生产部署 + 安全边界 + 备份」唯一归属：新增 §6 安全边界、§7 备份与迁移；PM2 段补 worker 进程与覆盖警示 |
| `docs/manual/CRON_WORKER.md` | 重定位为「调度与数据质量」唯一归属：§3.1 改为 worker 默认 + **新增任务覆盖矩阵**；新增 §4 命令行手动入口速查 |
| `README.md`（根） | `./doc/` → `./docs/`；文档清单指向新目录；快速开始补「调度不在 API 进程内」；安全边界补 CORS |
| `docs/readme.md` | 重写为**唯一索引入口**，覆盖全部 9 个子目录 |
| `docs/README.zh-CN.md` | 降级为旧入口指针 |
| `docs/architecture/functions.md` | 修正 12 条相对链接（`../dev/`、`../product/specs/`、`../manual/`）；§2.2 与 §4.10.1 补调度覆盖警示；§9.2 补调度覆盖缺口与 CORS 现状 |
| `docs/standards/DOCS.md` | **新增**：目录职责 + 单一归属规则 + 主题归属速查 + 链接校验脚本 |

## 3. 整改中新发现的问题（Q10）

### Q10：调度覆盖缺口 —— 不存在覆盖全部任务的单一进程

整改 Q3 时发现：`SCHEDULER_ENABLED=true` 要求全局唯一所有者，**但两侧调度器的任务集合并不相同**：

| 任务 | cron 变量 | server | cron-worker |
|---|---|:---:|:---:|
| 价格同步 | `PRICE_SYNC_CRON` | ✅ | ✅ |
| 完整性检查 | `HEALTH_CHECK_CRON` | ❌ | ✅ |
| 提醒评估 | `ALERT_EVAL_CRON` | ✅ | ❌ |
| 汇率同步 | `FX_SYNC_CRON` | ✅ | ❌ |
| 再平衡 AUTO | 按组合设置 | ✅ | ❌ |

**后果**：

- 默认拓扑（`cron-worker` 持调度）→ 提醒评估 / 汇率同步 / 再平衡 AUTO **不会自动运行**；
- 若改回 `server` 持调度 → 完整性检查**不会自动运行**。

**当前处理**：按裁决执行 worker 为默认所有者，并在 `CRON_WORKER.md` §3.1、`DEPLOYMENT.md` §3、`functions.md` §2.2/§4.10.1/§9.2 与两份 `.env.example` 中**如实写明覆盖矩阵与后果**，同时给出两种拓扑的切换步骤与手动触发方式（`CRON_WORKER.md` §4）。

**收口建议（待定，属代码改动）**：把 alert / fx / rebalance 三个调度器补进 `cron-worker/src/schedulers/`（或在 `server/tasks/` 补 `healthScheduler`），使「单一所有者 = 全覆盖」成立。在补齐前，部署方需按实际需求选拓扑并接受缺口。

## 4. 验证

- 全量相对链接校验：扫描 34 个 md、**151 条相对链接、失效 0 条**（整改前为 66 条中 34 条失效）。
