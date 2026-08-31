# cron-worker 整改 / 优化 Todo

> 本清单基于对 cron-worker 全量代码的评审整理（未做任何代码修改）。
> 优先级：P0=正确性/风险，建议尽快处理；P1=可维护性重构；P2=测试与增强。
> 命令与文件路径均已核对到具体行号，处理时可从对应位置入手。

---

## P0 正确性与风险

- [x] **historySync 日志通道不一致（用错 logger）**
  - 位置：`src/tasks/historySync.cjs:15`
  - 现状：任务内使用 `logger`，而 `dailySync` / `integrityCheck` 使用 `taskLogger`；导致 historySync 的日志不进 `task-*.log` 文件，与 AGENTS.md「任务日志用 taskLogger」约定相悖。
  - 建议：统一为 `taskLogger`。

- [x] **行情抓取双重超时导致 host 回退失效**
  - 位置：`src/fetchers/yahooFetcher.js`（`getChart` 17-37）、`eastmoneyFetcher.js`（`getQuote` 29-56）、`src/fetchers/timeout.js:11`
  - 现状：`withMarketDataTimeout` 的外层 `Promise.race` 计时覆盖整个 `getChart`/`getQuote` 调用（含 query1+query2 / push2+push2delay 两次请求），而每个 axios 请求又单独带 `MARKET_DATA_TIMEOUT_MS` 超时。若第一个 host 超时挂起，外层计时器先触发，第二个 host 几乎没有机会执行，回退在超时场景形同虚设。
  - 建议：把外层超时收敛为「单次请求」粒度（如封装 `fetchOnce(host)` 再循环），避免外层计时覆盖多 host；补一个 host 回退 + 超时的单测。

- [x] **CN 节假日表未维护年份被静默当作全开市**
  - 位置：`src/services/calendar.service.js:135`（`CN_HOLIDAYS[year] || []`）
  - 现状：`CN_HOLIDAYS` 只维护到 2026；2027+ 直接返回空数组，完整性检查会把所有工作日都算作交易日，理论天数被高估、缺口被漏报。
  - 建议：年份不在表中时打 `warn` 日志（或抛错强制人工确认），避免静默错误。

- [x] **完整性检查首次自动补全可能触发超大规模回补**
  - 位置：`src/tasks/integrityCheck.js`（`INTEGRITY_AUTO_REPAIR` 默认开启 + `maxRepairRanges=50`）
  - 现状：某资产 `launchDate` 很旧而 DB 无历史时，第一次调度会按缺失区间整段回补（可能数千天、大量请求，且无行数/跨度上限）。
  - 建议：增加「单资产单次修复的天数跨度上限」或 `--dry-run` 预览模式；截断（`slice`）时记录 warn（见下条）。

- [ ] **缺失区间被静默截断（maxRepairRanges）**
  - 位置：`src/tasks/integrityCheck.js`（`missingRanges.slice(0, maxRepairRanges)`）
  - 建议：发生截断时 `taskLogger.warn` 提示剩余未修复区间数，避免运维误以为全部补齐。

- [x] **`marketDate()` 重复实现**
  - 位置：`src/tasks/dailySync.js:16` 与 `src/tasks/integrityCheck.js`（约 305 行），与 `src/utils/marketTime.js` 的 `todayString` 职责重叠。
  - 建议：统一收口到 `src/utils/marketTime.js`，两处任务改为引用。

---

## P1 结构 / 可维护性

- [ ] **拆分过大的 `integrityCheck.js`（386 行）**
  - 现状：一个文件混杂 CLI 解析、`runTrackedTask` 封装、报告生成、日历/交易日计算、DB 查询、缺失区间合并、补全编排等六类职责，`countAsset` 的依赖注入契约也较隐晦。
  - 建议：纯计算函数（`marketTimezone` / `marketToday` / `expectedTradingDates` / `expectedBucketCandidates` / `groupMissingRanges`）下沉到 `src/utils/` 或新增 `src/services/integrity.service.js`；任务文件只保留 `runIntegrityCheck` + `integrityCheck` + CLI。

- [x] **调度器目录与实现不一致**
  - 位置：`src/tasks/priceScheduler.js` vs `src/schedulers/healthScheduler.js`
  - 现状：两个调度器放置在不同目录，且结构高度雷同（cron 校验、时区解析、回调 try/catch、启动日志）。
  - 建议：统一目录（建议都放 `src/schedulers/`），并抽一个 `createCronScheduler({ envKey, defaultCron, taskName, run })` 帮助函数消除重复。

- [x] **dotenv 加载四处重复**
  - 位置：`index.js:4-5`、`src/tasks/dailySync.js:5-6`、`src/tasks/historySync.cjs:7-8`、`src/tasks/integrityCheck.js:2-3`
  - 建议：抽 `src/config/env.js` 统一 `dotenv.config({ path })`，其余模块不再各自加载。

- [ ] **`mongoose.set('strictQuery', true)` 三处重复且覆盖不一致**
  - 位置：`dailySync.js:8`、`historySync.cjs:11`、`integrityCheck.js`（仅在 CLI 分支内）
  - 现状：`integrityCheck` 作为库被调用时没有设置 strictQuery。
  - 建议：集中到 `src/config/database.js` 的 `connect()` 里，任务文件不再各自设置。

- [ ] **`storedBucketDates` 默认参数内 `require('../models/price')` 写法不直观**
  - 位置：`src/tasks/integrityCheck.js`（`storedBucketDates` 默认参数）
  - 建议：改为顶部正常 require 并配合上一条统一模型初始化，或显式依赖注入。

- [ ] **过期注释**
  - 位置：`src/tasks/priceScheduler.js:2`（"dailySync 依赖的 services 尚未移植完成"）
  - 现状：services 已全部移植，注释误导。
  - 建议：更新或删除。

- [ ] **`package.json` 缺 `engines` 字段**
  - 现状：`../doc/DEVELOPMENT.md` 记录基线为 Node 24，但 package.json 未声明。
  - 建议：补充 `"engines": { "node": ">=18" }`（或按实际基线）。

- [ ] **`.env.example` 缺 `MARKET_DATA_TIMEOUT_MS`**
  - 位置：`cron-worker/.env.example`
  - 现状：实际 `.env` 已配置（10000），示例未覆盖。
  - 建议：补上并注释含义。

---

## P2 测试与增强

- [ ] **fetcher 层无单测**
  - 现状：`yahooFetcher` / `eastmoneyFetcher` 直接依赖 axios 网络，无测试。
  - 建议：用注入/axios mock 覆盖：host 回退、timeout→`TIMEOUT`、429→`RATE_LIMIT`、404/`data:null`→`NOT_FOUND`、非法响应→`INVALID_RESPONSE`，以及价格按 `f59` 缩放。

- [x] **`priceFetch.service.js` 路由无单测**
  - 现状：`resolveFetcher` 已覆盖 market 优先（CN-FUND→Tiantian、CN*/US/CA/HK）与 symbol 特征推断（`.TO` / `.CN` / `.SS/.SZ` / `.HK` / 6 位数字码），见 `test/priceFetch.test.js`（含 `.HK` 与 `.CN` 互斥用例）。

- [ ] **`priceStorage.service.js` 无单测**
  - 建议：覆盖 `normalizeDailyRecord` 的时区归桶（`canonicalDayTimestamp`）与 symbol 大写规范化。

- [ ] **`asset.service.js` 的 `getAssetsBySymbols` 无单测**
  - 位置：`src/services/asset.service.js`
  - 建议：补 active 过滤、符号去重与顺序保持、空输入用例。

- [ ] **调度器层无测试**
  - 现状：`priceScheduler` / `healthScheduler` / `scheduler.js` 的 `startSchedulers`（含 `SCHEDULER_ENABLED=false` 分支、stop 幂等）均无测试；`healthScheduler.test.js` 只测 cron 校验。
  - 建议：抽离回调（如注入 `run` 函数）后测试回调触发与失败兜底。

- [ ] **无 MongoDB 集成测试**
  - 现状：AGENTS.md 已标注「仍缺完整的集成测试」，`dailySync` / `historySync` / `integrityCheck` 均未做真实库的端到端断言。
  - 建议：用 `mongodb-memory-server` 或 dev 库做：价格幂等 upsert、TaskRun 落库与防重、完整性 Expected/Actual 对比、补全后重查收敛。

- [x] **完整性检查补全应传资产对象而非 symbol 字符串**
  - 现状：`historySync` 已改为按 `--symbols` 解析 DB 资产对象（`resolveItems`，DB 未命中的符号退化为原始字符串走特征路由），`integrityCheck.repairAsset` 的 `{ symbols: [symbol] }` 自动获得 market 上下文；CN-FUND 场外基金回补因此不再误走 EastMoney。

- [ ] **健康检查调度可增加启用开关**
  - 现状：`scheduler.js` 恒注册 `startHealthScheduler()`，无 `HEALTH_CHECK_ENABLED` 之类的开关。
  - 建议：增加开关，便于只跑价格同步的部署形态。

- [ ] **未来 `launchDate`（晚于 `to`）时静默视为完整**
  - 位置：`integrityCheck.js`（`expectedTradingDates` 为空 → ratio=1）
  - 建议：`launchDate > to` 时 `warn`，提示配置可疑。

---

## 运维提示（无需改代码，但建议列入巡检）

- CN 节假日表 `src/config/markets.js` 需逐年按交易所公告核对（2027+ 未维护，见 P0）。
- 切换调度所有权后确认只有一个进程输出 `SCHEDULERS_STARTED`。
- `MARKET_TIMEZONE` 变更会改变日期归桶，改动前评估对既有数据的影响。
