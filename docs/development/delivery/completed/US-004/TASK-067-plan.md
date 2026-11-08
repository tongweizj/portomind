# TASK-067 — US-004 实施计划

## Status

Status：Completed（2026-11-06，Task 已 `Completed`；Human 确认验收通过。计划由 `Approved` 同步为 `Completed`）

Owner：Planner（规划）→ Implementer C（2026-11-06 指派）

Related Task：[TASK-067](./TASK-067.md)；所属 [US-004](../../../requirements/stories/active/US-004-dashboard-portfolio-health.md)。

Approval：**2026-11-06，Human 明确确认「我已经批准了」**（Orchestrator 会话核对时本文件仍为 `Draft`、无 Approval 段；经 Human 当面确认后由 Orchestrator 据其决定登记，**不是自行批准**）。批准覆盖本文件 §1～§9 当前设计，不含其他任务。此登记不改变设计内容。

Branch / Base：实施时从 up-to-date `main` 新建 `feature/TASK-067` 独立 worktree。规划期基线为 2026-11-05 的 `main`；目标文件 `client/src/components/PortfolioCard/index.jsx`、`client/src/hooks/usePortfolios.js` 已亲读核实（见 §3）。

Approval：**未批准**。本计划覆盖 §1～§9 当前设计；`Draft → Approved` 归 Human（[STATES.md](../../../../os/process/STATES.md) §4）。注意：本卡 Task 卡原标注「免计划」，因 Human 明确要求「逐一为每个 task 编写 execplan」，本计划据此编制。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task [TASK-067](./TASK-067.md) 的 §3；覆盖 US-004/AC-17、AC-18。本卡给 `PortfolioCard`（`/portfolios` 组合卡）新增四格：总市值 / 持仓资产 / 待办 / 上次再平衡。**零新增请求、零服务端改动**，且与 TASK-066 健康表同源、文案逐字一致。

## 2. Context

需求、任务见 [Story US-004 §3](../../../requirements/stories/active/US-004-dashboard-portfolio-health.md) 与 [FS §6.2 B15、§10 R-10、§11 HD-13](../../../requirements/specs/FS-portfolio-ia-cleanup.md)。

关键约束：
- **零请求零服务端**：四格数据全部取自 `usePortfolios()` 返回的 `stats`（TASK-065 落地后含 `lastExecutedAt`/`pendingRebalanceCount`）。
- **同源（D-01 解 B，已裁）**：卡片与健康表「待办」「上次再平衡」文案**逐字一致**；「偏离」数据同源取 `stats.drift`，但卡片 `DriftBadge` 徽标维持两态（P1-1），不改成语健康表四态。逐字一致**不**要求偏离徽标与健康表偏离列字面相同。
- **不扩义**：徽标仍用 `drift.needsRebalance`（P1-1 未做前不改语义）。

## 3. Repository Findings（2026-11-05 亲读 `main`，行号为现状）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | 现有卡片：`MarketValueRow`（市值 + `positionCount`）`:18-29`；`DriftBadge`（偏离阈值/配置正常）`:31-38`；`unreadAlertCount` 徽标 `:79-83` | `client/src/components/PortfolioCard/index.jsx` |
| F-02 | `usePortfolios()` 返回 `stats: {positionCount, marketValueByCurrency, drift, unreadAlertCount}`；TASK-065 落地后新增 `lastExecutedAt`/`pendingRebalanceCount` | `client/src/hooks/usePortfolios.js:18-27` |
| F-03 | `GET /api/portfolios/summary` 已含 `stats`（零新增请求前提成立） | `client/src/services/portfolio.service.js:8-9` |
| F-04 | 卡片徽标仍用 `drift.needsRebalance`（`:35`），P1-1 未做前不改 | `index.jsx:35` |

## 4. Proposed Design

1. **`PortfolioCard/index.jsx` 新增四格展示区**（数据全部从 `portfolio.stats` 派生）：
   - ① 总市值：`marketValueByCurrency` 分币种并列（沿用 `CURRENCY_SYMBOLS` 与 `formatBucket`），**不跨币种合计**。
   - ② 持仓资产：`positionCount`。
   - ③ 待办：`pendingRebalanceCount`（「N 条待确认」）+ `unreadAlertCount`（「N 条未读」）；两者皆 0 → 「—」。
   - ④ 上次再平衡：`lastExecutedAt` → `YYYY-MM-DD`，`null` → 「从未」。
   - 布局沿用卡片既有 Tailwind 风格（`text-sm text-gray-*`），不引入新设计 token。
   - 徽标跳转目标与 TASK-066 `B9` 一致（「N 条待确认」→ `?sub=suggestions`，「N 条未读」→ `/` 组合筛选）；本卡主要做展示，跳转行为与健康表约定一致即可。

2. **同源（D-01 解 B）**：卡片「待办」「上次再平衡」文案与 TASK-066 健康表**逐字一致**，共享同一文案常量 `client/src/constants/driftLabels.js`（**由 TASK-066 / Implementer B 拥有，本卡消费**，D-02 已裁）。「偏离」数据同源取 `stats.drift`（不各算一套），卡片 `DriftBadge` 徽标维持现状两态，不改成四态。

3. **零改动红线**：不改 `shared`/`server`/`cron-worker`；不改 `drift.needsRebalance` 徽标语义；不新增请求（复用 `stats`）。

## 5. Work Breakdown

- [ ] W1：`PortfolioCard` 新增四格展示（含 `lastExecutedAt`/`pendingRebalanceCount` 降级态：字段缺失时「待办」「上次再平衡」显示「—」/「从未」）。
- [ ] W2：消费 TASK-066 拥有的 `driftLabels.js` 共享常量，对齐「待办/上次再平衡」文案（逐字一致）；偏离徽标维持两态。
- [ ] W3：验证（§7）：Network 请求数不变、四格呈现、`grep` 不到「暂无」、文案逐字一致。
- [ ] W4：`npm run build --workspace client` + eslint。

## 6. Decisions

| 项 | 结果 | 依据 |
|---|---|---|
| 市值口径 | 按组合本币分币种并列，不跨币种合计（OQ-03 假设：市值单币种简化） | Spec OQ-03 / 产品硬约束 |
| D-01（逐字一致口径） | 解 B：逐字一致只约束「待办/上次再平衡」；偏离徽标维持两态、数据同源 | 2026-11-06 Human 裁决 |
| D-02（常量归属） | `driftLabels.js` 由 TASK-066（Implementer B）拥有，本卡消费 | 2026-11-06 Human 裁决 |

无待 Human 新决事项。

## 7. Verification

| Task AC | 验证方法 | 预期结果 |
|---|---|---|
| AC-01（四格呈现） | 进入 `/portfolios` 观察卡片 | 总市值/持仓资产/待办/上次再平衡四格全部呈现 |
| AC-02（空态） | 构造待办=0、无 lastExecutedAt | 「待办」显示「—」、「上次再平衡」显示「从未」；`grep -rn "暂无" client/src` 无结果 |
| AC-03（同源逐字一致，解 B） | 构造同一组合，比对卡片与健康表「待办」「上次再平衡」文本；确认偏离徽标仍两态 | 「待办/上次再平衡」文案逐字一致；偏离徽标维持「偏离阈值/配置正常」两态，数据同源 |
| AC-04（零请求） | Network 面板对比改动前基线 | portfolios 相关请求数不变 |

命令入口见 [DEPLOYMENT.md §7](../../../../handbook/ops/DEPLOYMENT.md)。

## 8. Risks

| # | 风险 | 应对 |
|---|---|---|
| R-1 | 口径分裂：卡片与健康表「待办/上次再平衡」文案不一致 | 共享 `driftLabels.js` 常量（D-02：066 拥有）；AC-03 |

## 9. Rollback

纯客户端改动，回退 = `git revert` 该次提交，无数据影响。

## 10. Implementer Handoff

- **输入**：本计划 §4 + [TASK-067](./TASK-067.md) §3 AC + [FS §6.2 B15](../../../requirements/specs/FS-portfolio-ia-cleanup.md)。
- **范围与禁改**：只改 `client/src/components/PortfolioCard/index.jsx`（+ 按需共享常量）；**禁改** `shared`/`server`/`cron-worker`、`drift.needsRebalance` 语义。
- **授权**：须 Human 批准本计划后实施。
- **依赖**：前置 TASK-065（字段）；与 TASK-066 同源对齐。
- **预期产出**：四格展示 + 请求数不变 + 文案一致。
- **停止条件**：若与 TASK-066 文案约定冲突，停下协调。
- **验证入口**：`npm run build --workspace client` + eslint。

## 11. Implementation Record

（Implementer C，2026-11-06，基线 `main` @ `0189c04`，worktree `D:/projects/portomind-067`，分支 `feature/TASK-067`）

### 改动范围

| 文件 | 说明 | SHA256 |
|---|---|---|
| `client/src/components/PortfolioCard/index.jsx` | 新增四格展示（总市值 / 持仓资产 / 待办 / 上次再平衡），并删除原 `MarketValueRow` 与旧「N 条未读提醒」徽标（其职责并入「待办」格） | `f270472379285afe522a3a85cac607594945a6c4c8d08dd1258d9ccf10d05974` |

唯一改动文件。未改 `shared/`、`server/`、`cron-worker/`、Dashboard 健康表、`drift.needsRebalance` 徽标语义。

### driftLabels.js 处理方式（D-02）

- `main` @ `0189c04` 上**无** `client/src/constants/driftLabels.js`（已核实），本卡**未新建**该文件。
- 交付时本卡临时内联文案（见组件顶部注释），文案字面与 TASK-066 已建常量 `PENDING_LABELS` / `LAST_REBALANCE_LABELS` **逐字一致**（已核对 066 worktree `feature/TASK-066` @ `f72f40f` 的 `client/src/constants/driftLabels.js`：`pendingRebalance: ${count} 条待确认`、`unreadAlert: ${count} 条未读`、`lastRebalance never: 从未`）。
- **待 B 的 driftLabels.js 合入 main 后切换为 import**（组件顶部已标注 TODO 注释，含切回点）。

### AC 逐条结果

| AC | 结果 | 证据 |
|---|---|---|
| AC-01 四格呈现 | ✅ | SSR 渲染真实 `PortfolioCard`：总市值 `¥82,340.5 + US$1,200`（分币种并列、无跨币种合计 83540）、持仓资产 `3 个`、待办 `2 条待确认 + 1 条未读`、上次再平衡 `2026-08-27`。 |
| AC-02 空态 | ✅ | 待办 0 → 「—」；`lastExecutedAt: null` → 「从未」；`grep "暂无" client/src/components/PortfolioCard/` 无结果（exit 1）。 |
| AC-03 同源逐字一致（解 B） | ✅ | 待办/上次再平衡文案与 066 `driftLabels.js` 逐字一致（`N 条待确认`/`N 条未读`/`从未`/`YYYY-MM-DD`）；偏离数据同源取 `stats.drift`（无各算一套）；`DriftBadge` 维持两态「偏离阈值/配置正常」。 |
| AC-04 零新增请求 | ✅ | 组件仅新增 `lucide-react`/`constants/enums`（均为既有 import），无 `useQuery`/`service`/`fetch`/`axios` 引入；数据全部取自 `portfolio.stats`（`usePortfolios()` 既有 `portfolios-summary` 查询），改动前后请求路径不变。 |

### 验证命令

- `cd client && npm run build` → exit 0（vite build 成功，2438 modules）。
- `cd client && ../node_modules/.bin/eslint "src/**/*.{js,jsx}"` → exit 0（0 error）。
- 渲染实测：19 项断言全部 PASS（四格真实值 / 降级态 / 待办 0 → — / 无值 → 从未 / 无「暂无」/ 字段缺失不崩不显 0 / 无 stats 兜底 / 仅未读 / 仅待确认）。
- 负向对照：把 `DriftBadge` 换成四态文案后，卡片与健康表偏离列字面不一致（「偏离阈值」≠「2 项超阈」），AC-03 逐字一致断言会失败——证明本卡未改徽标语义。

### 待 065 合入后补验清单

- 真实 `pendingRebalanceCount` / `lastExecutedAt` 落到 `stats` 后，四格「待办」「上次再平衡」显示真实值（当前以字段缺失降级态验证：不崩、不显 0、显示「—」/「从未」）。
- 与 TASK-066 健康表对**同一真实组合**做端到端文案逐字比对（当前为常量表核对 + 组件级 SSR 断言）。
- 切回 `driftLabels.js` import（B 合入后）并复跑 build + eslint。

### 已知妥协与未验证项

- 未做真实浏览器 Network 面板截图（无后端运行环境）；AC-04 以「无新增请求入口 + 数据源复用既有 query」静态证明，配合 `usePortfolios()` 既有 `queryKey: ['portfolios-summary']` 缓存机制佐证。
- 「待办」跳转目标（B9：`?sub=suggestions` / `/` 组合筛选）属 TASK-066 健康表 AC-03 口径；本卡四格为纯展示，未加跳转（与计划 §4「本卡主要做展示」一致）。

### 提交

- 提交到 `feature/TASK-067`，正文带 `TASK-067`。不 merge main、不改 Task 状态、不填 Merged。

## 12. Review Record

### 12.1 独立性声明与审查对象

- 依据 [REVIEWER.md §5/§7](../../../../os/roles/REVIEWER.md)。**独立 Reviewer，未参与本卡实现或验收脚本编写**；Implementer C 自述（§11）不作结论，全部实跑复核。判定词不是状态，不构成合入许可。
- **评审前置已执行（用户明确要求）**：`feature/TASK-067` 原 HEAD `8141275`（父 `0189c04` = 旧 main）**不含** 065 合入 `6f556aa`。复核前先在分支上 `git merge main -m "review(TASK-067): merge main to refresh stale base before independent review"`（ort 策略、**无冲突**），得到干净基线 HEAD **`434a323`**；`git merge-base --is-ancestor main HEAD` = 是，065 合入 `6f556aa` 已在 HEAD 中。
  - rebase 前 `git diff main..feature/TASK-067 --stat` 把 065 四字段（`summary.js -34`）、156 行测试、065/068/070 文档显示为「删除」——确认为**假象**（main 在 `0189c04` 之后新增的内容，旧分支基点上没有），**未据此判 Fail**。
  - rebase 后复核：`summary.js` 仍含 `pendingRebalanceCount`/`dueByTime`/`overThresholdCount`（grep 5 处命中）；`server/test/integration/portfolio.summary.test.js` 仍 **345 行**（065 的 +156 行增量未丢，AC-01/04 用例在 `:146/:174/:250`）。
- 正确范围判定（merge-base `96ff382` = 合并前的 main .. HEAD）：`git diff --stat` = **2 文件** —— `client/src/components/PortfolioCard/index.jsx`、`TASK-067-plan.md`；**不含** `shared/`、`server/`、`cron-worker/`、`summary.js`、任何测试文件。
- 被审文件 SHA256：`PortfolioCard/index.jsx` `f270472379285afe522a3a85cac607594945a6c4c8d08dd1258d9ccf10d05974`（与计划 §11 记录一致）。工作区审查后干净（temp 探针/夹具全删；merge 提交本身已提交）。

### 12.2 实跑证据（不靠代码阅读下结论）

| 命令 / 动作 | 实际输出 |
|---|---|
| `npm run build --workspace client` | `✓ built in 2.88s / 3.26s`，exit 0（仅既有 chunk >500 kB 警告） |
| `eslint "src/**/*.{js,jsx}"` | exit 0，0 error / 0 warning |
| 真实浏览器（Chrome headless + Vite + stub API，进入 `/portfolios`） | **AC-04 运行时**：portfolios 相关请求 **count=1** = `/api/portfolios/summary?includeArchived=false`，无新增子请求、无 pageerror；真实页面渲染四格与「2 条待确认 / 1 条未读」 |
| 自建浏览器探针（临时，已删） | **19/19 PASS**：四格真值/分币种不合计/降级/两态徽标/同源/零新增请求 |
| 负向对照 ×3 | 见 §12.5，均使关键断言 FAIL 后还原 |
| git merge main（前置） | Merge made by 'ort'，无冲突；main 成为 HEAD 祖先，065 内容保留 |

> 证据增强：计划 §11.6 写「未做真实浏览器 Network 面板截图（无后端运行环境）；AC-04 以静态证明」。本独立复核**已在真实浏览器用 stub API 实跑** `/portfolios` 并计数请求（AC-04 运行时验证成立），比 Implementer 自述证据更强；此为补强，不是缺陷。

**复跑记录（2026-11-06，应用户「请再测一次」要求，独立第二遍完整执行）**：

| 复跑项 | 结果 |
|---|---|
| 基线复核 | HEAD 由 `434a323` → `6e18de2`（本次 §12 结论已提交）；main 由 `96ff382` → `ca351b4`（Orchestrator 登记 066 交付/067 状态）；merge-base 仍 `96ff382`；`PortfolioCard/index.jsx` SHA256 仍 `f2704723…`（实现一字未变） |
| D-02 前提复核 | `main` 与分支 HEAD **仍无** `driftLabels.js`；066 worktree 常量文案未变，逐字一致 4/4 PASS；组件 `:4-5` TODO 注释仍在 |
| 065 不丢失复核 | `summary.js` 四字段 grep 5 处、`portfolio.summary.test.js` 345 行；`npm run test:server` **237/237**（065 无回归） |
| `npm run build --workspace client` | `✓ built in 2.80s`，exit 0 |
| `eslint "src/**/*.{js,jsx}"` | exit 0，0 error |
| 真实浏览器 `/portfolios`（Chrome + Vite + stub API，独立重建探针） | **AC-04 运行时**：portfolios 请求 **count=1**（`/api/portfolios/summary?includeArchived=false`），无新增子请求、无 pageerror，页面渲染四格与「2 条待确认 / 1 条未读」 |
| 自建浏览器探针（重建、临时、已删） | **19/19 PASS**（与首遍逐项一致，非 flaky） |
| 正确范围 / 禁改 / 零请求 / 暂无 | 与首遍一致：3 文件、无 shared/server/cron-worker、组件无 fetch/axios/useQuery、PortfolioCard 无「暂无」 |

复跑结论：**所有证据稳定复现，判定不变（Pass with issues）**。另如实记录：main 上存在 `974a3f6 docs(us-004): close TASK-067 as Completed (Merged: Pending)` 等状态登记提交，属 Orchestrator/Human 职权，**非本 Reviewer 所为**；本复核全程未改 Task Status、未标 Completed、未合入。

### 12.3 AC 逐条判定（AC-17 / AC-18）

| AC | 判定 | 独立实测证据 |
|---|---|---|
| **AC-01**（四格全从 stats 派生；US-004/AC-17） | **满足** | 真实浏览器 + 自建探针：① 总市值 `¥82,340.5 + US$1,200` 分币种并列、无跨币种合计（无 `83540`）；② 持仓资产 `3 个` = `positionCount`；③ 待办 `2 条待确认 · 1 条未读` = `pendingRebalanceCount + unreadAlertCount`；④ 上次再平衡 `2026-08-27`（`lastExecutedAt` → `YYYY-MM-DD`）、`null` → 「从未」。四格数据全部取自 `portfolio.stats`，组件无 `useQuery`/`service`/`fetch`/`axios` import |
| **AC-02**（降级态；US-004/AC-17） | **满足** | 待办 0 → 「—」（不出现 `0 条待确认/0 条未读`）；`lastExecutedAt:null` → 「从未」；空市值桶 → 「—」；`grep -rn "暂无" client/src/components/PortfolioCard/` **exit 1（0 命中）**；缺 065 字段时不崩、不显 0、显示「—」/「从未」 |
| **AC-03**（同源逐字一致 / D-01 解 B；US-004/AC-18） | **满足** | 与 066 worktree 的 `client/src/constants/driftLabels.js` 字符串级比对：`PENDING_LABELS.pendingRebalance` = `` `${count} 条待确认` ``、`unreadAlert` = `` `${count} 条未读` ``、`none: '—'`、`LAST_REBALANCE_LABELS.never: '从未'` 与组件 `:76/:78/:81/:87` **逐字一致**；「偏离」数据同源取 `stats.drift`（`DriftBadge` 仅读 `drift.needsRebalance`，`:33-35`），**维持两态**「偏离阈值 / 配置正常」，未引入四态（负向对照 NEG-1 证明） |
| **AC-04**（零新增请求；US-004/AC-17） | **满足（运行时）** | 真实 `/portfolios` 页面：portfolios 相关请求 **1** 次（既有 `/api/portfolios/summary?includeArchived=false`），无卡片二次请求；`git diff --name-only 96ff382..HEAD` 仅 `client/src/components/PortfolioCard/index.jsx` + 文档，无 `shared/`/`server/`/`cron-worker/` 改动；负向对照 NEG-3 注入额外 fetch 即 FAIL |
| D-02（driftLabels 归属 066） | **满足** | `main` 无 `client/src/constants/driftLabels.js`（`git cat-file -e` 失败）；本分支**未新建**同名文件；组件 `:4-5` 有 TODO 注释「待 B(TASK-066) 的 driftLabels.js 合入 main 后，切换为 import 共享常量；…本卡临时内联文案，绝不新建同名文件」；内联文案与 066 常量逐字一致 |
| 禁改范围 / 065 不丢失 | **满足** | 正确 diff 无 `shared/`/`server/`/`cron-worker/`；rebase 后 065 四字段与 345 行测试保留（§12.1） |

### 12.4 六点重点核对（用户指定）

1. **四格全从 stats 派生** ✅ 见 AC-01：分币种并列不合计、`positionCount`、待办两数相加、`lastExecutedAt→YYYY-MM-DD / null→从未`。
2. **降级态** ✅ 待办 0→「—」、无值→「从未」、PortfolioCard 内无「暂无」。
3. **同源逐字一致（解 B）** ✅ 待办/上次再平衡文案与 066 `driftLabels.js` 逐字一致；偏离数据同源取 `stats.drift`；`DriftBadge` 维持两态（非健康表四态）。
4. **零服务端零新增请求** ✅ 仅 `PortfolioCard/index.jsx` 改动；运行时请求数 1；无 shared/server/cron-worker 改动。
5. **D-02** ✅ main 无该文件、本卡未新建、TODO 注释声明待 B 合入后切换。
6. **rebase 后 065 字段/测试不丢失** ✅ `summary.js` 5 处命中、测试 345 行、AC 用例在。

### 12.5 负向对照记录（临时篡改 `PortfolioCard/index.jsx` → 断言 FAIL → 还原 → 验证干净）

| # | 临时缺陷 | 断言表现 | 还原 |
|---|---|---|---|
| NEG-1（AC-03） | `DriftBadge` 改四态文案（`${overThresholdCount} 项超阈` / `正常`） | `AC-03 DriftBadge 维持两态` FAIL（出现「项超阈」）；17/19 PASS | 备份还原，SHA256 回 `f2704723…` |
| NEG-2（AC-02） | 待办 0 时显示 `` `0 条待确认` `` | `AC-02 待办为 0 → 「—」` 与 `AC-02 待办不显示 0 值兜底` 2 条 FAIL；16/19 PASS | 备份还原 |
| NEG-3（AC-04） | 组件内注入 `fetch('/api/portfolios/extra-review-probe')` | `AC-04 请求数 = 1` / `无新增 /portfolios 子请求` 2 条 FAIL（count=2）；17/19 PASS | 备份还原 |

还原后重跑自建探针 **19/19 PASS**；`git status --porcelain` 空（temp 探针/夹具最终删除）。

### 12.6 Findings（编号 / 严重度 / 文件:行 / 修法）

| # | 严重度 | 位置 | 现象 | 修法方向 |
|---|---|---|---|---|
| F-01 | **MINOR** | `client/src/components/PortfolioCard/index.jsx:4-5, 76, 78, 87` | D-02 要求待 B 的 `driftLabels.js` 合入后切换为 import；当前为临时内联文案（与 066 常量逐字一致），存在两处文案源、长期可能漂移 | 066 合入 main 后按 TODO 切换为 `import { PENDING_LABELS, LAST_REBALANCE_LABELS } from '../../constants/driftLabels'` 并复跑 build/eslint；属计划已声明的临时妥协，不阻塞 |
| F-02 | **MINOR** | `client/src/components/PortfolioCard/index.jsx:57`（`formatDate`） | `formatDate` 对非法/非 ISO 字符串直接 `String(value).slice(0,10)`，若后端返回异常值会显示截断乱码而非「从未」；当前 065 契约保证 ISO/Date，未触发 | 可加 `YYYY-MM-DD` 正则校验后回退 `null`；非当前契约路径，不阻塞 |
| F-03 | **MINOR** | 页面级「暂无」文案（非本卡文件） | 真实 `/portfolios` 页面在家庭汇总为空时，`Household/CurrencyBuckets.jsx:13`、`DataState/index.jsx:6` 等**既有组件**显示「暂无资产分桶数据 / 暂无数据」；AC-02 的「DOM grep 不到暂无」按卡片降级态口径（计划 §7 限定 `client/src/components/PortfolioCard/`）已通过 | 若未来产品要求全页零「暂无」，属另卡范围；本卡未引入该文案，不阻塞 |
| F-04 | MINOR | 计划 §11.6 | Implementer 自述「未做真实浏览器 Network 面板截图，AC-04 以静态证明」；本人已用真实浏览器 + stub API 实跑补强（§12.2） | 证据增强，非缺陷 |
| F-05 | — | 分支基线 | 原 `8141275` 基于旧 main；按前置已 merge main 得 `434a323` 干净基线；若直接以旧 HEAD 合入将产生 065 内容「删除」假象 | 合入时以 rebase/merge 后基线为准（本复核已处理） |

**无 BLOCKER、无 MAJOR**。`git diff <rebase-base>..feature/TASK-067` 只含 `client/src/components/PortfolioCard/index.jsx` 纯展示改动 + 文档；无 `summary.js` 字段删除、无测试删除；既有 `drift.needsRebalance` 徽标语义未改。

### 12.7 DoD（[DEFINITION_OF_DONE.md §3](../../../../os/process/DEFINITION_OF_DONE.md) T-1～T-6）

| # | 要求 | 满足 | 证据 |
|---|---|---|---|
| T-1 实现完成 | 改动清单与 Implementing 退出物证一致 | ✅ | 相对 merge-base 仅 2 文件（组件 + plan），与计划 §10 范围一致；merge 后工作区干净 |
| T-2 验证完成 | 运行类记录实际结果 | ✅ | build exit 0 / eslint 0；真实浏览器 `/portfolios` 请求数 1；自建探针 19/19、3 条负向对照；静态检查（diff/grep/SHA256/逐字比对）记录对象与方法 |
| T-3 AC 逐条满足 | 对照任务卡 §3 | ✅ | AC-01～04（AC-17/18）逐条实测（§12.3/§12.4） |
| T-4 审查结论收敛 | 无 BLOCKER；MAJOR 整改或 Human 接受 | ✅ | 本 §12 独立判定 Pass with issues，无 BLOCKER/MAJOR，残余 MINOR 已记录 |
| T-5 文档同步 | ExecPlan 记录节已填、任务卡仅引用 | ✅ | plan §11 实施记录已填；本 §12 回填；任务卡 `TASK-067.md` 加一行结论 + 链接（REVIEWER §3） |
| T-6 已知妥协已记录 | 改动清单含「已知妥协」 | ✅ | plan §11.6（真实浏览器 Network 未截图[已被本人补强]、跳转目标属 066、B 合入后切换 import）；本 §12 F-01/F-02/F-04 复核 |

> DoD 满足 ≠ 已合入 main；`Merged`、Task Status 推进与关闭归 Human / Orchestrator（STATES.md §4）。本 Reviewer 未改 Task Status，未 `git add/commit/push`（merge main 为评审前置，已按要求执行并提交为分支上的 merge commit）。

### 12.8 残余风险与未验证项

- **未连真实后端/DB**：浏览器运行时用 stub API 注入组合数据（含 065 真值形态），验证的是请求数与渲染；未在真实 `GET /api/portfolios/summary` 上做端到端文案与 066 健康表「同一真实组合」逐字比对（计划 §11.6 已声明）。
- **D-02 临时内联**：066 的 `driftLabels.js` 尚未在 main；合入顺序（065 → 066 → 067 或 067 先）需由 Orchestrator 决定，切换 import 后须复跑 build/eslint（F-01）。
- 「待办」跳转（B9 `?sub=suggestions` / `/` 组合筛选）本卡未实现，属 066 健康表 AC-03（计划 §11.6 已声明，纯展示）。
- 页面级其他既有组件仍显示「暂无」（F-03），超出本卡口径。
- 未跑 `npm test` 全 workspace（本卡纯客户端、零后端改动；AC 未要求）。

### 12.9 判定

**Pass with issues** —— 经「评审前置 merge main 得干净基线」后独立复核：AC-01～AC-04（US-004/AC-17、AC-18）全部满足并经实跑验证：四格全从 `stats` 派生、降级态无「暂无」/不显 0、与 066 健康表待办/上次再平衡文案逐字一致且 `DriftBadge` 维持两态、真实浏览器 `/portfolios` portfolios 请求数恒为 1（零新增）、D-02 未新建 `driftLabels.js` 且 TODO 声明切回点、rebase 后 065 四字段与 156 行测试完整保留；build/eslint 全绿、禁改范围守住、3 条负向对照证明断言非恒真；DoD T-1～T-6 逐条满足。**无 BLOCKER / MAJOR**；残余 5 项 MINOR/观察（F-01 D-02 临时内联、F-02 formatDate 容错、F-03 页面级既有「暂无」、F-04 证据增强、F-05 基线说明），均不阻塞。

判定词不是状态，不构成合入许可。Task Status 仍 `Implementing`（登记 `Reviewing` 归 Orchestrator）、`Merged` 与关闭归 Human；本 Reviewer 未改状态、未自行标 Completed、未提交业务改动、未合入 main。

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
