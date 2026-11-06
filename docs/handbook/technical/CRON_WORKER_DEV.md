# cron-worker 开发文档

> 受众：**开发者**。覆盖 cron-worker 的**调度引擎实现、再平衡分发算法、两层防重、TaskRun 数据契约、
> 如何新增调度器、目录结构**。
>
> - 进程运行 / 配置 / 监控见 [运维手册](../ops/CRON_WORKER_OPS.md)；任务功能介绍见
>   [产品介绍](../manual/CRON_WORKER_PRODUCT.md)；架构决策见 ADR-002。
> - 本文件落在 `docs/handbook/technical/`，与 [API 契约](./API_CONTRACT.md) 同属「开发视角的技术文档」。

---

## 1. 目录结构

```text
cron-worker/
├── index.js                     # 入口：加载 .env → 连 MongoDB → startSchedulers()
├── package.json                 # 含 sync:prices / check:integrity 等脚本
├── AGENTS.md                    # 代理开发指引
└── src/
    ├── config/
    │   ├── database.js          # MongoDB 连接
    │   └── env.js               # 加载 cron-worker/.env（区别于 server/.env）
    ├── tasks/
    │   ├── scheduler.js         # 注册全部 5 个调度器（jobs 数组）
    │   ├── dailySync.js         # 价格同步（CLI 入口，trigger=MANUAL）
    │   ├── historySync.cjs      # 历史回补（--from/--to/--symbols/--concurrency）
    │   └── integrityCheck.js    # 完整性检查（本进程独有，非 shared）
    └── schedulers/
        ├── cronScheduler.js     # 通用工厂 createCronScheduler
        ├── priceScheduler.js    # 价格同步
        ├── healthScheduler.js   # 完整性检查
        ├── alertScheduler.js    # 提醒评估
        ├── fxScheduler.js       # 汇率同步
        └── rebalanceScheduler.js# 再平衡分发（单日分发）
```

**核心约束**：业务引擎必须在 `@portomind/shared`，cron-worker 只持触发权（禁止在本目录复制实现）。
价格同步 / 提醒评估 / 汇率同步 / 再平衡的业务函数均来自 `shared`；仅 `integrityCheck` 与调度器骨架在
本进程内。

---

## 2. 调度引擎通用工厂

所有调度器都通过 `src/schedulers/cronScheduler.js` 的
`createCronScheduler({ envKey, defaultCron, taskName, run })` 创建，**禁止手写 node-cron 样板**。工厂统一负责：

- 读取 `process.env[envKey]` 或回退 `defaultCron`；
- `cron.validate()` 校验表达式（非法直接 `throw`，进程启动即失败）；
- 按 `resolveTimezone()` 解释时区；
- 回调外层 `try/catch`，任务抛错只记 `<TASK>_SCHEDULER_FAILED`，不拖垮进程；
- 启动日志 `<TASK>_SCHEDULER_STARTED { cronExpression, timezone }`。

示例（新增调度器模板）：

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

---

## 3. 再平衡「单日分发」算法

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

---

## 4. 两层防重

同一个任务不会被重复执行：

1. **进程内 Map 锁**（`shared/services/taskRunner.js` 的 `activeTasks`）：同 `taskName` 已在跑 → 返回 `SKIPPED`（`ALREADY_RUNNING`）。
2. **`taskruns` 集合唯一索引** `(taskName, runKey)`：并发 / 多实例下重复 `runKey` → `DUPLICATE_RUN_KEY`，返回 `SKIPPED`。

因此误启动多个 worker 实例，多余实例只会得到 `SKIPPED`，不会重复跑。**多实例部署只允许一个 worker 启用调度**
（`SCHEDULER_ENABLED=true`），其余设为 `false`。

---

## 5. TaskRun 数据契约

每个任务运行由 `runTrackedTask` 落库到 `taskruns` 集合，便于追溯。以下字段是**稳定契约**，改名 / 改形会断代历史或破坏防重。

### 5.1 taskName（必须稳定）

| taskName | 任务 |
|---|---|
| `daily-price-sync` | 价格同步 |
| `price-integrity-check` | 完整性检查 |
| `alert-evaluate` | 提醒评估 |
| `fx-rate-sync` | 汇率同步 |
| `rebalance-suggestions:<portfolioId>` | 某组合的再平衡建议生成 |
| `rebalance-check` | 再平衡分发的**父任务**（TASK-057；记录 due / skipped / perPortfolio） |

### 5.2 runKey（防重键）

| 触发 | runKey 形态 |
|---|---|
| 价格同步 / 完整性检查 自动 | 市场日期（`marketDate()`，如 `2026-10-17`） |
| 价格同步 / 完整性检查 手动 | `manual:<ISO 时间>` |
| 提醒评估 / 汇率同步 自动 | `daily:<调度时区当日日期>` |
| 再平衡 自动（逐组合子任务） | `<schedule>:<当日日期>`（如 `monthly:2026-10-01`） |
| 再平衡 自动（父任务 `rebalance-check`） | `marketDate(now, timezone)`（如 `2026-10-01`） |

### 5.3 状态四态

| status | 含义 | 处理 |
|---|---|---|
| `SUCCEEDED` | `failureCount === 0` | 无 |
| `PARTIAL` | 存在失败项（资产级 / 汇率级） | 看 `failures[]`（`item/category/provider/retryable/message`） |
| `FAILED` | 任务级异常（未捕获） | 看任务日志 |
| `SKIPPED` | `runTrackedTask` 的**返回值**（已在跑 / 重复 runKey）；**不写入 `taskruns`** | 无需处理；事件见 `taskskips`（§5.5） |

> `taskruns.status` 的 schema 枚举仍只有 `RUNNING / SUCCEEDED / PARTIAL / FAILED`；TASK-057 **不新增 SKIPPED 状态**。监控与告警如何解读这些状态，见 [运维手册 §7](../ops/CRON_WORKER_OPS.md#7-监控与巡检)。

### 5.4 退出码约定

- `dailySync` 与 `integrityCheck` 在 `PARTIAL` / `FAILED` 时退出码为 `1`；
- `historySync` 在存在失败资产时退出码为 `1`。

可用于告警脚本判断（例如 CI / cron 的 `|| notify`）。

### 5.5 result 字段与跳过观测（TASK-057）

`taskruns.result` 为可选 `Schema.Types.Mixed`（schema 只**新增**该字段；status 枚举与唯一索引零改动）。`runTrackedTask` 只透传调用方**显式包进 `result` 键**的内容；顶层裸字段（`ok` / `gap` 等）继续丢弃。

`result` 缺失（历史记录 / 尚未跑满一个周期）表示「契约未就绪」，读侧**不得**把它当成空对象 `{}` 后渲染成「0 缺口 / 全部正常」。

| taskName | `result` 形状（冻结） |
|---|---|
| `daily-price-sync` | `{ skippedCount }`（休市跳过数） |
| `price-integrity-check` | `{ totals:{expectedCount,actualCount,missingCount}, checkedCount, skippedCount, completenessRatio, gapAssets:[{symbol,missingCount}] }`（不存 `assets[]` / `missingRanges[]` / 堆栈） |
| `alert-evaluate` | `{ evaluated, created, archived, failed }` |
| `fx-rate-sync` | `{ fxCount, currencies:{ USD:{ok:true,rateToCny}, CAD:{…}, HKD:{…} } }`；`ok:true` 仅表示该币种本次真实写入完成，失败运行记 `FAILED` 且不补造成功标志 |
| `rebalance-check` | `{ totalPortfolios, dueCount, skippedCount, perPortfolio:[{portfolioId,due,needsRebalance,suggestionsCount,recordId,status,failureReason?,skipReason?}] }` |

`perPortfolio` 长度 = 未归档组合数（动态）；未到期 `due=false` 且 `needsRebalance=null`；未超阈 `needsRebalance=false`、`suggestionsCount=0`、`recordId=null`；生成建议则 `recordId` 非空且 `suggestionsCount>0`；失败保留阶段性事实；子任务被跳过的组合只能在读到同 key 的既有 `result` 时引用，否则 `needsRebalance=null` 并以 `skipReason` 标明原因。

**跳过（防重）不写 `taskruns`**，写独立 `taskskips` 集合（TASK-057 D-01）：

`{ taskName, runKey, trigger, reason: 'ALREADY_RUNNING' | 'DUPLICATE_RUN_KEY', skippedAt, activeRunKey? }`，索引 `{ taskName: 1, skippedAt: -1 }`，本次不加 TTL。`runTrackedTask` 跳过返回值带 `skipPersisted`：`false` 表示事件写入失败（只记受控日志；业务仍跳过，不谎称可查询）。

---

## 6. launchDate 字段与暴露

完整性检查依赖 `asset.launchDate`（可选字段）推算理论交易日数。**当前 API 层尚未暴露该字段**：
`shared/services/asset.service.js` 的 `WRITABLE_FIELDS` 白名单未包含它，需直接操作 MongoDB 维护：

```bash
mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
  --eval 'db.assets.updateOne({symbol:"VTI"}, {$set:{launchDate: ISODate("2018-06-08T00:00:00Z")}})'
```

若希望通过 API 维护，需先把 `launchDate` 加入 `shared/services/asset.service.js` 的 `WRITABLE_FIELDS` 白名单，
并走既有资产更新接口。产品侧对 `launchDate` 的说明见 [产品介绍 §3.4](../manual/CRON_WORKER_PRODUCT.md#34-launchdate成立日的作用)。

---

## 7. 如何新增一个调度器

1. 在 `src/schedulers/` 新建文件，复用通用工厂（模板见 [§2](#2-调度引擎通用工厂)）；
2. 在 `src/tasks/scheduler.js` 的 `jobs` 数组里 `startXxxScheduler()` 注册（确认启动日志 `count` 变为 6）；
3. 在 `cron-worker/.env.example` 增加 `XXX_CRON` 与 `SCHEDULE_DUE_RULES` 之类所需变量；完整变量表见
   [系统部署手册 §「环境变量」](../ops/DEPLOYMENT.md)；
4. **业务引擎必须放在 `@portomind/shared`**，cron-worker 只持触发权（禁止在本目录复制实现）；
5. 同步更新 `test/scheduler.test.js`（覆盖新默认 cron 与注册数）。

---

## 相关文档

- [cron-worker 总览](../ops/CRON_WORKER.md) — 进程模型 / 五大任务地图 / 三视角导航
- [cron-worker 运维手册](../ops/CRON_WORKER_OPS.md) — 安装 / 启动 / 手动触发 / 监控 / 排障
- [cron-worker 产品介绍](../manual/CRON_WORKER_PRODUCT.md) — 任务功能介绍（非 PRD）
- [系统部署手册](../ops/DEPLOYMENT.md) — 安装 / 启动 / 生产部署 / 环境变量 / 安全边界 / 备份
- [ADR-002 单一调度器](../../os/architecture/adr/ADR-002-single-scheduler.md) — 架构决策与备选方案
- [API 契约](./API_CONTRACT.md) — REST API 详细定义
