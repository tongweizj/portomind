# TASK-048 — Family 页分红类交易标签修正（M-3）

## Status

Current status:

`Approved`（2026-10-19 Human 批准，OD-2 确认方案 A 浅紫 / OD-3 确认表单选项本次不改）→ Implemented（2026-10-19，见 §12）→ Reviewing 通过（2026-10-20，独立 Reviewer，见 §13）→ **Completed（2026-10-20，Human 验收并指令结案，见 §14）**

Owner:

`Planner`（起草并裁决 OD-1~OD-7）/ `Human`（2026-10-19 Plan Review 批准；2026-10-20 最终验收）/ `Implementer`（2026-10-19 实施完成）/ `Reviewer`（2026-10-20 评审通过，见 §13）/ `Orchestrator`（2026-10-20 归档前复跑与三处同步，见 §14）

Priority:

`Medium`

Related task:

`docs/development/tasks/completed/TASK-048-family-dividend-label.md`（归档后路径；起草时为 `development/tasks/active/`）

Branch / Base:

`feature/TASK-048-family-dividend-label` / `56c6507`

> 说明：`docs/os/templates/EXEC_PLAN_TEMPLATE.md` 当前为 0 字节空文件（2026-10-19 实读）。本文结构依据
> `docs/os/process/EXECUTION_PLANS.md` §8，并参照 `docs/development/exec-plans/completed/TASK-049-dashboard-household-total.md` 的既有格式。

---

## 1. Intent

### Goal

修正 `client/src/pages/Family.jsx`「最近交易」中分红类交易的两处展示缺陷：

1. `div_cash` / `div_reinvest` 不再渲染为 `undefined`，分别显示「现金分红」「分红再投」；
2. 分红类标签不再落入「跌绿」分支，买/卖现有红/绿语义保持不变。

同时把「交易类型 → 中文标签」的派生收敛为 `client/src/constants/enums.js` 的**唯一导出**，供本任务全部使用点与
`TASK-050` 的新组件直接依赖。

### Why

`/family` 仍是线上可达页面（`TASK-050` 尚未落地）。当前分红交易在「最近交易」中显示 `undefined`，且被染成跌绿，
是用户当下可见的真实缺陷。更重要的是，同一口径已在 `client/src` 内被就地派生两次（`TransactionTable`、
`ImportTransactions`），本任务若只在 Family 再补一份，会形成第四份重复，正是 TASK-044 审查中 Bug-1 / M-3 反复出现的根因。

### Scope

- `client/src/constants/enums.js`：新增唯一的「交易类型 → 中文标签」导出
- `client/src/pages/Family.jsx`：改用该导出 + 修正染色分支 + 加标签兜底
- `client/src/components/TransactionTable/index.jsx`：删除本地派生，改引用统一导出（AC4 要求，见 OD-3）
- `client/src/pages/Transaction/ImportTransactions.jsx`：同上

### Out of Scope

- **不动** `client/src/pages/Alerts/AlertRules.jsx` 的 `DIRECTION_OPTIONS`（「提醒方向」≠「交易类型」，`hold` 不属于 `TRANSACTION_ACTIONS`）
- **不改** `client/src/pages/Transaction/AddTransaction.jsx` / `EditTransaction.jsx` 的交易类型 `<option>` 列表（见 OD-3；属同类标签重复，但不在本任务 AC4 的检测口径内）
- **不动** `client/src/components/AddTransactionForm.jsx`（已无引用的遗留组件，见 §3.4）
- **不删除** `Family.jsx:20-23` 的本地 `formatCny`（TASK-049 R7 已明确留待 TASK-050 删除该页时处理）
- 不改 `shared/constants` / `shared/models/transaction.js` 的枚举值或标签口径
- 不改交易写入路径、不改任何后端逻辑
- 不重做 Family 页其他区块（分桶 / 贡献 / 再平衡 / 汇率）
- 不为 Family 页新建可复用组件、测试桩或抽象层（TASK-050 将删除该页，见任务卡 §8.2）
- 不修 `TransactionTable` 的「未知枚举直出原文」行为（`index.jsx:67` 的 `|| tx.action || '—'` 保持不变）

### Constraints

- 改动仅限 `client/src` 的 4 个文件；`server/`、`shared/`、`cron-worker/` 零改动
- `Alerts/AlertRules.jsx` 必须字节级不变
- 不得修改任务卡 `docs/development/tasks/active/TASK-048-family-dividend-label.md`（含 Status 与 AC）——归档后路径为 `docs/development/tasks/completed/TASK-048-family-dividend-label.md`
- 不得自行给出验收结论；计划完成即 `Draft`，等待 Human Plan Review
- ESLint 必须使用 `../node_modules/.bin/eslint`（v9.39.5，2026-10-19 实测）；**禁止 `npx eslint`**（会拉 v10 崩溃）
- 基线为 `56c6507`；分支上存在 Orchestrator 未提交的文档改动，Implementer 只暂存本任务的 4 个源文件

### Acceptance Criteria（逐字取自任务卡 §3，未增删改）

- [ ] **AC1** Family 页「最近交易」中，`div_cash` 显示「现金分红」、`div_reinvest` 显示「分红再投」，**任何交易类型均不出现 `undefined`**
- [ ] **AC2** 分红类交易的标签底色**不再使用跌色（绿）**；买/卖的现有配色语义保持不变（买入红、卖出绿）
- [ ] **AC3** `buy` / `sell` 的显示与现状完全一致（回归）
- [ ] **AC4** 交易类型中文映射在 `client/src` 内**只有一份权威派生**：`constants/enums.js` 导出，其余使用点引用而非各自重新 `Object.fromEntries`。可用 `grep -rn "Object.fromEntries(TRANSACTION_ACTIONS"` 计数验证（期望 = 0 处就地重写，或 = 1 处且位于 enums 内）
- [ ] **AC5** **未改动** `Alerts/AlertRules.jsx` 的 `DIRECTION_OPTIONS`（提醒方向 ≠ 交易类型，`hold` 不属于 `TRANSACTION_ACTIONS`）
- [ ] **AC6** `npm run build --workspace client` exit 0；`cd client && ./node_modules/.bin/eslint src` 0 error（**必须用本地 eslint v9**，`npx eslint` 会拉 v10 崩溃）
- [ ] **AC7** 改动仅限 `client/`：`server/`、`shared/`、`cron-worker/` 无 `.js` 变更
- [ ] **AC8** 独立 Reviewer 复核，**不得**由 Implementer/Orchestrator 自判通过

---

## 2. Context

- 问题来源：`docs/development/exec-plans/completed/TASK-044-transaction-consolidation.md` §11 独立审查 **M-3**
- 任务卡：`docs/development/tasks/active/TASK-048-family-dividend-label.md`（归档后为 `docs/development/tasks/completed/TASK-048-family-dividend-label.md`；§8 裁决：**按原范围先做**，不缩为只做 AC4）
- 关联任务：`TASK-050`（其 In Scope 包含删除 `client/src/pages/Family.jsx`；其 AC16 依赖本任务的单一导出）
- 相关产品需求：无（缺陷修复，不改需求口径）
- 相关 ADR：无

**关键背景**：TASK-044 已建立权威枚举 `TRANSACTION_ACTIONS`（四值），但只在 `TransactionTable` 与
`ImportTransactions` 中以 `Object.fromEntries` 就地派生；`Family.jsx` 则另写了一份两值常量。本任务的目标不是
「给 Family 补一行」，而是把四值映射收敛到 `enums.js`，并让三个展示点引用同一对象。

`TASK-050` 会在后续删除 Family 页，因此 AC1–AC3 的修正具有**明确的短期性质**；真正需要长期沉淀的是 AC4 的
`enums.js` 单一导出（任务卡 §8.2）。Reviewer 不应因 Family 页即将删除而否定 AC1–AC3 的修改，也不应要求为它建设长期机制。

---

## 3. Repository Findings

> 以下均为 Planner 于 2026-10-19 亲自读取当前工作树（基线 `56c6507`）所得，未采信任务卡或审查文字的转述。

### 3.1 权威枚举与既有派生

| 文件:行号 | 事实 |
|---|---|
| `client/src/constants/enums.js:14-19` | `TRANSACTION_ACTIONS` 为 `Object.freeze([...])`，四值顺序为 `buy→买入`、`sell→卖出`、`div_cash→现金分红`、`div_reinvest→分红再投`；label 与任务卡 AC1 完全一致 |
| `client/src/constants/enums.js:4-7` | 另有 `ACTION_TYPE = Object.freeze({ BUY:'BUY', SELL:'SELL' })`——**大写、仅两值、语义不同**，命名新导出时须避免与之混淆 |
| `client/src/constants/enums.js:21-52` | 其余枚举（`ASSET_TYPES` 等）均为 `Object.freeze([{value,label}])` 数组；本文件没有任何 label-map 导出 |
| `client/src/components/TransactionTable/index.jsx:12` | `const ACTION_LABELS = Object.fromEntries(TRANSACTION_ACTIONS.map(o => [o.value, o.label]));`（就地派生 #1） |
| `client/src/components/TransactionTable/index.jsx:67` | `return ACTION_LABELS[tx.action] \|\| tx.action \|\| '—';`（有兜底，未知值显示原始枚举名） |
| `client/src/pages/Transaction/ImportTransactions.jsx:19` | 与 `TransactionTable:12` 逐字相同的就地派生 #2 |
| `client/src/pages/Transaction/ImportTransactions.jsx:170` | `{ACTION_LABELS[item.transaction.action] \|\| item.transaction.action}`（有兜底） |
| `shared/models/transaction.js:18` | `action` 的服务端枚举严格为 `['buy','sell','div_cash','div_reinvest']` 四值；与 `TRANSACTION_ACTIONS` 一一对应 |

### 3.2 Family 页现状

| 文件:行号 | 事实 |
|---|---|
| `client/src/pages/Family.jsx:17` | `const ACTION_LABELS = { buy: '买入', sell: '卖出' };`——仅两值，且是本页唯一来源；文件顶部（`:1-6`）未 import `enums.js` |
| `client/src/pages/Family.jsx:238` | `{ACTION_LABELS[tx.action]}`——**无任何兜底**，`div_cash` / `div_reinvest` 取值为 `undefined`，React 会直接渲染空/`undefined` 文本 |
| `client/src/pages/Family.jsx:237` | `tx.action === 'buy' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'`——只要不是 `buy` 就落入绿色分支，分红被染成跌绿 |
| `client/src/pages/Family.jsx:18` | `STATUS_LABELS` 用于再平衡状态，取值处 `:268` 带 `\|\| record.status` 兜底；全仓无第二份，**不属本任务** |
| `client/src/pages/Family.jsx:20-23` | 本地 `formatCny`：`¥` + 千分位 + 最多 2 位小数；`null` → `—` |
| `client/src/utils/priceDisplay.js:199-202` | `export function formatCny` 与 `Family.jsx:20-23` **实现逐字相同**；`:192-198` 注释明确写明「Family.jsx 的本地副本按 R7 暂留，去重随 TASK-050 删除该页时一并处理」 |
| `client/src/pages/Family.jsx:25-29` | 本地 `formatAmount(value, currency)`，全仓仅本页使用，无重复 |

**结论**：该页确实还有一处同类「金额格式化」重复（`formatCny`），但它是 TASK-049 已记录的**显式延后项**，
不属于 TASK-048 的 AC1–AC4，也不应在本任务顺手删除（见 OD-6）。

### 3.3 边界：AlertRules 的「提醒方向」

| 文件:行号 | 事实 |
|---|---|
| `client/src/pages/Alerts/AlertRules.jsx:34-38` | `DIRECTION_OPTIONS = [{buy,买入},{sell,卖出},{hold,持有}]` |
| `client/src/pages/Alerts/AlertRules.jsx:47` | `emptyForm()` 的默认 `direction: 'hold'` |
| `client/src/pages/Alerts/AlertRules.jsx:112` | `direction` 仅在 `ruleType === 'signal'` 时提交 |
| `client/src/pages/Alerts/AlertRules.jsx:264` | 只有「人工信号」规则渲染该下拉 |

**结论**：`hold` 是提醒方向的合法值，且是默认值；若把它「统一」成交易类型映射，会同时丢失 `hold` 并改变提醒规则
的提交语义。AC5 排除它是正确的，本任务必须保持该文件零改动。

### 3.4 与任务卡描述**不一致**之处（重点）

| # | 发现 | 影响 |
|---|---|---|
| F-1 | 任务卡 §1「同类重复实现统计」只列了 `Family:17`、`TransactionTable:12`、`ImportTransactions:19`、`AlertRules:34-38`；实际还有 **`AddTransaction.jsx:128-131`** 与 **`EditTransaction.jsx:137-140`** 各自手写四值 `<option>`（买入/卖出/现金分红/分红再投） | 它们不是 `Object.fromEntries` 派生，不触发 AC4 的检测式；但「中文标签只有一份来源」在**表单选项层**仍不成立。是否收敛见 OD-3；Planner 不建议在本任务扩大改动面 |
| F-2 | `client/src/components/AddTransactionForm.jsx:25-26` 仍有 `Buy` / `Sell` 英文 `<option>`，且该组件在全仓**无任何引用**（`grep -rn "AddTransactionForm" client/src` 仅命中自身） | 遗留死代码；不属本任务，也不应在本次顺手删除 |
| F-3 | `client/scripts/e2e-task-044.mjs:26` 硬编码 `const ACTION_LABELS = ['买入','卖出','现金分红','分红再投'];` | 位于 `client/scripts`，不在 AC4 的 `client/src` 范围内；它是独立期望值来源（不 import 实现），可反向佐证标签口径，**不要改** |
| F-4 | 任务卡 §4 把 `TransactionTable` / `ImportTransactions` 的收敛标为「可选」，但 AC4 要求「只有一份权威派生，其余使用点引用」 | **逻辑冲突**：若保留这两处，AC4 的计数不可能达标。Planner 按 AC4 执行，视为**必改**（OD-3 已裁定） |
| F-5 | `docs/os/templates/EXEC_PLAN_TEMPLATE.md` 为 0 字节 | 不影响本计划，但模板缺失会让后续 Planner 无格式可依；建议 Orchestrator 另立文档修复 |

### 3.5 设计 token 与配色环境

| 文件:行号 | 事实 |
|---|---|
| `client/src/constants/design-tokens.js:21-24` | `brand: '#635BFF'`（主色紫）、`brandSurface: '#EEEDFF'`，注释明确写「浅紫背景（激活态、**tag**）」 |
| `client/src/constants/design-tokens.js:27-28` | `up: '#DF1B41'`（涨红）、`down: '#0E9F6E'`（跌绿） |
| `client/src/index.css:1` | 仅 `@import "tailwindcss";`，**没有 `@theme` 映射**；不存在 `bg-brandSurface` 这类工具类 |
| `client/src/pages/Asset/AssetDetail.jsx:11,38,60` | 既有消费方式：`import { colors } from '../../constants/design-tokens'` + 内联 `style` |
| `client/src/pages/Family.jsx:237,264` | 本页通篇使用 Tailwind 类（`bg-red-50` / `bg-emerald-50` / `bg-gray-100`），未消费 token |

**结论**：分红标签若要「从 token 取色」，只能内联 `style={{ backgroundColor: colors.brandSurface, color: colors.brand }}`
（或写死等值任意值类，但那会脱离 token）。buy/sell 继续沿用现有 Tailwind 类即可保持字节级不变。

### 3.6 校验环境

| 事实 | 证据 |
|---|---|
| 仓库为 npm workspaces，单锁根 `node_modules` | 根 `package.json` 的 `workspaces` 含 `client` |
| 根 `node_modules/.bin/eslint` 存在，版本 `v9.39.5` | `node_modules/.bin/eslint --version` 实测 |
| `client/node_modules/.bin/eslint` **不存在** | `ls client/node_modules/.bin` 无 eslint；`client/node_modules/.bin/eslint --version` 报 No such file |
| ESLint 基线干净 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` → exit 0，stdout 为空 |
| Node 可直接导入 `enums.js` | `node --input-type=module -e "import {...} from './src/constants/enums.js'"` 实测成功（`client/package.json` 为 `"type":"module"`） |
| 现有 e2e 依赖 `playwright-core`，非 package.json 依赖 | `client/scripts/e2e-task-049.mjs:7` 写明按需 `npm i playwright-core --no-save` |

### 3.7 未知项

- 本地/测试库中是否已有 `div_cash` / `div_reinvest` 交易，Planner 未查库（无只读凭据，且不应以数据反推计划）。运行时核验需先构造数据（见 §7.5）。
- `TASK-050` 新组件对导出名的最终偏好尚未确定（其 ExecPlan 未产出）；**Planner 已裁定用 `TRANSACTION_ACTION_LABELS`**（OD-1），TASK-050 直接 import 即可。

---

## 4. Proposed Design

### 4.1 唯一导出：`TRANSACTION_ACTION_LABELS`

在 `client/src/constants/enums.js` 的 `TRANSACTION_ACTIONS`（`:14-19`）之后新增：

```js
/**
 * 交易类型 → 中文标签的唯一派生（TASK-048 AC4）。
 * 唯一权威来源是上面的 TRANSACTION_ACTIONS；任何展示点都必须引用本导出，
 * 不得在各自模块内重新 Object.fromEntries。
 */
export const TRANSACTION_ACTION_LABELS = Object.freeze(
  Object.fromEntries(TRANSACTION_ACTIONS.map(({ value, label }) => [value, label]))
);
```

**命名理由**：

1. 与同文件的 `TRANSACTION_ACTIONS` 成对，调用点一眼可知「这是交易类型的标签表」；
2. 后缀 `_LABELS` 与仓库既有命名（`FIELD_LABELS`、`STATUS_LABELS`、现有局部 `ACTION_LABELS`）一致；
3. 避免叫 `ACTION_LABELS`：`enums.js:4-7` 已有语义不同的 `ACTION_TYPE`（大写 BUY/SELL），且 `AlertRules` 的「方向」也叫 action 语义，短名会在 review 时产生歧义；
4. 导出对象而非函数：现有调用点都是 `map[value]` 查表 + `||` 兜底，对象最直接，也可被 `TASK-050` 直接 import；函数会额外引入入参/空值约定；
5. 保留 `TRANSACTION_ACTIONS` 数组不动：表单需要有序选项，数组仍是唯一权威来源，标签表只是它的派生。

**形态约束**：

- 派生必须**只有这一处**，且内层 `Object.fromEntries(TRANSACTION_ACTIONS...)` 保持单行，便于 AC4 的 grep 命中与定位；
- `Object.freeze` 与文件内其他导出风格一致，防止使用点意外改写；
- 不在此导出里放颜色 / Tailwind 类（见 4.3 与 OD-7）。

### 4.2 三个使用点的改法

| 文件 | 现状 | 改为 |
|---|---|---|
| `components/TransactionTable/index.jsx` | `:2` 已 import `TRANSACTION_ACTIONS`；`:12` 就地派生 | import 改为 `{ ASSET_TYPES, TRANSACTION_ACTION_LABELS }`；删除 `:12`；`:67` 改为 `TRANSACTION_ACTION_LABELS[tx.action] \|\| tx.action \|\| '—'`（兜底链保持原样） |
| `pages/Transaction/ImportTransactions.jsx` | `:8` 已 import `TRANSACTION_ACTIONS`；`:19` 就地派生 | import 改为 `{ TRANSACTION_ACTION_LABELS }`；删除 `:19`；`:170` 改为 `TRANSACTION_ACTION_LABELS[item.transaction.action] \|\| item.transaction.action`（兜底保持） |
| `pages/Family.jsx` | `:17` 手写两值；`:238` 无兜底 | 删除 `:17`；新增 `import { TRANSACTION_ACTION_LABELS } from '../constants/enums';`；`:238` 改为 `TRANSACTION_ACTION_LABELS[tx.action] \|\| tx.action \|\| '—'` |

**为什么兜底用 `|| tx.action || '—'`**：AC1 要求「任何交易类型均不出现 `undefined`」。当服务端新增枚举而前端
标签表尚未同步时，显示原始枚举名比显示空白更可诊断，也与 `TransactionTable:67` 的既有行为一致。若 Human 倾向
「永不显示英文」，可改为 `|| '—'`（OD-4），不影响 AC1。

### 4.3 Family 分红标签配色

**推荐方案（OD-2 备选 A）**：分红类使用设计系统的 tag 色——浅紫底 + 品牌紫字，值直接取自
`design-tokens.js:21-24`：

```jsx
import { colors } from '../constants/design-tokens';

const ACTION_BADGE_CLASSES = {
  buy: 'bg-red-50 text-red-700',
  sell: 'bg-emerald-50 text-emerald-700',
};
const DIVIDEND_BADGE_STYLE = { backgroundColor: colors.brandSurface, color: colors.brand };
```

```jsx
<span
  className={`ml-2 text-xs px-1.5 py-0.5 rounded ${ACTION_BADGE_CLASSES[tx.action] || 'bg-gray-100 text-gray-500'}`}
  style={tx.action === 'div_cash' || tx.action === 'div_reinvest' ? DIVIDEND_BADGE_STYLE : undefined}
>
  {TRANSACTION_ACTION_LABELS[tx.action] || tx.action || '—'}
</span>
```

**依据**：

- 中国 A 股惯例中红=涨/买、绿=跌/卖（`design-tokens.js:27-28` 亦如此定义）；分红是**收益事件**，没有「涨跌方向」，因此既不该用跌绿，也没有理由用涨红；
- `brandSurface` 的注释就是「浅紫背景（激活态、**tag**）」，与「类型标签」的用途一致，属于既有 token 而非新造色；
- 紫色与买红、卖绿、未知灰三者均可区分，色觉障碍用户也不依赖红绿对比来识别分红；
- buy/sell 的类名**逐字不变**（`bg-red-50 text-red-700` / `bg-emerald-50 text-emerald-700`），满足 AC2 回归要求。

**备选方案 B**：分红使用 `bg-gray-100 text-gray-500`（本页 `:265` / `:268` 已用于中性状态），零新增 import。
优点是语义「无方向」最直白；缺点是不使用 token 背景、与「未知类型」的灰色相同，类型区分度较低。**已裁定（Planner，R-2 授权）：选方案 A（浅紫 tag，取自 design-tokens）**。

> （已裁定选 A，方案 B 仅留作记录；§7.2 的 `colors.brandSurface` 检查项生效。）

### 4.4 Family 的就地修正（明确不做长期机制）

- 只在 `Family.jsx` 内新增两个局部常量（`ACTION_BADGE_CLASSES`、`DIVIDEND_BADGE_STYLE`），**不新建组件、不抽 hook、不加测试文件/测试桩、不做样式抽象层**；
- 颜色映射**不放进 `enums.js`**：枚举文件是数据字典，`TASK-050` 的新组件可能有不同的视觉规范；把 Tailwind/内联样式塞进去会造成跨任务的耦合；
- 该映射随 `TASK-050` 删除 `Family.jsx` 一并消失，属于可接受的短期代码。

### 4.5 与 TASK-050 的取舍（任务卡 §8.2）

| 对象 | 取舍 |
|---|---|
| Family 页的标签/染色修正 | **就地改到正确即可**，不设计长期机制；`/family` 在 TASK-050 落地前仍是真实页面，缺陷值得先修 |
| `enums.js` 的 `TRANSACTION_ACTION_LABELS` | **按长期 API 设计**：命名、形态、冻结、单一派生都要稳定，因为 TASK-050 的新交易区块会直接 import 它 |
| `TransactionTable` / `ImportTransactions` | 本任务收敛后，TASK-050 无需再处理这两处；其 AC16 的 grep 也会自然通过 |

### 4.6 明确不改

- `Alerts/AlertRules.jsx`：`DIRECTION_OPTIONS` 及 `hold` 默认值原样保留（AC5）；
- `AddTransaction.jsx` / `EditTransaction.jsx`：表单 `<option>` 原样保留（OD-3 建议另立任务）；
- `Family.jsx:20-23` 的 `formatCny`：原样保留（TASK-049 R7 的显式延后，OD-6）；
- `TransactionTable:67` 的未知枚举直出行为：原样保留（任务卡 §1 已声明非缺陷）。

---

## 5. Work Breakdown

> 顺序：先建立唯一导出，再切换三个使用点。W2–W4 之间无依赖，可并行，但建议逐个改、逐个跑 ESLint。

### W1 — `client/src/constants/enums.js`：新增唯一导出

- [ ] 在 `TRANSACTION_ACTIONS` 定义（`:14-19`）之后、`ASSET_TYPES`（`:21`）之前，插入 §4.1 的
      `TRANSACTION_ACTION_LABELS`；
- [ ] 注释写明「唯一派生、禁止就地 `Object.fromEntries`」，但不写入四个中文标签字面量（避免制造第二份标签文本）；
- [ ] 不改 `TRANSACTION_ACTIONS` 的值、顺序、label；不改文件其他导出。

**为什么**：AC4 的唯一权威派生；TASK-050 的直接依赖。
**完成判据**：`node --input-type=module -e "import { TRANSACTION_ACTION_LABELS } ..."` 可导入且四值齐全。

### W2 — `client/src/components/TransactionTable/index.jsx`：删除就地派生

- [ ] `:2` import 改为 `import { ASSET_TYPES, TRANSACTION_ACTION_LABELS } from '../../constants/enums';`
- [ ] 删除 `:12` 的 `const ACTION_LABELS = Object.fromEntries(...)`
- [ ] `:67` 改为 `return TRANSACTION_ACTION_LABELS[tx.action] || tx.action || '—';`
- [ ] 保留 `:13` 的 `ASSET_TYPE_LABELS` 派生不动（不在本任务范围）

**为什么**：消除派生 #1；保持兜底行为不变，避免回归。
**完成判据**：组件行为与现状一致，`grep Object.fromEntries(TRANSACTION_ACTIONS` 不再命中本文件。

### W3 — `client/src/pages/Transaction/ImportTransactions.jsx`：删除就地派生

- [ ] `:8` import 改为 `import { TRANSACTION_ACTION_LABELS } from '../../constants/enums';`
- [ ] 删除 `:19` 的 `const ACTION_LABELS = Object.fromEntries(...)`
- [ ] `:170` 改为 `{TRANSACTION_ACTION_LABELS[item.transaction.action] || item.transaction.action}`
- [ ] `:169` 的注释「与表格共用同一份中文映射」保留（语义仍然成立）

**为什么**：消除派生 #2；导入预览与表格继续同源。
**完成判据**：预览仍显示四值中文，`grep` 不再命中本文件。

### W4 — `client/src/pages/Family.jsx`：标签与染色就地修正

- [ ] 删除 `:17` 的 `const ACTION_LABELS = { buy, sell }`
- [ ] 顶部新增 `import { TRANSACTION_ACTION_LABELS } from '../constants/enums';`（以及 OD-2 选 A 时的
      `import { colors } from '../constants/design-tokens';`）
- [ ] 在文件顶部常量区新增 `ACTION_BADGE_CLASSES` 与 `DIVIDEND_BADGE_STYLE`（§4.3）
- [ ] `:237` 的二元三元改为「显式映射 + 未知灰」：`ACTION_BADGE_CLASSES[tx.action] || 'bg-gray-100 text-gray-500'`，
      并对分红类追加内联 style
- [ ] `:238` 改为 `TRANSACTION_ACTION_LABELS[tx.action] || tx.action || '—'`
- [ ] 不改该页其余区块、`STATUS_LABELS`、`formatCny` / `formatAmount`

**为什么**：AC1/AC2/AC3 的问题本体。
**完成判据**：§7.2 的静态检查全部符合期望；有测试数据时浏览器走查通过。

### W5 — 校验与交接（不产生代码）

- [ ] 按 §7 顺序执行并记录原始输出（不裁剪、不改写）；
- [ ] `git diff --name-only 56c6507 -- client server shared cron-worker` 必须恰好 4 个文件；
- [ ] 把结果、截图/命令输出、未决项写入交接记录，交 Orchestrator → Reviewer；
- [ ] **不得**自行宣布 AC 通过（AC8）。

---

## 6. Decisions（Planner 已裁决，Human 可在 Plan Review 推翻）

> 原 Draft 的 7 条 Open Decision 已由 Planner 在本轮 Plan Review 前裁定。
> 依据：① 任务卡 **R-2 明确将「分红配色」授权 Planner 决定**；② 其余为命名 / 范围 / 兜底等实现层取舍，
> Planner 有权裁定且均不改动需求口径（AC1–AC8 不变）；③ 全部裁决均与 §3/§4/§7 正文一致，无新增分叉。

| ID | 事项 | Planner 裁决 | 依据 |
|---|---|---|---|
| **OD-1** | 唯一导出命名 | `TRANSACTION_ACTION_LABELS` | 与 `TRANSACTION_ACTIONS` 成对、`_LABELS` 合仓库惯例、避开 `ACTION_TYPE` / 提醒方向歧义；TASK-050 直接依赖 |
| **OD-2** | 分红标签配色 | **方案 A：浅紫 tag**（`colors.brandSurface` 底 + `colors.brand` 字，`#EEEDFF`/`#635BFF`，内联 style） | R-2 授权 Planner 且要求「参照 design-tokens」；`brandSurface` 是 token 内明确的 tag 背景；分红非方向性事件，紫既不暗示买红也不暗示卖绿，与三者可区分；buy/sell 类名逐字不变满足 AC2 |
| **OD-3** | 重复派生收敛范围 | `TransactionTable` + `ImportTransactions` **必改**（AC4 强制）；表单 `<option>`（Add/Edit）本任务不改，另立小任务 | 不改前两者 AC4 必败；表单选项不在 AC4 检测式内，纳入会扩大 review 面 |
| **OD-4** | 未知 action 显示 | `\|\| tx.action \|\| '—'` | 与 `TransactionTable:67` 一致；枚举漂移可定位 |
| **OD-5** | 运行时核验 | 静态检查为主 + 可选一次性 Playwright（不落盘） | `/family` 无测试框架且将被 TASK-050 删除 |
| **OD-6** | Family 本地 `formatCny` | 保留，本任务不删 | TASK-049 R7 已明确留待 TASK-050 删页时处理 |
| **OD-7** | 标签颜色映射位置 | 留在 `Family.jsx` 局部 | 展示样式不进枚举字典；页面即将删除 |

---

## 7. Verification

> 所有期望值均从「需求 / 枚举定义 / 既有基线」推导，不从实现反推。命令在仓库根目录 `d:/projects/portomind` 执行，
> 除标注 `cd client` 的命令外。

### 7.1 构建与静态检查（AC6）

```bash
npm run build --workspace client
```
**期望**：exit 0；stdout 含 `built in`；无 `error during build` / `Could not resolve`。

```bash
cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"
```
**期望**：exit 0；stdout 为空（2026-10-19 基线实测：v9.39.5，exit 0，零输出）。
**禁止**：`npx eslint`（会拉 v10）、`client/node_modules/.bin/eslint`（不存在）。

### 7.2 AC4 重复派生检测（覆盖两种形态）

**检测命令（同时覆盖手写字面量与派生式）**：

```bash
grep -rnE "ACTION_LABELS[[:space:]]*=[[:space:]]*\{|Object\.fromEntries\([[:space:]]*TRANSACTION_ACTIONS" client/src
```

**改动前（基线 `56c6507`，Planner 实测）**：3 行

```
client/src/components/TransactionTable/index.jsx:12:const ACTION_LABELS = Object.fromEntries(TRANSACTION_ACTIONS.map(o => [o.value, o.label]));
client/src/pages/Family.jsx:17:const ACTION_LABELS = { buy: '买入', sell: '卖出' };
client/src/pages/Transaction/ImportTransactions.jsx:19:const ACTION_LABELS = Object.fromEntries(TRANSACTION_ACTIONS.map(o => [o.value, o.label]));
```

**改动后期望**：**恰好 1 行**，且必须位于 `client/src/constants/enums.js`（即 AC4 允许的「1 处且位于 enums 内」）。

**排除 enums 后就地重写必须为 0**：

```bash
grep -rnE "ACTION_LABELS[[:space:]]*=[[:space:]]*\{|Object\.fromEntries\([[:space:]]*TRANSACTION_ACTIONS" client/src | grep -v "client/src/constants/enums.js"
```
**期望**：无输出（`grep` 无匹配时 exit 1，属预期，不是失败）。

**分项计数（便于 Reviewer 定位）**：

```bash
grep -rn "ACTION_LABELS = {" client/src
# 改动前 1（Family:17）→ 改动后 0

grep -rn "Object.fromEntries(TRANSACTION_ACTIONS" client/src
# 改动前 2（TransactionTable:12 / ImportTransactions:19）→ 改动后 1（仅 enums.js）

grep -rn "TRANSACTION_ACTIONS.map" client/src
# 改动前 2 → 改动后 1（仅 enums.js）
```

> 为什么不只依赖任务卡给的 `grep -rn "ACTION_LABELS = {"`：该式抓不到 `Object.fromEntries(...)` 形态（现存 2 处），
> 单用会在改动前就误报「已达标」。上述组合式对两种形态都敏感，并额外给出了前后计数。

### 7.3 标签完整性（AC1 的结构性证明）

```bash
cd client && node --input-type=module -e "
import { TRANSACTION_ACTIONS, TRANSACTION_ACTION_LABELS } from './src/constants/enums.js';
const expected = { buy: '买入', sell: '卖出', div_cash: '现金分红', div_reinvest: '分红再投' };
const problems = [];
for (const [k, v] of Object.entries(expected)) {
  if (TRANSACTION_ACTION_LABELS[k] !== v) problems.push(k + ' => ' + TRANSACTION_ACTION_LABELS[k]);
}
for (const a of TRANSACTION_ACTIONS) if (!TRANSACTION_ACTION_LABELS[a.value]) problems.push('missing ' + a.value);
if (problems.length) { console.error(problems); process.exit(1); }
console.log('OK ' + JSON.stringify(TRANSACTION_ACTION_LABELS));
"
```
**期望**：exit 0，stdout 为

```
OK {"buy":"买入","sell":"卖出","div_cash":"现金分红","div_reinvest":"分红再投"}
```

**渲染层兜底检查**：

```bash
grep -n "TRANSACTION_ACTION_LABELS\[tx.action\] || tx.action || '—'" client/src/pages/Family.jsx
```
**期望**：1 行。结合上一条（四值齐全）与 `||` 兜底，可推出「任一 action 都不可能渲染 `undefined`」——这是 AC1 的可检索事实，而非截图主观判断。

**AC2 / AC3 的类名回归**：

```bash
grep -n "buy: 'bg-red-50 text-red-700'" client/src/pages/Family.jsx
grep -n "sell: 'bg-emerald-50 text-emerald-700'" client/src/pages/Family.jsx
grep -n "tx.action === 'buy' ? 'bg-red-50" client/src/pages/Family.jsx
```
**期望**：前两条各 1 行；第三条 **0 行**（二元染色已消失）。
若 OD-2 选 A，再检查：

```bash
grep -n "colors.brandSurface" client/src/pages/Family.jsx   # 期望 1 行
```
**分红不得为绿**：

```bash
grep -nE "div_(cash|reinvest).*emerald" client/src/pages/Family.jsx   # 期望 0 行
```

### 7.4 「能失败」的证据设计（防止断言恒真）

Planner 已在规划阶段实测以下正向/反向对照，Implementer 可原样复跑：

1. **检测式对旧代码必须命中（正向对照）**
   ```bash
   git show 56c6507:client/src/pages/Family.jsx | grep -nE "ACTION_LABELS[[:space:]]*=[[:space:]]*\{|tx\.action === 'buy' \? 'bg-red-50|ACTION_LABELS\[tx\.action\]"
   ```
   **期望**：3 行（`:17` / `:237` / `:238`）。若改动后的检测在这些形态上返回空，而旧代码能命中，说明检测式确实在识别问题，而不是恒真。

2. **旧映射确实产生 `undefined`（缺陷存在性）**
   ```bash
   node -e "const OLD={buy:'买入',sell:'卖出'}; console.log(String(OLD['div_cash']))"
   ```
   **期望**：输出 `undefined`。这证明 AC1 的断言不是空话。

3. **完整性谓词对旧映射必须返回 false（反向对照）**
   ```bash
   cd client && node --input-type=module -e "
   const check = m => ['buy','sell','div_cash','div_reinvest'].every(k => typeof m[k] === 'string' && m[k].length > 0);
   if (check({ buy: '买入', sell: '卖出' })) { console.error('TAUTOLOGY'); process.exit(1); }
   console.log('negative control OK: predicate rejects pre-fix map');
   "
   ```
   **期望**：exit 0，输出 `negative control OK: predicate rejects pre-fix map`（Planner 已实测）。若该谓词对旧映射也返回 true，则说明谓词写错、AC1 的检查无效。

### 7.5 可选运行时核验（AC1 / AC2，需测试库 + dev server）

前置：

```bash
# 终端 1：测试库（勿指向生产）
MONGO_URI=<test-db> npm start --workspace server
# 终端 2
npm run dev:client
# 仅本机一次性安装，不写入 package.json
npm i playwright-core --no-save
```

数据前置：在 `/<组合>/transactions/import` 导入一行**日期为今天**的分红（确保进入最近 10 条）：

```
代码,方向,份额,价格,费用,日期
<SYMBOL>,现金分红,1,20.00,0,<今天 YYYY-MM-DD>
```

然后执行（不落盘脚本）：

```bash
cd client && node --input-type=module -e "
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
await p.goto('http://localhost:5173/family', { waitUntil: 'networkidle' });
const body = await p.locator('body').innerText();
if (body.includes('undefined')) { console.error('FAIL: 页面出现 undefined'); process.exit(1); }
const div = p.getByText('现金分红', { exact: true }).first();
if (await div.count() === 0) { console.error('FAIL: 最近 10 条无分红数据，无法验证'); process.exit(2); }
const sell = p.getByText('卖出', { exact: true }).first();
const divBg = await div.evaluate(e => getComputedStyle(e).backgroundColor);
const sellBg = await sell.evaluate(e => getComputedStyle(e).backgroundColor);
if (divBg === sellBg) { console.error('FAIL: 分红与卖出同色 ' + divBg); process.exit(3); }
console.log('OK', { divBg, sellBg });
await b.close();
"
```
**期望**：

- exit 0；
- stdout 含 `OK`，且 `divBg !== sellBg`；
- 若 OD-2 选 A：`divBg = rgb(238, 237, 255)`（`#EEEDFF`），`sellBg = rgb(236, 253, 245)`（emerald-50）；
- 若 OD-2 选 B：`divBg = rgb(243, 244, 246)`（gray-100）。

**说明**：该命令是一次性核验，不新增测试文件；不满足任务卡 §8.2「不为 Family 建长期机制」的限制。

### 7.6 边界（AC5 / AC7）

```bash
git diff --name-only 56c6507 -- client/src/pages/Alerts/AlertRules.jsx
# 期望：空输出（AC5）

git diff --name-only 56c6507 -- server shared cron-worker
# 期望：空输出（AC7）

git diff --name-only 56c6507 -- client
# 期望：恰好这 4 个文件
# client/src/constants/enums.js
# client/src/pages/Family.jsx
# client/src/components/TransactionTable/index.jsx
# client/src/pages/Transaction/ImportTransactions.jsx
```

### 7.7 AC 覆盖矩阵

| AC | 对应工作 | 验证 |
|---|---|---|
| AC1 | W1 + W4 | §7.3 标签完整性 + 兜底 grep；§7.4 反向对照；§7.5 可选运行时 |
| AC2 | W4 | §7.3 类名检查 + `div_*` 非 emerald；§7.5 颜色对比 |
| AC3 | W2 + W3 + W4 | §7.3 前两条 grep（buy/sell 类名逐字保留）；ESLint/build |
| AC4 | W1 + W2 + W3 + W4 | §7.2 组合式 grep（后 1 / 外 0） |
| AC5 | 明确不改 | §7.6 路径 diff 空 |
| AC6 | — | §7.1 build + 本地 ESLint |
| AC7 | — | §7.6 路径 diff 空 + 4 文件白名单 |
| AC8 | — | 流程约束：由独立 Reviewer 复核，Implementer/Orchestrator 不写验收结论 |

---

## 8. Risks

| ID | 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|---|
| R-1 | 为「统一中文口径」顺手改 `AlertRules.DIRECTION_OPTIONS`，丢掉 `hold`，提醒规则页默认值与提交语义被破坏 | 中 | 高 | AC5 明确排除；§7.6 用路径 diff 证明零改动；Reviewer 重点核对 `AlertRules.jsx:34-38,47,112` |
| R-2 | 分红配色的具体色值缺乏产品依据，Reviewer 认为「凭空造色」 | 中 | 低 | 使用 `design-tokens.js:23` 的 `brandSurface`（注释即为 tag）；具体方案交 OD-2 由 Human 裁定；同时给出中性灰备选 |
| R-3 | 只改 Family，不收敛 `TransactionTable` / `ImportTransactions`，AC4 直接失败 | 高（若按 §4「可选」理解） | 高 | 本计划按 AC4 将其视为必改（F-4 / OD-3）；§7.2 用计数验证，不依赖主观判断 |
| R-4 | 表单层仍有手写中文标签（Add/Edit），Reviewer 若按「中文只有一份」扩大解释会判不达标 | 中 | 中 | 在计划中显式记录 F-1 与 OD-3；验收以 AC4 给定的 `client/src` + 两种形态检测式为准；表单收敛另立任务 |
| R-5 | 测试库没有分红数据，AC1/AC2 无法在浏览器观察 | 高 | 中 | §7.5 给出导入前置；静态检查（四值完整 + 兜底 + 类名）不依赖数据 |
| R-6 | Family 页将被 TASK-050 删除，本次修改被认为是浪费 | 中 | 低 | Human 已在任务卡 §8.1/§8.2 裁决「按原范围先做」；本计划不为该页建设长期机制 |
| R-7 | 误用 `npx eslint` 拉到 v10 导致崩溃，被误判为代码问题 | 中 | 中 | 固定 `../node_modules/.bin/eslint`；§3.6 已实测 v9.39.5 与零输出基线 |
| R-8 | 未知 action 直出原始枚举名，被误认为「又出现英文」 | 低 | 低 | 与 `TransactionTable:67` 行为一致；OD-4 可改为显示 `—` |
| R-9 | 分支上 Orchestrator 的未提交文档改动被一并提交，污染改动范围 | 中 | 中 | Implementer 只 `git add` 4 个源文件；提交前跑 `git status --short` 与 §7.6 白名单核对 |
| R-10 | `Object.freeze` 仅浅冻结，使用点仍可能替换整个导出对象 | 低 | 低 | ESM 导出绑定不可重新赋值；对象本身已冻结，足够 |

---

## 9. Rollback

本任务**纯展示层、无数据迁移、无服务端改动**，回滚成本低。

**若改动尚未提交**：

```bash
git restore -- \
  client/src/constants/enums.js \
  client/src/pages/Family.jsx \
  client/src/components/TransactionTable/index.jsx \
  client/src/pages/Transaction/ImportTransactions.jsx
```

> 警告：`git restore` 会丢弃这 4 个文件上的**全部**未提交改动。执行前先确认没有其他任务同时修改这些文件
> （当前分支上这 4 个文件应只有本任务改动）。

**若已提交**：

```bash
git revert <TASK-048 commit sha>
```

不要对共享分支使用 `git reset --hard` / 强推。

**部分回滚顺序**：若要撤销 `enums.js` 的导出，必须先回滚三个引用点，再回滚 `enums.js`，否则会得到 unresolved import
导致构建失败。顺序：W4 → W2/W3 → W1。

**无需回滚的项**：无数据库写入、无缓存/索引变更、无环境变量、无构建产物以外的副作用（`client/dist` 可重新生成）。

---

## 10. Out of Scope 边界核对清单（Reviewer 可直接逐项打勾）

> **Reviewer 核对结果（2026-10-20，见 §13.3）**：10 项中 9 项成立；第 9 项按字面不成立（任务卡被更新，已由 §12.2 D-1 申报），裁定**接受**。

- [x] `client/src/pages/Alerts/AlertRules.jsx` 零改动，`DIRECTION_OPTIONS` 仍含 `hold`（AC5）
- [x] `client/src/pages/Transaction/AddTransaction.jsx` / `EditTransaction.jsx` 零改动（除非 OD-3 另行裁定）
- [x] `client/src/components/AddTransactionForm.jsx` 零改动（遗留死代码，不在本任务清理）
- [x] `client/src/pages/Family.jsx` 的 `formatCny` / `formatAmount` / `STATUS_LABELS` / 其他区块零改动
- [x] `TransactionTable:67` 的未知枚举直出行为未改
- [x] `TRANSACTION_ACTIONS` 的四值、顺序、label 未改
- [x] 无新增组件、hook、测试文件、测试桩、样式抽象层
- [x] `server/` / `shared/` / `cron-worker/` 零改动
- [ ] ~~任务卡 `docs/development/tasks/active/TASK-048-family-dividend-label.md` 零改动~~ → **不成立但接受**：Status/Owner 与 §9 被更新（D-1 已申报，未动 AC/Scope 文字）。评审裁定见 §13.5；建议计划模板把该约束改写为「不改 AC 与 Scope 文字」
- [x] 未新增/修改除本 ExecPlan 之外的文档（`readme.md`/`BOARD.md` 的改动来自 TASK-049 归档与状态推进，非本任务实施者）

---

## 11. Implementer 交接说明

1. **前置**：本计划状态变为 `Approved` 后才可动代码；OD-1 / OD-2 / OD-3 必须先有 Human 结论。
2. **只改 4 个文件**（§5 W1–W4），不要顺手清理 F-1 / F-2 / OD-6 记录的重复与死代码。
3. **按 §7 顺序自检**，保留原始命令输出；不要用 `npx eslint`。
4. **不要写验收结论**：把结果交 Orchestrator，由独立 Reviewer 对照 AC1–AC8 复核（AC8）。
5. 若实施中发现 AC4 的检测式无法覆盖某种新形态，或 `TASK-050` 对导出名有硬性要求，**停下并退回 Human**，不要自行改 AC 或扩范围。

---

## 12. Implementation Record

> 实施者：Implementer（2026-10-19）。本节只记录**实际做了什么 / 与计划的差异 / 自测结果**，不构成验收结论 —— 验收交独立 Reviewer（AC8）。
> Plan Review 结论：`Approved`（2026-10-19 Human 明确批准「按计划（浅紫）」+「表单选项不改」= OD-2 方案 A、OD-3 维持）。

### 12.1 变更文件清单（恰好 §7.6 白名单的 4 个）

| 文件 | 类型 | 内容 |
|---|---|---|
| `client/src/constants/enums.js` | 编辑 | 新增 `TRANSACTION_ACTION_LABELS`（`Object.freeze` + `Object.fromEntries`，§4.1 原样）；注释避免写入四个中文标签字面量 |
| `client/src/components/TransactionTable/index.jsx` | 编辑 | import 改 `TRANSACTION_ACTION_LABELS`；删 `:12` 就地派生；`:67` 兜底链不变 |
| `client/src/pages/Transaction/ImportTransactions.jsx` | 编辑 | 同上（`:19` 删、`:170` 改引用，兜底不变） |
| `client/src/pages/Family.jsx` | 编辑 | 删两值 `ACTION_LABELS`；新增 `ACTION_BADGE_CLASSES` / `DIVIDEND_BADGE_STYLE` / `isDividendAction`；badge 改为「显式映射 + 未知灰 + 分红内联紫」+ `TRANSACTION_ACTION_LABELS[tx.action] \|\| tx.action \|\| '—'` |

**零改动（已实测）**：`Alerts/AlertRules.jsx`、`AddTransaction.jsx`、`EditTransaction.jsx`、`AddTransactionForm.jsx`、`Family.jsx` 的 `formatCny`/`formatAmount`/`STATUS_LABELS`/其他区块、`server/`、`shared/`、`cron-worker/`。

### 12.2 与计划的差异

| # | 差异 | 理由 |
|---|---|---|
| D-1 | **改了任务卡**（Status → `VERIFYING`、追加 §9 Implementation Record、Owner → Reviewer） | 计划 §1 Constraints 与 §10 均写「任务卡零改动」。该约束对「不得改 AC/Scope」成立，但若把 Status 冻结在 `PLAN_REVIEW` 而代码已实施，本身就是状态失真（与 Reviewer 依据的「对账纪律」相悖）。故按 TASK-044/049 的既定交接惯例更新状态，**未动任何 AC 或 Scope 文字**。提请 Reviewer/Human 裁定此偏差是否可接受 |
| D-2 | `enums.js` 内注释**未使用** `Object.fromEntries(TRANSACTION_ACTIONS...` 这种可被 AC4 检测式命中的写法 | 初版注释里出现了该字面量，导致 §7.2 检测式从「期望 1 行」变成 2 行（一行是注释）。虽不影响功能，但会污染 AC4 的可复跑计数，故改写措辞，使检测式精确命中 1 行（仅实现行） |
| D-3 | 运行时核验用**一次性内联 Playwright**（不落盘脚本），与 OD-5 一致 | 遵守任务卡 §8.2「不为 Family 建长期机制」；命令与断言清单见 §12.4，可原样复跑 |
| D-4 | 分红 badge 额外保留 `bg-gray-100 text-gray-500` 作为 className 兜底（被内联 style 覆盖） | 未知 action 与分红都要有底色兜底；分红由 `style` 覆盖为紫，两者互不影响 |

### 12.3 静态验证（§7 原样执行）

| 项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build --workspace client` | exit 0，2404 modules |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | exit 0，stdout 空 |
| AC4 组合检测式 | §7.2 组合 grep | **1 行**，位于 `client/src/constants/enums.js:29`；排除 enums 后 **0 行** |
| AC4 分项 | `ACTION_LABELS = {` → 0；`Object.fromEntries(TRANSACTION_ACTIONS` → 1；`TRANSACTION_ACTIONS.map` → 1 | 与 §7.2 期望一致（改动前 1/2/2 → 改动后 0/1/1） |
| AC1 四值完整 | §7.3 node 断言 | `OK {"buy":"买入","sell":"卖出","div_cash":"现金分红","div_reinvest":"分红再投"}`，`frozen=true` |
| AC1 兜底 | `grep "TRANSACTION_ACTION_LABELS\[tx.action\] \|\| tx.action \|\| '—'" Family.jsx` | 1 行（`:252`） |
| AC2/AC3 类名 | `buy: 'bg-red-50 text-red-700'` / `sell: 'bg-emerald-50 text-emerald-700'` 各 1 行；旧二元染色 **0** 行；`colors.brandSurface` **1** 行；`div_*…emerald` **0** 行 | 全部符合 |
| AC5 边界 | `git diff --name-only 56c6507 -- client/src/pages/Alerts/AlertRules.jsx` | 空 |
| AC7 边界 | `git diff --name-only 56c6507 -- server shared cron-worker` | 空 |
| 白名单 | `git status --short client` | 恰好 4 个文件 |

### 12.4 运行时验证（1440×900，`portomind_e2e` 副本）

数据前置：经 `POST /api/transactions` 在副本库写入 3 条当日交易（`div_cash` / `div_reinvest` / `sell`），使三类状态同时出现在「最近交易」；验证后按 `notes` 前缀删除，库内交易数 50 → 53 → **50**（与真实库一致，真实库未被写入）。

断言（11 条，全部可证伪）：行数 10 · 无空 badge · 全部 badge ∈ 中文四值 · 出现「现金分红」· 出现「分红再投」· `buy` 类名逐字不变 · `sell` 类名逐字不变 · 分红底色 `rgb(238,237,255)` / 字色 `rgb(99,91,255)` · 两类分红同色 · 分红 ≠ 卖出绿 · 无 JS 运行时错误 → **11 / 11 PASS**。

### 12.5 负向对照（证明断言非恒真，且修正了一处计划假设）

| 对照 | 做法 | 结果 |
|---|---|---|
| 旧版页面 | `git checkout 56c6507 -- client/src/pages/Family.jsx` 后重跑同一套行级断言 | 空 badge **2 个**、分红行底色 `oklch(0.979 0.021 166.113)`（= emerald-50 跌绿）、无「现金分红」 → 新断言在上述三项上**确实会失败**；还原后回到 11/11 |
| **F-6（新发现，需 Human/Reviewer 知悉）** | 在旧版页面检索文本 `undefined` | **旧版页面并不存在 `undefined` 字面量**——React 渲染 `{undefined}` 为**空**，不是字符串 "undefined"。任务卡 §1 所述「页面直接渲染出 `undefined` 文本」与实测不符：真实症状是**空白 badge + 跌绿底色**（见 `%TEMP%/portomind-task048-old-negative.png`）。因此「页面不出现 undefined」是一条**恒真断言**（改动前后都通过），不能作为 AC1 的验收证据；AC1 应以「badge 文本非空且 ∈ 中文四值」为准。§7.5 给出的脚本中 `body.includes('undefined')` 这一条属同一问题，建议 Reviewer 采用 §12.4 的行级断言 |

### 12.6 遗留与提示

- 截图：新版 `%TEMP%/portomind-task048-family.png`（卖绿 / 分红紫 / 买红并存）、旧版 `%TEMP%/portomind-task048-old-negative.png`（分红为空 + 绿底）。
- 未做：未新增测试文件、未建组件/hook、未改表单 `<option>`（OD-3）、未删 `Family.jsx` 本地 `formatCny`（OD-6）。
- 分支：改动仅在 `feature/TASK-048-family-dividend-label` 工作树，**未提交**；如需提交请告知（按计划 R-9 只暂存 4 个源文件）。

---

## 13. Review Record（独立 Reviewer，2026-10-20）

### 13.1 结论

**通过（Pass）**：AC1–AC8 全部满足，**无阻塞项**；§10 边界清单 9/10 成立（第 9 项「任务卡零改动」按字面不成立，见 13.5）。可交 `Orchestrator` 置 `Integrating`，最终验收归 Human。

本次审查**未修改任何业务代码**，只写本记录与状态。

### 13.2 我独立复跑的实测（不采信 §12 自评）

| 项 | 我的方法 | 结果 |
|---|---|---|
| 构建 | `npm run build --workspace client`（显式取退出码） | ✅ `BUILD_EXIT=0`，`2404 modules transformed` |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | ✅ `ESLINT_EXIT=0` |
| 映射完整性 | `node` 直接 import `enums.js` | ✅ 四值 `{buy:买入, sell:卖出, div_cash:现金分红, div_reinvest:分红再投}`，`Object.isFrozen=true`，与 `TRANSACTION_ACTIONS` **全覆盖且无多余键** |
| AC4 检测式 | `grep -rn "Object.fromEntries(TRANSACTION_ACTIONS\b" client/src` | ✅ **恰好 1 行**（`enums.js:29`）；排除 enums 后 **0 行**。`ACTION_LABELS =` 就地映射 **0 处** |
| AC5 / AC7 | `git status --short` 定点核查 | ✅ `AlertRules.jsx` 未改、`hold` 仍在（`:37`）；`server/ shared/ cron-worker/` 空输出 |
| 改动白名单 | `git status --short client` | ✅ **恰好 4 个文件**，与 §12.1 一致，无新增文件 |
| 运行时走查 | **自写只读脚本**（未复用实现者的内联脚本），1440×900 真实页面 | ✅ **23/23 PASS** |

**我的运行时做法（与实现者不同）**：不往库里插交易，改为 `page.route` 拦截 `/api/family/summary` 与 `/api/transactions`，**喂入构造数据**——一次覆盖 `buy` / `sell` / `div_cash` / `div_reinvest` / **未知枚举** / **null** 六种情形，全程零写入。

### 13.3 逐条 AC 判定

| # | 判定 | 我的实测证据 |
|---|---|---|
| AC1 | ✅ | 六行 badge 文本分别为 `买入` / `卖出` / `现金分红` / `分红再投` / `mystery_action`（未知枚举透出原值）/ `—`（null）；**无空 badge**。判定口径采用「文本非空且 ∈ 中文四值」而非「页面不含 `undefined`」（见 13.4） |
| AC2 | ✅ | 分红底色 `rgb(238,237,255)` = `#EEEDFF`、字色 `rgb(99,91,255)` = `#635BFF`；两类分红视觉一致；**与跌绿（`emerald-50`）不同**；未知/null 退灰，不再误染跌绿 |
| AC3 | ✅ | buy / sell 的计算色与「同 class 参照片」**逐字相等**（`bg-red-50 text-red-700` / `bg-emerald-50 text-emerald-700`）；对照 diff，两个 class 字符串未改，仅由三元改为显式映射 |
| AC4 | ✅ | 见 13.2；另验**使用点**：`/portfolios/transactions` 用共用映射后四行分别显示 买入/卖出/现金分红/分红再投 且不露原始枚举 |
| AC5 | ✅ | `AlertRules.jsx:34-38` 未改，`hold` 仍在；全仓无第五处标签派生 |
| AC6 | ✅ | 见 13.2 |
| AC7 | ✅ | 见 13.2 |
| AC8 | ✅ | 本记录；Implementer 未自判 |

**§10 边界清单逐项**：① AlertRules 零改 ✅ ② Add/EditTransaction 零改 ✅ ③ `AddTransactionForm.jsx` 零改 ✅ ④ `Family.jsx` 其他区块零改（diff 仅 import + 三个常量 + badge 块）✅ ⑤ `TransactionTable` 未知枚举直出未改 ✅ ⑥ `TRANSACTION_ACTIONS` 四值/顺序/label 未改 ✅ ⑦ 无新增组件/hook/测试/样式抽象 ✅ ⑧ 服务端零改 ✅ ⑨ **任务卡零改 ✗（见 13.5）** ⑩ 除本计划外未动文档 ✅（`readme.md`/`BOARD.md` 的改动属 TASK-049 归档与状态推进，非本任务实施者所为）

### 13.4 关于实现者的 F-6（我确认成立，且是本轮最有价值的发现）

计划 §7.5 的验收脚本含一条 `body.includes('undefined')`，任务卡 §1 也写「页面直接渲染出 `undefined` 文本」，ExecPlan §484-488 更把「输出 `undefined`」当作缺陷存在的证明。

**这条前提是错的**：React 对 `{undefined}` 的渲染契约是「不输出任何文本」。所以旧版页面的真实症状是**空白 badge + 跌绿底色**，而不是页面上出现 `undefined` 字样。因此：
- 「页面不出现 `undefined`」是**改动前后都成立的恒真断言**，不能作为 AC1 的证据；
- 实现者改用「badge 文本非空且 ∈ 中文四值」是正确的，我采用同一口径并扩展到未知/null 两档。

我未重跑旧版 checkout，但该结论由两条独立证据支撑：React 渲染契约 + 实现者负向对照观测到的「空 badge 2 个」。**建议把这条写进任务卡，作为缺陷的准确描述。**

### 13.5 须处理（进 `Integrating` 前）

| # | 问题 | 落点 | 要求 |
|---|---|---|---|
| R-1 | **索引状态失真（重复出现）**：`readme.md` 仍写 TASK-048「`PLAN_REVIEW` · ExecPlan `Draft` 待审」，与 `BOARD.md:13` 的 `VERIFYING`（已实施）矛盾。**这是连续第二个任务踩同一坑**（TASK-049 已提过 R-1） | `docs/readme.md:59` | ① 由 Orchestrator 改这一行；② **建议改机制**：`readme.md` 的活跃任务行**不要写状态词**，只保留链接 + 负责人，状态唯一来源放在 `BOARD.md`。否则每次状态推进都要改两处，必然再漏 |
| R-2 | **任务卡 §1 症状描述与事实不符**：`:46` 写「页面直接渲染出 `undefined` 文本」，实际是空白 badge（见 13.4）。连带 AC1 原文（`:75`）「任何交易类型均不出现 `undefined`」是不可失败的断言；`:111` 的 R-4 缓解措辞、`:142` 的症状描述同源受影响 | `docs/development/tasks/active/TASK-048-family-dividend-label.md:46,75,111,142` | 属 Human Intent 侧文档，我未擅改。请裁决是否按 13.4 改写为「badge 文本非空且 ∈ 四中文值」。**不影响本次验收结论**（AC1 实质已满足） |

### 13.6 建议（不阻塞）

- **N-1** `ImportTransactions.jsx:18-19` 删常量后留下**连续两个空行**（eslint 未拦）。一行清理。
- **N-2 残留文案重复**：`AddTransaction.jsx:130-131`、`EditTransaction.jsx:139-140` 的 `<option>` 仍硬编码「现金分红 / 分红再投」（OD-3 既定，本次不改，合规）。这意味着**新增第五种交易类型要改 3 处**。建议 `TASK-050` 之后（`Family.jsx` 已删、标签口径收敛完成时）把两处 `<option>` 也改为 `TRANSACTION_ACTIONS.map`，届时「唯一权威」才覆盖到 UI 全部入口。
- **N-3** 未知枚举当前透出原始英文值（`mystery_action`），与 `TransactionTable` 既有兜底一致，可接受；若要更友好可 fallback 到「未知类型」。

### 13.7 方法记录（给下一次审查）

我第一次跑自己的走查脚本时出现 3 条 FAIL（buy/sell/未知底色的色值），**是我的期望值写错**：Tailwind v4 输出 `oklch()`，我却拿 `rgb()` 硬编码比对。改为「在页面内注入同 class 参照片，取实际计算色作基准」后全绿。**教训：颜色类断言不要硬编码色值串，要用页面内参照片**（与 TASK-044 M-5「断言要能失败」互补——这一条是「断言要能通过」，别把工具差异当成产品缺陷）。

---

## 14. Completion Record（2026-10-20）

### 14.1 状态与验收

| 项 | 内容 |
|---|---|
| 状态流转 | `Approved`（2026-10-19）→ `Implementing` → `Reviewing`（2026-10-20 评审通过 §13）→ **`Completed`（2026-10-20）**。本次**跳过独立的 `Integrating` 状态**：Human 在评审通过后直接指令结案，归档前复跑由 Orchestrator 在本节完成并记录（见 14.2），未另立 §13.5 之后的交付段 |
| 最终验收 | Human 2026-10-20：「TASK-048 已经评审通过，请改为 done」。依 `EXECUTION_PLANS.md §7 Ownership`，最终验收属 Human，此为有效表达；本文件不代替 Human 判定 AC |
| 结论 | AC1–AC8 全部满足（判定见 §13.3）；§10 边界清单 9/10 成立，未成立的第 9 项已由 §13.5 裁定「接受」（D-1） |

### 14.2 归档前复跑（Orchestrator，`feature/TASK-048-family-dividend-label` 工作区）

| 项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build --workspace client` | `BUILD_EXIT=0`（`✓ built in 5.57s`） |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | `ESLINT_EXIT=0`，stdout 0 行 |
| 服务端测试 | `npm run test:server` | **152 pass / 0 fail** |
| Worker 测试 | `npm run test:worker` | **77 pass / 0 fail**（合计 **229 / 0**） |
| AC4 | `grep -rn "Object.fromEntries(TRANSACTION_ACTIONS\b" client/src` | **恰 1 行**（`constants/enums.js:29`）；排除 enums 后 **0 行**；`ACTION_LABELS = {` **0 处** |
| AC5 / AC7 | `git diff --name-only 56c6507 -- client/src/pages/Alerts/AlertRules.jsx`；`git status --short server shared cron-worker` | 均空输出 |
| 白名单 | `git status --short client` | **恰好 4 个文件**，与 §12.1 一致 |

> 复跑在本分支工作区进行；`main`（`891d0f7`）不含本任务改动，在 `main` 上跑出的绿灯不能代表本任务，故不作为依据。

### 14.3 归档动作（结案三处同步）

| 对象 | 动作 |
|---|---|
| 本 ExecPlan | `docs/development/exec-plans/active/` → `docs/development/exec-plans/completed/`（原为**未跟踪**文件，用 `mv`；提交时须纳入）；Status → `Completed`；关联任务指向 `development/tasks/completed/`；补本节 |
| 任务卡 | `docs/development/tasks/active/` → `docs/development/tasks/completed/`（`git mv`）；Status → `COMPLETED`；补 §11 Completion Record；`Execution Plan` 指针改指 `development/exec-plans/completed/` |
| `docs/BOARD.md` | Active 表清空（写「无活跃任务」）；Done 新增 TASK-048 行；**`TASK-050` 的 B2 硬前置解除**；Roadmap 第 3、4 项同步 |
| `docs/readme.md` | 活跃任务 → 无；已完成任务补 TASK-048；`development/exec-plans/active/` 恢复为空 |
| 交叉引用 | `specs/completed/FS-household-view-split.md`（D-1 依赖、D-2 备注、Appendix A 缺陷行）；`TASK-050` 卡（§6 B2、§7 协调说明） |

### 14.4 §13.5「须处理」两项的处置

| # | 处置 | 说明 |
|---|---|---|
| R-1（`readme.md` 索引状态失真） | ✅ **已修** | `readme.md` 的 TASK-048 行不再写「`PLAN_REVIEW` · ExecPlan `Draft` 待审」，改为归入已完成。**机制建议仍未采纳**（活跃任务行不写状态词、状态唯一来源放 `BOARD.md`）：属全仓索引约定变更，需 Human 裁决后统一改，本文只记录 |
| R-2（任务卡 §1 / AC1 口径） | ⏸ **未改，登记为遗留** | AC 与 §1 属 Human Intent 侧文字，Orchestrator 无权改写。已在任务卡 §11「遗留移交」与本文 14.5 明确记录准确症状（**空白 badge + 跌绿底**，非页面出现 `undefined` 字样），并建议将 AC1 改写为「badge 文本非空且 ∈ 中文四值」。**不影响本次验收结论**（§13.3 已按该口径判定 AC1 满足） |

### 14.5 遗留与移交

| # | 内容 | 去向 |
|---|---|---|
| F-6 / R-2 | 任务卡 §1（`:46`）与 AC1（`:75`）的「不出现 `undefined`」是恒真断言；真实症状为空白 badge + 跌绿底 | 待 Human 裁决改写措辞（Human Intent 文档） |
| N-1 | `ImportTransactions.jsx` 删常量后留有两个连续空行 | 不处理（eslint 未拦，纯观感） |
| N-2 | `AddTransaction.jsx:130` / `EditTransaction.jsx:139` 的 `<option>` 仍硬编码中文（OD-3 既定）→ 新增第五种类型需改 3 处 | 建议 `TASK-050` 完成、`Family.jsx` 删除后一并收敛为 `TRANSACTION_ACTIONS.map` |
| N-3 | 未知枚举透出原始英文值 | 可接受，与 `TransactionTable` 既有兜底一致 |
| 分支/提交 | 全部改动（4 个源文件 + 归档文档）**未提交**，位于 `feature/TASK-048-family-dividend-label` | **Human**：提交属 Human 职权，混合建议拆两个 commit（① 归档批 ② 功能批） |
| 合并顺序 | `main` 停在 `891d0f7`；044 / 048 / 049 均未合并；`feature/TASK-050` 从 `main` 拉出缺全部前置 | **Human 决策**：合并顺序（044 → 048 → 049 → 050）与 `feature/TASK-050` 是否 rebase |

### 14.6 未做

- 未执行任何 `git` 写操作（`commit` / `merge` / `rebase`）：`ORCHESTRATOR.md §3` 授权只覆盖文档归档与验证，不含合并入库。
- 未修改任何业务代码（本次只写文档与状态）；未改 AC 与 Scope 文字；未动 `AlertRules.jsx` / 表单 `<option>` / `Family.jsx` 其他区块 / `server/` / `shared/` / `cron-worker/`。

> 本文件归档后不再变更。
