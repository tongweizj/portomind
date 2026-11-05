# TASK-056 — US-001 实施计划

## Status

Status：Completed

Owner：Planner（规划）→ Implementer（2026-11-04 实施，`6f4b491`）→ Reviewer（`Pass with issues`，`31b516e`）→ Human（2026-11-04 结案）

Related Task：[TASK-056](./TASK-056.md)；所属 [US-001](../../requirements/stories/active/US-001-cron-worker-health-and-data-completeness.md)。

Branch / Base：从 `main` 的 `dc4b15a` 新建 `feature/TASK-056`，在**独立 worktree** 中实施（不占用主工作区）。规划期只读基线为 `chore/agent-rules-refactor` @ `2bde913`，该提交是当前 `main` 的祖先，且 `git diff 2bde913..main` 对本卡目标文件（`design-tokens.js`、`CronStatus/`、`priceDisplay.js`）无差异——规划期结论仍成立。

Approval：2026-11-04，Human 明确「先完成 056」，据此登记 Draft → Approved。批准覆盖本文件 §1～§9 当前设计，不含其他任务。**§4 的 token 命名 `statusOk/statusWarn/statusBad/statusIdle` 随本次批准冻结**（`TASK-055` AC2 要引用）；候选色值同获批准，但须在实施时实测对比度，不达 4.5:1 时按 AC7 调整本次新增色。

启动核对：2026-11-04 完成只读核对，结论见 §10.1。**发现一处真实缺口（图例无预置插槽），已在 §10.1 给出处置方案，不阻塞实施。**

## 1. Intent

任务需求与 AC 唯一来源为关联 Task 的 §3，逐条引用该节、不增删改；覆盖 US-001/AC-02、09。验证映射见 §7。当前计划不允许实现US-001范围外的P1/P2功能、调度控制或既有汇率方向修复。

## 2. Context

需求、任务和未决项见 [Planner回交](./US-001-02-planner-return.md)。本任务需 ExecPlan：保留原卡计划要求，跨共享token、映射与图例消费方。不新增审批层。

## 3. Repository Findings

本轮只读源码核实位置、SHA256和证据边界见 [回交 §2](./US-001-02-planner-return.md)。未连接数据库、未执行应用/测试或DDL；部署Mongo版本、实际索引/集合与当前数据库数据均未核实。054历史测试日志只作既有证据，不能当成本次运行。

## 4. Proposed Design

在 client/src/constants/design-tokens.js 仅新增系统状态token，不修改up/down及现有消费者。推荐命名statusOk/statusWarn/statusBad/statusIdle，草案候选文字色为#166534/#854D0E/#B91C1C/#475569；实施时测白底文字对比度，不达4.5:1则调整本次新增色，不声称本轮已测色。

components/CronStatus/statusTone.js 维护ok/warn/bad/unknown到token、文字、图标的一处映射；StatusLegend在053shell首屏插槽显示“红=坏、绿=好”。颜色由实际dataStateLevel驱动，运行徽章独立；unknown只能表示未知/未跑/跳过说明，不能替代业务成功。055与063仅消费此映射，不创建自有色值。

## 5. Work Breakdown

- [ ] W1：核对现有design tokens及up/down消费集合，确定新增范围。
- [ ] W2：新增token、单一映射和非颜色状态标识。
- [ ] W3：在053shell集成首屏图例，给055/063导出稳定props和token接口。
- [ ] W4：测对比度、灰态不成功、既有行情消费集合及client验证。

## 6. Decisions

**已冻结（随 2026-11-04 批准）**：

| 项 | 决定 | 依据 |
|---|---|---|
| Token 命名 | `statusOk` / `statusWarn` / `statusBad` / `statusIdle` | §4；`TASK-055` AC2 需引用，必须稳定 |
| 候选色值 | `#166534` / `#854D0E` / `#B91C1C` / `#475569` | §4；静态计算白底对比度 7.13 / 6.85 / 6.47 / 7.58 均 ≥ 4.5:1，**实施时须以浏览器实测为准**（AC7） |
| 映射位置 | 单一来源 `components/CronStatus/statusTone.js` | §4；AC3 检测式与单一归属要求 |
| `unknown` 语义 | 只表示"未知/未跑/跳过"，不得替代业务成功 | §4；AC6 |

**实施时仍需自行判断（属实现层，不需再审批）**：图例的具体位置与视觉形态、圆点最小尺寸（R-4）、灰态是否配虚线边框（R-6）。

**发现的设计缺口（见 §10.1）**：`BoardShell` 未预置图例插槽。处置方案已在 §10.1 给出——在 `BoardShell` 内新增一行图例位，属对 053 骨架的**最小增补**，不改其结构契约。

决定详情与选项见回交 §4。未决内容不得按推荐值擅自实现。

## 7. Verification

以下为未来验收设计，未运行。适用命令入口见 [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md)，不以历史数量作为预期。每条AC均有映射：

| Task AC | 验证方法与期望 |
|---|---|
| AC1～AC3 | 检查新增命名与映射；渲染四态取计算色对照token；限定看板无行情语义token，临时夹具负向验证。 |
| AC4、AC5 | 首屏图例可见；四态都有文字或图标，不依赖颜色。 |
| AC6 | 无记录/unknown样例不出现“正常/全部良好”。 |
| AC7 | 记录候选前景/背景的实际对比度，低于4.5:1不通过。 |
| AC8 | 对照up/down消费方集合与既有页面配色不变。 |
| AC9 | client build/lint入口通过，记录实际输出。 |

同基线有效证据可复用；只对新增/关键断言补负向对照，在临时副本或夹具操作，不污染被审实现。验证失败不得改断言掩盖实现问题。

## 8. Risks

系统色与涨跌色混淆、文字色不达对比度、消费者硬编码；用单一映射与原消费集合检测。

## 9. Rollback

先撤回消费者再撤新增token，或原子撤回同一交付；不更改数据库及行情颜色。

## 10. Implementer Handoff

### 10.1 启动核对结果（2026-11-04，Orchestrator）

依据：Human 指示「先完成 056」；状态权限见 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态)。本节为只读核对记录。

**结论：设计有效，AC1～AC9 可独立实施，无硬阻塞。发现一处真实缺口（图例无预置插槽），处置方案见下，不阻塞。**

| 启动项 | 核对事实 |
|---|---|
| 基线 | `main` = `dc4b15a`；`feature/TASK-056` 分支**不存在**，`git worktree list` 仅主工作区一条。需新建分支与 worktree。 |
| 目标文件 | `client/src/constants/design-tokens.js` 干净、SHA256 `386b56e7…`；`grep status` **0 命中**，确认四态 token 尚未存在。 |
| 依赖 B2 | 计划已批准、token 命名已冻结 → **已满足**。 |
| 依赖 B4（053 骨架） | ✅ **已满足**：`CronStatus/` 四文件（BoardShell / SummaryShell / TaskCardShell / unknownValue）已在 `main`（PR #41）。 |
| AC3 基线 | `grep -rn "colors\.up\|colors\.down" client/src/components/CronStatus/` → **0 行**。负向对照可安全注入。 |
| AC8 基线 | 全仓 `colors.up\|colors.down` 消费方 **7 文件 13 处**：`priceDisplay.js`(3)、`Asset/AssetDetail.jsx`(2)、`Asset/AssetList.jsx`(1)、`Portfolio/KpiCards.jsx`(2)、`Portfolio/PositionOverview.jsx`(1)、`Account.jsx`(1)、`AccountUsers.jsx`(3)。**卡 §2 的清单少了账号页 2 个文件**（TASK-058 引入，用 `down` 绿表示"成功/启用"）→ AC8 前后对照须按 **7 文件**集合，且**不得**改账号页。 |
| AC7 对比度预核 | 候选色静态计算（WCAG 公式，白底 `#FFFFFF`）：`#166534` 7.13:1 · `#854D0E` 6.85:1 · `#B91C1C` 6.47:1 · `#475569` 7.58:1，**均 ≥ 4.5:1**。⚠️ 这是公式计算**不是浏览器实测**，不能替代 AC7 的实测记录。 |
| AC2 取色前提 | 卡 §2 称"Tailwind v4 编译为 `oklch()`"，但 `design-tokens.js` 是**普通 JS 导出的 hex 字面量**、组件用 inline style。`getComputedStyle` 取色仍应遵守（浏览器会归一化），但风险描述的前提在本卡目标文件上不成立。 |
| 验证入口 | [DEPLOYMENT §7](../../../handbook/ops/DEPLOYMENT.md#7-验证与测试命令)：`cd client && npm run build && npm run lint`。`client/package.json` 有 `build`/`lint`，**无 `test`**；`node_modules/.bin/eslint` 为 v9.39.5；`playwright-core` 可解析。以上只证明工具可达，**不证明任何验证已通过**。 |

### 10.2 ⚠️ 发现的缺口：图例没有预置插槽

**事实**：`TASK-053` 计划 §4 写「056 插入图例」，但 **053 的 `BoardShell` 并没有声明图例插槽**——它只有 `SummaryShell`、`task-card-grid`（五卡）、`data-testid="board-shell"` 容器，没有任何 legend 位置。`SummaryShell` 内也只有 `health-dots` / `overall-badge` / `snapshot-at` 三个元素。

**影响**：AC4 要求「图例首屏可见」，但没有现成挂载点。这不是 053 的缺陷（053 AC4 只要求六区域卡片位），而是两卡之间的**接口约定缺失**。

**处置方案（已批准，按此实施）**：在 `BoardShell` 内、`SummaryShell` 之后、五卡网格之前，新增一行图例位：

```jsx
<BoardShell>
  <SummaryShell ... />
  <StatusLegend />        {/* ← 056 新增：一行四态图例，首屏可见 */}
  <div data-testid="task-card-grid"> ... </div>
</BoardShell>
```

约束：① 只**新增**这一行，不改 `BoardShell` 的现有 props、不改五卡结构、不改 `SummaryShell`；② `StatusLegend` 自带 `data-testid="status-legend"`，便于 AC4 断言；③ 若实现时发现新增该行会破坏 053 已验收的断言（如"总览条恰好 5 灯"），**停下上报**，不要改 053 的断言。

### 10.3 已准备、尚未派发的交接

- **需求**：[TASK-056](./TASK-056.md) §1～§4。
- **设计与验证**：本计划 §4 / §5 / §7。
- **写入边界**：仅 `client/src/constants/design-tokens.js`（只加不改）、新增 `components/CronStatus/statusTone.js` 与 `StatusLegend`（文件名自定）、`BoardShell.jsx` 新增一行。**不改** `server/` `shared/` `cron-worker/`，不改行情页/持仓页/KPI 卡/账号页配色，不做暗色主题，不做数据与布局。
- **交付要求**：文件清单与 SHA256、AC1～AC9 逐条结果、AC3 负向对照、AC7 实测对比度值、AC8 七文件集合前后对照、build/lint 实际输出、妥协与未验证项。

### 10.4 剩余启动动作

从 `main`（`dc4b15a`）建 `feature/TASK-056` 独立 worktree，记录路径/分支/基线/工作区状态/工具可用性，然后指派 Implementer。本轮**未执行**该动作，未切换或清理主工作区。

## 11. Implementation Record

尚未实施。

## 12. Review Record

尚未独立审查；本轮Planner自检不等于Reviewer判定。

> **2026-11-04 更新**：独立审查已完成，判定 `Pass with issues`（无 BLOCKER/MAJOR），记录见 §12.1～§12.7。上句为规划期占位，保留以显示流转。

## 13. Completion Record

### 13.1 结案依据（2026-11-04，Human 确认）

| 项 | 事实 |
|---|---|
| 结案日期 | 2026-11-04 |
| 结案指令 | Human：「056 请登记完成」 |
| 实现 | `feature/TASK-056` @ `6f4b491`（worktree `D:/projects/portomind-056`） |
| 审查记录 | `31b516e`（§12） |
| 审查判定 | `Pass with issues`，无 BLOCKER/MAJOR |
| 状态流转 | `Draft` → `Approved`（2026-11-04）→ `Implementing`（计划推进）→ `Completed`（2026-11-04） |
| 合入 | **`Pending`** —— 分支尚未合入 `main`（`git merge-base --is-ancestor 31b516e main` = 否） |

### 13.2 DoD 逐条（[DEFINITION_OF_DONE](../../../os/process/DEFINITION_OF_DONE.md) §3）

| # | 要求 | 结论 |
|---|---|---|
| T-1 | 实现完成 | ✅ §11.2（8 文件） |
| T-2 | 验证完成，记录实际结果 | ✅ §11.3 / §11.5 / §11.7；未验证项见 §11.8 |
| T-3 | AC 逐条满足 | ✅ §12.3（Reviewer 独立实测） |
| T-4 | 审查收敛，无未决 BLOCKER，MAJOR 已整改 | ✅ `Pass with issues`，无 BLOCKER/MAJOR |
| T-5 | 文档同步 | ✅ 任务卡、本计划 §11～§13、BOARD |
| T-6 | 已知妥协已记录 | ✅ §11.8 六项 |

> 按 DoD §4，「合入 `main`」不属于任务级 DoD；`Merged` 字段单列，由 Human 判定。当前为 `Pending`。

### 13.3 遗留（不阻塞结案）

- **F-01（MINOR）**：`verify-task-056.cjs` 的 AC2 期望色取自被测同一 `colors[token]`，有恒真风险。Reviewer 已用批准色值硬基线独立复验，结论可信；建议后续修正脚本。
- **F-02（MINOR）**：验收脚本依赖本机 Chrome + `playwright-core`，未接入 CI。
- **F-03（MINOR）**：AC6 卡片文案仍为 053 占位「未知」，待 `TASK-063` 消费 `statusTone` 接线。
- **未验证**：移动端/极端缩放下图例首屏可见性（仅测 1440×900 与 1280×600）。

### 13.4 对下游的影响（重要）

`TASK-055` AC2 要求引用本卡的 `status*` token，而这些 token **目前只在 `feature/TASK-056` 分支上，`main` 中没有**。055 若从 `main` 拉分支将取不到 token。合入 056 是 055 完整实施的前置；或在 055 开工时从 `feature/TASK-056` 切分支（需 Human 决定）。

### 13.5 过程目录处置

按 [DOCS.md §1.1](../../../os/standards/DOCS.md#11-story-交付目录与文档生命周期)，本卡与计划**留在** `development/delivery/US-001/`，待 Human 关闭 US-001 后整体归档。
