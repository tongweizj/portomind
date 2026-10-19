# TASK-046 — CSV 二次导入未去重（幂等失效）

## Metadata

**Status:**  
`PLANNING`（待 Human 确认优先级与是否排期；**根因已定位**，非待查缺陷）

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
**关联既有需求：** `docs/product/lines/PL-1-ledger.md` §4 TR-09（CSV 批量导入）、§6.2 交易记录

**Related ADR:**  
`None`

**Execution Plan:**  
待创建（须在本任务卡经 Human 确认后由 Planner 产出）

**来源：**  
TASK-044 真实浏览器走查副产品，记录于 `docs/exec-plans/active/TASK-044-transaction-consolidation.md` §10.4 与 `docs/tasks/active/TASK-044-transaction-consolidation.md` §8。TASK-044 判定其为既有缺口、未擅自修复。

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
