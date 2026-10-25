# TASK-050 — 组合列表页承接家庭五区块，`/family` 下线

## Status

Current status:

`Draft`（2026-10-21 Planner 起草）→ 待 `Plan Review`

Owner:

`Planner`（2026-10-21 起草）/ `Human`（Plan Review 待批）/ `Implementer`（待派）/ `Reviewer`（待派）

Priority:

`High`（家庭视图搬迁的最后一块；`/family` 一天不删，就存在两套家庭资产渲染）

Related task:

`docs/tasks/active/TASK-050-portfolio-list-household-blocks.md`

Related spec:

`docs/product/specs/FS-household-view-split.md`（`Approved`，交付单元 **G2**，需求 R8–R18 / AC9–AC20）

Branch / Base:

`feature/TASK-050` / `c463c85`（已于 2026-10-21 rebase 到 `feature/TASK-048-family-dividend-label` 顶端，含 `TASK-044` + `TASK-049` + `TASK-048` 全部前置）

> 说明：`docs/templates/EXEC_PLAN_TEMPLATE.md` 仍为 0 字节空文件（2026-10-19 实读）。本文结构依据
> `docs/process/EXECUTION_PLANS.md` §8，并参照 `docs/exec-plans/complete/TASK-048-family-dividend-label.md` 的既有格式。

---

## 1. Intent

### Goal

把 `/family` 页除总资产卡以外的**五个区块**搬进 `/portfolios`（组合列表页），随后删除 `/family` 页面、路由与侧边栏入口，**不留第二套家庭资产渲染**。顶层导航 6 → 5。

### Why

1. **家庭横向汇总与组合列表是同一批数据的三层**（总资产 → 币种结构/组合占比 → 组合卡片）。现在分在两页，看占比要去 `/family`、点组合又跳回 `/portfolios`，来回跳。
2. `TASK-049` 已把总资产卡搬到 `/`，`/family` 剩下的五块**已是纯冗余展示**；两页并存意味着两张页面都要跟着改，是持续的信息架构债务。
3. `/family` 是全仓唯一「一个接口渲染五块」的页面，也是 `formatCny` / 币种符号 / 再平衡状态标签**三处就地复制**的宿主。删除它才能完成 `TASK-048` 未竟的「单一来源」收口。

### Scope

- `client/src/pages/Portfolio/List.jsx`（改造）
- `client/src/components/Household/`（新增 5 个展示组件）
- `client/src/utils/priceDisplay.js` + `client/src/constants/enums.js`（补导出，收口口径）
- `client/src/pages/Portfolio/RebalanceHistory.jsx`（1 处标签引用，见 OD-2）
- 删除 `client/src/pages/Family.jsx`、`router.jsx` 的 `/family`、`Sidebar.jsx` 的「家庭视图」
- 文档 4 处：`manual/CLIENT.md`、`product/lines/PL-6-household.md`、`product/lines/PL-1-ledger.md`、本 FS 状态行

### Out of Scope

| # | 不做 | 依据 |
|---|---|---|
| 1 | 不改 `server/` `shared/` `cron-worker/`，不改 `/api/family/*` 契约，不改 `hooks/useFamily.js`（`queryKey: ['family-summary']` 保持） | FS R17 / AC19 |
| 2 | 不改 `PortfolioCard` 信息结构 | FS NG-4 |
| 3 | 不改汇率业务口径（折算规则、缺价处理） | FS NG-5 |
| 4 | 不做家庭总资产趋势、不做按账户类型/大类分组 | FS NG-1 / NG-2 |
| 5 | 不修 `TASK-046`（CSV 幂等）/ `TASK-047`（归属守卫） | FS NG-6 |
| 6 | 不为 `/family` 加显式重定向 | FS OQ-1（`*` 通配已兜底 → AC17） |
| 7 | 不改提醒中心任何逻辑 | FS NG-3 |
| 8 | 不给汇率面板加展开态持久化 | FS §6.3 P1-1（需 Human 单独特批） |

### Constraints

- **纯客户端**，零服务端改动（AC19）。
- 交易类型中文标签必须引用 `constants/enums.js` 的 `TRANSACTION_ACTION_LABELS`（AC16），不得就地派生。
- 币种符号沿用家庭页口径 `US$` / `CA$`（Human 2026-10-21 裁决，见 §6 OD-1）。
- 归档口径：分桶与占比**固定为「非归档口径」**，与页面「显示已归档」开关互不影响（R14 / AC14）。
- 不得为此任务新建测试框架或测试文件（沿用 `TASK-048`/`049` 的做法：一次性只读脚本走查）。
- `docs/templates/EXEC_PLAN_TEMPLATE.md` 为空，不依赖它。

### Acceptance Criteria（逐字取自 `FS-household-view-split.md` §7 → G2，未增删改）

- [ ] **AC9** `/portfolios` 自上而下依次为：标题行 → 币种分桶 → 贡献占比条 → 组合卡片 → 最近交易（≤5 条）→ 最近再平衡（≤10 条）→ 汇率折叠面板
- [ ] **AC10** 贡献占比条各段宽度之和 ≤ 100%；`ratio == null` 的组合不占条宽且在图表中标注「折算不完整」
- [ ] **AC11** 图例项点击跳 `/portfolios/view/:id/positions`（与现 `Family.jsx:63` 一致）
- [ ] **AC12** 最近交易恰好 5 条 + 「查看全部」按钮跳 `/portfolios/transactions`
- [ ] **AC13** 汇率面板默认收起；展开后「同步汇率」调用 `POST /api/family/fx/sync` 成功，手动录入后 `fx-rates` 与 `family-summary` 两个 query 均失效刷新
- [ ] **AC14** 打开「显示已归档」时，页面出现一行口径说明，明确「分桶与占比不含已归档组合」
- [ ] **AC15** `grep -rn "pages/Family" client/src` 无结果；`grep -rn "'/family'" client/src` 无结果；侧边栏为 5 项
- [ ] **AC16** `grep -rn "ACTION_LABELS = {" client/src` 无结果（分红标签走 `enums.js` 单一导出）
- [ ] **AC17** 直接访问 `/family` 落到 `/portfolios`（由 `*` 通配承接），无白屏、无报错
- [ ] **AC18** 四个文档落点已更新（`CLIENT.md` / `PL-6` / `PL-1` / 本 FS 的状态行）
- [ ] **AC19** `git status server shared cron-worker` 空输出
- [ ] **AC20** 独立 Reviewer 复核通过

---

## 2. Context

- 产品需求：`docs/product/specs/FS-household-view-split.md`（G2，R8–R18）
- 任务卡：`docs/tasks/active/TASK-050-portfolio-list-household-blocks.md`
- 已完成的前置：`docs/exec-plans/complete/TASK-049-dashboard-household-total.md`（总资产卡已进 `/`）、`docs/exec-plans/complete/TASK-048-family-dividend-label.md`（`TRANSACTION_ACTION_LABELS` 单一导出）
- 家庭汇总服务：`shared/services/familySummary.service.js`（一次返回 `totalCny` / `buckets` / `fxRates` / `portfolioContributions` / `recentTransactions` / `recentRebalanceRecords` / `asOf`；排除 `archived`）
- 前端 hook：`client/src/hooks/useFamily.js`（`useFamilySummary` / `useFxRates` / `useSyncFxRates` / `useUpsertFxRate`）

---

## 3. Repository Findings

> 2026-10-21 在 `feature/TASK-050`（`c463c85`）上逐条实读，非采信文档转述。

### 3.1 待搬迁代码的实际行号（**与 FS Appendix A 不一致，以本节为准**）

FS 起草时 `Family.jsx` 是 6 区块形态，`TASK-048` 已改动该文件，行号整体后移。实测（当前 300 行）：

| 区块 | 实际行号 | 说明 |
|---|---|---|
| `CURRENCY_META`（中文名 + `US$`/`CA$` 符号） | `:10-15` | 与 `priceDisplay.js` 的 `CURRENCY_META` **同币种两套符号** |
| `BUCKET_ORDER = ['USD','CAD','CNY','HKD']` | `:17` | 分桶展示顺序 |
| `ACTION_BADGE_CLASSES` / `DIVIDEND_BADGE_STYLE` / `isDividendAction` | `:21-28` | `TASK-048` 新增，仅本文件使用 |
| `STATUS_LABELS`（再平衡状态中文） | `:30` | 全仓唯一一份中文映射 |
| `formatCny`（本地副本） | `:32-35` | 与 `utils/priceDisplay.js:199` 重复 |
| `formatAmount` | `:37-41` | 千分位 + 该文件自己的符号表 |
| `BucketCards` | `:43-62` | 分桶 4 卡 |
| `ContributionList` | `:64-98` | 贡献**列表**（本任务要改为堆叠条） |
| `FxManager` | `:100-172` | 汇率列表 + 手动录入表单 |
| 同步汇率按钮 + `syncError` | `:203-209` | 在页面标题行右侧 |
| 总资产卡 | `:212-219` | 已被 `TASK-049` 抽走，**本任务直接丢弃此段** |
| 分桶挂载点 | `:222` | |
| 贡献列表挂载点 | `:224-232` | 与「最近动态」两列并排 |
| 最近交易 | `:236-263` | |
| 最近再平衡 | `:265-292` | |
| 汇率挂载点 | `:296-297` | |

> FS（含 AC11 与 Appendix A）引用的 `Family.jsx:63`「贡献点击落 `/portfolios/view/:id/positions`」，实为现在的 `:75`（`ContributionList` 的 `onClick`）；`FS :199-207` 的总资产卡实为 `:212-219`。**AC 文字按 FS 逐字保留（不改需求原文），以本节行号为准。**

### 3.2 已有的可复用实现（**不要重新造**）

| 符号 | 位置 | 结论 |
|---|---|---|
| `formatCny` | `utils/priceDisplay.js:199`（`TASK-049` 抽取的唯一来源） | ✅ 直接 import；`Family.jsx` 的 `:32-35` 副本随删页消失 |
| `CURRENCY_META`（`$` / `C$` / `¥` / `HK$` + `digits`） | `utils/priceDisplay.js:25-30` | ⚠️ 符号口径与家庭页不同，见 OD-1 |
| `currencyMeta(currency)` | `utils/priceDisplay.js:32` | 可用于取 `symbol`，但**没有**千分位格式化能力 |
| `ASSET_CURRENCIES`（含中文名：美元/加元/人民币/港币） | `constants/enums.js` | ✅ 币种中文名的权威来源，`CURRENCY_LABELS` 应由它派生 |
| `TRANSACTION_ACTION_LABELS` | `constants/enums.js`（`TASK-048`） | ✅ 交易类型中文，禁止再写 `ACTION_LABELS = {` |
| `LoadingState` / `EmptyState` / `ErrorState` | `components/DataState/index.jsx` | ✅ 无 props，直接用 |
| `ROUTES.PORTFOLIO_LIST` / `PORTFOLIO_TX_ALL` / `PORTFOLIO_TAB(id,'positions')` | `constants/routes.js` | ✅ 全部已有，**不要**拼裸字符串 |
| `colors.brand` / `colors.brandSurface` | `constants/design-tokens.js` | ✅ `#635BFF` / `#EEEDFF` |

### 3.3 与 FS 描述不一致、必须据实处理的三处

| # | FS / 任务卡所述 | 实测事实 | 处置 |
|---|---|---|---|
| **F-1** | 「最近交易保留 5 条」「最近再平衡 10 条（现状上限）」 | 接口 `RECENT_LIMIT = 10`，**交易与再平衡都返回 10 条** | 交易必须在客户端 `slice(0, 5)`；再平衡直接渲染（已是 10）。**不改服务端**（R17） |
| **F-2** | 「`formatCny` 双份待 `TASK-050` 去重」 | `TASK-049` 已把唯一实现放 `utils/priceDisplay.js:199`，`Family.jsx:32` 仍是副本 | 删页即去重；新组件一律 import `priceDisplay` 版 |
| **F-3** | 任务卡 §1 表格写「`Family.jsx:17` 手写 `{buy, sell}`」 | 已被 `TASK-048` 修掉，现为 `TRANSACTION_ACTION_LABELS`（`:252`） | 搬移时**保持**引用方式，不得退回手写表（AC16） |

### 3.4 顺带发现的同类缺陷（OD-2 待裁）

`client/src/pages/Portfolio/RebalanceHistory.jsx:94` 直接渲染原始枚举：

```jsx
<td className="px-4 py-2 whitespace-nowrap">{rec.status}</td>
```

组合详情的再平衡历史表因此显示 `EXECUTED` / `PENDING` / `REVOKED` 英文，而 `Family.jsx:282` 已有一套中文映射。**这是同一口径第二次出现两处不同**，与 `TASK-048` 的 M-3 同型。

### 3.5 现状页面结构（`pages/Portfolio/List.jsx`，全文 54 行）

```
title row（h1「投资组合」+ 显示已归档开关 + 新建）
grid md:grid-cols-2 → PortfolioCard[]
empty state
```

`isLoading` 时**整页早退** `<p>加载组合中…</p>`（`:13`），`isError` 时整页早退（`:14`）。加入家庭区块后，早退会让家庭区块一并不显示——需下沉状态（§4.4）。

### 3.6 校验环境

- 构建：`npm run build --workspace client`
- 静态检查：`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"`（**必须用本地 eslint v9**，`npx eslint` 会拉 v10 崩溃；`client/node_modules/.bin` 为空，二进制在根 `node_modules/.bin`）
- 运行时：`client/scripts/` 下已有 `e2e-task-044.mjs` 可作模板（`playwright-core` + 本机 Chrome）；本任务**不落盘新脚本**，用一次性内联脚本（沿用 `TASK-048` D-3）

### 3.7 未知项

- 设计稿（Ardot 7 屏）未随仓库，组合管理屏尚未随本次改版重画 → 本轮按既有 Tailwind 语汇实现，视觉细节属 Human 后续验收项（FS §9 收尾已登记）。

---

## 4. Proposed Design

### 4.1 组件划分与数据流（**核心决策**）

FS R16 要求 5 个组件放 `components/Household/`。本计划把它们全部设计为**纯展示组件（只接 props，不含 hook、不含 loading/error）**，数据由 `List.jsx` 统一取一次。

**为什么不沿用 `TotalAssetsCard` 的「组件内自取数据」模式**：

| 方案 | 结果 |
|---|---|
| 5 个组件各自 `useFamilySummary()` | React Query 同 key 会去重成 1 个网络请求，但**加载态会出现 5 块、错误态会出现 5 块红提示**；且 5 处重复的 `isLoading/isError` 分支 |
| **`List.jsx` 取一次 + 纯展示组件**（采纳） | 1 次请求、**1 个加载块、1 个错误块**；组件可单测、易读；`List.jsx` 只多 7 行状态逻辑 |

**容错边界（`TASK-049` R-4 的教训）**：`family-summary` 失败**不得**拖垮组合卡片。因此：

- `List.jsx` 的 `usePortfolios` 与 `useFamilySummary` 是两个独立 query，互不 await；
- `usePortfolios` 的 loading/error 只下沉到**卡片网格区域**（不再整页早退）；
- `family-summary` 失败时只在卡片**上方**渲染 1 个 `ErrorState`，卡片下方的两块（交易/再平衡）整体不渲染；
- `FxPanel` 用独立的 `useFxRates`，自己容错，与上面两者都无关。

### 4.2 口径收口（两处新增导出，均为「补一个派生」，不新建文件）

#### 4.2.1 `client/src/constants/enums.js`

新增两个枚举 + 两个派生映射。理由：`TASK-048` 已确立「中文标签的唯一派生放 `enums.js`」的惯例（`priceDisplay.js` 里的 `assetClassLabels` 是更早的历史做法，不复刻）。

```js
/**
 * 币种中文名（AC9 分桶卡 / 汇率面板共用）。
 * 权威来源是上面的 ASSET_CURRENCIES，不得就地再写。
 */
export const CURRENCY_LABELS = Object.freeze(
  Object.fromEntries(ASSET_CURRENCIES.map(({ value, label }) => [value, label]))
);

/**
 * 再平衡记录状态（取值来自 shared/models/rebalanceRecord.js）。
 * OD-2 裁决：顺带修 RebalanceHistory.jsx 的英文枚举直出。
 */
export const REBALANCE_STATUSES = Object.freeze([
  { value: 'PENDING', label: '待确认' },
  { value: 'EXECUTED', label: '已执行' },
  { value: 'REVOKED', label: '已撤销' },
]);

/** 状态 → 中文标签的唯一派生。禁止在页面内就地重写（同 TRANSACTION_ACTION_LABELS 的纪律）。 */
export const REBALANCE_STATUS_LABELS = Object.freeze(
  Object.fromEntries(REBALANCE_STATUSES.map(({ value, label }) => [value, label]))
);
```

#### 4.2.2 `client/src/utils/priceDisplay.js`

现有 `CURRENCY_META` 增加一个 `householdSymbol` 字段，并新增 `formatMoney`。**不动** `symbol` 与 `digits`（行情页 `fmtPrice` 依赖，改它会全局漂移）。

```js
const CURRENCY_META = {
  USD: { symbol: '$',   householdSymbol: 'US$', digits: 2 },
  CAD: { symbol: 'C$',  householdSymbol: 'CA$', digits: 2 },
  CNY: { symbol: '¥',   householdSymbol: '¥',   digits: 3 },
  HKD: { symbol: 'HK$', householdSymbol: 'HK$', digits: 2 },
};

export function householdCurrencySymbol(currency) {
  return (CURRENCY_META[currency] || {}).householdSymbol ?? '';
}

/**
 * 家庭层金额展示：币种符号 + 千分位 + 最多 2 位小数；null/undefined → 「—」。
 *
 * 与 `fmtPrice` 的区别（别合并）：`fmtPrice` 是**单价**口径，按 `digits` 固定小数位
 * （CNY 3 位），用于行情/成交价；本函数是**金额**口径，千分位 + 至多 2 位小数，用于分桶与占比。
 *
 * 符号为何与 `fmtPrice` 不同（OD-1，Human 2026-10-21 裁决）：行情页符号紧邻代码列、上下文自明，
 * 用 `$`/`C$` 更紧凑；家庭分桶卡是卡片式、无上下文，`$` 无法区分美元与加元，故用 `US$`/`CA$`。
 */
export function formatMoney(value, currency) {
  if (value == null) return '—';
  return `${householdCurrencySymbol(currency)}${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}
```

### 4.3 五个展示组件

全部放 `client/src/components/Household/`，**默认导出、纯 props、无 hook**。

#### 4.3.1 `CurrencyBuckets.jsx`（R8）

```jsx
<CurrencyBuckets buckets={family.buckets} />
```

- 顺序常量 `BUCKET_ORDER = ['USD', 'CAD', 'CNY', 'HKD']` 放组件内（只有此处用）。
- 布局 `grid grid-cols-2 lg:grid-cols-4 gap-4`（与 `Family.jsx:49` 一致）。
- 每卡：`{CURRENCY_LABELS[code]}（{code}）` / `formatMoney(bucket.amount, code)` / `formatCny(bucket.cnyValue)` / 非 CNY 且有 `rate` 时脚注 `1 {code} ≈ ¥{rate.toFixed(4)}`。
- 过滤 `bucket != null`；无任何分桶 → `<p className="text-sm text-gray-500">暂无资产分桶数据</p>`（沿用原文案，避免不必要的文案变更）。

#### 4.3.2 `ContributionBar.jsx`（R9 / AC10 / AC11）

```jsx
<ContributionBar contributions={family.portfolioContributions} />
```

- **一条堆叠条 + 图例**，不渲染列表（R9）。
- 条：外层 `div.h-3.rounded-full.bg-gray-100.overflow-hidden`（轨道＝「未计入」的留白），内层 `flex.h-full`。
- **宽度算法（AC10 的落点）**：

  ```
  segments = contributions.filter(c => c.ratio != null)
  sum = Σ c.ratio
  width_i = sum > 100 ? (c.ratio / sum * 100) : c.ratio     // 只为满足「≤100%」
  ```

  `ratio` 是服务端 `toFixed(2)` 的百分数，正常合计 ≈ 100；超过 100 只可能来自浮点累积，归一化后不失真。
- 配色（OD-4）：品牌紫梯度，固定 6 档循环

  ```js
  const BAR_COLORS = ['#635BFF', '#7C75FF', '#9A94FF', '#B7B3FF', '#D2D0FF', '#E7E5FF'];
  ```

  第 i 段取 `BAR_COLORS[i % 6]`。
- 图例每项为 `<button type="button">`：
  - `组合名` · `formatCny(cnyValue)` · `ratio%`（`ratio == null` → 「折算不完整」）；
  - 前导色块与条上同色；
  - 点击 `navigate(ROUTES.PORTFOLIO_TAB(id, 'positions'))`（AC11）；
  - `ratio == null` 的项**不占条宽**，但仍出现在图例（AC10）。
- 图例下方**恒显示**一行口径说明（OD-3）：`text-xs text-gray-400`，文案取 `FS OQ-3`：**「分桶与占比仅含未归档组合；已归档组合需在下方卡片中单独查看。」**
- 空态：`<EmptyState />`。
- `ratio == null` 的判定基准是 `cnyValue == null`（服务端两者同步为 null），组件只判 `ratio`。

#### 4.3.3 `RecentTransactions.jsx`（R10 / AC12）

```jsx
<RecentTransactions transactions={family.recentTransactions} />
```

- **`transactions.slice(0, 5)`**（F-1：接口给 10 条）。
- 标题行右侧 `<Link to={ROUTES.PORTFOLIO_TX_ALL}>查看全部 →</Link>`（AC12）。无数据时也保留标题与链接。
- 每行：组合名 + 资产代码 + 类型 badge + `数量 × 价格` + 日期（沿用 `Family.jsx:244-260` 的信息密度）。
- badge 着色（从 `Family.jsx:21-28` 原样搬入本组件内部）：

  | action | 样式 |
  |---|---|
  | `buy` | `bg-red-50 text-red-700`（涨红） |
  | `sell` | `bg-emerald-50 text-emerald-700`（跌绿） |
  | `div_cash` / `div_reinvest` | `style={{ backgroundColor: colors.brandSurface, color: colors.brand }}` |
  | 其他 / `null` | `bg-gray-100 text-gray-500` |

  文本：`TRANSACTION_ACTION_LABELS[action] || action || '—'`（AC16）。
- 空态：`<EmptyState />`。

#### 4.3.4 `RecentRebalance.jsx`（R11）

```jsx
<RecentRebalance records={family.recentRebalanceRecords} />
```

- 直接渲染（接口已限 10）。
- 每行：组合名 + `AUTO ? '自动' : '手动'` + 状态 badge + 日期。
- 状态 badge：`REBALANCE_STATUS_LABELS[status] || status`；配色沿用 `Family.jsx:277-281`（`EXECUTED` 绿 / `REVOKED` 灰 / 其他琥珀）。
- 空态：`<EmptyState />`。

#### 4.3.5 `FxPanel.jsx`（R12 / AC13）

```jsx
<FxPanel />
```

- **自取数据**（`useFxRates` / `useSyncFxRates` / `useUpsertFxRate`），与 `family-summary` 无耦合 → 独立容错。
- 折叠：`useState(false)` + `<button aria-expanded>` 作头部（不用 `<details>`，样式需可控）；头部固定显示「家庭汇率」+「1 外币 = ¥人民币」+ `ChevronRight/ChevronDown`（`lucide-react`）。
- **默认收起**（AC13）。折叠态下**不渲染**列表/表单（避免无条件请求之外的额外渲染；`useFxRates` 本身仍在展开时才挂载 —— 实现方式：把列表与表单放进一个子组件 `FxPanelBody`，仅展开时渲染，使 `useFxRates` 只在展开后触发查询）。
- 展开内容：
  1. 汇率列表（币种中文名 / `rateToCny.toFixed(4)` / 日期 `YYYY-MM-DD` / `手动|自动`）；
  2. **同步汇率**按钮 → `useSyncFxRates()`，成功后 `refetch()` family summary（沿用 `Family.jsx:180-188` 的 `handleSync`）；错误用 `getApiErrorMessage`；
  3. 手动录入表单（币种 `USD/CAD/HKD` + 汇率 + 录入按钮）→ `useUpsertFxRate()`，其 `onSuccess` 已失效 `['fx-rates']` 与 `['family-summary']`（`hooks/useFamily.js:34-37`），**不需要**再手动 invalidate（AC13 的「两个 query 均失效」由 hook 保证）。
- 视觉：`rounded-xl bg-white shadow`，标题行与 `Family.jsx:126-129` 一致但要说明是**家庭**汇率（R-5）。

### 4.4 `pages/Portfolio/List.jsx` 改造

目标结构（对应 AC9 的七段）：

```jsx
export default function List() {
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const { data: portfolios, isLoading, isError } = usePortfolios({ includeArchived: showArchived });
  const { data: family, isLoading: familyLoading, isError: familyError } = useFamilySummary();

  const familyReady = !familyLoading && !familyError;

  return (
    <div className="space-y-6">
      {/* ① 标题行：原样不动（h1 + 显示已归档 + 新建） */}
      {/* ② 币种分桶 + ③ 贡献占比条 */}
      {familyLoading ? <LoadingState />
        : familyError ? <ErrorState />
          : (
            <>
              <CurrencyBuckets buckets={family.buckets || {}} />
              <ContributionBar contributions={family.portfolioContributions || []} />
            </>
          )}

      {/* ④ 组合卡片网格（现有内容，状态下沉到这里） */}
      {isLoading ? <p>加载组合中…</p>
        : isError ? <p>加载组合失败，请重试</p>
          : (<>卡片网格 + 空态</>)}

      {/* ⑤ 最近交易 + ⑥ 最近再平衡：lg 以上两列并排 */}
      {familyReady && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentTransactions transactions={family.recentTransactions || []} />
          <RecentRebalance records={family.recentRebalanceRecords || []} />
        </div>
      )}

      {/* ⑦ 汇率折叠面板 */}
      <FxPanel />
    </div>
  );
}
```

关键点：

- **状态尽早退被移除**：`isLoading` / `isError` 只影响卡片网格区域，标题行与家庭区块照常渲染。
- ⑤⑥ 两列并排（`lg:grid-cols-2`）：沿用 `Family.jsx:224` 的既有布局，避免页面被拉成一条过长的单列；AC9 的「依次」在同一行内左右仍成立。
- `familyError` 时 ⑤⑥ 整块不渲染，避免二次报错（只保留②③处的一个 `ErrorState`）。

### 4.5 删除与清理（R13 / AC15 / AC17）

| 文件 | 动作 |
|---|---|
| `client/src/pages/Family.jsx` | 删除 |
| `client/src/router.jsx` | 删 `import Family from './pages/Family';`（`:15`）与 `<Route path="/family" …/>`（`:41`）。`*` 通配（`:78-81`）已兜底 → AC17 |
| `client/src/components/layout/Sidebar.jsx` | 删 `navItems` 的「家庭视图」项（`:43`）与 `Users` 图标 import（`import` 块 `:14-16`，`Users` 在 `:15`）。头部注释「顶层 6 项」→「顶层 5 项」，并补一行 TASK-050 说明 |
| `client/src/pages/Portfolio/RebalanceHistory.jsx` | `:94` 改 `{REBALANCE_STATUS_LABELS[rec.status] || rec.status}` + import（OD-2） |

删除后 `Landmark` / `Wallet` / `ArrowLeftRight` / `Scale` / `RefreshCw` 等 import 随文件消失，**不需要**在别处清理。

### 4.6 明确不改

- `hooks/useFamily.js`（`queryKey` 不变 → 与 `/` 的 `TotalAssetsCard` 共享缓存）
- `services/family.service.js`、`shared/services/familySummary.service.js`
- `components/PortfolioCard/`
- `pages/Dashboard.jsx`（`TASK-049` 已定稿）
- `constants/design-tokens.js`（配色只用已有 token；占比条的紫梯度按 OD-4 就地定义在本组件）
- `Add/EditTransaction` 的 `<option>` 硬编码（`TASK-048` OD-3 既定，另行收敛）

---

## 5. Work Breakdown

| # | 步骤 | 文件 | 依赖 | 验收点 |
|---|---|---|---|---|
| **W1** | 口径收口：`enums.js` 加 `CURRENCY_LABELS` / `REBALANCE_STATUSES` / `REBALANCE_STATUS_LABELS`；`priceDisplay.js` 加 `householdSymbol` 字段 + `householdCurrencySymbol` + `formatMoney` | 2 文件 | — | `formatMoney(1234.5,'USD') === 'US$1,234.5'`；`fmtPrice` 行为不变 |
| **W2** | `CurrencyBuckets.jsx` | 新文件 | W1 | 4 卡布局、CNY 无汇率脚注、空态 |
| **W3** | `ContributionBar.jsx` | 新文件 | W1 | 条宽 ≤100%、null 不占宽、图例点击跳转、口径说明恒显示 |
| **W4** | `RecentTransactions.jsx` | 新文件 | W1 | 恰 5 条、四类 badge 着色、查看全部链接 |
| **W5** | `RecentRebalance.jsx` | 新文件 | W1 | 10 条、状态中文 |
| **W6** | `FxPanel.jsx` | 新文件 | W1 | 默认收起、同步汇率、录入后双 query 失效 |
| **W7** | `List.jsx` 改造（七段结构 + 状态下沉） | 1 文件 | W2–W6 | AC9 顺序 |
| **W8** | 删除与清理（`Family.jsx` / `router.jsx` / `Sidebar.jsx` / `RebalanceHistory.jsx:94`） | 4 文件 | W7 | AC15 / AC17 / OD-2 |
| **W9** | 文档同步 4 处 | 4 文件 | W8 | AC18 |
| **W10** | 校验与交接（静态 + 运行时走查 + 记录） | — | W9 | AC19 / AC20 |

**实施顺序约束**：W8 的删除必须在 W7 完成**之后**（否则 `/portfolios` 还没接住，`/family` 先消失 → 中间态丢失四个区块）。

---

## 6. Decisions

### 6.1 Human 已裁决（2026-10-21）

| # | 问题 | 裁决 | 影响 |
|---|---|---|---|
| **OD-1** | 币种符号用哪套？ | **沿用家庭页 `US$` / `CA$`** | 在 `priceDisplay.js` 的 `CURRENCY_META` 增加 `householdSymbol`，`fmtPrice` 的 `symbol` 不动 |
| **OD-2** | 顺带修 `RebalanceHistory.jsx:94` 的英文枚举？ | **修**（约 2 行） | 抽 `REBALANCE_STATUS_LABELS`，新组件与组合详情共用 |
| **OD-3** | 归档口径说明何时显示？ | **恒显示** | 覆盖 AC14（恒显示 ⊃ 打开开关时显示）；在图例下方常驻一行小字 |
| **OD-4** | 占比条配色？ | **品牌紫梯度** | 6 档 `#635BFF` → `#E7E5FF` 循环 |

### 6.2 Planner 自决（Human 可在 Plan Review 推翻）

| # | 决定 | 理由 |
|---|---|---|
| D-1 | 5 个组件取**纯 props**，数据由 `List.jsx` 取一次 | 避免 5 个加载块/5 个错误块（§4.1） |
| D-2 | 交易与再平衡在 `lg` 以上**两列并排** | 沿用 `Family.jsx:224` 既有布局，控制页面长度；AC9 的「依次」在同一行内成立 |
| D-3 | 贡献占比条宽度**仅在合计 >100 时归一化** | `ratio` 已是 `toFixed(2)` 百分数，正常合计 100；归一化只为满足 AC10 的硬约束 |
| D-4 | `ContributionBar` 内部用 `useNavigate` 而非传入回调 | 单点导航，无复用需求；与 `Family.jsx:75` 现状一致 |
| D-5 | `FxPanel` 的列表/表单放进子组件、仅展开时渲染 | 让 `useFxRates` 延迟到展开后触发，减少一次默认请求（符合 R12「低频基础设施」定位） |
| D-6 | 分桶空态沿用原文案「暂无资产分桶数据」 | 减少无差别文案变更，降低回归面 |
| D-7 | 不新建测试文件；运行时走查用一次性内联 Playwright 脚本 | 沿用 `TASK-048` D-3 / `TASK-049` 做法，不引入测试框架债 |

---

## 7. Verification

### 7.1 静态（AC19）

```bash
npm run build --workspace client                                   # 期望 exit 0
cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"       # 期望 0 error
git status --short server shared cron-worker                       # 期望空输出
```

### 7.2 删除完整性（AC15 / AC16 / AC17）

```bash
# ① 不得再有 Family 页面引用
grep -rn "pages/Family" client/src                    # 期望 0 行
# ② 不得再有 /family 字面量
grep -rn "'/family'" client/src                       # 期望 0 行
grep -rn '"/family"' client/src                       # 期望 0 行
# ③ 侧边栏顶层导航 5 项（改动前实测 = 6；children 项缩进 6 空格，不会误计）
grep -cE "^  (\{ to: |\{$)" client/src/components/layout/Sidebar.jsx   # 期望 5
# ④ 交易类型标签不得退回就地手写表
grep -rn "ACTION_LABELS = {" client/src                # 期望 0 行
# ⑤ 再平衡状态不得再直出英文（OD-2）
grep -rn "{rec.status}" client/src                     # 期望 0 行
```

> ③ 的模式已在 `c463c85` 上实测：命中 `Sidebar.jsx:32,33,42,43,44,45` 共 **6** 行（`:33` 是「组合管理」父项的多行写法）；删除 `:43` 后应为 **5**。若实施时缩进被改动导致计数不符，以「人工核对 `navItems` 数组元素个数」为准，并在 §12 记录实际命令与结果。

### 7.3 组件行为（可失败断言，W1–W6）

用一次性内联 Playwright 脚本（`playwright-core` + 本机 Chrome，1440×900），**通过 `page.route` 拦截接口喂构造数据，不往库里写**（`TASK-048` 已验证的方法）：

| 构造数据 | 断言 |
|---|---|
| 3 个组合贡献：`ratio` 50 / 30 / `null` | 条上只有 2 段；两段宽度和 ≤ 100%；图例 3 项，第 3 项文案含「折算不完整」 |
| 点击第 1 个图例项 | URL 变为 `/portfolios/view/<id>/positions` |
| 12 条交易 | 表格仅渲染 **5** 行；「查看全部」链接 href = `/portfolios/transactions` |
| 交易含 `buy` / `sell` / `div_cash` / `div_reinvest` / 未知值 | 文本分别为 买入/卖出/现金分红/分红再投/原值；**无空 badge**；分红底色 `rgb(238,237,255)`、字色 `rgb(99,91,255)` |
| 10 条再平衡，状态 `EXECUTED`/`PENDING`/`REVOKED` | 显示 已执行/待确认/已撤销，**不出现英文枚举** |
| bundle 中 `family-summary` 返回 500 | 分桶处出现 1 个错误提示；**组合卡片仍正常渲染**（`TASK-049` R-4 的同类断言） |
| 打开「显示已归档」 | 页面存在含「不含已归档组合」的说明文案 |
| 汇率面板初始 | 汇率列表不可见；点击「家庭汇率」后出现「同步汇率」按钮 |
| 直接访问 `/family` | 重定向到 `/portfolios`，无白屏 |

> 颜色断言**不要硬编码色值串**（Tailwind v4 输出 `oklch()`）：在页面内注入同 class 参照片取实际计算色作基准（`TASK-048` §13.7 的教训）。

### 7.4 逐条 AC 覆盖矩阵

| AC | 验证方式 |
|---|---|
| AC9 | §7.3 页面顺序走查（DOM 顺序断言：分桶 → 占比条 → 卡片 → 交易 → 再平衡 → 汇率） |
| AC10 | 构造 `ratio` 50/30/null → 段宽和 |
| AC11 | 点击图例项 → URL |
| AC12 | 12 条交易 → 5 行 + 链接 href |
| AC13 | 默认收起；展开后点「同步汇率」（拦截 `POST /api/family/fx/sync` 断言请求发出）；录入后断言 `fx-rates` 与 `family-summary` 各被重新请求 |
| AC14 | 归档开关打开/关闭两态均存在说明文案（OD-3） |
| AC15 | §7.2 的 ①②③ |
| AC16 | §7.2 的 ④ |
| AC17 | 访问 `/family` |
| AC18 | 人工逐项核对 4 个文档落点 |
| AC19 | §7.1 |
| AC20 | 独立 Reviewer 复核，Implementer 不自判 |

---

## 8. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **搬出一份新的口径复制**（第四份 `formatCny`、第三份币种符号表、第二份再平衡标签） | W1 先收口再搬；§7.2 用 grep 计数验证；Reviewer 优先查「有没有又写了一份」 |
| R-2 | **占比条合计 >100%**（浮点累积） | §4.3.2 的归一化分支；AC10 实测 |
| R-3 | **`family-summary` 失败拖垮整页** | §4.1 的容错边界 + §7.3 的 500 构造 |
| R-4 | **删 `/family` 留残**（import / 路由 / 导航 / 文档） | AC15 grep 三项；AC18 文档核对 |
| R-5 | **页面变长**（五块叠加），首屏看不到卡片 | 交易/再平衡两列并排（D-2）；汇率默认收起；卡片区仍在前三屏内 |
| R-6 | **归档口径困惑**（分桶合计 ≠ 卡片合计） | 口径说明恒显示（OD-3） |
| R-7 | **`<details>` 语义/样式二选一失误** | D-5 明确用 `useState` + 自绘头部，不用原生 `<details>` |
| R-8 | **过度设计**：为五块新建 context / 主题层 / 抽象基类 | 明令禁止；只有 5 个展示组件 + 2 处导出扩展 |

---

## 9. Rollback

- 全部改动在 `client/` 与 `docs/`，无数据迁移、无接口变更 → `git revert <TASK-050 commit>` 即可完全回滚。
- `Family.jsx` 删除是**可逆**的（`git checkout <base> -- client/src/pages/Family.jsx`），但路由与侧栏需一并恢复。
- 回滚后 `/family` 重新可达，`/` 的总资产卡不受影响（`TASK-049` 独立）。

---

## 10. Out of Scope 边界核对清单（Reviewer 可逐项打勾）

- [ ] `shared/` `server/` `cron-worker/` 零改动（`git status` 空）
- [ ] `hooks/useFamily.js` 的 `queryKey` 仍为 `['family-summary']` / `['fx-rates']`
- [ ] `components/PortfolioCard/` 零改动
- [ ] `pages/Dashboard.jsx` 零改动
- [ ] `constants/design-tokens.js` 零改动
- [ ] 未新增 `context` / 主题层 / 抽象基类 / 测试文件
- [ ] 未改 `/api/family/*` 契约与折算口径
- [ ] 未为 `/family` 加重定向
- [ ] 未给汇率面板加 `sessionStorage` 持久化
- [ ] 未动 `Add/EditTransaction` 的 `<option>` 硬编码（`TASK-048` OD-3 既定）

---

## 11. Implementer 交接说明

1. **前置**：本计划变为 `Approved` 后才可动代码。
2. **顺序**：W1 → W2–W6（可并行）→ W7 → **W8 才能删 Family** → W9 → W10。**先接住再拆桥**。
3. **只改 §1 Scope 列出的文件**，不要顺手清理 `Add/EditTransaction` 的 `<option>`、不要碰 `TASK-046/047` 的范围。
4. **每完成一个 W 就跑一次 `build` + `eslint`**，不要攒到最后。
5. **不要写验收结论**：结果交 Orchestrator，由独立 Reviewer 对照 AC9–AC20 复核（AC20）。
6. 若发现 §3 的事实与代码不符（行号漂移除外），**停下并回报**，不要自行扩大范围。
7. 运行时走查**不落盘脚本**（D-7），命令与断言清单写进 §12。

---

## 12. Implementation Record

> Implementer 填写。

---

## 13. Review Record

> Reviewer 填写。
