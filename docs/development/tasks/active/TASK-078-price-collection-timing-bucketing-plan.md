# TASK-078 — 价格采集时刻与归桶修正 实施计划

## Status

Status：Draft（待 Human 评审；`Draft → Approved` 归 Human，见 [STATES.md §4](../../../os/process/STATES.md)）

Owner：Planner（起草）；Implementer（待指派）

Related Task：[TASK-078-price-collection-timing-bucketing](./TASK-078-price-collection-timing-bucketing.md)（独立维护任务，无 Story）

Related Spec / ADR：无 Spec；设计依据见 [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) P0-3 / P2-8 / P3-9c 与任务卡 §6 Human 裁决 D-a / D-a-附带

Branch / Base：当前 `main` @ `d6e1413`（起草时）；实施从最新 `main` 开 `feature/TASK-078-price-collection-timing-bucketing`

Approval：**未批准**。本计划覆盖任务卡 §6 已裁决的 D-a（CN 组 ET 12:00 / US-CA 组 ET 03:00 分组调度）与 D-a-附带（同日多批次接受后写覆盖先写 + 写入日志留痕），以及 AC1–AC5。`Draft → Approved` 须 Human 明确批准当前设计。

## 1. Intent

修复 P0-3「采集成功但 42/42 条价格写进前一日桶并覆盖旧值」与 P2-8「单一全局时区归桶使 CN 价格落入前一日 ET 桶」，两者为同一问题两层，合并处置。

目标（不改需求、不改产品行为）：

- 按 Human 裁决 **D-a**：CN 市场组（`CN-SH` / `CN-SZ` / `CN-FUND` / `HK`）改到 **ET 12:00** 采集，使 Tiantian 的 `FSRQ` 取到当日已发布净值；US/CA 组保持 **ET 03:00**。
- 归桶逻辑 **`canonicalDayTimestamp` / `MARKET_TIMEZONE` 保持不变**（D-a 选「改采集时刻」而非「改归桶时区」，避免历史日期边界重排）。
- 按 Human 裁决 **D-a-附带**：同一天多批次写入接受 `(symbol, 日)` 唯一索引下「后写覆盖先写」，保留日线快照语义；补写入日志使覆盖可追溯，消除 P3-9c「无声覆盖不可追溯」。
- `integrityCheck` 的 CN 近似补偿须复核并在必要时移除或说明。

覆盖任务卡 AC1–AC5；范围外事项见卡 §4（symbol 归一、历史数据迁移、`launchDate` 检查、客户端显示、新鲜度告警均不在本计划内）。

## 2. Context

- 调度链（亲读）：`cron-worker/src/schedulers/priceScheduler.js` → `createCronScheduler({...})`（`cron-worker/src/schedulers/cronScheduler.js`）→ 回调 `require('@portomind/shared/tasks/dailySync')({ trigger: 'SCHEDULED' })`。cron-worker 是唯一调度所有者（[AGENTS.md §1/§5](../../../../AGENTS.md) 硬规则 #2）。
- 时区事实：`cronScheduler.js:8-10` 的 `resolveTimezone()` = `SCHEDULER_TIMEZONE || MARKET_TIMEZONE || 'America/Toronto'`；`cronScheduler.js:34-43` 由 `node-cron` 按该时区解释表达式并 `cron.schedule(expr, cb, { scheduled: true, timezone })`。`MARKET_TIMEZONE`（`shared/utils/marketTime.js:11`）默认同为 ET，仅用于归桶。两者当前相同，改调度时刻**不动** `MARKET_TIMEZONE`。
- 采集口径差异：Yahoo / Eastmoney 取盘中或收盘价；Tiantian 取**已发布净值**（`FSRQ` 为净值日期，`shared/fetchers/tiantianFetcher.js:42-45`），通常 T 日晚或 T+1 公布。原 ET 03:00 = 上海 16:00，A 股已收盘但场外基金当日净值未发布，故 `FSRQ` 拿到 T-1 净值 → 归到前一日桶。
- 存储语义：`shared/models/price.js:23` 唯一索引 `{ symbol: 1, timestamp: 1 }`；`shared/services/priceStorage.service.js:13-30` 用 `findOneAndUpdate({symbol,timestamp}, {$set:data}, {upsert:true})`，11000 冲突后改 update。日粒度快照，后写覆盖先写。
- D-a-附带裁决依据：任务卡 §6 / §9（2026-11-17 Human 裁决）；P3-9c 见 [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md)「同日覆盖语义」。
- 复核依赖：ET 12:00 夏令时 = 上海 00:00、冬令时 = 上海 01:00，两个时段当日净值均已发布（Human 裁决原话「上海时间 24 点，价格应该出来了」）。

## 3. Repository Findings（2026-11-17 亲读，标注行号）

| # | 事实 | 落点 |
|---|---|---|
| F-01 | `startPriceScheduler = createCronScheduler({ envKey:'PRICE_SYNC_CRON', defaultCron:'0 3 * * *', taskName:'price-sync', run: () => dailySync({trigger:'SCHEDULED'}) })`；默认单 cron | `cron-worker/src/schedulers/priceScheduler.js:7-15` |
| F-02 | 工厂返回 `startScheduler(options)`；`options.cronExpression / options.timezone / options.run` 可覆盖 env、时区与执行函数；`cron.validate` 校验后 `cron.schedule(expr, cb, {scheduled:true, timezone})` | `cron-worker/src/schedulers/cronScheduler.js:22-48` |
| F-03 | `dailySync(options = {})` 只识别 `trigger` / `runKey` / `dependencies`；**无 market 过滤参数** | `shared/tasks/dailySync.js:70-85` |
| F-04 | `syncActiveAssetPrices(dependencies = {})` 从 `loadAssets()` 取**全部** active 资产后逐个处理；依赖可注入（便于测试） | `shared/tasks/dailySync.js:19-68` |
| F-05 | `canonicalDayTimestamp(value)` 按 `MARKET_TIMEZONE` 得 `YYYY-MM-DD` 再取当日 `startOf('day')`；本计划**不改** | `shared/utils/marketTime.js:58-63` |
| F-06 | 落库 `saveLatest` 唯一键 `{symbol, timestamp}`、`$set` 全量覆盖、11000 兜底；本计划保持该语义 | `shared/services/priceStorage.service.js:13-30` |
| F-07 | `PriceSchema.index({symbol:1,timestamp:1},{unique:true})`；无覆盖历史字段 | `shared/models/price.js:23` |
| F-08 | Fetcher 路由按 `market`：`CN-FUND`→天天基金、`CN*`→东财、`US/CA/HK`→Yahoo；`fetchWithRetry` 已包裹（硬规则 #7） | `shared/services/priceFetch.service.js:23-96` |
| F-09 | Tiantian `toRecord` 用 `item.FSRQ` 作为净值日期，转成 `${date}T12:00:00Z` | `shared/fetchers/tiantianFetcher.js:40-45` |
| F-10 | `integrityCheck.expectedBucketCandidates(market,dateStr)`：CN 返回 `[etDate, etDate+1]`，其它返回 `[dateStr]`；用于判定「任一候选桶存在记录」 | `cron-worker/src/tasks/integrityCheck.js:67-74,104`；注释 `:12-14` |
| F-11 | 统一日志 `taskLogger` 来自 `@portomind/shared/config/logger`，写 `logs/task-YYYY-MM-DD.log`，控制台+文件；采集成功/失败已有 `PRICE_SYNC_ASSET_SUCCEEDED` / `_FAILED` 日志 | `shared/config/logger.js:93-110`；`shared/tasks/dailySync.js:49-64` |
| F-12 | 测试用 Node 内建 `node:test` + `node:assert`；worker 测试入口 `cd cron-worker && npm test`（`node --test`） | `cron-worker/package.json:13`；`cron-worker/test/dailySync.test.js:1-4` |
| F-13 | 已有相关测试：`test/dailySync.test.js`、`test/cronScheduler.test.js`、`test/integrityCheck.test.js`、`test/priceFetch.test.js`、`server/test/integration/price.module.test.js`；框架为 Node 内建 `node:test` + `node:assert`，无 jest/vitest | `cron-worker/test/`、`server/test/integration/` |
| F-14 | `startSchedulers()` 的 jobs 数组**固定注册 5 个**调度器（price/health/alert/fx/rebalance）；新增第 6 个 cron 必须在此登记才可启动 | `cron-worker/src/tasks/scheduler.js:3-10,28-34` |
| F-15 | `scheduler.test.js` 硬断言 `created.length === 5`、`jobs.length === 5`，且 `DEFAULT_PRICE_SYNC_CRON === '0 3 * * *'`；第 6 个任务须同步更新断言（保留 US-CA 默认 `0 3 * * *` 即可维持该常量断言） | `cron-worker/test/scheduler.test.js:18-40` |
| F-16 | env 值定义于 `cron-worker/.env{,.example}`（`MARKET_TIMEZONE`、`SCHEDULER_TIMEZONE`、`PRICE_SYNC_CRON=0 3 * * *`、`HEALTH_CHECK_CRON`）；server 侧无 PRICE_SYNC_CRON（正确，server 不调度） | `cron-worker/.env.example`、`server/.env.example` |
| F-17 | `MARKET_TIMEZONE` 在 `marketTime.js:11` 模块加载时捕获，`SCHEDULER_TIMEZONE` 多处调用时读取；改 env 须重启进程生效 | `shared/utils/marketTime.js:11`；`cronScheduler.js:9` |

未核实项（诚实标注）：本轮只读源码与审阅记录，**未连库、未实跑采集**，故「ET 12:00 取到当日净值」的实际效果需实施阶段用时序单测 + 一次真实/模拟采集验证（AC1/AC3）。`portomind_dev` 现状数据未复查。

## 4. Proposed Design

### 4.1 `dailySync` 增加 market 分组过滤（shared）

在 `shared/tasks/dailySync.js` 增加可选参数，保持向后兼容（默认行为不变）：

```js
// dailySync(options = {})：新增 options.marketGroup（'CN' | 'US_CA' | undefined）
// syncActiveAssetPrices(dependencies = {})：新增 dependencies.marketGroup 过滤

function inGroup(market, group) {
  if (!group) return true;                       // 未指定：全部（手动 CLI 兼容）
  const m = String(market || '').toUpperCase();
  if (group === 'CN')    return m.startsWith('CN') || m === 'HK';  // CN-SH/CN-SZ/CN-FUND/HK
  if (group === 'US_CA') return m === 'US' || m === 'CA';
  return true;                                   // 未知 group：不过滤（防御）
}
// loadAssets 后：const assets = (await loadAssets()).filter(a => inGroup(a.market, marketGroup));
```

- `trigger`、`runKey` 语义不变；`runKey` 仍按 `marketDate()`（默认组）生成，避免两个分组任务被 `runTrackedTask` 当作同一 runKey 互斥（**需确认** `runTrackedTask` 的防重粒度——若按 `taskName+runKey` 去重，则两个分组须用不同 `taskName` 或不同 runKey 后缀，见 §6 待确认项 Q1）。
- 依赖注入点（`getActiveAssets` / `fetchLatest` / `saveLatest` / `isMarketOpenToday`）保持不变，`marketGroup` 作为第五个可选依赖/参数传递，现有测试无需改签名即可继续通过。

### 4.2 `priceScheduler` 注册两个 cron（cron-worker）

沿用 `createCronScheduler`，注册两次（不同 `envKey` 前缀 / 不同 cron / 不同 group run 回调）：

```js
// 新增常量
const DEFAULT_CN_CRON    = '0 12 * * *';  // ET 12:00
const DEFAULT_US_CA_CRON = '0 3 * * *';   // ET 03:00

const startCnScheduler = createCronScheduler({
  envKey: 'PRICE_SYNC_CN_CRON',
  defaultCron: DEFAULT_CN_CRON,
  taskName: 'price-sync-cn',
  run: () => require('@portomind/shared/tasks/dailySync')({ trigger: 'SCHEDULED', marketGroup: 'CN' })
});
const startUsCaScheduler = createCronScheduler({
  envKey: 'PRICE_SYNC_US_CA_CRON',
  defaultCron: DEFAULT_US_CA_CRON,
  taskName: 'price-sync-us-ca',
  run: () => require('@portomind/shared/tasks/dailySync')({ trigger: 'SCHEDULED', marketGroup: 'US_CA' })
});
```

- **兼容**：保留原 `startPriceScheduler` 作为 `startUsCaScheduler` 的别名，或保留 `PRICE_SYNC_CRON` 作为 US-CA 组的 env 回退（`options.cronExpression || process.env[envKey] || defaultCron` 已支持覆盖）。部署运维可只设 `PRICE_SYNC_CRON` 继续控制 US-CA 组。
- 时区统一 `resolveTimezone()`（ET），两个 cron 均按 ET 解释，符合 D-a「不动 `MARKET_TIMEZONE`」。
- **登记第 6 个 job**：`cron-worker/src/tasks/scheduler.js` 的 `jobs` 数组须加入 `startCnScheduler()`（保留原 `startPriceScheduler()` 作为 US-CA 组），否则新 cron 不会启动；同步更新 `cron-worker/test/scheduler.test.js` 的 5 个断言为 6（见 §4.5）。
- cron-worker 仍是唯一调度所有者；不在 server 注册任何 timer（硬规则 #2）。

### 4.3 同日多批次：接受覆盖 + 写入日志留痕（D-a-附带）

- **不改**唯一索引、`saveLatest` 的 upsert/`$set` 全量覆盖语义、`Price` schema（无新增历史字段、无迁移）。
- 在 `shared/services/priceStorage.service.js:saveLatest` 落库前后各记一条 `taskLogger`：
  - 前：`PRICE_UPSERT_PREVIOUS`（记录 `symbol`、`timestamp`（归一化后的桶）、`existing` 旧值或 `null` 表示首次写入）。
  - 后：`PRICE_UPSERTED`（记录 `symbol`、`timestamp`、`price`、`market`、`trigger`/`marketGroup`（从 record 带入或调用方透传）、`batch`（如 `scheduled-cn` / `scheduled-us-ca` / `manual:<iso>`）、`writtenAt`（写入时刻 ISO）、是否覆盖 `overwritten: boolean`）。
- 记录 content 使用结构化字段（伴随 taskLogger 的 JSON 格式），遵守现有日志脱敏规则（`sanitizeLogValue`）。不新增日志模块，复用 `taskLogger`。
- 效果：同一 `(symbol, 日)` 被第二个批次覆盖时，日志中可见旧值与新值及批次来源 → 消除 P3-9c「无声覆盖不可追溯」。不改消费侧「取最新价」的行为。
- **前置与合并分工（与 TASK-073 AC1）**：本节日志的 `symbol` 标准存储格式由 [TASK-073 AC1](../active/TASK-073-price-pipeline-p0-data-correctness.md) 的 `toStorageSymbol` 接线提供；本卡**不改** `priceStorage.service.js:8` 的 symbol 归一化行，只在 `saveLatest` 主体前后加日志。073 未落地前，同一基金价格落在 `001180` / `001180.CN` 双键而非同一 `(symbol, 日)` 键，不存在本节所述「覆盖」事件，日志 symbol 也无法按标准格式对齐——故 073 是 AC4 正确性的前置。合并时两卡改同一文件不同行，须跑 `priceStorage` 单测确认互不覆盖。

### 4.4 `integrityCheck` CN 补偿复核（AC3）

- 复核：D-a 后 CN 组在 ET 12:00 采集，`FSRQ` 为 T 日净值 → 经 `canonicalDayTimestamp` 按 ET 归桶。ET 12:00 夏令时 = 上海 00:00、冬令时 = 上海 01:00，均为同一 ET 日，故 T 日 CN 价落 T 日 ET 桶（不再是 T-1 桶）。
- 若时序/实测确认成立：`expectedBucketCandidates` 对 CN 简化为 `[dateStr]`（与 US/CA 一致），并更新 `:12-14` 注释；移除近似补偿。
- 若实测发现仍存在跨日（例如某个 CN 市场被错误路由到 US-CA 组采集）：保留补偿并更新注释说明「为何在分组调度后仍需候选桶」。两种结果都须写单测与记录。
- 本项属于「先实测后改」的条件分支；若结论是「保留」，改动仅限注释，归桶与 `expectedBucketCandidates` 行为不变。

### 4.5 测试设计

| 文件 | 新增用例 |
|---|---|
| `cron-worker/test/dailySync.test.js` | ① `marketGroup:'CN'` 只处理 CN-SH/CN-SZ/CN-FUND/HK；② `marketGroup:'US_CA'` 只处理 US/CA；③ 未指定 group 处理全部（兼容）；④ 同 symbol 同日两次 `saveLatest` 后值被后者覆盖且日志含 `PRICE_UPSERT_PREVIOUS`/`PRICE_UPSERTED` |
| `cron-worker/test/cronScheduler.test.js`（或新 `priceScheduler.test.js`） | 两 cron 表达式校验、时区为 ET、group 回调触发对应 `marketGroup`；验证 `startPriceScheduler` 兼容别名仍可用 |
| `cron-worker/test/scheduler.test.js` | F-14/F-15：`jobs` 数组由 5 → 6，`created.length`/`jobs.length` 断言改 6；`DEFAULT_PRICE_SYNC_CRON==='0 3 * * *'` 保留（US-CA 默认不变）；断言新增 CN 默认 `0 12 * * *` 已注册 |
| `cron-worker/test/integrityCheck.test.js` | 依据 4.4 实测结论：若移除 CN 补偿，断言 CN 现在只接受 `[dateStr]`；若保留，断言注释/行为更新说明 |
| 跨日时序单测（新增，落在 `cron-worker/test/` 或 `server/test/integration/`） | 固定 ET/SH 边界时刻：断言 ET 12:00 采集的 T 日净值 `timestamp` 落 T 日桶、不覆盖 T-1 已有记录；`canonicalDayTimestamp('2026-11-13T15:00Z') → 11-13`（引用已验证事实） |

## 5. Work Breakdown

- [ ] W1（前置确认 Q1）核对 `runTrackedTask` 防重粒度（taskName+runKey），确定两个分组任务的 `taskName`/`runKey` 策略 → 产出：决定记录（§6 Q1）
- [ ] W2 在 `shared/tasks/dailySync.js` 增加 `marketGroup` 过滤（向后兼容）→ 产出：代码 + `dailySync.test.js` 分组用例
- [ ] W3 在 `cron-worker/src/schedulers/priceScheduler.js` 注册 CN（ET 12:00）与 US-CA（ET 03:00）两个 cron，保留兼容别名；在 `cron-worker/src/tasks/scheduler.js` 登记第 6 个 job（F-14）；更新 `cron-worker/test/scheduler.test.js` 断言 5→6（F-15）；更新 `cron-worker/.env{,.example}` 新 env 变量 → 产出：代码 + cron 注册/enroll 单测 + env 模板
- [ ] W4 在 `shared/services/priceStorage.service.js:saveLatest` 增加覆盖前/后日志 → 产出：代码 + 覆盖日志单测（AC4）
- [ ] W5 复核 `integrityCheck` CN 补偿（AC3）：实测/推演后按 4.4 两分支处理 → 产出：代码或注释 + 对应单测
- [ ] W6 补跨日时序单测（ET/SH 边界、T 日净值不覆盖 T-1）→ 产出：测试文件（AC1/AC2）
- [ ] W7 更新文档与注释：`CRON_WORKER_DEV.md` / `CRON_WORKER_OPS.md` 环境变量与双 cron 说明、`cron-worker/.env.example` 新变量、`scheduler.js:3-10` 头部注释（5→6 类任务）；按 AGENTS §3「单源归属」只改 owning 文档、其它处加链接 → 产出：文档/注释 diff
- [ ] W8 运行验证（`npm test` / `cd cron-worker && npm test`，见 DEPLOYMENT §7），提交 self-test 证据 → 产出：验证记录（§11）
- [ ] W9 交接 Reviewer 独立审查 → 产出：Review Record（§12）

依赖顺序：W1 → W2/W3（可并行，但 W3 依赖 W2 的参数契约）；W4 独立；W5 依赖 W3 的分组调度生效结论（可先用推演，最终实测）；W6 依赖 W2/W4；W7 依赖 W2–W5 定稿；W8 依赖全部代码；W9 依赖 W8。

## 6. Decisions

| # | 事项 | 状态 / 依据 |
|---|---|---|
| D-a | 按市场分组多次调度（CN ET 12:00 / US-CA ET 03:00） | ✅ 已裁决，任务卡 §6（Human 2026-11-17）。本计划 §4.1–4.2 落实 |
| D-a-附带 | 同日多批次接受后写覆盖先写 + 写入日志留痕 | ✅ 已裁决，任务卡 §6 / §9。本计划 §4.3 落实。不扩 schema、不迁移 |
| 归桶时区 | 不改 `MARKET_TIMEZONE` / `canonicalDayTimestamp` | ✅ 已裁决，D-a 明确「改采集时刻而非归桶时区」 |
| Q1 | 两个分组 cron 的 `taskName` / `runKey` 防重策略 | ⏳ 实施前由 Implementer 核对 `shared/services/taskRunner.js` 的 `runTrackedTask` 去重键后决定；若为 `taskName+runKey` 且 CN/US-CA 同日 `marketDate()` 相同，则用不同 `taskName`（`price-sync-cn` / `price-sync-us-ca`，本计划 §4.2 已采用）即可区分，属范围内实施细节，无需再报 Human |
| Q2 | 原 `PRICE_SYNC_CRON` env 的兼容方式 | 建议保留为 US-CA 组的回退（§4.2）；若 Human 要求删旧 env 再另议。属部署兼容细节 |

范围、AC、产品行为均无变更；若实施中发现须改归桶语义或扩 schema/迁移，按 [EXECUTION_PLANS §5](../../../os/process/EXECUTION_PLANS.md) 与 [STATES §4](../../../os/process/STATES.md) 提交 Human，回 Draft 重批。

## 7. Verification

命令入口唯一归属 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md)（此处只引用，不复制命令清单）。不写死用例数量，以实际输出为准。

| AC | 验证方法 | 预期结果 |
|---|---|---|
| AC1 | W3 cron 单测 + W6 跨日时序单测；条件允许时一次真实/模拟采集 | CN 组 ET 12:00、US-CA 组 ET 03:00 触发；T 日 CN-FUND `FSRQ` 落 T 日 ET 桶；P0-3「ok=42 但 11-13 无桶、11-12 被覆盖」不复现 |
| AC2 | W6 单测：`canonicalDayTimestamp('2026-11-13T15:00Z') === 11-13`；ET/SH 跨日边界断言；检查 `marketTime.js` 与 `MARKET_TIMEZONE` 未改 | 归桶函数与默认时区无 diff；一日一桶幂等语义不变 |
| AC3 | W5 复核 + 单测：CN T 日价落 T 日桶后，`expectedBucketCandidates('CN', T)` 的判定 | 若补偿可移除，CN 候选为 `[dateStr]` 且完整性用例全绿；若保留，注释与测试说明为何仍需要 |
| AC4 | W4 覆盖日志单测 + W2 分组单测 | 同 `(symbol, 日)` 二次写入后值为后者；日志含 `PRICE_UPSERT_PREVIOUS` / `PRICE_UPSERTED`，可见旧值、新值、批次与写入时刻；无 schema 新字段 |
| AC5 | `cd cron-worker && npm test`、`npm test`（根目录全 workspace），独立 Reviewer 通过 | 全绿；Reviewer 出具 verdict 与 findings（BLOCKER/MAJOR 按 [REVIEWER §5](../../../os/roles/REVIEWER.md) 处理） |

覆盖缺口：计划阶段未连库、未实跑采集；AC1 的真实采集效果与 AC3 的最终分支须在 Implementing 阶段以实际运行证据确认，未取得前不得记为验证通过（[AGENTS.md §9](../../../../AGENTS.md)）。

## 8. Risks

| # | 触发条件 | 影响 | 应对 |
|---|---|---|---|
| R-1 | 两个 cron 在同一 ET 日不同时刻触发，外部 API 请求分布变化 | 可能限流 | CN ET 12:00 / US-CA ET 03:00 错峰；保留 `fetchWithRetry`（硬规则 #7）；熔断属 TASK-074，不在本卡扩范围 |
| R-2 | `runTrackedTask` 对两个分组按同一 `taskName+runKey` 去重导致其中一个被跳过 | 分组任务丢失 | W1 先核对；用不同 `taskName`（§4.2）与必要时 runKey 后缀区分 |
| R-3 | `PRICE_SYNC_CRON` 旧 env 与新分组 env 并存造成重复调度 | 同一 symbol 同日多次覆盖 | §4.2 保留旧 env 仅作 US-CA 回退；部署文档明确优先级；不注册第三份 cron |
| R-4 | 移除 CN 补偿后历史数据（旧桶错位）完整性率虚低 | 报表偏差 | 与 TASK-077 历史迁移协同；AC3 实测后再决定移除/保留；不改历史数据（本卡范围外） |
| R-5 | 覆盖日志写入高频价格记录导致日志量增长 | 磁盘/检索成本 | 日志按 `taskLogger` 现有按天切割 + `LOG_MAX_FILES` 保留策略；字段结构化便于检索；不新增独立日志文件 |

## 9. Rollback

- 代码回退：两个 cron 的注册可通过移除 `startCnScheduler` 调用、恢复单 `startPriceScheduler` 回到原 `0 3 * * *`；`dailySync` 的 `marketGroup` 默认 `undefined` 即恢复全量采集；日志语句可单独移除而不影响覆盖语义。
- 数据：保留「后写覆盖先写」语义，**不新增历史字段、不迁移**，故无新增残留数据结构；回退不产生不可逆数据变更。日志为只读追加，回退代码不删除已写日志。
- 不可逆影响：无。若实施中最终移除 `integrityCheck` CN 补偿，回退需恢复 `expectedBucketCandidates` 的 CN 分支与注释（W5 记录保留 diff）。

## 10. Implementer Handoff

- 下一角色：Implementer（待指派）。
- 输入：本计划 + 任务卡（AC1–AC5、§6 裁决 D-a / D-a-附带）、§3 Findings 的行号、§4 设计、§5 步骤、§7 验证映射。
- 范围与禁改：只在 §4 列出的文件内改动；**不改** `shared/utils/marketTime.js` 的 `MARKET_TIMEZONE` / `canonicalDayTimestamp`、**不改** `Price` schema / 唯一索引、不做历史迁移、不在 server 注册 timer、不扩到 TASK-074/075/076/077 范围。
- 授权：计划为 Draft，**未获 Human 批准前不得开工**；`Draft → Approved` 由 Human 登记（STATES §4）。
- 依赖：W1 的 Q1 结论；**TASK-073 AC1 的 `toStorageSymbol` 接线（§4.3 前置：073 未落地则同基金落双键，AC4 的「覆盖」事件与标准 symbol 日志不成立）**——属跨卡时序前置，非本卡范围内工作；无其它新依赖。
- 预期产出：代码 diff、单测、文档更新、验证记录（§11）、可审对象。
- 停止条件：若发现须改归桶语义、扩 schema/迁移、或 Q1 无法在范围内解决 → 停止并报 Planner / Human（AGENTS §8）。
- 验证入口：[DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)；命令不在此重复。

## 11. Implementation Record

（实施后填写：实际改动文件与版本、基线、偏差及依据、验证结果、遗留事项。计划完成不等于已合入，Merged 由 Human 登记。）

## 12. Review Record

（由独立 Reviewer 按 [REVIEWER.md §7](../../../os/roles/REVIEWER.md) 填写：verdict、AC 对照、findings 与严重度、实跑/引用证据、残余风险与独立性声明。Implementer 不为自己的改动出具独立审查结论。）

## 13. Completion Record

（填写：AC 与验证证据引用、关闭依据、归档与移交、长期沉淀位置与证据入口。计划完成后随独立任务留在 `docs/development/tasks/active/`，结案后按 [DOCS.md §1.1](../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期) 随卡片移到 `completed/`。Merged 仅引用 Human 登记，不自行判定。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求（D-a / D-a-附带沿用卡 §6 裁决；归桶与 schema 明确不改）。
- [x] 步骤可执行、依赖明确（W1–W9 与依赖顺序）、AC1–AC5 均有验证方法（§7）。
- [x] 记录可追溯且只存一处（技术方案与记录在计划，需求/AC/Status 在任务卡；命令入口引用 DEPLOYMENT §7）；编号与相对链接正确（与任务卡同目录）。
