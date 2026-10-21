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
| 交易类型中文映射缺陷 | `Family.jsx:17` 手写 `{buy, sell}`；`:237` 二元染色；`:238` 无兜底 → 分红渲染为**空白 badge + 跌绿底**（非页面出现 `undefined` 字样）。✅ **已由 `TASK-048` 修复（2026-10-20）**，现该页 import `TRANSACTION_ACTION_LABELS` |
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
| R-5 | **`/family` 删除后总资产丢失** | 前置依赖 TASK-049 **已于 2026-10-19 `Completed`**；本任务开工前仍须确认基线包含 TASK-049 改动（见下方 B1 备注） |
| R-6 | **汇率面板语义错位**（家庭层基础设施塞进组合语义） | 折叠 + 默认收起，标题写「家庭汇率」 |
| R-7 | **页面过长**：五块叠加后组合列表页信息密度过高 | 分桶与占比条**同行或紧邻**（不占整屏）；最近动态两栏并排（沿用 `Family.jsx:212` 的 `lg:grid-cols-2`）；汇率必须默认收起 |
| R-8 | 首屏卡片被推得太低 | 占比条压成单行（高度 ≤ 48px 含图例），必要时图例折行 |

---

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| **B1** | `TASK-049` 完成（总资产卡已在 `/`） | ✅ **已解除**（2026-10-19 `Completed`，归档 `complete/`） |
| **B2** | `TASK-048` 完成（分红标签） | ✅ **已解除**（2026-10-20 `Completed`，归档 `complete/`）。产出 `client/src/constants/enums.js` 的 `TRANSACTION_ACTION_LABELS` 单一导出，本任务的 `RECENT-TX` 可直接 import（对应 AC16）。⚠️ 改动**未提交**，尚在 `feature/TASK-048-family-dividend-label` 工作树 |
| B3 | Human 批准 `FS-household-view-split.md` | ✅ **已解除**（2026-10-19） |
| B4 | Planner 产出 ExecPlan 并经 Plan Review | ⏳ 未开始（**当前唯一实质阻塞**） |
| B5 | 独立 Reviewer 复核 | ⏳ 交付时 |

> **B1 基线备注（2026-10-19 核实，2026-10-20 更新）**：`TASK-049` 与 `TASK-048` 的产出分别在 `feature/TASK-049-dashboard-household-total`（`56c6507`）与 `feature/TASK-048-family-dividend-label`（未提交）分支，`main` 仍停在 `891d0f7`（不含 TASK-044 / 048 / 049）。现有 `feature/TASK-050` 是从 `main` 拉出的**空基线**（`git log feature/TASK-049..feature/TASK-050` 为空，反向差 3 个提交），直接开工会在缺少前置的状态下改 `Portfolio/List.jsx`。**开工前必须先重建分支**：把 `feature/TASK-050` rebase 到 `feature/TASK-048-family-dividend-label`（该分支已含 044 + 049 + 048 全部前置），或由 Human 先按 044 → 048 → 049 顺序合并入 `main` 再从 `main` 拉出。

---

## 7. Coordination Notes

- 与 `TASK-049` 文件集不重叠，但**合并顺序必须 049 在前**（见 B1）。
- 与 `TASK-048` 的文件集**会重叠**：`TASK-048` 改了 `pages/Family.jsx:17/237-238`（2026-10-20 已完成），本任务删除整个文件 → 合并时此文件冲突，**正确处置是删除优先**，保留 `enums.js` 的 `TRANSACTION_ACTION_LABELS` 单一导出。本任务**不得自行复制映射表**，必须 import 该导出（AC16）。
- 本卡只登记问题与验收标准，**技术方案由 Planner 在 ExecPlan 中定**。

---

## 8. 开工前置核查（Orchestrator，2026-10-19）

> 接到「开始 TASK-050」后所做的事实核查。**以下三项均未擅自处置**，等 Human 裁决。

### 8.1 分支基线不成立（阻塞）

| 事实 | 证据 |
|---|---|
| `feature/TASK-050` 从 `main` 拉出，基线为 `891d0f7`（TASK-043） | `git rev-parse feature/TASK-050` = `891d0f7` |
| 该分支**没有任何独有提交**，可安全删除重建 | `git log --oneline feature/TASK-049..feature/TASK-050` 空输出 |
| 距目标基线差 3 个提交 | `git log --oneline feature/TASK-050..feature/TASK-049` = `30dc525` / `69576ad` / `56c6507` |
| 未见远端同名分支 | `git branch -a` 无 `remotes/origin/feature/TASK-050`（远端查询因本机 SSH 权限未成功，以本地分支列表为据） |

**后果**：在此分支改 `Portfolio/List.jsx`，会基于一个**缺少 TASK-044 交易收拢与 TASK-049 总资产卡**的代码库；本任务 AC15（`grep pages/Family` 无结果）与 AC16 都在改「不存在的现状」。

**建议的处置（需 Human 执行，属 git 写操作）**：

```
# 1) 先把 TASK-049 结案文档提交（当前分支 feature/TASK-049 有 7 项未提交）
git add -A && git commit -m "docs: TASK-049 结案归档，TASKS/readme/FS 索引同步"

# 2) 丢弃空基线分支，从 049 分支重建
git branch -D feature/TASK-050
git checkout -b feature/TASK-050
```

### 8.2 `B2`（TASK-048 前置）的前提**已部分失效**（需裁决）

原 `R-3` 写的是「`Family.jsx:17` 的 `{buy, sell}` 若照搬会被搬到组合页」。但本任务 **In Scope 已包含删除 `client/src/pages/Family.jsx`**。所以：

| TASK-048 条目 | 在 TASK-050 下的实际价值 |
|---|---|
| AC1（分红显示「现金分红/分红再投」） | ❌ **归零**——该页被本任务删除 |
| AC2（分红不得用跌绿染色） | ❌ **归零**——同上 |
| AC3（买/卖显示不回归） | ❌ **归零**——同上 |
| AC4（中文映射收敛为 `enums.js` 单一导出） | ✅ **仍有效**，且本任务新组件正好要用 |
| AC5/AC6/AC7/AC8（边界与构建） | 部分仍适用 |

**结论**：先做完整 TASK-048 = 写一段随后被本任务删掉的代码。B2 想防的风险（缺陷被复制到新页面）**不需要靠修 `Family.jsx` 来防**——本任务 AC16 已要求「无 `ACTION_LABELS = {` 手写表」，只要新组件 import `constants/enums.js` 即可。

**另需注意**：AC16 的 grep 模式 `ACTION_LABELS = {` **只能抓到手写字面量**，抓不到 `const ACTION_LABELS = Object.fromEntries(TRANSACTION_ACTIONS.map(...))` 这种派生式重复。现存这种重复 2 处：`components/TransactionTable/index.jsx:12`、`pages/Transaction/ImportTransactions.jsx:19`。若真要做到「单一来源」，验收模式需改成能覆盖 `Object.fromEntries(TRANSACTION_ACTIONS` 的写法。

**三个可选处置**（供 Human 裁决，未执行）：

| 方案 | 内容 | 代价 |
|---|---|---|
| **甲** | TASK-048 缩为「只做 AC4」：`enums.js` 导出标签映射，`TransactionTable` / `ImportTransactions` 改引用；删掉 AC1–AC3（对象将被删）。完成后再启动本任务 | 小改动、零浪费；B2 真正满足 |
| 乙 | 关闭 TASK-048，把「单一来源」并入本任务的 AC16 扩写 | 少一个任务；但 `TransactionTable`/`ImportTransactions` 的重复仍留在本任务范围外 |
| **丙 ✅ 已采纳**（2026-10-19 Human 裁决） | 照原样先完整做 TASK-048，完成验收后再启动本任务 | 明确接受 AC1–AC3 的短期性质（`/family` 在 `TASK-050` 落地前仍可用）；本任务的 B2 保持不变 |

> **方案丙已执行完毕（2026-10-20 更新）**：`TASK-048` 已于 2026-10-20 评审通过并结案，`Completed`。
> - 本任务唯一要继承的产出是 `enums.js` 的 `TRANSACTION_ACTION_LABELS`；
> - **上面提到的 AC16 grep 盲区已被顺带关闭**：`components/TransactionTable/index.jsx:12` 与 `pages/Transaction/ImportTransactions.jsx:19` 两处派生式重复已删除，全仓 `Object.fromEntries(TRANSACTION_ACTIONS` 现**恰好 1 处**（`enums.js:29`）。故 AC16 的检测式可直接改为 `grep -rn "Object.fromEntries(TRANSACTION_ACTIONS\b" client/src` 期望 = 1，比原 `ACTION_LABELS = {` 模式更强；
> - AC1–AC3（`Family.jsx` 分红显示/染色）确实是短期产出，随本任务删页归零，属 Human 已明示接受的成本。

### 8.3 ExecPlan 未产出（阻塞）

`B4` 未开始。按纪律（业务代码改动前必须有 `Approved` ExecPlan），本任务在 8.1 / 8.2 裁决、且 Planner 产出 ExecPlan 并经 Human Plan Review 之前，**不得改动任何代码**。

### 8.4 本次未做的事

- 未修改任何业务代码、未创建 ExecPlan（属 Planner）。
- 未执行 `git commit` / `branch -D` / `checkout -b`（属 Human）。
- 未改动 `TASK-048` 的验收标准（属需求变更，需 Human 裁定）。
- 顺带修正：本节之前 `§6` 的 B1 备注曾插在表格中间导致 B5 行断表，已移出表格。
