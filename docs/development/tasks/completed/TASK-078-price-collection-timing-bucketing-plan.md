# TASK-078 — 价格采集时刻与归桶修正 实施计划

## Status

Status：Completed（2026-11-20，参见 §13）

Owner：Planner（起草）；Implementer（待指派）

Related Task：[TASK-078-price-collection-timing-bucketing](./TASK-078-price-collection-timing-bucketing.md)（独立维护任务，无 Story）

Related Spec / ADR：无 Spec；设计依据见 [PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) P0-3 / P2-8 / P3-9c 与任务卡 §6 Human 裁决 D-a / D-a-附带

Branch / Base：当前 `main` @ `d6e1413`（起草时）；实施从最新 `main` 开 `feature/TASK-078-price-collection-timing-bucketing`

Approval：**已批准（2026-11-17，Human）**。本计划覆盖任务卡 §6 已裁决的 D-a（CN 组 ET 12:00 / US-CA 组 ET 03:00 分组调度）与 D-a-附带（同日多批次接受后写覆盖先写 + 写入日志留痕），以及 AC1–AC5。`Draft → Approved` 须 Human 明确批准当前设计。

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
- **前置与合并分工（与 TASK-073 AC1）**：本节日志的 `symbol` 标准存储格式由 [TASK-073 AC1](./TASK-073-price-pipeline-p0-data-correctness.md) 的 `toStorageSymbol` 接线提供；本卡**不改** `priceStorage.service.js:8` 的 symbol 归一化行，只在 `saveLatest` 主体前后加日志。073 未落地前，同一基金价格落在 `001180` / `001180.CN` 双键而非同一 `(symbol, 日)` 键，不存在本节所述「覆盖」事件，日志 symbol 也无法按标准格式对齐——故 073 是 AC4 正确性的前置。合并时两卡改同一文件不同行，须跑 `priceStorage` 单测确认互不覆盖。

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

- [x] W1 核对防重粒度和分组策略（§6 Q1）。
- [x] W2 增加 `dailySync` 市场组过滤及手动全量入口的兼容验证。
- [x] W3 注册 CN ET 12:00 与 US/CA ET 03:00，验证 6 个 cron 及旧变量回退，并更新环境变量模板。
- [x] W4 增加 `saveLatest` 覆盖前后值审计及并发回归。
- [x] W5 复核 `integrityCheck` 的 CN 补偿，记录保留依据及回归。
- [x] W6 验证 ET/上海跨日和 T 日净值入桶。
- [x] W7 更新调度契约、运维配置及引用。
- [x] W8 运行全量 workspace 回归并记录证据（§11）。
- [ ] W9 交接 Reviewer 独立审查 → 产出：Review Record（§12）

依赖顺序：W1 → W2/W3（可并行，但 W3 依赖 W2 的参数契约）；W4 独立；W5 依赖 W3 的分组调度生效结论（可先用推演，最终实测）；W6 依赖 W2/W4；W7 依赖 W2–W5 定稿；W8 依赖全部代码；W9 依赖 W8。

## 6. Decisions

| # | 事项 | 状态 / 依据 |
|---|---|---|
| D-a | 按市场分组多次调度（CN ET 12:00 / US-CA ET 03:00） | ✅ 已裁决，任务卡 §6（Human 2026-11-17）。本计划 §4.1–4.2 落实 |
| D-a-附带 | 同日多批次接受后写覆盖先写 + 写入日志留痕 | ✅ 已裁决，任务卡 §6 / §9。本计划 §4.3 落实。不扩 schema、不迁移 |
| 归桶时区 | 不改 `MARKET_TIMEZONE` / `canonicalDayTimestamp` | ✅ 已裁决，D-a 明确「改采集时刻而非归桶时区」 |
| Q1 | 两个分组 cron 的 `taskName` / `runKey` 防重策略 | 已核对 `runTrackedTask`。两组共享看板使用的 `daily-price-sync`，数据库键用 `<日期>:CN` 与 `<日期>:US_CA` 区分；同进程的分组定时运行按序进入原 `taskName` 锁。cron 注册日志以各自名称区分。见 §11。 |
| Q2 | 原 `PRICE_SYNC_CRON` env 的兼容方式 | US/CA 使用 `PRICE_SYNC_US_CA_CRON`，缺省时回退旧 `PRICE_SYNC_CRON`。CN 单独使用 `PRICE_SYNC_CN_CRON`。 |
| R2 配套 | 按分组对齐价格看板目标日 | 2026-11-18 Human 确认纳入 TASK-078。默认 ET 12:00 起，开市的 CN/HK 市场检查当天，未到点或休市时检查此前最近开市日。US/CA 沿用原规则。允许调整服务端目标日计算、共享默认采集配置、价格卡日期文案和对应验证。API 既有字段结构保留。 |

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
- 范围与禁改：按 §4 和 §6 的 R2 配套范围实施；**不改** `shared/utils/marketTime.js` 的 `MARKET_TIMEZONE` / `canonicalDayTimestamp`、**不改** `Price` schema / 唯一索引、不做历史迁移、不在 server 注册 timer、不扩到 TASK-074/075/076/077 范围。
- 授权依据见 §Status。
- 依赖：W1 的 Q1 结论；**TASK-073 AC1 的 `toStorageSymbol` 接线（§4.3 前置：073 未落地则同基金落双键，AC4 的「覆盖」事件与标准 symbol 日志不成立）**——属跨卡时序前置，非本卡范围内工作；无其它新依赖。
- 预期产出：代码 diff、单测、文档更新、验证记录（§11）、可审对象。
- 停止条件：若发现须改归桶语义、扩 schema/迁移、或 Q1 无法在范围内解决 → 停止并报 Planner / Human（AGENTS §8）。
- 验证入口：[DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)；命令不在此重复。

## 11. Implementation Record

### 2026-11-18 · 实施与自测

- 从最新 `main` @ `f7ef68a` 开 `feature/TASK-078-price-collection-timing-bucketing`，工作树初始干净。复核 TASK-073 的 `toStorageSymbol` 写入接线已在基线。分组调度与运行键见 §6；保留原 `TaskRun` 状态和索引。CN 批次用调度时区的目标日期查询亚洲日历，避免周五 ET 中午因上海已进入周六而跳过。手动 CLI 继续覆盖全部激活资产。
- `saveLatest` 按同键条件更新，遇并发写入或唯一键冲突重新读取。确认写入后连发前值和后值日志，以免把失败的写入尝试记成覆盖。日志含标准键、归桶日期、批次、触发来源和写入时刻，批次字段不写入 Price。保持 `canonicalDayTimestamp`、`MARKET_TIMEZONE`、Price schema 和唯一索引。
- 保留完整性检查的 CN 候选桶。新定时批次的当日净值可以命中 T 桶，检查也读取历史与手动采集，仍需兼容已存在的 T-1 桶。用例分别验证两桶命中。

| AC | 实施验证 |
|---|---|
| AC1 | Worker 用例验证 ET 12:00 / 03:00 表达式、时区、注册及组回调。定向时序用例用天天基金解析函数和模拟响应覆盖夏令时、冬令时的周五中午，T 日 `FSRQ` 入 T 桶，T-1 价格保持。2026-11-18 21:48 ET 只读实查 `001180.CN`、`003949.CN` 均返回 11-18 `FSRQ` 并归 11-18 ET 桶。尚未在实际 ET 12:00 跑定时批次或验证届时的净值发布覆盖。 |
| AC2 | 市场日边界、同日仅一键、TASK-073 派生和并发 upsert 的回归通过。归桶、Price 与 TaskRun 模型无 diff。 |
| AC3 | 实跑新 T 桶与历史 T-1 候选对照，均按既有规则命中。保留补偿并更新说明。 |
| AC4 | 模拟同日定时价 300、手动价 301，确认同键最终值 301，日志关联前值 300 与两次批次。另模拟并发插入冲突，确认重读竞争者的价格后再覆盖并留痕。 |
| AC5 | 全 workspace 回归通过，服务端 279/279、Worker 85/85。文档和差异空白检查通过。独立 Reviewer 尚待安排。 |

未启动新 Worker、未写实际行情库、未修改本机或部署 `.env`。全量测试原始输出为本机 `%TEMP%/portomind-TASK-078-workspaces-20261118-215047.log`。将当前分支工作区及定时样本边界交 Orchestrator 安排独立复审。

### 2026-11-18 · 首轮审查返工

- **R1 / AC1。** 先加入评审的延迟净值对照，修复前实跑红例确认 11-12 桶从 `1.10` 被覆盖为 `1.25`。定时 CN 的场外基金采集现在在写入前比较净值的归桶日与批次目标日。日期不符走既有逐资产 `UPSTREAM` 失败路径，保留目标日、净值返回日和数据源。未发布当日净值的单标的批次记录 `PARTIAL`、成功 0、失败 1，保留 11-12 的 `1.10`，11-13 仍缺价。对照验证手动同步继续按净值日期入桶，正常 T 日净值和夏冬令样本仍通过。没有增加状态值或改变归桶。
- **R2 归属待裁决。** 看板按全市场 ET 03:00 取有效同步日，再以其前一开市日为目标。对 CN/HK 采用分组后的当天目标，会改变现有 API 派生和卡片「上一开市日」含义。TASK-074 已列范围为连续无数据、估值新鲜度及观测，未明确接管分组目标日。建议作为 TASK-078 调度变更的配套，范围及规则由 Human 确认；本轮保留独立审查的只读证据，未改看板。
- **返工验证。** 全 workspace 实跑通过，服务端 279/279、Worker 86/86。原始输出 `%TEMP%/portomind-TASK-078-rework-20261118-230417.log`。文档与差异空白检查通过。未启动实际定时作业或向真实行情库写入，实际 ET 12:00 的净值发布覆盖仍待观测。

### 2026-11-18 · R2 纳入本卡后的实现与复验

- Human 确认分组目标日归 TASK-078（§6）。Worker 注册与看板通过 `shared/config/priceSync.js` 共用默认时点与市场分组。默认时间下，CN/HK 到点且开市时核查当日，未到点或休市时核查此前最近开市日。US/CA 保留原规则。按市场核查并汇总，价格卡在目标日不同时列出各市场日期。任意自定义 Worker cron 不由 API 解析，运维手册说明需同步核对看板时点。
- 独立审查所用的 `portomind_task077_restore_test` 再次只读运行实际看板服务，注入 2026-11-18 的 ET 11:59、12:00、15:00。CN-FUND 的目标从 11-17 切到 11-18，12:00 和 15:00 均为 29/29；US/CA 三次均保留 11-17，全部市场合计 42/44。时钟注入只用于验证目标日，并非当时实际运行定时批次。
- R2 用例施修前实跑红例，修复后中午边界、周末和国庆长假对照通过。最终 workspace 测试通过，服务端 281/281、Worker 86/86，原始输出 `%TEMP%/portomind-TASK-078-final-rework-20261118-230834.log`。价格卡浏览器夹具 47/47 通过，包含混合市场目标日及同日省略明细的验证。Client build 成功（既有分块大小告警），lint 0 错误、5 条既有警告。文档和差异空白检查通过。R1/R2 交回独立 Reviewer 复审。尚未在实际 ET 12:00 观测整批基金净值发布覆盖。

## 12. Review Record

### 2026-11-18 · 独立审查

**判定：Fail。** 对象为 `feature/TASK-078-price-collection-timing-bucketing` @ `f7ef68a` 的当前工作区实施快照。审查覆盖分组调度、日期、存储及下游目标日。Reviewer 未参与实现或交付验收脚本编写。

| AC | 结论 | 证据 |
|---|---|---|
| AC1 | 不满足 | 两组 cron 的默认 ET 时刻和分组回调有测试。当返回当天净值时确实入当天桶。当天净值延迟时仍复现原 P0-3 模式，见 R1。 |
| AC2 | 满足 | 夏令时、冬令时跨日及同日存储用例通过；`marketTime.js`、Price 和 TaskRun 模型及唯一索引与基线一致。 |
| AC3 | 满足 | §11 的新当天桶与旧前一天桶对照通过。保留补偿以支持存量价格和手动采集，理由已经记录。 |
| AC4 | 满足 | 同日条件更新及并发冲突用例验证最终值和覆盖日志。保留既有存储键、索引与模型。 |
| AC5 | 不满足 | 已核对同一快照的全量日志，服务端 279/279、Worker 85/85，独立审查未通过。 |

| 编号 | 严重度 | 现象与处置 |
|---|---|---|
| R1 | BLOCKER | [CN 定时采集](../../../../shared/tasks/dailySync.js#L60) 取到任何有效净值就保存并计成功。以 ET 11-13 12:00 运行实际任务、行情适配器与存储逻辑，替代上游 HTTP 与数据库写读。预置 11-12 桶价格 1.1。上游返回 11-13 的 `FSRQ` 时，11-13 为 1.25、11-12 仍为 1.1。上游仍返回 11-12 时，任务却为 `SUCCEEDED`、成功数 1，11-13 无数据，11-12 被改为 1.25。请明确处理返回日期与定时 CN-FUND 目标日不符的分支，保留原归桶与同日覆盖口径，并补延迟发布对照。 |
| R2 | MAJOR | [价格看板的目标日](../../../../shared/services/cronStatus.service.js#L129) 仍对所有市场使用 ET 03:00 并取前一开市日。独立只读调用实际 `getStatus`，以 11-18 15:00 ET 为时钟参数：验收库已存在 29 只基金的 11-18 桶，CN-FUND 看板仍检查 11-17。US/CA 的前一开市日语义与 CN 中午写当日价的语义已经不同。请由 Orchestrator 确认按分组对齐目标日的归属；现有看板结果无法验证 CN 中午批次的当日覆盖。 |

复用 §11 的全量测试与上游样本记录。本轮实跑一次性 stdin 时序探针、验收库只读看板对照、差异与文档检查。未启动定时 Worker、未向实际行情库写入，也未观测真实 ET 12:00 的上游发布覆盖。交 Orchestrator 协调 R1 返工及 R2 的归属。

### 2026-11-19 · 返工独立复审

**判定：Pass。R1、R2 均关闭。** 对象为 `feature/TASK-078-price-collection-timing-bucketing` @ `f7ef68a` 的返工工作区快照，含当前未跟踪的 `shared/config/priceSync.js`。看板目标日修改已获 Human 授权纳入本卡（§6）。Reviewer 未参与本轮实现或实施验收脚本编写。

| AC | 复审结果 | 证据 |
|---|---|---|
| AC1 | 满足 | 复用默认 12:00 / 03:00 ET 注册及分组用例。独立运行实际任务、行情适配器与存储逻辑，夏令时和冬令时均复现相同结果：T 日净值写入 T 桶，T-1 保留；上游仅返回 T-1 时，实测写入 0 次，原价保持，成功 0、失败 1、状态 `PARTIAL`，记录 `TIANTIAN / UPSTREAM`。手动采集仍按净值日期写入。 |
| AC2 | 满足 | 夏冬令跨日对照通过；`MARKET_TIMEZONE`、归桶函数、Price 与 TaskRun 模型和索引无差异；同日幂等引用返工版回归。 |
| AC3 | 满足 | 复用同版本的 T 日桶和旧 T-1 候选对照；保留兼容补偿的理由见 §11。 |
| AC4 | 满足 | 复用同版本的条件更新、并发冲突和覆盖日志测试；存储与日志实现相对首轮无新增差异。 |
| AC5 | 满足 | 核对返工版本的全量原始日志，服务端 281/281、Worker 86/86；模拟时序及独立复审通过。浏览器夹具和 build/lint 引用 §11。 |

R2 独立复验：对 `portomind_task077_restore_test` 只读调用实际看板服务，注入 11-18 ET 11:59:59、12:00:00 和 15:00:00。CN-FUND 由 11-17 切至 11-18，当日覆盖 29/29；US、CA 三次均保持 11-17，API 保留 5 类卡片条目。混合日期展示引用 §11 的浏览器夹具。

本轮仅执行一次性模拟和只读看板核查，文档及空白检查通过。真实 ET 12:00 定时批次的上游发布覆盖未观测。采用自定义采集 cron 时，看板时点需按已记录的运维口径同步核对。未启动或切换实际 Worker，未写入验收行情库。由 Human 决定结案。

## 13. Completion Record

2026-11-20，原任务卡已登记完成，本次核对证据后归档。§11 的全量回归及 §12 的独立复审支持 AC1–AC5，最终结论为 Pass，R1、R2 已关闭。真实 ET 12:00 定时批次的上游净值发布覆盖仍待运行观测。实现 `40ce7c3` 随 PR #60 进入主干（`a8d8837`）。

## 自检

- [x] Task 与批准依据对应，方案未改变需求（D-a / D-a-附带沿用卡 §6 裁决；归桶与 schema 明确不改）。
- [x] 步骤可执行、依赖明确（W1–W9 与依赖顺序）、AC1–AC5 均有验证方法（§7）。
- [x] 记录可追溯且只存一处（技术方案与记录在计划，需求/AC/Status 在任务卡；命令入口引用 DEPLOYMENT §7）；编号与相对链接正确（与任务卡同目录）。
