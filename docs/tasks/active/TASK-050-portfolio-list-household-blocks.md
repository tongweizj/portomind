# TASK-050 — 组合列表页承接家庭五区块，`/family` 下线

## Metadata

**Status:**  
`PLANNING`（需求已起草，待 FS 批准 + Planner 产出 ExecPlan）

**Priority:**  
`High`（信息架构收尾：`/family` 页面与路由删除）

**Owner:**  
待指派（Planner → Implementer → 独立 Reviewer）

**Created:**  
`2026-10-19`

**Updated:**  
`2026-10-19`

**Type:**  
`Feature`（信息架构 / 组件搬迁 + 页面下线，纯客户端）

**Related Product Spec:**  
`docs/product/specs/FS-household-view-split.md`（交付单元 **G2**，需求 R8–R18 / AC9–AC20）

**Related ADR:**  
`None`

**Execution Plan:**  
待创建

**来源：**  
Human 于 2026-10-19 裁决「家庭视图拆分式搬迁」，并要求拆成两个任务：本任务负责组合列表页部分。

---

## 1. 问题

`/family` 是一个**只读汇总页**：6 个区块（总资产 / 分桶 / 贡献 / 最近交易 / 最近再平衡 / 汇率）全部来自一次 `GET /api/family/summary`，没有独立的写入路径。

其中 5 个区块（除总资产卡，归 TASK-049）本质是**组合列表的横向汇总**——同一批组合从「币种结构 → 占比 → 明细卡片」的三层视角，却分在另一个页面。用户要在两页之间来回跳。

本任务把这 5 块并入 `/portfolios`，然后删除 `/family` 页面、路由与导航项。

---

## 2. 已核实的代码事实（2026-10-19 亲读）

| 事实 | 落点 |
|---|---|
| Family 页 6 区块行号 | 分桶 `:31-50, 209-210`；贡献 `:52-86, 212-220`；最近交易 `:222-249`；最近再平衡 `:251-278`；汇率 `:88-160, 282-283`；同步汇率按钮 `:191-195` |
| 家庭汇总一次返回五块（+ `asOf`） | `hooks/useFamily.js:10-18` |
| 家庭汇总**排除 archived** | `shared/services/familySummary.service.js` 查询条件 `archived: { $ne: true }` |
| `/portfolios` 现状：标题行 + 两列卡片 | `pages/Portfolio/List.jsx:19-53` |
| `PortfolioCard` 已显示市值/持仓数/漂移/未读 | `components/PortfolioCard/index.jsx:69-84` |
| 贡献点击落 `/portfolios/view/:id/positions` | `Family.jsx:63`（该路由仍有效） |
| 交易类型中文映射缺陷 | `Family.jsx:17` 手写 `{buy, sell}`；`:237` 二元染色；`:238` 无兜底 → 分红渲染 `undefined`（见 `TASK-048`） |
| `/family` 引用仅 2 处 | `Sidebar.jsx:42`、`router.jsx:41`（router 另有 `import Family from './pages/Family'`） |
| `*` 通配已重定向 `/portfolios` | `router.jsx` 末尾 |

**关键结论：本任务零服务端改动。**

---

## 3. Acceptance Criteria

| # | 验收标准 |
|---|---|
| AC9 | `/portfolios` 自上而下依次为：标题行 → 币种分桶 → 贡献占比条 → 组合卡片 → 最近交易（≤5 条）→ 最近再平衡（≤10 条）→ 汇率折叠面板 |
| AC10 | 贡献占比条各段宽度之和 ≤ 100%；`ratio == null` 的组合不占条宽，且在图表中标注「折算不完整」 |
| AC11 | 图例项点击跳 `/portfolios/view/:id/positions`（与现 `Family.jsx:63` 一致） |
| AC12 | 最近交易恰好 **5 条** + 「查看全部」按钮跳 `/portfolios/transactions`；本页不渲染全量 |
| AC13 | 汇率面板默认收起；展开后「同步汇率」调用成功；手动录入后 `fx-rates` 与 `family-summary` 两个 query 均失效刷新 |
| AC14 | 打开「显示已归档」时，页面出现一行口径说明，明确「分桶与占比仅含未归档组合」 |
| AC15 | `grep -rn "pages/Family" client/src` 无结果；`grep -rn "'/family'" client/src` 无结果；侧边栏为 **5 项** |
| AC16 | `grep -rn "ACTION_LABELS = {" client/src` 无结果（分红标签走 `constants/enums.js` 单一导出） |
| AC17 | 直接访问 `/family` 落到 `/portfolios`（由 `*` 通配承接），无白屏、无控制台报错 |
| AC18 | 文档已更新：`manual/CLIENT.md` §3.6 拆为两处并修 `:49`/`:107` 入口描述；`product/lines/PL-6-household.md` 落点列；`product/lines/PL-1-ledger.md` 组合页职责；`FS-household-view-split.md` 状态行 |
| AC19 | `git status server shared cron-worker` 空输出 |
| AC20 | 独立 Reviewer 复核通过；Implementer 不得自判 |

---

## 4. Scope

**In Scope**

- 新建 `client/src/components/Household/`：`CurrencyBuckets.jsx` / `ContributionBar.jsx` / `RecentTransactions.jsx` / `RecentRebalance.jsx` / `FxPanel.jsx`
- `client/src/pages/Portfolio/List.jsx`：按 §4.3 布局插入五块
- 删除 `client/src/pages/Family.jsx`；`client/src/router.jsx` 删除 `/family` 路由与 `Family` import；`client/src/components/layout/Sidebar.jsx` 删除「家庭视图」项（并清理不再使用的 `Users` import）
- 更新 4 处文档（见 AC18）

**Out of Scope**

- 不动 `TotalAssetsCard` 与 `Dashboard.jsx`（属 TASK-049）
- 不改 `hooks/useFamily.js`、不改 `services/family.service.js`、不改 `/api/family/*`（R17：保持 `queryKey: ['family-summary']` 以共享缓存）
- 不改 `PortfolioCard` 结构；`/portfolios` 的「显示已归档」开关行为不变
- 不做汇率折叠态持久化（FS P1-1，默认不做）
- 不做趋势、家庭分组（FS §3 Non-Goals）
- 不改服务端

---

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **归档口径打架**：分桶/占比排除 archived，但卡片受开关影响 → 用户看到「占比不到 100%」或「卡片比占比多」 | AC14 强制显式说明；不试图统一口径（改服务端属 NG） |
| R-2 | **重复实现**：贡献列表与 `PortfolioCard` 重复、最近交易与 `/portfolios/transactions` 重复 | 贡献改占比条（AC10）、最近交易只留 5 条预览（AC12） |
| R-3 | **分红标签缺陷被搬过来**：`Family.jsx:17` 的 `{buy, sell}` 若照搬，组合页会渲染 `undefined` | **前置依赖 TASK-048**；AC16 用 grep 计数验证走 `enums.js` |
| R-4 | **删除残留**：import / 路由 / 导航 / 文档多处不一致 | AC15 用 grep 验证，不靠目视 |
| R-5 | **`/family` 删除后总资产丢失** | 前置依赖 TASK-049 已交付；本任务 `blockedBy TASK-049` |
| R-6 | **汇率面板语义错位**（家庭层基础设施塞进组合语义） | 折叠 + 默认收起，标题写「家庭汇率」 |
| R-7 | **页面过长**：五块叠加后组合列表页信息密度过高 | 分桶与占比条**同行或紧邻**（不占整屏）；最近动态两栏并排（沿用 `Family.jsx:212` 的 `lg:grid-cols-2`）；汇率必须默认收起 |
| R-8 | 首屏卡片被推得太低 | 占比条压成单行（高度 ≤ 48px 含图例），必要时图例折行 |

---

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| **B1** | `TASK-049` 完成（总资产卡已在 `/`） | ⏳ **硬前置**——否则删除 `/family` 后总资产消失 |
| **B2** | `TASK-048` 完成（分红标签） | ⏳ **硬前置**——否则缺陷被搬到组合页 |
| B3 | Human 批准 `FS-household-view-split.md` | ✅ **已解除**（2026-10-19） |
| B4 | Planner 产出 ExecPlan 并经 Plan Review | ⏳ 未开始 |
| B5 | 独立 Reviewer 复核 | ⏳ 交付时 |

---

## 7. Coordination Notes

- 与 `TASK-049` 文件集不重叠，但**合并顺序必须 049 在前**（见 B1）。
- 与 `TASK-048` 的文件集**会重叠**：`TASK-048` 改 `pages/Family.jsx:17/237-238`，本任务删除整个文件。若 048 先完成，本任务直接复用 `enums.js` 的单一导出即可；**若两任务并行，本任务不得自行复制映射表**，须等 048 落地或由 Orchestrator 重新排序。
- 本卡只登记问题与验收标准，**技术方案由 Planner 在 ExecPlan 中定**。
