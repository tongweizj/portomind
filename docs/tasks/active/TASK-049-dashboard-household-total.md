# TASK-049 — Dashboard 承接家庭总资产卡

## Metadata

**Status:**  
`INTEGRATING`（2026-10-19）—— 独立 Reviewer 评审通过（ExecPlan §11，AC1–AC8 无阻塞）；Orchestrator **全系统验证通过**（ExecPlan §12：`build` exit 0 / `eslint` 0 error / server 152 + worker 77 = **229 pass 0 fail** / 零服务端改动），审查遗留 **R-1（索引两处不实）已闭环**。**剩余两步均属 Human**：① 授权或亲自执行 git 提交；② 最终验收。通过后归档 `complete/` 并置 `COMPLETED`。

> 未闭环项：**R-2**（`AppLayout.jsx:87,91` 顶栏铃铛 `title="提醒中心"` 名实不符）**超出本任务 Scope**，已移交 Human 决定并入 `TASK-047` 或 `TASK-050`。

**Priority:**  
`High`（首页首屏，交付后用户打开应用即可看到家庭总资产）

**Owner:**  
`Implementer`（2026-10-19 实施完成）→ `Reviewer`（2026-10-19 评审通过）→ `Orchestrator`（2026-10-19 置 `Integrating` 并完成全系统验证）→ `Human`（提交 + 最终验收）

**Created:**  
`2026-10-19`

**Updated:**  
`2026-10-19`（`Integrating`：全系统验证 229/229 通过，见 §11）

**Type:**  
`Feature`（信息架构 / 组件搬迁，纯客户端）

**Related Product Spec:**  
`docs/product/specs/FS-household-view-split.md`（交付单元 **G1**，需求 R1–R7 / AC1–AC8）— **✅ Approved 2026-10-19**

**Related ADR:**  
`None`

**Execution Plan:**  
`docs/exec-plans/active/TASK-049-dashboard-household-total.md`（`Approved` 2026-10-19 → 已实施 §10 → 评审通过 §11 → **`Integrating`** §12）

**来源：**  
Human 于 2026-10-19 裁决「家庭视图拆分式搬迁」，并要求拆成两个任务：本任务负责 Dashboard 部分。

---

## 1. 问题

`/` 现在叫「Dashboard」，但**整页只有一个提醒事件列表**（`client/src/pages/Dashboard.jsx:71-142`），`h1` 文案是「提醒中心」（`:89-92`），侧边栏标签是「Dashboard · 提醒」（`Sidebar.jsx:31`）。

用户打开应用先看到待办，看不到一个资产数字。真正的家庭视角在 `/family`，需要多点一次。

本任务只做一件事：**把家庭总资产卡搬进 `/`**，并把首页的命名从「提醒中心」修正为「家庭总览」。

---

## 2. 已核实的代码事实（2026-10-19 亲读）

| 事实 | 落点 |
|---|---|
| 总资产卡现有实现（渐变卡 + 金额 + 时点 + 折算不完整提示） | `pages/Family.jsx:199-207` |
| 「折算不完整」的判定式 | `Family.jsx:182` — `portfolioContributions?.some(item => item.cnyValue == null)` |
| 金额格式函数 | `Family.jsx:20-23` — `formatCny`（`¥` + 千分位 + 最多 2 位小数） |
| 家庭汇总接口一次返回全部数据 | `hooks/useFamily.js:10-18`（`queryKey: ['family-summary']`） |
| Dashboard 现有结构 | 标题行 `:88-105` → 筛选栏 `:107-125` → 事件列表 `:127-139` |
| 侧边栏标签 | `Sidebar.jsx:31` — `label: 'Dashboard · 提醒'` |

**关键结论：本任务零服务端改动。** `family-summary` 已经在 `/family` 被请求；搬到 `/` 后仍是同一个接口、同一个 hook，`queryKey` 相同，与 `/portfolios`（TASK-050）共享缓存。

---

## 3. Acceptance Criteria

| # | 验收标准 |
|---|---|
| AC1 | `/` 首屏（1440×900）**不滚动**即可见家庭总资产金额与「数据时点」 |
| AC2 | 金额、`asOf`、折算不完整提示与 `/family` 页显示**完全一致**（同接口、同格式化逻辑） |
| AC3 | 点击总资产卡跳 `/portfolios`；键盘 `Enter` 等效；有 `hover` 与 `role="button"` / `tabIndex` |
| AC4 | 提醒列表的筛选（未读/全部、组合）、标记已读、忽略、立即评估、规则管理跳转**行为零变化** |
| AC5 | 侧边栏标签为 `Dashboard`；`h1` 为「家庭总览」；提醒区上方有「待处理提醒」区块标题 |
| AC6 | **未改动** `pages/Family.jsx`、`router.jsx`（`/family` 仍可访问）；`git status server shared cron-worker` 空输出 |
| AC7 | `npm run build --workspace client` exit 0；`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` 0 error（**不能用 `npx eslint`**，会拉 v10 崩溃） |
| AC8 | 独立 Reviewer 复核通过；Implementer 不得自判 |

---

## 4. Scope

**In Scope**

- 新建 `client/src/components/Household/TotalAssetsCard.jsx`（从 `Family.jsx:199-207` 抽出，`formatCny` 一并抽出或复用）
- `client/src/pages/Dashboard.jsx`：插入总资产卡、改 `h1`、加「待处理提醒」区块标题
- `client/src/components/layout/Sidebar.jsx`：`Dashboard · 提醒` → `Dashboard`
- 必要时同步 `docs/manual/CLIENT.md` 中「首页 = 提醒中心」的描述（仅本任务涉及的段落，其余留给 TASK-050）

**Out of Scope**

- 不动 `/family` 路由与 `pages/Family.jsx`（**故意保留**：TASK-050 收尾时才删，避免中间态丢数据）
- 不动币种分桶、组合贡献、最近交易、最近再平衡、汇率管理（属 TASK-050）
- 不加「同步汇率」按钮（OQ-2 裁决：随汇率面板归 TASK-050）
- 不做总资产趋势 / 家庭分组 / 提醒中心重构（FS §3 Non-Goals）
- 不改服务端、不改 `hooks/useFamily.js`

---

## 5. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | **两处显示不一致**：新组件自己写一份金额格式化，与 `/family` 出现差异 | AC2 要求同源；`formatCny` 应抽到共用位置而非复制 |
| R-2 | **过渡态重复**：本任务交付后 `/` 与 `/family` 都显示总资产 | 这是计划内过渡态（FS §9 阶段 1），R7/AC6 明确保留 `/family`；需在 ExecPlan 中写明「不作为缺陷」 |
| R-3 | **首屏密度**：加卡后提醒列表被推低 | 卡片保持单卡整宽、高度约 120px；AC1 用实测截图验证 |
| R-4 | **Dashboard 早期返回**：现有代码在 `isLoading` 时整页返回加载态（`:178` 是 Family 的写法，Dashboard 在列表内处理） | 新卡需有自己的加载/错误态，**不得**因 family-summary 失败而使整个提醒列表不可用 |
| R-5 | 误删 `Users` 图标 import 导致 Sidebar 构建失败 | 本任务不删 `/family` 项，`Users` 仍在用；TASK-050 才处理 import 清理 |

---

## 6. Blocking Dependencies

| 编号 | 依赖 | 状态 |
|---|---|---|
| B1 | Human 批准 `FS-household-view-split.md` | ✅ **已解除**（2026-10-19） |
| B2 | Planner 产出 ExecPlan 并经 Plan Review | ✅ **已解除**（2026-10-19 Human 批准 → `Approved`） |
| B3 | 独立 Reviewer 复核 | ✅ **已解除**（2026-10-19 评审通过，见 ExecPlan §11） |
| B4 | Orchestrator 全系统验证 | ✅ **已完成**（2026-10-19，229/229 通过，见 §11） |
| B5 | Human 提交 + 最终验收 | ⏳ **当前唯一未完成项** |

> 本任务**不**依赖 `TASK-048`（不搬交易列表）。

---

## 7. Coordination Notes

- 与 `TASK-050` 的**文件集不重叠**（本任务只碰 `Dashboard.jsx`、`Sidebar.jsx` 标签行、新组件；TASK-050 碰 `Portfolio/List.jsx`、`Family.jsx` 删除、`router.jsx`）。
- 但**顺序有依赖**：`TASK-050` 删除 `/family` 的前提是本任务已把总资产卡搬到 `/`。故 `TASK-050` 应 `blockedBy TASK-049`。
- 两者可并行开发（新建组件目录不同文件），但**合并顺序必须 049 在前**。
- 本卡只登记问题与验收标准，**技术方案由 Planner 在 ExecPlan 中定**。

---

## 8. Change Log

| 日期 | 变更 |
|---|---|
| 2026-10-19 | 由 Orchestrator 登记（FS 交付单元 G1），状态 `PLANNING` |
| 2026-10-19 | **Human 批准 FS** → 本卡状态 `PLANNING` → `APPROVED`；B1 解除，B2（ExecPlan）成为唯一阻塞项 |
| 2026-10-19 | Implementer 实施完成 → `REVIEWING`（ExecPlan §10） |
| 2026-10-19 | 独立 Reviewer 评审通过（ExecPlan §11，AC1–AC8 无阻塞；Human 两项「不改」裁决见 §11.6） |
| 2026-10-19 | **Orchestrator 置 `INTEGRATING`**：全系统验证 229/229 通过、R-1 索引已闭环；R-2 超出 Scope 移交 Human（见 §11） |

---

## 9. Implementation Record（Implementer，2026-10-19）

完整记录（文件清单 / 差异 D-1~D-4 / 自测值 / 负向对照）见 ExecPlan **§10**。要点：

- **改动面**：`client/src/utils/priceDisplay.js`（+`formatCny`）、`client/src/components/Household/TotalAssetsCard.jsx`（新增）、`client/src/pages/Dashboard.jsx`、`client/src/components/layout/Sidebar.jsx`（1 行标签）、`docs/manual/CLIENT.md`；另有**验证资产** `client/scripts/e2e-task-049.mjs`（23 条断言）。
- **未改**（AC6 实测 `git status` 空）：`pages/Family.jsx`、`router.jsx`、`hooks/useFamily.js`、`server/`、`shared/`、`cron-worker/`、`client/package.json`。
- **自测**：build exit 0（2404 modules）· eslint 0 error/0 warning · 浏览器走查 **23 / 23 PASS** · 无 JS 运行时错误。
- **AC1 实测**：1440×900 下卡片 `y=146 h=136 bottom=282`，金额 `¥3,151.57` 与接口 `totalCny` 一致，无需滚动。
- **断言防自证**：把 `formatCny` 临时改成丢千分位后 AC2 如期 **FAIL**，还原后 23/23 —— 证明 AC2 能捕获 R-1 的格式漂移。
- **待 Human 决定**：`h1` 前的 `Bell` 图标是否改为 `LayoutDashboard`（计划只要求改文案，未动图标，见 ExecPlan D-4）。

---

## 10. Review Record（独立 Reviewer，2026-10-19）

完整记录见 ExecPlan **§11**（含我自己的实测命令与输出、逐条 AC 证据、补验项）。要点：

- **结论：通过**，AC1–AC8 全部满足，无阻塞项；可进 `Integrating`。
- **独立复跑**：`BUILD_EXIT=0`（2404 modules）· eslint 0-0 · AC6 `git status` 空 · **自写只读脚本 25/26 PASS**（唯一 FAIL 是我故意埋的断言自检）。
- **补验了实现者未验的 R-4**：拦截 `**/api/family/summary**` 全部 abort 后，卡片降级为独立错误态，**提醒列表仍渲染、无未捕获异常** —— 「不向上抛」成立。
- **AC4 写操作项**（标记已读/忽略/立即评估）未点（无法确认运行中 API 指向哪个库，保守只读），改由 diff 证明：`Dashboard.jsx` 仅 3 处增量，handler 与筛选栏逐行未动。
- **须处理（非本任务代码引入）**：① `readme.md:59,72` 两处索引与事实不符（TASK-049 状态、活跃执行计划目录）；② `AppLayout.jsx:87,91` 铃铛 `title="提醒中心"` 属失效名词。
- **Human 裁决（2026-10-19，两项均「不改」）**：① 首屏主色沿用 `blue-600→indigo-600`，不改为 token 主色 `#635BFF`；② `h1` 保持 `Bell` 图标，不换 `LayoutDashboard`。两者均属展示层既定决策，**不构成缺陷**；TASK-050 及后续任务**不要顺手改**（见 ExecPlan §11.6）。
- **未复跑**实现者的 `e2e-task-049.mjs`（含写操作，需测试库）；其 23/23 仍属实现者举证，但结论已被我的独立脚本覆盖。

---

## 11. Integration Record（Orchestrator，2026-10-19）

完整记录见 ExecPlan **§12**。要点：

### 11.1 全系统验证（Orchestrator 亲自复跑，不采信 §9/§10 的自评数字）

| 项 | 命令 | 结果 |
|---|---|---|
| 客户端构建 | `npm run build --workspace client` | ✅ `BUILD_EXIT=0`，`2404 modules transformed` |
| 客户端静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | ✅ `ESLINT_EXIT=0`，0 error / 0 warning |
| 服务端测试 | `npm run test:server` | ✅ `152 pass / 0 fail` |
| 调度器测试 | `npm run test:worker` | ✅ `77 pass / 0 fail` |
| 合计 | — | ✅ **229 pass / 0 fail** |
| AC6 边界 | `git status --short server shared cron-worker client/src/pages/Family.jsx client/src/router.jsx client/src/hooks/useFamily.js client/package.json package-lock.json` | ✅ **空输出** |

### 11.2 审查遗留项

| # | 结论 |
|---|---|
| R-1（`readme.md:59,72` 索引与事实不符） | ✅ **已闭环**：`:59` 改为「`INTEGRATING` · 独立评审已通过 · 待 Human 最终验收」；`:72` 活跃执行计划目录指向本任务 ExecPlan，不再写「当前为空」 |
| R-2（`AppLayout.jsx:87,91` 铃铛 `title="提醒中心"`） | ⏸ **未处理**：属业务代码，超出本任务 Scope，Orchestrator 无授权擅改。建议并入 `TASK-047` 或 `TASK-050`，待 Human 裁决 |
| N-1 / N-2 / N-3（Reviewer §11.7 建议） | ⏸ 均不阻塞：N-1 观感抖动涉及全站 `LoadingState`；N-2 双份随 TASK-050 删页消除；N-3 弱断言不影响结论 |

### 11.3 未执行项与原因

- **未提交 git**：`ORCHESTRATOR.md §3` 授权不含合并入库；沿用 TASK-044 分工，由 Human 提交。
- **未置 `COMPLETED`**：最终验收属 Human。Human 提交并确认验收后，Orchestrator 再归档至 `tasks/complete/` + `exec-plans/complete/` 并置 `COMPLETED`（结案三处同步）。
- **工作区混有两批改动**（TASK-043/044 归档 + 本任务实施）。建议拆两个 commit：① 归档批；② TASK-049 功能批。
