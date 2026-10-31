# TASK-048 — Family 页分红类交易显示 `undefined`（M-3）

## Metadata

**Status:**  
`COMPLETED`（2026-10-20）—— 独立 Reviewer 评审通过（2026-10-20，AC1–AC8 全满足、边界清单 9/10 成立、无阻塞项，见 ExecPlan §13）→ Orchestrator 归档前复跑（`build` 0 / `eslint` 0-0 / AC4 检测式 1 行 / `test:server` 152 + `test:worker` 77 = **229 pass 0 fail**）→ **Human 于 2026-10-20 验收并指令结案**。已归档至 `development/tasks/completed/`，ExecPlan 归档至 `development/exec-plans/completed/`。

> ⚠️ 改动**仍在工作区，未提交 git**：代码 4 个文件与本次归档文档均位于 `feature/TASK-048-family-dividend-label` 分支工作树。提交属 Human 职权，不在本卡范围内。
>
> 移交项：**F-6 / R-2**（任务卡 §1 症状描述与 AC1 口径为恒真断言，需按「空白 badge + 跌绿底」改写）属 Human Intent 侧文档，未擅改；详见 §10 与 ExecPlan §13.4、§14。

**Priority:**  
`Medium`（用户可见的错误文案，但仅影响 Family 页展示，不涉及数据写入）

**Owner:**  
`Implementer`（2026-10-19 实施完成）→ `Reviewer`（2026-10-20 独立评审通过）→ `Orchestrator`（2026-10-20 归档前复跑与三处同步）→ `Human`（2026-10-20 验收并指令结案）— **已关闭**

**Created:**  
`2026-10-19`

**Updated:**  
`2026-10-20`（置 `COMPLETED` 并归档，见 §11）

**Type:**  
`Bug`（展示层 / 口径重复）

**Related Product Spec:**  
无（缺陷修复，不改需求口径）

**Related ADR:**  
`None`

**Execution Plan:**  
`docs/development/exec-plans/completed/TASK-048-family-dividend-label.md`（`Approved` 2026-10-19 → 已实施 §12 → 评审通过 §13 → **`Completed` §14）

**来源：**  
`docs/development/exec-plans/completed/TASK-044-transaction-consolidation.md` §11 独立审查 **M-3**。原计划并入 TASK-047，Human 于 2026-10-19 裁决**拆出独立立项**（M-3 与 TASK-047 的路由/归属守卫无文件交叠）。

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
| **B1** | Planner 产出 ExecPlan | ✅ **已解除**（2026-10-19，已进入 `Plan Review`） | ExecPlan 已落盘并进入 Plan Review；批准后将派独立 Implementer |
| **B2** | ~~Human 确认是否拆出~~ | ✅ **已解除**（2026-10-19） | 裁定拆出独立立项，即本任务 |

---

## 7. Coordination Notes

- 由 Orchestrator 于 2026-10-19 从 `TASK-047` 拆出，并完成代码事实核实（见 §1，含全仓重复实现 grep 实测）。
- 本任务与 `TASK-047` 无依赖关系，可并行规划；两者文件集不重叠。
- 本卡只登记问题与验收标准，**技术方案由 Planner 在 ExecPlan 中定**。

---

## 8. 裁决记录（2026-10-19）

### 8.1 Human 裁决：**先做 TASK-048**（全量范围，不缩水）

Orchestrator 曾提交三个处置方案（见 `TASK-050` 卡 §8.2），Human 于 2026-10-19 裁决：**TASK-048 按原范围先做**（对应原「方案丙」），而非缩为只做 AC4。

### 8.2 计划方必须知道的一条事实（不影响范围，但影响取舍）

`TASK-050` 的 In Scope 明确包含**删除 `client/src/pages/Family.jsx`**，而本任务 AC1–AC3 的验证对象正是该文件。

- 这**不构成不做本任务的理由**：在 `TASK-050` 落地之前，`/family` 仍是线上可达页面，分红显示 `undefined` 是**当下真实可见的缺陷**，先修有价值。
- 但 Planner 在写 ExecPlan 时**不要为 AC1–AC3 设计长期机制**（如为 Family 页新建可复用组件、加测试桩），按「就地改到正确」即可；**真正要沉淀的是 AC4 的 `enums.js` 单一导出**，它是 `TASK-050` 新组件的直接依赖。
- Reviewer 复核 AC1–AC3 时应指出其**短期性质**，不要因此判为设计不当。

### 8.3 依赖与状态

| 项 | 状态 |
|---|---|
| B1（Planner 产出 ExecPlan） | ✅ **已完成**（2026-10-19，已转 **Plan Review**） |
| B2（是否拆出） | ✅ 已解除 |
| 分支 | `feature/TASK-048-family-dividend-label`（自 `feature/TASK-049-dashboard-household-total` 顶端拉出） |
| 与 `TASK-050` 的关系 | 仍为其硬前置 `B2`，本任务完成并验收后解除 |

---

## 9. Implementation Record（Implementer，2026-10-19）

完整记录（文件清单 / 差异 D-1~D-4 / 静态与运行时验证 / 负向对照）见 ExecPlan **§12**。要点：

- **改动 4 个文件**：`constants/enums.js`（新增 `TRANSACTION_ACTION_LABELS` 唯一派生）、`components/TransactionTable/index.jsx`、`pages/Transaction/ImportTransactions.jsx`、`pages/Family.jsx`（标签 + 染色）。
- **未改**：`Alerts/AlertRules.jsx`（`hold` 保留）、`Add/EditTransaction` 表单 `<option>`、`AddTransactionForm.jsx`、`Family.jsx` 其他区块、`server/`、`shared/`、`cron-worker/`（均 `git diff` 实测空）。
- **AC4 实测**：组合检测式改动前 3 行 → 改动后**恰好 1 行**且位于 `enums.js`；排除 enums 后 0 行。
- **自测**：build 2404 modules / eslint 0 error / 运行时 11 条行级断言 11 PASS（卖绿 · 分红紫 #EEEDFF/#635BFF · 买红并存）。
- **负向对照**：切回旧版 `Family.jsx` 后同一套断言在「空 badge / 分红行底色 / 无现金分红」三项失败，还原后恢复 11/11 —— 断言可证伪。
- **⚠️ 发现任务卡 §1 描述不准确（F-6）**：旧版页面**并不会出现 `undefined` 字面量**（React 渲染 `{undefined}` 为空），真实症状是**空白 badge + 跌绿底**。故 AC1 应以「badge 文本非空且 ∈ 中文四值」验收，「页面不含 undefined」是恒真断言。详见 ExecPlan §12.5。
- **差异提示**：计划写「任务卡零改动」，但按交接惯例更新了 Status/Owner 并追加本节，**未动 AC 与 Scope 文字**（ExecPlan D-1，提请 Reviewer/Human 裁定）。
- 改动**未提交**，位于分支 `feature/TASK-048-family-dividend-label` 工作树。

---

## 10. Review Record（独立 Reviewer，2026-10-20）

完整记录（我的实测命令/输出、逐条 AC 证据、边界清单打勾）见 ExecPlan **§13**。要点：

- **结论：通过**，AC1–AC8 全满足，无阻塞项。
- **独立复跑**：`BUILD_EXIT=0`（2404 modules）· eslint 0-0 · AC4 检测式恰好 1 行（`enums.js:29`）、排除 enums 后 0 行 · `client` 改动**恰好 4 个文件** · `AlertRules.jsx`/`server/shared/cron-worker` 空。
- **运行时验证我不插库**：用 `page.route` 拦截接口喂构造数据，一次覆盖 `buy`/`sell`/`div_cash`/`div_reinvest`/**未知枚举**/**null** 六种情形，**23/23 PASS**。分红底 `rgb(238,237,255)`、字 `rgb(99,91,255)`；买/卖与改动前 class 的计算色**逐字相等**；未知与 null 退灰、不再误染跌绿。
- **确认实现者的 F-6 成立**：React 对 `{undefined}` 输出空串，故旧版页面真实症状是**空白 badge + 跌绿底**，而非页面出现 `undefined` 字样。本卡 §1（`:46`）与 AC1（`:75`）的表述不准确 —— 见下方「须处理」。
- **须处理（不阻塞验收）**：
  1. `readme.md:59` 仍写「`PLAN_REVIEW` · ExecPlan `Draft` 待审」，与 `BOARD.md` 的 VERIFYING 矛盾 —— **连续第二个任务踩同一坑**，建议让 readme 活跃任务行不再写状态词，状态唯一来源放 `BOARD.md`。
  2. 本卡 §1 症状描述与 AC1 口径需按 F-6 修正（属 Human Intent 侧文档，Reviewer 未擅改）。
- **§12.2 D-1 裁定（任务卡被改）**：**接受**。Status/Owner 若冻结在旧值即为状态失真；未动 AC/Scope，与 TASK-044/049 惯例一致。建议计划模板把「任务卡零改动」改写为「不改 AC 与 Scope 文字」。

---

## 11. Completion Record（2026-10-20）

| 项 | 内容 |
|---|---|
| 状态流转 | `PLANNING` → `PLAN_REVIEW` → `Approved`（2026-10-19 Human 批准，OD-2 方案 A 浅紫 / OD-3 表单选项不改）→ `Implementing` → `Reviewing`（2026-10-20 独立评审通过）→ **`COMPLETED`（2026-10-20）** —— 本卡未单独落 `Integrating` 状态，归档前复跑并入本节 |
| 最终验收 | Human 于 2026-10-20 明确「TASK-048 已经评审通过，请改为 done」；依 `EXECUTION_PLANS.md §7 Ownership`，最终验收属 Human，此为一次有效表达 |
| 归档位置 | 任务卡 `docs/development/tasks/completed/TASK-048-family-dividend-label.md`（`git mv`，保留历史）；ExecPlan `docs/development/exec-plans/completed/TASK-048-family-dividend-label.md`（该文件原为**未跟踪**状态，故用 `mv`；提交时须一并纳入） |
| 归档前复跑（Orchestrator，本分支） | `npm run build --workspace client` → `BUILD_EXIT=0`（5.57s）；`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` → `ESLINT_EXIT=0`、输出 0 行；`npm run test:server` → **152 pass / 0 fail**；`npm run test:worker` → **77 pass / 0 fail**（合计 **229 / 0**，与 TASK-049 一致，零服务端改动之预期） |
| AC 复验 | AC4 `grep -rn "Object.fromEntries(TRANSACTION_ACTIONS\b" client/src` → **恰好 1 行**（`constants/enums.js:29`），排除 enums 后 **0 行**；`ACTION_LABELS = {` 就地映射 **0 处**；AC5 `AlertRules.jsx` diff 空；AC7 `git status --short server shared cron-worker` 空；AC6 见上一行 |
| 改动白名单 | `git status --short client` → **恰好 4 个文件**（`constants/enums.js` · `components/TransactionTable/index.jsx` · `pages/Transaction/ImportTransactions.jsx` · `pages/Family.jsx`），无新增文件 |
| 用户可见结果 | Family 页「最近交易」：`div_cash` → 「现金分红」、`div_reinvest` → 「分红再投」，底色改为品牌浅紫 `#EEEDFF` / 字色 `#635BFF`（**不再是跌绿**）；买红 / 卖绿逐字不变；未知枚举与 `null` 退灰且不再误染跌绿。 `/portfolios/transactions` 同表同步收敛到单一映射，四值均正确显示 |
| 沉淀（对 `TASK-050` 的直接价值） | `client/src/constants/enums.js` 新增 `TRANSACTION_ACTION_LABELS`（`Object.freeze` 的唯一派生），删除 `TransactionTable:12` 与 `ImportTransactions:19` 两处就地派生 —— 全仓同类派生由 3 处降为 **1 处**。`TASK-050` 的 AC16 直接复用该导出，**不得**再自建标签表 |
| 遗留移交 | ① **F-6 / R-2**（§10）：本卡 §1 症状描述（`:46`）与 AC1 原文（`:75`）为恒真断言，实际症状是「空白 badge + 跌绿底」；属 Human Intent 侧文档，**未擅改**，待 Human 裁决是否改写为「badge 文本非空且 ∈ 中文四值」。② **N-1** `ImportTransactions.jsx` 删常量后留有两个连续空行（eslint 未拦）。③ **N-2** `AddTransaction.jsx:130` / `EditTransaction.jsx:139` 的 `<option>` 仍硬编码中文（OD-3 既定）→ 新增第五种交易类型需改 3 处，建议 `TASK-050` 之后一并收敛 |
| 未做 | 未执行任何 `git` 写操作（无 `commit` / `merge` / `rebase` 授权）；未改 AC 与 Scope 文字；未动 `Alerts/AlertRules.jsx`（`hold` 属另一套语义）、表单 `<option>`、`Family.jsx` 其他区块、`server/`、`shared/`、`cron-worker/` |
| 与 `TASK-050` 的关系 | 本卡是其硬前置 **B2**，**已于本次结案解除**（`TASK-050` 卡 §6 与 `BOARD.md` 的 Blocked 行已同步） |

### 11.1 分支落点提示（重要）

本任务产出**只存在于 `feature/TASK-048-family-dividend-label` 分支工作树，尚未提交**：

```
feature/TASK-048-family-dividend-label  ← 本任务（基 56c6507，未提交）
56c6507 (feature/TASK-049, origin/同) 代码验证
30dc525 (feature/TASK-044) TASK-044 交易记录收拢进组合管理
891d0f7 (main, origin/main) TASK-043-asset-price-consolidation
```

- `main` 仍停在 `891d0f7`，**不含 TASK-044 / TASK-048 / TASK-049 的任何工作**。
- **本任务与 TASK-050 文件集重叠**：本任务改 `pages/Family.jsx:17/237-238`，`TASK-050` 将**删除整个文件**。合并 TASK-050 时此处会冲突，正确处置是「删除优先」，保留 `enums.js` 的单一导出。
- 合并入库（044 → 048 → 049 → 050）属 Human 职权，本卡不做。

> 本卡归档后不再变更。后续问题一律在对应任务卡内跟踪，不回写本文。
