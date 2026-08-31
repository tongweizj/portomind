# AGENTS.md — PortoMind Cron Worker

独立调度/价格同步进程的提取目标（从 `../server` 拆分，CommonJS、纯 Node）。注释与日志字段风格使用简体中文。

## 当前状态：价格同步链路已可运行

- 基础环境已就绪：`package.json` 含 mongoose、dotenv、node-cron、winston、dayjs、minimist、axios、p-limit（p-limit 需用 CJS 兼容的 4.x，且 CJS 下要取 `.default`）；`src/config/logger.js`（`logger` / `taskLogger`，控制台 + error/combined 文件）、`src/config/database.js`（`connect` / `disconnect`）、`index.js`（env → DB → 调度）、`src/tasks/scheduler.js`（统一启动入口）+ `src/schedulers/`（`cronScheduler.js` 通用工厂，`priceScheduler.js` / `healthScheduler.js` 注册价格同步与健康检查 cron）已创建。
- `src/fetchers/` 已就绪：`errors.js`、`timeout.js`（与 server 一致）、`yahooFetcher.js`（axios 直连 Yahoo chart API，query1 限流回退 query2）、`eastmoneyFetcher.js`（push2/push2delay 实时 + push2his K 线，价格按 `f59` 小数位缩放）、`tiantianFetcher.js`（场外基金 CN-FUND 单位净值，走 `api.fund.eastmoney.com/f10/lsjz`；实时估算接口 `fundgz.1234567.com.cn` 在部分网络不可达故未采用；**该接口服务端把 pageSize 截断为 20，分页步长必须按 20 计算**）。`src/services/priceFetch.service.js` 已就绪：按资产 `market`（US/CA/CN*）或 Symbol 特征（`.TO`→Yahoo；`.CN`→Tiantian；`.SS/.SZ`、6 位数字码→EastMoney）路由，CN-FUND 固定走天天基金，已接入 `fetchWithRetry` 重试。
- 容错与日历：`src/utils/retry.js`（`fetchWithRetry`，指数退避 + 抖动，仅重试 `retryable` 错误，最多 3 次）、`src/services/calendar.service.js`（`isMarketOpenToday`，US/CA 节假日按规则计算，CN 用 `src/config/markets.js` 静态闭市表**需逐年维护**，未维护年份按无节假日判定并打 `CN_HOLIDAYS_YEAR_NOT_MAINTAINED` warn）、`src/services/priceStorage.service.js` + `src/models/price.js`（upsert/bulkWrite，`(symbol, timestamp)` 唯一索引去重）。
- 任务链路已通：`src/services/asset.service.js`（`getActiveAssets`）、`src/models/asset.js`、`src/services/taskRunner.js`、`src/models/taskRun.js` 已移植。`dailySync` 逐资产校验市场开市（休市跳过记 `PRICE_SYNC_ASSET_SKIPPED_MARKET_CLOSED`）；`historySync` 用 p-limit 并发（默认 3）支持 `--symbols`。已用真实 MongoDB（dev 库）验证 dailySync/historySync 端到端运行、TaskRun 落库与价格去重。
- 数据质量（完整性检查）已通：`src/tasks/integrityCheck.js` 按资产 `launchDate`（Asset 模型新增的可选字段，**server 与 cron-worker 模型均已加**，未填的资产被跳过记 `SKIPPED_NO_LAUNCH_DATE`）+ 所属市场推算理论交易日（Expected），查 Price 实际落库记录（Actual），输出含 `missingCount` 与 `completenessRatio` 的结构化报告；缺口记 `DATA_GAP` 进 TaskRun（status=PARTIAL），并按缺失区间（`groupMissingRanges` 合并，`clipRepairRanges` 限制在最近 `INTEGRITY_REPAIR_MAX_DAYS` 天窗口内）可选自动调 `historySync` 补全（`INTEGRITY_AUTO_REPAIR`，默认开；`--dry-run` 只出预览）。`src/schedulers/healthScheduler.js` 注册健康检查 cron（默认 `HEALTH_CHECK_CRON=30 3 * * *`，晚于价格同步 30 分钟），已接入 `src/tasks/scheduler.js`。
- 仍缺：完整的集成测试。`npm test` 运行 `node --test`（`test/` 下 retry、calendar、dailySync、historySync、integrityCheck、healthScheduler 单测）；没有 lint/typecheck。
- 不要在还缺少这些依赖的情况下运行或断言功能可用。

## 与 server 的关系

`src/tasks/*` 从 `../server/tasks/` 拆分并演进：`dailySync.js` 增加了 `loadPrice(asset)`（传资产对象以启用 market 路由）、逐资产 `isMarketOpenToday` 开市校验与 `skippedCount`（TaskRun 日志可见、模型不含该字段）；`historySync.cjs` 增加了 p-limit 并发、`--symbols` 与 `--concurrency`（环境变量统一由 `src/config/env.js` 加载，不再各自调 dotenv）。逻辑的真正实现和参考源在 `../server`：
- `config/logger.js`（导出 `logger` / `taskLogger`）、`services/taskRunner.js`、`services/asset.service.js`、`services/priceFetch.service.js`、`services/priceStorage.service.js`、`models/taskRun.js`
- 移植时保持行为一致；改动同步任务逻辑时应先对照 `../server/tasks/*`。

## 环境与手动运行

- 环境变量统一由 `src/config/env.js` 加载 **`cron-worker/.env`**（不是 server/.env）：`index.js` 与 `src/tasks/*` 都只需 `require('../config/env')`（index.js 为 `./src/config/env`），不再各自调用 dotenv。必须在读取 `process.env` 的模块（`marketTime`、`timeout`）之前加载。必需 `MONGO_URI`；时区默认 `SCHEDULER_TIMEZONE || MARKET_TIMEZONE || America/Toronto`。
- 价格入库按 `MARKET_TIMEZONE`（单一全局时区，非按市场）做日期规范化（`src/utils/marketTime.js`，与 server 一致）。CN 白天价会按 ET 日期归桶——这是继承自 server 的行为，改动前先对照 `../server`，避免与既有数据日期边界错位。
- 手动同步：`node src/tasks/dailySync.js`（触发 `MANUAL`）；历史回补：`node src/tasks/historySync.cjs --from YYYY-MM-DD [--to YYYY-MM-DD] [--symbols VOO,510300] [--concurrency 3]`（`--from` 必填）；完整性检查：`node src/tasks/integrityCheck.js [--symbols VOO,510300] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--no-repair] [--dry-run]`（不传符号检查全部激活资产；未填 `launchDate` 的资产跳过；`--no-repair` 关闭自动补全；`--dry-run` 只出预览报告不补全）。自动补全默认只覆盖最近 `INTEGRITY_REPAIR_MAX_DAYS`（默认 30）天的缺失区间，更早的缺口延后（`INTEGRITY_REPAIR_DEFERRED`）。
- 部署约束（来自根 README / DEVELOPMENT.md）：同一时间只能有一个 Node 进程作为调度所有者（`SCHEDULER_ENABLED=true`），不再用系统 cron 调用任务。若 cron-worker 接管调度，API 进程必须设 `SCHEDULER_ENABLED=false`。

## 任务约定

- 任务函数支持依赖注入（`options.dependencies`，默认回退到真实实现），用于测试；导出可复用函数与主入口（`require.main === module` 守卫）。
- 防重两层：`TaskRun` 的 `(taskName, runKey)` 唯一索引 + 进程内 Map 锁。runKey：SCHEDULED 用市场日期（`marketDate()`），MANUAL 用 `manual:<ISO时间>`。
- 结果状态：`SUCCEEDED` / `PARTIAL`（有失败）/ `FAILED` / `SKIPPED`（重复或已在跑）。
- 逐资产故障隔离：单个资产失败只记录 `{item, category, provider, retryable, message}` 进 `failures`，不中断其余同步，最终返回 `{totalCount, successCount, failureCount, failures}`。
- 错误对象统一带 `category` / `provider` / `retryable` 字段；任务日志用 `taskLogger` 结构化字段（`TASK_START` / `TASK_END` / `PRICE_SYNC_*`），敏感值会被脱敏。

## 文档

- 运行与验证见 `../doc/DEVELOPMENT.md`；日常操作与排障见 `../doc/USER_GUIDE.md`（§6/§7）。
