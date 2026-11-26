# 数据模型参考（DATA_MODEL）

> 受众：**开发者**（改模型 / 写查询）、**排障者**（判断某个字段为什么是 null、为什么重复写不进去）。
> 覆盖：`shared/models/` 下全部模型的**字段、枚举、默认值、索引、写入约束**，以及跨模型引用关系。
> 不覆盖：业务流程与口径（→ [handbook/product/lines/](../product/lines)）、HTTP 接口（→ [API_CONTRACT.md](./API_CONTRACT.md)）、连接串与备份（→ [DEPLOYMENT.md](../ops/DEPLOYMENT.md)）。
> 本文件落在 `docs/handbook/technical/`，与 [API_CONTRACT.md](./API_CONTRACT.md)、[CRON_WORKER_DEV.md](./CRON_WORKER_DEV.md) 同属「开发视角的技术文档」。

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
| **TaskRun** | 定时任务运行记录 | `{taskName, runKey}`；活跃 `lockKey` 部分唯一 | [PL-0](../product/lines/PL-0-platform-foundation.md) |
| **User** | 登录账号（单租户多账号；`admin`/`member`） | `username` | [PL-0](../product/lines/PL-0-platform-foundation.md)（认证内核） |
| **Session** | 服务端会话（绝对 7 天 TTL，存 Mongo） | `sid` | [PL-0](../product/lines/PL-0-platform-foundation.md)（认证内核） |
| **SourceAccount** | 流水导入来源账户（TASK-094） | `{broker, accountKeyHash}`（部分唯一） | [PL-1](../product/lines/PL-1-ledger.md) |
| **ImportBatch** | 导入整批提交的锁与补偿记录（非长期历史） | 活跃 `lockKey` 部分唯一 | [PL-1](../product/lines/PL-1-ledger.md) |
| **TransferLeg** | 证券划转先到一端的服务端暂存（TASK-099，不进账本） | 无 | [PL-1](../product/lines/PL-1-ledger.md) |

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
| `launchDate` | 上市 / 成立日期，Date，可空。日期写入按 UTC 正午存储，使现有各市场本地日期相同。**不填会被价格完整性检查跳过**（`SKIPPED_NO_LAUNCH_DATE`） |
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
| `assetType` | String，enum 同 Asset.type；持仓类动作或有标的时 required |
| `symbol` | String，trim，**uppercase**；持仓类动作（`buy`/`sell`/`div_reinvest`/`split`）required，现金类可空（利息、划转、独立费用） |
| `market` | String，enum 同 Asset.market；持仓类动作或有标的时 required |
| `currency` | String，required，enum 同 Asset.currency。有标的为资产币种快照；无标的的现金流水为现金币种 |
| `action` | String，required，enum 见 `shared/constants/transaction.constants.js`：持仓类 `buy`/`sell`/`div_reinvest`/`split`/`transfer_out`/`transfer_in`（`split` 拆股，TASK-098；`transfer_*` 证券划转两端，TASK-099；均仅经流水导入写入）；现金类 `div_cash`/`tax`/`interest`/`cash_in`/`cash_out`/`fee`（TASK-097）、`fx`（TASK-101 换汇，每端一条，两端同 `pairGroupId`）；后五类及无数量的分红目前仅经导入写入 |
| `quantity` | Number，> 0（`split`：带符号份额变动，拆股为正、合股为负，非零）；持仓类动作 required，现金类可空 |
| `price` | Number，`min: Number.EPSILON`（> 0）；持仓类动作 required（`split` 除外，拆股不记单价），现金类可空 |
| `splitRatio` | Number，可选，> 0（TASK-098）：拆股比例 = 新份额 / 旧份额（1 拆 2 为 2，10 合 1 为 0.1）；已知时重放核对 `拆股前份额 ×(splitRatio−1) = quantity` |
| `fee` | Number，= `0`，min 0。买入计入成本、卖出从净得扣除 |
| `date` | Date，required，= now。**业务日期**，决定持仓重放的顺序。重放顺序 `(当地交易日, orderRank, date, 导入批次, sequence, _id)`（当地交易日：带时刻流水按其 `timeZone`（缺省 `MARKET_TIMEZONE`）取日历日，仅日期流水取存储的 UTC 日期；`positionCalculator.localTradeDay`）（`positionCalculator.compareTransactions`，预览 / 确认后重放 / 编辑共用；同一时刻手动流水在导入流水之前，字符串按码位比较） |
| `notes` | String，trim，≤500 |
| `sourceAccountId` | ObjectId → SourceAccount，可选（TASK-094：导入流水的来源账户） |
| `source` | 子文档，可选：`{kind:'import', format:'standard'\|'wealthsimple'\|'questrade', fileName, rowNumber, rowNumberKind:'original'\|'file', externalId(券商原成交编号，无则 null，从不合成), importBatchId, rawHash}` |
| `dateKind` | `datetime`（保留明确时刻，含午夜）/ `date`（仅日期，存当日 UTC 零点，同手动录入）；手动录入为空 |
| `timeZone` / `timeZoneSource` | 成交时刻所用 IANA 时区；来源 `report`（报表自带）/ `user`（报表有时间无时区，用户确认北京或多伦多，TASK-096）。仅日期精度不记录 |
| `settlementDate` / `settlementStatus` | 券商结算日（独立于成交日）；`known` / `unknown`（报表未提供，`settlementDate` 留空，不以成交日代替） |
| `cashAmount` / `cashCurrency` / `cashAmountSource` | 带符号现金净额（流入正、流出负）、实际现金币种（可与资产 `currency` 不同）、来源（`broker` 券商给出，保留分币差异 / `derived` 由数量 × 单价 ± 佣金推算）。现金类流水的金额即 `cashAmount` |
| `cashFxRate` | TASK-100：跨币种成交的报表汇率（1 资产币种 = `cashFxRate` 现金币种，如 Wealthsimple 美股以 CAD 结算）。`price` / `fee` / `grossAmount` 已按它换回资产币种（持仓成本保留资产币种），`cashAmount` 保持券商现金净额；同币种成交留空 |
| `feeSource` | `broker`/`derived`/`user`/`confirmed_zero`（佣金缺失不按 0 处理，需推算、补填或明确确认） |
| `grossAmount` | 数量 × 单价（无编号成交匹配字段，不含佣金与净额） |
| `pairGroupId` / `sequence` | 成对流水组号（TASK-101 换汇两端：报表 `pair_group` 原值，或建议 / 用户指定配对生成的 `fx-<hash>`；两端共同入账，单端不入账）；同一报表内原行顺序（时间正序），同一时刻同批次按此重放 |
| `orderRank` | Number，可选（TASK-096）：用户确认的同日先后，仅在同一当地交易日内生效（默认 0；确认「之前」为负、「之后」为正）。编辑改动成交日时清除 |
| `carryCost` / `carryCostCurrency` / `carryCostSource` / `transferFxRate` | TASK-099，仅 `transfer_in`：承接成本（转入资产原币种，重放时代替 `qty×price`）；来源 `report`（报表划转成本）/`carried`（同币种承接转出端移动平均成本）/`fx`（转出成本 × 换算依据）/`user`（用户补填）；换算依据 = 1 单位转出资产币种折合的转入资产币种 |
| `transfer` | TASK-099：`{direction:'out'\|'in', counterpartPortfolioId, counterpartSourceAccountId, stagedLegId?}`。两端以同一 `pairGroupId` 关联、同一 `source.importBatchId` 共同入账；`price` 为每单位成本快照（转出 = 转出前均价，转入 = 承接成本 / 份额），不参与重放 |
| `status` | `pending`/`committed`，仅导入写入。`pending` 行对全部读取方不可见（统一经 `shared/services/transaction/visibility.js`），手动录入与旧数据无此字段 |
| `createdAt` / `updatedAt` | 由 `timestamps: true` 自动维护 |

- 索引：`{portfolioId: 1, date: -1, _id: -1}`（组合内倒序列表）、`{portfolioId: 1, symbol: 1, date: 1, _id: 1}`（组合内单标的重放）；TASK-094 新增部分索引 `{sourceAccountId, source.externalId}`（**非唯一**：跨组合同编号须可被发现）、`{sourceAccountId, source.rawHash}`、`{source.importBatchId}`。
- **无唯一索引**：允许同一 `(portfolioId, symbol, date, action, quantity, price)` 重复落库。CSV 导入的幂等**不靠数据库约束**，靠业务层判重（当前实现有缺陷，见 §5.2）。
- `action` 语义：`div_reinvest` 转增持仓且成本含费；现金类（`div_cash`/`tax`/`interest`/`cash_in`/`cash_out`/`fee`/`fx`）不进持仓、不参与超卖重放，持仓计算直接跳过（现金余额核对见后续工单）。
- 划转语义（TASK-099）：`transfer_out` 按转出前均价减记数量与成本、不产生已实现盈亏、不得超过当时持仓；`transfer_in` 按 `carryCost` 增加数量与成本（缺 `carryCost` 报 `INVALID_CARRY_COST`，不猜成本）。划转流水不支持经 `PUT /api/transactions/:id` 编辑；单独删除一端会留下单边结果，需人工处理（已知限制）。
- `split` 语义（TASK-098）：份额按 `quantity` 变动、总成本与已实现盈亏不变、单位成本按新份额重算；拆股前须有持仓（否则重放报 `SPLIT_NO_POSITION`），比例与份额变动冲突或拆后份额不为正报 `SPLIT_RATIO_CONFLICT`（均为 `400`，删除 / 编辑使之后拆股失去依据的流水同样被拒）。

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
| `lockKey` | String，trim，= `undefined`（旧记录无该字段）。仅活跃（`status='RUNNING'`）时参与部分唯一索引；终态时由任务外壳 `$unset` 释放。**不进入 HTTP 契约** |
| `progress` | 子文档 `{completed:Number,total:Number,updatedAt:Date}`，= `undefined`。TASK-070 起带 `lockKey` 的活跃任务最多每 1 秒写一次心跳；旧记录无该字段。`updatedAt` 缺失时读侧以 `startedAt` 作为心跳 |
| `totalCount` / `successCount` / `failureCount` | Number，= `0` |
| `failures[]` | `{item, category, provider, retryable, message, status?, responseBody?}`，`_id: false`。行情请求有 HTTP 响应时可记录状态及最多 4096 字符的脱敏正文摘要。 |
| `result` | `Mixed`，可空。写侧形状见 [CRON_WORKER_DEV.md §5.5](./CRON_WORKER_DEV.md#55-result-字段与跳过观测task-057)；读侧缺失表示契约未就绪，不得折算为 0 |
| `createdAt` / `updatedAt` | `timestamps: true` |

- 索引：`{taskName: 1, runKey: 1}` **unique**（防重键）；`{startedAt: -1, taskName: 1}`（按时间倒序巡检）；`{lockKey: 1}` **unique partial**，`partialFilterExpression: {status:'RUNNING', lockKey:{$type:'string'}}`（`taskrun_active_lock_unique`，TASK-070 跨进程互斥）。
- **锁语义**：只约束活跃且带锁的任务；终态记录即使残留 `lockKey` 也不参与唯一约束，正常路径仍会 `$unset` 释放。旧记录没有 `lockKey`，无需迁移。stale 只由读侧按心跳判定，不自动释放；下一次触发才会条件恢复过期运行（置 `FAILED`、`runKey=interrupted:<id>`、释放锁）后创建新运行。`runKey` 的稳定契约以正常记录为准；`interrupted:*` 是恢复专用的审计改键，必须以 `runId` 关联原运行。
- **语义边界**：`successCount` 计的是「处理动作调用成功」，**不等于「有新数据入库」**——见 §5.6。
- 契约细节（runKey 构造、四态含义、退出码、result 形状）的唯一归属是 [CRON_WORKER_DEV.md §5](./CRON_WORKER_DEV.md)，此处不重复。

---

### 4.11 User（`shared/models/user.js`，TASK-058 U1）

| 字段 | 定义 |
|---|---|
| `username` | String，required，unique，**lowercase**，trim，3–32；`match: /^[a-z0-9][a-z0-9_.-]{2,31}$/`（ED-4：登录时同样先归一化） |
| `passwordHash` | String，required，**`select:false`**（只有登录校验/改密/重置显式 `select('+passwordHash')`）；bcryptjs cost 10 |
| `role` | String，enum `admin`/`member`，= `member` |
| `active` | Boolean，= `true`（用户只停用不删除，FS NG8） |
| `mustChangePassword` | Boolean，= `false`；首部署 seed / 管理员建号 / 重置密码后为 `true`，硬拦截业务端点（403 `PASSWORD_CHANGE_REQUIRED`） |
| `lastLoginAt` | Date，= `null`（登录成功更新；本期唯一审计字段） |
| `createdAt` / `updatedAt` | `timestamps: true` |

- 索引：`{username: 1}` **unique**。
- 不变量：任意时刻至少一个 `active=true && role='admin'`；停用/降级唯一 admin → `409 LAST_ADMIN_PROTECTED`；管理员不能停用自己（`409 CANNOT_DEACTIVATE_SELF`），不能重置自己密码（`409 SELF_RESET_FORBIDDEN`，D9）。
- 业务模型**零改动**：账号与数据归属无关，不加 `ownerId`/`tenantId`（FS NG2）。

### 4.12 Session（`shared/models/session.js`，TASK-058 U1）

| 字段 | 定义 |
|---|---|
| `sid` | String，required，unique（服务端生成 32 字节随机数 base64url，即 cookie `pm_sid`） |
| `userId` | ObjectId ref `User`，required，index |
| `createdAt` | Date，= `Date.now`，**`expires: SESSION_TTL_DAYS*86400`**（全仓首个 TTL 索引，绝对过期；ED-3） |
| `lastSeenAt` | Date，= `Date.now`（**仅审计，不续期**） |
| `ip` / `ua` | String，= `null`（ua 截断 200） |

- 索引：`{sid:1}` unique；`{userId:1}`；`{createdAt:1}` TTL（Mongo 清理，最长延迟约 60s）。
- 停用用户 / 重置密码 / 本人改密（保留当前会话）→ `Session.deleteMany({userId})` / `{userId, sid:{$ne:current}}`；登出删除当前 `sid`。
- Cookie：`httpOnly` + `SameSite=Lax` + `Path=/` + 生产 `Secure` + `maxAge=TTL`（`COOKIE_SECURE` 可覆盖）。

---

### 4.13 SourceAccount（`shared/models/sourceAccount.js`，TASK-094）

| 字段 | 定义 |
|---|---|
| `broker` | enum `wealthsimple`/`questrade`/`other`（与 client `SOURCE_BROKERS` 同步） |
| `accountKeyHash` | `sha256(broker + ':' + 规范化账号)`；**不存完整账号**。无账号的来源为空 |
| `accountKeyLast4` | 账号末 4 位，仅展示 |
| `alias` | 用户别名，必填，≤60，可改，**不参与身份识别** |
| `accountType` | 报表中的账户类型（可选） |
| `portfolioIds` | 曾导入过的组合（信息记录；一个账户可关联多个组合，每笔流水仍只属一个组合） |

- 唯一索引：`{broker, accountKeyHash}`（`partialFilterExpression: accountKeyHash 为字符串`）。同账号跨批、跨组合识别为同一来源。
- 现金核对（TASK-103，`shared/services/transactionImport/cashReconciliation.js`）：按 `sourceAccountId` 读取跨组合可见流水，按 `cashCurrency` 分币种、按现金日期（成交用 `settlementDate`，`settlementStatus='unknown'` 的成交单列；现金类无结算日用活动日）归入期间；换汇两端按 `(source.importBatchId, pairGroupId)` 分组。期初 / 期末余额由请求提供，不落库，无新字段。接口见 [API_CONTRACT](API_CONTRACT.md)。

### 4.14 ImportBatch（`shared/models/importBatch.js`，TASK-094）

| 字段 | 定义 |
|---|---|
| `portfolioId` / `sourceAccountId` | 目标组合 / 来源账户 |
| `status` | `committing` → `committed` 或 `rolled_back` |
| `lockKey` | `portfolio:<id>`；仅 `committing` 期间存在，终态 `$unset` |
| `previewToken` / `ledgerFingerprint` | 本次确认核对过的预览凭据 |
| `parentBatchId` | TASK-099：跨组合划转共同入账时，对端组合的伴随锁指向主批次；随主批次终态一并释放 |
| `phase` | `flipped`：pending→committed 翻转已完成，之后的故障只向前补完暂存一端状态，不回滚 |
| `counts` / `updates` / `error` | 当次结果计数；更新类处置（TASK-095）改写前的原值 `[{transactionId, before, unset}]`（先写后改，回滚 / 崩溃回收时恢复）；失败原因 |

- 部分唯一索引 `{lockKey}`（`status:'committing'`）：同组合并发确认只有一个成功。
- 整批写入：新行先以 `status:'pending'` 写入，单语句翻转为 `committed`；失败即删除本批 pending 行并标 `rolled_back`；超过 10 分钟仍为 `committing` 的批次在下一次确认前回收。单机 MongoDB 无多文档事务，故采用应用层方案。
- 跨组合划转（TASK-099）：主锁之后按组合 id 顺序取对端伴随锁，任一被占 → `409 IMPORT_IN_PROGRESS`；两端流水同属一次翻转，不会单边可见。

### 4.15 TransferLeg（`shared/models/transferLeg.js`，TASK-099）

证券划转先到的一端（Human 决定：服务端暂存）。只存在于本集合，对任何账本读取方不可见。

| 字段 | 定义 |
|---|---|
| `portfolioId` / `sourceAccountId` | 该端的组合与来源账户（各端各自保留） |
| `direction` | `out` / `in` |
| `symbol` / `assetType` / `market` / `currency` | 资产快照（ADR-003 存储代码，资产原币种） |
| `quantity` / `date` / `dateKind` / `timeZone` / `timeZoneSource` / `settlementDate` / `settlementStatus` / `sequence` | 与导入流水同口径 |
| `pairGroup` | 报表配对组号（可选） |
| `transferCost` / `transferCostCurrency` / `transferFxRate` | 报表给出的转入成本与换算依据（转入端） |
| `source` | `{format, fileName, rowNumber, rowNumberKind, externalId, rawHash}`（重复导入识别用 `rawHash`） |
| `status` | `pending`（随批次写入中）→ `staged`（待核对）→ `consuming`（被某次确认占用）→ `committed`；或 `discarded`（用户放弃，需重新提供该端） |
| `stagedBatchId` / `consumedBatchId` / `transactionId` | 暂存批次 / 占用批次 / 共同入账后写入的账本流水 |

- 占用以条件更新 `staged → consuming` 实现，同一端只会被一次确认配对；失败回滚恢复为 `staged`。
- 索引：`{status, direction, date}`、`{stagedBatchId}`（部分）、`{consumedBatchId}`（部分）。

## 5. 已知契约缺口（改之前先读这一节）

> 以下均为**当前代码的真实状态**，不是待办清单。每条标注了影响面，避免被当成「已修」。

### 5.1 `symbol` 写法不统一（P0，影响跨表 join）

> **决策已定、迁移未完成**：[ADR-003](../../architecture/adr/ADR-003-symbol-suffix-contract.md)（`Accepted`，2026-11-17 Human 正式批准）已裁决目标格式为「按 `market` 派生大写后缀」（`001180.CN` / `VOO.US` / `600519.SS`），创建时由 market 自动派生、采集时按 `PROVIDER_SUFFIX` 去除/保留。**本段描述的是迁移前的当前代码状态；迁移完成（TASK-073 / TASK-075）后须更新为统一格式。**

`Asset.symbol` 与 `Price.symbol` 存的是裸代码（如 `000191`），而部分 `Transaction.symbol` / `Portfolio.targets[].symbol` 带市场后缀（如 `000191.cn`）。模型层两者都合法（`uppercase` 不会加/去后缀），**没有任何约束保证一致**。实测还有小写 `.cn` 与大写 `.CN` 并存（同一基金两套价格序列）。

后果：`suggestionGenerator` 按 `000191.CN` 查 `Price` 恒失败 → 相关组合的再平衡每日 `FAILED`。查任何「资产 ↔ 交易 ↔ 价格」关联时，**不要假设 symbol 可直接相等比较**。

### 5.2 CSV 导入幂等不靠数据库

`Transaction` 无唯一索引，导入判重依赖业务层查询。当前该查询漏取 `portfolioId`（`transaction.service.js` 的 `select()`），导致判重键恒为 `undefined` → 重复导入不报错、也不跳过。

> 新版预览 / 确认导入（TASK-094/095）的判重在 `shared/services/transactionImport/matching.js`：按 (组合, 来源账户, 方向) 以原成交编号或「时间戳 + 标的 + 数量 + 成交金额」匹配，差异与歧义进入人工核对；上述缺陷只影响旧版 `POST /api/transactions/import`。

**含义**：不能因为「导入成功」就认为没有重复数据。核对重复须自行按 `(portfolioId, symbol, date, action, quantity, price)` 分组统计。

### 5.3 `FxRate.rateToCny` 方向与采集端不一致（High，已立项 TASK-051）

模型注释与全部折算代码的口径是「1 外币 = `rateToCny` CNY」。但采集端取的是「1 CNY = X 外币」的报价直接写入 → USD/CAD 被严重低估、HKD 被高估。

**含义**：读 `FxRate` 时不能假定 `rateToCny` 一定 > 1；家庭折算结果在修复前不可作为真值使用。修复方式（改采集端还是改口径）仍在裁决，**先不要在此基础上叠加新逻辑**。

### 5.4 数据质量类告警无法表达

`AlertRule.ruleType` 的 8 个枚举全是价格/估值类。**「某市场数据陈旧」「任务连续失败」这两类最需要的告警，当前没有模型承载**。要做只能新增 `ruleType`（或另建模型），不能靠现有枚举凑。

### 5.5 日志类集合无保留策略

`TaskRun` 与 `AlertEvent` 都没有 `expireAfterSeconds`。`AlertEvent` 还有「不可删除」的审计约定，两者叠加意味着**集合无限增长**。做聚合统计时必须带时间范围，不要写全表聚合。

### 5.6 `TaskRun.result` 与跳过观测（TASK-057 已落地）

- `TaskRun.result` 为**可选** `Mixed`（写侧契约见 [CRON_WORKER_DEV §5.5](./CRON_WORKER_DEV.md#55-result-字段与跳过观测task-057)；本节只说明读侧口径，不复制字段表）。
- `result` 缺失 / `null` = 「契约未就绪 / 结果未知」，读侧**不得**当成 `{}` 后渲染成 0 缺口或全部正常。
- `TaskRun.status` 仍只有 `RUNNING/SUCCEEDED/PARTIAL/FAILED`，**没有 `SKIPPED`**；防重跳过写独立 `taskskips` 事件，不改写正在运行的 TaskRun。
- `taskskips` 事件字段：`{taskName,runKey,trigger,reason: ALREADY_RUNNING|DUPLICATE_RUN_KEY,skippedAt,activeRunKey?}`；索引 `{taskName:1,skippedAt:-1}`，无 TTL。读侧按 taskName 取**最新一条**作为可选 `lastSkip`。
- TASK-070 起 `price-integrity-check` 的 `result.assets[]` 保存资产级历史摘要（`status/expected/actual/missing/ratio` 与最多 20 段 `missingRanges`），供运维中心历史完整度回读；不保存原始价格序列。`GAP` 只表示检测到缺失交易日，不推断停采/停牌/供应商异常。
- TASK-071 起 `daily-price-sync` 的 `result.assets[]` 保存逐资产 `status(fetched/skipped/failed)`、`priceDate`（按 `MARKET_TIMEZONE` 归桶）、`reason`（休市/失败分类）；同样不保存原始价格序列。
- TASK-072 起 `asset-history-backfill` 的 `result` 保存资产、区间、expected/missingBefore/missingAfter/fetched、有界缺失区间与补采失败区间；不保存原始价格序列。
- TASK-074 起 `asset-history-backfill-batch` 的父 `result` 保存逐资产状态与汇总计数；未成功资产带 `reason`/`message`，父 `failures[]` 透传子任务真实原因；子任务沿用单资产 result。
- 跨进程互斥使用独立 `lockKey` 部分唯一索引，不改四态枚举，也不把锁编码成新的 `runKey`；详见 §4.10 与 [CRON_WORKER_DEV.md §4](./CRON_WORKER_DEV.md#4-防重与跨进程互斥)。

**含义**：`SUCCEEDED` 仍只能读成「跑完且没有异常抛出」，不能读成「有数据更新」；数据是否到位必须看 `result` 的业务摘要 + `Price.timestamp` 等事实字段交叉验证。

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
| 活跃任务互斥 | 依赖 `{lockKey:1}` partial unique 索引的 E11000；冲突后按 `lockKey + status:'RUNNING'` 查活跃运行。不要用普通查询做互斥 |
| 未读提醒数 | `countDocuments({status:'unread'})` —— 命中 `{status:1, triggeredAt:-1}` 前缀 |

---

## 7. 相关文档

- [API_CONTRACT.md](./API_CONTRACT.md) — 这些模型对外暴露成什么接口
- [CRON_WORKER_DEV.md](./CRON_WORKER_DEV.md) — `TaskRun` 契约（taskName / runKey / 四态 / 退出码）的唯一归属
- [CLIENT_DEV.md](./CLIENT_DEV.md) — 前端如何消费这些字段
- [DEPLOYMENT.md](../ops/DEPLOYMENT.md) — 连接、备份与迁移
- [PL-1](../product/lines/PL-1-ledger.md) / [PL-2](../product/lines/PL-2-market-data.md) / [PL-3](../product/lines/PL-3-portfolio.md) / [PL-4](../product/lines/PL-4-rebalancing.md) / [PL-5](../product/lines/PL-5-alerting.md) / [PL-6](../product/lines/PL-6-household.md) — 各模型对应的业务口径
