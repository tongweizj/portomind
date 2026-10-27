# 数据模型参考（DATA_MODEL）

> 受众：**开发者**（改模型 / 写查询）、**排障者**（判断某个字段为什么是 null、为什么重复写不进去）。
> 覆盖：`shared/models/` 下全部模型的**字段、枚举、默认值、索引、写入约束**，以及跨模型引用关系。
> 不覆盖：业务流程与口径（→ [product/lines/](../product/lines/)）、HTTP 接口（→ [API_CONTRACT.md](./API_CONTRACT.md)）、连接串与备份（→ [DEPLOYMENT.md](../manual/DEPLOYMENT.md)）。
> 本文件落在 `docs/dev/`，与 [API_CONTRACT.md](./API_CONTRACT.md)、[CRON_WORKER_DEV.md](./CRON_WORKER_DEV.md) 同属「开发视角的技术文档」。

> **权威性声明**：本文件是 `shared/models/*.js` 的**派生视图**，不是定义。字段冲突时以代码为准，并回来修本文件。改模型必须同步改这里（`DOCS.md §3.2`：配置与行为描述必须与代码对账）。

---

## 1. 使用约定

**唯一实现**：模型只在 `shared/models/` 定义一份，`server` 与 `cron-worker` 引用同一份——字段与索引不存在第二处定义。

**跨包引用必须带包名**（不要写相对路径穿越 workspace）：

```js
const Asset = require('@portomind/shared/models/asset');
```

**`shared/models/index.js` 不是模型注册表**——它只导出 `db.mongoose` 与 `strictQuery` 设置，不含任何模型。逐个 model 单独 require。

**`strict` 未显式关闭** → mongoose 默认 `strict: true`：**写入未在 schema 中声明的字段会被静默丢弃，不报错**。这是本系统最容易踩的坑，见 §5。

---

## 2. 模型总览

| 模型 | 集合职责 | 关键唯一索引 | 归属产品线 |
|---|---|---|---|
| **Asset** | 标的（资产）主数据 | `symbol` | [PL-1](../product/lines/PL-1-ledger.md) |
| **Transaction** | 交易流水（唯一事实来源） | 无（两条复合查询索引） | [PL-1](../product/lines/PL-1-ledger.md) |
| **Price** | 标的日价格 | `{symbol, timestamp}` | [PL-2](../product/lines/PL-2-market-data.md) |
| **Valuation** | 指数估值分位 | `{indexCode, metric, date}` | [PL-2](../product/lines/PL-2-market-data.md) |
| **Portfolio** | 组合（记账单元 + 目标配置） | 无 | [PL-3](../product/lines/PL-3-portfolio.md) |
| **RebalanceRecord** | 再平衡建议与执行记录 | 无 | [PL-4](../product/lines/PL-4-rebalancing.md) |
| **AlertRule** | 提醒规则（含外部信号登记） | 无（三条查询索引） | [PL-5](../product/lines/PL-5-alerting.md) |
| **AlertEvent** | 提醒事件（审计，不可删） | 无（三条查询索引） | [PL-5](../product/lines/PL-5-alerting.md) |
| **FxRate** | 外币兑 CNY 汇率 | `{currency, date}` | [PL-6](../product/lines/PL-6-household.md) |
| **TaskRun** | 定时任务运行记录 | `{taskName, runKey}` | [PL-0](../product/lines/PL-0-platform-foundation.md) |

---

## 3. 引用关系

```text
Asset ──symbol──┬──> Transaction（快照：assetType/market/currency 冗余落库）
                ├──> Price（symbol 大写）
                └──> AlertRule.symbol

Portfolio ──_id──┬──> Transaction.portfolioId
                 ├──> RebalanceRecord.portfolioId
                 ├──> AlertRule.portfolioId（可空）
                 └──> AlertEvent.portfolioId（可空，冗余便于筛选）

RebalanceRecord ──executedTransactionIds[]──> Transaction（执行后回写的内部交易）
                └─sourceRecordId────────────> RebalanceRecord（re-execute 的来源记录）

AlertRule ──_id──> AlertEvent.ruleId（**可空**：再平衡通知没有对应规则）
```

**三条必须知道的引用事实**：

1. **Asset 与 Transaction 不靠外键约束，靠 `symbol` 字符串匹配**（MongoDB 无外键）。改资产代码不会级联改交易，反之亦然——**symbol 写法不一致会让下游静默查不到**（见 §5.1）。
2. **`AlertEvent.ruleId` 可空**：`ruleId = null` 表示该事件由再平衡巡检直投（`RB-12`），不受 `AlertRule.active`/`cooldownDays` 管控。
3. **`Transaction` 冗余存了 `assetType`/`market`/`currency`**：这是**有意的快照**，不是规范化失误——历史交易必须按当时的市场/币种结算，资产主数据后续变更不得回溯影响已发生交易。

---

## 4. 逐模型字段

> 格式：`字段: 类型[约束] = 默认值`。`required` 即必填。`ObjectId` 均带 `ref`。

### 4.1 Asset（`shared/models/asset.js`）

| 字段 | 定义 |
|---|---|
| `symbol` | String，required，**unique**，trim，uppercase，1–32 字符，正则 `/^[A-Z0-9][A-Z0-9._-]*$/` |
| `name` | String，required，trim，≤120 |
| `market` | String，required，enum `US`/`CA`/`CN-SH`/`CN-SZ`/`CN-FUND`/`HK` |
| `currency` | String，required，enum `USD`/`CAD`/`CNY`/`HKD` |
| `type` | String，required，enum `stock`/`etf`/`fund`/`bond`/`cash` |
| `assetClass` | String，enum `equity`/`bond`/`gold`/`cash` **或 `null`**，= `null`（未分类） |
| `tags[]` | [String]，每项 trim、≤40，= `[]` |
| `launchDate` | Date，可空。**不填会被完整性检查跳过**（`SKIPPED_NO_LAUNCH_DATE`） |
| `active` | Boolean，= `true`。false = 不可用于交易与行情同步 |
| `watchlist` | Boolean，= `false`。**仅展示偏好，不代表可用于业务** |
| `createdAt` | Date，= now，**immutable** |

- 索引：`{symbol: 1}` unique（由 `unique: true` 隐式建立，无显式 `index()`）。
- `assetClass` 的 enum 必须显式包含 `null`，否则「未分类」写不进去。
- `type`（证券类型）与 `assetClass`（大类）**正交**：黄金 ETF 是 `type=etf` + `assetClass=gold`。

### 4.2 Portfolio（`shared/models/portfolio.js`）

| 字段 | 定义 |
|---|---|
| `name` | String，required |
| `description` | String |
| `type` | String，enum `活钱`/`稳健`/`长期`，= `稳健` |
| `currency` | String，enum `CNY`/`CAD`/`USD`，= `CAD` |
| `accountType` | String，enum `tiantian`/`xueqiu`/`tfsa`/`rrsp`/`resp`/`taxable`/`other`，= `other` |
| `archived` | Boolean，= `false`。**归档 ≠ 删除**：数据全留，默认列表与 AUTO 调度排除 |
| `targets[]` | `{symbol: String required trim, targetRatio: Number required 0–100, level: String enum asset/asset_class = asset}` |
| `rebalanceSettings` | 子文档，`_id: false`，见下 |
| `createdAt` | Date，= now（**无 `updatedAt`**：本 schema 未启用 timestamps） |

`rebalanceSettings` 子文档：

| 字段 | 定义 |
|---|---|
| `absoluteDeviation` | Number，= `5`（绝对偏离阈值，%） |
| `relativeDeviation` | Number，= `10`（相对偏离阈值，%） |
| `timeInterval` | Number，= `60`（时间间隔阈值，天） |
| `rebalanceSchedule` | String，required，enum `daily`/`weekly`/`monthly`，= `daily` |

- **无索引**（组合数量级为个位数，全表扫可接受）。
- `type`（风险定位）与 `accountType`（真实载体）**正交**，不要合并。
- `targets` 混合模式禁止：存在任一 `level='asset_class'` 则必须全部为 `asset_class`（由 `validateTargets.normalizeTargets` 校验；故 schema 内**不做 uppercase**，大小写按 level 在业务层规范化）。
- `Portfolio` 未启用 mongoose `timestamps`，但 `rebalanceSettings` 有默认值工厂，存量文档缺该字段时读取会得到默认值——注意这与「已落库的旧值」无法区分。

### 4.3 Transaction（`shared/models/transaction.js`）

| 字段 | 定义 |
|---|---|
| `portfolioId` | ObjectId → Portfolio，required，`index: true` |
| `assetType` | String，required，enum 同 Asset.type |
| `symbol` | String，required，trim，**uppercase** |
| `market` | String，required，enum 同 Asset.market |
| `currency` | String，required，enum 同 Asset.currency |
| `action` | String，required，enum `buy`/`sell`/`div_cash`/`div_reinvest` |
| `quantity` | Number，required，`min: Number.EPSILON`（> 0） |
| `price` | Number，required，`min: Number.EPSILON`（> 0） |
| `fee` | Number，= `0`，min 0。买入计入成本、卖出从净得扣除 |
| `date` | Date，required，= now。**业务日期**，决定持仓重放的顺序 |
| `notes` | String，trim，≤500 |
| `createdAt` / `updatedAt` | 由 `timestamps: true` 自动维护 |

- 索引：`{portfolioId: 1, date: -1, _id: -1}`（组合内倒序列表）、`{portfolioId: 1, symbol: 1, date: 1, _id: 1}`（组合内单标的重放）。
- **无唯一索引**：允许同一 `(portfolioId, symbol, date, action, quantity, price)` 重复落库。CSV 导入的幂等**不靠数据库约束**，靠业务层判重（当前实现有缺陷，见 §5.2）。
- `action` 语义：`div_cash` 进现金不进持仓；`div_reinvest` 转增持仓且成本含费。

### 4.4 Price（`shared/models/price.js`）

| 字段 | 定义 |
|---|---|
| `symbol` | String，required，trim，uppercase，≤32 |
| `name` | String，trim（冗余，便于展示） |
| `price` | Number，required，min 0 |
| `currency` | String，trim，uppercase |
| `market` | String，trim，uppercase |
| `timestamp` | Date，required，= now |

- 索引：`{symbol: 1, timestamp: 1}` **unique**（同一标的同一时刻只留一条）；`{timestamp: -1, symbol: 1}`（按日取全市场）。
- `timestamp` 是 **UTC Date**；「属于哪个交易日」由 `MARKET_TIMEZONE` 在业务层解释，**不在模型里存市场日字段**。
- **唯一键是 `(symbol, timestamp)` 而不是 `(symbol, 交易日)`**：同一交易日抓两次且时间戳不同，会落成两条。按日查询必须按区间取并自行取最新，不能假设一天一条。
- **无 `change` / `prevClose` 字段**：涨跌幅全部由客户端派生（相邻两条对比），这是有意设计，不是缺字段。

### 4.5 FxRate（`shared/models/fxRate.js`）

| 字段 | 定义 |
|---|---|
| `currency` | String，required，enum `USD`/`CAD`/`HKD`（**只有这三种**，CNY 不入库） |
| `rateToCny` | Number，required，`[0.000001, 100000]` |
| `date` | Date，required（市场日，不精确到时刻） |
| `source` | String，enum `er-api`/`manual`，= `er-api` |
| `note` | String，trim，≤200，= `''` |
| `createdAt` / `updatedAt` | `timestamps: true` |

- 索引：`{currency: 1, date: -1}` **unique** → 按 `(currency, date)` 幂等 upsert。
- **契约口径**：`rateToCny` 的语义是「**1 单位外币 = rateToCny 元人民币**」（如 1 USD ≈ 7.2 CNY）。全部折算代码按此口径乘算。
- ⚠️ 采集端当前违反上述契约，见 §5.3。

### 4.6 Valuation（`shared/models/valuation.js`）

| 字段 | 定义 |
|---|---|
| `indexCode` | String，required，trim，uppercase，≤12 |
| `indexName` | String，trim，≤60，= `''` |
| `metric` | String，required，enum `pe`/`pb` |
| `value` | Number，required，min 0 |
| `percentile` | Number，required，0–100 |
| `date` | Date，required |
| `source` | String，enum `manual`/`external`，= `manual` |
| `note` | String，trim，≤200，= `''` |
| `createdAt` / `updatedAt` | `timestamps: true` |

- 索引：`{indexCode: 1, metric: 1, date: -1}` **unique**。
- `percentile` 是**用户手填/外部抄录**的历史分位，不是本系统自算 —— 系统不持有历史估值序列，无法反推。
- 服务 `AlertRule.ruleType='valuation_percentile'` 的评估输入。

### 4.7 RebalanceRecord（`shared/models/rebalanceRecord.js`）

| 字段 | 定义 |
|---|---|
| `portfolioId` | ObjectId → Portfolio，required |
| `timestamp` | Date，= now（**与 `createdAt` 重复**，历史遗留字段，保留勿删） |
| `mode` | String，required，enum `AUTO`/`MANUAL` |
| `suggestions[]` | [Mixed]，required。元素格式由 `suggestionGenerator` 决定，**schema 不约束** |
| `status` | String，enum `PENDING`/`EXECUTED`/`REVOKED`，= `PENDING` |
| `triggeredThresholds[]` | [String]，= `[]`。命中的阈值类型（如 `absolute`/`relative`/`time`） |
| `thresholdDetails[]` | [Mixed]，= `[]`。逐标的 target/current/绝对偏离/相对偏离 |
| `warnings[]` | [String]，= `[]` |
| `feeModel` | Mixed，= `{}` |
| `cashBudget` | Number，= `0`，min 0 |
| `funding` | Mixed，= `{}` |
| `classMode` | Boolean，= `false`。true = 建议由大类目标摊分生成（CM-08） |
| `executedTransactionIds[]` | [ObjectId → Transaction]。执行后回写的内部交易 |
| `reversalTransactionIds[]` | [ObjectId → Transaction]。撤销时生成的反向交易 |
| `sourceRecordId` | ObjectId → RebalanceRecord，= `null`。re-execute 的来源 |
| `executedAt` / `revokedAt` | Date，= `null` |
| `createdAt` / `updatedAt` | `timestamps: true` |

- **无索引**：按 `portfolioId + timestamp` 查历史，组合级数据量小。
- `suggestions` / `thresholdDetails` / `feeModel` / `funding` 全是 `Mixed`：**改动其内部结构不会触发 mongoose 校验，也不会报错**。改这些结构的成本全在调用方，务必同步改读取方。

### 4.8 AlertRule（`shared/models/alertRule.js`）

| 字段 | 定义 |
|---|---|
| `scope` | String，required，enum `asset`/`portfolio` |
| `portfolioId` | ObjectId → Portfolio，= `null` |
| `symbol` | String，trim，uppercase，= `''` |
| `name` | String，required，trim，≤120 |
| `ruleType` | String，required，enum `price_above`/`price_below`/`gain_loss_pct`/`drift_exceed`/`signal`/`high_52w`/`low_52w`/`valuation_percentile` |
| `params` | Mixed，= `{}`。按 `ruleType` 定形状，见下 |
| `direction` | String，enum `buy`/`sell`/`hold`，= `null`（`signal` 必填） |
| `reason` | String，trim，≤500，= `''`（`signal` 的理由摘录） |
| `validUntil` | Date，= `null`。过期后由评估引擎置 `active=false`（非物理删） |
| `cooldownDays` | Number，= `7`，0–365。0 = 仅同日幂等去重 |
| `active` | Boolean，= `true` |
| `createdAt` / `updatedAt` | `timestamps: true` |

`params` 按规则类型：

| ruleType | params 形状 | 触发条件 |
|---|---|---|
| `price_above` / `price_below` | `{threshold: Number}` | **严格**大于/小于（等于不触发） |
| `gain_loss_pct` | `{pct: Number}` | 正 = 浮盈超 pct%；负 = 浮亏超 \|pct\|% |
| `drift_exceed` | `{drift: Number}` | 组合偏离超阈值（复用 `thresholdChecker` 口径） |
| `signal` | 无（用 `direction` + `reason`） | 有效期内常显，不「触发」 |
| `high_52w` / `low_52w` | `{lookbackDays?: Number = 365}` | 严格突破区间极值 |
| `valuation_percentile` | `{indexCode, metric: pe\|pb, threshold: 0–100, direction: above\|below}` | 读 `Valuation` 判定 |

- 索引（均非唯一）：`{active:1, ruleType:1}`、`{portfolioId:1, active:1}`、`{symbol:1, active:1}`。
- **`ruleType` 全部是价格/估值类**，没有「数据陈旧」「任务连续失败」——数据质量类告警当前无法通过本模型表达（见 §5.4）。

### 4.9 AlertEvent（`shared/models/alertEvent.js`）

| 字段 | 定义 |
|---|---|
| `ruleId` | ObjectId → AlertRule，**= `null`**（null = 再平衡直投，无规则） |
| `portfolioId` | ObjectId → Portfolio，= `null`（冗余，便于筛选与跳转） |
| `symbol` | String，trim，uppercase，= `''` |
| `level` | String，enum `info`/`warning`/`action`，= `info` |
| `title` | String，required，trim，≤200 |
| `content` | String，trim，≤1000，= `''` |
| `snapshot` | Mixed，= `{}`。触发时的价格/成本/漂移快照 |
| `triggeredAt` | Date，= now |
| `status` | String，enum `unread`/`read`/`dismissed`，= `unread` |
| `createdAt` / `updatedAt` | `timestamps: true` |

- 索引（均非唯一）：`{status:1, triggeredAt:-1}`、`{ruleId:1, triggeredAt:-1}`、`{portfolioId:1, status:1}`。
- **事件不可删除**（审计要求），只能改 `status`。
- `snapshot` 是 `Mixed`：结构随规则类型变化，前端读取时必须做空值兜底。
- **无 TTL 索引**：事件表只增不减（见 §5.5）。

### 4.10 TaskRun（`shared/models/taskRun.js`）

| 字段 | 定义 |
|---|---|
| `taskName` | String，required，trim。**必须稳定**，是防重键的一半 |
| `runKey` | String，required，trim。防重键的另一半（通常含市场日/组合 id） |
| `trigger` | String，enum `SCHEDULED`/`MANUAL`，= `SCHEDULED` |
| `status` | String，enum `RUNNING`/`SUCCEEDED`/`PARTIAL`/`FAILED`，= `RUNNING` |
| `startedAt` | Date，required |
| `endedAt` | Date |
| `durationMs` | Number |
| `totalCount` / `successCount` / `failureCount` | Number，= `0` |
| `failures[]` | `{item, category, provider, retryable, message}`，`_id: false` |
| `createdAt` / `updatedAt` | `timestamps: true` |

- 索引：`{taskName: 1, runKey: 1}` **unique**（两层防重的第二层）；`{startedAt: -1, taskName: 1}`（按时间倒序巡检）。
- **语义边界**：`successCount` 计的是「处理动作调用成功」，**不等于「有新数据入库」**——见 §5.6。
- 契约细节（runKey 构造、四态含义、退出码）的唯一归属是 [CRON_WORKER_DEV.md §5](./CRON_WORKER_DEV.md)，此处不重复。

---

## 5. 已知契约缺口（改之前先读这一节）

> 以下均为**当前代码的真实状态**，不是待办清单。每条标注了影响面，避免被当成「已修」。

### 5.1 `symbol` 写法不统一（P0，影响跨表 join）

`Asset.symbol` 与 `Price.symbol` 存的是裸代码（如 `000191`），而部分 `Transaction.symbol` / `Portfolio.targets[].symbol` 带市场后缀（如 `000191.cn`）。模型层两者都合法（`uppercase` 不会加/去后缀），**没有任何约束保证一致**。

后果：`suggestionGenerator` 按 `000191.CN` 查 `Price` 恒失败 → 相关组合的再平衡每日 `FAILED`。查任何「资产 ↔ 交易 ↔ 价格」关联时，**不要假设 symbol 可直接相等比较**。

### 5.2 CSV 导入幂等不靠数据库

`Transaction` 无唯一索引，导入判重依赖业务层查询。当前该查询漏取 `portfolioId`（`transaction.service.js` 的 `select()`），导致判重键恒为 `undefined` → 重复导入不报错、也不跳过。

**含义**：不能因为「导入成功」就认为没有重复数据。核对重复须自行按 `(portfolioId, symbol, date, action, quantity, price)` 分组统计。

### 5.3 `FxRate.rateToCny` 方向与采集端不一致（High，已立项 TASK-051）

模型注释与全部折算代码的口径是「1 外币 = `rateToCny` CNY」。但采集端取的是「1 CNY = X 外币」的报价直接写入 → USD/CAD 被严重低估、HKD 被高估。

**含义**：读 `FxRate` 时不能假定 `rateToCny` 一定 > 1；家庭折算结果在修复前不可作为真值使用。修复方式（改采集端还是改口径）仍在裁决，**先不要在此基础上叠加新逻辑**。

### 5.4 数据质量类告警无法表达

`AlertRule.ruleType` 的 8 个枚举全是价格/估值类。**「某市场数据陈旧」「任务连续失败」这两类最需要的告警，当前没有模型承载**。要做只能新增 `ruleType`（或另建模型），不能靠现有枚举凑。

### 5.5 日志类集合无保留策略

`TaskRun` 与 `AlertEvent` 都没有 `expireAfterSeconds`。`AlertEvent` 还有「不可删除」的审计约定，两者叠加意味着**集合无限增长**。做聚合统计时必须带时间范围，不要写全表聚合。

### 5.6 `TaskRun` 缺两类关键字段

1. **无 `result` 字段**：运行结果明细无法落库（`strict: true` 会静默丢弃，不报错）。当前只保留 `normalizeCounts()` 白名单内的 `total/success/failure/failures`。
2. **`status` 无 `SKIPPED`**：跳过（如未到期、非交易日）时只 return、不落库，也没有状态值可表达。

**含义**：`SUCCEEDED` 必须读成「**跑完且没有异常抛出**」，不能读成「有数据更新」。做状态看板 / 数据新鲜度判断时，必须另取 `Price.timestamp` 或 `taskName` 专属业务字段交叉验证。

### 5.7 `Mixed` 字段无 schema 校验

`RebalanceRecord.suggestions`、`AlertEvent.snapshot`、`AlertRule.params` 等 6 处是 `Mixed`：写错结构不会报错，读的时候才炸。改动这些结构必须**同一提交内改完全部读取方**。

---

## 6. 常用查询模式

按索引设计，以下写法才走索引；换写法会全表扫。

| 需求 | 写法要点 |
|---|---|
| 组合内交易列表（分页） | `find({portfolioId}).sort({date:-1, _id:-1})` —— 命中第一条复合索引，`_id` 参与排序以保证分页稳定 |
| 单标的持仓重放 | `find({portfolioId, symbol}).sort({date:1, _id:1})` —— 命中第二条复合索引，`_id` 保证同日多笔顺序确定 |
| 某日全市场行情 | `find({timestamp: {$gte, $lt}})` —— 命中 `{timestamp:-1, symbol:1}`；**必须用区间**，不能等值 |
| 单标的行情序列 | `find({symbol}).sort({timestamp:1})` |
| 汇率取最新 | `findOne({currency}).sort({date:-1})` —— 命中 unique 索引 |
| 任务防重 | 依赖 `{taskName, runKey}` unique 索引的 E11000，不要先查再写（有并发窗口） |
| 未读提醒数 | `countDocuments({status:'unread'})` —— 命中 `{status:1, triggeredAt:-1}` 前缀 |

---

## 7. 相关文档

- [API_CONTRACT.md](./API_CONTRACT.md) — 这些模型对外暴露成什么接口
- [CRON_WORKER_DEV.md](./CRON_WORKER_DEV.md) — `TaskRun` 契约（taskName / runKey / 四态 / 退出码）的唯一归属
- [CLIENT_DEV.md](./CLIENT_DEV.md) — 前端如何消费这些字段
- [DEPLOYMENT.md](../manual/DEPLOYMENT.md) — 连接、备份与迁移
- [PL-1](../product/lines/PL-1-ledger.md) / [PL-2](../product/lines/PL-2-market-data.md) / [PL-3](../product/lines/PL-3-portfolio.md) / [PL-4](../product/lines/PL-4-rebalancing.md) / [PL-5](../product/lines/PL-5-alerting.md) / [PL-6](../product/lines/PL-6-household.md) — 各模型对应的业务口径
