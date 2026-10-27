# cron-worker 运维手册

> 受众：**运维 / SRE / 部署者**。覆盖 cron-worker 进程的**安装、启动、关闭、手动触发、监控巡检、故障排查**。
>
> - 总览与三进程关系见 [cron-worker 总览](./CRON_WORKER.md)；任务功能介绍见 [产品介绍](./CRON_WORKER_PRODUCT.md)；
>   调度引擎与 TaskRun 数据契约见 [开发文档](../dev/CRON_WORKER_DEV.md)。
> - 生产部署（PM2 / Nginx / 上线检查 / 备份 / 安全边界）见 [系统部署手册](./DEPLOYMENT.md)；
>   **环境变量完整表**也在该手册 §「环境变量」。本手册只列本进程**调度相关**的必需变量。
> - 界面手动触发（按钮）见 [client 使用手册](./CLIENT.md)；server 侧手动 API 端点见 [server 使用手册](./SERVER.md)。

---

## 1. 安装

PortoMind 是 npm workspaces monorepo。**在仓库根目录一次 `npm ci`** 即可安装全部 workspace
（含 `shared` / `server` / `cron-worker` / `client`）；cron-worker 依赖根目录解析到的 `@portomind/shared`。
详见 [系统部署手册 §「安装依赖」](./DEPLOYMENT.md)。

---

## 2. 配置环境变量

cron-worker 通过 `src/config/env.js` 加载 **`cron-worker/.env`**（不是 `server/.env`）。
本进程**必需** `MONGO_URI`（与 server 同一库）。完整变量表见 [系统部署手册 §「环境变量」](./DEPLOYMENT.md)。

调度相关核心变量（仅本进程读取）：

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

---

## 3. 启动（前台 / 生产）

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
（`src/tasks/scheduler.js` 注册 5 个调度器）。生产保活与 Nginx / 上线检查见 [系统部署手册](./DEPLOYMENT.md)。

---

## 4. 关闭

进程监听 `SIGINT` / `SIGTERM`，收到后：停止全部调度器 → 断开 MongoDB → 退出。
`pm2 stop portomind-worker` / `pm2 delete portomind-worker` 即触发相应信号。

---

## 5. 启动自检（必须确认）

启动成功时日志出现（结构化 JSON，字段 `owner` / `count`）：

```text
SCHEDULERS_STARTED {"owner":"cron-worker","count":5}
```

- `count` 不是 5 → 有调度器注册失败，或被 `SCHEDULER_ENABLED=false` 关停。
- `server` 进程**不应**出现 `SCHEDULERS_STARTED`（若出现在 server 侧，是回归，应删除）。

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

| 参数 | 说明 |
|---|---|
| `--from` | **必填**，`YYYY-MM-DD` |
| `--to` | 可选，默认今天 |
| `--symbols` | 逗号分隔符号；缺省为全部激活资产（按 DB 资产对象启用 market 路由，CN-FUND → 天天基金） |
| `--concurrency` | 并发抓取数，默认 `3`（避免上游限流） |

幂等（upsert 去重）；单符号失败不中断其余。

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

> 巡检用到的 `taskName` / `runKey` / 状态枚举的**权威定义**见 [开发文档 §5 TaskRun 契约](../dev/CRON_WORKER_DEV.md#5-taskrun-数据契约)。

### 7.3 告警关注点

- `taskruns` 出现 `FAILED`，或 `daily-price-sync` / `price-integrity-check` 持续 `PARTIAL` 且 `failures[]` 中为不可重试错误（`retryable:false`，如上游 404 / 参数错误）；
- 某资产长期 `DATA_GAP` 且 `repair` 未收敛——多为上游缺数据或 `launchDate` 填错，需人工核对该资产；
- **worker 进程存活**：先确认日志有 `SCHEDULERS_STARTED {"count":5}`。worker 停摆会让**全部** 5 类任务停跑（`server` 停止不影响定时任务）。
- **CLI 退出码**（用于告警脚本判断）：`dailySync` 与 `integrityCheck` 在 `PARTIAL` / `FAILED` 时退出码为 `1`；`historySync` 在存在失败资产时退出码为 `1`。退出码契约见 [开发文档 §5.4](../dev/CRON_WORKER_DEV.md#54-退出码约定)。

---

## 8. 故障排查

| 现象 | 原因与处理 |
|---|---|
| 启动无 `SCHEDULERS_STARTED` | 查看是否抛错 / `SCHEDULER_ENABLED=false` / `MONGO_URI` 未配或连不上 |
| 任务「没跑」 | 先确认 worker 进程存活（`count:5`）；`server` 不跑定时任务，定时任务只在 cron-worker |
| `SKIPPED` 状态 | 正常防重（已在跑 / 重复 runKey）；误起多实例时多余实例会得到 SKIPPED |
| 上游限流 / 超时 | `yahooFetcher` 自动回退域名 + 指数退避重试（最多 3 次）；批量回补调低 `--concurrency` |
| CN 节假日错判 | `shared/config/markets.js` 的 `CN_HOLIDAYS` 是静态表，需逐年按交易所公告补充（2027+ 未维护） |
| 价格日期错位 | 改 `MARKET_TIMEZONE` 会重排日期归桶，导致新旧数据边界错位，**改动前先评估** |
| 日志读不到 | `server` 与 `cron-worker` 必须共享同一 `MONGO_URI` 与同一 `logs/` 目录（后者供 `GET /api/logs/tasks` 读 worker 日志） |

---

## 相关文档

- [cron-worker 总览](./CRON_WORKER.md) — 进程模型 / 五大任务地图 / 三视角导航
- [cron-worker 产品介绍](./CRON_WORKER_PRODUCT.md) — 任务功能介绍（非 PRD）
- [cron-worker 开发文档](../dev/CRON_WORKER_DEV.md) — 调度引擎 / 防重 / TaskRun 契约 / 新增调度器
- [系统部署手册](./DEPLOYMENT.md) — 安装 / 启动 / 生产部署 / 环境变量 / 安全边界 / 备份
- [server 使用手册](./SERVER.md) — 手动 API 端点
- [client 使用手册](./CLIENT.md) — 界面手动触发按钮
