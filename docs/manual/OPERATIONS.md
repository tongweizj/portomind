# PortoMind 生产操作指南（行情与数据质量）

> **调度与数据质量的唯一归属文档**：调度器归属、定时任务、价格同步、完整性检查、历史回补、TaskRun、命令行手动入口、排障与市场时区。
> 本地开发环境见 [DEVELOPMENT.md](./DEVELOPMENT.md)；生产部署与备份见 [DEPLOY.md](./DEPLOY.md)；业务口径见 [USER_GUIDE.md](./USER_GUIDE.md) §5。

适用对象：`cron-worker`（**唯一**调度进程）与 `server`（API，**不持有任何调度**）的运维人员。

数据更新链路（全部由 `cron-worker` 单进程触发）：

```text
每日 00:00  REBALANCE_CHECK_CRON → 按各组合 rebalanceSchedule 判断是否到期，执行再平衡阈值检查 → 建议 → 提醒
每日 03:00  PRICE_SYNC_CRON      → dailySync 拉取激活资产最新价入库
每日 03:30  HEALTH_CHECK_CRON    → integrityCheck 校验完整性，缺口自动调 historySync 补全
每日 04:00  ALERT_EVAL_CRON      → 提醒规则评估
每日 09:30  FX_SYNC_CRON         → 汇率同步
手动入口    npm run sync:prices / sync:history / check:integrity（见 §4）
执行留痕    taskruns 集合（TaskRun）+ logs/task-YYYY-MM-DD.log（结构化 JSON）
```

所有命令默认在 `cron-worker` 目录执行：

```bash
cd /path/to/portomind/cron-worker
```

脚本通过 `dotenv` 加载 `cron-worker/.env`，必需 `MONGO_URI`；时区默认 `SCHEDULER_TIMEZONE || MARKET_TIMEZONE || America/Toronto`。

---

## 1. 日常更新的方法（每日价格同步）

### 1.1 手动触发当日同步

```bash
npm run sync:prices
# 等价于 node src/tasks/dailySync.js（trigger=MANUAL）
# 亦可在 server 侧执行：cd ../server && npm run sync:prices
```

行为：

- 遍历全部 `active` 资产，逐资产判断所属市场当日是否开市（`isMarketOpenToday`，含周末与法定节假日）；
- 休市资产跳过并记 `PRICE_SYNC_ASSET_SKIPPED_MARKET_CLOSED`，不视为失败；
- 单个资产抓取失败只记 `PRICE_SYNC_ASSET_FAILED`，不中断其余资产（逐资产故障隔离）；
- 入库为幂等 upsert，`(symbol, timestamp)` 唯一索引保证同一天重复执行不会产生重复记录。

> 两侧入口共用同一实现：`@portomind/shared/tasks/dailySync.js`。`server` / `cron-worker` 的 `tasks/dailySync.js`
> 只是负责「加载本包 .env → 建连 → 调用共享任务」的 CLI 薄壳。

### 1.2 验证同步结果

本节是任务状态语义与 `taskruns` 查询的**唯一归属**；[USER_GUIDE.md](./USER_GUIDE.md) §4.7 与 §7 均引用此处。

同步由 `runTrackedTask` 落库到 `taskruns`，可直接查看：

```bash
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.taskruns.find({taskName:"daily-price-sync"}).sort({startedAt:-1}).limit(1)'
```

关注 `status`：

| status | 含义 | 处理 |
| --- | --- | --- |
| `SUCCEEDED` | 全部成功 | 无 |
| `PARTIAL` | 存在失败资产 | 看 `failures[]` 里的 `item/category/retryable/message` |
| `FAILED` | 任务级异常 | 看任务日志 |
| `SKIPPED` | 重复运行或已在跑 | 无需处理（防重兜底） |

命令行退出码：`PARTIAL` 或 `FAILED` 时退出码为 1（适合告警脚本判断）。

最新一次执行的资产级明细在任务日志（按天切割，注意当天日期）：

```bash
tail -50 logs/task-$(TZ=America/Toronto date +%F).log | grep -E 'TASK_END|PRICE_SYNC_ASSET_(SUCCEEDED|FAILED|SKIPPED)'
```

### 1.3 时区注意事项

- 价格按单一全局时区 `MARKET_TIMEZONE` 做日期归桶（`shared/utils/marketTime.js`），数据库存 UTC；
- CN 白天价可能按 ET 日期归桶（继承自 server 的历史行为）。**不要随意修改 `MARKET_TIMEZONE`**，否则新数据会与既有数据的日期边界错位。

---

## 2. 补齐历史记录的方法

### 2.1 直接历史回补（historySync）

```bash
# 必需 --from；--to 默认今天；--symbols 留空则回补全部激活资产
node src/tasks/historySync.cjs --from 2024-01-01
node src/tasks/historySync.cjs --from 2024-01-01 --to 2026-08-24 --symbols VOO,510300 --concurrency 3
```

参数：

| 参数 | 说明 |
| --- | --- |
| `--from` | 必填，`YYYY-MM-DD` |
| `--to` | 可选，默认今天 |
| `--symbols` | 逗号分隔符号列表；缺省为全部激活资产 |
| `--concurrency` | 并发抓取数，默认 3（避免上游限流） |

- 幂等：重复执行安全（upsert 去重）；
- 单符号失败不中断其余，结果中带 `error` 的项即失败项。

### 2.2 完整性检查 + 自动补全（integrityCheck）

本节是完整性检查的**唯一归属**；[USER_GUIDE.md](./USER_GUIDE.md) §4.1 与 [DEVELOPMENT.md](./DEVELOPMENT.md) 均引用此处。

回答「每支基金理论应有多少价格、实际采了多少」：

```bash
npm run check:integrity                                          # 全部激活资产，缺口自动补全
npm run check:integrity -- --symbols VOO,510300 --from 2024-01-01 --to 2026-08-24
npm run check:integrity -- --no-repair                           # 只出报告，不自动补全
npm run check:integrity -- --dry-run                             # 只出预览报告，不补全
```

流程与输出：

1. 依据 `asset.launchDate`（可选字段）与所属市场推算理论交易日数 **Expected Count**；
2. 查询 `Price` 实际落库记录数 **Actual Count**；
3. 输出含 `missingCount` 与 `completenessRatio` 的结构化报告，缺口按缺失区间合并为 `missingRanges`；
4. 存在缺口时 `warn` 并记 `DATA_GAP` 进 TaskRun（`status=PARTIAL`），默认（`INTEGRITY_AUTO_REPAIR=true`）自动调 `historySync` 按区间补全，补全后重查一次 Actual。

自动补全安全边界（防止首次运行超大规模回补）：

- 只覆盖「最近 `INTEGRITY_REPAIR_MAX_DAYS` 天（默认 30）」内的缺失区间；跨窗口区间被裁剪，窗口外的缺口延后并记 `INTEGRITY_REPAIR_DEFERRED`；
- 单资产每次最多修复 `maxRepairRanges`（默认 50）个区间，超出记 `INTEGRITY_REPAIR_TRUNCATED`；
- 全量历史回补请用 2.1 的 `historySync` 显式执行（可配合 `--from`）。

关键状态：

| 状态 | 含义 |
| --- | --- |
| `OK` | `completenessRatio == 1` |
| `GAP` | 存在缺失交易日，已（或应）自动补全 |
| `SKIPPED_NO_LAUNCH_DATE` | 资产未填 `launchDate`，无法推算 Expected，被跳过 |
| `ERROR` | 查询失败，不影响其他资产 |

说明：US/CA 的缺失判定逐日精确；CN 因按 ET 归桶，按「候选桶（前一日/当日）任一命中」近似判定。

### 2.3 录入资产的 launchDate

完整性检查依赖 `launchDate`。目前 API 层（`shared/services/asset.service.js` 的 `WRITABLE_FIELDS`）尚未暴露该字段，需直接操作 MongoDB：

```bash
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.assets.updateOne({symbol:"VTI"}, {$set:{launchDate: ISODate("2018-06-08T00:00:00Z")}})'
```

若希望通过 API 维护，需先把 `launchDate` 加入 `shared/services/asset.service.js` 的 `WRITABLE_FIELDS` 白名单，并走既有资产更新接口。

---

## 3. 自动化更新的方法

### 3.1 调度器归属：cron-worker 是唯一调度所有者

本节是调度所有权的**唯一归属**；[USER_GUIDE.md](./USER_GUIDE.md) §2/§3/§7、[DEVELOPMENT.md](./DEVELOPMENT.md) §「环境配置」、[DEPLOY.md](./DEPLOY.md) §3 均引用此处。

**架构决策（ADR-002）**：PortoMind 只有 `cron-worker` 一个进程注册 cron 任务；`server` **不启动任何定时任务**。
`SCHEDULER_ENABLED` 现已简化为「cron-worker 是否启用调度」，只存在于 `cron-worker/.env`；
`server/.env` 中不再有该变量，也不再有 `*_CRON` 表达式。

| 任务 | cron 变量 | 默认时间 | 唯一实现位置 |
| --- | --- | --- | --- |
| 价格同步 | `PRICE_SYNC_CRON` | 03:00 | `cron-worker/src/schedulers/priceScheduler.js` |
| 完整性检查 | `HEALTH_CHECK_CRON` | 03:30 | `cron-worker/src/schedulers/healthScheduler.js` |
| 提醒评估 | `ALERT_EVAL_CRON` | 04:00 | `cron-worker/src/schedulers/alertScheduler.js` |
| 汇率同步 | `FX_SYNC_CRON` | 09:30 | `cron-worker/src/schedulers/fxScheduler.js` |
| 再平衡（按组合到期） | `REBALANCE_CHECK_CRON` | 00:00 | `cron-worker/src/schedulers/rebalanceScheduler.js` |

**单一调度器 = 全任务覆盖**：不再需要「二选一拓扑」，也不存在任何任务因选错所有者而静默停跑。
迁移前的缺口（两侧覆盖不重合）已随 [TASK-005 统一调度器](../exec-plans/complete/TASK-005-unify-scheduler.md) 收口。

#### 再平衡调度为何是「单日分发」而不是「按组合注册 cron」

迁移前，`server` 会为每个组合按其 `rebalanceSettings.rebalanceSchedule` 单独注册一个 cron 任务，并在组合
新增/改动时动态注册或注销。调度迁到独立进程后，API 进程无法再把「组合改动」实时同步给调度器，因此改为
**单日分发**：每天 00:00 读取全部未归档组合，按 `rebalanceSchedule` 判断当日是否到期
（`daily`=每日 / `weekly`=周一 / `monthly`=每月 1 日），到期者执行。

好处：组合的新建 / 设置改动 / 归档会在下一个交易日**自动**纳入或剔除，无需跨进程重同步；`taskruns` 的
`taskName`（`rebalance-suggestions:<pid>`）与 `runKey`（`<schedule>:<当日日期>`）语义与迁移前完全一致。

> **不变量**：AUTO 再平衡**只生成建议 + 提醒，永不自动交易**。执行仍只由 `POST /api/portfolios/:pid/rebalance/execute`（MANUAL）触发。

#### 防重兜底

`TaskRun` 的 `(taskName, runKey)` 唯一索引 + 进程内 Map 锁。即使误启动多个调度进程，同一次任务也只会执行一次（多余进程得到 `SKIPPED`）。

#### 修改组合再平衡设置后何时生效

`rebalanceSchedule` 的改动**无需重启 worker**，会在下一个 00:00 的分发周期自动生效（最迟次日）。

### 3.2 环境变量（cron-worker）

```dotenv
# 必需
MONGO_URI=mongodb://127.0.0.1:27017/portomind_dev

# 调度：cron-worker 是唯一调度所有者（ADR-002）
SCHEDULER_ENABLED=true            # 本进程是否启用调度；server 已无此变量
SCHEDULER_TIMEZONE=America/Toronto
MARKET_TIMEZONE=America/Toronto   # 价格归桶时区，改动前务必评估既有数据

# 5 类调度表达式（均按 SCHEDULER_TIMEZONE 解释）
PRICE_SYNC_CRON=0 3 * * *         # 价格同步，每天 03:00
HEALTH_CHECK_CRON=30 3 * * *      # 完整性检查，晚于价格同步 30 分钟
ALERT_EVAL_CRON=0 4 * * *         # 提醒评估，每天 04:00
FX_SYNC_CRON=30 9 * * *           # 汇率同步，每天 09:30
REBALANCE_CHECK_CRON=0 0 * * *    # 再平衡分发，每天 00:00

# 数据质量
INTEGRITY_AUTO_REPAIR=true        # 完整性检查发现缺口时自动调 historySync 补全
INTEGRITY_REPAIR_MAX_DAYS=30      # 自动补全只覆盖最近 N 天，更早缺口延后（防超大规模回补）

# 行情请求超时（毫秒）
MARKET_DATA_TIMEOUT_MS=10000

# 日志（可选）：不设置时默认写入仓库根 logs/，与 server 共用同一目录
# LOG_DIR=../logs
```

### 3.3 以 cron-worker 作为调度所有者的 PM2 配置

```bash
cd cron-worker
npm ci --omit=dev
pm2 start index.js --name portomind-worker --instances 1
pm2 save
pm2 startup   # 按提示启用开机自启（仅需一次）
```

`server` 侧无需任何调度相关配置。若未来使用多实例，只允许一个 worker 实例启用调度（其余设 `SCHEDULER_ENABLED=false`）。

确认启动正常：worker 日志应出现 `SCHEDULERS_STARTED {"owner":"cron-worker","count":5}`；
`server` 日志**不应**出现 `SCHEDULERS_STARTED`。

### 3.4 每日自动流程与监控

自动流程：`00:00 再平衡分发 → 03:00 价格同步 → 03:30 完整性检查 →（缺口）historySync 补全 → 04:00 提醒评估 → 09:30 汇率同步`，
全部由 `cron-worker` 承载。补全依赖资产已填 `launchDate`（见 2.3）。

建议的巡检项：

```bash
# 最近任务状态（应能观察到 5 类 taskName）
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.taskruns.find({}, {taskName:1,status:1,startedAt:1,failureCount:1}).sort({startedAt:-1}).limit(10)'

# 每支基金理论 vs 实际
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.assets.aggregate([{$match:{active:true}},{$lookup:{from:"prices",localField:"symbol",foreignField:"symbol",as:"p"}},{$project:{symbol:1,launchDate:1,actual:{$size:"$p"}}}]).forEach(p=>print(p.symbol, p.launchDate || "no-launch", p.actual))'

# 最近一次健康检查报告
tail -50 logs/task-$(TZ=America/Toronto date +%F).log | grep 'INTEGRITY_CHECK_END'
```

告警关注点：

- `taskruns` 出现 `FAILED`，或 `daily-price-sync` / `price-integrity-check` 持续 `PARTIAL` 且 `failures[]` 中为不可重试错误（`retryable:false`，如上游 404/参数错误）；
- 某资产长期 `DATA_GAP` 且 `repair` 未收敛——多为上游缺数据或 `launchDate` 填错，需人工核对该资产；
- worker 进程存活（`SCHEDULERS_STARTED` 为 5）——worker 停摆会让**全部** 5 类任务停跑。

---

## 4. 命令行手动入口速查

本节是**命令行手动入口的唯一归属**；[USER_GUIDE.md](./USER_GUIDE.md) §6 的界面按钮对应这里的手动入口。

```bash
# 手动触发当日价格同步（server 或 cron-worker 均可，共用同一实现）
cd server && npm run sync:prices
cd cron-worker && npm run sync:prices

# 完整性检查（cron-worker 侧；--no-repair 只出报告）
cd cron-worker
npm run check:integrity
npm run check:integrity -- --no-repair

# 历史回补（cron-worker 侧）
cd cron-worker && npm run sync:history -- --from 2024-01-01 --symbols VOO,510300

# 手动跑一次提醒评估（或 Dashboard「立即评估」按钮）
curl -X POST http://localhost:8080/api/alerts/evaluate

# 手动同步汇率（或家庭视图「同步汇率」按钮）
curl -X POST http://localhost:8080/api/family/fx/sync

# 手动录入汇率
curl -X PUT http://localhost:8080/api/family/fx/rates/USD -H 'Content-Type: application/json' -d '{"rateToCny":7.2}'

# 手动录入估值分位（家庭视图没有此入口，只能走 API）
curl -X PUT http://localhost:8080/api/valuations/000300/pe -H 'Content-Type: application/json' -d '{"value":12.5,"percentile":25}'

# 查看最近一次任务结果
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.taskruns.find({taskName:"daily-price-sync"}).sort({startedAt:-1}).limit(1)'
```

> 上述 `curl` 手动入口由 `server` 提供，与 cron-worker 的定时调度**共用同一业务引擎**
> （`@portomind/shared`），因此手动触发与定时触发的结果口径完全一致。

---

## 5. 故障排查与注意事项

- **上游限流/超时**：`yahooFetcher` 会自动回退域名，`fetchWithRetry` 对可重试错误指数退避+抖动重试（最多 3 次）。批量回补时调低 `--concurrency` 可缓解。
- **CN 节假日表需逐年维护**：`shared/config/markets.js` 的 `CN_HOLIDAYS` 是静态闭市表，每年需按交易所公告核对补充；US/CA 按规则计算可覆盖任意年份。
- **任务"没跑"先看 worker 存活**：调度只在 `cron-worker` 里，先确认该进程在运行且日志有 `SCHEDULERS_STARTED`（`count:5`）；`server` 停止不影响定时任务，`cron-worker` 停止才影响全部任务。
- **`MARKET_TIMEZONE` 变更会改变日期归桶**，会导致新旧价格日期边界错位，改动前先评估对历史数据的影响。
- **`server` 与 `cron-worker` 必须共享同一 `MONGO_URI` 与同一 `logs/` 目录**：后者是为了 `GET /api/logs/tasks` 能读到 worker 产生的任务日志。
- **日志与备份**：`logs/`（`app-*.log` / `task-*.log` / `exceptions-*.log` / `rejections-*.log`）与 MongoDB 需要有保留与备份策略，备份内容与做法见 [DEPLOY.md](./DEPLOY.md) §7；日志中的敏感键会被脱敏，但仍应限制日志文件和数据库的访问权限。

---

## 相关文档

- [USER_GUIDE.md](./USER_GUIDE.md) — 功能怎么用（业务操作）
- [DEVELOPMENT.md](./DEVELOPMENT.md) — 本地开发环境与验证命令
- [DEPLOY.md](./DEPLOY.md) — 生产部署、环境变量、备份、安全边界
- [ADR-002 单一调度器](../architecture/adr/ADR-002-single-scheduler.md) — 架构决策与备选方案
