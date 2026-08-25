# PortoMind 生产操作指南（行情与数据质量）

本文档覆盖价格数据从采集到质量保障的日常操作，适用对象为 `cron-worker`（独立调度/价格同步进程）与 `server`（API）的运维人员。

数据更新链路：

```text
每日 03:00  PRICE_SYNC_CRON  → dailySync 拉取激活资产最新价入库
每日 03:30  HEALTH_CHECK_CRON → integrityCheck 校验完整性，缺口自动调 historySync 补全
手动入口    npm run sync:prices / sync:history / check:integrity
执行留痕    taskruns 集合（TaskRun）+ logs/task-*.log（结构化 JSON）
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
```

行为：

- 遍历全部 `active` 资产，逐资产判断所属市场当日是否开市（`isMarketOpenToday`，含周末与法定节假日）；
- 休市资产跳过并记 `PRICE_SYNC_ASSET_SKIPPED_MARKET_CLOSED`，不视为失败；
- 单个资产抓取失败只记 `PRICE_SYNC_ASSET_FAILED`，不中断其余资产（逐资产故障隔离）；
- 入库为幂等 upsert，`(symbol, timestamp)` 唯一索引保证同一天重复执行不会产生重复记录。

### 1.2 验证同步结果

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

最新一次执行的资产级明细在日志：

```bash
tail -50 logs/task-combined.log | grep -E 'TASK_END|PRICE_SYNC_ASSET_(SUCCEEDED|FAILED|SKIPPED)'
```

### 1.3 时区注意事项

- 价格按单一全局时区 `MARKET_TIMEZONE` 做日期归桶（`src/utils/marketTime.js`），数据库存 UTC；
- CN 白天价可能按 ET 日期归桶（继承自 server 的行为）。**不要随意修改 `MARKET_TIMEZONE`**，否则新数据会与既有数据的日期边界错位。

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

完整性检查依赖 `launchDate`。目前 API 层（server `asset.service` 的 `WRITABLE_FIELDS`）尚未暴露该字段，需直接操作 MongoDB：

```bash
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.assets.updateOne({symbol:"VTI"}, {$set:{launchDate: ISODate("2018-06-08T00:00:00Z")}})'
```

若希望通过 API 维护，需先把 `launchDate` 加入 server `services/asset.service.js` 的 `WRITABLE_FIELDS` 白名单，并走既有资产更新接口。

---

## 3. 自动化更新的方法

### 3.1 调度所有权（唯一进程）

约束：**同一时间只能有一个 Node 进程设置 `SCHEDULER_ENABLED=true`** 作为调度所有者；不使用系统 cron 调用任务，PM2 只负责保活。

两种拓扑任选其一：

- **server 拥有调度（当前默认）**：`server/.env` 设 `SCHEDULER_ENABLED=true`，`cron-worker/.env` 设 `SCHEDULER_ENABLED=false`（本仓库现状，仅运行 worker 的完整性检查等手动命令）。
- **cron-worker 接管调度**：把价格同步 + 健康检查都放到 worker 进程。切换步骤：

```bash
# 1) server 关闭调度并重启
sed -i 's/^SCHEDULER_ENABLED=.*/SCHEDULER_ENABLED=false/' server/.env
pm2 restart portomind-api

# 2) worker 开启调度
sed -i 's/^SCHEDULER_ENABLED=.*/SCHEDULER_ENABLED=true/' cron-worker/.env
pm2 restart portomind-worker
```

防重兜底：`TaskRun` 的 `(taskName, runKey)` 唯一索引 + 进程内 Map 锁，即使误配多进程也不会重复执行同一次任务（多余进程会得到 `SKIPPED`）。

### 3.2 环境变量

```dotenv
# 必需
MONGO_URI=mongodb://127.0.0.1:27017/portomind_dev

# 调度所有权（见 3.1）
SCHEDULER_ENABLED=true            # 本进程是否作为调度所有者
SCHEDULER_TIMEZONE=America/Toronto
MARKET_TIMEZONE=America/Toronto   # 价格归桶时区，改动前务必评估既有数据

# 调度表达式（均按 SCHEDULER_TIMEZONE）
PRICE_SYNC_CRON=0 3 * * *         # 价格同步，每天 03:00
HEALTH_CHECK_CRON=30 3 * * *      # 完整性检查，晚于价格同步 30 分钟

# 数据质量
INTEGRITY_AUTO_REPAIR=true        # 完整性检查发现缺口时自动调 historySync 补全
INTEGRITY_REPAIR_MAX_DAYS=30      # 自动补全只覆盖最近 N 天，更早缺口延后（防超大规模回补）

# 行情请求超时（毫秒）
MARKET_DATA_TIMEOUT_MS=10000
```

### 3.3 以 cron-worker 作为调度所有者的 PM2 配置

```bash
cd cron-worker
npm ci --omit=dev
pm2 start index.js --name portomind-worker --instances 1
pm2 save
pm2 startup   # 按提示启用开机自启（仅需一次）
```

此时 `server` 必须设 `SCHEDULER_ENABLED=false` 并重启。若未来使用多实例，只允许一个实例持有调度。

### 3.4 每日自动流程与监控

自动流程：`03:00 dailySync → 03:30 integrityCheck → 缺口 historySync 补全`。补全依赖资产已填 `launchDate`（见 2.3）。

建议的巡检项：

```bash
# 最近任务状态
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.taskruns.find({}, {taskName:1,status:1,startedAt:1,failureCount:1}).sort({startedAt:-1}).limit(10)'

# 每支基金理论 vs 实际
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.assets.aggregate([{$match:{active:true}},{$lookup:{from:"prices",localField:"symbol",foreignField:"symbol",as:"p"}},{$project:{symbol:1,launchDate:1,actual:{$size:"$p"}}}]).forEach(p=>print(p.symbol, p.launchDate || "no-launch", p.actual))'

# 最近一次健康检查报告
tail -50 logs/task-combined.log | grep 'INTEGRITY_CHECK_END'
```

告警关注点：

- `taskruns` 出现 `FAILED`，或 `daily-price-sync` / `price-integrity-check` 持续 `PARTIAL` 且 `failures[]` 中为不可重试错误（`retryable:false`，如上游 404/参数错误）；
- 某资产长期 `DATA_GAP` 且 `repair` 未收敛——多为上游缺数据或 `launchDate` 填错，需人工核对该资产。

---

## 4. 故障排查与注意事项

- **上游限流/超时**：`yahooFetcher` 会自动回退域名，`fetchWithRetry` 对可重试错误指数退避+抖动重试（最多 3 次）。批量回补时调低 `--concurrency` 可缓解。
- **CN 节假日表需逐年维护**：`src/config/markets.js` 的 `CN_HOLIDAYS` 是静态闭市表，每年需按交易所公告核对补充；US/CA 按规则计算可覆盖任意年份。
- **不要在多个进程同时开启调度**；切换调度所有权后重启双方进程并确认只有一个 `SCHEDULERS_STARTED`。
- **`MARKET_TIMEZONE` 变更会改变日期归桶**，会导致新旧价格日期边界错位，改动前先评估对历史数据的影响。
- **日志与备份**：`logs/`（error + combined）与 MongoDB 需要有保留与备份策略；日志中的敏感键会被脱敏，但仍应限制日志文件和数据库的访问权限。
