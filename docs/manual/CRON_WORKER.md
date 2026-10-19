# cron-worker 使用手册

> **cron-worker 进程的单一归属文档**：进程是什么、如何安装/启动/停止、五大定时任务的调度机制、
> 任务执行语义、数据质量程序（价格同步 / 完整性检查 / 历史回补）、命令行手动入口、监控排障、如何新增调度器。
>
> 数据质量任务的**业务引擎**实现在 `@portomind/shared`，与 server 手动端点共用同一份代码。
> 进程安装/启动/生产保活见 [系统部署手册](./DEPLOYMENT.md)；界面操作见 [client 使用手册](./CLIENT.md)；
> API 手动端点见 [server 使用手册](./SERVER.md)。

---

## 1. 这是什么

`cron-worker` 是 PortoMind 的**唯一调度进程**。纯 Node（CommonJS），**没有 Web 框架、不监听端口**，
唯一职责是按时间表触发后台任务。架构决策见 ADR-002（单一调度器）。

进程模型（三进程 + 一代码库）：

```text
  server      → Express API，监听端口，**不注册任何 cron**（TASK-005 后已收口）
  cron-worker → 唯一调度所有者，注册全部 5 类定时任务 + 提供 CLI 手动入口
  shared      → 代码库（不是进程），承载全部业务内核（models/services/tasks/fetchers…）
  client      → 前端 SPA
```

**关键认知**：cron-worker 只持有「触发权」，不复制业务能力。5 类任务的业务引擎都在
`@portomind/shared`，cron-worker 与 server 的手动端点走**同一份函数**（见 §6）。

---

## 2. 安装、启动与关闭

### 2.1 安装

PortoMind 是 npm workspaces monorepo。**在仓库根目录一次 `npm ci`** 即可安装全部 workspace
（含 `shared` / `server` / `cron-worker` / `client`）；cron-worker 依赖根目录解析到的 `@portomind/shared`。
详见 [系统部署手册](./DEPLOYMENT.md) §「安装依赖」。

### 2.2 配置环境变量

cron-worker 通过 `src/config/env.js` 加载 **`cron-worker/.env`**（不是 `server/.env`）。
完整变量表见 [系统部署手册](./DEPLOYMENT.md) §「环境变量」。本进程**必需** `MONGO_URI`（与 server 同一库）；
调度相关核心变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SCHEDULER_ENABLED` | `true` | 本进程是否启用调度；仅 cron-worker 读取（`server` 已无此变量） |
| `SCHEDULER_TIMEZONE` | `America/Toronto` | 所有 `*_CRON` 表达式的解释时区 |
| `MARKET_TIMEZONE` | `America/Toronto` | 价格日期归桶时区。**改动会改变历史数据日期边界**，务必评估 |
| `PRICE_SYNC_CRON` | `0 3 * * *` | 价格同步，每天 03:00 |
| `HEALTH_CHECK_CRON` | `30 3 * * *` | 完整性检查，每天 03:30 |
| `ALERT_EVAL_CRON` | `0 4 * * *` | 提醒评估，每天 04:00 |
| `FX_SYNC_CRON` | `30 9 * * *` | 汇率同步，每天 09:30 |
| `REBALANCE_CHECK_CRON` | `0 0 * * *` | 再平衡分发，每天 00:00 |
| `INTEGRITY_AUTO_REPAIR` | `true` | 完整性检查出缺口时，自动调 `historySync` 补全 |
| `INTEGRITY_REPAIR_MAX_DAYS` | `30` | 自动补全只覆盖「最近 N 天」内的缺失区间，更早缺口延后（防首次超大规模回补） |
| `MARKET_DATA_TIMEOUT_MS` | `10000` | 单次行情请求超时（毫秒） |

> 时区解析优先级：`SCHEDULER_TIMEZONE` → `MARKET_TIMEZONE` → `America/Toronto`。

### 2.3 启动（前台 / 生产）

```bash
# 前台运行（调试用）
cd cron-worker
npm start                      # 等价 node index.js

# 生产（PM2，单实例）
npm ci --omit=dev
pm2 start index.js --name portomind-worker --instances 1
pm2 save
pm2 startup                   # 按提示启用开机自启（仅需一次）
```

进程启动链路：`index.js` → 加载 `.env` → 连接 MongoDB → `startSchedulers()`
（`src/tasks/scheduler.js` 注册 5 个调度器）。生产保活与 Nginx/上线检查见 [系统部署手册](./DEPLOYMENT.md)。

### 2.4 关闭

进程监听 `SIGINT` / `SIGTERM`，收到后：停止全部调度器 → 断开 MongoDB → 退出。
`pm2 stop portomind-worker` / `pm2 delete portomind-worker` 即触发相应信号。

### 2.5 启动自检（必须确认）

启动成功时日志出现（结构化 JSON，字段 `owner` / `count`）：

```text
SCHEDULERS_STARTED {"owner":"cron-worker","count":5}
```

- `count` 不是 5 → 有调度器注册失败，或被 `SCHEDULER_ENABLED=false` 关停。
- `server` 进程**不应**出现 `SCHEDULERS_STARTED`（若出现在 server 侧，是回归，应删除）。

---

## 3. 五大定时任务一览

全部由 `src/tasks/scheduler.js` 注册。任一时区/周期都可经对应环境变量覆盖。

| # | 任务 | cron 变量 | 默认时间 | 调度器文件 | 触发函数（来自 shared） |
|---|---|---|---|---|---|
| 1 | 价格同步 | `PRICE_SYNC_CRON` | 03:00 | `schedulers/priceScheduler.js` | `shared/tasks/dailySync` |
| 2 | 完整性检查 | `HEALTH_CHECK_CRON` | 03:30 | `schedulers/healthScheduler.js` | `tasks/integrityCheck`（本进程独有） |
| 3 | 提醒评估 | `ALERT_EVAL_CRON` | 04:00 | `schedulers/alertScheduler.js` | `shared/services/alertEngine.service` |
| 4 | 汇率同步 | `FX_SYNC_CRON` | 09:30 | `schedulers/fxScheduler.js` | `shared/services/fxRate.service` |
| 5 | 再平衡分发 | `REBALANCE_CHECK_CRON` | 00:00 | `schedulers/rebalanceScheduler.js` | `shared/services/rebalance/*` |

数据更新链路（全部由本进程触发）：

```text
每日 00:00  再平衡分发 → 按各组合 rebalanceSchedule 判断是否到期，执行阈值检查 → 建议 → 提醒
每日 03:00  价格同步 → dailySync 拉取激活资产最新价入库
每日 03:30  完整性检查 → 缺口自动调 historySync 补全
每日 04:00  提醒评估 → 提醒规则评估
每日 09:30  汇率同步 → 汇率采集
执行留痕    taskruns 集合（TaskRun）+ logs/task-YYYY-MM-DD.log
```

### 3.1 调度引擎（通用工厂）

所有调度器都通过 `src/schedulers/cronScheduler.js` 的
`createCronScheduler({ envKey, defaultCron, taskName, run })` 创建，**禁止手写 node-cron 样板**。工厂统一负责：

- 读取 `process.env[envKey]` 或回退 `defaultCron`；
- `cron.validate()` 校验表达式（非法直接 `throw`，进程启动即失败）；
- 按 `resolveTimezone()` 解释时区；
- 回调外层 `try/catch`，任务抛错只记 `<TASK>_SCHEDULER_FAILED`，不拖垮进程；
- 启动日志 `<TASK>_SCHEDULER_STARTED { cronExpression, timezone }`。

### 3.2 再平衡「单日分发」算法

迁移前 server 会为每个组合单独注册 cron。迁到独立进程后改为**单日分发**（`rebalanceScheduler.js`）：
每天 00:00 读取全部**未归档**组合，按各自的 `rebalanceSettings.rebalanceSchedule` 判断当日是否到期。

到期规则硬编码在 `SCHEDULE_DUE_RULES`（**新增 `rebalanceSchedule` 取值必须同步补规则，否则静默永不触发**）：

| schedule | 到期条件 |
|---|---|
| `daily` | 恒真（每日） |
| `weekly` | 周一（`weekday === 'Mon'`） |
| `monthly` | 每月 1 日（`dayOfMonth === 1`） |

- 未归档组合自动纳入、归档自动剔除，无需跨进程重同步；
- 归档组合在查询与执行之间二次防御性跳过（CM-20）；
- 逐组合故障隔离：单个组合失败不中断其余；
- **不变量**：AUTO 再平衡**只生成建议 + 提醒，永不自动交易**；
- 修改 `rebalanceSchedule` **无需重启 worker**，下一个 00:00 周期自动生效（最迟次日）。

### 3.3 两层防重

同一个任务不会被重复执行：

1. **进程内 Map 锁**（`shared/services/taskRunner.js` 的 `activeTasks`）：同 `taskName` 已在跑 → 返回 `SKIPPED`（`ALREADY_RUNNING`）。
2. **`taskruns` 集合唯一索引** `(taskName, runKey)`：并发/多实例下重复 `runKey` → `DUPLICATE_RUN_KEY`，返回 `SKIPPED`。

因此误启动多个 worker 实例，多余实例只会得到 `SKIPPED`，不会重复跑。**多实例部署只允许一个 worker 启用调度**（`SCHEDULER_ENABLED=true`），其余设为 `false`。

---

## 4. 任务执行语义（TaskRun）

每个任务运行由 `runTrackedTask` 落库到 `taskruns` 集合，便于追溯。

### 4.1 taskName（必须稳定，改名会断代历史）

| taskName | 任务 |
|---|---|
| `daily-price-sync` | 价格同步 |
| `price-integrity-check` | 完整性检查 |
| `alert-evaluate` | 提醒评估 |
| `fx-rate-sync` | 汇率同步 |
| `rebalance-suggestions:<portfolioId>` | 某组合的再平衡建议生成 |

### 4.2 runKey（防重键）

| 触发 | runKey 形态 |
|---|---|
| 价格同步 / 完整性检查 自动 | 市场日期（`marketDate()`，如 `2026-10-17`） |
| 价格同步 / 完整性检查 手动 | `manual:<ISO 时间>` |
| 提醒评估 / 汇率同步 自动 | `daily:<调度时区当日日期>` |
| 再平衡 自动 | `<schedule>:<当日日期>`（如 `monthly:2026-10-01`） |

### 4.3 状态四态

| status | 含义 | 处理 |
|---|---|---|
| `SUCCEEDED` | `failureCount === 0` | 无 |
| `PARTIAL` | 存在失败项（资产级/汇率级） | 看 `failures[]`（`item/category/provider/retryable/message`） |
| `FAILED` | 任务级异常（未捕获） | 看任务日志 |
| `SKIPPED` | 已在跑或重复 runKey（防重兜底） | 无需处理 |

### 4.4 故障隔离与退出码

- **逐资产/逐组合故障隔离**：单个失败只进 `failures[]`，不中断其余；最终返回 `{ totalCount, successCount, failureCount, failures }`。
- **CLI 退出码**：`dailySync` 与 `integrityCheck` 在 `PARTIAL` / `FAILED` 时退出码为 `1`；`historySync` 在存在失败资产时退出码为 `1`。可用于告警脚本判断。

---

## 5. 数据质量程序

### 5.1 价格同步（dailySync）

- 遍历全部 `active` 资产，逐资产校验所属市场当日是否开市（`isMarketOpenToday`，含周末与法定节假日）；
- 休市资产跳过并记 `PRICE_SYNC_ASSET_SKIPPED_MARKET_CLOSED`，不视为失败；
- 单个资产抓取失败只记 `PRICE_SYNC_ASSET_FAILED`，不中断其余（逐资产故障隔离）；
- 入库为幂等 upsert，`(symbol, timestamp)` 唯一索引保证同一天重复执行不产生重复记录；
- 价格按单一全局时区 `MARKET_TIMEZONE` 做日期归桶（数据库存 UTC）；CN 白天价可能按 ET 日期归桶，**不要随意修改 `MARKET_TIMEZONE`**，否则新数据与既有数据日期边界错位。
- 手动触发见 §7.1；server 侧也有同一实现的入口（见 [server 使用手册](./SERVER.md)）。

### 5.2 完整性检查（integrityCheck）

回答「每支基金理论应有多少价格、实际采了多少」：

1. 依据 `asset.launchDate`（可选字段）与所属市场推算理论交易日数 **Expected Count**；
2. 查询 `Price` 实际落库记录数 **Actual Count**；
3. 输出含 `missingCount` 与 `completenessRatio` 的结构化报告，缺口按缺失区间合并为 `missingRanges`；
4. 存在缺口时 `warn` 并记 `DATA_GAP` 进 TaskRun（`status=PARTIAL`），默认（`INTEGRITY_AUTO_REPAIR=true`）自动调 `historySync` 按区间补全，补全后重查一次 Actual。

自动补全安全边界（防止首次运行超大规模回补）：

- 只覆盖「最近 `INTEGRITY_REPAIR_MAX_DAYS` 天（默认 30）」内的缺失区间；跨窗口区间被裁剪，窗口外的缺口延后并记 `INTEGRITY_REPAIR_DEFERRED`；
- 单资产每次最多修复 `maxRepairRanges`（默认 50）个区间，超出记 `INTEGRITY_REPAIR_TRUNCATED`；
- 全量历史回补请用 5.3 的 `historySync` 显式执行（可配合 `--from`）。

关键状态：

| 状态 | 含义 |
|---|---|
| `OK` | `completenessRatio == 1` |
| `GAP` | 存在缺失交易日，已（或应）自动补全 |
| `SKIPPED_NO_LAUNCH_DATE` | 资产未填 `launchDate`，无法推算 Expected，被跳过 |
| `ERROR` | 查询失败，不影响其他资产 |

说明：US/CA 的缺失判定逐日精确；CN 因按 ET 归桶，按「候选桶（前一日/当日）任一命中」近似判定。

### 5.3 历史回补（historySync）

```bash
node src/tasks/historySync.cjs --from 2024-01-01
node src/tasks/historySync.cjs --from 2024-01-01 --to 2026-08-24 --symbols VOO,510300 --concurrency 3
```

| 参数 | 说明 |
|---|---|
| `--from` | **必填**，`YYYY-MM-DD` |
| `--to` | 可选，默认今天 |
| `--symbols` | 逗号分隔符号；缺省为全部激活资产（按 DB 资产对象启用 market 路由，CN-FUND → 天天基金） |
| `--concurrency` | 并发抓取数，默认 `3`（避免上游限流） |

幂等（upsert 去重）；单符号失败不中断其余。

### 5.4 录入资产的 launchDate

完整性检查依赖 `launchDate`。目前 API 层（`shared/services/asset.service.js` 的 `WRITABLE_FIELDS`）尚未暴露该字段，需直接操作 MongoDB：

```bash
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.assets.updateOne({symbol:"VTI"}, {$set:{launchDate: ISODate("2018-06-08T00:00:00Z")}})'
```

若希望通过 API 维护，需先把 `launchDate` 加入 `shared/services/asset.service.js` 的 `WRITABLE_FIELDS` 白名单，并走既有资产更新接口。

---

## 6. 命令行手动入口

所有命令默认在 `cron-worker` 目录执行。手动触发与定时触发**共用同一业务引擎**，结果口径一致。
（server 侧的手动 **API** 端点见 [server 使用手册](./SERVER.md)；界面**按钮**见 [client 使用手册](./CLIENT.md)。）

### 6.1 价格同步

```bash
npm run sync:prices
# 等价 node src/tasks/dailySync.js（trigger=MANUAL）
# 也可在 server 侧执行：cd ../server && npm run sync:prices（同一实现）
```

### 6.2 历史回补

```bash
node src/tasks/historySync.cjs --from 2024-01-01
node src/tasks/historySync.cjs --from 2024-01-01 --to 2026-08-24 --symbols VOO,510300 --concurrency 3
```

### 6.3 完整性检查

```bash
npm run check:integrity                                        # 全部激活资产，缺口自动补全
npm run check:integrity -- --symbols VOO,510300 --from 2024-01-01 --to 2026-08-24
npm run check:integrity -- --no-repair                        # 只出报告，不自动补全
npm run check:integrity -- --dry-run                          # 只出预览报告，不补全
```

---

## 7. 监控与巡检

### 7.1 任务留痕位置

- **结构化任务记录**：`taskruns` 集合（每类任务一行，含 status / 计数 / failures）。
- **任务日志**：仓库根 `logs/task-YYYY-MM-DD.log`（按天切割，注意当天日期）。

### 7.2 常用巡检

```bash
# 最近 10 条任务状态（应能观察到 5 类 taskName）
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.taskruns.find({}, {taskName:1,status:1,startedAt:1,failureCount:1}).sort({startedAt:-1}).limit(10)'

# 最近一次价格同步明细
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.taskruns.find({taskName:"daily-price-sync"}).sort({startedAt:-1}).limit(1)'

# 最近一次健康检查报告
tail -50 logs/task-$(TZ=America/Toronto date +%F).log | grep 'INTEGRITY_CHECK_END'

# 每支基金理论 vs 实际
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.assets.aggregate([{$match:{active:true}},{$lookup:{from:"prices",localField:"symbol",foreignField:"symbol",as:"p"}},{$project:{symbol:1,launchDate:1,actual:{$size:"$p"}}}]).forEach(p=>print(p.symbol, p.launchDate || "no-launch", p.actual))'
```

### 7.3 告警关注点

- `taskruns` 出现 `FAILED`，或 `daily-price-sync` / `price-integrity-check` 持续 `PARTIAL` 且 `failures[]` 中为不可重试错误（`retryable:false`，如上游 404/参数错误）；
- 某资产长期 `DATA_GAP` 且 `repair` 未收敛——多为上游缺数据或 `launchDate` 填错，需人工核对该资产；
- **worker 进程存活**：先确认日志有 `SCHEDULERS_STARTED {"count":5}`。worker 停摆会让**全部** 5 类任务停跑（`server` 停止不影响定时任务）。

---

## 8. 故障排查

| 现象 | 原因与处理 |
|---|---|
| 启动无 `SCHEDULERS_STARTED` | 查看是否抛错 / `SCHEDULER_ENABLED=false` / `MONGO_URI` 未配或连不上 |
| 任务「没跑」 | 先确认 worker 进程存活（`count:5`）；`server` 不跑定时任务，定时任务只在 cron-worker |
| `SKIPPED` 状态 | 正常防重（已在跑 / 重复 runKey）；误起多实例时多余实例会得到 SKIPPED |
| 上游限流/超时 | `yahooFetcher` 自动回退域名 + 指数退避重试（最多 3 次）；批量回补调低 `--concurrency` |
| CN 节假日错判 | `shared/config/markets.js` 的 `CN_HOLIDAYS` 是静态表，需逐年按交易所公告补充（2027+ 未维护） |
| 价格日期错位 | 改 `MARKET_TIMEZONE` 会重排日期归桶，导致新旧数据边界错位，**改动前先评估** |
| 日志读不到 | `server` 与 `cron-worker` 必须共享同一 `MONGO_URI` 与同一 `logs/` 目录（后者供 `GET /api/logs/tasks` 读 worker 日志） |

---

## 9. 如何新增一个调度器

1. 在 `src/schedulers/` 新建文件，复用通用工厂：

   ```js
   const { createCronScheduler } = require('./cronScheduler');
   const startXxxScheduler = createCronScheduler({
     envKey: 'XXX_CRON',
     defaultCron: '0 5 * * *',
     taskName: 'xxx-task',
     run: () => require('../tasks/xxx')({ trigger: 'SCHEDULED' })
   });
   module.exports = { startXxxScheduler };
   ```

2. 在 `src/tasks/scheduler.js` 的 `jobs` 数组里 `startXxxScheduler()` 注册（确认 `count` 变为 6）。
3. 在 `cron-worker/.env.example` 增加 `XXX_CRON` 与 `SCHEDULE_DUE_RULES` 之类所需变量；完整变量表见 [系统部署手册](./DEPLOYMENT.md) §「环境变量」。
4. **业务引擎必须放在 `@portomind/shared`**，cron-worker 只持触发权（禁止在本目录复制实现）。
5. 同步更新 `test/scheduler.test.js`（覆盖新默认 cron 与注册数）。

---

## 相关文档

- [server 使用手册](./SERVER.md) — API 进程、手动 API 端点
- [client 使用手册](./CLIENT.md) — 界面业务操作
- [系统部署手册](./DEPLOYMENT.md) — 安装/启动/生产部署/环境变量/安全边界/备份
- [ADR-002 单一调度器](../architecture/adr/ADR-002-single-scheduler.md) — 架构决策与备选方案
- [API 契约](../dev/API_CONTRACT.md) — REST API 详细定义
