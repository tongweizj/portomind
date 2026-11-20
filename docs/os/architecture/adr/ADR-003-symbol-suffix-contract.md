# ADR-003 — symbol 统一契约：存储带大写后缀，采集按市场去除/保留

## Status

`Accepted`（2026-11-17，Human 正式批准后由 `Proposed` 转正）——本 ADR 曾因「依据采纳方向提前标记 Accepted」被回退为 `Proposed` 走正式流程；现 Human 已完成 review 并批准，口径成为既定架构约束。

Date:

`2026-11-17`（首次起草）

Decision Owner:

`Human Owner`（2026-11-17 正式批准：存储带大写后缀；HK 不补前导零、market 创建后不可变、后缀按 market 自动派生；US 内部后缀 `.US`）

Related Task:

`TASK-073`（归一化目标由「strip → 裸码」反转为本 ADR 口径）
`TASK-075`（客户端消费端对齐）

Related ExecPlan:

`未创建。TASK-073 因跨模块 + 数据迁移需 ExecPlan（见 TASK-073 §Metadata）；本 ADR 批准后按新口径成文。`

Supersedes:

`None`

Superseded By:

`None`

---

## 1. Context

`symbol` 是贯穿「资产建档 → 交易入账 → 每日采集 → 入库归桶 → 估值/提醒/再平衡」的唯一关联键（[PRICE-PIPELINE-REVIEW.md §1.1](../../architecture/PRICE-PIPELINE-REVIEW.md)），但仓库长期**没有归一化层**（[ARCHITECTURE.md §8 债 #4](../../architecture/ARCHITECTURE.md)）。2026-11 的独立审阅在同步后的真实库上实测到三种形态并存：

| 形态 | 实例 | 来源 |
|---|---|---|
| 小写后缀 `.cn` | `001180.cn / 015532.cn`（29 个 CN-FUND 资产） | 模型声明 `uppercase:true` 但历史数据未回填；DB 裸拷绕过 Mongoose setter |
| 大写后缀 `.CN` | `001180.CN`（仍在更新的日常价格序列） | `dailySync → fetchLatest`，写入侧 `toUpperCase()` |
| 裸码 | `001180`（停在 7 月的历史回补序列） | `historySync → fetchHistory` 历史别名 |

同一基金因此有**两套并发价格序列**（重叠 448 个交易日中 104 天数值不同），并导致三个消费端各自实现一半归一化：`getStatus` 两端都 uppercase（29/29 命中）、`getLatestPrices` 与客户端 `Today.jsx` 两端都不归一化（分别 27/29、29/44 无价）。这就是 P0-1 与 P0-4（[TASK-073](../../../development/tasks/completed/TASK-073-price-pipeline-p0-data-correctness.md)、[TASK-075](../../../development/tasks/completed/TASK-075-today-symbol-case-mismatch.md)）的共同根因。

代码事实（已亲读核实）：

- 全仓**没有任何代码会追加 `.cn` 后缀**；后缀有无完全取决于创建资产时的手输。
- 录入端唯一的清洗是 `trim().toUpperCase()`（[asset.service.js:39](../../../../shared/services/asset.service.js)），它统一大小写但**不统一后缀**。
- `stripCnSuffix` 只作用于发给 provider 的 `providerSymbol`（[priceFetch.service.js:19-21](../../../../shared/services/priceFetch.service.js)），从不回写记录；`validateRecord` 用 `requestedSymbol` 回写（[:79-90](../../../../shared/services/priceFetch.service.js)）。
- `market` 已是必填字段且是取价路由的权威依据（[asset.js:26](../../../../shared/models/asset.js)、[priceFetch.service.js:29-76](../../../../shared/services/priceFetch.service.js)）；后缀再编码一次市场信息，却没有任何同步保证（[DATA_MODEL.md §5.1](../../../handbook/technical/DATA_MODEL.md)）。

需要一次架构决策：symbol 的**统一存储格式**是什么，以及**后缀由谁决定**。

---

## 2. Decision Drivers

- **消灭模糊地带**：同一市场不允许「带后缀 / 不带后缀 / 大小写不一」三种写法并存；用户填不填后缀结果必须一致。
- **保住市场命名空间**：`symbol` 是 `unique: true` 的全局键；格式必须让不同市场的同码资产（如 `BND.US` 与 `BND.TO`、`000001.SZ` 与 `000001.CN`）不冲突。
- **一处定义**：归一化/派生逻辑只在 `shared/` 实现一次；写入侧、读取侧、客户端消费同一格式；`grep` 不得出现第二份后缀处理。
- **不猜数字**：不自动补港股前导零——这与产品不变量「缺价不猜」同精神。
- **可迁移**：存量 8 万+ 价格文档、44 个资产、交易与目标配置必须能按确定规则一次性改写，且可重复执行、留回滚点。

---

## 3. Constraints

- `Asset.symbol` 为 `unique: true`（[asset.js:13](../../../../shared/models/asset.js)）；`Price` 唯一键为 `{symbol:1, timestamp:1}`（[price.js:23](../../../../shared/models/price.js)）。
- `client/` 不得 `require` shared、不得承载业务规则（[AGENTS.md §5 硬规则 #3](../../../../AGENTS.md)）——派生逻辑必须在服务端，client 只做输入提示与展示。
- 取价路由优先按 `market`，缺失才按 symbol 特征推断（[priceFetch.service.js:29-76](../../../../shared/services/priceFetch.service.js)）；统一带后缀后每条 symbol 自描述，但路由仍以 `market` 为准。
- 外部 provider 的代码格式不可改：Yahoo 认 `.TO/.HK`（[yahooFetcher.js:13-17](../../../../shared/fetchers/yahooFetcher.js)），东财 `secidForCode` 只吃纯数字（[eastmoneyFetcher.js:21-23](../../../../shared/fetchers/eastmoneyFetcher.js)），天天基金 `fundCode` 为裸码（[tiantianFetcher.js:20-26](../../../../shared/fetchers/tiantianFetcher.js)）。
- 现有测试必须继续通过；TASK-054 D-20「看板精确匹配」契约（[cronStatus.service.js:10](../../../../shared/services/cronStatus.service.js)）在迁移后仍需成立（届时两侧同格式，自然精确匹配）。

---

## 4. Considered Options

### Option A — 存储带大写后缀 + 采集按市场去除/保留（选中）

存储格式统一为 `裸码 + 由 market 派生的标准大写后缀`；创建资产时由 `market` 自动派生后缀（用户可填可不填，填了以 market 为准）；采集时按一张 `PROVIDER_SUFFIX` 表决定去除还是保留后缀，再请求 provider。

- 优点：后缀保留市场命名空间，不撞唯一键；symbol 自描述，消灭「无 market 推断」的模糊；派生单点、规则单一；与「按 market 权威」的现有架构一致。
- 缺点 / 风险：US 需新造内部后缀 `.US`（provider 不认，采集时去除）；存量数据需全量迁移；HK 仍要求用户输入正确位数。

### Option B — 全部裸码 + 采集按市场补全后缀

存储纯裸码，采集时按市场补 `.TO/.HK` 等。

- 优点：symbol 最简。
- 缺点：`symbol` 全局唯一键丢失市场命名空间——`BND`（CA）与 `BND`（US 同码）会撞键，须改 `(market, symbol)` 复合唯一键并级联全部引用；HK 前导零（`700`→`0700`）需猜测补全。改动面与风险都显著更大。

### Option C — 维持现状 / 各消费端局部 uppercase

不改存储格式，继续在 `getStatus` / `getLatestPrices` / `Today.jsx` 各自补归一化。

- 优点：改动最小。
- 缺点：不触及根因，已反复出现「一个页面对、两个页面错」；与硬规则 #1「业务规则只有一份」冲突。直接否决。

---

## 5. Decision

采用 **Option A**。具体形态：

### 5.1 两张常量表（`shared/` 单点定义）

`STORAGE_SUFFIX` — 存储后缀，由 `market` 唯一决定：

| market | 存储后缀 | 存储 symbol 示例 |
|---|---|---|
| `US` | `.US` | `VOO.US` |
| `CA` | `.TO` | `BND.TO` |
| `HK` | `.HK` | `0700.HK` |
| `CN-FUND` | `.CN` | `001180.CN` |
| `CN-SH` | `.SS` | `600519.SS` |
| `CN-SZ` | `.SZ` | `000001.SZ` |

`PROVIDER_SUFFIX` — provider 原生后缀（US/CN 系列为空）：

| market | provider 后缀 | 采集时动作 |
|---|---|---|
| `US` | `''` | 去除 `.US` |
| `CA` | `.TO` | 保留 |
| `HK` | `.HK` | 保留 |
| `CN-FUND` | `''` | 去除 `.CN` |
| `CN-SH` | `''` | 去除 `.SS` |
| `CN-SZ` | `''` | 去除 `.SZ` |

### 5.2 派生规则（创建资产时，服务端执行）

```
1. 输入 symbol → trim → toUpperCase
2. strip 掉任何已知后缀（.US/.TO/.HK/.CN/.SS/.SZ）→ 裸码主体
3. 拼上 STORAGE_SUFFIX[market] → 最终存储 symbol
```

- 用户**可填可不填**后缀；填了与 `market` 不一致的后缀（如 market=US 填 `VOO.TO`）→ **以 market 为准纠正**，不报错、不采信用户输入。
- 派生逻辑只在 `shared/services/asset.service.js`（复用/替换现有 [:39](../../../../shared/services/asset.service.js) 的清洗行）；client 只在输入框提示「填代码即可，后缀按市场自动生成」。

### 5.3 采集规则

`fetchLatest` / `fetchHistory` 请求 provider 前，用 `PROVIDER_SUFFIX[market]` 把存储 symbol 转换为 provider symbol（现有 `stripCnSuffix` 升级为按表处理）；`validateRecord` 继续用 `requestedSymbol`（存储格式）回写价格记录。即「回写键 = 存储格式、请求键 = provider 格式」的现有骨架保持不变（[priceFetch.service.js:79-96](../../../../shared/services/priceFetch.service.js)）。

### 5.4 边界规则（已批准）

1. **`market` 是唯一权威**；symbol 后缀由它派生，任何手工输入不得覆盖。
2. **资产创建后 `market` 与 `symbol` 均不可变**；需要换市场 → 停用旧资产、新建资产。
3. **HK 不自动补前导零**：用户填 `0700` → `0700.HK`，填 `700` → `700.HK`；界面提示「港股请输入 Yahoo 原生 4 位代码，如 0700」。

### 5.5 消费端

写入侧（`asset` 建档、`priceStorage`）、读取侧（`getLatestPrices`、`integrityCheck`、`getStatus`）、客户端（`Today.jsx` 等）**统一用存储格式精确匹配**，不再各自 uppercase / strip。

---

## 6. Rationale

**为什么带后缀而不是裸码**：裸码方案要改 `symbol` 全局唯一键为 `(market, symbol)` 复合键并级联全部引用，代价远高于「保留后缀、派生单一」；后缀保住了 `BND.US` / `BND.TO` 与 `000001.SZ` / `000001.CN` 的天然区分，这正是本方案相对裸码最实质的收益。

**为什么后缀由 `market` 派生而非手输**：手输是本次混乱的直接来源（同一个基金有人填 `001180`、有人填 `001180.cn`）。让 `market`（必填、枚举、已是取价权威）成为后缀的唯一决定因素，「用户填不填」不再影响结果，模糊地带从根上消失。

**为什么 US 用 `.US` 而 provider 不认也要加**：`.US` 只是内部命名空间占位符，使 `VOO.US` 与其他市场的同码资产不撞键；采集时按 `PROVIDER_SUFFIX` 去除即可，provider 侧零影响。

**为什么 HK 不补零**：代码位数不唯一（4 位为主，也有 5 位），自动补零是另一种猜测，与「不猜数字」的产品精神冲突；把正确性责任交给明确的用户输入 + 界面提示，比静默猜测更可诊断。

---

## 7. Consequences

### Positive

- 同一市场只剩一种合法写法，消除 `.cn`/`.CN`/裸码三形态与大小写漂移。
- `symbol` 全局唯一键保留市场命名空间，无需复合键迁移。
- 归一化/派生只有 `shared/` 一处；写入、读取、客户端消费同一格式，硬规则 #1 得到满足。
- 后缀自描述，「按 symbol 特征推断市场」的模糊路径退化为兜底，路由更可靠。
- 用户不再需要知道「该不该填后缀、填大写还是小写」，录入门槛降低。

### Negative

- US 资产 symbol 从 `VOO` 变为 `VOO.US`——用户可见变化，需在界面与文档说明。
- 存量全量迁移：44 个资产 + `prices`（8 万+ 文档）+ `transactions` + `portfolio.targets` 需按新规则改写；两代价格序列需合并（含 104 个冲突日，按 TASK-073 D-b 裁决口径）。
- HK 用户输入 `700` 会存成 `700.HK` 而查不到价——依赖界面提示，属可诊断但不静默修复的取舍。

### Trade-offs

- 用「一次全量迁移 + US 后缀变化」换取「长期口径唯一 + 命名空间保住」。
- 用「HK 不补零」换取「零猜测」，代价是需要用户按提示输入正确位数。

---

## 8. Architectural Impact

Affected areas:

- `shared/constants/` 或 `shared/config/`：新增 `STORAGE_SUFFIX` / `PROVIDER_SUFFIX` 两张表（单一定义处）。
- `shared/services/asset.service.js`：创建/更新时按 market 派生后缀。
- `shared/services/priceFetch.service.js`：`stripCnSuffix` 升级为按 `PROVIDER_SUFFIX` 转换 provider symbol。
- `shared/services/priceStorage.service.js`、读取侧 `marketData.service.js` / `cronStatus.service.js` / `integrityCheck`：消费统一为存储格式。
- `client/`：AssetForm 输入提示、Today.jsx 及其余展示/筛选端改为消费存储格式（client 零派生逻辑）。
- 数据迁移：`assets` / `prices` / `transactions` / `portfolio.targets` 全量改写 + 双轨序列合并。
- 文档：ARCHITECTURE §8 债 #4、DATA_MODEL §5.1、API_CONTRACT、TASK-073 / TASK-075、本 ADR 及文档索引。

Unaffected areas:

- 三进程拓扑、调度归属（ADR-002）、认证与会话（ADR-001）。
- 业务不变量：绝不下单、缺价不猜（含 HK 不补零）、只有家庭层折算。
- provider 接口与取价口径（Yahoo / 东财 / 天天基金的 URL 与字段解析不变，仅请求用的 symbol 由表转换）。

---

## 9. Implementation Notes

- 派生函数命名建议 `toStorageSymbol(symbol, market)` 与 `toProviderSymbol(symbol, market)`，与其他归一化实现集中在同一模块；**不得**在各消费端内联 `toUpperCase()` / `replace(/\.CN$/...)`。
- 表驱动：新增市场时只需在两张表各加一行，并在 `ASSET_MARKETS` 枚举（及其 client 副本，见硬规则 #8）同步。
- 创建资产的重复校验（`Asset.exists({symbol})`）须在派生**之后**执行，确保查的是最终存储键。
- `market` 不可变通过 `asset.service.updateAsset` 拒绝 `market` 字段变更实现（保留停用/重建路径）。
- 迁移脚本：先 `sync:db` 留还原点；按 `market` + 现有 symbol 确定性派生目标键；双轨序列按 D-b 口径合并并逐日留痕；脚本可重复执行。
- `historySync --symbols` 命令行传入的 symbol 也须先经派生（命令行可能传裸码或旧后缀）。
- client 侧 `symbolUtils`（若存在按 `.CN` 推断市场的逻辑）须复核，避免与统一口径冲突。

---

## 10. Validation

判定为成功实现当满足：

- 新建资产：同一 `market` 下用户分别输入「裸码 / 小写后缀 / 大写后缀 / 不一致后缀」，落库 symbol 完全一致且等于 `STORAGE_SUFFIX[market]` 派生值。
- 采集：三个 fetcher 收到的 `providerSymbol` 与 `PROVIDER_SUFFIX` 表一致（US/CN 系列为裸码、CA/HK 保留后缀），单测断言。
- 消费：迁移后 `getLatestPrices` 对全部 active 资产精确命中（32 个持仓缺价 17 → 0）；今日行情列表 44/44 命中（TASK-075 AC1）；`getStatus` 保持精确匹配语义。
- 重复面检测：`grep` 全仓，后缀派生/strip 逻辑只在 `shared/` 一处，client 无第二份。
- 迁移可重复执行且幂等；唯一键无冲突；104 个冲突日按 D-b 处理且有迁移记录。
- `test:server` / `test:worker` 全量全绿（入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)）。

---

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| 迁移不可逆 / 双轨合并丢失历史 | 高 | 迁移前 `sync:db` 备份；脚本可重复执行；D-b 先裁决；逐日迁移记录 |
| US 后缀变化导致用户/外部引用（URL、手工记录）失配 | 中 | 界面与文档说明；迁移做旧键→新键映射表；留意历史 URL 中的 symbol |
| 旧 `market` 为空的资产无法派生后缀 | 中 | 迁移前盘点 `market` 缺失资产，人工补齐后再派生（当前实测 44/44 有 market） |
| HK 前导零输入错误导致查不到价 | 低 | 界面明确提示 4 位原生代码；`NOT_FOUND` 走既有诊断路径 |
| 客户端另起一份派生逻辑（违反硬规则 #3/#1） | 中 | client 只做提示与展示；grep 检测式纳入 AC；Reviewer 复核 |
| 与 TASK-054 D-20「精确匹配」措辞的时间线冲突 | 低 | 迁移后两侧同格式，精确匹配自然成立；复核 `FS-cron-worker-status-board` 措辞 |

---

## 12. Follow-up Actions

- [ ] 创建/改写 TASK-073 的 ExecPlan，以本 ADR 为归一化目标（原「strip → 裸码」口径作废）。
- [ ] TASK-073 裁决 D-b（104 冲突日合并口径）后成文；D-a / D-c / D-d 维持原待裁决状态。
- [ ] TASK-075 客户端对齐：Today.jsx 直接消费存储格式，client 零派生逻辑。
- [ ] 更新 ARCHITECTURE §8 债 #4 状态、DATA_MODEL §5.1、API_CONTRACT symbol 字段说明。
- [ ] 复核 TASK-054 D-20 看板精确匹配逻辑与相关 Spec 措辞。
- [ ] 更新 docs/readme.md 索引（新增本 ADR）。

---

## 13. References

- [PRICE-PIPELINE-REVIEW.md](../../architecture/PRICE-PIPELINE-REVIEW.md) — P0-1 symbol 双轨、P0-4 客户端未归一化、附录 C（唯一事实来源）
- [TASK-073](../../../development/tasks/completed/TASK-073-price-pipeline-p0-data-correctness.md) — 归一化 + 迁移主卡（本 ADR 反转其 AC1 目标格式）
- [TASK-075](../../../development/tasks/completed/TASK-075-today-symbol-case-mismatch.md) — 客户端展示端对齐
- [ARCHITECTURE.md §8 债 #4](../../architecture/ARCHITECTURE.md) — 无归一化层（结构性根因）
- [DATA_MODEL.md §5.1](../../../handbook/technical/DATA_MODEL.md) — symbol 写法不统一（当前状态记录）
- [ADR-002](./ADR-002-single-scheduler.md) — 单一调度器（取价链路的调度归属，未受本 ADR 影响）
- [DOCS.md](../../standards/DOCS.md) — 文档结构与「单一归属」规则

---

## 14. Decision History

### 2026-11-17（状态回退：Accepted → Proposed）

按你的决定，将本 ADR 从 `Accepted` 回退为 **`Proposed`**，走正式 review/批准流程。此前 `Accepted` 是基于「采纳方向」的提前登记，未走完正式批准；回退后：

- 本 ADR 的方向与细则均降级为**提案**，在正式批准前不作为既定架构约束；
- 下游 TASK-073 / TASK-075 的口径反转**保持引用本 ADR 的说明**，但须标注「依赖 Proposed ADR，未批准前不可实施」；
- 正式批准后，将 Status 改回 `Accepted`，并补齐 Decision Owner 的批准引用。

### 2026-11-17（起草）

ADR created。Human Owner 就方向表态**采纳**「存储带大写后缀 + 采集按市场去除/保留」，并给出三项细则的倾向性意见：

- HK 港股代码 **不自动补前导零**，界面提示填 Yahoo 原生 4 位代码；
- 资产创建后 **`market` 不可变**，换市场须停用重建；
- 后缀由 **`market` 在创建时自动派生**，用户可填可不填，填写不一致时以 market 为准。

同时确认 US 内部后缀用 `.US`。该方向反转 TASK-073 原 AC1「strip → 裸码」的归一化目标——**须待本 ADR 正式批准后**，主卡才按新口径改写与实施。

### 2026-11-17（正式批准：Proposed → Accepted）

Human 完成 review 并**正式批准本 ADR**，Status 由 `Proposed` 转回 **`Accepted`**。存储带大写后缀（按 `market` 派生）、采集按 `PROVIDER_SUFFIX` 去除/保留、HK 不补前导零、`market` 创建后不可变、US 用 `.US` 等口径全部成为既定架构约束。下游 TASK-073 / TASK-075、DATA_MODEL §5.1 的「未批准前不可实施」标注同步解除，按批准口径实施。
