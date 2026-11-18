# TASK-073 — 价格链路 P0 代码层修复 实施计划（symbol 派生与消费统一 / 完整性检查语义）

## Status

Status：Implementing（2026-11-17，Implementer 开始实施；Human 于同日批准「073～078 计划」）

Owner：Planner（起草）；Implementer（待指派）

Related Task：[TASK-073-price-pipeline-p0-data-correctness](./TASK-073-price-pipeline-p0-data-correctness.md)（独立维护任务，无 Story）

Related Spec / ADR：[ADR-003 symbol 统一契约](../../../os/architecture/adr/ADR-003-symbol-suffix-contract.md)（Accepted，symbol 口径唯一依据）；[PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) P0-1 / P0-2；[TASK-057](../../delivery/completed/US-001/TASK-057.md)（状态机锁定，D-d 沿用）

Branch / Base：起草时 `main` @ `d6e1413`（审阅基线）；实施从最新 `main` 开 `feature/TASK-073-price-pipeline-p0-data-correctness`

Approval：**已批准（2026-11-17，Human）**。本计划覆盖任务卡 AC1 / AC2 / AC5 / AC6 / AC7（AC3、AC4 已拆至 077 / 078）与已裁决 D-d（"全部跳过"为数据态中间态、不加入状态机），以及 ADR-003 的单一实现与四处消费接线。`Draft → Approved` 须 Human 明确批准当前设计。本卡是 [TASK-077](./TASK-077-symbol-historical-data-migration.md) W0 与 [TASK-078](./TASK-078-price-collection-timing-bucketing.md) AC4 的前置，须先落地。

---

## 1. Intent

按 Human 2026-11-17「073 代码逻辑 / 077 数据库 / 078 采集程序」拆分规则，本卡**只改代码**，不改存量数据、不改采集时刻/归桶、不抓 launchDate：

1. **P0-1 代码层**：在 `shared/` 提供 ADR-003 口径的 symbol 归一/派生**单一实现**，并把四处消费点（建档 / `priceStorage` 写入 / `getLatestPrices` 读取 / `integrityCheck` 对比）接成同一实现，消灭"写入侧与读取侧各做一半清洗"导致的 27/29 场外基金查不到价（**存量数据修复归 TASK-077，客户端显示归 TASK-075，本卡不声称 44/44 命中**）。
2. **P0-2 检查语义**：价格完整性检查在 `launchDate` 可用时确实执行（`checkedCount > 0`、缺价能被检出）；"全部跳过"按 D-d 作为**数据态中间态**如实反映，**不加入/不推翻状态机**（**launchDate 抓取/回填归 TASK-076，本卡不抓不填**）。

范围外（任务卡 §4）：数据迁移（077）、采集时刻/归桶与同日覆盖日志（078）、资产信息检查（076）、客户端（075）、P1/P2 观测健壮性（074）。

目标（不改需求、不改产品行为）：用户填裸码/小写/大写/错后缀落库一致；写、读、采集、检查四处同格式；状态机四态零改动；全量测试绿。

---

## 2. Context

- **交付规则**：Human 2026-11-17 冻结「073 代码 / 077 数据库 / 078 采集程序」。本卡只交付 `shared/` 可复用实现与接线，不改任何数据库文档。
- **ADR-003 已 Accepted**：存储格式 = `裸码 + 由 market 派生的标准大写后缀`（`001180.CN` / `VOO.US` / `600519.SS`）；后缀由 `market` 唯一决定，用户填不填/填错结果一致，`market` 创建后不可变；采集按 provider 后缀表去除或保留。本卡是该 ADR 在代码层的落地，方案细节见 ADR-003 §5 / §9 / §10。
- **D-d 已裁决**（任务卡 §6，Human 2026-11-17）："全部跳过"是中间态，只在 `result` 数据态表达，沿用 TASK-057 的 `RUNNING/SUCCEEDED/PARTIAL/FAILED` 四态，不新增状态值、不改唯一索引。
- **单点共享约束**（任务卡 §7）：D-d 定义的「`skippedCount === totalCount` / `checkedCount=0` → `result` 数据态中间态」是**唯一实现**（`shared/` 与 US-001 看板各一份，硬规则 #1）。TASK-074 的零采集 `SUCCEEDED`（P1-3）是同一语义的另一实例，已统一到本卡；074 仅额外交付「连续 N 天无新数据可见」。若该单点需加字段/改契约，由本卡侧统一改并回报，074 不私自分叉。
- **下游前置**：077 迁移脚本复用本卡的派生函数（其 W0 前置门）；078 的覆盖日志 symbol 用本卡派生的统一格式（其 AC4 前置）。故本卡须先于二者落地。
- **并发边界**：本卡与 078 同改 `priceStorage.service.js`——本卡只改第 8 行归一化，078 只在 `saveLatest` 主体前后加日志；合并后须跑 `priceStorage` 相关单测确认互不覆盖。

---

## 3. Repository Findings（2026-11-17 亲读，标注落点）

| # | 事实 | 落点 |
|---|---|---|
| F-01 | 全仓**无统一派生层**；唯一后缀处理是 `priceFetch.service.js` 的 `stripCnSuffix`（只 strip `.SS/.SZ/.CN`、只作用于 providerSymbol、不回写），无 `.US/.TO/.HK` 处理 | `shared/services/priceFetch.service.js:19-21,34,42,63,71` |
| F-02 | 建档清洗仅 `trim().toUpperCase()`，**不管后缀**；`createAsset`/`updateAsset` 直接以清洗后 symbol 建重复检查 | `shared/services/asset.service.js:39,116-143` |
| F-03 | `getLatestPrices(symbols)` 读侧**零归一化**：`Price.findOne({ symbol })` 直接用传入 symbol；三个调用方（alertEngine / positionTracker / suggestionGenerator）都只传 symbol 数组、**不传 market** | `shared/services/marketData.service.js:12-38`；`alertEngine.service.js:240-245`、`positionTracker.js:14-15`、`suggestionGenerator.js:189-190` |
| F-04 | 写价归一化仅 `String(symbol).trim().toUpperCase()`，无后缀派生；`saveLatest` upsert 键 `{symbol,timestamp}` | `shared/services/priceStorage.service.js:4-30` |
| F-05 | `integrityCheck` 对比用 `storedBucketDates(asset.symbol, …)`（直接取 asset.symbol，无派生）；`result` 已透传 `totals/checkedCount/skippedCount/completenessRatio/gapAssets` | `cron-worker/src/tasks/integrityCheck.js:77-81,100,398-411` |
| F-06 | `runTrackedTask` 状态机：`failureCount>0 → PARTIAL`，否则 `SUCCEEDED`，异常 `FAILED`；`SKIPPED` 仅用于并发/重复键**早退返回**（不落库为业务状态）；`normalizeCounts` 只透传显式 `result` 键 | `shared/services/taskRunner.js:14-27,51-119` |
| F-07 | `integrityCheck` 全跳过路径：`launchDate` 缺失 → `status='SKIPPED_NO_LAUNCH_DATE'`、`skippedCount++`，但 `failureCount` 不增 → 汇总仍 `SUCCEEDED`（P0-2 现状） | `cron-worker/src/tasks/integrityCheck.js:239-246,262-271,386-414` |
| F-08 | `market` 已是 Asset 必填枚举字段，44/44 资产有 market（派生后缀的前提成立） | `shared/models/asset.js:26`；审阅实测 |
| F-09 | `Asset.symbol` 正则 `^[A-Z0-9][A-Z0-9._-]*$`（带后缀合法）、`unique:true`；`Price` 唯一键 `{symbol:1,timestamp:1}` | `shared/models/asset.js:9-19`；`shared/models/price.js:23` |
| F-10 | `launchDate` 字段存在但全库为空，完整性检查据此全跳过；本卡不改该字段的抓取/回填 | `shared/models/asset.js:37-39` |
| F-11 | 既有相关测试：`server/test/integration/asset.service.test.js`、`price.module.test.js`，`cron-worker/test/integrityCheck.test.js`、`priceFetch.test.js`；框架 Node 内建 `node:test` + `node:assert` | `server/test/`、`cron-worker/test/` |
| F-12 | 派生函数 `toStorageSymbol` / `STORAGE_SUFFIX` 全仓 0 命中（待本卡新建） | 2026-11-17 `grep` 全仓 |

未核实项（诚实标注）：本轮只读源码与文档，**未连库、未实跑采集**；"27/29 查不到价""44/44 有 market"等数据事实以审阅实测为准（[PRICE-PIPELINE-REVIEW](../../../os/architecture/PRICE-PIPELINE-REVIEW.md) 附录 A）；F-03 的三个 `getLatestPrices` 调用方在迁移完成前后拿到的是旧键还是新键，须由 TASK-077 迁移与 TASK-075 客户端对齐共同收敛，本卡只保证代码层消费同一派生格式。

---

## 4. Proposed Design（冻结）

### 4.1 新建单一实现模块 `shared/utils/symbol.js`

表驱动、单点定义（ADR-003 §5.1 / §9，硬规则 #1/#8）：

```
STORAGE_SUFFIX = { US:'.US', CA:'.TO', HK:'.HK', 'CN-FUND':'.CN', 'CN-SH':'.SS', 'CN-SZ':'.SZ' }
PROVIDER_SUFFIX = { US:'', CA:'.TO', HK:'.HK', 'CN-FUND':'', 'CN-SH':'', 'CN-SZ':'' }

KNOWN_SUFFIXES = ['.US','.TO','.HK','.CN','.SS','.SZ']   // 供 strip 裸码主体

toStorageSymbol(symbol, market) -> String
  1. trim → toUpperCase
  2. strip 末尾任一 KNOWN_SUFFIX → 裸码主体
  3. 返回 裸码主体 + STORAGE_SUFFIX[market]
     （market 缺失/未知：抛错或按防御策略返回原大写码——实施时定，须单测覆盖；本卡不引入"猜 market"）

toProviderSymbol(symbol, market) -> String
  1. 以 toStorageSymbol 得存储键
  2. 按 PROVIDER_SUFFIX[market] 决定去除/保留后缀（US/CN 系列去、CA/HK 留）
```

- 模块只放 `shared/`；client 零派生逻辑（硬规则 #3），TASK-075 只做输入提示与展示。
- `grep` 检测式：除本模块外不得出现第二份后缀派生/strip 实现（含 `stripCnSuffix` 升级后只调用本模块，不内联正则）。

### 4.2 四处消费接线（AC1）

| 消费点 | 现状 | 改为 |
|---|---|---|
| 建档 `asset.service.js:39` | `trim().toUpperCase()` | `toStorageSymbol(data.symbol, data.market)`；**重复检查移到派生之后**（ADR-003 §9）；`updateAsset` 拒绝变更 `market`（若 input 含 `market` 且与原值不同 → 400） |
| 写价 `priceStorage.service.js:8` | `String(symbol).trim().toUpperCase()` | `toStorageSymbol(record.symbol, record.market)`；record 需带 `market`（来自 asset；见 §4.3） |
| 读价 `marketData.service.js:12` | 直接用传入 symbol 查 | 见 §4.3（读侧 market 来源方案） |
| 检查 `integrityCheck.js:100` | `storedBucketDates(asset.symbol, …)` | 对比前把 `asset.symbol` 经 `toStorageSymbol(asset.symbol, asset.market)` 派生；asset 来自 `getActiveAssets`，天然带 market |

采集侧（ADR-003 §5.3 骨架保持不变）：`priceFetch.service.js` 的 `stripCnSuffix` 升级为调 `toProviderSymbol`——CN 系列发裸码、CA/HK 保留后缀；`validateRecord` 继续用 `requestedSymbol`（存储格式）回写，即"回写键 = 存储格式、请求键 = provider 格式"。

### 4.3 读侧 `getLatestPrices` 的 market 来源（关键取舍，实施前定）

F-03：三个调用方只传 symbol 数组、无 market，而派生函数需要 market。**推荐方案**：`getLatestPrices(symbols)` 内部先按 symbols 批量查 `Asset`（`symbol $in`，取 `symbol→market` 映射），对每个 symbol 用其 market 派生存储键再查 `Price`；查不到 Asset 的 symbol 退化为原样大写查询（防御，不猜 market）。**备选**：改调用方签名传 `{symbol,market}` 数组——改动面更大（3 个调用方 + 单测 mock），仅当推荐方案有性能/契约问题才采用。两方案均须单测覆盖；此项属范围内实施细节，不需再报 Human，但须在 Implementation Record 记录所选方案与理由。

### 4.4 AC5 / AC6：完整性检查生效化 + 全跳过数据态（D-d）

- **AC5（生效化）**：本卡**不改** `launchDate` 抓取/回填（归 076）。代码层保证：当 asset 带 `launchDate` 时，检查正常进入 `checkedCount`（现状 `checkedCount=0` 是因 076 尚未回填数据，非代码缺陷）；补单测证明"人为给 asset 注入 launchDate + 缺价样例 → 能被检出为 GAP"（负向对照：无 launchDate 仍 SKIPPED_NO_LAUNCH_DATE）。
- **AC6（全跳过语义）**：在 `integrityCheck` 的 `result` 中新增数据态字段，如 `allSkipped: boolean`（= `skippedCount === totalCount && totalCount > 0`）与必要的 `checkedCount`（已有）；让看板可如实显示"全部跳过/未检查"，而**不是**"数据完好"。
  - **不动** `taskRunner.js` 的状态机（四态）、唯一索引、`normalizeCounts` 白名单逻辑；`status` 仍按 `failureCount>0 → PARTIAL` 否则 `SUCCEEDED` 判定。
  - **不新增** `SKIPPED` 业务状态值（TASK-057 D3 锁定）；`runTrackedTask` 早退返回的 `status:'SKIPPED'` 是并发/重复键路径，与本语义无关，不得混用。
  - **074 复用**：`result` 字段命名与语义需可被 TASK-074 的零采集 `SUCCEEDED` 实例复用（任务卡 §7 单点共享）；如 074 需要额外字段，由本卡统一加，不在 074 侧分叉。

### 4.5 关键取舍

- 派生逻辑只新增一份模块（F-12），四处消费 + 采集侧全部调用它——这是硬规则 #1 的核心交付，不是可选优化。
- 读侧改 `getLatestPrices` 内部补 market，而非要求三个调用方改签名——最小改动面，保持调用方契约稳定；若实测有问题走备选并在记录说明。
- AC6 只加 `result` 数据态字段，零状态机改动——严格遵守 D-d 与 TASK-057 锁定。

---

## 5. Work Breakdown

- [ ] W1：新建 `shared/utils/symbol.js`（两张表 + `toStorageSymbol`/`toProviderSymbol` + 已知后缀 strip）+ 单测（各 market 派生、裸码/小写/大写/错后缀归一一致、HK 不补零、market 缺失防御）→ 产出：模块 + `shared` 单测
- [ ] W2：建档接线（`asset.service.js:39` 派生、重复检查后置、`updateAsset` 拒绝改 market）→ 产出：代码 + `asset.service.test.js` 用例
- [ ] W3：写价接线（`priceStorage.service.js:8` 派生，record 带 market）+ 采集侧 `stripCnSuffix → toProviderSymbol` 升级（`priceFetch.service.js`）→ 产出：代码 + `price.module.test.js` / `priceFetch.test.js` 用例；**注意与 078 的同文件合并边界（§2）**
- [ ] W4：读价接线（§4.3 方案，`marketData.service.js` 内部查 Asset 拿 market + 派生，防御回退）→ 产出：代码 + 单测（含调用方 mock 不回归）
- [ ] W5：检查接线（`integrityCheck.js:100` 对比用派生）+ AC5 生效化单测（注入 launchDate + 缺价 → 检出 GAP；无 launchDate 仍 SKIPPED）→ 产出：代码 + `integrityCheck.test.js` 用例
- [ ] W6：AC6 数据态（`integrityCheck` 的 `result` 加 `allSkipped` 等字段）+ 单测（全跳过 → 数据态如实反映、status 仍四态、无 SKIPPED、唯一索引无 diff）→ 产出：代码 + 单测 + 074 复用契约说明
- [ ] W7：检测式自检（`grep` 全仓无第二份后缀派生/strip、client 无派生逻辑）+ 全量回归（`test:server`/`test:worker`，见 DEPLOYMENT §7）→ 产出：验证记录（§11）
- [ ] W8：交接 Reviewer 独立审查 → 产出：Review Record（§12）

依赖顺序：W1（派生模块）→ W2/W3/W4/W5（四处接线，可并行，均依赖 W1）→ W6（依赖 W5 的 result 结构）→ W7（依赖全部代码）→ W8（依赖 W7）。W3 与 TASK-078 的 `saveLatest` 日志改动合并且须跑 `priceStorage` 单测。

---

## 6. Decisions（全部已冻结，无待决）

| # | 决定 | 依据 |
|---|---|---|
| 归一化口径 | 存储带大写后缀、按 market 派生、US 用 `.US`、HK 不补零、market 不可变 | ADR-003（Accepted） |
| D-a / D-b / D-c | 分别拆至 TASK-078 / TASK-077 / TASK-076 | Human 2026-11-17 拆分规则 |
| D-d | "全部跳过"为数据态中间态，不加入状态机、不新增状态值、不改唯一索引 | Human 2026-11-17（任务卡 §6） |
| 派生模块落点 | `shared/utils/symbol.js`，单一实现 | ADR-003 §9；硬规则 #1/#8 |
| 读侧 market 来源 | §4.3 推荐方案（内部查 Asset 派生），备选改调用方签名——实施细节，记录所选 | 本计划 §4.3 |
| 顺序 | 073 代码 → 077 数据迁移 → 078 采集口径 | 077 W0 / 078 AC4 前置；硬规则 #1 |
| 074 单点共享 | D-d 数据态语义由本卡唯一实现，074 复用不另建 | 任务卡 §7；Human 2026-11-17 |

范围、AC、产品行为、状态机均无变更；若实施中发现须改状态机、扩 schema 或改产品行为，按 [EXECUTION_PLANS §5](../../../os/process/EXECUTION_PLANS.md) 与 [STATES §4](../../../os/process/STATES.md) 提交 Human，回 Draft 重批。

---

## 7. Verification

命令入口唯一归属 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md)（此处只引用，不复制命令清单）。不写死用例数量，以实际输出为准。

| AC | 验证方法 | 预期结果 |
|---|---|---|
| AC1 | W1 派生单测 + W2/W3/W4/W5 接线单测 + W7 `grep` 检测式 | 各 market 派生正确（裸码/小写/大写/错后缀落库一致）；四处消费 + 采集侧均调用同一实现；`grep` 除 `symbol.js` 外无第二份后缀派生/strip、client 无派生逻辑 |
| AC2 | 读侧接线单测（W4）+ 代码层断言 | 同一 market 下用户填裸码/小写/大写/错后缀，派生落库 symbol 一致；`getLatestPrices` 走派生键；44/44 命中与 32 缺价 17→0 由 077 验收，本卡不断言 |
| AC5 | W5 单测：注入 launchDate + 人为缺价样例；负向对照无 launchDate | launchDate 可用时 `checkedCount > 0` 且缺价被检出为 GAP；无 launchDate 仍 `SKIPPED_NO_LAUNCH_DATE`（本卡不抓/填 launchDate） |
| AC6 | W6 单测：全跳过样例 → 检查 `result.allSkipped` 数据态与 `status` | 全部跳过时 `result` 如实反映"未检查"，不再呈现为"数据完好"；`status` 仍按四态判定、无 `SKIPPED` 业务状态、`taskRunner.js` 与唯一索引零 diff（负向对照：不得新增状态值/改索引） |
| AC7 | `test:server` / `test:worker` 全量全绿；独立 Reviewer 通过 | 全绿；Reviewer 出具 verdict 与 findings（[REVIEWER.md §5](../../../os/roles/REVIEWER.md)）；合并 078 后 `priceStorage` 单测仍绿 |

覆盖缺口：计划阶段未连库、未实跑采集；AC2 的存量命中数字依赖 TASK-077 迁移、AC5 的真实 `checkedCount>0` 依赖 TASK-076 回填 launchDate——未取得前不得记为这两项的数据侧验证通过（[AGENTS.md §9](../../../../AGENTS.md)）。本卡验证的是代码层消费与语义，与 076/077 分别验收、不互相顶替。

---

## 8. Risks

| # | 触发条件 | 影响 | 应对 |
|---|---|---|---|
| R-1 | 派生接线破坏既有精确匹配（`getStatus` / `getLatestPrices`） | 读取错价/无价 | 沿用 ADR-003 单一实现；全量回归（AC7）；调用方 mock 单测不回归 |
| R-2 | C-07 等下游依赖既有 symbol 形态 | 下游失配 | 口径以 ADR-003 冻结，下游只消费不派生；与 TASK-075 客户端对齐 |
| R-3 | `getLatestPrices` 调用方无 market（F-03）处理不当 | 派生失败或误查 | §4.3 方案 + 防御回退 + 单测；不猜 market |
| R-4 | 实施者擅自改状态机/唯一索引绕过 D-d | 违反 TASK-057 锁定、硬规则缺陷 | D-d 已裁决"不加入状态机"；AC6 负向对照断言零 diff；Reviewer 复核 |
| R-5 | 与 078 同改 `priceStorage.service.js` 合并冲突 | 覆盖日志或派生丢失 | §2 合并边界（不同行）；合并后跑 `priceStorage` 单测 |
| R-6 | 读侧派生依赖 Asset 查询带来额外开销 | 性能 | 批量 `$in` 一次查、按 symbol 映射；如不可接受走 §4.3 备选并记录 |

---

## 9. Rollback

- 纯代码改动：回退本卡文件改动即可（派生模块、四处接线、`result` 数据态字段），不改数据、不改 schema、不改索引，无不可逆影响。
- 新建的 `shared/utils/symbol.js` 可单独删除；四处接线回退到原清洗逻辑即恢复旧行为（旧库仍是旧键，回退后与迁移前状态一致）。
- AC6 `result` 字段移除不影响 TaskRun 状态机与既有记录（字段只在 `result` 数据态，不改 `status`）。
- 注意：若本卡已合入且 077 迁移已执行，回退本卡会导致新写入回到旧键而存量已是新键 → 须与 077 协同回退；本卡单独回退仅在 077 未执行时安全。

---

## 10. Implementer Handoff

- 下一角色：Implementer（待指派）。
- 输入：本计划 + 任务卡（AC1/AC2/AC5/AC6/AC7、§6 D-d 裁决）、ADR-003（Accepted）、§3 Findings 落点、§4 设计、§5 步骤、§7 验证映射。
- 范围与禁改：只在 §4 / §5 列出的文件内改动；**不改** `taskRunner.js` 状态机与唯一索引、**不改** `launchDate` 抓取/回填（076）、不做历史迁移（077）、不改采集时刻/归桶与覆盖日志（078）、不扩到 074/075；client 零派生逻辑。
- 授权：计划为 Draft，**未获 Human 批准前不得开工**；`Draft → Approved` 由 Human 登记（STATES §4）。D-a~D-d 均已裁决，无待决项。
- 依赖：无外部新依赖；**本卡是 077 W0 与 078 AC4 前置，须先落地**；与 078 的 `saveLatest` 合并边界见 §2/§8 R-5。
- 预期产出：派生模块 + 四处接线 + AC6 数据态 + 单测 + 验证记录（§11）+ 可审对象。
- 停止条件：若发现须改状态机、改产品行为、扩 schema/迁移，或读侧方案两分支均不可行 → 停止并报 Planner / Human（AGENTS §8）。
- 验证入口：[DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)；命令不在此重复。

---

## 11. Implementation Record

2026-11-17，Implementer。基线 `a333ba768d661cca2eb75434f8d4225cd8fee42c`，开工时本地 `main` 与刚抓取的 `origin/main` 一致。按 Human 指定分支 `feature/TASK-073-price-pipeline-p0` 实施。代码与测试版本为 `65d6ad423faac2b60601c7d29a021fd8f21fdf27`；本节记录随独立提交交付。

- AC1/AC2：`shared/utils/symbol.js` 统一两张后缀表及派生函数；`asset.service.js` 按最终键查重并冻结建档后的 market 与 symbol；`priceFetch.service.js` 分开请求键和存储键，`eastmoneyFetcher.js` 暴露既有 secid 的交易所判定供旧 CLI 裸码回退。日价与历史价共用 `priceStorage.service.js` 的键派生，同日 upsert 及并发重试继续使用原有时间与索引。
- AC2 读取采用 §4.3 推荐方案。`marketData.service.js` 增加一次 Asset 批量读取，使用聚合保留旧键大小写，保留调用方的输入键和签名；查不到 Asset 时按原符号大写精确查价，不猜 market。查不到价格返回 `null`。
- AC5/AC6：`integrityCheck.js` 按派生键查价；`result.allSkipped` 为真时完整率为 `null`。`shared/utils/taskResult.js` 提供共享判断供 TASK-074 复用。`cronStatus.service.js` 的完整性适配器使用既有 `unknown` 数据等级与说明，并识别计数齐全的旧记录；价格同步统计沿用 D-20 的大小写清洗后精确匹配。`historySync.cjs` 复用符号清洗。
- Human 追加批准修复两处基线命中。`scripts/check-collection-health.cjs` 用共享派生比较候选资产，只有唯一候选时才给提示，后缀按 ADR-003 识别。`shared/services/rebalance/costEstimator.js` 在价格缺失或非数值时返回 `null` 成交额、费用、税和总成本，保留有效价格的计算。
- 新增 11 项用例。服务端 8 项覆盖建档四种输入等价、更新键不可变、六市场与异常入参、批量读价及缺价、Asset 读取失败、并发 upsert、看板全跳过、交易成本缺价。Worker 3 项覆盖 provider 请求与两个回写路径、有上市日期检出缺口、全跳过及空集合对照。已有同日合并与重复建档用例改用标准键。

验证入口见 §7。完整日志保存在本机临时目录 `portomind-TASK-073-a333ba7`，文件名前缀分别为 `baseline-` 与 `final-`。此前候选的输出保留为 `candidate-`。

| 验证 | 基线实跑 | 交付实跑 |
|---|---|---|
| 服务端测试 | 268 通过，0 失败 | 276 通过，0 失败 |
| Worker 测试 | 78 通过，0 失败 | 81 通过，0 失败 |
| Client build | 成功（4.48s），有分块大小警告 | 成功（2.82s），同一警告 |
| Client lint | 0 errors，5 warnings | 0 errors，仍为 5 条 Fast Refresh 警告 |
| 文档检查 | 159 份，1686 条链接，ERROR 0，WARN 0 | 159 份，1686 条链接，ERROR 0，WARN 0 |

静态证据见 `final-static.log`。全仓代码扫描仅在 `shared/utils/symbol.js` 命中后缀定义，无缺价归零模式命中。Client、TaskRun 状态机、唯一索引、调度器和时间工具的 diff 为空。巡检脚本语法、外部行情调用包装及空白检查均通过。

未连接真实库运行巡检或验收价格链路，未调用实际外部 provider，未执行历史数据迁移、采集时刻或归桶更改及客户端更改。存量命中率待 TASK-077，实际 launchDate 覆盖待 TASK-076，合并 TASK-078 后复跑价格存储测试。独立 Reviewer 待交接。

## 12. Review Record

（由独立 Reviewer 按 [REVIEWER.md §7](../../../os/roles/REVIEWER.md) 填写：verdict、AC 对照、findings 与严重度、实跑/引用证据、残余风险与独立性声明。Implementer 不为自己的改动出具独立审查结论。）

## 13. Completion Record

（填写：AC 与验证证据引用、关闭依据、归档与移交、长期沉淀位置与证据入口。结案后随卡片移到 `docs/development/tasks/completed/`，与同编号 `-plan.md` 成对；Merged 仅引用 Human 登记，不自行判定。）

## 自检

- [x] Task 与批准依据对应（AC1/AC2/AC5/AC6/AC7、D-d、ADR-003 均来自任务卡/已批准 ADR；方案未改需求/状态机）。
- [x] 步骤可执行、前置明确（W1–W8 与依赖顺序）；AC1–AC7 均有验证方法（§7）。
- [x] 记录可追溯且只存一处（技术方案与记录在计划，需求/AC/Status 在任务卡；命令入口引用 DEPLOYMENT §7）；编号与相对链接按 `docs/development/tasks/active/` 深度修正。
