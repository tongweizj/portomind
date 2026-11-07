# TASK-069 — US-004 实施计划

## Status

Status：Approved（2026-11-06，Human 批准当前设计：`Draft → Approved`）

Owner：Planner（规划）→ 待 Orchestrator 登记并指派 Implementer

Related Task：[TASK-069](./TASK-069.md)；所属 [US-004](../../requirements/stories/active/US-004-dashboard-portfolio-health.md)。

Branch / Base：`feature/TASK-069`，从 up-to-date `main` 新建（实施期基线 `main` @ `281b425`；065/066/067/068 均已合入）。纯文档同步，单提交即可，无需独立 worktree。

Approval：**已批准（2026-11-06，Human）**。覆盖 §1～§9 当前设计；批准记录为 Human 2026-11-06「批准 069 计划」原话，按 [STATES.md](../../../os/process/STATES.md) §4 `Draft → Approved` 归 Human。注意：本卡 Task 卡原标注「免计划」，因 Human 明确要求「逐一为每个 task 编写 execplan」，本计划据此编制。

## 1. Intent

任务需求与 AC 唯一来源为关联 Task [TASK-069](./TASK-069.md) 的 §3；覆盖 US-004/AC-16。本卡同步 `API_CONTRACT.md` 的 summary 端点字段集，并使 Spec 状态行与 §11 记录与实施一致。

## 2. Context

需求、任务见 [Story US-004 §3](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) 与 [FS §6.2 B5、§7 AC35](../../requirements/specs/FS-portfolio-ia-cleanup.md)。纯文档同步，无代码变更。

## 3. Repository Findings（2026-11-05 亲读）

| # | 事实 | 出处 |
|---|---|---|
| F-01 | `API_CONTRACT.md:87` summary 端点 `stats` 仍写 `{positionCount, marketValueByCurrency, drift}`，未含四字段 | `docs/handbook/technical/API_CONTRACT.md:87` |
| F-02 | Spec 状态行 `Approved`（`:5`），§11 已含 `HD-10`~`HD-14`（含 `B15`/`B16`），实施完成后需同步状态行与 §11 记录一致 | `FS-portfolio-ia-cleanup.md:5`、`:417-434` |

## 4. Proposed Design

1. **`API_CONTRACT.md:87`** 的 `GET /api/portfolios/summary` 行更新 `stats` 字段集为：
   `{positionCount, marketValueByCurrency, drift:{needsRebalance, triggeredThresholds, dueByTime, overThresholdCount}, lastExecutedAt, pendingRebalanceCount, unreadAlertCount}`，并注明：
   - `lastExecutedAt`：`Date | null`（无记录为 null）；
   - `pendingRebalanceCount`：整数（PENDING 的 RebalanceRecord 条数，默认 0）；
   - `drift.dueByTime`：布尔（timeInterval 是否触发）；`drift.overThresholdCount`：整数（超阈标的数）；`drift === null` 时后两者不可读；
   - `needsRebalance`/`triggeredThresholds` 语义不变（仍仅绝对/相对偏离）。
   - 响应示例（若有）同步补字段。
2. **`FS-portfolio-ia-cleanup.md`**：状态行与 §11 记录同步（记 TASK-065～TASK-069 落地情况；§11 为裁决记录，实施状态一般记在 Story 卡而非 Spec 裁决表，按 [DOCS.md](../../../os/standards/DOCS.md) 单一归属原则，仅当 Spec 明确要求「状态行与 §11 一致」时补记，避免重复）。

## 5. Work Breakdown

- [ ] W1：更新 `API_CONTRACT.md:87` 字段集与语义说明（含响应示例）。
- [ ] W2：核对 Spec 状态行是否需要同步（避免与 Story 卡 §8 重复记录）。
- [ ] W3：`npm run docs:check` 0 ERROR。

## 6. Decisions

无待 Human 新决事项。

## 7. Verification

| Task AC | 验证方法 | 预期结果 |
|---|---|---|
| AC-01（字段集） | 检查 `API_CONTRACT.md` summary 行 | 含四字段及语义说明、`needsRebalance` 语义不变注明 |
| AC-02（Spec 状态一致） | 检查 Spec 状态行/§11 | 与实施结果一致（避免与 Story 卡重复） |
| AC-03（docs:check） | `npm run docs:check` | 0 ERROR |

命令入口见 [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md) 与 [DOCS.md §5](../../../os/standards/DOCS.md)。

## 8. Risks

无（纯文档同步）。唯一注意：避免与 Story 卡 §8 验收记录重复（DOCS.md 单一归属原则）。

## 9. Rollback

纯文档，回退 = `git revert`，无数据影响。

## 10. Implementer Handoff

- **输入**：本计划 §4 + [TASK-069](./TASK-069.md) §3 AC + TASK-065 实际字段形状。
- **范围与禁改**：只改 `docs/handbook/technical/API_CONTRACT.md`（+ 按需 Spec 状态行）；**禁改**任何代码。
- **授权**：须 Human 批准本计划后实施。
- **依赖**：前置 TASK-065（字段契约落定）与 TASK-068（若改 summary 查询层）。
- **预期产出**：契约文档字段集同步 + docs:check 0 ERROR。
- **验证入口**：`npm run docs:check`。

## 11. Implementation Record

**状态：** 实施完成（2026-11-06，Implementer）。Task Status 保持 `Implementing`（未改 `Reviewing`/`Completed`；登记归 Orchestrator，关闭归 Human）；计划 Status 保持 `Approved`；未改 AC / Scope / 已批准设计。纯文档、零代码改动。

### 11.1 环境

| 项 | 实际值 |
|---|---|
| Worktree | `D:\projects\portomind`（主工作区） |
| Branch / Base | `feature/TASK-069` / `main @ 3867298`（授权基线；`origin/main = af1f4d2`，本地 `main` 领先 2 个 069 规划/批准文档提交） |
| 验证命令入口 | [DEPLOYMENT.md §7](../../../handbook/ops/DEPLOYMENT.md)（不在本卡复制命令） |
| 目标文件 | `docs/handbook/technical/API_CONTRACT.md`、`docs/development/requirements/specs/FS-portfolio-ia-cleanup.md`、本计划 §11 |
| 禁用面 | 未改 `shared/`、`server/`、`client/`、`cron-worker/`、`STATES.md`、Story 卡 §8、AC / Scope、Task Status、Reviewer 结论、BOARDB/`Merged` |

### 11.2 逐字段比对清单（`shared/services/portfolio/summary.js` @ `3867298` vs 契约行）

比对方法：亲读 `summary.js:26-85`（`buildPortfolioSummary` 返回值）、`:93-154`（`computeSummary` 编排与 `unreadAlertCount` 聚合）、`alertVisibility.js`（`visibleAlertFilter`）、`thresholdChecker.js:17-76`（`evaluateThresholds` 返回形态），与 `API_CONTRACT.md:87` 原契约行逐字段对账；并核对 `git show 5f807a3` 与 `git show 3226dd4` 确认字段来源。

**清单 A — 已有且描述正确（保持，未改）**

| 字段 | 代码依据 | 契约现状 |
|---|---|---|
| `stats.positionCount` | `summary.js:34`（`positions.length`） | 字段集已列 |
| `stats.marketValueByCurrency` | `summary.js:37-50`（按币种分桶；缺价桶 `null`） | 字段集已列，语义说明正确 |
| `drift.needsRebalance` | `summary.js:67`（仅绝对/相对过滤后触发） | 已列，语义不变 |
| `drift.triggeredThresholds` | `summary.js:63-68` | 已列，语义不变 |
| `drift === null` 条件 | `summary.js:55`（无目标 / 无持仓 / 缺价） | 已注明 |
| 市值不跨币种合计 | `summary.js:45-50` | 已注明 |
| `includeArchived` 默认排除 | `summary.js:94` | 已注明 |

**清单 B — 缺失（本次补齐）**

| 字段 | 代码依据 | 处置 |
|---|---|---|
| `stats.unreadAlertCount` | `summary.js:96-110`（`$match {status:'unread', ...visibleFilter}` + `$group by portfolioId`，过滤 `_id:null`）+ `:151`（`unreadByPortfolio.get(...) \|\| 0`） | 契约行字段集补入，并注明：整数、默认 0、按现存组合分组；删除组合后其事件不计入；资产级 `portfolioId:null` 事件归提醒列表但不归入任何组合计数（B16 口径，与 `alertVisibility.js` 一致） |

**清单 C — 描述不符（本次校正，均为文档层可解决的措辞偏差，无契约↔代码冲突）**

| 字段 | 原契约措辞 | 代码事实 | 校正 |
|---|---|---|---|
| `lastExecutedAt` | 「`Date\|null`，直接回传入参，不额外查询」 | `computeSummary:126-132` 确有既有 `findOne(EXECUTED)` 查询（每组合一次，TASK-065 前已有）；`buildPortfolioSummary` 只是把查询结果作为入参回传。措辞易误读为「完全不查库」 | 改为「`Date\|null`，无记录为 `null`；沿用 `computeSummary` 既有的最近一条 `EXECUTED` 记录查询，不为此新增查询」 |
| `pendingRebalanceCount` | 「`PENDING` 建议数（整数，默认 0，一次批量聚合）」 | `summary.js:115-123` 按 `status:'PENDING'` 的 `RebalanceRecord` 分组计数（非「建议」泛称） | 明确为「该组合 `PENDING` 的 `RebalanceRecord` 条数」 |
| `drift.dueByTime` | 「`timeInterval` 是否触发但不扩义 `needsRebalance`」 | `summary.js:70`（`result.triggeredThresholds.includes('timeInterval')`）；`DRIFT_THRESHOLDS` 仍过滤掉 `timeInterval` | 保留并补「`needsRebalance` / `triggeredThresholds` 语义不变（仍仅绝对/相对偏离）」显式声明，不扩义 |
| `drift.overThresholdCount` | 「超阈**标的数**（非阈值类型数）」 | `summary.js:72-74`（`details.filter(d => d.triggeredThresholds.length > 0).length`） | 确认表述正确，保留；把「后两字段不可读」明确为 `dueByTime` / `overThresholdCount` |
| `drift === null` 时字段可读性 | 「后两字段不可读」 | 同上 | 明确点名两字段 |

> 未发现契约与代码冲突到「必须改代码才能一致」的情形；全部偏差均可在文档层校正，无需停止上报。
>
> **响应示例**：`API_CONTRACT.md` 全文仅有「通用成功响应」（`:9-15`）与「错误响应」（`:48-54`）两个 JSON 块，无 `GET /api/portfolios/summary` 专属响应示例；全 `docs/` 检索亦无该端点的响应示例。故「同步响应示例」为「不存在，无需同步」，字段集与语义说明全部落在唯一的契约行（`:87`）。

### 11.3 改动文件（单提交）

| 文件 | 变化 |
|---|---|
| `docs/handbook/technical/API_CONTRACT.md` | `GET /api/portfolios/summary` 行：`stats` 字段集补 `unreadAlertCount`；按清单 C 校正 4 处措辞；补充 `needsRebalance`/`triggeredThresholds` 语义不变与 `drift===null` 时两字段不可读的显式声明 |
| `docs/development/requirements/specs/FS-portfolio-ia-cleanup.md` | 状态行补「2026-11-06 交付单元 B 落地记录」（`TASK-065/067/068` 合入 + `B5` 由 069 完成）；§11 补 `HD-15`（本 FS 自身落地记录，链接到本计划 §11，不复制 Story 卡 §8 验收表） |
| `docs/development/delivery/US-004/TASK-069-plan.md` | 本 §11 实施记录（唯一存放处） |

### 11.4 验证实际输出

**最终验证（全部 3 个文件改动落盘后，同命令同工作区）：**

```text
$ npm run docs:check
扫描 134 份文档；链接 1364 条；ERROR 0；WARN 0
```

```text
$ git diff --stat -- shared/ server/ client/ cron-worker/
（空输出 —— 零代码改动）
```

```text
$ git diff --stat
 docs/development/delivery/US-004/TASK-069-plan.md             | 94 +++++++++++++++++++++-
 docs/development/requirements/specs/FS-portfolio-ia-cleanup.md |  3 ++-
 docs/handbook/technical/API_CONTRACT.md                        |  2 +-
 3 files changed, 96 insertions(+), 3 deletions(-)
```

- 基线（改动前，`main @ 3867298`）：`扫描 134 份文档；链接 1360 条；ERROR 0；WARN 0`。
- 中间态（仅 2 个文档文件改动、§11 尚未写入）：`1363 条；ERROR 0；WARN 0`。
- 最终态（§11 写入后）文档数同为 **134**（未新增文档）；链接数 **1360 → 1364**（+4 = Spec §11 `HD-15` 的 3 条相对链接 + 本计划 §11.1 的 1 条 `DEPLOYMENT.md` 链接），全部可解析，ERROR/WARN 均 0。
- 零代码改动证据：`git diff --stat -- shared/ server/ client/ cron-worker/` 空输出；`git diff --stat` 全量确认仅 3 个文档文件变更，均为允许范围内文件。

### 11.5 AC-01～AC-03 对照

| AC | 结果 | 证据 |
|---|---|---|
| AC-01（`API_CONTRACT.md` summary 行字段集与语义） | **满足** | 契约行现含 `stats.{positionCount, marketValueByCurrency, lastExecutedAt, pendingRebalanceCount, drift, unreadAlertCount}`；`lastExecutedAt` `Date\|null`、`pendingRebalanceCount` 整数默认 0、`drift.dueByTime`（`timeInterval` 触发、不扩义）、`drift.overThresholdCount`（超阈标的数）、`drift===null` 时两字段不可读、`needsRebalance`/`triggeredThresholds` 语义不变——均有显式文字；`unreadAlertCount` 补 B16 口径。无专属响应示例可同步（见 §11.2 注） |
| AC-02（Spec 状态行与 §11 与实施结果一致） | **满足** | 状态行补交付单元 B 落地记录；§11 `HD-15` 仅记本 FS 应有的落地事实并链接本计划 §11，未复制 Story 卡 §8 验收表（DOCS.md §2 单一归属） |
| AC-03（`npm run docs:check` 0 ERROR） | **满足** | 见 §11.4 最终实际输出：134 文档 / 1364 链接 / **ERROR 0** / WARN 0 |

### 11.6 提交与推送记录

| 项 | 实际值 |
|---|---|
| 提交 | 单提交 `docs(TASK-069): sync summary contract fields`（3 文件：契约行 / Spec 状态行+§11 / 本计划 §11）。提交 SHA 以 `git log -1 --oneline` / PR 页面为准（实施记录写在本提交内，不内嵌自身 SHA 以免自引用漂移） |
| 分支 | `feature/TASK-069`，基于 `main @ 3867298` |
| 推送 | `git push -u origin feature/TASK-069` **成功**（`* [new branch] feature/TASK-069 -> feature/TASK-069`）；`origin/feature/TASK-069` 已建立跟踪 |
| PR 创建 | **未完成**：本机无 `gh` / `hub` CLI、无 GitHub API token（Windows 凭据管理器 / 环境变量 / `git credential fill` 均无 github.com HTTPS 凭据）、匿名 `POST /repos/tongweizj/portomind/pulls` 返回 `401 Requires authentication`；SSH 密钥仅具 git 读写权限，不能用于 REST API。分支已推送，GitHub 返回的建 PR 入口：`https://github.com/tongweizj/portomind/pull/new/feature/TASK-069` |
| 待 Human 操作 | 在 GitHub Web 界面以 `base: main` / `compare: feature/TASK-069` 创建 PR，标题与正文用 §11.7 的完整描述；创建后回填 PR 编号/链接。Implementer 不伪报 PR 已建、不自行合入 `main` |

### 11.7 PR 描述（供 Human 建 PR 时直接使用）

> **标题**：`docs(TASK-069): sync summary contract fields`
>
> **Base / Compare**：`main` ← `feature/TASK-069`（单提交；前置 065 `6f556aa` / 068 `6f0b4df` 已在 `main`）
>
> **正文**：
>
> 纯文档变更（US-004 / AC-16、FS §6.2 B5 / §7 AC35），零代码改动。逐字段比对 `shared/services/portfolio/summary.js` 与契约行后，最小化同步 `GET /api/portfolios/summary`：
> - 补 `stats.unreadAlertCount`：整数、默认 0、按现存组合分组；删除组合后其事件不计入；资产级 `portfolioId:null` 事件归提醒列表但不归入任何组合计数（B16 口径）。
> - 校正 `lastExecutedAt`（`Date|null`，无记录 `null`，沿用既有 `EXECUTED` 查询、不新增查询）、`pendingRebalanceCount`（`RebalanceRecord` `PENDING` 条数）、`drift.dueByTime`（`timeInterval` 触发、不扩义）、`drift.overThresholdCount`（超阈标的数）、`drift===null` 时两字段不可读；注明 `needsRebalance`/`triggeredThresholds` 语义不变。
> - Spec 状态行 / §11 补本 FS 自身落地记录（`HD-15`），实施证据唯一记在 `TASK-069-plan.md` §11，不复制 Story 卡 §8 验收表（DOCS.md §2 单一归属）。
> - `API_CONTRACT.md` 无该端点专属响应示例（仅通用成功/错误 JSON 块），故无示例可同步。
>
> **AC 对照（TASK-069 §3）**：
>
> | AC | 结果 | 证据 |
> |---|---|---|
> | AC-01 契约行字段集与语义 | 满足 | `API_CONTRACT.md:87` 见 §11.2 三张清单与 §11.3；`unreadAlertCount` 补齐、4 处措辞校正、语义不变与 `drift===null` 显式声明 |
> | AC-02 Spec 状态行 / §11 一致 | 满足 | `FS-portfolio-ia-cleanup.md` 状态行 + `HD-15`；不重复 Story §8 |
> | AC-03 `npm run docs:check` 0 ERROR | 满足 | `扫描 134 份文档；链接 1364 条；ERROR 0；WARN 0` |
>
> **验证输出（实际运行）**：
> ```text
> $ npm run docs:check
> 扫描 134 份文档；链接 1364 条；ERROR 0；WARN 0
>
> $ git diff --stat -- shared/ server/ client/ cron-worker/
> （空输出 —— 零代码改动）
>
> $ git diff --stat
>  docs/development/delivery/US-004/TASK-069-plan.md             | 98 +++++++++++++++++++++-
>  docs/development/requirements/specs/FS-portfolio-ia-cleanup.md |  3 ++-
>  docs/handbook/technical/API_CONTRACT.md                        |  2 +-
>  3 files changed, 100 insertions(+), 3 deletions(-)
> ```
> 基线 `main @ 3867298` 同命令输出：`134 份文档 / 1360 条链接 / ERROR 0 / WARN 0`；提交前后文档数不变，链接 +4（Spec §11 的 3 条 + 计划 §11.1 的 1 条），全部可解析。
>
> **边界**：未改 AC / Scope / 已批准设计 / 任何代码 / `STATES.md` / Story 卡 §8；未改 Task Status、未写 Reviewer 结论、未填 `Merged`、未合入 `main`（归 Human）。纯文档变更可按 REVIEWER.md §5.3 由未参与实现的 Human 直接独立复核。

### 11.8 未验证项与边界

- **未做运行时行为验证**：本任务为纯文档同步，未连真实后端/DB 调用 `GET /api/portfolios/summary`；字段事实来自亲读 `shared/services/portfolio/summary.js` 与其依赖（静态对账），未重复 TASK-065/068 已有的运行时/测试证据（按证据复用原则）。§11.2 的三张清单为静态比对结论，不冒充运行证据。
- **未改 Story 卡 §8 验收表**：AC-16 的整体验收结论、Story 状态、`Merged` 登记均归 PM / Human / Orchestrator，本卡不写 Reviewer 结论、不填 `Merged`、不自行合入 `main`。
- **PR 未创建**：见 §11.6，受限于无 GitHub API 凭据；分支已推送、描述已备好，待 Human 在 Web 界面创建并回填。
- **计划 §12/§13 未填**：审查记录与完成记录归独立复核 / Human 收尾，Implementer 不预填。

## 12. Review Record

（按 [REVIEWER.md](../../../os/roles/REVIEWER.md) §7 记录；极小文档变更可由 Human 直接独立复核，条件见其 §5.3。）

## 13. Completion Record

（AC 与验证证据引用、关闭依据、归档与移交。）

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
