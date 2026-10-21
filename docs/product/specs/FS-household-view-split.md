# Feature Spec — 家庭视图拆分（总资产进 Dashboard，其余并入组合管理）

| 项 | 内容 |
|---|---|
| 状态 | **`Approved`**（2026-10-19 Human 批准；§8 三个 OQ 一并采纳推荐） |
| 作者 | Orchestrator（按 Human 2026-10-19 裁决起草） |
| 日期 | `2026-10-19` |
| 交付单元 | **两个实施任务**：`TASK-049`（Dashboard 承接总资产卡）· `TASK-050`（组合列表页承接其余五块 + `/family` 下线） |
| 关联产品线 | `PL-6 家庭层` · `PL-1 记账与组合` |
| 服务端改动 | **零**（两任务均为纯客户端） |

---

## 0. TL;DR

`/family` 页的 6 个区块**拆分搬迁**，页面随之消失：

- **总资产卡** → `/`（Dashboard），可点下钻到组合管理。
- **币种分桶 / 组合贡献 / 最近交易 / 最近再平衡 / 汇率管理** → `/portfolios`（组合列表页），**直接改造现有页面**，不新增二级页。
- 侧边栏 6 → 5 项，「家庭视图」移除。

「组合贡献」由**列表**改为**一条堆叠占比条 + 图例**；「最近交易」只做 **5 条预览 + 查看全部**——两处都是为避免与 `PortfolioCard`、`/portfolios/transactions` 形成第二套渲染（TASK-044 的教训）。

---

## 1. Problem Statement

`/` 目前叫「Dashboard」，但**整页只有一个提醒事件列表，没有任何资产数字**（`pages/Dashboard.jsx:71-142`）。用户打开应用先看到待办，而不是先看到钱；真正的家庭视角在另一个页面 `/family`，需要多点一次。

同时 `/family` 是一个**只读汇总页**：6 个区块全部来自一次 `/api/family/summary`，没有独立写入路径（唯一的写操作是汇率录入/同步）。它承担的职责，实质上就是「Dashboard 该有的样子」+「组合列表该有的横向汇总」。

拆分搬迁的动机：

1. 首页要回答「我家现在有多少钱」，提醒是**第二件事**，不是第一件。
2. 家庭的横向汇总（分桶、占比）与组合列表是**同一批数据从粗到细的三层**，分在两页会反复来回跳。
3. 删掉一个页面，少一套信息架构债务。

---

## 2. Goals

| # | 目标 |
|---|---|
| G-1 | 打开应用首屏能看到家庭总资产（RMB 折算），一次点击可下钻到组合管理 |
| G-2 | 家庭层的币种结构、组合占比、最近动态、汇率维护，都在组合管理页内一次读完 |
| G-3 | 顶层导航 6 → 5，`/family` 页面与路由删除，**不留第二套家庭资产渲染** |
| G-4 | **零服务端改动**：复用既有 `GET /api/family/summary`、`GET/PUT /api/family/fx/*` |

---

## 3. Non-Goals

| # | 不做 | 理由 |
|---|---|---|
| NG-1 | 家庭总资产趋势图 | 无组合市值快照模型；回算需服务端按日重放 + 历史时点汇率，属独立需求（PL-6 FAM-01 标 P1） |
| NG-2 | 家庭视图按账户类型 / 大类分组 | PRD CM-05、AS-09 声称「已就绪 / 已用于分组」，但实现里 `portfolioContributions` **不带 `accountType` 也不带大类聚合**，是另一个缺口，独立立项 |
| NG-3 | 提醒中心迁出 `/` 或整体重构 | 本 FS 只搬入总资产卡，提醒列表逻辑（筛选、立即评估、标记已读、忽略）**原样保留** |
| NG-4 | 修改 `PortfolioCard` 的信息结构 | 卡片已显示市值 / 持仓数 / 漂移 / 未读提醒，本次不动 |
| NG-5 | 改汇率业务口径（折算规则、缺价处理） | 沿用「宁可少报不可错报」：缺价或缺汇率 → `cnyValue = null`，不计入总额 |
| NG-6 | 修 `TASK-047`（归属守卫）、`TASK-046`（CSV 幂等） | 与本拆分无文件交叠；`TASK-048` 仅作为前置依赖 |

---

## 4. Proposed Information Architecture

### 4.1 导航变更（6 → 5）

| 现状 | 变更后 |
|---|---|
| `Dashboard · 提醒` → `/` | **`Dashboard`** → `/`（去掉「· 提醒」，因为首页不再只是提醒） |
| `组合管理`（父）→ 组合列表 / 全部交易 | 不变（二级导航保留） |
| `今日行情` | 不变 |
| **`家庭视图` → `/family`** | **删除** |
| `提醒规则` | 不变 |
| `日志` | 不变 |

落点：`client/src/components/layout/Sidebar.jsx:30-45`（`navItems`）；删除项 `:42`，标签 `:31`。

### 4.2 路由变更

| 路由 | 变更 |
|---|---|
| `/` | 不变，内容扩为「家庭总览 + 待处理提醒」 |
| `/family` | **删除**（`router.jsx:41` 与 `pages/Family.jsx` 一并移除） |
| `/portfolios` | 不变，内容扩为「分桶 + 占比 + 卡片 + 最近动态 + 汇率」 |
| 其余 | 不变 |

**`/family` 不做显式重定向**：`router.jsx` 的 `*` 通配已 `<Navigate to="/portfolios" replace />`，旧书签自然落到组合管理。这与 TASK-044 删除旧 `/transactions` 族时的 OQ3 裁决一致（该选择理由：不维护无意义的重定向表）。

### 4.3 页面职责

**`/` — 家庭总览 + 待处理提醒**

```
[ 家庭总览 ]                         [ 同步汇率 ][ 立即评估 ][ 规则管理 ]   ← 见 OQ-2
[ 家庭总资产（RMB 折算）                                  ]  ← 整宽卡片，可点 → /portfolios
[ ¥1,234,567.89   数据时点 … · 部分组合折算不完整 ]        ]
[ ─────────────────────────────────────────────────────── ]
[ 待处理提醒 ]                        [ 未读 | 全部 ] [ 组合筛选 ]
[ 事件卡片 × N（现有实现原样保留）                          ]
```

**`/portfolios` — 组合管理**

```
[ 投资组合 ]                                      [ 显示已归档 ][ 新建 ]
[ 币种分桶：人民币 / 美元 / 加元 / 港币 × 4 卡 ]
[ 组合贡献占比：▓▓▓▓▓▓░░░░░  一条堆叠条 + 图例 ]
[ 组合卡片网格（现有 PortfolioCard，不变） ]
[ 最近交易（5 条）                                    查看全部 → ]
[ 最近再平衡（10 条） ]
[ ▸ 汇率管理（折叠，默认收起） ]
```

---

## 5. User Stories

| # | 故事 | 归属 |
|---|---|---|
| US-1 | 作为家庭管理者，我早上打开应用，**不用点第二次**就能看到家庭总资产是多少 | TASK-049 |
| US-2 | 作为家庭管理者，我看到总资产后可**一次点击**进入组合管理看细节 | TASK-049 |
| US-3 | 作为家庭管理者，我在组合管理页能一眼看出我的钱分布在哪些币种、各组合占比多少 | TASK-050 |
| US-4 | 作为家庭管理者，我在组合管理页能确认最近发生了什么（交易、再平衡），并能进「全部交易」看全量 | TASK-050 |
| US-5 | 作为家庭管理者，我偶尔需要修汇率，但不想它占据组合列表的视觉重心 | TASK-050 |

---

## 6. Requirements

### 6.1 P0 — 交付单元 G1（对应 `TASK-049`）

| # | 需求 | 落点 |
|---|---|---|
| R1 | 将家庭总资产卡从 `Family.jsx:199-207` 抽出为独立组件 `client/src/components/Household/TotalAssetsCard.jsx`，**搬入 `/` 顶部（标题行下方、提醒列表上方），整宽** | 新文件 + `pages/Dashboard.jsx` |
| R2 | 卡片保留现有三要素：**总资产金额**（`¥` + 千分位，2 位小数）、**数据时点**（`asOf` 本地化）、**「部分组合折算不完整（缺价或缺汇率）」提示**（判定沿用 `portfolioContributions.some(c => c.cnyValue == null)`） | `Family.jsx:181-206` |
| R3 | 卡片**整体可点**，跳 `/portfolios`；键盘可达（`role="button"` + `tabIndex`），有 `hover` 态 | 新组件 |
| R4 | 卡片**不放入**「同步汇率」按钮（该动作随汇率面板归 TASK-050）；折算不完整时仅显示文字提示，不提供就地修复入口 | 同上 |
| R5 | `pages/Dashboard.jsx` 的 `h1` 由「提醒中心」改为「家庭总览」；提醒列表上方新增区块标题「待处理提醒」，其下的筛选栏与事件列表**逻辑零改动** | `Dashboard.jsx:89-92, 107-139` |
| R6 | `Sidebar.jsx` 导航标签 `Dashboard · 提醒` → `Dashboard` | `Sidebar.jsx:31` |
| R7 | **不改** `/family` 路由、**不改** `pages/Family.jsx`、**不改** `server/` `shared/` `cron-worker/`（家庭页在 G1 交付后仍可用，只是与首页暂时重复显示总资产——过渡态，由 G2 收尾） | 边界 |

### 6.2 P0 — 交付单元 G2（对应 `TASK-050`）

| # | 需求 | 落点 |
|---|---|---|
| R8 | **币种分桶**搬入 `/portfolios`，位置在标题行下方、占比条上方；保留 4 卡布局（2 列 / lg 4 列）、币种符号、RMB 折算值、非 CNY 的汇率脚注 | `Family.jsx:31-50, 209-210` |
| R9 | **组合贡献改为一条堆叠占比条 + 图例**，**不新增贡献列表**。每段宽度 = `ratio%`；图例每项显示「组合名 · ¥金额 · 占比%」，点击图例项跳该组合持仓页。`ratio == null` 的组合在图例中标注「折算不完整」且**不占条宽** | `Family.jsx:52-86`（重写为 `ContributionBar`） |
| R10 | **最近交易**保留 **5 条预览 + 「查看全部」**（跳 `/portfolios/transactions`）；不得在本页渲染全量列表 | `Family.jsx:222-249` |
| R11 | **最近再平衡**保留 10 条（现状上限），显示组合名、`AUTO/手动`、状态标签、日期 | `Family.jsx:251-278` |
| R12 | **汇率管理**改为 `/portfolios` **底部折叠面板，默认收起**；展开后含：当前汇率列表（币种 / 汇率 / 日期 / 手动或自动）、**同步汇率**按钮、手动录入表单 | `Family.jsx:88-160, 282-283` 与 `:191-195` 的同步按钮一并迁入 |
| R13 | 删除 `client/src/pages/Family.jsx`；删除 `router.jsx` 的 `/family` 路由与 `Family` import；删除 `Sidebar.jsx` 的「家庭视图」项（含 `Users` 图标 import，若不再使用） | 三个文件 |
| R14 | **归档口径必须显式标注**：分桶与占比固定为「非归档口径」（`computeFamilySummary` 排除 archived），与页面上「显示已归档」开关**互不影响**。打开归档开关时卡片会多于占比条中的组合，须在图例旁给一行说明（措辞见 OQ-3） | `familySummary.service.js` 既有行为 |
| R15 | 交易类型中文映射**必须引用** `client/src/constants/enums.js` 的单一导出 `TRANSACTION_ACTION_LABELS`，**不得**再写 `{ buy:'买入', sell:'卖出' }`（`Family.jsx:17` 原缺陷，已由 `TASK-048` 修复并沉淀该导出） | ✅ 依赖 `TASK-048` **已解除**（2026-10-20） |
| R16 | 新增组件统一放 `client/src/components/Household/`，除 `TotalAssetsCard`（G1 已建）外：`CurrencyBuckets.jsx` / `ContributionBar.jsx` / `RecentTransactions.jsx` / `RecentRebalance.jsx` / `FxPanel.jsx` | 新文件 |
| R17 | `/api/family/*` 与 `hooks/useFamily.js` **不改名、不重构**（`queryKey: ['family-summary']` 保持，保证与 `/` 共享缓存） | 边界 |
| R18 | 同步更新文档：`manual/CLIENT.md` §3.6（家庭视图整节拆为「Dashboard 总资产卡」+「组合管理内的家庭汇总」两处，并修 `:49` 与 `:107` 的入口描述）、`product/lines/PL-6-household.md` 的落点列、`product/lines/PL-1-ledger.md` 组合页职责、`PL-6` 中 FAM-01/02/04 的「落点」由 `/family` 改为 `/` 与 `/portfolios` | `docs/` |

### 6.3 P1

| # | 需求 | 备注 |
|---|---|---|
| P1-1 | 汇率折叠面板记住展开态（`sessionStorage`） | 与侧边栏「展开态不持久化」的既有裁决相反，需 Human 单独特批；默认**不做** |

### 6.4 P2 / Future

- 家庭层大类目标 vs 实际（需新数据模型）
- 总资产趋势（需快照或回算）
- 家庭视图按账户类型分组（需 `familySummary` 增字段）

---

## 7. Acceptance Criteria

### G1（`TASK-049`）

| # | 验收标准 |
|---|---|
| AC1 | `/` 首屏（1440×900）在**不滚动**的情况下可见家庭总资产金额与「数据时点」 |
| AC2 | 总资产金额、`asOf`、折算不完整提示与 `/family` 页显示**完全一致**（同一接口、同一格式函数） |
| AC3 | 点击总资产卡跳转 `/portfolios`；键盘 `Enter` 等效 |
| AC4 | 提醒列表的筛选（未读/全部、组合）、标记已读、忽略、立即评估、规则管理跳转**行为不变** |
| AC5 | 侧边栏标签为 `Dashboard`，页面 `h1` 为「家庭总览」，提醒区有「待处理提醒」标题 |
| AC6 | `git status server shared cron-worker` 空输出（零服务端改动） |
| AC7 | `npm run build --workspace client` exit 0；`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` 0 error |
| AC8 | 独立 Reviewer 复核通过，**不得**由 Implementer 自判 |

### G2（`TASK-050`）

| # | 验收标准 |
|---|---|
| AC9 | `/portfolios` 自上而下依次为：标题行 → 币种分桶 → 贡献占比条 → 组合卡片 → 最近交易（≤5 条）→ 最近再平衡（≤10 条）→ 汇率折叠面板 |
| AC10 | 贡献占比条各段宽度之和 ≤ 100%；`ratio == null` 的组合不占条宽且在图表中标注「折算不完整」 |
| AC11 | 图例项点击跳 `/portfolios/view/:id/positions`（与现 `Family.jsx:63` 一致） |
| AC12 | 最近交易恰好 5 条 + 「查看全部」按钮跳 `/portfolios/transactions` |
| AC13 | 汇率面板默认收起；展开后「同步汇率」调用 `POST /api/family/fx/sync` 成功，手动录入后 `fx-rates` 与 `family-summary` 两个 query 均失效刷新 |
| AC14 | 打开「显示已归档」时，页面出现一行口径说明，明确「分桶与占比不含已归档组合」 |
| AC15 | `grep -rn "pages/Family" client/src` 无结果；`grep -rn "'/family'" client/src` 无结果；侧边栏为 5 项 |
| AC16 | `grep -rn "ACTION_LABELS = {" client/src` 无结果（分红标签走 `enums.js` 单一导出） |
| AC17 | 直接访问 `/family` 落到 `/portfolios`（由 `*` 通配承接），无白屏、无报错 |
| AC18 | 四个文档落点已更新（`CLIENT.md` / `PL-6` / `PL-1` / 本 FS 的状态行） |
| AC19 | `git status server shared cron-worker` 空输出 |
| AC20 | 独立 Reviewer 复核通过 |

---

## 8. Open Questions（3 项，均已于 2026-10-19 随 FS 批准按推荐确认）

| # | 问题 | 推荐 | 理由 |
|---|---|---|---|
| OQ-1 | `/family` 是否加显式 `redirect('/portfolios')`？ | **不加** | `*` 通配已兜底；与 TASK-044 OQ3「旧路由删除不重定向」一致，避免维护重定向表 |
| OQ-2 | `/` 标题行是否保留「同步汇率」按钮？ | **不保留，移到 `/portfolios` 汇率面板** | 汇率是低频基础设施维护，不该占首屏；首页折算不完整时只提示 |
| OQ-3 | 归档口径说明的措辞 | 「分桶与占比仅含未归档组合；已归档组合需在下方卡片中单独查看」 | 一句话说清「为什么数字对不上」 |

> **2026-10-19 Human 批准本 FS，OQ-1 / OQ-2 / OQ-3 三项全部采纳推荐值**（见 §11 HD-5）。三项自此不再是待决项。

---

## 9. Phasing

| 阶段 | 内容 | 交付物 |
|---|---|---|
| 阶段 1 | **`TASK-049`**：总资产卡抽组件 + 搬入 `/` + 命名调整 | ExecPlan + 代码 + 审查 |
| 阶段 2 | **`TASK-050`**：五块搬入 `/portfolios` + `/family` 下线 + 文档 | ExecPlan + 代码 + 审查 |
| 收尾 | Human 提交 + 最终验收；Ardot 设计稿 Dashboard / 组合管理两屏同步改版 | 提交 + 设计稿更新 |

**顺序不可颠倒**：阶段 2 删除 `/family` 的前提是阶段 1 已把总资产卡搬到 `/`，否则会出现「总资产消失」的中间态。

---

## 10. Dependencies & Risks

### 依赖

| 编号 | 依赖 | 状态 |
|---|---|---|
| D-1 | `TASK-048`（分红标签）完成 | ✅ **已 `Completed`（2026-10-20）** — 独立评审通过（AC1–AC8），任务卡与 ExecPlan 已归档 `complete/`（改动仍在 `feature/TASK-048-family-dividend-label` 工作树，未提交）。产出 `client/src/constants/enums.js` 的 `TRANSACTION_ACTION_LABELS` 单一导出（全仓同类派生 3 处 → 1 处），`RECENT-TX` 搬迁时**必须 import 该导出**（R15 / AC16 的落点） |
| D-2 | `TASK-049` 完成 | ✅ **已 `Completed`（2026-10-19）** — 提交 `69576ad`+`56c6507`（`feature/TASK-049-dashboard-household-total`，未合入 `main`）；任务卡与 ExecPlan 已归档 `complete/`。G2 可启动 |
| D-3 | Planner 为两任务各产出 `Approved` ExecPlan | ⏳ 按纪律，改 `client/` 亦需批准 |

### 风险

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **归档口径打架**：分桶/占比排除 archived，但列表页有开关 → 用户看到「占比不到 100%」或「卡片比占比多一个」 | AC14 强制显式说明；不试图让两边一致（改服务端口径属 NG） |
| R-2 | **重复实现**：贡献列表与 `PortfolioCard` 重复、最近交易与 `/portfolios/transactions` 重复 | R9 改占比条、R10 只留预览 |
| R-3 | **首屏密度**：`/` 加卡后提醒列表被推低 | 总资产卡高度控制在 ~120px 单卡整宽；实测 AC1 |
| R-4 | **删除 Family 遗留残缺**：import、路由、导航、文档多处 | AC15 用 grep 计数验证，不靠目视 |
| R-5 | **汇率面板语义错位**（家庭层基础设施塞进组合语义） | 折叠 + 默认收起；标题写明「家庭汇率」，不叫「组合汇率」 |
| R-6 | **可见数字错误不被察觉**：分桶合计 ≠ 总资产（因归档/缺价） | 不新增「合计校验」提示（会引入新口径）；仅按 AC14 说明归档差异，缺价已由「折算不完整」覆盖 |

---

## 11. Human Decisions（裁决记录）

| # | 日期 | 裁决 |
|---|---|---|
| HD-1 | 2026-10-19 | **拆分式搬迁**而非整页合并：总资产卡 → Dashboard；其余五块 → 组合管理；`/family` 页面消失 |
| HD-2 | 2026-10-19 | **直接改造现有 `/portfolios`**，不新增 `/portfolios/overview` 二级页 |
| HD-3 | 2026-10-19 | **拆成两个 task**：一个改 Dashboard，一个改组合列表页 |
| HD-4 | 2026-10-19 | `TASK-048` 作为前置（避免把分红 `undefined` 缺陷搬到组合页） |
| HD-5 | 2026-10-19 | **批准本 FS**，状态 `Draft` → `Approved`；§8 的 OQ-1 / OQ-2 / OQ-3 三项**全部采纳推荐值** |

---

## Appendix A — 现状代码事实（已核实，供 Planner）

| 事实 | 落点 |
|---|---|
| `/` 全页仅提醒事件列表，无资产数字 | `client/src/pages/Dashboard.jsx:71-142` |
| `/` 的 `h1` 文案为「提醒中心」 | `Dashboard.jsx:89-92` |
| 侧边栏 6 项，`Dashboard · 提醒` / 家庭视图 | `Sidebar.jsx:30-45` |
| `/family` 路由 | `client/src/router.jsx:41` |
| `*` 通配已重定向到 `/portfolios` | `router.jsx` 末尾 |
| Family 页 6 区块与行号 | 总资产 `:199-207`、分桶 `:209-210`、贡献 `:212-220`、最近交易 `:222-249`、最近再平衡 `:251-278`、汇率 `:282-283` |
| 家庭汇总**一次请求返回全部五块** | `shared/services/familySummary.service.js`（`totalCny` / `buckets` / `portfolioContributions` / `recentTransactions` / `recentRebalanceRecords` + `asOf`） |
| 家庭汇总**排除 archived** | `familySummary.service.js` 查询条件 `archived: { $ne: true }` |
| 两页可共享缓存 | `hooks/useFamily.js:12` `queryKey: ['family-summary']` |
| `PortfolioCard` 已显示市值 / 持仓数 / 漂移 / 未读 | `components/PortfolioCard/index.jsx:69-84` |
| `/portfolios` 当前只有标题行 + 两列卡片 | `pages/Portfolio/List.jsx:19-53` |
| 贡献列表点击落 `/portfolios/view/:id/positions` | `Family.jsx:63`（该路由仍有效） |
| 分红标签缺陷（前置） | `Family.jsx:17, 237-238`（`TASK-048`）— ✅ **已修复（2026-10-20）**：`Family.jsx` 改用 `TRANSACTION_ACTION_LABELS` + 显式染色映射；真实症状为「空白 badge + 跌绿底」而非页面出现 `undefined` 字样（React 渲染 `{undefined}` 为空） |
| `familySummary` 不含 `accountType` / 大类聚合 | 返回字段仅 `portfolioId/name/currency/marketValueByCurrency/cnyValue/ratio` → NG-2 的依据 |
| 设计稿 | Ardot《PortoMind 投资组合管理工具 Web 设计稿》，7 屏；Dashboard 与组合管理两屏需同步改版（仓库内无设计文档） |
