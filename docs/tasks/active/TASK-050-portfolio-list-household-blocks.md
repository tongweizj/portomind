# TASK-050 — 组合列表页承接家庭五区块，`/family` 下线

## Metadata

**Status:**  
`REVIEWING`（2026-10-21）—— 独立评审**有条件通过**：AC9–AC13、AC15–AC20 满足；AC14 曾在「贡献列表为空」边界不满足（R-1，见 ExecPlan §13.5）。**R-1 已返修（本卡 §12）并由独立 Reviewer 复验通过（本卡 §13 / ExecPlan §15，自写 25 断言 25 PASS + 两轮负向对照）→ AC1–AC20 全部满足，可进 `Integrating`。** 最终验收属 Human。

**Priority:**  
`High`（信息架构收尾：`/family` 页面与路由删除）

**Owner:**  
`Implementer`（2026-10-21 实施完成 + R-1 返修）→ 独立 `Reviewer`（2026-10-21 复核 §11 + **R-1 已复验通过，见 §13**）→ `Orchestrator`（置 `Integrating`）→ `Human`（最终验收）

**Created:**  
`2026-10-19`

**Updated:**  
`2026-10-21`（独立评审完成见 §11；R-1 返修见 §12；**R-1 复验通过见 §13**）

**Type:**  
`Feature`（信息架构 / 组件搬迁 + 页面下线，纯客户端）

**Related Product Spec:**  
`docs/product/specs/FS-household-view-split.md`（交付单元 **G2**，需求 R8–R18 / AC9–AC20）

**Related ADR:**  
`None`

**Execution Plan:**  
`docs/exec-plans/active/TASK-050-portfolio-list-household-blocks.md`（`Approved` 2026-10-21 → 已实施，见其 §12）

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
| B4 | Planner 产出 ExecPlan 并经 Plan Review | ✅ **已解除**（2026-10-21，`Plan Review`，见 §9）；待 Human 批准 |
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

> ✅ **已于 2026-10-21 解除**：ExecPlan 已产出并落盘 `docs/exec-plans/active/TASK-050-portfolio-list-household-blocks.md`（现为 `Plan Review`），待 Human 批准。本节保留为历史记录。

`B4` 未开始。按纪律（业务代码改动前必须有 `Approved` ExecPlan），本任务在 8.1 / 8.2 裁决、且 Planner 产出 ExecPlan 并经 Human Plan Review 之前，**不得改动任何代码**。

### 8.4 本次未做的事

- 未修改任何业务代码、未创建 ExecPlan（属 Planner）。
- 未执行 `git commit` / `branch -D` / `checkout -b`（属 Human）。
- 未改动 `TASK-048` 的验收标准（属需求变更，需 Human 裁定）。
- 顺带修正：本节之前 `§6` 的 B1 备注曾插在表格中间导致 B5 行断表，已移出表格。

---

## 9. 开工记录（Orchestrator / Planner，2026-10-21）

Human 于 2026-10-21 指令「开始做 TASK-050」。本节记录前置核查与本次产出。

### 9.1 分支重建（§8.1 阻塞已解除）

| 项 | 内容 |
|---|---|
| 核查 | Human 已把 `TASK-048` 的改动提交（`fb5fdaf` / `c463c85`）并切到 `feature/TASK-050` |
| 事实 | `feature/TASK-050` 当时仍停在 `891d0f7`（= `main`），`git log main..feature/TASK-050` **空** → 该分支**无任何自有提交**，rebase 零风险 |
| 动作 | `git rebase feature/TASK-048-family-dividend-label` → 快进到 `c463c85` |
| 结果 | `git log feature/TASK-048-family-dividend-label..feature/TASK-050` 与反向均为空；工作区 `git status --short` 空；`docs/product/specs/FS-household-view-split.md` 等前置文档已在位 |

> 现分支已含 **`TASK-044` + `TASK-049` + `TASK-048`** 全部前置，是本任务唯一正确的开发基线。

### 9.2 四项用户可见分叉已裁决（Human，2026-10-21）

| # | 问题 | 裁决 |
|---|---|---|
| OD-1 | 币种符号（家庭页 `US$`/`CA$` vs 行情页 `$`/`C$`） | **沿用家庭页 `US$` / `CA$`** |
| OD-2 | 是否顺带修 `RebalanceHistory.jsx:94` 直出英文枚举 | **顺带修** |
| OD-3 | 归档口径说明的显示时机 | **恒显示** |
| OD-4 | 占比条配色 | **品牌紫梯度** |

### 9.3 ExecPlan 已产出

`docs/exec-plans/active/TASK-050-portfolio-list-household-blocks.md`（`Plan Review`）。Plan Review 时建议重点看四处：

1. **§4.1 组件划分**：5 个组件取纯 props、数据由 `List.jsx` 取一次（不沿用 `TotalAssetsCard` 的自取模式）——理由是避免 5 个加载块/错误块。这是本计划最影响结构的决策。
2. **§4.3.2 占比条宽度算法**：只在合计 >100% 时归一化（AC10 的硬约束落点）。
3. **§4.4 `List.jsx` 状态下沉**：现有 `isLoading` 整页早退会让家庭区块一并不显示，必须下沉到卡片区。
4. **§5 W8 的顺序约束**：删除 `Family.jsx` 必须在 `List.jsx` 接住五块**之后**，否则出现「四块消失」的中间态。

### 9.4 本次未做的事

- 未修改任何业务代码（等 `Approved` ExecPlan，属纪律硬约束）。
- 未执行 `git commit` / `merge` / `branch -D`（提交属 Human）；`git rebase` 是分支准备，无自有提交可丢。
- 未改动 FS 的 R / AC 文字。

### 9.5 Plan Review 提交（2026-10-21）

- ExecPlan 状态由 `Draft` → **`Plan Review`**；提交前做了一轮事实对账（详见 ExecPlan **§3.8**），清单 8 项全部与计划一致。
- **对账新发现 1 处计划缺口（已补入 ExecPlan §3.3 F-4 / §4.5 / W8 / §7.2）**：`utils/priceDisplay.js:195-197` 的 JSDoc 仍含 `pages/Family.jsx` 字样，删页后 `grep -rn "pages/Family" client/src` 会命中注释，导致 AC15 失败。W8 必须同时改写该注释（改动集 4 → 5 文件）。
- 补充 **AC16 增强检测式**：在原有 `grep -rn "ACTION_LABELS = {"`（期望 0）之外，增加 `grep -rn "Object.fromEntries(TRANSACTION_ACTIONS"`（期望恰 1 行，且在 `enums.js`）。理由：`TASK-048` 已把两处派生式重复收敛，原检测式对新形态覆盖不足；AC16 文字本身仍按 FS 逐字保留。
- 其余文档（`TASKS.md` / `readme.md` / FS 状态行）均已一致，无需改动。

---

## 10. Implementation Record（Implementer，2026-10-21）

完整记录（文件清单 / 差异 D-1~D-6 / 静态与运行时验证 / 新发现 F-1~F-4）见 ExecPlan **§12**。要点：

- **改动 12 个 `client/src` 文件**：新增 5 个 `components/Household/*`（`CurrencyBuckets` / `ContributionBar` / `RecentTransactions` / `RecentRebalance` / `FxPanel`）；改 `enums.js`（+`CURRENCY_LABELS` / `REBALANCE_STATUS_LABELS`）、`priceDisplay.js`（+`householdSymbol` / `formatMoney` / 改写 JSDoc）、`Portfolio/List.jsx`（七段结构 + 状态下沉）、`router.jsx`、`Sidebar.jsx`、`Portfolio/RebalanceHistory.jsx`；**删除** `pages/Family.jsx`。
- **未改**（实测空）：`server/` `shared/` `cron-worker/` `hooks/useFamily.js` `services/family.service.js` `PortfolioCard/` `Dashboard.jsx` `design-tokens.js` `client/package.json`。
- **静态**：build exit 0（**2408 modules**）· eslint 0 error/0 warning · AC15 三条 grep 全 0 · AC16 两条达标（`ACTION_LABELS = {` 0 行、`Object.fromEntries(TRANSACTION_ACTIONS` 恰 1 行）· OD-2 `{rec.status}` 0 行 · 侧栏 5 项。
- **运行时**（1440×900，`portomind_e2e` 副本 + `page.route` 构造数据）：AC9 七段顺序 · AC10 两段合计 80% · AC11 图例跳转 · AC12 12→5 行 · AC13 收起态 0 次请求 / 展开 1 次 / 同步与录入后两 query 均刷新 · AC14 两态均有说明 · AC16 分红浅紫 + 无空 badge · AC17 `/family` → `/portfolios` · OD-2 状态列中文 · R-3 汇总 500 时卡片仍渲染。
- **差异**：D-1 `FxPanel` 不再手动 `refetch()`（由 hook 的 invalidate 保证）；D-2 折算不完整项图例用中性灰；D-3 标题改「组合占比」；D-4 `CLIENT.md` 另清 4 处失效名词；D-5 `PREVIEW_LIMIT` 提常量；D-6 同步状态行（未动 AC/Scope）。
- **⚠️ 新发现 F-1（需立项，未修）→ ✅ 已立项 [`TASK-051`](./TASK-051-fx-rate-direction.md)（2026-10-21）**：家庭折算的**汇率方向疑似反了** —— 采集端取的是「以 CNY 为基准」的 `1 CNY = X 外币`，却当 `rateToCny` 入库并用乘法折算，导致家庭总资产被系统性低估（实测 CAD `13836.49 × 0.2112 = 2922.5`，正确应约 `65,509`），且与手动录入示例 `7.20` 的语义矛盾。属服务端 + 折算口径，超出本任务边界（NG-5 / AC19）。
- 改动**未提交**，位于 `feature/TASK-050` 工作树；真实库 `portomind` 未被读写。

---


## 11. Review Record（独立 Reviewer，2026-10-21）

完整记录见 ExecPlan **§13**（实测命令与输出 / 逐条 AC 证据 / 补验项 / 边界打勾）。要点：

- **结论：有条件通过**。AC9–AC13、AC15–AC20 满足；**AC14 在「贡献列表为空」边界不满足**。
- **独立复跑**（不采信 §10 自评）：build **exit 0 / 2408 modules**、eslint **0-0**、AC15 三条 grep 全 0、AC16 派生恰 1 行、OD-2 `{rec.status}` 0 行、`server shared cron-worker` 空。改动白名单与 §10 一致（11 改/增 + 1 删）。
- **自写走查脚本 26 条断言，25 PASS + 1 FAIL**（FAIL 即 R-1，非脚本误报）。另补验实现者未覆盖的 4 项：AC10 归一化分支（`ratio` 合计 120 → 段宽和 = 轨道宽）、AC14 空贡献边界、AC9 交易/再平衡同排、`family-summary` 500 时 `FxPanel` 独立可用。
- **口径收口复核**：`function formatCny` 全仓仅 1 处、币种中文手写表 0 处、再平衡状态中文映射仅 1 处 —— **没有搬出第四份副本**（R-1 风险为正题）。

### 11.1 须处理（R-1）

`ContributionBar.jsx:20` 的 `if (list.length === 0) return <EmptyState />` 提前返回，把第 76 行的口径说明一起吞掉。实测：`portfolioContributions: []` + 仅有一个已归档组合 + 勾选「显示已归档」→ 有卡片、**无**「仅含未归档组合」说明。该场景恰是归档口径最需要解释的时候。修法一行级（空态也渲染 `SCOPE_NOTE`）。

> ✅ **已返修（2026-10-21）**：改为**单出口结构**（说明与标题置于条件分支之外），空态也渲染标题 + 占位 + 说明。另申报一处差异 D-7（空态补 `h2`「组合占比」，依据是同页 `RecentTransactions` / `RecentRebalance` 的既定写法与 AC9 七段结构）。验证 14/14 + 两轮负向对照（改回整块早退 → 7 FAIL；仅把说明移进非空分支 → 4 FAIL）。详见 **本卡 §12** / ExecPlan **§14**。

### 11.2 建议（不阻塞）

- **A-1** `docs/issues.md` 是 **0 字节未申报文件**（untracked），不在 §12.1 清单内；`git add -A` 会把空文件带进版本库 → 删掉或纳入清单。
- **A-2** `PL-0-platform-foundation.md` 三处失效落点：`:343` 路由表仍写 `| /family | Family |`、`:435` 承载表仍写 `pages/Family.jsx`、`:225` 架构图仍有「家庭视图 (8)」。属「当前实现的描述」与事实冲突。
- **A-3** D-4 只清了 `CLIENT.md`；`DEPLOYMENT.md:302`、`SERVER.md:102` 仍有「家庭视图」旧名。
- **A-4** 首屏布局抖动：`familyLoading` 期间 ②③ 不渲染，数据到达后卡片下移约 250px（与 TASK-049 §11.7 同型）。

### 11.3 备注

- `TASK-051`（汇率方向）在本次审查期间（11:12）出现，非本任务产出；`readme` / `TASKS.md` / ExecPlan §12.5 对它的引用均已核实无死链。

---

## 12. R-1 返修记录（Implementer，2026-10-21）

Reviewer 在 ExecPlan §13.5 判定 **R-1（AC14 / OD-3 在 `portfolioContributions` 为空时失效）为「进 `Integrating` 前须处理」**，Human 于 2026-10-21 指令修复。

### 12.1 缺陷与根因

`ContributionBar.jsx:20` 的 `if (list.length === 0) return <EmptyState />;` 是**整块早退**，把返回 JSX 里的兄弟节点一并吞掉：`SCOPE_NOTE`（第 76 行）与 `h2`「组合占比」。复现：`portfolioContributions: []` + 全部组合已归档 + 勾选「显示已归档」→ 卡片有内容、占比空、说明消失 —— 恰是归档口径最需要解释的场景。

### 12.2 修法（比 Reviewer 示例更彻底的一处选择）

**改为单出口结构**：把 `h2` 与 `SCOPE_NOTE` 都放到条件分支**之外**，空态只替换中间内容。

```jsx
<h2>…组合占比…</h2>
{list.length === 0 ? <EmptyState /> : (<> 条 + 图例 </>)}
<p>{SCOPE_NOTE}</p>   {/* 在分支外，结构上不可能再被吞 */}
```

Reviewer 给的是双分支 `return`（两个 JSX 树各自写一遍说明）。单出口的差别是**从结构上消除复发可能** —— 双分支写法下次再加兄弟节点仍会漏，单出口不会。

### 12.3 差异申报（D-7）

| 项 | 说明 |
|---|---|
| **空态也渲染 `h2`「组合占比」** | Reviewer 示例里没有这一步。依据：同页 `RecentTransactions` / `RecentRebalance` 均把 `h2` 固定在容器内、空态只替换下方内容，`ContributionBar` 原是这页唯一偏离该模式的组件；且 AC9 的七段结构在空态下也应完整。属**对齐同页既定写法**，非新增功能。如 Human 认为超出 R-1 范围，删掉空态分支里的 `h2` 即可回退，其余不受影响。 |
| `CurrencyBuckets` 空态视觉不一致（Reviewer §13.5 尾注，明示「不阻塞」） | **本次未动**。空态仍是裸文本「暂无资产分桶数据」，与 `ContributionBar` 的 `<EmptyState />` 组件不同型。口径说明那行文案写的是「分桶与占比…」，在页面上由占比区统一覆盖，信息不缺。 |

### 12.4 验证（14 条断言 + 两轮负向对照）

一次性脚本 `client/scripts/_check-contributionbar-empty.mjs`（未进 `package.json`，全部 `page.route` 构造数据、**零写库**）：1440×900，场景 A = 全归档 + 勾选（目标场景）、B = 正常两条贡献、C = 空态无卡片、D = 控制台无错误。

**14/14 PASS**。关键断言：A1 空态含口径说明 · A2 说明恰好 1 处 · A3 空态含标题 · A5 空态不渲染占比条 · B4 正常态条在且图例 2 项 · B5 正常态区块内无 `EmptyState`。

**两轮负向对照（证明断言非恒真）**：

| 注入的缺陷形态 | 结果 |
|---|---|
| 改回 `if (list.length === 0) return <EmptyState />;` | **7/14 PASS**：A1–A6 + C1 全 FAIL，正常态 B1–B5 仍 PASS |
| 仅把 `SCOPE_NOTE` 移进非空分支（精确复现 R-1 形态） | **10/14 PASS**：A1 / A2 / A6 / C1 四个空态断言 FAIL，正常态 5 条仍 PASS |

**踩到的断言坑（已修）**：初版 A4 / B5 用整页 `body.includes('暂无数据')` 判定空态占位 —— 但同页「最近交易 / 最近再平衡」在空数据时也渲染 `EmptyState`，该断言**恒真**。改为按「含 `h2 组合占比` 的父容器」作用域取文本后才有效（首跑 B5 就是因此 FAIL 的）。

### 12.5 其它

- 静态：build exit 0（2408 modules）· eslint 0 error / 0 warning。
- **零服务端改动**：`git status server shared cron-worker` 空输出。
- 改动仍未提交，位于 `feature/TASK-050` 工作树。R-1 已闭环，**仍待 Human 最终验收**；Reviewer §13.6 的 A-1 ~ A-4（`docs/issues.md` 空文件、`PL-0` 失效落点、`DEPLOYMENT/SERVER` 旧名词、首屏抖动）本次**均未动**。


## 13. R-1 复验记录（独立 Reviewer，2026-10-21）

**结论：R-1 闭环，`TASK-050` 可进 `Integrating`。** 未复用实现者的 `_check-contributionbar-empty.mjs`，另写一套脚本（跑完即删）；未改任何业务代码。详见 ExecPlan **§15**。

### 13.1 独立实测

| 项 | 实测 |
|---|---|
| 构建 / lint | `BUILD_EXIT=0`（**2408 modules**，与 §12.5 一致）· eslint **0-0** |
| AC19 零服务端 | `server shared cron-worker client/package.json package-lock.json` 全空 |
| AC15/16/OD-2 复查 | `pages/Family` 0 · `'/family'` 0 · 侧栏 5 · `ACTION_LABELS = {` 0 · `Object.fromEntries(TRANSACTION_ACTIONS` 恰 1 · `{rec.status}` 0 |
| 口径唯一性 | 口径说明全仓**恰 1 处**（`ContributionBar.jsx:14`）；`function formatCny` 仍 1 处 |
| 改动面 | `client/src` 内仅 `ContributionBar.jsx` mtime 变为 11:50，其余仍在 10:48–10:51 |
| 运行时 | 自写 **25 条断言 / 5 场景，25 PASS** |

关键实测：空态区块文本 = `组合占比 暂无数据 分桶与占比仅含未归档组合；…` —— 标题、占位、说明三者齐在；说明全页 `count=1`、`h2` 计数 `=1`（D-7 未造成重复）；段宽和 `1144.0` = 轨道宽、`686.4:457.6` = 60:40；`ratio` 合计 120 时两段 `[572,572]` 等宽（归一化分支未被波及）；无控制台错误。

### 13.2 负向对照（我自己注入，md5 还原校验通过）

| 注入形态 | 结果 | 失败断言 |
|---|---|---|
| ① 整块早退（修复前形态） | **16/25** | A1–A6、B1–B3（9 条）；正常路径 C/D/E 全 PASS |
| ② **精确复现 R-1**：仅说明改 `{list.length > 0 && …}`（标题保留） | **20/25** | A1、A2、A6、B1、B2（5 条）；A3/A4/A5 仍 PASS |

形态 ② 证明断言**精确锚定「说明」而非「标题」**，不会因区块整体尚在而恒真。

### 13.3 D-7 判定：接受

空态补 `h2`「组合占比」无新文件、无新依赖、无服务端改动；「暂无数据」在无标题时是无主文案，补标题后与同页 `RecentTransactions` / `RecentRebalance` 写法一致，且 AC9 七段结构在空态完整。回退方式已在 §12.3 写明，不影响其余。

### 13.4 观测与遗留（不阻塞）

- **观测**：`list.length > 0` 但全部 `ratio` 为 `null` 时，轨道渲染为 **0 段的空白灰条** + 图例「折算不完整」。修复前后一致（原早退只覆盖 `length === 0`），**非回归**；若要改需另立卡。
- `docs/issues.md` 仍是 **0 字节未跟踪文件**（上轮已提，本轮未处理）。
- `client/scripts/_check-contributionbar-empty.mjs` 已申报但仍未跟踪；入库需改名为 `e2e-*` 并登记，否则建议删除。
- ExecPlan §13.6 的 A-1 ~ A-4（`PL-0` 三处失效落点、`DEPLOYMENT.md:302` / `SERVER.md:102` 旧名、首屏抖动）本轮未动。
- `TASKS.md:30`、`:47` 原写「待修 R-1」与本卡矛盾，已由 Reviewer 按事实改正（纯状态簿记）。
