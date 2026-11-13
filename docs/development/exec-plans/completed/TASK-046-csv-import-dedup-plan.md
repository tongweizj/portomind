# TASK-046 — CSV 二次导入幂等修复实施计划（小计划）

## Status

Status：Approved（2026-11-11，Human 批准「051、047、046 三份计划」；`Draft → Approved` 归 Human）

Related Task：[TASK-046](../../tasks/completed/TASK-046-csv-import-dedup.md)（独立维护任务，无 Story）。

Branch / Base：`main` @ `ee989c7`。实施时从最新 `main` 开 `feature/TASK-046-csv-import-dedup`。

Approval：**未批准**。`Draft → Approved` 归 Human（[STATES.md](../../../os/process/STATES.md) §4）。

## 1. Intent

修复「同一 CSV 连续导入两次不去重」：根因是库侧比对时 `select()` 投影**不含 `portfolioId`**，拼出的键恒为 `undefined|…`，与导入侧键永不相等。**只修投影 + 重写假阳性测试**，不改去重算法语义。

覆盖卡内 AC1～AC7（重点 AC1 / AC2 / AC5 / AC7）。

## 2. Context

- `importTransactions` 已有「批次内去重 + 与库比对」逻辑（`transaction.service.js:216-242`），语义本身正确。
- 2026-11-11 端到端实测（`portomind_dev`）：连续导入两次 → `imported:1, skipped:0` 两次，库内 2 行。
- 现有单测 12/12 通过，但 `transaction.enhanced.test.js` 的 mock **无视 `select()` 投影**、返回了 `portfolioId`，因此是**假阳性**。

## 3. Repository Findings（2026-11-11 亲读 + 实测）

| # | 事实 | 落点 |
|---|---|---|
| F-01 | 库侧查询投影不含 `portfolioId` | `shared/services/transaction.service.js:233-235`（`select('symbol action quantity price date fee')`） |
| F-02 | 拼键读取 `tx.portfolioId` → `undefined` | `:237-240` |
| F-03 | 导入侧键含真实 `portfolioId` | `:218-222`（`dedupKey`） |
| F-04 | 测试 mock 返回投影外字段 | `server/test/integration/transaction.enhanced.test.js:111-118` |
| F-05 | 端到端实测：两次导入均 `imported=1` | 卡 §11（2026-11-11 记录） |

## 4. Proposed Design

### 4.1 修复（单点，最小改动）

在库侧投影中补上 `portfolioId`：

```js
const existing = await Transaction.find({ portfolioId }).select(
  'portfolioId symbol action quantity price date fee'
).lean();
```

- 不改 `dedupKey`、不改批次内去重、不改返回体 `{imported, skipped, errors}`。
- 不改浮点比较策略（卡 R-2：保持 `Number` 全等，不引入 epsilon）。
- 不改前端结果页文案（`skipped` 语义本已存在）。

### 4.2 测试重写（防再次假阳性）

1. 把 mock 改成**模拟真实投影**：`find(...).select(...)` 只返回投影字段集合——即 mock 必须解析 `select` 参数，
   未请求的字段不得出现在返回值里。
2. 新增「连续导入两次」用例：内存 store 模拟两次 `importTransactions`，断言
   `imported=1, skipped=0` → `imported=0, skipped=1`，库内 1 行。
3. **先验红再验绿**：先在未修复实现上跑新用例（必须 FAIL，记录输出），再在修复后跑（PASS）。
4. 保留既有 3 条 import 用例（回滚、超卖）。

### 4.3 不做的事

- 不清理历史重复数据（`portomind_dev` 50 条交易去重键无重复；生产库未查，见 §8）。
- 不改 `PL-1-ledger.md` 的 TR-09 描述（归 PM，卡 §10 已记录）。

## 5. Work Breakdown

### W1 · 修复投影（15min）

- [ ] `select('portfolioId symbol action quantity price date fee')`。
- **验收**：单文件测试通过；手工脚本连续导入两次 → 第二次 `skipped=1`。

### W2 · 重写假阳性测试（1h）

- [ ] 改造 `Transaction.find` 的 mock，使其尊重 `select` 投影（可用一个 `pickFields` 辅助）。
- [ ] 新增「连续两次导入」用例（内存 store）。
- [ ] 在 `HEAD^`（未修复）上运行新用例，记录 FAIL 输出；修复后记录 PASS。
- **验收**：新用例在旧实现红、新实现绿。

### W3 · 全量验证与交接（30min）

- [ ] `npm run test:server`（248 + 新增，全绿）；
- [ ] `npm run build --workspace client`、`npm run lint --workspace client`、`npm run docs:check`；
- [ ] 计划 §11 写实施记录（含红/绿两次输出）；
- [ ] 卡内 AC 逐条勾选 + 证据；提交 + PR。

## 6. Decisions

| # | 事项 | 决定 | 依据 |
|---|---|---|---|
| D-1 | 修投影还是改拼键 | **补投影** | 改动最小且保留既有键语义；改拼键易引入新分支 |
| D-2 | 是否清理历史重复 | **不清理** | 现有数据去重键无重复；生产库需人工确认（§8） |
| D-3 | 浮点比较是否加容差 | **不加** | 卡 R-2 已论证，避免误判重 |

## 7. Verification

| AC | 方法 | 预期 |
|---|---|---|
| AC1 | W2 连续两次导入 | 第二次 `imported=0 / skipped=N`；库内只 1 份 |
| AC2 | 批次内重复行用例 | 仍去重（不回归） |
| AC3 | 非法行整批回滚 | 保持 |
| AC4 | 超卖整批回滚 | 保持 |
| AC5 | 先验红 | 旧实现上新用例必须 FAIL（输出存档） |
| AC6 | 全量测试 | 248 + 新增全绿 |
| AC7 | 独立 Reviewer | 复核投影与键路径，不接受仅 mock 验证 |

## 8. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| 再次假阳性 | 误判已修 | W2 强制「先验红」+ mock 尊重投影 |
| 生产库已有重复 | 去重后仍保留旧重复 | 上线前由运维对生产库做一次只读重复检查（本计划不含写操作） |
| 投影字段增加影响性能 | 可忽略 | 单字段，索引已含 `portfolioId` |

## 9. Rollback

单文件 + 测试两个提交；失败 `git revert`。无数据写入。

## 10. Implementer Handoff

- **输入**：本计划 §4 修复点、§5 步骤、卡内 §11 实测证据；
- **授权**：须 Human 批准本计划（本轮选择「小计划」而非免计划）；
- **边界**：只改投影 + 测试；不改键算法、不改返回体、不清理数据、不改产品文档；
- **产出**：修复提交 + 测试提交 + §11 记录 + 独立审查。

## 11. Implementation Record

### 11.1 基线（2026-11-11）

- `git rev-parse main` = `e1730a00f1ae3925d42474a022921c42c9505c77`；分支 `feature/TASK-046-csv-import-dedup`。
- 四项基线：`test:server` 248 pass；`build` ✓；`lint` 0 error / 5 warning；`docs:check` 141 文档 / ERROR 0。
- 环境：默认沙箱禁用 `child_process.spawn`，上述输出为放开该限制后的真实结果。

### 11.2 W2 · 测试重写（先做，确保能红）

`server/test/integration/transaction.enhanced.test.js`：

- 引入 `createProjectedStore(t, initial, store)`：内存版存储，`find()` 返回带 `select()` 的链式对象，
  **按 `select` 参数裁剪字段**（未请求字段一律不出现，与真实 Mongo 一致）。
  这是本任务最关键的一处——原 mock 无视投影直接返回 `portfolioId`，正是它掩盖了缺陷。
- 新增用例：
  - `importTransactions：连续导入两次 → 第二次全部跳过（AC1）`
  - `importTransactions：同批次内重复行去重（AC2）`
- 保留原有「回滚 / 超卖」用例不变。

**先验红（未修投影的实现）**：

```
✖ importTransactions：幂等去重 + 成功导入计数
✖ importTransactions：连续导入两次 → 第二次全部跳过（AC1）
✔ importTransactions：同批次内重复行去重（AC2）
✔ importTransactions：非法行整批回滚（imported=0 且返回错误）
✔ importTransactions：超卖导致整批回滚
ℹ tests 14  ℹ pass 12  ℹ fail 2
```

关键点：**改用尊重投影的 mock 后，原本「绿」的旧用例立刻变红**——直接证明原测试是假阳性。

### 11.3 W1 · 修复（单点）

`shared/services/transaction.service.js:235-237`（修复后行号；修复前 `main` 上同一处为 `:233-235`——加注释把后文整体下移 2 行，F-046-3）：

```js
// 投影必须包含 portfolioId：下方拼键读取 tx.portfolioId，缺该字段会得到 "undefined"，
// 使库侧键与导入侧键永不相等、幂等失效（TASK-046）。
const existing = await Transaction.find({ portfolioId }).select(
  'portfolioId symbol action quantity price date fee'
).lean();
```

- 未改 `dedupKey`、未改批次内去重、未改返回体、未改浮点比较（`Number` 全等）。
- **绿**：`ℹ tests 14  ℹ pass 14  ℹ fail 0`。

### 11.4 真实 Mongo 端到端实测（满足 AC7「不接受仅 mock」）

`portomind_dev`，临时组合 + 临时资产，用后即删：

```
IMPORT #1 => {"imported":2,"skipped":0,"errors":[]} (期望 imported=2 skipped=0)
rows after #1 = 2 (期望 2)
IMPORT #2 => {"imported":0,"skipped":2,"errors":[]} (期望 imported=0 skipped=2)
rows after #2 = 2 (期望 2)
IMPORT #3 (date 差一天) => {"imported":1,"skipped":0,"errors":[]} (期望 imported=1，不判重)
cleanup done
```

对比 2026-11-11 修复前同一实测：`IMPORT #2 => imported:1, skipped:0`、`rows after #2 = 2 → 3`。
即：**修复前第二次导入新增记录，修复后全部跳过**。

### 11.5 AC 逐条对照

| # | 标准 | 结论 | 证据 |
|---|---|---|---|
| AC1 | 连续导入两次：第二次 `imported=0 / skipped=N`，库内只增 N | ✅ | 单测「连续导入两次」；真实库 §11.4 |
| AC2 | 同批次内重复行仍去重 | ✅ | 单测「同批次内重复行去重（AC2）」 |
| AC3 | 导入两个不同组合各自成功（键含 portfolioId，不跨组合误判） | ✅ | 键首段为 `portfolioId`；真实库 §11.4 第 3 条证明「同组合内 date 差异不判重」，跨组合隔离由 `find({portfolioId})` 查询范围保证 |
| AC4 | 字段有差异不判重 | ✅ | 真实库 §11.4 第 3 条（date 差一天 → imported=1） |
| AC5 | 用例模拟真实投影，且在旧实现上必须失败 | ✅ | §11.2 先验红 2 fail |
| AC6 | 非法行整批回滚不变 | ✅ | 既有用例通过（`imported=0` + 错误返回） |
| AC7 | Reviewer 在真实 Mongo 语义下确认 `skipped` 可达 | ⏳ | 已由 §11.4 实测证明可达；正式复核归 Reviewer |

### 11.6 W3 · 验证输出

| 命令 | 结果 |
|---|---|
| `npm run test:server` | ✅ `tests 250 / pass 250 / fail 0`（248 + 新增 2） |
| `npm run build --workspace client` | ✅ `✓ built in 3.59s` |
| `npm run lint --workspace client` | ✅ `0 errors, 5 warnings` |
| `npm run docs:check` | ✅ `141 文档 / 1438 链接 / ERROR 0 / WARN 0` |

### 11.7 偏差与未做项

- **无偏差**。
- **未清理历史重复数据**（D-2）：本次实测 `portomind_dev` 50 条交易去重键无重复；生产库未查，属卡 §7 Out of Scope。
- 未改 `PL-1-ledger.md` 的 TR-09 描述（归 PM）。
- 未改前端结果页文案、CSV 解析、列映射、API 契约。
- 说明：任务卡 §11 上一轮（2026-11-11）记录的「收口不通过」结论已被本轮修复取代，卡内已追加复核记录。

### 11.8 返修记录（2026-11-12，审查 MINOR 处置）

审查结论见 §12（`Pass with issues`，3 MINOR）。本轮只处置 findings，不改 AC / Scope / Status。
基线仍为 `main` @ `e1730a0`；审查记录提交 `79c2ae4`；本条记录提交见 §11.9。

#### F-046-1（MINOR）AC3 / AC4 无正式用例 —— 已修

`server/test/integration/transaction.enhanced.test.js` 新增 2 条用例（复用既有 `createProjectedStore`）：

1. `importTransactions：同一 CSV 导入两个不同组合，两边都成功（AC3）`
   组合 A 导入 1 条 → 组合 B 导入同一条（必须也 `imported=1`，不得跨组合判重）→ 库内 2 行
   → 回到 A 再导入 → `imported=0/skipped=1`（证明隔离的是归属，不是把判重关掉）。
2. `importTransactions：字段有差异时不判重（AC4）`
   基准行导入后，依次导入 `fee` / `quantity` / `price` / `date 差一天` / `action` 五种变体，
   每种都必须 `imported=1/skipped=0` 且库内行数递增；末尾用「完全相同的行」做对照，
   必须 `imported=0/skipped=1`（防止把「判重被关掉」误当成 AC4 通过）。

**可证伪性（负向对照，临时回退投影后已还原）**：

```
✖ importTransactions：幂等去重 + 成功导入计数
✖ importTransactions：连续导入两次 → 第二次全部跳过（AC1）
✖ importTransactions：同一 CSV 导入两个不同组合，两边都成功（AC3）
✖ importTransactions：字段有差异时不判重（AC4）
ℹ tests 16  ℹ pass 12  ℹ fail 4
```
即新增的两条用例确实能捕捉「投影缺 `portfolioId`」这一缺陷。

#### F-046-2（MINOR）真实库证据不可复跑 —— 已修

新增 `server/scripts/verify-csv-import-idempotency.cjs`（+ `server/package.json` 脚本 `verify:csv-idempotency`）：

- 读 `MONGO_URI`（默认 `mongodb://127.0.0.1:27017/portomind_dev`），**写保护**：库名须含 `_dev|_test`；
- 覆盖 AC1（连导两次）、AC3（跨组合）、AC4（quantity 差异）；
- 临时数据 `finally` 精确删除 + `TAG` 前缀兜底清扫 + 残留复查；退出码 0/1。

**真实运行输出**（`portomind_dev`）：

```
db = portomind_dev
tag = VERIFY46_1794497573360

PASS  ① 首次导入 imported=2 / skipped=0 — {"imported":2,"skipped":0,"errors":[]}
PASS  ① 库内新增 2 行 — rows=2
PASS  ② 二次导入 imported=0 / skipped=2（AC1） — {"imported":0,"skipped":2,"errors":[]}
PASS  ② 库内仍只有 2 行（未新增） — rows=2
PASS  ③ 另一个组合导入成功（不跨组合判重，AC3） — {"imported":2,"skipped":0,"errors":[]}
PASS  ④ 仅 quantity 不同 → 照常导入（AC4） — {"imported":1,"skipped":0,"errors":[]}

断言总数 6 / 通过 6 / 失败 0
cleanup: tx:5 pf:2 asset:1
残留检查：transactions=0 portfolios=0 assets=0 => CLEAN
```

退出码 **0**。**负向对照**（临时回退投影为 `'symbol action quantity price date fee'`）：

```
PASS  ① 首次导入 imported=2 / skipped=0
PASS  ① 库内新增 2 行 — rows=2
FAIL  ② 二次导入 imported=0 / skipped=2（AC1） — {"imported":2,"skipped":0,"errors":[]}
FAIL  ② 库内仍只有 2 行（未新增） — rows=4
断言总数 6 / 通过 4 / 失败 2
```
退出码 1。即脚本在真实 Mongo 上复现了原缺陷（二次导入新增 2 行，rows 2→4），
与审查者当时在 `portomind_dev` 观察到的现象一致。

#### F-046-3（MINOR）行号漂移 —— 已修

原记录写 `service.js:233-235`。核对结论：

- **修复前**（`main`）该 `select(...)` 确实在 `:233-235`，原记录在当时是对的；
- 本次修复在两行 `select` 之前加了 2 行注释，使同一处变为 `:235-237`。

已把 §11.3 与卡内 §11.6 的引用更新为 `:235-237`，并在 §11.3 注明「修复前为 `:233-235`，
加注释后下移 2 行」，避免下次再被判为漂移。

#### 本轮验证

| 命令 | 结果 |
|---|---|
| `npm run test:server` | **252 pass / 0 fail**（250 + 新增 2） |
| `npm run build --workspace client` | ✅ `✓ built` |
| `npm run lint --workspace client` | ✅ `0 errors, 5 warnings`（既存 fixture 警告） |
| `npm run docs:check` | ✅ `141 文档 / 1438 链接 / ERROR 0 / WARN 0` |

#### 边界

未改 `dedupKey`、批次内去重、`skipped` 语义、返回体、浮点比较策略；
未清理任何历史数据；未改 `PL-1-ledger.md`（归 PM）；
`shared/services/transaction.service.js` 生产代码**零改动**（本轮只加测试与脚本）。

### 11.9 提交

| SHA | 内容 |
|---|---|
| `79c2ae4` | `docs(TASK-046): record independent review verdict`（审查记录） |
| 见 `git log -1` | `test(TASK-046): 返修 MINOR——AC3/AC4 用例 + 真实库可复跑脚本` |

## 12. Review Record

> 由独立 Reviewer 填写；Implementer 未自评（本卡无自审记录）。判定词不是状态：本章不改变 Task Status，不构成合入许可。

### 12.1 结论

- **判定：PASS WITH ISSUES**（无 BLOCKER、无 MAJOR；3 条 MINOR）。
- 审查对象：`feature/TASK-046-csv-import-dedup` @ `89ff420`（`git status --porcelain` 为空）。
- 基线：本地 `main` @ `e1730a0`（**不用** `origin/main` @ `22f5f6e`）。
- 改动范围：`git diff --stat main...HEAD` = **4 文件 / +228 −11**——生产代码只有 **1 行投影 + 2 行注释**，其余是测试重写与文档。与卡内 Scope 完全一致，无越界。
- 未审部分：真实 Mongo 端到端（本机无 `mongod`/`mongodb-memory-server`，见 F-046-2）；生产库历史重复数据（卡 §7 明确 Out of Scope）。

### 12.2 AC 逐条判定

| # | 标准 | 判定 | 证据 |
|---|---|---|---|
| AC1 | 同 CSV 连导两次：`imported=N/skipped=0` → `imported=0/skipped=N`，库内只增 N | ✅ 满足 | 用例 `transaction.enhanced.test.js:178-200`（断言 `store.length === 2`，不只看返回体）；我回退投影后该用例**转红**（`actual: 2, expected: 0`） |
| AC2 | 同批次内重复行仍去重（不回归） | ✅ 满足 | 用例 `:202-217`；回退投影时该用例**保持绿**（证明批次内去重未被改动、且与库侧键独立） |
| AC3 | 同一 CSV 导入两个不同组合：两边都成功，不跨组合误判 | ⚠️ 无专门用例，语义经我实测成立（F-046-1） | 我写的独立探针：A 导入 1、B 导入 1、库内 2 行；A 再导入 → `skipped=1` |
| AC4 | 字段有差异（fee/quantity/price/date 差一天/action）不判重 | ⚠️ 无专门用例，语义经我实测成立（F-046-1） | 同一探针：5 种差异均 `imported=1/skipped=0`；对照组完全相同的行仍 `skipped=1` |
| AC5 | 用例模拟真实投影（mock 不得返回投影外字段），旧实现上必须失败 | ✅ 满足 | `createProjectedStore` 的 `pick()` 按 `select` 参数裁剪（`:113-146`）；先验红见 §12.4 |
| AC6 | 非法行整批回滚、≤500 行上限不变 | ✅ 满足 | 既有用例 `:219-236` 保持绿；`imported=0` + 错误返回 |
| AC7 | 独立 Reviewer 在真实 Mongo 语义下确认 `skipped` 可达 | ⚠️ 部分满足（F-046-2） | 我以「尊重投影的内存存储 + 真实 `importTransactions`」证明 `skipped` 在**正确投影**下可达；未在真实 Mongo 实例上跑（环境无 mongod） |

### 12.3 我独立实跑的证据（不采信 §11 自述）

| 命令 | 结果 |
|---|---|
| `npm run test:server` | **250 pass / 0 fail**（22 文件；`main` 基线 248，新增 2）✅ 与声称一致 |
| `npm run build --workspace client` | `✓ built in 2.70s`（exit 0） |
| `npm run lint --workspace client` | `0 errors, 5 warnings`（既存 fixture 警告） |
| `npm run docs:check` | `141 文档 / 1438 链接 / ERROR 0 / WARN 0` |
| `git diff --stat main...HEAD` | 4 文件；`shared/services/transaction.service.js` 仅 `select()` 加 `portfolioId` + 注释 |

> 环境说明：沙箱默认禁 `child_process.spawn`（`node --test` 报 `spawn EPERM`）。取得真实输出的方法：逐文件 `node <file>` 执行 22 个测试文件并累加 `ℹ pass`/`ℹ fail`。

### 12.4 先验红复现 + 假阳性根因的独立证明（本任务最关键）

**(1) 先验红**：把 `select('portfolioId symbol action quantity price date fee')` 回退为 `select('symbol action quantity price date fee')`，测试文件不动：

```
✖ importTransactions：幂等去重 + 成功导入计数          → actual: 2, expected: 1
✖ importTransactions：连续导入两次 → 第二次全部跳过（AC1） → 二次导入不应新增（AC1）actual: 2, expected: 0
✔ importTransactions：同批次内重复行去重（AC2）
✔ importTransactions：非法行整批回滚
✔ importTransactions：超卖导致整批回滚
ℹ tests 14  ℹ pass 12  ℹ fail 2
```
还原后：`ℹ tests 14  ℹ pass 14  ℹ fail 0`，`git status --porcelain` 为空。

**(2) 假阳性根因的独立证明**（比「先验红」更强，直接证伪「只补投影不改 mock 也算修好」）：保持**缺陷存在**（`select` 仍缺 `portfolioId`），只把新 mock 的 `pick()` 换回「无视投影直接返回整行」——即复刻旧 mock 的行为：

```
✔ importTransactions：幂等去重 + 成功导入计数
✔ importTransactions：连续导入两次 → 第二次全部跳过（AC1）
✔ importTransactions：同批次内重复行去重（AC2）
ℹ tests 14  ℹ pass 14  ℹ fail 0
```

**结论：缺陷仍在，但 14/14 全绿——这精确复现了原假阳性机制。** 因此交付的 `createProjectedStore` 按投影裁剪**不是装饰性改动，而是本次修复可信度的前提**；「只补投影、不改 mock」的修法在本分支上会被判不合格（该交付确实同时改了 mock，✅）。已还原，`git status --porcelain` 为空。

**(3) AC3/AC4 语义探针**（我独立编写，非交付测试；用尊重投影的内存存储驱动真实 `importTransactions`）：

```
PASS  AC3 first portfolio imports — {"imported":1,"skipped":0,"errors":[]}
PASS  AC3 second portfolio also imports (no cross-portfolio dedupe) — {"imported":1,"skipped":0,...}
PASS  AC3 store has 2 rows — rows=2
PASS  AC3 re-import into A skips — {"imported":0,"skipped":1,"errors":[]}
PASS  AC4 differing fee is NOT deduped        — {"imported":1,"skipped":0,...}
PASS  AC4 differing quantity is NOT deduped   — {"imported":1,"skipped":0,...}
PASS  AC4 differing price is NOT deduped      — {"imported":1,"skipped":0,...}
PASS  AC4 differing date +1 day is NOT deduped — {"imported":1,"skipped":0,...}
PASS  AC4 differing action is NOT deduped     — {"imported":1,"skipped":0,...}
PASS  AC4 control: identical row still skipped — {"imported":0,"skipped":1,"errors":[]}
ALL AC3/AC4 PROBES OK
```

### 12.5 Findings

| # | 严重度 | 位置 | 现象 | 修法方向 |
|---|---|---|---|---|
| F-046-1 | MINOR | `server/test/integration/transaction.enhanced.test.js` | AC3（跨组合）与 AC4（字段差异）**没有对应用例**，只有计划 §11.5 的口头论证。我用独立探针证明语义目前**成立**，但缺用例意味着将来改 `dedupKey` 时无声回归 | 把跨组合与 5 种字段差异补成正式用例（约 30 行，复用 `createProjectedStore`）；这是 AC 的直接要求，不是增强 |
| F-046-2 | MINOR | 卡 §6 AC7；计划 §11.4 | AC7 要求「在真实 Mongo 语义下确认 `skipped` 可达，不接受仅 mock」。交付的真实库输出只存在于计划 §11.4 的文字，我无法复跑（本机无 `mongod`/`mongodb-memory-server`）。我用「尊重投影的内存存储 + 真实服务函数」替代验证，`skipped` 可达性成立 | 与 047 同源问题：把真实库验证做成可复跑脚本并文档化前置条件；或在 CI/开发机记录一次可核对输出 |
| F-046-3 | MINOR | 计划 §11.3 与 `transaction.service.js:233-236` | 修复注释写作 `service.js:233-235`，实际注释在 `:233-234`、`select` 在 `:235-237`（差 1 行，纯文档漂移） | 可忽略；若顺手改，只改行号 |

### 12.6 残余风险

1. **历史已重复数据不会自愈**（卡 §7 Out of Scope）：修复只保证「将来不再重复导入」。库内若已有同键多行，新逻辑不会清理；`R-1` 已记录，需 Human 另行裁决。
2. **浮点全等**：`dedupKey` 用 `Number` 全等（未引入 epsilon）。CSV `100` 与 `100.00` 解析后相等，但若上游产生 `100.0000000001` 之类的精度差，会判为不同行而重复导入。这是**刻意**的（AC4 要求「有差异即不判重」，epsilon 会误判），属已接受口径。
3. `select()` 投影与 `dedupKey` 之间存在**隐式耦合**：键拼接字段必须全部出现在投影里，否则再次失效。本次已加注释说明，但无机制性保护（例如从同一个字段常量数组同时生成 `select` 字符串与键拼接）。若后续给键加字段而忘改投影，缺陷会重现——这是本修复的结构性脆弱点，值得在将来重构时消除。
4. 用例的 `pick()` 只处理空格分隔的投影字符串，不支持 `-field`（排除）语法或对象投影；当前生产代码只用空格分隔正列表，够用，但 mock 与真实 Mongo 的保真度仍有边界。

### 12.7 独立性声明

审查者未参与本任务实现、计划编写或验收脚本编写；未修改任何业务代码、测试或 AC。§12.4 的临时回退与 mock 改造均在独立 worktree 副本中进行，已全部还原并以 `git status --porcelain` 为空证净。判定不是合入许可，**Merged 与关闭归 Human**。


### 12.8 复审记录（第二轮，2026-11-12）

**对象**：`feature/TASK-046-csv-import-dedup` @ `eb1975e`（返修提交 `eb1975e`；首轮审查记录提交 `79c2ae4`）。基线 `main` @ `e1730a0`。审查开始时 `git status --porcelain` 为空，未审到任何未提交的工作区改动。

**结论**：`Pass`（首轮 `Pass with issues` → 本轮 3 条 MINOR 全部闭环，无新增 finding）。判定不是合入许可；Merged 与关闭归 Human。

#### 12.8.1 Findings 逐条复核

| Finding | 首轮 | 本轮判定 | 依据 |
|---|---|---|---|
| F-046-1 AC3 / AC4 无正式用例 | MINOR | **已修** | AC3 新用例：组合 A 导入 1 条 → 组合 B 导入同一条仍 `imported=1`（不跨组合误判）→ 库内 2 行 → 回 A 再导入 `imported=0/skipped=1`（证明隔离的是归属、不是把判重关掉）。AC4 新用例覆盖 **5 类字段差异**（fee / quantity / price / date 差一天 / action），每类断言 `imported=1/skipped=0` 且库内行数递增；**末尾 1 条控制组**用完全相同的行断言 `imported=0/skipped=1`，防止「判重被关掉」被误判为 AC4 通过 |
| F-046-2 真实库证据不可复跑 | MINOR | **已修，且本审查者已独立复跑通过** | 见 12.8.2 |
| F-046-3 行号漂移 | MINOR | **已修** | 核对实际文件：注释在 `:233-234`、`select` 在 `:235-237`；计划 §11.3 与卡内 §11.6 均已更新为 `:235-237`，并注明「修复前 `main` 上为 `:233-235`」 |

#### 12.8.2 F-046-2：可复跑脚本与我的实跑结果

**可复跑资产**：`server/scripts/verify-csv-import-idempotency.cjs`（入口 `npm run verify:csv-idempotency --workspace server`，见 `server/package.json:15`）。

```bash
MONGO_URI=mongodb://127.0.0.1:27017/portomind_dev \
  node server/scripts/verify-csv-import-idempotency.cjs
```

我在独立库 `portomind_review2_test` 上实跑（未污染 `portomind_dev`）：

```
PASS  ① 首次导入 imported=2 / skipped=0 — {"imported":2,"skipped":0,"errors":[]}
PASS  ① 库内新增 2 行 — rows=2
PASS  ② 二次导入 imported=0 / skipped=2（AC1） — {"imported":0,"skipped":2,"errors":[]}
PASS  ② 库内仍只有 2 行（未新增） — rows=2
PASS  ③ 另一个组合导入成功（不跨组合判重，AC3） — {"imported":2,"skipped":0,"errors":[]}
PASS  ④ 仅 quantity 不同 → 照常导入（AC4） — {"imported":1,"skipped":0,"errors":[]}
断言总数 6 / 通过 6 / 失败 0
cleanup: tx:5 pf:2 asset:1
残留检查：transactions=0 portfolios=0 assets=0 => CLEAN
```

退出码 0。逐项核对所要求的性质：

| 要求 | 结论 |
|---|---|
| 写保护（库名须含 `_dev`/`_test`） | ✅ 与 047 同一实现（`assertSafeDatabase`），非 `_dev`/`_test` 直接拒绝 |
| 真实库连续导入两次 | ✅ ② 在真实 Mongo 上跑完整 `importTransactions` 链路，第二次 `imported=0/skipped=2` |
| 库内只有 1 份 | ✅ 以 `countDocuments` 断言 rows 恒为 2（两行数据各 1 份） |
| `finally` 清理 | ✅ 清理 + 残留复查，输出 `CLEAN` |
| `server/package.json` 有入口 | ✅ `:15` |
| 计划贴出真实输出 | ✅ §11.8 已贴，与本处一致 |

**定级：已修**（运行证据由我本人取得）。

#### 12.8.3 回归复核

- `test:server`：**252 / 252 pass，0 fail**（我逐文件就地跑并求和）。相对 `main` 的 248：`transaction.enhanced.test.js` 12 → 14（+2），合计 250；再加本轮… **注**：实测 252 = main 248 + 2（首轮 enhanced 新增）+ 2（本轮新增）。与卡内「250 + 2」的口径一致（其 250 已含首轮新增）。
- **未删除旧断言**：返修 diff 中 `assert` 仅新增，无 `-assert` 行。
- 关键逻辑未被改动：`dedupKey`、批次内去重、浮点比较（`toFixed`/`Math.abs`）在 `git diff main..eb1975e` 中**零命中**；改动只有 `select` 投影补 `portfolioId`。

#### 12.8.4 我独立完成的负向对照（证明新增用例可证伪）

把投影回退为 `'symbol action quantity price date fee'`（即还原原始缺陷）后跑 `transaction.enhanced.test.js`：

```
✖ importTransactions：幂等去重 + 成功导入计数
✖ importTransactions：连续导入两次 → 第二次全部跳过（AC1）
✖ importTransactions：同一 CSV 导入两个不同组合，两边都成功（AC3）
✖ importTransactions：字段有差异时不判重（AC4）
ℹ tests 16  ℹ pass 12  ℹ fail 4
```

**4 fail，其中包含本轮新增的 AC3 / AC4 两条**。还原后恢复 16/16。证实新增用例抓的正是该缺陷，不是恒真断言。

#### 12.8.5 与 TASK-047 的合并安全性

两任务同改 `shared/services/transaction.service.js`：

- 047 的守卫在 `updateTransaction`（~`:128-138`），046 的投影在 `importTransactions`（~`:235-237`），**相隔约 105 行、互不相邻**；
- 我做了双向合并试跑（047→046 与 046→047），该文件**三向合并零冲突**，合并后守卫与投影两处改动俱在；
- 唯一冲突在 `server/package.json`（两分支在同一位置各插一行 `verify:*` 脚本），需手工取并集，取完两种顺序产物一致；
- 合并后测试集 **256 / 256 pass，0 fail**（两种顺序均同）。注：并集为 252 + 4（047 的 4 条 immutable 用例），不是 252+252。

**建议顺序**：先合 **046**，再合 **047**。理由：047 的 E2E 存在问题（见下），先合 046 可让 047 的返修一并处理该交互。

> **交互缺陷提示（归 047 处置，记录于此供合并时参考）**：047 的 `e2e-task-044.mjs` 导入段不清理其写入的 2 行。单独在 047 上重跑第二次导入仍 `imported=2`（断言通过）；与 046 合并后第二次导入变 `imported=0/skipped=2`，`AC7 导入成功（2 条）` 必然 FAIL。生产代码无影响，缺陷在验证资产。我已在 047 计划 §12.7.6 记为 F-047-5。

#### 12.8.6 残余风险

1. 计划 §3 第 29 行仍写 `:233-235`，那是对**缺陷行**的描述（修复前位置），可解释、不算错。
2. 历史重复数据未清理（Out of Scope）；`portomind_dev` 实测去重键无重复。
3. 脚本依赖真实 Mongo；无库环境不可运行（与设计一致，已文档化前置条件）。

#### 12.8.7 独立性声明

审查者未参与本任务实现、计划编写或验收脚本编写；本轮未修改任何业务代码、测试、AC 或 Status；未 `git add`/`commit`/`push`；未合并 `main`、未填 `Merged`。对 `select` 投影的负向回退、以及 046+047 的双向合并试跑均在 `.review-tmp/` 独立快照中进行，已全部删除并以 `git status --porcelain` 为空证净。判定不是合入许可，**Merged 与关闭归 Human**。

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
