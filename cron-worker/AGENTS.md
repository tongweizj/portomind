# AGENTS.md — PortoMind Cron Worker

PortoMind **唯一的调度进程**（CommonJS、纯 Node、无 Web 框架）。注释与日志字段风格使用简体中文。
架构决策见 [`docs/architecture/adr/ADR-002-single-scheduler.md`](../docs/architecture/adr/ADR-002-single-scheduler.md)。

## 当前状态：5 类调度全部由本进程注册

`npm start` → `index.js` → `src/tasks/scheduler.js` 注册 5 个调度器：

| 调度器 | 默认 cron | 环境变量 | 触发的任务 |
|---|---|---|---|
| `src/schedulers/priceScheduler.js` | `0 3 * * *` | `PRICE_SYNC_CRON` | 价格同步 |
| `src/schedulers/healthScheduler.js` | `30 3 * * *` | `HEALTH_CHECK_CRON` | 完整性检查 |
| `src/schedulers/alertScheduler.js` | `0 4 * * *` | `ALERT_EVAL_CRON` | 提醒评估 |
| `src/schedulers/fxScheduler.js` | `30 9 * * *` | `FX_SYNC_CRON` | 汇率采集 |
| `src/schedulers/rebalanceScheduler.js` | `0 0 * * *` | `REBALANCE_CHECK_CRON` | 再平衡**单日分发** |

启动自检：日志出现 `SCHEDULERS_STARTED {"owner":"cron-worker","count":5}`。`count` 不是 5 说明有调度器注册失败或被 `SCHEDULER_ENABLED=false` 关停。

`src/schedulers/cronScheduler.js` 提供通用工厂 `createCronScheduler({ envKey, defaultCron, taskName, run })`，并导出 `resolveTimezone` / `logCode`。**新增调度器一律复用它**，不要手写 node-cron 样板。

## 关键架构约定（务必先读）

1. **业务逻辑不在本目录**。引擎（models / services / tasks 内核 / fetchers）全部位于 `../shared`，通过 `@portomind/shared/...` 引用。本进程只持有「**触发权**」。
2. **禁止在本目录复制业务实现**。历史上 `src/services/*`、`src/fetchers/*`、`src/models/*`、`src/utils/*` 曾存在（与 server 两份并存），已在 TASK-005 全部迁入 `shared/`。任何「再复制一份」的做法都会重新制造口径漂移债务。
3. **跨包引用必须用包名**：`require('@portomind/shared/services/...')`。`shared/` 内部仍使用相对路径（搬迁时保留了原目录结构，故包内相对引用零改动）。
4. **`src/tasks/dailySync.js` 与 `src/tasks/integrityCheck.js` 的角色不同**——前者是 CLI 薄壳（`.env` → 建连 → 调用 `@portomind/shared/tasks/dailySync` → 断开），后者是本进程独有的任务实现（无 API 手动端点）。
5. `server` 进程**没有任何调度路径**。若发现 server 侧出现 cron 注册代码，那是回归，应删除。

## 环境与手动运行

- 环境变量统一由 `src/config/env.js` 加载 **`cron-worker/.env`**（不是 `server/.env`）；必须在读取 `process.env` 的模块（`marketTime`、`timeout`）之前加载。必需 `MONGO_URI`；时区默认 `SCHEDULER_TIMEZONE || MARKET_TIMEZONE || America/Toronto`。
- 逻辑日志目录默认为**仓库根 `logs/`**（`LOG_DIR` 可覆盖），与 `server` 进程共用；`task-%DATE%.log` 记录任务日志，`app-%DATE%.log` 记录通用日志。两进程共用目录但文件名不冲突。
- 价格入库按 `MARKET_TIMEZONE`（单一全局时区，非按市场）做日期规范化（`@portomind/shared/utils/marketTime`）。CN 白天价会按 ET 日期归桶——这是继承自旧实现的行为，改动前先确认不会与既有数据日期边界错位。
- 手动入口（也定义在 `package.json` scripts）：

```bash
node src/tasks/dailySync.js                    # 价格同步，trigger=MANUAL
node src/tasks/historySync.cjs --from YYYY-MM-DD [--to ...] [--symbols VOO,510300] [--concurrency 3]
node src/tasks/integrityCheck.js [--symbols ...] [--from ...] [--to ...] [--no-repair] [--dry-run]
```

- **再平衡单日分发**（`rebalanceScheduler.js`）：只注册一个每日 cron，遍历未归档组合，用 `SCHEDULE_DUE_RULES` 判断当天是否到期（`daily` 恒真 / `weekly` 周一 / `monthly` 每月 1 日）。新增 `rebalanceSchedule` 取值时必须同步补规则，否则该频率**静默永不触发**。
- 多实例部署时只允许**一个** worker 设 `SCHEDULER_ENABLED=true`，其余必须为 `false`。

## 任务约定

- 任务函数支持依赖注入（`options.dependencies`，默认回退到真实实现），用于测试。
- 防重两层：`TaskRun` 的 `(taskName, runKey)` 唯一索引 + 进程内 Map 锁。runKey：SCHEDULED 用市场日期（`marketDate()`），MANUAL 用 `manual:<ISO时间>`。
- **`taskName` 必须稳定**：`daily-price-sync`、`price-integrity-check`、`alert-evaluate`、`fx-rate-sync`、`rebalance-suggestions:<portfolioId>`。改名会导致 `taskruns` 历史断代。
- 结果状态：`SUCCEEDED` / `PARTIAL`（有失败）/ `FAILED` / `SKIPPED`（重复或已在跑）。
- 逐资产故障隔离：单个资产失败只记录 `{item, category, provider, retryable, message}` 进 `failures`，不中断其余同步，最终返回 `{totalCount, successCount, failureCount, failures}`。
- 错误对象统一带 `category` / `provider` / `retryable` 字段；任务日志用 `taskLogger` 结构化字段（`TASK_START` / `TASK_END` / `PRICE_SYNC_*`），敏感值会被脱敏。

## 测试

`npm test` 运行 `node --test`（`test/` 下 retry、calendar、fetchers、priceFetch、dailySync、historySync、integrityCheck、healthScheduler、cronScheduler、scheduler、**rebalanceScheduler** 单测）。没有 lint/typecheck。

改了调度器注册或再平衡到期规则后，必须同步更新 `test/scheduler.test.js` / `test/rebalanceScheduler.test.js`。

## 文档

- 调度进程手册（cron-worker）：`../docs/manual/CRON_WORKER.md`
- 系统部署手册（部署 / PM2 / 环境变量 / 安全边界）：`../docs/manual/DEPLOYMENT.md`
- 系统部署手册（本地环境与验证命令）：`../docs/manual/DEPLOYMENT.md`
- 功能全景（调度与数据质量）：`../docs/product/lines/PL-0-platform-foundation.md` §6.4
