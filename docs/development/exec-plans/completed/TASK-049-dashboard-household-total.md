# TASK-049 — Dashboard 承接家庭总资产卡

## Status

Current status:

`Approved`（2026-10-19 Human 批准方案）→ **Implemented（2026-10-19，见 §10）** → **Reviewing 通过（2026-10-19，独立 Reviewer，见 §11）** → **`Integrating`（2026-10-19，Orchestrator 全系统验证通过，见 §12）** → **`Completed`（2026-10-19，Human 提交并验收，见 §13）**

Owner:

`Planner`（起草）/ `Human`（2026-10-19 批准方案 + 提交 + 最终验收）/ `Implementer`（2026-10-19 实施完成）/ `Reviewer`（2026-10-19 评审通过，见 §11）/ `Orchestrator`（`Integrating` 验证 + 结案归档，见 §12/§13）

Priority:

`High`

Related task:

`docs/development/tasks/completed/TASK-049-dashboard-household-total.md`

---

## 1. Intent

### Goal

把 `/family` 页的「家庭总资产（RMB 折算）」卡抽成独立组件并搬入首页 `/`（Dashboard），置于标题行下方、提醒列表上方；同时将首页命名从「提醒中心」修正为「家庭总览」，侧边栏标签 `Dashboard · 提醒` 改为 `Dashboard`。

### Why

用户打开应用先看到待办提醒，看不到资产数字。真正的家庭视角在 `/family`，需多点一次。首页首屏应先回答「我家现在有多少钱」，提醒是第二件事。本任务是 FS `household-view-split` 的阶段 1（G1），为阶段 2（TASK-050 删除 `/family`）解除前置。

### Scope

- 新建 `client/src/components/Household/TotalAssetsCard.jsx`（从 `pages/Family.jsx:199-207` 抽出）
- `client/src/pages/Dashboard.jsx`：插入总资产卡、改 `h1` 文案、加「待处理提醒」区块标题
- `client/src/components/layout/Sidebar.jsx`：标签 `Dashboard · 提醒` → `Dashboard`
- `client/src/utils/priceDisplay.js`：新增 `formatCny` 导出（单一实现源头）
- `docs/handbook/manual/CLIENT.md`：同步 §3.5 入口描述与 §4 手动入口表标签（仅本任务涉及段落）

### Out of Scope

- 不动 `/family` 路由、不动 `pages/Family.jsx`（**计划内过渡态**：G1 交付后 `/` 与 `/family` 都显示总资产，R7 明确保留 `/family` 到 TASK-050 收尾）
- 不动币种分桶 / 组合贡献 / 最近交易 / 最近再平衡 / 汇率管理（属 TASK-050）
- 不加「同步汇率」按钮（OQ-2：随汇率面板归 TASK-050）
- 不做总资产趋势 / 家庭分组 / 提醒中心重构（FS §3 Non-Goals）
- 零服务端改动；不动 `hooks/useFamily.js`（`queryKey: ['family-summary']` 保持，与 `/family` 共享缓存）

### Constraints

- 纯客户端；复用既有 `GET /api/family/summary` 与 `useFamilySummary()` hook
- 卡片与 `/family` 页**同源同格式**（AC2）：同一接口、同一 `formatCny`
- 卡片失败**不得**拖垮下方提醒列表（R-4）：卡片须有独立加载/错误态
- `eslint` 必须用 `../node_modules/.bin/eslint`，**禁止 `npx eslint`**（会拉 v10 崩溃）
- 过渡态重复显示总资产**不作为缺陷**

### Acceptance Criteria

- [x] AC1 `/` 首屏（1440×900）不滚动即可见家庭总资产金额与「数据时点」
- [x] AC2 金额、`asOf`、折算不完整提示与 `/family` 页显示完全一致（同接口、同格式函数）
- [x] AC3 点击总资产卡跳 `/portfolios`；键盘 `Enter` 等效；有 `hover` 与 `role="button"` / `tabIndex`
- [x] AC4 提醒列表的筛选（未读/全部、组合）、标记已读、忽略、立即评估、规则管理跳转行为零变化
- [x] AC5 侧边栏标签为 `Dashboard`；`h1` 为「家庭总览」；提醒区上方有「待处理提醒」区块标题
- [x] AC6 **未改动** `pages/Family.jsx`、`router.jsx`；`git status server shared cron-worker` 空输出
- [x] AC7 `npm run build --workspace client` exit 0；`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` 0 error
- [x] AC8 独立 Reviewer 复核通过；Implementer 不得自判

---

## 2. Context

- 产品需求：`docs/development/requirements/specs/completed/FS-household-view-split.md`（**状态已 Approved 2026-10-19**；G1 对应 R1–R7 / AC1–AC8；OQ-1~3 已采纳推荐）
- 任务卡：`docs/development/tasks/completed/TASK-049-dashboard-household-total.md`（归档后路径；起草时为 `development/tasks/active/`）
- 关联任务：`TASK-050`（G2，阶段 2，删除 `/family`）+ `TASK-048`（分红标签，非本任务前置）
- 前置依赖 `B1`（FS 批准）已解除；`B2`（本 ExecPlan）即本文档

信息架构背景：现顶层导航 6 项（含 `Dashboard · 提醒` 与 `家庭视图`）。FS 把「家庭总资产卡」从 `/family` 抽到 `/`，把其余五块抽到 `/portfolios`，最终导航 6→5、`/family` 消失。本任务只做 G1 一半（搬卡 + 命名），`/family` 暂留。

---

## 3. Repository Findings

| 事实 | 落点 | 核实 |
|---|---|---|
| 总资产卡现有实现（渐变卡 + 金额 + 时点 + 折算不完整提示） | `pages/Family.jsx:199-207` | ✅ 实读 |
| 折算不完整判定式 | `Family.jsx:182` — `portfolioContributions?.some(item => item.cnyValue == null)` | ✅ 实读 |
| 金额格式函数 `formatCny` | `Family.jsx:20-23` — `¥` + 千分位 + 最多 2 位小数 | ✅ 实读 |
| 家庭汇总接口一次返回全部数据 | `hooks/useFamily.js:10-18`（`queryKey: ['family-summary']`） | ✅ 实读 |
| Dashboard 现有结构 | 标题行 `:88-105` → 筛选栏 `:107-125` → 事件列表 `:127-139` | ✅ 实读 |
| Dashboard `h1`「提醒中心」 | `Dashboard.jsx:89-92` | ✅ 实读 |
| 侧边栏标签 `Dashboard · 提醒` | `Sidebar.jsx:31` | ✅ 实读 |
| 格式化工具归宿 | `client/src/utils/priceDisplay.js` 已集中 `fmtPrice` 等（`TASK-043` 单一实现纪律） | ✅ 实读 |
| 卡片点击目标路由存在 | `/portfolios` 由 `ROUTES.PORTFOLIO_LIST` 提供，路由有效 | ✅ 已知 |

**关键结论**：本任务零服务端改动；`formatCny` 抽放到 `priceDisplay.js`（既有格式化中心）即可被新组件与未来 TASK-050 共用，且不动 `Family.jsx`（满足 R7）。

---

## 4. Proposed Design

### 4.1 新建 `client/src/components/Household/TotalAssetsCard.jsx`

- **数据**：内部调用 `useFamilySummary()`（与 `/family` 同一 hook、同一 `queryKey`，共享缓存）。
- **独立加载/错误态（R-4）**：`isLoading` → 渲染 `LoadingState`；`isError` → 渲染 `ErrorState`；**不向上抛、不阻断页面**。下方提醒列表由 Dashboard 自身状态独立驱动，互不影响。
- **视觉**：照搬 `Family.jsx:200-207` 的渐变卡（`bg-gradient-to-r from-blue-600 to-indigo-600`、`text-4xl font-bold`、`asOf` 与 `incomplete` 文案）。
- **金额**：调 `formatCny(totalCny)`（见 4.3）。
- **可点击（AC3）**：外层 `div` 设 `role="button"` + `tabIndex={0}` + `onClick` 跳 `/portfolios` + `onKeyDown`（`Enter` 等效）+ `hover` 态（`hover:opacity-95` 或等价）。
- **无同步汇率按钮（R4/OQ-2）**：仅文字提示「部分组合折算不完整」，不提供就地修复入口。

### 4.2 改造 `client/src/pages/Dashboard.jsx`

- 顶部 import 增加 `import TotalAssetsCard from '../components/Household/TotalAssetsCard';`
- `h1` 文案 `提醒中心` → `家庭总览`（AC5）。
- 标题行（含「立即评估」「规则管理」按钮）**保持不动**（FS §4.3 顶部行保留这两个按钮；OQ-2 仅移除「同步汇率」）。
- 在标题行 `</div>` 之后、原「筛选栏」注释之前，插入 `<TotalAssetsCard />`，并在其下插入区块标题：
  ```jsx
  {/* 家庭总资产卡（G1：从 /family 搬入） */}
  <TotalAssetsCard />

  {/* 待处理提醒 */}
  <h2 className="text-lg font-semibold text-gray-800">待处理提醒</h2>
  ```
- 筛选栏与事件列表**原样保留**（AC4 行为零变化）。

### 4.3 新增 `formatCny` 到 `client/src/utils/priceDisplay.js`

严格镜像 `Family.jsx:20-23`，作为唯一实现源头：

```js
/** RMB 金额展示：¥ + 千分位 + 最多 2 位小数；null/undefined 显示「—」。 */
export function formatCny(value) {
  if (value == null) return '—';
  return `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}
```

> **已知决策（非阻塞）**：R7 禁止改动 `pages/Family.jsx`，故 `Family.jsx` 内的本地 `formatCny` 在 G1 阶段暂不删除，形成与新导出的临时双份。`TASK-049` 已通过「同一逻辑字符串」保证 AC2 一致；**彻底去重留待 TASK-050 删除 `Family.jsx` 时一并处理**（与 FS R17「不改 hook、不动服务」不冲突）。本决策不引入显示分歧风险（R-1 缓解）。

### 4.4 改造 `client/src/components/layout/Sidebar.jsx`

- 第 31 行：`label: 'Dashboard · 提醒'` → `label: 'Dashboard'`。
- **不**动 `家庭视图` 项（`:42`，`Users` 图标）与 `Users` import —— 留 TASK-050（R-5）。

### 4.5 文档同步 `docs/handbook/manual/CLIENT.md`（仅本任务段落）

- §3.5（`:88`）：「入口：首页（Dashboard）即通知中心；…」改写为：首页为「家庭总览」，顶部展示家庭总资产卡（RMB 折算，点击进入组合管理），下方「待处理提醒」为原通知中心，右上角铃铛显示未读总数。
- §4 手动入口表（`:125`）：`Dashboard / 通知中心` 标签 → `Dashboard / 待处理提醒`。
- **不**动 §3.6 家庭视图整节（属 TASK-050）。

---

## 5. Work Breakdown

- [ ] **W1** 在 `client/src/utils/priceDisplay.js` 末尾新增 `formatCny`（镜像 `Family.jsx:20-23`），保持既有导出风格。
- [ ] **W2** 新建 `client/src/components/Household/TotalAssetsCard.jsx`：
  - 内部 `useFamilySummary()`，独立 `isLoading/isError` 回退（`LoadingState`/`ErrorState`）；
  - 渐变卡视觉照搬 `Family.jsx:200-207`；
  - `formatCny(totalCny)` + `asOf` 本地化 + `incomplete` 判定（`:182` 同式）；
  - `role="button"` + `tabIndex={0}` + `onClick`→`/portfolios` + `onKeyDown` Enter + `hover` 态；
  - 无同步汇率按钮。
- [ ] **W3** 编辑 `client/src/pages/Dashboard.jsx`：
  - import `TotalAssetsCard`；
  - `h1`「提醒中心」→「家庭总览」；
  - 标题行后插入 `<TotalAssetsCard />` 与「待处理提醒」`h2`；
  - 筛选栏 / 事件列表逻辑零改动。
- [ ] **W4** 编辑 `client/src/components/layout/Sidebar.jsx:31`：标签 `Dashboard · 提醒` → `Dashboard`。
- [ ] **W5** 编辑 `docs/handbook/manual/CLIENT.md`：§3.5 入口描述（`:88`）+ §4 表标签（`:125`）；不动 §3.6。
- [ ] **W6** 验证：`npm run build --workspace client` 与 `../node_modules/.bin/eslint "src/**/*.{js,jsx}"` 0 error；手测 AC1/AC2/AC3；`git status server shared cron-worker` 空输出。
- [ ] **W7** 移交独立 Reviewer（AC8），Implementer 不得自判。

---

## 6. Open Decisions

**无新增需 Human 裁定项。** FS §8 的 OQ-1~OQ-3 已随 FS 批准一并采纳推荐；仓库探索未浮现新分叉。

唯一需注意的**实现层既定决策**（已在 §4.3 说明，不在 Plan Review 表决范围）：受 R7 限制，`Family.jsx` 本地 `formatCny` 在 G1 阶段暂不删除，与新导出临时并存，去重留 TASK-050。

---

## 7. Verification

| 项 | 命令 / 方法 | 通过标准 |
|---|---|---|
| 构建 | `npm run build --workspace client` | exit 0 |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | 0 error（**非 npx**） |
| 首屏密度 | 1440×900 截图，不滚动 | 可见金额 + 数据时点（AC1） |
| 一致性 | 同数据下比对 `/` 与 `/family` | 金额/`asOf`/不完整提示逐字一致（AC2） |
| 交互 | 点击卡 + 键盘聚焦后 Enter | 均跳 `/portfolios`（AC3） |
| 提醒零变化 | 操作筛选/标记已读/忽略/评估/规则管理 | 行为不变（AC4） |
| 命名 | 目视 + `grep` | 侧栏 `Dashboard`、`h1` 家庭总览、提醒区有「待处理提醒」（AC5） |
| 零服务端改动 | `git status server shared cron-worker` | 空输出（AC6） |
| 独立复核 | Reviewer 走查 | 通过（AC8） |

---

## 8. Risks

| # | 风险 | 缓解（已纳入设计） |
|---|---|---|
| R-1 | 两处金额格式漂移 | `formatCny` 抽到 `priceDisplay.js` 单一源头；G1 阶段两处逻辑同字符串，TASK-050 去重（§4.3） |
| R-2 | 过渡态 `/` 与 `/family` 重复显示总资产 | 计划内（FS §9 阶段 1），R7 明确保留 `/family`，不作缺陷 |
| R-3 | 首屏密度（加卡推低提醒） | 单卡整宽、高度约 ~120px；AC1 实测截图 |
| R-4 | 卡片加载失败拖垮提醒列表 | 卡片独立 `isLoading/isError` 回退，不向上抛（§4.1） |
| R-5 | 误删 `Users` 图标 import | 本任务不删 `/family` 项，`Users` 仍用；TASK-050 才清理（§4.4） |

---

## 9. Plan Review 结论

`Approved`（2026-10-19，Human 在 Plan Review 明确批准「按 §4 实施」，含 §4.3「`formatCny` 落 `priceDisplay.js`」这一既定决策）。批准范围以 §1 Acceptance Criteria 与 §4 Proposed Design 为界；Scope 变更须回 Human 复批。

---

## 10. Implementation Record

> 实施者：Implementer（2026-10-19）。本节只记录**实际做了什么 / 与计划的差异 / 自测结果**，不构成验收结论——验收交独立 Reviewer（AC8）。

### 10.1 变更文件清单（全部在 `client/` + 1 个手册，零服务端改动）

| 文件 | 类型 | 内容 |
|---|---|---|
| `client/src/utils/priceDisplay.js` | 编辑 | 新增 `formatCny`（逐字镜像 `Family.jsx:20-23`），文件末尾追加，未动既有导出 |
| `client/src/components/Household/TotalAssetsCard.jsx` | **新增** | 总资产卡独立组件（内部 `useFamilySummary()` + 独立 `LoadingState`/`ErrorState` + `role="button"`/`tabIndex`/Enter/Space + hover/focus-visible） |
| `client/src/pages/Dashboard.jsx` | 编辑 | import 新组件；`h1` 提醒中心 → 家庭总览；标题行后插入 `<TotalAssetsCard />` + `<h2>待处理提醒</h2>`；筛选栏与事件列表**零改动** |
| `client/src/components/layout/Sidebar.jsx` | 编辑 | 第 31 行标签 `Dashboard · 提醒` → `Dashboard`；**未删** `/family` 项与 `Users` import（R-5） |
| `docs/handbook/manual/CLIENT.md` | 编辑 | §3.5 入口描述、§4 表标签；另有 2 处失效名词修正，见 D-1 |
| `client/scripts/e2e-task-049.mjs` | **新增** | 23 条断言的真实浏览器走查脚本（可复跑，见 §10.3） |

**未改动（AC6 已实测）**：`pages/Family.jsx`、`router.jsx`、`hooks/useFamily.js`、`server/`、`shared/`、`cron-worker/`、`client/package.json`。

### 10.2 与计划的差异

| # | 差异 | 理由 |
|---|---|---|
| D-1 | `CLIENT.md` 除 §3.5 入口行与 §4 表标签外，**额外改了 2 处**：§3.4 再平衡第 4 条「提醒中心可见」→「首页『待处理提醒』可见」；§3.5 标题「提醒中心」→「待处理提醒」 | 首页更名后「提醒中心」不再指代任何页面，留着即为失效名词（同 TASK-044 R-2 的口径纪律）。两处均在同一节 / 相邻节，未触及 §3.6 家庭视图（属 TASK-050） |
| D-2 | 卡片键盘交互**同时支持 `Space`**（计划只写 `Enter`） | `role="button"` 的 ARIA 约定含 Space 激活；纯增量，不改 Enter 行为 |
| D-3 | 卡片 `isLoading/isError` 时**不渲染渐变壳**，直接返回 `LoadingState`/`ErrorState` | `DataState` 是浅底深字组件，塞进蓝紫渐变卡里对比度不足；同时避免「空壳金额」误导 |
| D-4 | `h1` 前的图标**仍是 `Bell`**（计划未要求改） | 严格按 §4.2 只改文案。观感上「家庭总览 + 铃铛」略错位，是否换 `LayoutDashboard` 提 Human 决定 |

### 10.3 自测结果（Reviewer 复核线索，**不作为验收依据**）

| 项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build --workspace client` | exit 0，2404 modules（+1 = 新组件），仅既存 chunk 警告 |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | 0 error / 0 warning |
| 浏览器走查 | `node client/scripts/e2e-task-049.mjs` | **23 / 23 PASS**，无 JS 运行时错误 |
| AC6 未改文件 | `git status --short client/src/pages/Family.jsx client/src/router.jsx client/src/hooks/useFamily.js` | 空输出 |
| AC6 零服务端 | `git status --short server shared cron-worker client/package.json package-lock.json` | 空输出 |

**关键实测值**（1440×900，`portomind_e2e` 副本，未读写真实库业务数据）：

- AC1：卡片 `y=146 h=136 bottom=282`（< 900，无需滚动）；金额 `¥3,151.57` 与 `GET /api/family/summary → totalCny=3151.57` 一致（断言用「去符号解析回数字 ±0.01」，**不从实现反推期望串**）；数据时点与接口 `asOf` 同分钟。
- AC2：`/` 与 `/family` 卡片文案**掩掉时间戳后逐字相等**，时间戳形状一致且两次取数差 < 2 分钟。
- AC3：`role=button` / `tabindex=0` / class 含 `hover:`；点击与聚焦后 `Enter` 均跳 `/portfolios`。
- AC4：未读 6 条 → 全部 6 条 → 切回未读 6 条；组合下拉 5 项；标记已读后未读 6→5；「立即评估」后页面可用；「规则管理」跳 `/alerts/rules`。
- AC5：侧栏 `Dashboard`（无 `Dashboard · 提醒`）；`h1` 家庭总览；`h2` 待处理提醒位于卡片下方（`h2.y=306`）。

### 10.4 断言的**负向对照**（证明非恒真）

把 `formatCny` 临时改为 `Number(value).toFixed(2)`（丢千分位）后重跑：**AC2 FAIL**（`¥3151.57` vs `/family` 的 `¥3,151.57`），其余 22 条仍 PASS；还原后回到 23/23。说明 AC2 断言确实能捕获 R-1 所述「两处格式漂移」，不是自证式断言（对应 TASK-044 M-5 教训）。

### 10.5 遗留与提示

- `Family.jsx` 内仍有本地 `formatCny` 副本（R7 禁改），**双份并存属计划内**，去重随 TASK-050 删除该页时处理。
- `/` 与 `/family` 同时显示总资产 = 计划内过渡态（R-2），不作缺陷。
- 截图：`%TEMP%/portomind-e2e-049/01-dashboard-first-screen.png` 等 4 张。

---

## 11. Review Record（独立 Reviewer，2026-10-19）

### 11.1 结论

**通过（Pass）**：AC1–AC8 逐条满足，**无阻塞项**。两项待裁决项已于 2026-10-19 由 Human 裁决「均不改」（见 11.6），**无遗留待决项**。可交 `Orchestrator` 置 `Integrating`，最终验收归 Human。

审查对象为工作区未提交改动（分支 `feature/TASK-044`）。本次审查**未修改任何业务代码**，只写本记录与任务状态。

### 11.2 我独立复跑的实测（不采信 §10.3 自评）

| 项 | 我的命令 / 方法 | 结果 |
|---|---|---|
| 构建 | `npm run build --workspace client`（显式取退出码） | ✅ `BUILD_EXIT=0`，`2404 modules transformed`（与 §10.3 自述一致） |
| 静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | ✅ 0 error / 0 warning（`ESLINT_EXIT=0`） |
| AC6 未改文件 | `git status --short client/src/pages/Family.jsx client/src/router.jsx client/src/hooks/useFamily.js server shared cron-worker client/package.json package-lock.json` | ✅ 空输出 |
| 浏览器走查 | **自写只读脚本**（未复用 `e2e-task-049.mjs`），1440×900，真实 `/` 与 `/family` | ✅ **25/26 PASS**，唯一 FAIL 是我故意埋的「断言自检」（用错误期望值验证比较逻辑非恒真，预期 FAIL） |

> 未复制数据库：本机 Mongo 需凭据（不便取用）；且无法确认运行中的 `:8080` 究竟指向真实库还是实现者的 `portomind_e2e` 副本，保守起见我的脚本**全程只读**——不点「标记已读 / 忽略 / 立即评估」这类写操作。AC4 的写操作项因此改为静态证据判定（见 11.3）。

### 11.3 逐条 AC 判定

| # | 判定 | 我的实测证据 |
|---|---|---|
| AC1 | ✅ | 卡片 `y=146 h=136 bottom=282`（< 900）；`window.scrollY = 0`；无横向滚动条；金额页面 `¥3,151.57` = 接口 `totalCny 3151.57`（误差 0）；`数据时点：2026/10/19 21:26:03` 与接口 `asOf` 同分钟 |
| AC2 | ✅ | `/` 与 `/family` 卡片文案掩时间戳后**逐字完全相等**（含「部分组合折算不完整（缺价或缺汇率）」）；两处 `formatCny` 源码逐字相同；`incomplete` 判定与接口 `portfolioContributions.some(c => c.cnyValue == null)` 推导一致 |
| AC3 | ✅ | `role="button"` / `tabindex="0"` / class 含 `hover:`；鼠标点击 → `/portfolios`；`focus()` 后 `Enter` → `/portfolios` |
| AC4 | ✅ | 动态：未读 2 条 → 全部 6 条 → 切回未读 2 条（可逆）；组合筛选 5 项（= 4 组合 + 全部组合）；「规则管理」→ `/alerts/rules`；全程 0 JS 运行时错误。**写操作项（标记已读/忽略/立即评估）由 diff 证明零改动**：`Dashboard.jsx` 仅 3 处增量（import、h1 文案、插入卡片与 h2），筛选栏与事件列表及其 handler 逐行未动 |
| AC5 | ✅ | `h1` = 家庭总览；侧栏为 `Dashboard` 且全局无 `Dashboard · 提醒`；`h2`「待处理提醒」**唯一**且 `y=306` 位于卡片底 282 之下 |
| AC6 | ✅ | 见 11.2；`/family` 实页仍可访问且 `h1 = 家庭视图` |
| AC7 | ✅ | 见 11.2 |
| AC8 | ✅ | 本记录；Implementer 未自判 |

**额外补验（§7/§8 R-4，实现者未验）**：用 route 拦截把 `**/api/family/summary**` 全部 abort 后重载 `/` —— 卡片降级为独立 `数据加载失败，请稍后重试`，**提醒列表仍渲染 2 条、区块标题仍可见、无可点空壳卡、无未捕获异常**。证明 R-4「卡片失败不得拖垮提醒列表」成立，且「不向上抛」不是纸面承诺。

### 11.4 与计划的偏差复核

D-1～D-4 四项我逐条比对版式与源码，**均在 §1 Constraints / §4 允许范围内**，且 D-1（手册多改 2 处失效名词）、D-3（渐变壳里不塞浅底 `DataState`）判断正确。D-4（`h1` 前仍是 `Bell`）确有观感错位，属计划外的展示决策，保留给 Human（见 11.6）。

### 11.5 须处理（进 `Integrating` 前，均非本任务代码引入）

| # | 问题 | 落点 | 要求 |
|---|---|---|---|
| R-1 | **索引与事实不符（两处）**：① 仍写 TASK-049「`APPROVED · 待 Planner 出 ExecPlan`」，与任务卡/BOARD.md 的「已实施、待评审」矛盾；② 写「活跃执行计划目录（当前为空）」，但 `docs/development/exec-plans/active/TASK-049-*.md` 已存在 | `docs/readme.md:59`、`:72` | 由 Orchestrator 按事实改两行（`readme` 是唯一索引，不能留已知假话） |
| R-2 | **失效名词残留**：应用顶栏铃铛 `title="提醒中心"` —— 与本任务 D-1 已修的「提醒中心」属同一类，且该按钮实际跳 `/alerts/rules`，名与实都不对 | `client/src/components/layout/AppLayout.jsx:87,91` | 建议改 `title="提醒规则"`（或「未读提醒」）。一行，随本次一并改或并入 TASK-047 |

### 11.6 Human 裁决（2026-10-19，两项均「不改」）

- **O-1 首屏主色 —— 裁决：不改**。卡片沿用 `Family.jsx` 的 `from-blue-600 to-indigo-600`（计划要求「照搬」，实现无误）。Reviewer 曾提出：它现在是首页最醒目的元素，而本项目 design token 主色为 `#635BFF`（紫），侧栏选中态也是浅紫 `#EEEDFF`，首屏存在「紫导航 + 蓝卡」两套主色。**Human 2026-10-19 裁决维持现状**，作为既定口径：`TotalAssetsCard` 的渐变**不**改成 token 主色；后续 TASK-050 搬其余五块时**不要**顺手改它。
- **O-2 `h1` 图标（原 D-4）—— 裁决：不改**。首页 `h1`「家庭总览」保持 `Bell` 图标，不换 `LayoutDashboard`。后续若要调整，须另立任务，不在 TASK-049 / TASK-050 范围内顺手改。

> 两项均为**展示层既定决策**，不构成缺陷、不阻塞 `Integrating`；已同步任务卡 §10 与 `BOARD.md`。

### 11.7 建议（不阻塞）

- **N-1 布局抖动**：`isLoading` 返回浅底 `LoadingState`（约 64px），数据到达后变 136px 渐变卡，冷启动首屏会把提醒列表下推约 70px。可给 `LoadingState` 包一个同高占位（`min-h-[136px]`）。
- **N-2 双份未彻底消除**：`formatCny` 已单一来源（达标），但卡片的三段文案与 `incomplete` 判定式仍是 `Family.jsx` / `TotalAssetsCard.jsx` 两份。AC2 当前成立；彻底去重随 TASK-050 删页完成。
- **N-3 实现者走查脚本有 2 处偏弱断言**：`e2e-task-049.mjs:157`「立即评估后页面仍可用」只断言 `h2` 可见（几乎恒真）；`:138` 用 `>=`。结论不受影响（我已独立覆盖），但建议沿用 §10.4「负向对照」的做法并固化为脚本惯例——**每个脚本至少留一条「能失败」的证据**。
- **N-4** `docs/development/exec-plans/active/` 目录整体处于未跟踪状态（含本 ExecPlan）。归档/提交时注意别漏。

### 11.8 关于「未复跑实现者脚本」

`client/scripts/e2e-task-049.mjs` 含写操作（标记已读/立即评估），需指向测试库才能安全复跑，本机条件不具备，故**未重跑**；它的 23/23 仍属实现者举证。我以自写只读脚本独立覆盖了 AC1/AC2/AC3/AC5 + AC4 只读项 + R-4，结论一致，故不影响判定。

---

## 12. Integration Record（Orchestrator，2026-10-19）

> 本节只记录 `Integrating` 阶段由 Orchestrator **亲自复跑**的结果，不引用 §10.3（实现者自评）与 §11.2（Reviewer 实测）的任何数字。

### 12.1 全系统验证（Orchestrator 独立执行）

| 项 | 命令 | 结果 |
|---|---|---|
| 客户端构建 | `npm run build --workspace client` | ✅ `BUILD_EXIT=0`，`2404 modules transformed`，仅既存 chunk >500kB 警告（与改动无关） |
| 客户端静态检查 | `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` | ✅ `ESLINT_EXIT=0`，0 error / 0 warning |
| 服务端测试 | `npm run test:server` | ✅ `# tests 152 / pass 152 / fail 0` |
| 调度器测试 | `npm run test:worker` | ✅ `# tests 77 / pass 77 / fail 0` |
| 合计 | — | ✅ **229 pass / 0 fail** |
| AC6 改动边界 | `git status --short server shared cron-worker client/src/pages/Family.jsx client/src/router.jsx client/src/hooks/useFamily.js client/package.json package-lock.json` | ✅ **空输出**（零服务端改动、未碰 `/family` 三件套与依赖锁） |

### 12.2 审查遗留项处置

| # | 来源 | 处置 |
|---|---|---|
| **R-1** | §11.5 | ✅ **已闭环**：`docs/readme.md` 两行按事实改写 —— `:59` 活跃任务改为「`INTEGRATING` · 独立评审已通过 · 待 Human 最终验收」；`:72` 活跃执行计划目录不再写「当前为空」，改为指向本 ExecPlan |
| **R-2** | §11.5 | ⏸ **未处理，移交 Human 裁决**：`AppLayout.jsx:87,91` 顶栏铃铛 `title="提醒中心"` 属业务代码，**超出本 ExecPlan §1 Scope**，Orchestrator 无授权擅改。建议并入 `TASK-047`（同类展示层小修），或在 `TASK-050` 一并处理 |
| N-1 | §11.7 | ⏸ 不处理：加载态高度抖动为观感问题，改 `LoadingState` 会波及全站，非本任务范围 |
| N-2 | §11.7 | ⏸ 计划内：`formatCny` 已单一来源；卡片文案与判定式的双份随 `TASK-050` 删页消除 |
| N-3 | §11.7 | ⏸ 不处理：`e2e-task-049.mjs` 的两处弱断言不影响结论（Reviewer 已独立覆盖）；「每个脚本至少一条能失败的证据」已作为惯例记录 |
| N-4 | §11.7 | ✅ 已注意：本次提交须包含 `docs/development/exec-plans/active/` 目录 |

### 12.3 未执行项与原因

- **未执行 `git commit`**：`ORCHESTRATOR.md §3` 的授权范围不含合并入库，按 TASK-044 的既定分工，提交由 Human 执行。
- **未置 `Completed`**：最终验收属 Human 职权。需 Human ① 提交本次改动；② 确认 AC1–AC8 的验收结论；之后再由 Orchestrator 归档至 `complete/` 并置 `Completed`。

### 12.4 当前工作区待提交范围（供 Human 提交时核对）

| 类别 | 文件 |
|---|---|
| 业务代码 | `client/src/components/Household/TotalAssetsCard.jsx`（新增）· `client/src/pages/Dashboard.jsx` · `client/src/components/layout/Sidebar.jsx` · `client/src/utils/priceDisplay.js` |
| 验证脚本 | `client/scripts/e2e-task-049.mjs`（新增） |
| 手册 | `docs/handbook/manual/CLIENT.md` |
| 任务与计划 | `docs/development/exec-plans/active/TASK-049-dashboard-household-total.md` · `docs/development/tasks/active/TASK-049-dashboard-household-total.md` · `docs/BOARD.md` |
| 需求与索引 | `docs/development/requirements/specs/completed/FS-household-view-split.md` · `docs/development/tasks/active/TASK-050-*.md` · `docs/readme.md` |
| 上一批（TASK-043/044 归档） | `docs/development/exec-plans/completed/TASK-043|044-*` · `docs/development/tasks/completed/TASK-043|044-*` · `docs/development/requirements/specs/completed/FS-transaction-consolidation.md` · `docs/development/tasks/active/TASK-046|047|048-*` |

> 工作区里混有**两批**未提交改动（TASK-043/044 归档 + TASK-049 实施）。建议拆两个 commit，避免把「上一轮归档」与「本轮功能」混在一个提交里。

---

## 13. Completion Record（Orchestrator，2026-10-19）

### 13.1 结案依据

| 项 | 内容 |
|---|---|
| Human 指令 | 2026-10-19「TASK-049 已经完成」 |
| 提交 | `69576ad` + `56c6507`，均在 `feature/TASK-049-dashboard-household-total`，已推送 `origin` |
| 工作区 | `git status --short` 空输出（提交后无未申报残留） |
| 归档前复跑 | 在**本分支**（非 `main`）重新执行：`npm run build --workspace client` → `BUILD_EXIT=0`；`cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` → `ESLINT_EXIT=0`；`npm run test:server` → `152 pass / 0 fail`；`npm run test:worker` → `77 pass / 0 fail`（合计 **229 / 0**） |
| 边界复验 | `git status --short server shared cron-worker` 空输出，AC6「零服务端改动」成立 |

> 复跑是在 `feature/TASK-049-dashboard-household-total` 的工作区进行的，与 §12.1 的 `Integrating` 复核结果一致；`main` 分支不含本次改动，在 `main` 上跑出的绿灯不能代表本任务，故不作为依据。

### 13.2 归档动作

| 对象 | 动作 |
|---|---|
| 本 ExecPlan | `git mv` `development/exec-plans/active/` → `development/exec-plans/completed/`；Status → `Completed`；关联任务指向 `development/tasks/completed/` |
| 任务卡 | `git mv` `development/tasks/active/` → `development/tasks/completed/`；Status → `COMPLETED`；补 §12 Completion Record |
| `docs/BOARD.md` | Active 清空（写「无活跃任务」）；Done 新增 TASK-049 行；`TASK-050` 的 B1 硬前置解除 |
| `docs/readme.md` | 活跃任务 → 无；已完成任务补 TASK-049；归档段活跃执行计划目录改为「当前为空」 |
| 交叉引用 | `specs/completed/FS-household-view-split.md`（D-2、阶段 1）、`TASK-050` 卡（B1）路径与状态同步 |

### 13.3 遗留与移交

| # | 内容 | 去向 |
|---|---|---|
| R-2 | `AppLayout.jsx:87,91` 顶栏铃铛 `title="提醒中心"` 名实不符（实际跳 `/alerts/rules`） | 移交 `TASK-047`（同类展示层小修）或 `TASK-050`；本任务超 Scope 未改 |
| N-1/N-2/N-3 | 加载态高度抖动 / `formatCny` 双份 / E2E 弱断言 | 不处理。N-2 随 `TASK-050` 删 `Family.jsx` 自然消除 |
| 分支状态 | `main` 停在 `891d0f7`，`feature/TASK-044`、`feature/TASK-049-*` 均未合并；`feature/TASK-050` 从 `main` 拉出，缺 044/049 全部前置 | **Human 决策**：合并顺序（044 → 049 → 050）与 `feature/TASK-050` 是否 rebase 到 049 分支 |

### 13.4 未做

- 未执行任何 `git` 写操作（含 `commit`、`merge`、`rebase`）：`ORCHESTRATOR.md §3` 授权只覆盖文档归档与验证，不含合并入库。
- 未修改 `R-2` 相关业务代码（超 Scope）。
- 未改任何验收标准或 AC 结论。

> 本文件归档后不再变更。
