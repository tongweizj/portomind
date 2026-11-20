# 基金价格链路：从创建到每日更新

> 本文档为 **2026-11-15 独立审阅**产出，记录价格链路的业务逻辑与现存缺陷。
> 基线：本地 `main` @ `d6e1413`。
> **数据来源**：`portomind`（真实库）已通过 `npm run sync:db` 镜像到 `portomind_dev`，本版全部数字取自**同步后**的开发库（真实库快照，15 个集合 / 81432 条文档，`_id` 哈希逐一校验一致）。审阅期间只读，未写入任何业务数据。
> **本文不是任务卡、不改任何 AC/Status**；缺陷清单供后续立项参考。

> **修订说明（同日）**：本版修正了初版的 3 处错误结论。初版基于**未同步的旧 dev 库**得出，其中「数据停更 17 天」为错误推断，已撤回；另新增一条由真实数据揭示的 P0 级问题（P0-3，写入日期错位）。详见文末「附录 B：修订记录」。

---

## 第一部分：业务逻辑 —— 一个基金从创建到每日更新

### 1.1 全景（五个阶段）

```
①资产建档        ②交易入账        ③每日采集          ④入库归桶        ⑤消费（估值/提醒/再平衡）
 assets          transactions      priceScheduler      prices            getLatestPrices
   │                 │                 │                 │                    │
   └─ symbol/market ─┴─────────────────┴─────────────────┴────────────────────┘
      （symbol 是贯穿全链路的**唯一关联键**）
```

### 1.2 阶段① 资产建档（`shared/models/asset.js`）

一条 `Asset` 记录决定后续一切路由行为，关键字段：

| 字段 | 作用 | 缺失后果 |
|---|---|---|
| `symbol` | **全链路唯一关联键**，`unique: true`，存库时 `uppercase` | 无价可查 |
| `market` | 决定走哪个 Fetcher（`priceFetch.service.js` 是**唯一**判定处） | 回退到 symbol 特征推断 |
| `currency` | 估值分币种桶（不做跨币种加总） | 估值桶归 `UNKNOWN` |
| `type` / `assetClass` | 证券类型 / 大类，供目标配置与分组 | 目标配置不可算 |
| `launchDate` | **完整性检查的起点**，用于推算「理论应有几个交易日」 | 完整性检查直接跳过该资产 |
| `active` | `false` 则不参与采集 | — |

> **关键设计**：`symbol` 既是业务主键，又是外部数据源的查询键，还是跨表（`transactions` / `prices`）的关联键。**没有归一化层**（ARCHITECTURE §8 债 #4 已记录）。

### 1.3 阶段② 交易入账（`shared/services/transaction.service.js`）

用户录入一笔买入交易，`transactions.symbol` 记下代码 + `portfolioId`。此时**还没有价格**。

持仓估值依赖三步拼接：
```
transactions（有哪些 symbol）→ getLatestPrices(symbols)（每个 symbol 的最新价）→ calculatePositions（纯函数算市值）
```

### 1.4 阶段③ 每日采集（`cron-worker` → `shared/tasks/dailySync.js`）

调度链：
```
cron-worker/src/schedulers/priceScheduler.js
   └─ createCronScheduler({ envKey:'PRICE_SYNC_CRON', defaultCron:'0 3 * * *' })
        └─ shared/tasks/dailySync.js  syncActiveAssetPrices()
```

`defaultCron = '0 3 * * *'`，时区 `SCHEDULER_TIMEZONE || MARKET_TIMEZONE || America/Toronto`（默认 ET 凌晨 3 点）。

`syncActiveAssetPrices()` 对每个 `active` 资产：

1. **开市判定**：`isMarketOpenToday(asset.market)` → 周末/节假日则 `skippedCount++`，记 `PRICE_SYNC_ASSET_SKIPPED_MARKET_CLOSED`，**continue**；
2. **抓取**：`fetchLatest(asset)`（传入**整个 asset 对象**，以便按 `market` 路由）；
3. **入库**：`saveLatest(priceData)`；
4. **计数与日志**：成功 `successCount++`，异常 `failureCount++` 并把 `category/provider/retryable/message` 收进 `failures[]`。

整个任务由 `runTrackedTask` 包住：写 `TaskRun`（`taskName/runKey/status/计数/失败明细`），同 `taskName` 并发互斥（`ALREADY_RUNNING` → `taskskips`）。

### 1.5 阶段③′ 数据源路由（`shared/services/priceFetch.service.js` —— 唯一判定处）

按 `market` 优先，缺失则按 symbol 特征推断：

| 条件 | Fetcher | provider | 说明 |
|---|---|---|---|
| `market === 'CN-FUND'` | `tiantianFetcher` | `TIANTIAN` | 场外基金单位净值；`providerSymbol` 会 **strip 掉 `.cn/.SS/.SZ` 后缀** |
| `market` 以 `CN` 开头 | `eastmoneyFetcher` | `EASTMONEY` | 场内证券实时价；同样 strip 后缀 |
| `market ∈ {US, CA, HK}` | `yahooFetcher` | `YAHOO` | 原样透传 symbol |
| 无 market：`.HK` / `.TO` | `yahooFetcher` | `YAHOO` | — |
| 无 market：`.CN` | `tiantianFetcher` | `TIANTIAN` | strip 后缀 |
| 无 market：`.SS/.SZ` 或 6 位数字 | `eastmoneyFetcher` | `EASTMONEY` | strip 后缀 |
| 其它 | `yahooFetcher` | `YAHOO` | 兜底 |

**注意**：`validateRecord` 会用 `resolved.requestedSymbol`（**原始 symbol，未 strip**）回填记录的 `symbol` 字段。这意味着——

> `fetchLatest({symbol:'001180.cn', market:'CN-FUND'})`
> → 请求 provider 时用 `001180`
> → 但返回记录的 `symbol` 被写成 `001180.cn`（`.toUpperCase()` 后为 `001180.CN`）

### 1.6 三个 Fetcher 的取价口径

| Fetcher | 接口 | 取什么价 | 时间戳来源 |
|---|---|---|---|
| **Yahoo** | `query1/query2 /v8/finance/chart/{symbol}`，`range=1d&interval=1d` | `meta.regularMarketPrice` | `meta.regularMarketTime`（供应商时间） |
| **Eastmoney** | `push2` → `push2delay` 回退，`/api/qt/stock/get` | `f43 / 10^f59`（按小数位缩放） | `f86`（Unix 秒） |
| **Tiantian** | `api.fund.eastmoney.com/f10/lsjz`，`pageSize=1` | **最近一期已发布单位净值** `DWJZ` | `FSRQ`（净值日期，落 `T12:00:00Z`） |

三者共同点：全部包在 `withMarketDataTimeout`（默认 10s）里，再外套 `fetchWithRetry`（默认最多 3 次、指数退避 + 全抖动，**仅 `retryable` 错误重试**）。Yahoo/Eastmoney 还有 host 级回退（主站挂了换备站）。

> **重要语义差异**：Yahoo/Eastmoney 取的是**盘中/收盘价**，Tiantian 取的是**已发布净值**（通常 T 日晚或 T+1 才公布）。两者「最新」的含义不同。

### 1.7 阶段④ 入库归桶（`shared/services/priceStorage.service.js` + `marketTime.js`）

```js
normalizeDailyRecord(record)
  → symbol = String(record.symbol).trim().toUpperCase()   // ← 大写化
  → timestamp = canonicalDayTimestamp(record.timestamp)   // ← 归到「市场日」的 0 点
```

`canonicalDayTimestamp` 的逻辑：把传入时间按 `MARKET_TIMEZONE` 解释成 `YYYY-MM-DD`，再取该日的 `startOf('day')`。

落库用 `findOneAndUpdate({symbol, timestamp}, {$set: data}, {upsert:true})`，唯一索引 `{symbol:1, timestamp:1}` 兜底并发（11000 冲突后改走 update）。

> **设计含义**：价格是**日粒度**的，同一 symbol 同一天只有一条（后写覆盖先写）。这是「日线快照」而非「Tick 流」。

### 1.8 阶段⑤ 消费侧

| 消费者 | 读法 | 缺价行为 |
|---|---|---|
| `marketData.getLatestPrices(symbols)` | 逐 symbol `findOne().sort({timestamp:-1})`，**精确匹配** | 返回 `null` + 记 `PRICE_DB_MISSING` 警告 |
| `positionTracker.aggregate` | 交易 symbols → `getLatestPrices` → `calculatePositions` | `marketValue = null` |
| `portfolio/summary.js` | 按币种分桶 | **该币种桶整体变 `null`**（任一持仓缺价即整桶作废） |
| `alertEngine` | 价格规则输入 `getLatestPrices` | 规则不触发 |
| `suggestionGenerator`（再平衡） | 同上 | 无法生成建议 |
| `integrityCheck`（完整性检查） | 见下 | — |

**关键传导**：AGENTS.md 的产品不变量「缺价不猜，显示 `—`」在代码上是这么实现的 —— 但副作用是**一颗老鼠屎坏一锅汤**：某币种只要有 1 个持仓查不到价，整个币种的市值就变 `null`，家庭总额也随之不可算。

### 1.9 附带机制：完整性检查（`cron-worker/src/tasks/integrityCheck.js`）

`healthScheduler`（默认 `30 3 * * *`，比价格同步晚 30 分钟）触发：

1. 以 `asset.launchDate` 为起点、`marketToday(market)` 为终点；
2. `expectedTradingDates` 用交易日历逐个判定开市，得「理论应有 N 个交易日」；
3. `storedBucketDates` 查实际落库日期，得「实际 M 条」；
4. `missingCount = expected - actual`，输出 `completenessRatio`；
5. 有缺口则 `INTEGRITY_AUTO_REPAIR`（默认开）按缺失区间调 `historySync` 回补，**只回补最近 `INTEGRITY_REPAIR_MAX_DAYS`（默认 30）天**，更早的记 `INTEGRITY_REPAIR_DEFERRED`。

> `launchDate` 为空 → `SKIPPED_NO_LAUNCH_DATE`，该资产**完全不参与**完整性评估。

### 1.10 一句话总结业务逻辑

> **资产建档（symbol 为键）→ 用户记一笔交易 → 每日 03:00 ET 由 cron-worker 遍历 active 资产，按 market 路由到 Yahoo/东财/天天基金取价 → 归一到「市场日」后用 (symbol, 日期) 幂等 upsert 入 prices → 估值/提醒/再平衡按 symbol 精确查最新价，缺价则整桶置 null。**

---

## 第二部分：价格采集存在的问题

以下每条均基于 **2026-11-15 对 `portomind_dev` 的实际查询**（只读）。按严重度排序。

### P0-1　symbol 双轨制：29 个场外基金中 27 个**永远查不到价**

**现象**（实测）：

```
assets 表：001180.cn / 015532.cn / 110020.cn …（小写 .cn，29 个）
prices 表：001180 / 001180.CN / …（裸码 或 大写 .CN）
```

逐条核对 29 个 `CN-FUND` 资产的**精确匹配**结果：

| 结果 | 数量 |
|---|---|
| `prices` 中存在同名记录 | **2** |
| 查不到 | **27** |

27 个查不到的资产，其**裸码全部有价**（如 `015532.cn` → `015532` 有 698 条）。即价格**采到了、但存错了键**。

**根因**（代码级，非猜测）：

1. `asset.symbol` 存的是 `001180.cn`（模型 `uppercase:true` 但**历史数据未回填**，实际库里是小写 `.cn`）；
2. `priceFetch.resolveFetcher` 对 `CN-FUND` 做 `stripCnSuffix` → 请求 provider 用 `001180`；
3. 但 `validateRecord` 回填 `symbol` 时用的是 `resolved.requestedSymbol`（**原始未 strip**）；
4. `priceStorage.normalizeDailyRecord` 只做 `.toUpperCase()` → 落库成 `001180.CN`；
5. 消费端 `getLatestPrices` 用 `assets.symbol`（`001180.cn`）**精确匹配** → `findOne({symbol:'001180.cn'})` → **查不到**。

> 大写化只发生在**写入侧**（`priceStorage` 和 Mongo 的 `uppercase`），**读取侧 `getLatestPrices` 没有做同样的归一化**。这不是「数据脏」，是读写两侧归一化不一致。

**影响**（在同步后的真实库上实测，与初版一致）：

- 32 个持仓 symbol 中，**17 个查不到价**；
- 这 17 个全是 `CN-FUND`（CNY 计价）→ **CNY 币种桶整体为 `null`** → 家庭总资产在 CNY 维度不可算；
- 再平衡对 CNY 组合无法生成建议；价格类提醒对这批基金**永不触发**；
- 页面上这 27 个基金显示 `—`，用户看到的是「基金没有价格」，实际是「价格存到另一个键下面了」。

> **措辞校正**：标题里的「永远」是指**在当前代码下不会自愈**——读侧不做归一化，写入再多次也匹配不上。这是确定性缺陷，不是概率问题。

**附带的更隐蔽问题** —— 同一基金存在**两套并发价格历史**：

```
001180     : 1177 条，2021-01-04 → 2026-07-06（停在 7 月）
001180.CN  :  662 条，2024-01-02 → 2026-11-12（仍在更新）
```

重叠的 448 个交易日里，**344 天价格相同、104 天不同**（差异在第 4 位小数，如 `0.7624` vs `0.7625`）。即两套序列来自不同批次/不同舍入口径，**互为污染源**。历史回补（`historySync`）写的是裸码，日常同步写的是 `.CN`，两条腿各走各的。

---

### P0-2　完整性检查实际从未生效（44/44 全部跳过）

**现象**（同步后真实数据 `taskruns`）：

```
price-integrity-check  2026-11-15  status=SUCCEEDED  totalCount=44  successCount=0  failureCount=0  durationMs=6
price-integrity-check  2026-11-14  status=SUCCEEDED  totalCount=44  successCount=0  failureCount=0  durationMs=5
```

**44 个资产的 `launchDate` 全部为 `NULL`**（`countDocuments({launchDate:{$ne:null,$exists:true}}) = 0`，在同步后的真实库上确认）。按 `integrityCheck.js` 的逻辑：

```js
const from = fromOption || (asset.launchDate ? launchDateStr(...) : null);
if (!from) {
  entry.status = 'SKIPPED_NO_LAUNCH_DATE';
  report.skippedCount += 1;
  continue;          // ← 44 个全部走这里
}
```

于是 `successCount=0`、`failureCount=0`、`checkedCount=0`，`durationMs=6`（连一次 DB 查询都没做）。而任务**仍被记为 `SUCCEEDED`**。

**影响**：这道「数据质量闸门」是空转的。它本应回答「每支基金理论上该有几天价格、实际采了几天」，现在回答不了任何人。上面的 P0-1（27 个基金缺价）**正是它本该抓到的问题**，却因为 `launchDate` 全空而没有发出任何警告。**监控失效比数据缺失更危险**——因为没人知道自己该修。

---

### P0-3　采集成功但日期错位：`ok=42` 却写进了前一天的桶

> **本条为真实数据揭示的新发现**（初版因用旧库而遗漏）。

**现象**（实测，用 ObjectId 内嵌时间戳判断写入时刻）：

```
11-13 08:00 那次 daily-price-sync 报 ok=42
  → prices 中写入时刻 ≈ 2026-11-13T08:00 的 42 条文档
  → 但它们的 timestamp 全部是 2026-11-12
```

即：**采集成功、也落库了，但 42 条记录全部被归到了「前一天」的桶**。导致：

| 日期 | TaskRun 说 | 实际价格桶 |
|---|---|---|
| 11-12 | ok=41 | 11-12 有桶（41 条，11-12 那次写） |
| 11-13 | ok=42 | **11-13 无桶**；42 条被写进 11-12 桶，**覆盖了 11-12 的原值** |
| 11-14/15 | 周末 | 无 |

**根因**（实测确认调度时刻）：

```
cron 0 3 * * *（时区 MARKET_TIMEZONE=America/Toronto）
  → TaskRun.startedAt = 2026-11-13T08:00:00Z
  → 美东 ET = 11/13 03:00（凌晨）
  → 上海 SH = 11/13 16:00（A 股已收盘）
```

即：**在美东凌晨 3 点触发，对应上海 16:00**。此时 A 股当日**已经收盘**，但**当日场外基金净值尚未公布**（通常当晚才出），所以 `FSRQ` 拿到的是**前一交易日（11-12）**的净值。`canonicalDayTimestamp` 忠实按 `FSRQ` 归桶 → 落进 11-12。

我用 `canonicalDayTimestamp` 做过直接验证：该函数本身**行为正确**（`2026-11-13T15:00Z` → `2026-11-13`，`2026-11-14T03:00Z` → `2026-11-13`）。**问题不在归桶函数，而在「什么时间点去采集」—— 抢在了净值发布之前。**

**影响**：

1. **同一天被覆盖两次**：11-12 的桶先由 11-12 那次写入，又被 11-13 那次覆盖。若两次取到的值不同（例如一次是盘中、一次是收盘），最终值取决于执行顺序，**不可追溯**（P3-9c 已记「同一日覆盖不留历史」）。
2. **场外基金永远滞后一天**：因为采集时刻（SH 16:00）早于净值发布（当晚），**采到的必然是前一交易日**。这不是偶发，是**每天稳定发生**。
3. **完整性检查若启用，会把这种错位误判为「缺一天」**——因为按市场日算应有 11-13 的记录，而库里没有（全被归到 11-12 了）。

**与 P2-8 的关系**：P2-8 记录的是「CN 因时区领先可能落进前一日桶」这一**设计层面的近似**，`integrityCheck` 里已有补偿代码。本条是它在**真实运行中的具体后果**，且已造成实际的数据覆盖。两者应合并处置。

---

### P1-3　`SUCCEEDED` 语义被透支：周末零采集也报成功

**现象**（同步后真实数据，按星期对齐）：

| 日期 | 星期 | status | ok | fail | durationMs |
|---|---|---|---|---|---|
| 11-13 | Fri | PARTIAL | 42 | 2 | 14718 |
| 11-12 | Thu | PARTIAL | 41 | 3 | 20655 |
| 11-14 | **Sat** | **SUCCEEDED** | **0** | 0 | **23** |
| 11-15 | **Sun** | **SUCCEEDED** | **0** | 0 | **20** |
| 11-08 | **Sun** | **SUCCEEDED** | **0** | 0 | 19 |
| 11-07 | **Sat** | **SUCCEEDED** | **0** | 0 | 25 |

`runTrackedTask` 的状态推导只看「有没有抛异常 / 有没有 failure」，不看 `successCount`。周末全部 `skipped` → 无 failure → `SUCCEEDED`，且耗时仅 20ms（连一次网络请求都没发）。

**影响**：`SUCCEEDED` 只能读成「跑完了没炸」，**不能读成「有新数据」**（ARCHITECTURE §8 债 #5 已记录此语义残缺）。任何基于 `status` 的告警都会在「连续 N 天 SUCCEEDED」时给出虚假安全感。更值得注意的是：**11-14/11-15 两天都是 `SUCCEEDED`，而最新价格停在 11-12** —— 如果只看 `status`，完全看不出数据已经停止更新。

---

### P1-4　`skipped` 与 `failed` 混在同一张表里，且 `result` 契约缺失

`dailySync` 返回 `{...summary, result:{skippedCount}}`，但 `taskRunner.normalizeCounts` 只透传白名单字段，且**只有显式带 `result` 键才保留**。实测 `taskruns.result` 为 `undefined`：

```
2026-11-13 PARTIAL total=44 ok=42 fail=2  result=undefined
2026-11-14 SUCCEEDED total=44 ok=0  fail=0  result=undefined
```

**影响**：事后无法从 `TaskRun` 区分「42 成功里有几个其实是休市跳过」，也看不出周末那两天到底是「全部跳过」还是「真的没数据」。`failures[]` 里能看 `category`，但 `skippedCount` 丢了。做数据质量分析时必须回读日志，而日志按天轮转。

---

### P1-5　最新数据落后 3 天，`getLatestPrices` 无新鲜度校验

> **本条为初版错误结论的修正**。初版称「停更 17 天」，那是基于**未同步的旧 dev 库**（最新到 10-29）得出的；真实库最新到 **11-12**，cron-worker 一直在正常跑。原结论撤回。

**现象**（同步后真实数据）：

```
prices 最近桶（ET）：2026-11-12 (42) / 11-11 (41) / 11-10 (41) / 11-09 (41) / 11-08 (1)
2026-11-15 价格条数：0
最近一次 daily-price-sync：2026-11-15T08:00 SUCCEEDED（ok=0，周末休市）
```

真实情况是：**最新有效价格停在 11-12（周四），截至 11-15 落后 3 天**。原因可解释：
- 11-13（周五）正常采集，`ok=42`，但其写入落进了 11-12 的桶（见 **P0-3**，这是新发现的缺陷）；
- 11-14 / 11-15 是周末，全部休市跳过（`SUCCEEDED / ok=0`）。

即：**不是「采集停了」，而是「采集在跑、但日期错位」+ 周末效应叠加**。

**仍然成立的问题**：`getLatestPrices` **没有新鲜度校验**——只 `sort({timestamp:-1}).limit(1)` 取最新一条，不比对当前日期。所以页面会**若无其事地展示 3 天前的价格**，没有任何「数据过期」提示。这与产品不变量「缺价不猜」的精神相悖：**旧价也是一种猜**。

> 初版在这里还写了「停更本身可能是 cron-worker 未运行」——该推测已不成立（TaskRun 显示每天都在跑），一并撤回。

---

### P2-6　全失败日：44/44 一次不剩，但重试策略掩盖了真实原因

**现象**（实测，含同步前后，问题持续存在）：

| 日期 | status | ok | fail | durationMs | 失败分类 |
|---|---|---|---|---|---|
| 10-23 | PARTIAL | 0 | **44** | **68436** | `UPSTREAM/TIANTIAN`:29, `UPSTREAM/YAHOO`:15 |
| 10-16 | PARTIAL | 0 | **44** | **81540** | 同上 |
| 10-22 | PARTIAL | 42 | 2 | 9889 | — |

同步后的真实数据里，正常交易日耗时已升至 **12–21 秒**（11-03 至 11-13 区间），比初版观察到的 ~10 秒更慢，说明上游响应在变差；全失败日仍会出现（10-16 / 10-23 各一次），耗时 68–82 秒。

全失败日耗时 68–82 秒（正常日约 10 秒），因为每个资产都要走完「3 次重试 + 指数退避 + host 回退」。

**问题**：

1. **无熔断**。上游整体不可用时，仍然对 44 个资产逐个重试到底，把一次上游故障放大成 44×4 次请求、80 秒的无效负载——对免费公开接口而言，这本身就可能招致限流（正反馈恶化）。
2. **失败原因被压平成 `UPSTREAM`**。`classifyMarketDataError` 把非 429/404/超时的一切都归为 `UPSTREAM` + `"request failed"`，丢失了 HTTP 状态码与真实报文。60 多秒里什么都发生了，日志里只留下一句 `request failed`。
3. **`retryable: true` 但连续 3 次都失败**，没有升级为「该 provider 当前不可用」的全局判断，下一次仍是同样剧本。

---

### P2-7　`NOT_FOUND` 资产长期静默：每天都在失败，但从没人处理

**现象**（实测，连续多日）：

```
failures: [
  { item:"VBG.TO", category:"NOT_FOUND", provider:"YAHOO", retryable:false, message:"YAHOO symbol not found" },
  { item:"VBU.TO", category:"NOT_FOUND", provider:"YAHOO", retryable:false, message:"YAHOO symbol not found" }
]
```

10-27 / 10-28 / 10-29 / 10-30 **连续 4 天**都是这 2 个资产失败；同步后的真实数据（11-03 至 11-13）**仍然每天都是这两个**，`VCR`（US）同理偶发。`NOT_FOUND` 是**确定性错误**（`retryable:false`），重试无意义，只能靠人发现并处理（改 symbol 或置 `active:false`）。

即：这个问题已经**持续至少 3 周、跨越同步前后，位置完全不变**——说明没有任何机制在盯它。

**影响**：这两个资产永远没有价格，其所属币种桶（CAD）因此**恒为 `null`**——即使 CAD 下其它资产价格完好。**一颗永久坏种子让整个 CAD 桶长期不可用**。系统没有任何「某 symbol 连续 N 天 NOT_FOUND → 提示用户」的机制。

---

### P2-8　归桶时区：CN 价格会落进前一天的 ET 桶

> **本条与 P0-3 是同一问题的两个层面**：P2-8 是设计层的近似，P0-3 是它在真实运行中造成的具体数据后果（已实测到覆盖）。处置应合并。

`canonicalDayTimestamp` 用**单一全局时区** `MARKET_TIMEZONE`（默认 `America/Toronto`）归桶，但 CN 市场在 `Asia/Shanghai`（比 ET 早 12–13 小时）。

后果：A 股/场外基金在上海时间产生的价格，换算到 ET 后可能落到**前一天**的桶里。

**初版在这里写「场外基金反而不受影响」——该判断被 P0-3 的实测推翻。** 实际情况是：场外基金虽然拿到的 `FSRQ` 已是净值日期，但因为**采集时刻在 ET 凌晨**，拿到的净值本身就是前一交易日的，归桶时按 `FSRQ` 落到前一天——同样错位，而且每天都发生。

代码自己也知道这点，`integrityCheck.js` 里专门写了补偿：

```js
// CN 记录的 ET 桶可能比市场日期早一天，查询窗口下界放宽一日
const lower = normalizeMarket(market) === 'CN' ? dayjs.utc(from).subtract(1,'day')… : from;
// 缺失判定按「任一候选桶存在记录」近似
function expectedBucketCandidates(market, dateStr) { … return [etDate, etDate+1]; }
```

**影响**：

- 完整性检查对 CN 只能「近似」，文件头注释明确写「完整率会略好于逐日精确值」；
- 跨市场对齐（如「今天全球市场表现」）时，CN 的「今天」和 US 的「今天」不是同一个桶；
- **已造成实际数据覆盖**（见 P0-3）：11-13 的 42 条价格全部写进 11-12 的桶。

---

### P3-9　其它设计层观察

| # | 观察 | 说明 |
|---|---|---|
| a | **每天只采一次** | `0 3 * * *` ET 凌晨 3 点。美股此时是前一日收盘后，A 股尚未开盘（上海 16:00）。CN 场内资产拿到的是**昨日**收盘价，且如前所述可能再偏一天 |
| b | **无新鲜度/异常值校验** | `saveLatest` 不做「新价 vs 旧价」跳变检查。供应商偶发的错误报价（如 10 倍误差）会被直接接受并污染估值 |
| c | **同日覆盖语义** | `upsert` 按 `(symbol, 日)` 唯一。同一天多次运行（手动 + 定时）后写的覆盖先写的，但**不记录覆盖历史**，事后无法知道当天最终值是第几次采到的 |
| d | **`getLatestPrices` 逐 symbol 查询** | N 个 symbol 就是 N 次 `findOne`，用 `Promise.all` 并发。持仓多时是 N 次 RTT；可用一次 `$group` 聚合（`getTodayLatest` 已是这种写法，两处口径不一致） |
| e | **两处「取最新价」实现不同** | `getLatestPrices`（逐个 findOne，无日期限制）vs `price.service.getTodayLatest`（aggregate，限定今天）。前者可返回任意旧价，后者只返回今天的。同一概念两种语义 |
| f | **历史回补与日常同步写入不同键** | `historySync` 走 `fetchHistory` → 裸码；`dailySync` 走 `fetchLatest` → `.CN`。这正是 P0-1 两套序列的来源 |

---

## 第三部分：优先级建议

| 优先级 | 问题 | 建议动作 | 是否代码层 |
|---|---|---|---|
| **P0** | P0-1 symbol 双轨（27/29 基金无价） | 加**统一归一化层**（`normalizeSymbol`：strip `.cn/.SS/.SZ` + upper），在 `priceStorage` 写入、`getLatestPrices` 读取、`asset` 建档三处共用；然后做一次数据迁移合并两套序列。⚠️ **2026-11-17 更新**：建议中「strip→裸码」的目标格式已被 [ADR-003](./adr/ADR-003-symbol-suffix-contract.md) 否决并反转为「按 market 派生大写后缀」，本行保留原审阅建议作为历史记录，实施以 ADR-003 为准 | 是 |
| **P0** | P0-2 完整性检查空转 | 回填 44 个资产的 `launchDate`；并把「`skippedCount === totalCount`」视为**失败**而非 `SUCCEEDED` | 是 + 数据 |
| **P0** | **P0-3 采集日期错位 + 同日覆盖** | 把采集时刻改到「各市场收盘后」（或按市场分别调度）；归桶改用**市场本地日**而非全局 ET；同日多次采集保留历史而非覆盖 | 是（需迁移） |
| **P0** | **P0-4（2026-11-17 补充）今日行情客户端查找端未归一化** | `Today.jsx` 归并价格与查表两端均使用原始 symbol，与库中 `.CN`/裸码口径不一致 → 29 个基金显示「无数据」；随 TASK-073 的统一归一化契约一并根治，但客户端可先做局部止血 | 是（client） |
| **P1** | P1-5 旧价无告警 | 加「最新价格距今 > N 个交易日 → 告警」；`getLatestPrices` 返回 `{price, timestamp, stale}` 而非裸数字 | 是 |
| **P1** | P1-3 `SUCCEEDED` 语义透支 | `TaskRun.status` 增 `SKIPPED`（ARCHITECTURE §8 债 #5 已列）；或按 `successCount` 细分 `NO_DATA` / `PARTIAL` | 是 |
| **P1** | P1-4 result 契约缺失 | `dailySync` 显式把 `skippedCount` 放进 `result`，并确认 `normalizeCounts` 白名单保留 | 是 |
| **P2** | P2-6 无熔断 + 错误压平 | 单 provider 连续失败达阈值即短路本轮剩余资产；`classifyMarketDataError` 保留 `status` 与原始报文 | 是 |
| **P2** | P2-7 NOT_FOUND 长期静默 | 连续 N 天 `NOT_FOUND` → 提示用户确认 symbol 或停用；不要把该资产计入「币种桶必为 null」的连带损失 | 是 |
| **P2** | P2-8 归桶时区 | 与 **P0-3 合并处置**：改为按市场本地日归桶 | 是（需迁移） |
| **P3** | P3-9 a/b/c/d/e/f | 逐条评估；其中 b（异常值校验）与 e（统一取最新价口径）建议优先于其余 | 是 |

---

## 附录 A：本次审阅的验证方式

- **代码**：通读 `dailySync` / `priceFetch` / `priceStorage` / `marketData` / `price.service` / `integrityCheck` / `historySync` / 三个 Fetcher / `marketTime` / `calendar.service` / `taskRunner` / `retry` / `cronScheduler`。
- **数据**：先执行 `npm run sync:db`（`portomind` → `portomind_dev`，15 集合 / 81432 文档，`_id` 哈希逐一校验一致），再对同步后的开发库执行**只读**查询：资产 44 条、价格 80579 条、`taskruns` 411 条（含 `daily-price-sync` / `price-integrity-check` 逐日记录）、`transactions` 50 条及其持仓 symbol 分布。
- **未做**：未实际触发采集（无本地 `mongod`，且不应向生产数据源发请求）；未修改任何业务数据；未改任何 Task 卡 / AC / Status。
- **可复核**：每条「现象」都附实测数字（条数、日期、状态、分类计数、`durationMs`、ObjectId 写入时刻），可同名查询复现。

## 附录 B：修订记录（2026-11-15，同日）

初版基于**未同步的旧 dev 库**（最新价格停在 10-29），本版在 `npm run sync:db` 之后重做全部数据核对。差异如下：

| # | 初版结论 | 本版结论 | 性质 |
|---|---|---|---|
| 1 | 「数据已停更 17 天」（10-29 → 11-15） | **撤回**。真实库最新到 11-12，落后 3 天；cron-worker 每日正常运行 | **错误结论**，主因是用旧库 |
| 2 | 「停更可能是 cron-worker 未运行」 | **撤回**。TaskRun 显示 11-03~11-15 每天都有任务执行 | **错误推测** |
| 3 | P2-8 称「场外基金不受时区问题影响」 | **修正**。场外基金同样受影响，且是 P0-3 的主要受害面 | **判断错误** |
| 4 | — | **新增 P0-3**：采集成功但 42/42 写进前一天桶（11-13 → 11-12 桶），已造成同日覆盖 | **新增发现** |
| 5 | P0-1、P0-2 | **维持**。在真实库上完全复现（27/29 无价、44/44 launchDate 为空） | 确认成立 |
| 6 | P1-3、P1-4、P2-6、P2-7 | **维持并补强**。用同步后数据更新了日期与耗时 | 确认成立 |

**教训**：判断「dev 库是否可信」本身是审阅的一部分，不能当作既定前提。本次因未先跑 `sync:db`，导致一条错误结论（停更 17 天）进入初版，且遗漏了 P0-3。

> 本文档为审阅记录，**不构成任何任务的验收结论，也不构成合入许可**。

## 附录 C：2026-11-17 补充 —— P0-4 今日行情客户端查找端未归一化

> 本附录为审阅后续发现，**不是 2026-11-15 审阅基线的一部分**；由 Human 在讨论中提供现象、Planner 亲读源码校正根因后补记。对应任务：[TASK-075](../../development/tasks/completed/TASK-075-today-symbol-case-mismatch.md)。

**现象**（Human 用真实列表算法模拟 + 页面观察）：今日行情列表 44 个资产中仅 15 个命中价格，**29 个 CN-FUND 显示「近 14 天无数据 · 缺口」**；这 29 个基金在库里（11-12 桶）全有价，只是 key 大小写/后缀对不上。

**代码根因（Planner 2026-11-17 亲读校正）**：`client/src/pages/Prices/Today.jsx` 的 `loadPriceWindow` 归并时 `acc.get(row.symbol)` / `acc.set(row.symbol, …)`（:54/:57）与查表 `priceWindow.latestBySymbol.get(asset.symbol)`（:117）**两端都用原始 symbol**，没有任何归一化。库中 `prices.symbol` 为 `001180.CN` 或裸码 `001180`，而 `assets.symbol` 为 `001180.cn`（小写后缀）→ 精确匹配失败。

> ⚠️ **更正**：讨论中曾描述为「存时 uppercase、查时没 uppercase」。亲读确认**两端都没有 uppercase**——现象与 29 个受害资产不变，但根因是"两端均未归一化"，不是"单边漏做"。以本附录为准。

**与 P0-1 的关系**：同根（无统一归一化层）但**不同的第三个消费端**——P0-1 是服务端 `getLatestPrices`（27/29 无价），本条是客户端列表（29/44 无数据）；价格同步卡片服务端两端都 uppercase 因此 29/29 命中，三页面表现不一致正是"每个消费者各实现一半"的确证。根治须与 [TASK-073](../../development/tasks/completed/TASK-073-price-pipeline-p0-data-correctness.md) 的统一归一化契约对齐，避免客户端另起一份口径。
