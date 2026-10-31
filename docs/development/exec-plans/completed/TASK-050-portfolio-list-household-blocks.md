# TASK-050 — 组合列表页承接家庭五区块，`/family` 下线

## Status

Current status:

`Approved`（2026-10-21 Human 批准「按 §5 W1–W10 实施」）→ `Implemented`（见 §12）→ `Reviewing`（2026-10-21 有条件通过；AC14 空态边界待修，见 §13）→ R-1 返修（见 §14）→ 复验通过（2026-10-21，R-1 闭环，见 §15）→ **`Completed`（2026-10-26，已合并入 `main` `cafcc5d` / PR #35，见 §16）**

Owner:

`Planner`（2026-10-21 起草）/ `Human`（2026-10-21 Plan Review 批准；2026-10-26 合并入 `main` 并结案）/ `Implementer`（2026-10-21 实施 + R-1 返修）/ 独立 `Reviewer`（2026-10-21 复核 §13 + 复验 §15；R-1 已闭环）

Priority:

`High`（家庭视图搬迁的最后一块；`/family` 一天不删，就存在两套家庭资产渲染）

Related task:

[`docs/development/tasks/completed/TASK-050-portfolio-list-household-blocks.md`](../../tasks/completed/TASK-050-portfolio-list-household-blocks.md)

Related spec:

`docs/development/requirements/specs/completed/FS-household-view-split.md`（`Approved`，交付单元 **G2**，需求 R8–R18 / AC9–AC20）

Branch / Base:

`feature/TASK-050`（已合并入 `main` = `cafcc5d`，PR #35）/ 开发基线 `c463c85`（2026-10-21 rebase 到 `feature/TASK-048-family-dividend-label` 顶端，含 `TASK-044` + `TASK-049` + `TASK-048` 全部前置）

> 说明：`docs/os/templates/EXEC_PLAN_TEMPLATE.md` 仍为 0 字节空文件（2026-10-19 实读）。本文结构依据
> `docs/os/process/EXECUTION_PLANS.md` §8，并参照 `docs/development/exec-plans/completed/TASK-048-family-dividend-label.md` 的既有格式。

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
- 文档 4 处：`handbook/manual/CLIENT.md`、`handbook/product/lines/PL-6-household.md`、`handbook/product/lines/PL-1-ledger.md`、本 FS 状态行

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
- `docs/os/templates/EXEC_PLAN_TEMPLATE.md` 为空，不依赖它。

### Acceptance Criteria（逐字取自 `specs/completed/FS-household-view-split.md` §7 → G2，未增删改）

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

- 产品需求：`docs/development/requirements/specs/completed/FS-household-view-split.md`（G2，R8–R18）
- 任务卡：`docs/development/tasks/completed/TASK-050-portfolio-list-household-blocks.md`（结案归档后位置；开发期为 `development/tasks/active/`）
- 已完成的前置：`docs/development/exec-plans/completed/TASK-049-dashboard-household-total.md`（总资产卡已进 `/`）、`docs/development/exec-plans/completed/TASK-048-family-dividend-label.md`（`TRANSACTION_ACTION_LABELS` 单一导出）
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

### 3.3 与 FS 描述不一致、必须据实处理的四处

| # | FS / 任务卡所述 | 实测事实 | 处置 |
|---|---|---|---|
| **F-1** | 「最近交易保留 5 条」「最近再平衡 10 条（现状上限）」 | 接口 `RECENT_LIMIT = 10`，**交易与再平衡都返回 10 条** | 交易必须在客户端 `slice(0, 5)`；再平衡直接渲染（已是 10）。**不改服务端**（R17） |
| **F-2** | 「`formatCny` 双份待 `TASK-050` 去重」 | `TASK-049` 已把唯一实现放 `utils/priceDisplay.js:199`，`Family.jsx:32` 仍是副本 | 删页即去重；新组件一律 import `priceDisplay` 版 |
| **F-3** | 任务卡 §1 表格写「`Family.jsx:17` 手写 `{buy, sell}`」 | 已被 `TASK-048` 修掉，现为 `TRANSACTION_ACTION_LABELS`（`:252`） | 搬移时**保持**引用方式，不得退回手写表（AC16） |
| **F-4** | AC15 要求 `grep -rn "pages/Family" client/src` **无结果** | `utils/priceDisplay.js:195-197` 的 JSDoc 仍写「从 `pages/Family.jsx` 的本地实现抽为唯一源头…`/family` 共用…`Family.jsx` 的本地副本按 R7 暂留」 | **W8 必须改写该注释**（去掉 `pages/Family.jsx` 与 `/family` 字样）。否则删页后 grep 仍命中注释 → AC15 实测失败。这是本计划对账新发现的缺口 |

> **另注（非 AC15 阻断，故不改）**：
> - `components/Household/TotalAssetsCard.jsx:3,22` 的注释仍提到 `/family` 与 `Family.jsx:182`；该文件属 `TASK-049` 产出、在本任务 Out of Scope，且其字样**不匹配** AC15 的两条 grep（无 `pages/` 前缀、无单引号）→ 视为可接受的陈述性残留。
> - `client/scripts/e2e-task-049.mjs:87,101` 会访问 `/family` 并断言 `h1 = 家庭视图`，删页后该**一次性**脚本失效；它不在 `client/src`、也无 npm script 引用 → 不属 AC15，本任务不改（后续若要复跑 TASK-049 回归需另行更新）。

### 3.4 顺带发现的同类缺陷（OD-2 已裁：顺带修）

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

### 3.8 Plan Review 前对账（2026-10-21，提交 `c463c85`）

提交 Plan Review 前对最承重的落点做了第二轮实读，全部与 §3.1–§3.6 一致：

| 对账项 | 实测 |
|---|---|
| `pages/Portfolio/List.jsx` 全文 54 行；`isLoading`/`isError` 整页早退在 `:13-14` | ✅ |
| `constants/enums.js` 现 `TRANSACTION_ACTION_LABELS` 在 `:28-30`；**尚无** `CURRENCY_LABELS` / `REBALANCE_STATUSES` / `REBALANCE_STATUS_LABELS` | ✅ W1 为纯新增 |
| `utils/priceDisplay.js` `CURRENCY_META` 在 `:25-30`（无 `householdSymbol`）、`formatCny` 在 `:199` | ✅ |
| `router.jsx` `import Family` `:15`、`/family` 路由 `:41`、`*` 通配 `:78-81` | ✅ |
| `components/layout/Sidebar.jsx` `Users` import `:15`、家庭项 `:43`、顶层 6 项注释 `:28` | ✅ |
| `hooks/useFamily.js` 两个 FX mutation 的 `onSuccess` 均失效 `['fx-rates']` + `['family-summary']` | ✅ AC13 由 hook 保证 |
| `shared/services/familySummary.service.js` `RECENT_LIMIT = 10`，交易与再平衡各 `.limit(10)` | ✅ F-1 成立 |
| `pages/Portfolio/RebalanceHistory.jsx:94` 为 `{rec.status}` | ✅ OD-2 落点 |

> 附注：`pages/Portfolio/KpiCards.jsx:17` 另有本地 `formatMoney(value)`（无币种符号的数值格式化），与本任务新增的 `formatMoney(value, currency)` **不同签名不同语义**，且不在本任务范围；W1 **不得**顺手改它（避免扩大改动面）。

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
| `client/src/utils/priceDisplay.js` | 改写 `formatCny` 的 JSDoc（`:192-198`）：去掉 `pages/Family.jsx` / `/family` 字样，改为「首页总资产卡与组合管理页共用」（AC15 的 grep 会命中注释，见 §3.3 F-4） |

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
| **W8** | 删除与清理（`Family.jsx` / `router.jsx` / `Sidebar.jsx` / `RebalanceHistory.jsx:94` / `priceDisplay.js` 注释） | 5 文件 | W7 | AC15 / AC17 / OD-2 |
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
# ① 不得再有 Family 页面引用（含注释；priceDisplay.js 的 JSDoc 必须一并改写，见 §3.3 F-4）
grep -rn "pages/Family" client/src                    # 期望 0 行
# ② 不得再有 /family 字面量
grep -rn "'/family'" client/src                       # 期望 0 行
grep -rn '"/family"' client/src                       # 期望 0 行
# ③ 侧边栏顶层导航 5 项（改动前实测 = 6；children 项缩进 6 空格，不会误计）
grep -cE "^  (\{ to: |\{$)" client/src/components/layout/Sidebar.jsx   # 期望 5
# ④ 交易类型标签不得退回就地手写表（AC16 原文检测式）
grep -rn "ACTION_LABELS = {" client/src                # 期望 0 行
# ④b 增强检测：确认全仓只有 enums.js 一处派生（TASK-048 已收敛，比 ④ 更强）
grep -rn "Object.fromEntries(TRANSACTION_ACTIONS" client/src   # 期望恰 1 行，且位于 constants/enums.js
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

> 实施者：Implementer（2026-10-21）。本节只记录**实际做了什么 / 与计划的差异 / 自测结果**，
> 不构成验收结论 —— 验收交独立 Reviewer（AC20）。

### 12.1 变更文件清单（11 个 `client/src` + 4 处文档）

| # | 文件 | 类型 | 内容 |
|---|---|---|---|
| 1 | `client/src/constants/enums.js` | 编辑 | 新增 `CURRENCY_LABELS`（由 `ASSET_CURRENCIES` 派生）、`REBALANCE_STATUSES`、`REBALANCE_STATUS_LABELS`（§4.2.1 原样） |
| 2 | `client/src/utils/priceDisplay.js` | 编辑 | `CURRENCY_META` 增 `householdSymbol`（`symbol`/`digits` 未动）；新增 `householdCurrencySymbol` / `formatMoney`；**改写 `formatCny` 的 JSDoc**（去掉 `pages/Family.jsx` 与 `/family` 字样，F-4） |
| 3 | `client/src/components/Household/CurrencyBuckets.jsx` | **新增** | 4 卡分桶，`formatMoney` 原币种 + `formatCny` 折算 + 非 CNY 汇率脚注 |
| 4 | `.../ContributionBar.jsx` | **新增** | 堆叠条 + 图例 + 恒显口径说明；宽度归一化分支；图例项为 `<button>` 跳持仓页 |
| 5 | `.../RecentTransactions.jsx` | **新增** | `slice(0, 5)` + 「查看全部 →」；四类 badge + 未知灰 |
| 6 | `.../RecentRebalance.jsx` | **新增** | 10 条；状态走 `REBALANCE_STATUS_LABELS` |
| 7 | `.../FxPanel.jsx` | **新增** | `useState` 折叠（默认收起）+ 子组件 `FxPanelBody` 仅展开时挂载 |
| 8 | `client/src/pages/Portfolio/List.jsx` | 编辑 | 七段结构；`isLoading`/`isError` 由整页早退**下沉到卡片区**；`portfolios` 加空值兜底 |
| 9 | `client/src/router.jsx` | 编辑 | 删 `import Family` 与 `/family` 路由；在 `*` 通配上方补 TASK-050 说明注释 |
| 10 | `client/src/components/layout/Sidebar.jsx` | 编辑 | 删「家庭视图」项与 `Users` import；注释 6→5 项；补 TASK-050 说明 |
| 11 | `client/src/pages/Portfolio/RebalanceHistory.jsx` | 编辑 | `{rec.status}` → `REBALANCE_STATUS_LABELS[rec.status] \|\| rec.status`（OD-2） |
| 12 | `client/src/pages/Family.jsx` | **删除** | 300 行整页下线 |

**文档 4 处**（AC18）：`handbook/manual/CLIENT.md`（§3.2 补家庭区块、§3.6 改写、§4 表、排障行、`:41`/`:49` 表述）· `handbook/product/lines/PL-6-household.md`（FAM-01/02/04 入口列 + 页面行 + 承载 + §6.3）· `handbook/product/lines/PL-1-ledger.md`（§5 M1.2 后新增「组合列表页职责扩展」）· `development/requirements/specs/completed/FS-household-view-split.md`（状态行补 `Implemented`）。

**零改动（实测）**：`server/` `shared/` `cron-worker/` `client/package.json` `hooks/useFamily.js` `services/family.service.js` `components/PortfolioCard/` `pages/Dashboard.jsx` `constants/design-tokens.js`。

### 12.2 与计划的差异

| # | 差异 | 理由 |
|---|---|---|
| **D-1** | `FxPanel` 的「同步汇率」**不再显式 `refetch()` family-summary**（原 Family 页有） | 两个 mutation 的 `onSuccess` 已 `invalidateQueries(['fx-rates'], ['family-summary'])`；实测同步后两 query 均重新请求（§12.4），再手动 refetch 属冗余。AC13 由 hook 保证，未削弱 |
| **D-2** | 图例色块按「**有 ratio 的项**」顺序分配循环色；`ratio == null` 的项改用中性灰 `#D7DEE6` | 计划写「第 i 段取 `BAR_COLORS[i % 6]`」。若按图例数组下标取色，含 null 项后条上段的颜色会与图例错位；中性灰也更能表达「未计入条宽」 |
| **D-3** | `ContributionBar` 标题用「组合占比」（原页是「组合贡献」） | 形态已由列表改为单条堆叠条，沿用旧名会误导为列表 |
| **D-4** | `CLIENT.md` 除 AC18 指定处外另改 4 行：`:41`（大类用途）、`:49`（账户类型分组）、`:128`（手动入口表「家庭视图 → 汇率管理」）、`:150`（排障行） | 均为「家庭视图」失效名词清理。留着就是指向不存在页面的陈述（同 TASK-044 R-2 的口径纪律）；改动均在同一手册、同一主题 |
| **D-5** | `RecentTransactions` 的 `PREVIEW_LIMIT = 5` 提为模块常量并注释接口 `RECENT_LIMIT = 10` | 让 F-1（接口给 10、本页要 5）在代码里自解释，避免后续误删 `slice` |
| **D-6** | 更新了任务卡 / `BOARD.md` / `readme.md` 的状态行 | 计划未禁止；若代码已实施而状态仍写 `PLAN_REVIEW` 即为状态失真。**未动任何 AC 或 Scope 文字** |

### 12.3 静态验证（§7.1 / §7.2 原样执行）

| 项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build --workspace client` | **exit 0**，2408 modules（基线 2404 → +5 新组件 −1 删页） |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | **0 error / 0 warning** |
| AC15 ① `pages/Family` | `grep -rn "pages/Family" client/src` | **0 行**（改动前 2 行：router import + priceDisplay JSDoc） |
| AC15 ② 单/双引号 `/family` | `grep -rn "'/family'"` / `'"/family"'` | **0 / 0 行**（改动前各 1 行） |
| AC15 ③ 侧栏顶层项 | `grep -cE "^  (\{ to: \|\{$)"` | **5**（改动前 6） |
| AC16 ④ `ACTION_LABELS = {` | 同名 grep | **0 行** |
| AC16 ④b 派生唯一性 | `grep -rn "Object.fromEntries(TRANSACTION_ACTIONS"` | **恰 1 行**，位于 `constants/enums.js:29` |
| OD-2 ⑤ `{rec.status}` | `grep -rn "{rec.status}" client/src` | **0 行** |
| AC19 零服务端 | `git status --short server shared cron-worker` | **空** |

W1 单元核对（`esbuild` 打包后直接调用，7/7）：`formatMoney(1234.5,'USD')='US$1,234.5'`、`formatMoney(1234,'CNY')='¥1,234'`、`formatMoney(null,'CAD')='—'`、`householdCurrencySymbol` 四值正确；`fmtPrice(22.714,'USD')='$22.71'`、`fmtPrice(22.7145,'CNY')='¥22.715'` **行为未变**。

### 12.4 运行时走查（1440×900，`portomind_e2e` 副本，一次性内联脚本、未落盘）

| AC | 断言 | 实测 |
|---|---|---|
| AC9 | 七段 boundingBox.y 单调递增 | 标题行 108 → 分桶 200 → 占比 336 → 卡片 456 → 交易/再平衡 **908（同排两列）** → 汇率 1381；全部命中、顺序正确 |
| AC10 | 构造 `ratio` 50/30/null | 条上 **2 段**（`50%`+`30%`，合计 **80%** ≤100）；图例 3 项，第 3 项「组合丙 — 折算不完整」 |
| AC11 | 点第 1 个图例项 | URL → `/portfolios/view/p1/positions` |
| AC12 | 接口给 **12** 条交易 | 渲染 **5** 行；`查看全部` href = `/portfolios/transactions`（目标页可正常打开） |
| AC13 | 收起态 / 展开 / 同步 / 录入 | 收起态 `fx-rates` 请求 **0** 次；展开后 1 次；同步后 `summary 1→2`、`fx 1→2`；手动录入发出 PUT 后 `fx 1→2`、`summary 1→2`，输入框清空 |
| AC14 | 开关两态 | 关闭时与打开后各存在「仅含未归档组合」说明 |
| AC15 | 侧栏 | 顶层 5 项：Dashboard / 组合管理 / 今日行情 / 提醒规则 / 日志；无「家庭视图」 |
| AC16 | 分红标签 | 四类中文 + 未知值原样（`weird_action`）；**无空 badge**；分红 `rgb(238,237,255)`/`rgb(99,91,255)`；买 `bg-red-50`、卖 `bg-emerald-50` 类名不变 |
| AC17 | 访问 `/family` | 落到 `/portfolios`，页面有内容、无 JS 报错 |
| OD-2 | 组合详情 → 再平衡 → 再平衡历史 | `Status` 列显示「待确认」（中文），不再直出 `PENDING` |
| R-3 | `family-summary` 返回 500 | 组合卡片仍渲染 **4 张**；错误提示**恰好 1 个**；交易/再平衡区块不渲染；无 JS 报错 |

截图：`%TEMP%/portomind-task050-list.png`（整页）、`%TEMP%/portomind-task050-500.png`（500 降级态）。

> 走查期间发现的两处 `FAIL` **均为断言自身问题**，非产品缺陷，已修正后复跑通过：
> ① 交易行选择器同时匹配到再平衡行（两个区块类名相同）→ 15 行；改为按区块作用域后 = 5 行。
> ② 手动录入的 `page.route` glob `**/api/family/fx/rates*` 中 `*` 不跨 `/`，PUT 未被拦截（请求打到真实接口并写库）→ 改用 URL 判定函数后 `put=1`。**该次误写已清理**（`portomind_e2e.fxrates` 删掉 USD 7.35 手动记录，集合回到 6 条）。

### 12.5 新发现（未擅自处理，提请 Human / Reviewer 裁决）

| # | 发现 | 影响 | 建议 |
|---|---|---|---|
| **F-1（新，服务端）→ 已立项 [`TASK-051`](../../tasks/active/TASK-051-fx-rate-direction.md)** | **家庭折算的汇率方向疑似反了**：`fxRate.service.fetchFromProvider` 取的是 `open.er-api.com/v6/latest/CNY`（**以 CNY 为基准**，返回 `1 CNY = X 外币`），却被当成 `rateToCny` 入库，`familySummary.service` 再用 `amount * rate` 折算。实测 `buckets.CAD.rate = 0.211217`，`13836.49 × 0.2112 = 2922.5`，而正确值应约 `13836.49 ÷ 0.2112 ≈ 65,509` | 家庭总资产与分桶折算值被**系统性低估**；页面脚注「1 CAD ≈ ¥0.2112」与手动录入的语义（示例 `7.20`）**互相矛盾**。属 `TASK-049` 之前既有缺陷，本任务只是把同一段展示搬过来 | **单独立项**（服务端 + 口径，超出本任务 NG-5 / AC19 边界）。修法二选一：采集时存倒数，或折算时改除法；并统一手动录入语义 |
| **F-2** | `client/scripts/e2e-task-049.mjs:87,101` 仍访问 `/family` 并断言 `h1=家庭视图` | 该一次性脚本已失效（不在 `client/src`，无 npm script 引用，不属 AC15） | 若要复跑 TASK-049 回归需先更新；本任务未改（计划 §3.3 附注已预见） |
| **F-3** | 全仓现有两个 `formatMoney`：`utils/priceDisplay.js`（value, currency）与 `pages/Portfolio/KpiCards.jsx:17`（仅 value） | 同名不同签名，读代码时易误用 | 计划 §3.8 附注已明确不顺手改（避免扩大改动面），建议后续统一命名（如 `formatMoneyCompact`） |
| **F-4** | `components/Household/TotalAssetsCard.jsx:3,22` 注释仍提 `/family` 与 `Family.jsx:182` | 不匹配 AC15 的两条 grep（无 `pages/` 前缀、无引号），属可接受残留 | 可随下次触碰该文件时清理 |

### 12.6 Out of Scope 边界核对（§10 逐项）

- ✅ `server/` `shared/` `cron-worker/` 零改动（`git status` 空）
- ✅ `hooks/useFamily.js` 的 `queryKey` 仍为 `['family-summary']` / `['fx-rates']`
- ✅ `components/PortfolioCard/`、`pages/Dashboard.jsx`、`constants/design-tokens.js` 零改动
- ✅ 未新增 context / 主题层 / 抽象基类 / 测试文件
- ✅ 未改 `/api/family/*` 契约与折算口径（F-1 只记录未修）
- ✅ 未为 `/family` 加重定向（AC17 由 `*` 通配承接）
- ✅ 未给汇率面板加 `localStorage`/`sessionStorage` 持久化
- ✅ 未动 `Add/EditTransaction` 的 `<option>` 硬编码（`TASK-048` OD-3 既定）

### 12.7 遗留与提示

- 改动**未提交**，位于分支 `feature/TASK-050` 工作树；提交属 Human。
- `portomind_e2e` 副本仅用于走查：走查中的写操作（同步汇率 / 手动录入）均被 `page.route` 拦截，唯一一次漏拦截的写入已清理，库内 `fxrates` 回到 6 条；真实库 `portomind` **未被读写**。
- 设计稿未随仓库（§3.7），视觉细节属 Human 后续验收项。

---

## 13. Review Record

> 独立 Reviewer（2026-10-21）。审查对象：`feature/TASK-050` 工作树未提交改动。
> 全程**未改任何业务代码**，只写评审记录与状态。运行时走查由 Reviewer 自写一次性脚本完成（未复用 §12.4 的实现者脚本），跑完即删。

### 13.1 结论

**有条件通过（Conditional Pass）** —— AC9–AC13、AC15–AC20 全部满足；**AC14 在「贡献列表为空」边界不满足**（见 R-1，一行可修）。修正后即可进 `Integrating`，最终验收归 Human。

### 13.2 独立复跑的实测（不采信 §12.3 / §12.4）

| 项 | 我的命令 | 结果 |
|---|---|---|
| 构建 | `npm run build --workspace client`（显式取退出码） | **BUILD_EXIT=0**，**2408 modules**（与自述一致） |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | **ESLINT_EXIT=0**，无输出 |
| AC15 ① | `grep -rn "pages/Family" client/src` | **0 行** |
| AC15 ② | `grep -rn "['\"]/family['\"]" client/src` | **0 行** |
| AC15 ③ | `grep -cE "^  (\{ to: \|\{\$)" Sidebar.jsx`（同 §7.2 的模式） | **5** |
| AC16 ④ | `grep -rn "ACTION_LABELS = {" client/src` | **0 行** |
| AC16 ④b | `grep -rn "Object.fromEntries(TRANSACTION_ACTIONS"` | **恰 1 行**（`enums.js:29`） |
| OD-2 ⑤ | `grep -rn "{rec.status}" client/src` | **0 行** |
| AC19 | `git status --short server shared cron-worker client/package.json package-lock.json` | **空** |

**改动白名单核对**：`client/src` 恰为 **11 改/增 + 1 删**（5 个 `Household/*` 新增、`enums.js`、`priceDisplay.js`、`List.jsx`、`router.jsx`、`Sidebar.jsx`、`RebalanceHistory.jsx`、删 `Family.jsx`），与 §12.1 逐项一致。`hooks/` `services/` `components/PortfolioCard/` `pages/Dashboard.jsx` `constants/design-tokens.js` 均 `git status` 空。

**口径收口复核（R-1 风险的正题）**：
- `function formatCny` 全仓**仅 1 处**（`utils/priceDisplay.js:206`）—— `Family.jsx:32` 副本已随删页消失，没有搬出第四份。
- 币种中文名手写表**0 处**（除 `enums.js` 的 `ASSET_CURRENCIES` 权威源），新组件全部走 `CURRENCY_LABELS`。
- 再平衡状态中文映射**仅 1 处**（`REBALANCE_STATUS_LABELS`），`RebalanceHistory.jsx` 与 `RecentRebalance.jsx` 共用。残留的 `record.status` 命中都是**逻辑判断**（`disabled={rec.status !== 'EXECUTED'}`），非展示，判定正确。

### 13.3 逐条 AC 判定（AC9–AC20）

| # | 判定 | 我的证据 |
|---|---|---|
| AC9 | ✅ | 真数据实测 boundingBox.y 单调递增：标题行 **108** → 分桶 **200** → 占比条 **336** → 卡片 **456** → 最近交易 **908** → 家庭汇率 **1381**。另在 1600px 下补验交易/再平衡**同排**（`ty=398 rx=928`、`ry=398`），故「依次」在同一行内成立 |
| AC10 | ✅ | ① 真数据：3 段宽度和 **1144px = 轨道宽 1144px**（3 段含一个 `ratio=0`）；② 构造 `ratio=60/60`（合计 **120**）→ 归一化后两段各 **572px**、和 **1144 = 轨道宽**；③ `ratio=null` 项**不占条宽**（只 2 段）且图例标「折算不完整」。**归一化分支实现者未测，我补测通过** |
| AC11 | ✅ | 点图例「组合甲」→ URL `http://localhost:5173/portfolios/view/p1/positions`，与 `Family.jsx` 原行为一致（走 `ROUTES.PORTFOLIO_TAB`，无裸字符串拼接） |
| AC12 | ✅ | 接口喂 **12 条** → 区块内渲染 **5 行**（按「最近交易」区块作用域计数，避开同类名的再平衡区块）；「查看全部」`href=/portfolios/transactions` |
| AC13 | ✅ | 收起态 `fx-rates` 请求 **0 次**、无「同步汇率」按钮；展开后 **1 次**；点同步 → **POST 发出**，`summary 1→2`、`fx 1→2`；手动录入 → **PUT 发出**，`summary 2→3`、`fx 2→3`。**两个 query 均失效刷新成立**，D-1（去掉手动 refetch）未削弱 AC13 |
| AC14 | ⚠️ **条件不满足** | 常规路径 ✅：默认态与打开「显示已归档」后均存在「仅含未归档组合」说明。**但 `portfolioContributions` 为空数组时说明整行消失** —— 见 R-1 |
| AC15 | ✅ | 三条 grep 全 0；侧栏 5 项 = `Dashboard / 组合管理 / 今日行情 / 提醒规则 / 日志`，无「家庭视图」 |
| AC16 | ✅ | 构造 5 种 action → badge 文本 `["买入","卖出","现金分红","分红再投","weird_action"]`，**无空 badge**；分红取计算色 `rgb(238, 237, 255)` / `rgb(99, 91, 255)`（**对比的是浏览器实际计算值，未硬编码**）；`Object.fromEntries(TRANSACTION_ACTIONS` 恰 1 行 |
| AC17 | ✅ | 直接访问 `/family` → `http://localhost:5173/portfolios`，`h1=投资组合` 有内容，**0 JS 报错** |
| AC18 | ✅ | 四处逐一核对：`CLIENT.md` §3.6 改写为「家庭总资产」+ 新增 §3.2 组合列表页家庭汇总小节（6 步清单）+ 手动入口表 + 排障行；`PL-6` FAM-01/02/04 落点改 `/` 与 `/portfolios`、承载改 `components/Household/*`、§6.3 重写；`PL-1` 新增「组合列表页职责扩展」；`FS` 状态行补 `Implemented`。**活跃文档（`manual/` `product/` `readme` `BOARD.md`）中「家庭视图」作为入口的陈述已清**（`CLIENT.md:139` 残留的是 API 路径 `/api/family/fx/sync`，非页面入口） |
| AC19 | ✅ | 空输出 |
| AC20 | ✅ | 本记录即独立复核；Implementer 未自判（§12 只写「不构成验收结论」） |

### 13.4 我补验的实现者未覆盖项（4 条）

计划里最容易被漏测的是「失败隔离」与「算法边界」，§12.4 的表格里这两类覆盖不全：

| # | 补验项 | 方法 | 结果 |
|---|---|---|---|
| 1 | **AC10 归一化分支**（合计 >100%） | 构造 `ratio=60/60` | ✅ 两段变 572px，和 = 轨道宽 |
| 2 | **AC14 空贡献边界** | 构造 `portfolioContributions: []` + 一个归档组合 + 勾选「显示已归档」 | ❌ **说明消失**（改为新发现 R-1） |
| 3 | **AC9 同排** | 1600px 下取两个 `h2` 的 y/x | ✅ 同 y、左交易右再平衡 |
| 4 | **`family-summary` 500 时 FxPanel 是否仍可用** | `page.route` abort summary，单独供 fx | ✅ 面板在、展开后「同步汇率」与汇率列表均正常，`pageerror=0` |

补验 2 附带确认：`family-summary` abort 时组合卡片渲染 **3 张**、交易/再平衡区块 **0 个**（不二次报错）、无未捕获异常 —— R-3 的容错边界确实成立，不是纸面承诺。

### 13.5 须处理（R-1，进 `Integrating` 前）

> ✅ **已于 2026-10-21 返修**：改为单出口结构（说明与标题置于条件分支之外）+ 申报差异 D-7（空态补 `h2`）。验证 14/14 + 两轮负向对照。详见 **§14**。本节保留为审查原始意见。

**R-1 · AC14 / OD-3 在「贡献列表为空」时失效**

`components/Household/ContributionBar.jsx:20`：

```jsx
if (list.length === 0) return <EmptyState />;   // ← 提前返回，SCOPE_NOTE 在第 76 行，被一起吞掉
```

OD-3 裁决是「口径说明**恒显示**」，但实现在空态下整块 `return`，说明文案不渲染。实测复现：`portfolioContributions: []` + 仅有一个**已归档**组合 + 勾选「显示已归档」→ 页面有卡片（`cards=true`）、**没有**「仅含未归档组合」这句（`note=false`）。

为什么这不是纯理论问题：这个组合（**所有组合都归档 / 家庭汇总无未归档组合** + **用户打开了「显示已归档」**）恰好是 R-1「归档口径打架」最需要那行说明的场景 —— 此时卡片有内容、分桶与占比是空的，用户最可能误以为「数据丢了」。而在数据正常时，说明本来就在，反而是安全的。

修法（一行级，不扩大范围）：把 `SCOPE_NOTE` 提到空态分支之外，例如空态也渲染说明，或改成

```jsx
if (list.length === 0) return (<div className="space-y-2"><EmptyState /><p className="text-xs text-gray-400">{SCOPE_NOTE}</p></div>);
```

> 顺带一处同类（不阻塞）：`CurrencyBuckets` 空态是裸文本「暂无资产分桶数据」，`ContributionBar` 空态是 `<EmptyState />` 组件 —— 同一页相邻两个空态视觉不一致。若要统一，建议同批处理。

### 13.6 建议（不阻塞）

- **A-1 · `docs/issues.md` 是 0 字节未申报文件**（untracked，mtime 10:30）。§12.1 的文件清单里没有它，属 §10「未新增测试文件/文档」边界的灰区。建议删除，或说明用途并纳入清单 —— 否则随 `git add -A` 提交会把一个空文件带进版本库。
- **A-2 · `PL-0-platform-foundation.md` 有 3 处已失效的落点陈述**（不在 AC18 范围内，但属 R-4「删 /family 留残」的文档形态）：`:343` 路由表仍写 `| /family | Family | 家庭视图 |`；`:435` 承载表仍写 `client/src/pages/Family.jsx`；`:225` 架构图仍有「家庭视图 (8)」。这是**当前实现的描述**，不是历史记录，与 `pages/Family.jsx` 已删除的事实冲突。建议随本任务或 `TASK-047` 一并清理。
- **A-3 · D-4 的失效名词只清了 `CLIENT.md`**：`handbook/ops/DEPLOYMENT.md:302`「跨币种折算仅发生在家庭视图」、`handbook/ops/SERVER.md:102`「家庭视图没有录入入口」仍用旧名。同属「手册写了已失效的事实」（TASK-044 R-2 的口径纪律）。
- **A-4 · 首屏布局抖动**（与 TASK-049 §11.7 同型）：`familyLoading` 为真时 ②③ 整段不渲染，卡片区随之上移；家庭汇总返回后分桶+占比插入，卡片下移约 **250px**。不影响功能，但首屏会「跳一下」。若要修，可给 ②③ 一个固定高度的骨架。

### 13.7 边界核对（§10 逐项打勾）

- ✅ `shared/` `server/` `cron-worker/` 零改动（`git status` 空）
- ✅ `hooks/useFamily.js` **零改动**，`queryKey` 仍 `['family-summary']` / `['fx-rates']`
- ✅ `components/PortfolioCard/`、`pages/Dashboard.jsx`、`constants/design-tokens.js` 零改动
- ✅ 未新增 `context` / 主题层 / 抽象基类 / 测试文件（5 个新组件均为纯 props 展示组件，仅 `FxPanel` 自取数据且仅限 fx，符合 §4.1 的容错边界）
- ✅ 未改 `/api/family/*` 契约与折算口径（F-1 只记录未修，已转 `TASK-051`）
- ✅ 未为 `/family` 加重定向（`router.jsx` 只加注释，`*` 通配承接）
- ✅ 未给汇率面板加 `localStorage`/`sessionStorage` 持久化
- ✅ 未动 `Add/EditTransaction` 的 `<option>` 硬编码

### 13.8 说明与遗留

- **`TASK-051` 在本次审查期间出现**（`docs/development/tasks/active/TASK-051-fx-rate-direction.md`，mtime **11:12**，我 11:09 首次 `ls` 时还没有）。非本任务产出，不影响本次判定；`readme.md` / `BOARD.md` / 本 ExecPlan §12.5 对它的引用**均已核实为有效链接**（无死链）。
- `F-2` ~ `F-4`（`e2e-task-049.mjs` 已失效、两个同名 `formatMoney`、`TotalAssetsCard` 注释残留）我复核属实且**判定可不改**：前两者不在 `client/src` 或不匹配 AC15 的 grep，第三者属 TASK-049 产出、本任务 Out of Scope。三者都已登记，不必随本任务归档蒸发。
- `docs/readme.md` 本次改为「活跃任务只留链接 + 负责人，状态以 `BOARD.md` 为准」—— 这正是 TASK-048 审查里提的机制修法，采纳后消除了连续两次的「readme 状态失真」。核对当前 `readme:59-61` 与 `BOARD.md` 无矛盾。
- 提交属 Human：改动仍在工作树，`feature/TASK-050` = `c463c85` + 未提交改动。

---

## 14. R-1 返修记录（2026-10-21）

§13.5 判定的 **R-1** 经 Human 指令修复。改 1 个文件：`client/src/components/Household/ContributionBar.jsx`。

### 14.1 根因

`if (list.length === 0) return <EmptyState />;` 属**整块早退** —— 返回的 JSX 只含 `<EmptyState />`，同级的 `h2` 与 `SCOPE_NOTE` 全部消失。不是「说明写错了位置」，而是「空态下整棵树的兄弟节点都没了」。

### 14.2 修法：单出口结构（D-7）

把 `h2` 与 `SCOPE_NOTE` 移到条件分支**之外**，空态只替换中间内容：

```jsx
<div className="space-y-2">
  <h2>组合占比</h2>
  {list.length === 0 ? <EmptyState /> : (<> 占比条 + 图例 </>)}
  <p className="text-xs text-gray-400">{SCOPE_NOTE}</p>
</div>
```

与 §13.5 建议的双分支 `return` 相比，单出口的差别是**结构上消除复发**：双分支要把说明写两遍，下次再加兄弟节点仍可能只加进一支；单出口的说明不在任何分支内，不可能被漏。

**差异申报 D-7**：空态也渲染 `h2`「组合占比」（§13.5 示例中没有这一步）。依据两条 —— ① 同页 `RecentTransactions`（`h2` 在容器内，`:21-27` 固定渲染，空态只换下方内容）与 `RecentRebalance`（`:15-20` 同型）已是这个写法，`ContributionBar` 原是这页**唯一**偏离该模式的组件；② AC9 的七段结构在空态下同样应完整，否则「暂无数据」是一句无主文案。若 Human 判为超出 R-1 范围，删掉空态分支的 `h2` 即可回退，不影响其余。

**未动**：§13.5 尾注提到的 `CurrencyBuckets` 空态视觉不一致（Reviewer 已明示「不阻塞」）—— 仍为裸文本「暂无资产分桶数据」。口径说明文案为「分桶与占比…」，由占比区在页面上统一覆盖，信息不缺。

### 14.3 验证

脚本 `client/scripts/_check-contributionbar-empty.mjs`（一次性，未进 `package.json`；全部 `page.route` 构造数据，**零写库**；1440×900）。

场景：**A** = `portfolioContributions: []` + 全部组合已归档 + 勾选「显示已归档」（目标场景）· **B** = 两条正常贡献（回归）· **C** = 空态且无卡片 · **D** = 控制台/页面错误。

**结果 14/14 PASS**：

| # | 断言 | 实测 |
|---|---|---|
| A0 | 卡片已渲染（证明「卡片有、占比空」场景成立） | 含「A股-长钱组合」 |
| A1 | 空态仍显示口径说明 | ✅ |
| A2 | 口径说明恰好 1 处 | `count=1` |
| A3 | 空态仍显示「组合占比」标题 | ✅ |
| A4 | 空态区块内含「暂无数据」占位 | scope 文本 = `组合占比 暂无数据 分桶与占比…` |
| A5 | 空态不渲染占比条 | `hasBar=false` |
| A6 | 空态区块内确有口径说明 | ✅ |
| B1/B2 | 正常态说明存在且恰 1 处 | ✅ / `count=1` |
| B3/B4 | 正常态图例 2 项、条在 | ✅ / `hasBar=true li=2` |
| B5 | 正常态区块内无 `EmptyState` | ✅ |
| C1 | 空态（无卡片）也显示说明 —— OD-3 恒显示 | ✅ |
| D1 | 无控制台/页面错误 | ✅ |

### 14.4 两轮负向对照（证明断言能失败）

| 注入的缺陷形态 | 结果 | 说明 |
|---|---|---|
| 改回 `if (list.length === 0) return <EmptyState />;` | **7/14** | A1–A6 + C1 全 FAIL；正常态 B1–B5 仍 PASS —— 证明断言定位在空态，不误伤正常路径 |
| **仅**把 `SCOPE_NOTE` 移进非空分支（精确复现 R-1 形态，标题保留） | **10/14** | A1 / A2 / A6 / C1 FAIL（A3/A4/A5 因标题与占位仍在而 PASS）；正常态 5 条仍 PASS —— 证明断言精确捕捉「说明只在非空态」 |

### 14.5 踩到的断言坑（可复用）

初版 A4 / B5 用整页 `body.includes('暂无数据')` 判定 —— **恒真**：同页「最近交易 / 最近再平衡」空数据时也渲染 `EmptyState`，`A4` 必 PASS、`B5` 必 FAIL（首跑即 FAIL）。改为按「含 `h2 组合占比` 的父容器」作用域取 `innerText` 后才有效。

> 与 §13.4 / `TASK-048` 的「页面不含 undefined 恒真」同型：**整页文本断言在有多区块的页面上几乎总要作用域化**。

### 14.6 收尾状态

- 静态：build exit 0（2408 modules）· eslint 0 error / 0 warning。
- **零服务端改动**：`git status server shared cron-worker` 空。
- 改动仍未提交（`feature/TASK-050` 工作树）。**R-1 已闭环**；§13.6 的 A-1 ~ A-4 未动。
- 新增未跟踪文件 `client/scripts/_check-contributionbar-empty.mjs`（与先前的 `_rv50.mjs` 同类，属一次性验证脚本；是否入库由 Human 定）。

---

## 15. R-1 复验记录（Reviewer，2026-10-21）

**结论：R-1 闭环，`TASK-050` 可进 `Integrating`。** 我**未复用**实现者的 `_check-contributionbar-empty.mjs`，另写一套脚本（跑完即删）；也**未改任何业务代码**（`git status client/src` 与上轮完全一致）。

### 15.1 静态复跑

| 项 | 命令 | 实测 |
|---|---|---|
| 构建 | `npm run build --workspace client` | ✅ `BUILD_EXIT=0`，**2408 modules**（与 §14.6 一致） |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | ✅ **0 error / 0 warning** |
| AC19 零服务端 | `git status --short server shared cron-worker client/package.json package-lock.json` | ✅ 空 |
| AC15 / AC16 / OD-2 复查 | grep | ✅ `pages/Family` 0 · `'/family'` 0 · 侧栏 5 · `ACTION_LABELS = {` 0 · `Object.fromEntries(TRANSACTION_ACTIONS` 恰 1 · `{rec.status}` 0 |
| 口径唯一性 | `grep -rn "分桶与占比仅含未归档组合" client/src` | ✅ **恰好 1 处**（`ContributionBar.jsx:14`）；`function formatCny` 仍 1 处 |

**本轮改动面**：`client/src` 内仅 `ContributionBar.jsx` 的 mtime 变为 **11:50**，其余组件停在 10:48–10:51 —— 与 §14「改 1 个文件」一致。

### 15.2 运行时复验（自写 25 条断言，5 场景）

场景 A = 目标缺陷场景（`portfolioContributions: []` + 全归档卡片 + 勾「显示已归档」）· B = 空态且无卡片 · C = 正常 60/40 回归 · D = `ratio` 合计 120 归一化 · E = 全部 `ratio` 为 null（折算不完整）。全部 `page.route` 构造数据，**零写库**。

**结果 25/25 PASS**，关键实测：

- **A1** 空态区块文本 = `组合占比 暂无数据 分桶与占比仅含未归档组合；已归档组合需在下方卡片中单独查看。` —— 标题、占位、说明三者齐在；
- **A2** 说明全页 `count=1`（无重复渲染）；**A3** `h2` 计数 `=1`（D-7 未造成标题重复）；**A6** 说明是区块 `lastElementChild` 且为 `<p>`，顺序为「标题 → 内容 → 说明」；
- **C4/C5** 段宽和 `1144.0` = 轨道宽 `1144.0`，两段 `686.4 : 457.6` = 60:40；**D2** 合计 120 时两段 `[572, 572]` 等宽 —— 归一化分支未被我上次修复波及；
- **F1** 无控制台/页面错误。

### 15.3 负向对照（断言必须能失败 —— 我自己注入，两轮）

不采信 §14.4 的自述，我直接改文件注入缺陷、跑同一套断言、再按 md5 还原（`RESTORE_OK`，还原后重跑仍 25/25；`grep RVINJECT` 残留 0）。

| 注入形态 | 结果 | 失败断言 | 说明 |
|---|---|---|---|
| ① 改回整块早退 `if (list.length === 0) return <EmptyState />;` | **16/25** | A1–A6、B1–B3（9 条） | 连 `h2` 一起消失 → 区块取不到（`scope=undefined`）；正常路径 C/D/E 全 PASS，证明断言只在空态发力 |
| ② **精确复现 R-1**：仅把说明改成 `{list.length > 0 && …}`（标题保留） | **20/25** | A1、A2、A6、B1、B2（5 条） | A3/A4/A5（标题、占位、无条）仍 PASS —— 证明断言精确锚定「说明」而非「标题」，这正是修复前后唯一的行为差异 |

形态 ② 是关键：它证明我的 A1 不会因为「区块整体还在」而恒真。

### 15.4 D-7 判定：**接受**

空态补 `h2`「组合占比」不构成范围扩张 —— 无新文件、无新依赖、无服务端改动；且「暂无数据」在无标题时是一句无主文案，补标题后与同页 `RecentTransactions` / `RecentRebalance` 的既定写法一致，也满足 AC9 七段结构在空态的完整性。若要回退，删空态分支的 `h2` 即可，不影响其余（已在 §14.2 写明）。

### 15.5 观测（非缺陷、非本轮引入，不阻塞）

`list.length > 0` 但所有 `ratio` 均为 `null` 时，轨道照旧渲染为**0 段的空白灰条** + 图例标注「折算不完整」。修复前后行为一致（原实现的早退只覆盖 `length === 0`），**不是回归**。若将来要处理，可给轨道一个虚线占位或改为 `EmptyState`，需另立卡。

### 15.6 须处理（文档侧，已由我按事实改）

`docs/BOARD.md:30` 与 `:47` 仍写「待修 R-1」，与同文件 `:5`/`:13` 的「R-1 已返修」自相矛盾。状态唯一来源是 `BOARD.md`，故我已改正（纯状态簿记，非业务代码）。

### 15.7 遗留（承接 §13.6，仍需 Human 定）

- `docs/issues.md` 仍是 **0 字节未跟踪文件**（mtime 10:30，上轮已提未处理）；`git add -A` 会把它带进库。
- `client/scripts/_check-contributionbar-empty.mjs` 已在 §14.6 申报，仍是未跟踪文件。若要随任务入库，建议改名为 `e2e-*` 并在 `BOARD.md` 登记；否则删掉，避免 `git add -A` 夹带一次性脚本。
- §13.6 的 A-1 ~ A-4（`PL-0-platform-foundation.md` 三处失效落点、`DEPLOYMENT.md:302` / `SERVER.md:102` 旧名「家庭视图」、首屏布局抖动）**本轮未动**，仍待裁决。

---

## 16. Completion Record（Orchestrator，2026-10-26）

### 16.1 结案依据

| 项 | 内容 |
|---|---|
| Human 指令 | 2026-10-26「TASK-050 已经完成，请修改文档」 |
| 合并落点 | `feature/TASK-050` 已推送并按 **PR #35** 合并入 `main` → **`cafcc5d`**（含 `9baa4cd` + `a9fad6e`）。`main` 现同时含 `TASK-044` / `TASK-048` / `TASK-049` / `TASK-050` |
| 归档前复跑（在 `main` 上执行） | `npm run build --workspace client` → **exit 0**，2408 modules，5.42s（仅既有「chunk > 500 kB」性能警告）· `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` → **exit 0，输出 0 行** · `npm run test:server` → **152 pass / 0 fail** · `npm run test:worker` → **77 pass / 0 fail**（合计 **229 / 0**） |
| AC 静态复查 | AC15 三条（`pages/Family` 0 / `'/family'` 0 / 侧栏 5 项）· AC16 两条（`ACTION_LABELS = {` 0 / `Object.fromEntries(TRANSACTION_ACTIONS` 恰 1 行 `enums.js:29`）· OD-2（`{rec.status}` 0）· AC19（`server shared cron-worker` 空）全部达标；`pages/Family.jsx` 已删、`components/Household/` 5 组件在位 |

> 复跑是在 **`main`**（即已合并的实测基线）上做的，比 2026-10-21 在 `feature/TASK-050` 工作树上的自评更强：本次验证的是**真正入主线的那份代码**。

### 16.2 归档动作

| 对象 | 动作 |
|---|---|
| 本 ExecPlan | `git mv` `development/exec-plans/active/` → `development/exec-plans/completed/`；Status → `Completed`；`Related task` 改指 `development/tasks/completed/`；`Branch / Base` 补合并落点 |
| 任务卡 | `git mv` `development/tasks/active/` → `development/tasks/completed/`；Status → `COMPLETED`；§6 的 B5（独立 Reviewer 复核）由「⏳ 交付时」改为已解除；补 **§14 Completion Record**（含 §14.1 遗留现状核对） |
| `docs/BOARD.md` | Active 清空（写「无活跃任务」）；Blocked 改为「无」；Done 新增 TASK-050 行；Roadmap 第 3 项标记完成 |
| `docs/readme.md` | 活跃任务 → 无；已完成任务补 TASK-050；归档段 `development/exec-plans/active/` 改为「当前为空」 |
| 交叉引用 | `specs/completed/FS-household-view-split.md`（状态行补「两交付单元全部完成」、§9 Phasing）；`FS-portfolio-ia-cleanup.md`（D-1 依赖解除）；`TASK-052` 卡内指向 `development/exec-plans/active/TASK-050` 的相对链接改指 `complete/` |

### 16.3 遗留与移交

| # | 内容 | 去向 |
|---|---|---|
| A-2 | `PL-0-platform-foundation.md:209` 架构图「家庭视图 (8)」、`:427` 承载表仍写 `client/src/pages/Family.jsx`（**文件已删，死引用**）；`:342`/`:348` 已在本任务落地时修好 | 建议随 `TASK-052` docs 治理批清理 |
| A-3 | `DEPLOYMENT.md:302`「跨币种折算仅发生在家庭视图」、`SERVER.md:102`「家庭视图没有录入入口」—— 所指页面已不存在 | 同上 |
| A-4 | 首屏布局抖动（`familyLoading` 期间卡片下移约 250px，与 TASK-049 §11.7 同型） | 另立卡，涉全站 `LoadingState` |
| 脚本 | `client/scripts/_check-contributionbar-empty.mjs`（R-1 验证用，9,891 字节）已随 PR #35 **原样入库**，未改名 `e2e-*`、未登记 `npm run e2e:*` | 建议删除或按 `e2e-task-049.mjs` 先例规范化 |
| 业务 | `TASK-051`（汇率方向反了）仍待 Human 裁决 OQ1/OQ2；本任务交付的 `FxPanel` 文案「1 外币 = ¥人民币 / 如 7.20」在当前数据下自相矛盾 | 已在 `TASK-051` 卡登记，**本任务不处理** |

> 本 ExecPlan 归档后不再变更。
