# 前端开发文档（CLIENT_DEV）

> 受众：**开发者**（新增页面 / 改数据层 / 接设计稿）。
> 覆盖：`client/` 的**目录结构、路由与 `ROUTES` 常量、状态与数据层（TanStack Query）、service 层、组件清单、设计 token**，以及新增页面时应遵循的动作。
> 不覆盖：界面**怎么用**（→ [CLIENT.md](../manual/CLIENT.md)）、业务口径（→ [CLIENT.md §5](../manual/CLIENT.md)）、后端接口契约（→ [API_CONTRACT.md](./API_CONTRACT.md)）、部署与构建（→ [DEPLOYMENT.md](../manual/DEPLOYMENT.md)）。
> 本文件落在 `docs/dev/`，与 [API_CONTRACT.md](./API_CONTRACT.md)、[DATA_MODEL.md](./DATA_MODEL.md) 同属「开发视角的技术文档」。

> **权威性声明**：本文件是 `client/src` 的**派生视图**。路由以 `router.jsx` 为准、默认值以代码为准；冲突时改本文件而不是相信记忆。

---

## 1. 目录结构

```text
client/src/
├── router.jsx              # 全部路由声明（单文件，无懒加载）
├── main.jsx                # 挂载 + QueryClient 默认配置
├── constants/
│   ├── routes.js           # ROUTE_PATTERNS（path 模式）+ ROUTES（生成函数）
│   ├── enums.js            # 枚举 ↔ 中文标签（口径单一来源）
│   └── design-tokens.js    # 颜色 / 圆角 / 字体 / 布局尺寸
├── hooks/                  # TanStack Query 封装（useAlerts / useFamily / usePortfolio / usePortfolios / useTransactions）
├── services/               # axios 实例 + 各领域 service
├── components/             # 跨页面复用组件
│   ├── layout/             # AppLayout / Sidebar
│   ├── ButtonGroup/ DataState/ PortfolioCard/ TransactionTable/
│   └── Household/          # 家庭区块 6 个（纯 props 组件）
├── pages/                  # 页面（按域分目录）
└── utils/
    └── priceDisplay.js     # 价格展示口径（formatCny / formatMoney / 缺口判定）
```

**依赖方向**：`pages` → `components` → `services` → `api.js`。`components` 不直接 import `pages`；`services` 不含 React 代码。

---

## 2. 路由

### 2.1 路由职责划分

路由全部声明在 `router.jsx` 一个文件里，全部嵌套于 `<AppLayout />`（共享 Sidebar + 顶栏 + `<Outlet/>`）。**没有**按模块拆分的子路由，也**没有**懒加载。

路径模式集中在 `constants/routes.js`，并区分两套导出：

| 导出 | 用途 | 特点 |
|---|---|---|
| `ROUTE_PATTERNS` | 注册路由用（`<Route path={...} />`） | 含 `:param` 占位符 |
| `ROUTES` | 生成跳转地址用（`navigate(ROUTES.X(id))`） | 多数是同名函数，接受参数 |

**新增页面必须两边都加**：`ROUTE_PATTERNS` 缺了路由不匹配，`ROUTES` 缺了跳转无处可去。

### 2.2 路由表

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | `Dashboard` | 提醒中心（事件流 / 筛选 / 立即评估 / 规则入口）+ 家庭总资产卡 |
| `/alerts/rules` | `Alerts/AlertRules` | 提醒规则管理 |
| `/portfolios` | `Portfolio/List` | 组合卡片列表 + 家庭五区块（币种分桶 / 贡献占比 / 最近交易 / 最近再平衡 / 汇率面板〔默认收起〕） |
| `/portfolios/new` | `Portfolio/PortfolioForm` | 新增组合（含目标配置，内联实现） |
| `/portfolios/edit/:id` | `Portfolio/PortfolioForm` | 编辑组合 |
| `/portfolios/view/:id` | `Portfolio/Detail` | 组合详情（无 tab 时 redirect 到默认 Tab） |
| `/portfolios/view/:id/:tab` | `Portfolio/Detail` | 组合详情（非法 tab 也 redirect 到默认 Tab） |
| `/portfolios/transactions` | `Transaction/TransactionList` | 跨组合「全部交易」聚合页（**只读**） |
| `/portfolios/:id/transactions/new` | `Transaction/AddTransaction` | 新增交易（组合由路径锁定） |
| `/portfolios/:id/transactions/edit/:txId` | `Transaction/EditTransaction` | 编辑交易 |
| `/portfolios/:id/transactions/import` | `Transaction/ImportTransactions` | CSV 导入向导 |
| `/instruments` | `Asset/AssetList` | 标的列表（从「今日行情」屏底进入，**不占顶层导航**） |
| `/instruments/new`、`/instruments/edit/:id` | `Asset/AssetForm` | 标的表单 |
| `/instruments/:id` | `Asset/AssetDetail` | 标的详情：属性 + 价格表现面板（纯客户端聚合） |
| `/assets`、`/assets/new` | — | **旧路由兼容 redirect** → `/instruments*` |
| `/assets/edit/:id` | — | 旧路由兼容 redirect，由 `LegacyAssetEditRedirect` 内联组件保留 `id` |
| `/prices` | `Prices/Today` | 今日 / 指定日价格 |
| `/prices/:symbol/history` | `Prices/History` | 价格历史 |
| `/logs` | `LogViewer` | 日志查看（运维页） |
| `*` | — | 通配 redirect → `/portfolios` |

**已下线**：`/family`（原家庭视图页）已删除，**不设显式重定向**，书签由 `*` 通配承接落到 `/portfolios`。后端 `/api/family/*` 端点全部保留——它们仍供 Dashboard 与组合列表页取数，**不是死代码**。

> **账号与访问控制（TASK-058）前端路由尚未实现**（U2/U3 待做）：`/login`（不套 `AppLayout`）、`/account`、`/account/users`（独立页，仅 admin）；未登录守卫 `→ /login?next=<原路径>`、登录后回跳、axios 401 拦截、强制改密闸门。**后端 U1 已上线能力但不得单独发布**——前端无登录入口时全站会 401。契约见 [API_CONTRACT](./API_CONTRACT.md)「认证与错误码」与 [FS-authentication](../product/specs/FS-authentication.md)。

### 2.3 组合详情 Tab

`pages/Portfolio/Detail.jsx` 内定义，**4 个 Tab，默认 `positions`**：

| key | 标签 | 组件 |
|---|---|---|
| `positions` | 持仓概览 | `PositionOverview` |
| `position-history` | 持仓历史 | `PositionHistory` |
| `rebalance` | 再平衡 | `Rebalance`（内部 3 个子 Tab） |
| `transactions` | 交易记录 | `Transactions` |

Tab 由 URL 参数驱动（`NavLink`），**不是**组件内 `useState` —— 唯一例外是 `Rebalance.jsx` 的子 Tab（内部 state，不读 URL，见 §8.3）。

### 2.4 三条路由约束（违反会静默出错）

1. **字面量路由必须先于动态路由声明**：`/portfolios/transactions`（2 段字面量）必须排在 `/portfolios/:id` 之前。当前没有 2 段 `:id` 路由，故不冲突；**将来若新增 `/portfolios/:id` 直连页，聚合页会被吞掉**。
2. **写操作一律带组合 id**：不存在「未指定组合」的写入路径（`/transactions` 旧路由族已删除且不做重定向）。
3. **redirect 必须用 `replace`**：现有一律 `<Navigate ... replace />`，避免历史栈被打回。

---

## 3. 状态与数据层

### 3.1 QueryClient 默认配置（`main.jsx`）

```js
defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 } }
```

各 hook 会**就地覆盖** `staleTime`（见下表），不要假设全局值生效。

### 3.2 hooks 清单（`hooks/`）

文件：`useAlerts.js` / `useFamily.js` / `usePortfolio.js` / `usePortfolios.js` / `useTransactions.js`。

| Hook | queryKey | staleTime / 轮询 | 参数 |
|---|---|---|---|
| `usePortfolio(id)` | `['portfolio', id]` | 60s | `enabled: Boolean(id)` |
| `usePortfolios({includeArchived})` | `['portfolios-summary', {includeArchived}]` | 60s | 默认 `includeArchived: false` |
| `useTransactions(portfolioId)` | `['transactions', portfolioId]` | **30s** | `enabled: Boolean(portfolioId)` |
| `useFamilySummary()` | `['family-summary']` | 60s | — |
| `useFxRates()` | `['fx-rates']` | 60s | — |
| `useAlertRules(params)` | `['alert-rules', params]` | 60s | 参数对象进 key |
| `useAlertEvents(params)` | `['alert-events', query]` | **30s** | `enabled` 被单独摘出，不进 key |
| `useUnreadAlertCount()` | `['alert-unread-count']` | **`refetchInterval: 5000`** | 全局 5s 轮询 |

mutation hooks：`useUpsertFxRate` / `useSyncFxRates` / `useCreateAlertRule` / `useUpdateAlertRule` / `useDeleteAlertRule` / `useMarkAlertEventRead` / `useEvaluateAlerts`，各自内部负责失效相关 key（见 §3.4）。

**返回形状统一**为 `{ data, isLoading, isError, refetch }` —— 不返回 `error` 对象。错误信息取 `getApiErrorMessage(error)` 或由页面自行 `catch`。

### 3.3 未走 Query 的页面（现状，非缺陷）

只有 Dashboard、组合列表、组合详情头部、提醒规则、交易写操作页走了 Query。**资产 / 价格 / 持仓 / 再平衡 / 日志等页面仍是「service 直调 + 组件内 `useState`/`useEffect`」**。

这不是遗漏，是分阶段迁移的中间状态：
- **新页面必须直接用 Query hooks**，不要再新增 `useEffect` 取数；
- 存量页面**不要求**为迁移而迁移（低频、命令式分页筛选页的迁移收益低于回归风险）；
- 已迁移的页面不得退回 `useEffect`。

### 3.4 失效传播（改 mutation 时必看）

跨页数据存在隐含依赖：一次写入可能影响多个 key。例如提醒相关 mutation 会同时失效 `alert-events` + `alert-unread-count` + `portfolios-summary`（因为组合卡上有未读数）。**新增 mutation 时先确认它影响了哪些已在别的页面被缓存的 key**，漏失效会表现为「操作成功但界面不变」。

---

## 4. Service 层（`services/`）

### 4.1 `api.js`（唯一 axios 实例）

| 项 | 值 |
|---|---|
| `baseURL` | `VITE_API_URL`（去尾部斜杠）→ 空则同源 `/api` |
| `timeout` | 15000 ms |
| 默认头 | `Accept: application/json` |
| 响应拦截器 | **成功时直接返回 `response.data`**（业务层拿到的就是 data，不要写 `res.data.data`） |
| 错误时挂载 | `error.apiMessage` / `error.traceId` / `error.status` |

`getApiErrorMessage(error, fallback)` 统一拼接 message 与 traceId。

> ⚠️ **不要新建第二个 axios 实例**。所有请求走 `api`，否则拦截器（traceId、统一错误形状）会被绕过。

### 4.2 领域 service

`asset` / `portfolio` / `position` / `price` / `transaction` / `rebalance` / `alert` / `family` / `log` 各一个文件，每个只负责「拼 URL + 传参 + 返回 data」。

**service 层不做业务计算、不做字段改名**——口径在 `shared/` 服务端实现（前后端共用同一份业务内核），前端二次计算会造成两套口径。

---

## 5. 组件清单

### 5.1 布局

| 组件 | 职责 |
|---|---|
| `layout/AppLayout` | 主框架：Sidebar(232px) + 顶栏(64px，含未读铃铛) + `<Outlet/>` |
| `layout/Sidebar` | **5 项**顶层导航：Dashboard / 组合管理〔二级：组合列表 / 全部交易〕/ 今日行情 / 提醒规则 / 日志。激活态紫底紫字，`active` 用**显式判定函数**而非前缀匹配；展开态不持久化；底部版本号写死在组件内 + 一个**无 handler 的「退出登录」按钮**（当前无登录态，属占位，见 §8.1） |

### 5.2 通用

| 组件 | 职责 |
|---|---|
| `DataState` | `LoadingState` / `EmptyState` / `ErrorState` 三态占位，全站复用 |
| `ButtonGroup` | 按 `type`（`default`/`primary`/`danger`）渲染按钮组 |
| `TransactionTable` | 交易表格**唯一实现**：中文表头 + `action`/`assetType` 中文映射 + 按币种格式化；可选组合列、操作列；日期自动截取 |
| `PortfolioCard` | 组合卡片：市值分桶 / 持仓数 / `DriftBadge` / 未读提醒数 |

### 5.3 业务（页面内组件）

`pages/Portfolio/` 内含 `KpiCards` / `PortfolioHeader` / `PositionOverview` / `PositionHistory` / `Rebalance` / `RebalanceSuggester` / `RebalanceHistory` / `PortfolioRebalanceSettings` / `Transactions`。

它们**不跨页面复用**，因此与页面同目录，不进 `components/`。判断标准：**被 2 个及以上页面使用的才提到 `components/`**。

### 5.4 `components/Household/`（家庭区块 6 个）

| 组件 | 职责 | 挂载位置 |
|---|---|---|
| `TotalAssetsCard` | 家庭总资产卡（**自取数据**，用 `useFamilySummary`） | `/` |
| `CurrencyBuckets` | 币种分桶 | `/portfolios` |
| `ContributionBar` | 组合贡献占比条 | `/portfolios` |
| `RecentTransactions` | 最近交易 | `/portfolios` |
| `RecentRebalance` | 最近再平衡 | `/portfolios` |
| `FxPanel` | 汇率面板（**默认收起**，含手动改汇率与同步） | `/portfolios` |

**除 `TotalAssetsCard` 外全部是纯 props 组件**：数据由 `List.jsx` 一次取到后下传。`List.jsx` 的 loading / error 也已下沉到卡片区，不要把取数逻辑改回各自组件内——那会产生多次重复请求与不一致的 loading 态。

`RECENT_LIMIT` 由后端 fixed 为 10（交易与再平衡都是），前端要 5 条请自己 `slice(0, 5)`。

### 5.5 零引用文件（勿使用）

以下文件**在全仓没有任何引用**，改动它们不会影响界面：

`components/AddTransactionForm.jsx`、`components/layout/Header.jsx`、`components/common/Header.jsx`、`components/common/ErrorAlert.jsx`（0 字节）、`components/common/Loading.jsx`（0 字节）、`components/layout/MainLayout.jsx`（0 字节）、`pages/Portfolio/Basic.jsx`、`pages/Portfolio/TargetAllocation.jsx`、`utils/formatters.js`、`utils/helpers.js`（0 字节）、`utils/chartConfig.js`（0 字节）。

> `utils/formatters.js` 里有一个 `processETFData`，其涨跌幅算法本身是错的——**不要为了「先跑起来」去 import 它**。
> 清理动作待排期；**本清单即唯一归属**（原 PL-0 §8.2 已撤销）。

---

## 6. 设计系统

### 6.1 Design token（`constants/design-tokens.js`）

与 Ardot 设计稿《PortoMind 投资组合管理工具 Web 设计稿》对齐，**只收当前实际用到的值**，不做完整 theme。

| 组 | 值 |
|---|---|
| 背景 | `bgPage #F6F8FA`、`bgCard #FFFFFF` |
| 边框 | `border #E3E8EE`、`borderStrong #D7DEE6` |
| 文本 | `textPrimary #0A2540`、`textSecondary #5E6B7E`、`textMuted #8A95A5`、`textInverse #FFFFFF` |
| 品牌 | `brand #635BFF`、`brandHover #5247DB`、`brandSurface #EEEDFF`、`brandSurfaceHover #E0DEFF` |
| 状态 | **`up #DF1B41`（A 股涨红）**、**`down #0E9F6E`（A 股跌绿）**、`warn #F5A524`、`danger #E0254B` |
| 资产类型 | `stock #0284C7`、`etfOnshore #0E9F6E` |
| 圆角 | `sm 6px` / `md 8px` / `lg 10px` / `pill 999px` |
| 布局 | `sidebarWidth 232`、`topbarHeight 64`、`contentPaddingX 32`、`contentPaddingY 24` |
| 字体 | `sans` = Noto Sans SC 优先 / Inter 兜底；`numeric` = Inter 优先 |

**涨跌配色遵循 A 股约定（涨红跌绿），与欧美相反——不要「修正」它。**

### 6.2 双轨样式（现状，非目标）

| 轨 | 用在哪 | 定义在哪 |
|---|---|---|
| 内联 `style` + token | 布局、Dashboard、组合详情、家庭区块 | `design-tokens.js` |
| Tailwind 工具类 | 表单、列表、表格等业务页 | `index.css` |

**关键事实**：Tailwind 侧**没有接 token** —— `index.css` 只有 `@import "tailwindcss"`，`body` 用 `bg-gray-50` / `text-gray-800`，字体写死 `Inter`。即同一视觉语义在两套里的**取值不同源**（页面底 `#F6F8FA` vs `gray-50`，中文优先字体 vs 写死 Inter）。

**当前约定**：新代码优先用语义化 class（`text-up` / `text-down` / `bg-brand-surface` 一类，需先在 `@theme` 里映射），**不要求**为统一而重写存量页面。任何「全站换皮」类改动必须先落 `@theme` 映射，再分批迁移。

### 6.3 展示口径函数（`utils/priceDisplay.js`）

| 函数 | 口径 |
|---|---|
| `formatCny(n)` | 人民币 |
| `formatMoney(n, currency)` | 按币种格式化，`US$` / `CA$` 等 householdSymbol |
| 缺口判定 | 相对基准法：按 `market` 分组取最新日期，仅判个别标的落后 ≥3 工作日 |

> 行情页的单价用 `fmtPrice`（`$` / `C$`），与 household 口径**有意不同**，不要合并。

---

## 7. 新增页面的标准动作

1. **建页面**：`pages/<域>/<Name>.jsx`。
2. **注册路由**：`constants/routes.js` 加 `ROUTE_PATTERNS`，若有跳转需求再加 `ROUTES`；`router.jsx` 里挂到 `<Route element={<AppLayout/>}>` 内部（**否则没有 Sidebar**）。
3. **数据层**：优先在 `hooks/` 新增 Query hook（`queryKey` 用数组，参数对象进 key），**不要**在组件内写 `useEffect` 取数。若只是单页一次性读取，也至少用 `useQuery` 包一层以获得缓存与 `isLoading` 语义。
4. **service**：若接口尚不存在，先在 `services/<域>.service.js` 加函数，URL 与参数与 [API_CONTRACT.md](./API_CONTRACT.md) 对齐。
5. **导航**：只有「用户每天要看」的入口才进 Sidebar（当前 5 项已到上限，新增需先撤一项）。运维/排障类入口保留 URL 直达。
6. **样式**：优先 token（内联）或已映射的语义 class；不要引入新的色值字面量。
7. **空态与错误态**：用 `DataState` 的 `EmptyState` / `ErrorState`，不要各写一套。

---

## 8. 已知偏差（改相关代码前先看）

### 8.1 认证已落地后端，前端登录/账户页待 U2

**后端**（TASK-058 U1，2026-10-27）已实现 `User`/`Session` + 全站 `401` 闸门 + `admin`/`member` 角色 + `/api/auth/*` + `/api/users/*`；**前端尚未接入**：`Sidebar` 底部的「退出登录」仍是**无 onClick 的占位**，`/login`、`/account`、`/account/users` 与 401 拦截由 **U2/U3** 实现（见 §2.2 注记）。在 U2 就绪前后端认证版本**不得单独发布**（会全站 401）。

### 8.2 `ROUTES.PORTFOLIO_VIEW(id)` 是死别名

`ROUTE_PATTERNS.PORTFOLIO_VIEW = '/portfolios/view/:id'`（模式），但 `ROUTES.PORTFOLIO_VIEW(id)` 生成的是 `/portfolios/view/:id/**basic**`，而 `basic` 不在 `TABS` 内 → 靠 `Detail` 的一次 redirect 落回默认 Tab。**卡片点击会多一跳**。新增跳转请用 `ROUTES.PORTFOLIO_TAB(id, 'positions')`。

### 8.3 再平衡子 Tab 不读 URL

`pages/Portfolio/Rebalance.jsx` 的子 Tab 用组件内 `useState`，**不读 URL 参数**。后果：从 Dashboard 的事件卡跳 `/portfolios/view/:id/rebalance` 时，永远落在「最新建议」子 Tab，无法直达某条历史记录。

事件侧已在 `snapshot` 里写了 `recordId`，前端零引用——**缺的不是页面，是 `?record=` 锚点**。

### 8.4 `PortfolioHeader` 的「上次再平衡」恒为空

`PortfolioHeader` 读取 `portfolio.lastRebalanceAt`，但该字段在接口返回中**不存在** → Chip 恒显示「暂无」。真实数据需从 `RebalanceRecord` 或 summary 的 `lastExecutedAt` 取（后者当前也未回传）。

### 8.5 `KpiCards` 的「今日盈亏」恒为 `'—'`

`KpiCards`（`pages/Portfolio/`）的今日盈亏恒显示 `'—'`，且其货币格式器**硬编码 `currency: 'USD'`**，对 CNY/CAD 组合显示错误符号。

### 8.6 组合详情无「概览」Tab

4 个 Tab 都是明细视角，缺一个汇总视角（KPI + 目标 vs 实际 + 触发原因 + 最近再平衡）。IA 调整方案已批准但未实施，见 [FS-portfolio-ia-cleanup](../product/specs/FS-portfolio-ia-cleanup.md)。

### 8.7 删除组合没有界面入口

`deletePortfolio` 只在零引用的 `pages/Portfolio/Basic.jsx` 中被调用 → **界面上无法删除组合**（只能通过 API 或直接操作数据库）。

---

## 9. 相关文档

- [API_CONTRACT.md](./API_CONTRACT.md) — 接口契约（本文件所有 service 的上游）
- [DATA_MODEL.md](./DATA_MODEL.md) — 字段与索引（前端读到的数据结构来源）
- [CLIENT.md](../manual/CLIENT.md) — 面向使用者的界面操作说明与业务口径
- [DEPLOYMENT.md](../manual/DEPLOYMENT.md) — 本地启动、构建、环境变量
- [PL-3](../product/lines/PL-3-portfolio.md) / [PL-5](../product/lines/PL-5-alerting.md) / [PL-6](../product/lines/PL-6-household.md) — 页面背后的产品判定
