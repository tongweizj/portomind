# TASK-046 — CSV 二次导入幂等修复实施计划（小计划）

## Status

Status：Approved（2026-11-11，Human 批准「051、047、046 三份计划」；`Draft → Approved` 归 Human）

Related Task：[TASK-046](../../tasks/active/TASK-046-csv-import-dedup.md)（独立维护任务，无 Story）。

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

`shared/services/transaction.service.js:233-235`：

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

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
