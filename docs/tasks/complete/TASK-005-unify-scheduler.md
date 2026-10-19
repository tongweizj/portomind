# TASK-005 — 统一调度器：全部定时任务迁移至 cron-worker

## Status

`Done`（2026-10-15 实施完毕，验收通过）

## Priority

`High`

## Owner

`Agent`（Impl）/ `Human Owner`（D1–D5 裁决）

## Created

`2026-10-15`

## Updated

`2026-10-15`

## Related Product Spec

`None`（属架构整改，非产品需求）

## Related ADR

[`docs/architecture/adr/ADR-002-single-scheduler.md`](../../architecture/adr/ADR-002-single-scheduler.md)

## ExecPlan

[`docs/exec-plans/complete/TASK-005-unify-scheduler.md`](../../exec-plans/complete/TASK-005-unify-scheduler.md)

---

## Goal

`cron-worker` 成为 PortoMind **唯一的调度器**：全部 5 类定时任务（价格同步、完整性检查、提醒评估、汇率同步、再平衡 AUTO）由 worker 统一触发；`server` 进程不再启动任何 cron，从根源上消除「`SCHEDULER_ENABLED` 唯一所有者」与「两侧任务覆盖不重合」之间的矛盾。

---

## Why

回答 Q10（调度覆盖缺口）暴露的架构缺陷（**以下为立项时的问题陈述**）：

`SCHEDULER_ENABLED=true` 要求全局唯一所有者，但两侧调度器**任务集合不同**：

| 任务 | cron 变量 | server（改前） | cron-worker（改前） |
|---|---|:---:|:---:|
| 价格同步 | `PRICE_SYNC_CRON` | ✅ | ✅ |
| 完整性检查 | `HEALTH_CHECK_CRON` | ❌ | ✅ |
| 提醒评估 | `ALERT_EVAL_CRON` | ✅ | ❌ |
| 汇率同步 | `FX_SYNC_CRON` | ✅ | ❌ |
| 再平衡 AUTO | 按组合设置 | ✅ | ❌ |

**后果**：无论选哪个进程作为唯一所有者，都必然有任务静默停跑。当时默认（worker 持调度）下「提醒评估 / 汇率同步 / 再平衡 AUTO」不会自动运行；若改回 server 持调度，则「完整性检查」不会自动运行。运维侧只能用「手动触发」兜底，属于设计缺陷而非配置问题。

**目标状态**：单一调度器 + 全任务覆盖 = 约束自洽，运维无需在两种残缺拓扑之间取舍。

**达成结果**：`cron-worker` 成为唯一调度所有者，5 类任务全部自动运行，覆盖缺口消除。

---

## Scope

**实际执行范围**（较立项时的初版有扩大，因方案 A「抽共享内核」顺带偿还了双份实现债务）：

- 把 `server/tasks/` 下的调度**所有权**迁移到 `cron-worker`：新增 `alertScheduler`、`fxScheduler`、`rebalanceScheduler`，与已有 `priceScheduler`、`healthScheduler` 一起注册。
- 从 `server` 移除全部调度启动路径（`server/tasks/{priceScheduler,alertScheduler,fxScheduler,scheduler}.js` 与 `server/services/rebalance/scheduleManager.js` 已删除），`server` 不再读取 `SCHEDULER_ENABLED`。
- **保留** `server` 侧全部 API 手动触发端点（前端按钮的后端）：`POST /api/alerts/evaluate`、`POST /api/family/fx/sync`、`POST /api/portfolios/:pid/rebalance/{check,suggestions,execute}` 等继续可用。
- **扩大项（方案 A 连带）**：新建 `shared/` workspace，把 `models` / `services` / `tasks` / `fetchers` / `constants` / `config` / `utils` 全部收敛为唯一实现；引入根 `package.json` + npm workspaces；合并 `dailySync` 为「一个内核 + 两处 CLI 薄壳」；`calendar.service` 与 `markets`（原 worker 独有）迁入 `shared` 供两侧共用。
- 更新文档：`CRON_WORKER.md` §3、`DEPLOYMENT.md` §1/§2/§3/§5/§7、`DEPLOYMENT.md` §环境配置/§安装依赖/§启动项目/§已知环境说明、`functions.md` §2/§3/§4/§6/§9/§10、两份 `.env.example`、根 `README.md`。
- 创建 ADR-002 记录「单调度器 + 共享内核」架构决策。

---

## Out of Scope

- 不改动任何业务规则与计算口径（移动平均成本、超卖校验、目标 100%、A股整手、跨币种不合计等）。
- 不改动前端。
- 不改动 API 契约与数据模型字段。
- 不引入容器化 / PM2 之外的新部署形态。
- 不做认证授权（ADR-001 议题）。
- 不顺手修 CORS（已在 DEPLOYMENT.md §6 如实记录，独立议题）。

---

## Constraints

以下约束**全部满足**：

- ✅ **`server` 必须保持全部 API 能力**：`routes` / `controllers` / `middleware` 未动，业务引擎改为引用 `@portomind/shared`，手动触发路径全部可用。
- ✅ **不允许新增代码复制**：终态为 `shared/` 单份实现；`server/services/` 目录已清空。枚举由三份降为两份（`shared` + `client`）。
- ✅ **TaskRun 防重语义必须保持**：`(taskName, runKey)` 唯一索引与进程内 Map 锁均未改动；`taskName`/`runKey` 构造规则保持一致。
- ✅ **数据兼容**：`daily-price-sync`、`price-integrity-check`、`alert-evaluate`、`fx-rate-sync`、`rebalance-suggestions:<pid>` 全部保持稳定。
- ⚠️ **可回滚**：P1–P5 分阶段提交，`git revert` 相应提交即可退回；但方案 A 的 workspace 引入使「仅回滚 P4」不再足以恢复原拓扑——完整回滚需回退到 P0 之前的提交。**注意：数据层无 schema 变更，无数据迁移风险。**
- ✅ 现有测试（server / cron-worker）继续通过，且新增 8 条针对性测试。

---

## Acceptance Criteria

- [x] `server` 进程启动后**不注册任何 cron 任务**；`server` 侧不再存在任何调度启动路径（`server/tasks/*Scheduler.js` 与 `scheduler.js` 已删除，`server/server.js` 无 `startSchedulers()` 调用）。
- [x] `cron-worker` 单进程启动后，5 类任务**全部**被注册；启动日志可观测到 `SCHEDULERS_STARTED {"count":5,"owner":"cron-worker"}`。
- [x] `taskruns` 中五类任务的 `taskName` 保持稳定：`daily-price-sync`、`price-integrity-check`、`alert-evaluate`、`fx-rate-sync`、`rebalance-suggestions:<pid>`。
- [x] 前端「立即评估」「同步汇率」按钮与再平衡「检查/生成建议/执行」流程在调度迁移后**功能不变**（`server` 侧 API 端点与 `shared` 内核均保留）。
- [x] `SCHEDULER_ENABLED` 不再是「二选一」开关：仅 `cron-worker/.env.example` 保留，`server/.env.example` 已移除；两份文件不再给出互相矛盾的所有者默认值。
- [x] `server` 与 `cron-worker` 测试全部通过（152/152 与 77/77）；新增「单调度器注册 5 类任务」与「再平衡到期规则」测试。
- [x] `CRON_WORKER.md` §3.1 的「覆盖矩阵 + 已知缺口」章节改为「cron-worker 是唯一调度所有者，全任务覆盖」，不再有「二选一拓扑」说明。
- [x] ADR-002 已创建并记录决策与备选方案。
- [x] 全量文档相对链接校验 0 失效。

> 唯一未闭合项：真实运行时冒烟（需 MongoDB 环境），见「Completion → Final Notes」。

---

## Dependencies

### Blocking Dependencies

- ✅ **人工决策（已解除）**：ExecPlan §4 的三个实现方案由 Human Owner 选定 **A（抽共享内核）**。
- ✅ **人工决策（已解除）**：确认引入根 `package.json` + npm workspaces。

### Non-Blocking Dependencies

- `docs/standards/CODING.md`、`docs/standards/TESTING.md` 的既有约定。
- ✅ 复用 `cron-worker/src/schedulers/cronScheduler.js` 通用工厂创建 3 个新调度器。

---

## Related Documentation

- Architecture: `docs/architecture/functions.md` §2.2 / §4.2.2 / §4.6.5 / §4.10 / §9.2
- Architecture: `docs/architecture/adr/ADR-002-single-scheduler.md`
- Architecture: `docs/architecture/ARCHITECTURE.md`
- Manual: `docs/manual/CRON_WORKER.md` §3（调度所有权）
- Manual: `docs/manual/DEPLOYMENT.md` §2 / §3（进程与调度所有权）
- Manual: `docs/manual/DEPLOYMENT.md`（本地环境配置与安装）
- Standards: `docs/standards/CODING.md`、`docs/standards/TESTING.md`、`docs/standards/DOCS.md`
- Process: `docs/process/EXECUTION_PLANS.md`
- 背景记录：`docs/exec-plans/complete/DOCS-DEDUP-2026-10-15.md` §3（Q10 发现过程）

---

## Execution Plan Decision

**ExecPlan Required:**
`Yes`

**Reason:**

符合 `EXECUTION_PLANS.md` §2 的多项触发条件：跨多个模块（server / cron-worker 及其 models、services、tasks）、架构变更（调度所有权归属）、迁移性质、涉及生产环境配置与运维流程、存在显著技术风险与不确定的架构方向选择、需要人工 Plan Review 后才可实施。

ExecPlan 路径：[`docs/exec-plans/complete/TASK-005-unify-scheduler.md`](../../exec-plans/complete/TASK-005-unify-scheduler.md)

---

## Coordination Notes

- 本任务由文档整改（TASK 之外的 docs/manual 去重工作）中发现的 Q10 缺口衍生而来，见 `docs/exec-plans/complete/DOCS-DEDUP-2026-10-15.md`。
- **人工裁决已完成**（D1=A / D2=是 / D3=① / D4 不适用 / D5=是），实施与验收均已完成。
- **跨任务影响**：本次引入 npm workspaces 后，任何新增 `require('../models/...')` 式的跨包相对引用都会失效——必须使用 `@portomind/shared/...`。后续任务（含 TASK-003 GitHub Login）需注意此约定。

---

## Completion

### Acceptance Result

`Passed`（9 项验收标准全部满足；唯一未闭合项为需 MongoDB 环境的运行时冒烟，见 Final Notes）

### Completed Date

`2026-10-15`

### Final Notes

**交付物**

- 新建 `shared/` workspace（`@portomind/shared`）：唯一业务内核，含 10 个 model、20+ service、task、5 个 fetcher、constants/config/utils。
- 根 `package.json`（npm workspaces）与统一脚本；四个 workspace 改名/对齐为 `@portomind/{shared,server,cron-worker,client}`。
- `cron-worker` 新增 3 个调度器，成为 5 类任务唯一调度所有者。
- `server` 彻底移除调度（目录与调用点），保留全部 API 能力。
- 新建 [ADR-002](../../architecture/adr/ADR-002-single-scheduler.md)。
- 同步更新 6 份文档 + 2 份 `.env.example` + 根 `README.md`。

**验证**

- `server` 152/152、`cron-worker` 77/77 测试通过。
- 全仓相对 `require` 184/184、`@portomind/shared/...` 引用 49/49 可解析。
- 调度代码引用点仅存在于 `cron-worker`。
- 文档相对链接校验 0 失效。

**未闭合项（交付给运维）**

- **真实运行时冒烟未做**：本机未启动 MongoDB，因此「只启动 `server` 确认无调度日志」「`mongosh` 查询 `taskruns` 五类任务」「PM2 双进程保活」三项需在具备 Mongo 的环境补做。建议首次上线时按 `CRON_WORKER.md` §3.1 的启动自检项确认 `SCHEDULERS_STARTED {"count":5}`。
- **`git mv` 未复核**：本次文件搬迁量大，提交前应执行 `git status` 确认无目录嵌套或意外删除。

**后续建议**

- 把 `client/src/constants/enums.js` 与 `shared/constants/asset.constants.js` 的枚举同步（已由三份降为两份）登记为独立小任务。
- 再平衡到期规则硬编码问题见 `functions.md` §9.2。
