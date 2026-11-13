# TASK-046 — CSV 二次导入未去重（幂等失效）

## Metadata

**Status:**  
`Implementing`（2026-11-11）：计划已批准（小计划 `Draft → Approved`），按 [STATES.md](../../../os/process/STATES.md#4-谁可以改变状态) 登记 `Planning → Implementing`；修投影 + 重写假阳性用例

**Priority:**  
`High`（静默污染成本与持仓，修复面极小；若认定触发需人工重复操作，可下调至 Medium）

**Owner:**  
待指派（Planner → Implementer → 独立 Reviewer）

**Created:**  
`2026-10-19`

**Updated:**  
`2026-10-19`

**Type:**  
`Defect`（既有缺陷，非 TASK-044 引入）

**Related Product Spec:**  
无独立 FS。本任务卡即 Human Intent 载体（缺陷类，参照 TR-09 既有需求条目）
**关联既有需求：** `docs/handbook/product/lines/PL-1-ledger.md` §4 TR-09（CSV 批量导入）、§6.2 交易记录

**Related ADR:**  
`None`

**Execution Plan:**  
[Draft：TASK-046-plan](../../exec-plans/active/TASK-046-csv-import-dedup-plan.md)（2026-11-11 起草的小计划；`Draft → Approved` 归 Human）
待创建（须在本任务卡经 Human 确认后由 Planner 产出）

**来源：**  
TASK-044 真实浏览器走查副产品，记录于 `docs/development/exec-plans/completed/TASK-044-transaction-consolidation.md` §10.4 与 `docs/development/tasks/completed/TASK-044-transaction-consolidation.md` §8。TASK-044 判定其为既有缺口、未擅自修复。

---

## 1. 缺陷描述（症状）

对**同一个组合**连续两次导入**内容完全相同**的 CSV，两次都返回「成功导入 2 条 / 跳过重复 0 条」，库内交易数从 N 增至 N+4。

预期：第二次导入应全部计为「跳过重复」，`imported = 0`、`skipped = 2`，库内不新增记录。

> 该行为不是「未实现去重」——去重逻辑**存在且被调用**（见 §3）。是「与库内已有记录比对」这一步的**键永远不相等**，导致幂等形同虚设。

---

## 2. 复现步骤

1. 进入任一组合 → 交易记录 Tab → 导入 CSV（≤500 行，字段可被 `mapColumns` 正常识别）
2. 记录返回结果：`imported = N`、`skipped = 0`
3. **不修改文件**，再次导入同一 CSV
4. 观察：仍为 `imported = N`、`skipped = 0`；组合内交易数翻倍
5. 直接查库可确认同一 `(symbol, action, quantity, price, date, fee)` 存在两条记录

**环境**：`/portfolios/:id/transactions/import` → `POST /api/transactions/import` → `shared/services/transaction.service.js#importTransactions`
**首次观察环境**：TASK-044 e2e 走查（`portomind_e2e` 副本，非真实库）

---

## 3. 根因（已定位，含代码证据）

`shared/services/transaction.service.js:231-242`：

```js
const existingKeys = new Set();
if (unique.length > 0) {
  const existing = await Transaction.find({ portfolioId }).select(
    'symbol action quantity price date fee'      // ← 缺 portfolioId
  ).lean();
  for (const tx of existing) {
    existingKeys.add([
      String(tx.portfolioId), tx.symbol, tx.action, tx.quantity, tx.price,   // ← 取不到，得 "undefined"
      dayKey(tx.date), tx.fee || 0
    ].join('|'));
  }
}
```

- **缺陷本质**：`select()` 投影**未包含 `portfolioId`**，而拼接键时又读取 `tx.portfolioId`。Mongoose 按投影裁剪后该字段为 `undefined`，`String(undefined)` 恒为 `"undefined"`。
- **后果**：库内键形如 `undefined|VTI|buy|10|100|2026-03-01|0`，待导入键形如 `507f1f77bcf86cd799439011|VTI|buy|10|100|2026-03-01|0`。因 `portfolioId` 是 `dedupKey` 的**第一段**，两集合**永远无交集** → `existingKeys.has(...)` 恒为 `false` → `skipped` 恒为 `0`。
- **为什么「批次内去重」仍然有效**：`seen` Set（`:222-229`）用的也是 `dedupKey`，但两侧都来自 `normalized`（`portfolioId` 由调用方注入，字段完整），故同一 CSV 内完全重复的行能被去重——这与观测「跳过重复 0 条」不矛盾（所测 CSV 两行内容不同，本就不是批次内重复）。

### 3.1 为什么既有测试没拦住（重要）

`server/test/integration/transaction.enhanced.test.js:111-118` 的 mock 直接返回了**含 `portfolioId` 的对象**：

```js
Transaction.find = (query) => ({ select: () => ({ lean: async () => [
  { portfolioId, symbol: 'VTI', action: 'buy', ... }   // ← mock 给了投影里根本没有的字段
] }) });
```

mock **无视了 `select()` 的投影参数**，把真实查询拿不到的 `portfolioId` 送了回来 → 断言 `result.skipped === 1`（`:133`）照样通过。

**实测**：`node --test server/test/integration/transaction.enhanced.test.js` → `12/12 pass`。即**测试绿而功能坏**，属「mock 比真实更宽松」导致的假阳性，与 TASK-043「自证循环」同类性质（验证未触及真实约束）。

---

## 4. 影响面

| 影响 | 说明 |
|---|---|
| **持仓与成本被静默放大** | 重复交易会被 `positionCalculator` 当作真实成交参与移动平均成本与持仓重放 → 成本价、市值、再平衡建议全部失真 |
| **无任何告警** | 返回体明确写「跳过重复 0 条」，用户会认为已去重，问题被掩盖 |
| **跨任务不受影响** | TASK-044 为纯前端收拢，未改动 `shared/`（AC12 已验证）；本缺陷为历史遗留 |

**触发条件**：用户对同一组合重复导入同一份 CSV。真实场景并不罕见——上传后报错重试、换设备再导、月度对账时误重复操作。

---

## 5. 候选修复方向（供 Planner 决策，不作为既定方案）

1. **最小修复**：`select()` 补上 `portfolioId`。改动 1 行。
2. **加固**：键拼接不依赖查询投影——如 `dedupKey` 的 `portfolioId` 段改用**入参 `portfolioId`**（它对该组合恒定），使实现不再受投影遗漏影响（防同类回归）。
3. **测试修正**：mock 必须模拟投影语义（或断言 mock 返回字段 ⊆ 投影字段），否则同类缺陷仍会被绿测试掩盖。
4. **可选**：把「库内比对」范围收敛为 `{ portfolioId, symbol: { $in: [...] } }`，避免每次导入全量拉取该组合全部交易（当前规模无感，属性能余量）。

> Planner 须在 ExecPlan 中明确：修复后 `skipped` 语义是否影响前端结果页文案；是否需要为新旧行为差异写回归测试（**建议新增「连续导入两次」用例，而非只补投影**）。

---

## 6. Acceptance Criteria

| # | 验收标准 |
|---|---|
| AC1 | 同一 CSV 连续导入两次：第一次 `imported = N / skipped = 0`，第二次 `imported = 0 / skipped = N`；库内交易总数只增加 N |
| AC2 | 同一 CSV 内**重复行**仍被去重（与 AC1 独立，不回归 `:222-229` 的批次内逻辑） |
| AC3 | 同一 CSV 导入到**两个不同组合**：两边均应成功导入（键含 `portfolioId`，不得跨组合误判重复） |
| AC4 | 字段有任何差异（`fee` / `quantity` / `price` / `date` 差一天 / `action`）时**不判重**，照常导入（幂等键语义不被放宽） |
| AC5 | 回归测试可复跑：新增用例须**模拟真实投影**（mock 返回值不得包含投影外字段），且**在旧实现上必须失败**（先验红再验绿，避免再次假阳性） |
| AC6 | 非法行整批回滚（`422` / 整批不写入）行为不变；≤500 行上限不变 |
| AC7 | 独立 Reviewer 复核：确认 `skipped` 计数路径在**真实 Mongo** 语义下可达（不接受仅 mock 验证） |

---

## 7. Scope

**In Scope**：`shared/services/transaction.service.js` 的幂等比对修复 + `server/test/integration/transaction.enhanced.test.js` 的测试修正/新增。

**Out of Scope（严格不扩）**：
- **导入批次记录与「撤销该批次」**（TR-09 的 P1 强化项，独立任务，见 `PL-1-ledger.md:72`）
- 导入历史 / 批次 ID / 审计
- CSV 解析与列映射规则（`client/src/utils/csvImport.js`）
- 前端结果页改版（除文案与计数语义必要对齐外）
- 交易业务口径（成本、超卖、fee、分红、整手）
- 任何数据清洗/去重迁移（库内已产生的重复记录如何处置需 Human 单独裁决，不在本任务内）

> ⚠️ **注意范围边界**：本次只保证「将来不再重复导入」，**不负责修复历史已重复的数据**。

---

## 8. Risks

| 编号 | 风险 | 应对 |
|---|---|---|
| R-1 | 库内**已存在的重复记录**是否让新逻辑也判重（同键两条会互相「看起来像重复」） | 新逻辑只用于拦截**新增**；历史重复数据的处置单列，需 Human 决定 |
| R-2 | 幂等键含 `price` / `quantity` 浮点全等，CSV 精度差异（如 `100` 与 `100.00`）可能导致漏判重 | AC4 明确「有差异即不判重」；浮点比较策略由 Planner 定（当前用 `Number` 全等，建议保持，勿引入 epsilon 模糊匹配以免误判） |
| R-3 | 修复后用户可能误以为「之前导过的都不见了」 | 结果页文案须明确「跳过的是与库内已存在记录完全相同的行」 |
| R-4 | 再次假阳性：只补投影、不加「连续两次」用例，仍可能被绿测试掩盖 | AC5 要求「先验红再验绿」 |
| R-5 | 本任务动 `shared/`，与 TASK-044「零服务端改动」边界不同 | 明确标注：本任务**允许**改 `shared/`（属服务端内核），但不得改 `Transaction` schema（NG1 仍适用） |

---

## 9. Blocking Dependencies

| 编号 | 依赖 | 状态 | 说明 |
|---|---|---|---|
| **B1** | **Human 确认立项与优先级** | ⏳ 待确认 | 由 Human 于 2026-10-19 提出「增加任务」。需确认：是否排期、优先级是否维持 `High`、以及 §7「历史重复数据是否一并处置」 |
| **B2** | Planner 产出 ExecPlan | ⏳ 未开始 | 修复虽小，但按项目纪律仍需 Approved ExecPlan 后方可改 `shared/` |

---

## 10. Coordination Notes

- 由 Orchestrator 于 2026-10-19 立项并完成**根因定位**（未修改任何业务代码）。
- 缺陷**非 TASK-044 引入**：TASK-044 为纯前端收拢，`shared/`、`server/` 零改动（ExecPlan §10.3 AC12 已验证）。本缺陷为 TR-09 历史实现遗留。
- 定性修正记录：原记录为「后端未跳过重复」（现象描述）。本次核实后应更准确地表述为「**去重逻辑存在，但库内比对键因投影缺字段而永不命中**」。两者对用户等价，但对修复方案与测试策略差异很大。
- 未改动 `PL-1-ledger.md`：其 TR-09 条目（`:72`）仍写「幂等去重」，与实测不符。**建议在本任务修复后由 PM 一并修订**，Orchestrator 不单方面改产品文档。

---

## 11. 实现位置与验证证据（2026-11-11，Implementer 收口核实）

> 本轮定位为「仅验证与收口，不新增业务代码」。**核实结论：收口未通过——AC1 / AC5 / AC7 不成立，本任务不可置 `Completed`。** 详见 §11.4。

### 11.1 实现位置

| 项 | 落点 |
|---|---|
| 入口函数 | `shared/services/transaction.service.js:184`（`importTransactions`） |
| 批次内去重（`seen` Set） | `shared/services/transaction.service.js:216-229` |
| 与库中记录比对（`existingKeys`） | `shared/services/transaction.service.js:231-242` |
| **缺陷仍在的投影** | `shared/services/transaction.service.js:233-235` —— `select('symbol action quantity price date fee')`，**未含 `portfolioId`** |
| 消费投影的键拼接 | `shared/services/transaction.service.js:237-240` —— `String(tx.portfolioId)` 取到 `undefined` |
| 返回体 | `shared/services/transaction.service.js:279-283`（`{imported, skipped, errors}`） |

### 11.2 测试执行输出（实跑）

**单文件** `node --test test/integration/transaction.enhanced.test.js`：

```
✔ importTransactions：幂等去重 + 成功导入计数 (1.2791ms)
✔ importTransactions：非法行整批回滚（imported=0 且返回错误） (0.7511ms)
✔ importTransactions：超卖导致整批回滚 (0.4979ms)
ℹ tests 12   ℹ pass 12   ℹ fail 0
```

**全量** `npm run test:server`：

```
ℹ tests 248   ℹ pass 248   ℹ fail 0   ℹ duration_ms 1832.408
```

其余三项：`client build` ✅（2440 modules，built in 3.49s）、`client lint` ✅（0 errors / 5 warnings）、`docs:check` ✅（138 文档 / 1423 链接 / ERROR 0 / WARN 0）。

### 11.3 真实 Mongo 语义实测（关键）

基线：`main` @ `22f5f6e`；库 `portomind_dev`（`mongodb://192.168.2.140:27017`）。

先证投影语义：

```
mongoose projection _fields = {"symbol":1,"action":1,"quantity":1,"price":1,"date":1,"fee":1}
portfolioId in projection? false
真实查询 select('symbol action quantity price date fee').lean() → portfolioId present? false => undefined
```

再跑端到端（临时组合 + 临时资产，用后即删，实测后已清理）：

```
asset found: true CN-FUND
IMPORT #1 => {"imported":1,"skipped":0,"errors":[]}
IMPORT #2 => {"imported":1,"skipped":0,"errors":[]}   ← AC1 期望 imported=0 skipped=1
rows in db for temp portfolio = 2                      ← AC1 期望 1
```

即：**同一 CSV 连续导入两次，库内仍新增记录，`skipped` 恒为 0**。与缺陷描述完全一致。

### 11.4 AC 逐条对照

| # | 标准 | 结论 | 依据 |
|---|---|---|---|
| AC1 | 两次导入 → 第二次 `imported=0 / skipped=N`，库内只增 N | ❌ **不成立** | §11.3 实测：第二次仍 `imported=1`，库内 2 条 |
| AC2 | 批次内重复行仍去重 | ⚠️ 代码层面成立、**无用例覆盖** | `:222-229` 两侧均取自 `normalized`，`portfolioId` 完整；现有用例 `:128-129` 的第三行即为批次内重复，但被同一测试的 `imported=1` 混合断言，未独立断言 |
| AC3 | 导入到两个不同组合各自成功 | ❌ **无用例** | — |
| AC4 | 字段有差异时不判重 | ❌ **无用例** | — |
| AC5 | 用例须模拟真实投影，且旧实现上必须失败 | ❌ **不成立** | `server/test/integration/transaction.enhanced.test.js:111-118` 的 mock 仍返回 `portfolioId`（投影外字段），恰是 §3.1 所述假阳性 |
| AC6 | 非法行整批回滚、≤500 行上限不变 | ✅ 成立 | 用例 `:137-153`、`:155+` 通过；输出见 §11.2 |
| AC7 | Reviewer 在真实 Mongo 语义下确认 `skipped` 路径可达 | ❌ **不成立** | §11.3 在真实 Mongo 下 `skipped` 恒为 0，路径不可达 |

### 11.5 缺口结论与处置建议（不擅自扩大改动）

- **根因仍在**：`select()` 投影缺 `portfolioId`（`:233-235`），而键拼接读取 `tx.portfolioId`（`:237-240`）。本任务 §3 已定位该根因，但代码**从未修复**（`git log -- shared/services/transaction.service.js` 仅 3 次提交，去重块自 `006b88e` 引入后未再改动）。
- **测试绿 ≠ 功能好**：现有 3 条用例之所以全绿，是因为 mock 无视投影返回了 `portfolioId`（§3.1 预先警告的假阳性模式），故 `node --test` 通过**不能**作为 AC1 的证据。
- **修复方向**（需 Human/Planner 确认后再动，本轮无授权改业务代码）：
  1. `:234` 投影补 `portfolioId`；**或**（更稳）按卡片 §5 方向 2，键拼接的 `portfolioId` 段直接改用入参 `portfolioId`，使实现不再受投影遗漏影响；
  2. 按 AC5 重写用例：mock 严格模拟投影（返回值不得含投影外字段），并补「连续导入两次」「跨组合」「字段差异」用例；新用例须在旧实现上先验红。
- **未验证项**：AC3 / AC4 无对应用例，未做人工验证；未处置库内历史重复数据（本次实测 `portomind_dev` 共 50 条交易、去重键无重复，无需清洗；生产库未查，属 §7 明确 Out of Scope）。
- **状态**：本轮**未**修改 `Status`、未置 `Completed`、未归档。建议 Orchestrator 将本任务退回 `Planning`，并按 §9 B2 补 Approved ExecPlan（符合 EXECUTION_PLANS.md §2「根因明确的简单 Bug 可免计划」的例外判断由 Orchestrator 定；但当前已证实「测试假阳性 + 根因未修」，实际修复面大于原判断）。

### 11.6 复核与修复（2026-11-11，ExecPlan Approved 后）

> 上述 §11.4 的「不成立」结论已被本轮修复取代。本节为**修复后复核记录**，
> 详细实施与红/绿输出见 `docs/development/exec-plans/active/TASK-046-csv-import-dedup-plan.md` §11。

**修复**：`shared/services/transaction.service.js:233-235` 投影补 `portfolioId`
（`select('portfolioId symbol action quantity price date fee')`）。未改 `dedupKey`、
未改批次内去重、未改返回体、未改浮点比较。

**测试重写**：`transaction.enhanced.test.js` 引入 `createProjectedStore()`，其 `find().select()`
**按投影裁剪字段**（未请求字段不返回），并新增「连续导入两次」「同批次内重复行」用例。

**红 → 绿**：

```
修复前（尊重投影的 mock）：✖ 幂等去重 + 成功导入计数 / ✖ 连续导入两次（AC1）  → pass 12 / fail 2
修复后：                    ✔ ×14                                              → pass 14 / fail 0
```

**真实 Mongo 实测**（`portomind_dev`，临时组合/资产，用后即删）：

```
IMPORT #1 => {"imported":2,"skipped":0,"errors":[]}
rows after #1 = 2
IMPORT #2 => {"imported":0,"skipped":2,"errors":[]}   ← 修复前此处为 imported:1
rows after #2 = 2                                      ← 修复前此处为 3
IMPORT #3 (date 差一天) => {"imported":1,"skipped":0,"errors":[]}  ← AC4 不判重
```

**AC 对照（修复后）**：

| # | 标准 | 结论 | 证据 |
|---|---|---|---|
| AC1 | 连续导入两次 → 第二次 `imported=0/skipped=N`，库内只增 N | ✅ | 单测「连续导入两次（AC1）」+ 真实库实测 |
| AC2 | 同批次内重复行仍去重 | ✅ | 单测「同批次内重复行去重（AC2）」 |
| AC3 | 两个不同组合各自导入成功，不跨组合误判 | ✅ | 键首段为 `portfolioId`；查询范围 `find({portfolioId})` |
| AC4 | 字段有差异不判重 | ✅ | 真实库第 3 条（date 差一天 → imported=1） |
| AC5 | 用例模拟真实投影，旧实现上必须失败 | ✅ | 先验红 2 fail（详见计划 §11.2） |
| AC6 | 非法行整批回滚不变 | ✅ | 既有用例通过 |
| AC7 | Reviewer 真实 Mongo 语义下确认 `skipped` 可达 | ⏳ | 实测已证明可达；正式复核归 Reviewer |

**未做**：未清理历史重复数据（`portomind_dev` 50 条去重键无重复；生产库未查，属 §7 Out of Scope）；
未改 `PL-1-ledger.md` TR-09 描述（归 PM）。**未修改 Status / 未置 Completed / 未归档**。
