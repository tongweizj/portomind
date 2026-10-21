# TASK-048 — Family 页分红类交易显示 `undefined`（M-3）

## Metadata

**Status:**  
`PLANNING`（由 TASK-047 拆出；范围已明确，待 Planner 产出 ExecPlan）

**Priority:**  
`Medium`（用户可见的错误文案，但仅影响 Family 页展示，不涉及数据写入）

**Owner:**  
待指派（Planner → Implementer → 独立 Reviewer）

**Created:**  
`2026-10-19`

**Updated:**  
`2026-10-19`

**Type:**  
`Bug`（展示层 / 口径重复）

**Related Product Spec:**  
无（缺陷修复，不改需求口径）

**Related ADR:**  
`None`

**Execution Plan:**  
待创建

**来源：**  
`docs/exec-plans/complete/TASK-044-transaction-consolidation.md` §11 独立审查 **M-3**。原计划并入 TASK-047，Human 于 2026-10-19 裁决**拆出独立立项**（M-3 与 TASK-047 的路由/归属守卫无文件交叠）。

---

## 1. 问题

`client/src/pages/Family.jsx` 的「最近交易」列表使用**局部硬编码的二元映射**，遇到分红类交易时标签渲染为 `undefined`，且颜色语义错误。

### 已核实的代码事实（2026-10-19 亲读，非采信审查文字）

| 位置 | 现状 | 后果 |
|---|---|---|
| `client/src/pages/Family.jsx:17` | `const ACTION_LABELS = { buy: '买入', sell: '卖出' };` —— **仅两值** | `div_cash` / `div_reinvest` 取值为 `undefined` |
| `client/src/pages/Family.jsx:238` | `{ACTION_LABELS[tx.action]}` —— 无兜底 | 页面直接渲染出 `undefined` 文本 |
| `client/src/pages/Family.jsx:237` | `tx.action === 'buy' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'` —— **二元染色** | 分红类落入 `else` 分支，被染成**跌色（绿）**，语义错误 |
| `client/src/constants/enums.js:14-19` | `TRANSACTION_ACTIONS` 已定义完整四值：`buy` / `sell` / `div_cash`（现金分红）/ `div_reinvest`（分红再投） | 权威数据源**已存在**，只是本页没用 |

### 同类重复实现统计（本次 grep 实测）

| 位置 | 形态 | 是否属本任务 |
|---|---|---|
| `client/src/pages/Family.jsx:17` | 手写 `{buy, sell}` | ✅ **必修** |
| `client/src/components/TransactionTable/index.jsx:12` | `Object.fromEntries(TRANSACTION_ACTIONS.map(...))` | ⚠️ 同类重复派生（结果正确，但重复） |
| `client/src/pages/Transaction/ImportTransactions.jsx:19` | 同上 | ⚠️ 同类重复派生（结果正确，但重复） |
| `client/src/pages/Alerts/AlertRules.jsx:34-38` | `DIRECTION_OPTIONS = [buy, sell, hold]` | ❌ **不要动**——这是「提醒方向」语义，不是交易类型，`hold` 不在 `TRANSACTION_ACTIONS` 中 |

> 说明：`TransactionTable:67` 有兜底 `|| tx.action || '—'`，故不会渲染 `undefined`，但会显示原始枚举名（如 `div_cash`）。**不属本任务范围**，仅作记录。

---

## 2. 为什么要拆出来、且不能只改一行

**为什么拆出**：M-3 只在 `pages/Family.jsx`，与本任务 TASK-047 的 `EditTransaction` / 路由 / 后端归属守卫**无任何文件或逻辑交叠**，合并只会放大审查面。这是 Human 的裁定。

**为什么不能只改一行**：最小修法是在 `Family.jsx` 里再写一次 `Object.fromEntries(TRANSACTION_ACTIONS.map(...))`——但那样全仓会有**第四份**相同派生（现有 `TransactionTable` 与 `ImportTransactions` 各一份）。这类「同一口径多处派生」正是 TASK-044 审查里 Bug-1/M-3 反复出现的根因。因此本任务的要求是**收敛为一份导出**，而非就地补一行。

---

## 3. Acceptance Criteria

| # | 验收标准 | 对应 |
|---|---|---|
| AC1 | Family 页「最近交易」中，`div_cash` 显示「现金分红」、`div_reinvest` 显示「分红再投」，**任何交易类型均不出现 `undefined`** | 问题本体 |
| AC2 | 分红类交易的标签底色**不再使用跌色（绿）**；买/卖的现有配色语义保持不变（买入红、卖出绿） | 染色语义 |
| AC3 | `buy` / `sell` 的显示与现状完全一致（回归） | 回归 |
| AC4 | 交易类型中文映射在 `client/src` 内**只有一份权威派生**：`constants/enums.js` 导出，其余使用点引用而非各自重新 `Object.fromEntries`。可用 `grep -rn "Object.fromEntries(TRANSACTION_ACTIONS"` 计数验证（期望 = 0 处就地重写，或 = 1 处且位于 enums 内） | 防复发 |
| AC5 | **未改动** `Alerts/AlertRules.jsx` 的 `DIRECTION_OPTIONS`（提醒方向 ≠ 交易类型，`hold` 不属于 `TRANSACTION_ACTIONS`） | 边界 |
| AC6 | `npm run build --workspace client` exit 0；`cd client && ./node_modules/.bin/eslint src` 0 error（**必须用本地 eslint v9**，`npx eslint` 会拉 v10 崩溃） | 构建 |
| AC7 | 改动仅限 `client/`：`server/`、`shared/`、`cron-worker/` 无 `.js` 变更 | 边界 |
| AC8 | 独立 Reviewer 复核，**不得**由 Implementer/Orchestrator 自判通过 | 纪律 |

---

## 4. Scope

**In Scope**：

- `client/src/constants/enums.js`（导出统一的中文标签映射）
- `client/src/pages/Family.jsx`（改用统一映射 + 修正染色分支）
- 可选（同类重复收敛）：`client/src/components/TransactionTable/index.jsx`、`client/src/pages/Transaction/ImportTransactions.jsx`

**Out of Scope**：

- **不动** `client/src/pages/Alerts/AlertRules.jsx` 的 `DIRECTION_OPTIONS`（不同语义）
- 不改 `shared/constants` 的枚举定义（`div_cash` / `div_reinvest` 既有语义不变）
- 不改交易写入路径、不改任何后端逻辑
- 不重做 Family 页其他区块
- 不修 `TransactionTable` 的原始枚举显示问题（见 §1 说明，非缺陷，仅记录）

---

## 5. Risks

| 编号 | 风险 | 应对 |
|---|---|---|
| R-1 | 把 `AlertRules` 的 `DIRECTION_OPTIONS` 也「统一」掉 → `hold` 缺失导致提醒规则页出错 | AC5 明确排除；ExecPlan 必须写明这是另一套语义 |
| R-2 | 分红类的配色选择成「品牌紫」还是「中性灰」缺乏依据 | 不预设具体色值，只约束「不得是跌绿」；具体色由 Planner 参照 `client/src/constants/design-tokens.js` 决定并在 ExecPlan 说明理由 |
| R-3 | 只改 Family 而不收敛重复派生 → 下次再出现第五份 | AC4 用 grep 计数验证，不依赖主观判断 |
| R-4 | 验证只看「页面不报错」而没覆盖分红数据 | 定义「不出现 undefined」为可检索事实：若 Family 页的映射来自权威源且四值齐全，则任一 action 都不可能有 `undefined`；Reviewer 应检查映射完整性而非仅截图 |

---

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 | 说明 |
|---|---|---|---|
| **B1** | Planner 产出 ExecPlan | ⏳ 未开始 | 按纪律，改 `client/` 亦需 `Approved` ExecPlan |
| **B2** | ~~Human 确认是否拆出~~ | ✅ **已解除**（2026-10-19） | 裁定拆出独立立项，即本任务 |

---

## 7. Coordination Notes

- 由 Orchestrator 于 2026-10-19 从 `TASK-047` 拆出，并完成代码事实核实（见 §1，含全仓重复实现 grep 实测）。
- 本任务与 `TASK-047` 无依赖关系，可并行规划；两者文件集不重叠。
- 本卡只登记问题与验收标准，**技术方案由 Planner 在 ExecPlan 中定**。
