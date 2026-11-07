# TASK-069 — US-004 实施计划

## Status

Status：Completed（2026-11-06，Task 已 `Completed`；审查 `Pass with issues`、无 BLOCKER/MAJOR。计划由 `Approved` 同步为 `Completed`）

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

**Verdict：`Pass with issues`**（2026-11-06，独立 Reviewer；**无 BLOCKER / 无 MAJOR**；3 项 MINOR 已记录、不阻塞）。AC-16（US-004）与卡内 AC-01～AC-03 逐条**满足**（判定见 §12.5）；判定不是状态、不是合入许可。本节按 [REVIEWER.md §7](../../../os/roles/REVIEWER.md) 记录；任务卡 [§12](./TASK-069.md#12-review-record) 只引用本节。

### 12.1 审查对象、基线与独立性

| 项 | 实际值 |
|---|---|
| 审查对象 | `feature/TASK-069` @ **`ba5e5e1`**（`docs(TASK-069): sync summary contract fields`，单提交） |
| 基线 | `main @ 3867298`；`git merge-base main ba5e5e1` = `3867298`；范围 `git diff main...ba5e5e1` |
| 前置 | `6f556aa`(065)/`d95be45`(067)/`6f0b4df`(068)/`3226dd4` 均 `git merge-base --is-ancestor … main` = 是 |
| 工作区 | 审查开始时 `git status --porcelain` **空**（符合前提）；审查对象为提交树，非未提交快照 |
| 环境说明 | 审查开始时工作区在 `main` @ `822ab67`（比声明基线多 1 个 Orchestrator 登记提交「register TASK-069 delivery and move to Reviewing」，属流程登记、非代码）。三点 diff 的 merge-base 仍为 `3867298`，**审查范围未受影响**；已切到 `feature/TASK-069` 后在 `ba5e5e1` 上重跑全部必做命令 |
| 独立性 | 本人**未参与** TASK-069 实现、未编写其实施/验收脚本、未参与 065/067/068 实现与验收；本次审查脚本（`negctl.cjs` / `fieldset.cjs`）由本 Reviewer 为审查独立编写，置于仓库**外**临时目录 `D:/projects/review069-tmp/`，负向对照在 `os.tmpdir()` 临时副本上突变、跑完即清理，未改任何被审业务文件 |

### 12.2 实跑证据（本 Reviewer 亲跑，不引用他人输出）

```text
$ git branch --show-current && git rev-parse HEAD
feature/TASK-069
ba5e5e166adb5b8dd34af292dc46e401b27fbdc8

$ git status --porcelain
（空输出）

$ npm run docs:check
npm notice run portomind@1.0.0 docs:check
npm notice run node scripts/check-docs.cjs
扫描 134 份文档；链接 1364 条；ERROR 0；WARN 0
[exit 0]

$ git diff --stat main...ba5e5e1 -- shared/ server/ client/ cron-worker/
（空输出 —— 零代码改动，硬性要求满足）

$ git diff --stat main...ba5e5e1
 docs/development/delivery/US-004/TASK-069-plan.md  | 148 ++++++++++++++++++++-
 .../requirements/specs/FS-portfolio-ia-cleanup.md  |   3 +-
 docs/handbook/technical/API_CONTRACT.md            |   2 +-
 3 files changed, 150 insertions(+), 3 deletions(-)
```

补充实跑：

```text
$ node scripts/check-docs.cjs --json        → "files":134, "totalLinks":1364, "errors":[], "warns":[]
$ git show 3867298 | tar -x -C <tmp>; node scripts/check-docs.cjs --root <tmp> --source-root .
扫描 134 份文档；链接 1360 条；ERROR 0；WARN 0      （独立复现基线，证实 §11.4 基线值）
$ git log --oneline main..ba5e5e1            → ba5e5e1 （唯一提交）
$ git show --stat 822ab67                    → 3 文件：BOARD / TASK-069.md / US-004 Story（流程登记，非本卡范围）
```

> 方法留痕：首次 `npm run docs:check` 是在 `main @ 822ab67` 上跑的，输出 `1361 条链接`（该提交新增了指向 TASK-069 等的链接）——**不采信为交付证据**；上表 `1364` 为切到 `ba5e5e1` 后重跑的实际输出。

### 12.3 引用证据（静态阅读，版本同上）

| 证据 | 位置 / 内容 |
|---|---|
| 代码事实 | [summary.js](../../../../shared/services/portfolio/summary.js)：`buildPortfolioSummary` 返回 `:78-84` = `positionCount, marketValueByCurrency, lastExecutedAt, pendingRebalanceCount, drift`；`computeSummary :100-110` = `$match {status:'unread', …visibleFilter}` + `$group by portfolioId` + `.filter(_id != null)`；`:151` = `unreadAlertCount: unreadByPortfolio.get(…) \|\| 0` |
| 既有查询 | `summary.js:126-132` 每组合一次 `RebalanceRecord.findOne({status:'EXECUTED'})`；`pendingRebalanceCount` 来自 `:115-123` 的 `RebalanceRecord` `$match {status:'PENDING'}` + `$group` |
| drift | `summary.js:19` `DRIFT_THRESHOLDS=['absoluteDeviation','relativeDeviation']`；`:63-75` `needsRebalance`/`triggeredThresholds` 仅绝对/相对、`dueByTime`=含 `timeInterval`、`overThresholdCount`=`details.filter(triggeredThresholds.length>0).length`；`:55` `drift===null` 条件（无目标/无持仓/缺价） |
| B16 三出口 | [alertVisibility.js](../../../../shared/services/alertVisibility.js):29-37 `visibleAlertFilter` = `$or:[{portfolioId:{$in:ids}},{portfolioId:null}]`；`summary.js:99` 与 `server/controllers/alert.controller.js:230,244` 同源 |
| 契约行 | [API_CONTRACT.md:87](../../../handbook/technical/API_CONTRACT.md)（`ba5e5e1`）与 `git show 3867298:…:87`（基线）逐字比对 |
| 需求/范围 | [TASK-069.md](./TASK-069.md) §3 AC / §4 Scope；本计划 §4 / §10 / §11；[FS §6.2 B5](../../requirements/specs/FS-portfolio-ia-cleanup.md) `:268`、§7 AC35 `:350`、状态行 `:5`、§11 `HD-15` `:435`；[US-004 §4 AC-16](../../requirements/stories/active/US-004-dashboard-portfolio-health.md) `:89`、§6 `:121`、§8 `:148` |
| 规则 | [REVIEWER.md](../../../os/roles/REVIEWER.md) §2.3 / §3 / §5 / §7；[DOCS.md](../../../os/standards/DOCS.md) 单一归属（经 AGENTS.md §3 索引） |
| 检查器局限 | [check-docs.cjs](../../../../scripts/check-docs.cjs) `:97-121` 仅校验链接目标/锚点，`:123-148` 仅校验卡片 Status 枚举与模板占位符 —— **不解析表格字段集** |

### 12.4 重点核对项逐项结论

| # | 核对项 | 结论 |
|---|---|---|
| 1 | `stats` 字段集 | **一致、无遗漏无凭空新增**：代码派生 6 项（`positionCount, marketValueByCurrency, lastExecutedAt, pendingRebalanceCount, drift, unreadAlertCount`）与 `:87` 逐字相同；`drift` 4 子字段亦一致。`fieldset.cjs` 从代码派生期望集比对：见 §12.7 |
| 2 | `unreadAlertCount` 口径 | **准确**：`status:'unread'`、按现存组合（`getVisiblePortfolioIds`，含归档、排除已删）分组、删除组合事件被 `visibleAlertFilter` 挡在计数外、资产级 `null` 组被 `.filter(_id != null)` 丢弃故「不归入任何组合计数」；「归提醒列表」对应 `GET /api/alerts/events` 另一出口。与 `alertVisibility.js` / 068 实现一致 |
| 3 | 语义陷阱 | **已避开**：`lastExecutedAt` 改为「沿用 `computeSummary` 既有的最近一条 `EXECUTED` 记录查询，不为此新增查询」，未写成「完全不查库」；`pendingRebalanceCount` 明确为「`PENDING` 的 `RebalanceRecord` 条数」，非泛称「建议数」 |
| 4 | `drift` 语义 | **正确**：显式声明 `needsRebalance`/`triggeredThresholds` 语义不变（仍仅绝对/相对）、`dueByTime` 不扩义、`overThresholdCount` 为超阈**标的数**；`drift===null` 时点名 `dueByTime` / `overThresholdCount` 两字段不可读（基线「后两字段」含糊，已消除） |
| 5 | 单一归属 | **守住**：`HD-15` 自称「本 FS 自身落地记录（非新裁决、非 AC 验收表）」，只记 B 项→任务映射并链接本计划 §11，未复制 Story 卡 §8 验收表、未写整体验收结论或状态推进 |
| 6 | 范围 | **守住**：仅 3 文件（`API_CONTRACT.md:87` / FS 状态行+`HD-15` / 本计划 §11）；`AC / Scope / Story §8 / STATES.md / 代码` 零改动；`main` 侧 `822ab67` 对任务卡 AC/Scope 的文本 diff 亦为 IDENTICAL |
| 7 | 负向对照 / 证据充分性 | **不足 → F-01（MINOR）**：见 §12.7；卡内 `docs:check` 与 `git diff --stat` 均无法发现「删字段」或「写错量纲」缺陷 |

### 12.5 AC 逐条判定

| AC | 判定 | 依据 |
|---|---|---|
| **US-004 / AC-16** | **满足（实质）** | `API_CONTRACT.md:87` 契约行已更新（补 `stats.unreadAlertCount` + 4 处措辞校正 + 语义不变/`drift===null` 两字段显式声明），Spec 状态行与 §11 `HD-15` 一致且互链本计划 §11。字面「summary **响应示例**已更新」因全文无该端点专属示例（仅 `:9-15` / `:48-54` 通用块）而不可按字面验证 → **F-02（MINOR，既有措辞问题）**；Story §8 的 AC-16 整体验收行仍「未验证」，由 PM/Human 在整体验收时更新，非本卡权限 |
| **卡内 AC-01** | **满足** | 契约行含 `lastExecutedAt`(`Date\|null`)、`pendingRebalanceCount`(整数默认 0)、`drift.dueByTime`(布尔、`timeInterval`、不扩义)、`drift.overThresholdCount`(整数、标的数、`drift===null` 不可读)，并注明 `needsRebalance`/`triggeredThresholds` 语义不变；`unreadAlertCount` 按 B16 口径补齐。任务卡 AC-01 的「（及响应示例，若有）」经全 `docs/` 检索成立（无示例可同步，§11.2 已如实记录）。字段集/语义由本 Reviewer 独立机读对账复核（§12.7），不依赖 Implementer 自撰清单 |
| **卡内 AC-02** | **满足（有保留）** | Spec 状态行 + `HD-15` 与实施结果一致、单一归属守住、未复制 Story §8；但「记录 `TASK-065～069` 落地情况」未含 066（B6~B13）且以「交付单元 B 落地记录」全称冠名 → **F-03（MINOR）** |
| **卡内 AC-03** | **满足** | 亲跑 `npm run docs:check` = `134 文档 / 1364 链接 / ERROR 0 / WARN 0`（exit 0）；`--json` 复核 `errors:[] warns:[]`；链接数与基线 `1360` 的 +4 可归因（Spec `HD-15` 3 条 + 计划 §11.1 1 条）。但该检查内容盲 → **F-01（MINOR）** |

### 12.6 Findings

| # | 严重度 | 文件:行 | 现象 | 修法方向 |
|---|---|---|---|---|
| **F-01** | **MINOR** | [TASK-069-plan.md](./TASK-069-plan.md) §11.2 / §11.4；[check-docs.cjs](../../../../scripts/check-docs.cjs):97-148 | **证据不足（负向对照）**：卡内唯一可执行验证 `npm run docs:check` 只校验链接与 Status 枚举，`git diff --stat` 只看文件名/行数，二者都**不检查契约行内容**。独立负向对照（§12.7 NC1/NC2）证明：删掉 `stats.unreadAlertCount`、把 `overThresholdCount` 写成「阈值类型数」，`docs:check` 仍 `ERROR 0 / WARN 0 / exit 0`。故「字段集完整、语义正确」在交付证据包里仅由 Implementer 自撰的 §11.2 静态清单支撑，缺可证伪断言；该缺陷**不能被本卡证据发现**（[REVIEWER.md §2.3](../../../os/roles/REVIEWER.md)）。本次复核已由本 Reviewer 以 `fieldset.cjs` 独立补验（PASS/FAIL），故不阻塞判定，但证据包本身应补强 | 在 §11 补一条**从代码派生期望字段集 → 与契约行机读比对**的断言，并留一条「删字段即 FAIL」的负向对照记录；或由 Orchestrator/PM 约定此类纯文档任务由复核方独立机读对账并留痕。不要求改业务文档 |
| **F-02** | **MINOR** | [US-004 §4 AC-16](../../requirements/stories/active/US-004-dashboard-portfolio-health.md):89；[FS §7 AC35](../../requirements/specs/FS-portfolio-ia-cleanup.md):350；[TASK-069.md](./TASK-069.md):30 | **AC 字面口径不可满足**：Story AC-16 / FS AC35 均写「`API_CONTRACT.md` 的 summary **响应示例**已更新」，但全文仅 `:9-15` 通用成功响应、`:48-54` 错误响应两个 JSON 块，无 `GET /api/portfolios/summary` 专属响应示例；全 `docs/` 检索亦无。交付把字段集落在端点表 `:87` 行，任务卡 AC-01 以「若有」对冲。属 Story/FS 既有措辞与文档结构不符，**非本卡引入**（本卡未改 AC） | 归 PM：把 AC-16/AC35 的「响应示例」改为「契约行 / 字段集」，或另立范围补端点响应示例。本卡不据此判不满足（任务卡 AC 已含「若有」，端点行已实质同步） |
| **F-03** | **MINOR** | [FS 状态行](../../requirements/specs/FS-portfolio-ia-cleanup.md):5、§11 `HD-15`:435；[TASK-069.md](./TASK-069.md):31（AC-02） | **落地记录不完整 / 范围措辞落差**：(a) AC-02 要求「记录 `TASK-065～069` 落地情况」，状态行与 `HD-15` 仅列 065/067/068/069 与 `B1~B4/B15/B16/B5`，未记已合入的 066（`af1f4d2`，B6~B13）与 B6~B14，却冠名「交付单元 B **落地记录**」，名实不符；(b) FS §6.2 B5(`:268`) 把 `handbook/ops/SERVER.md` 相关一行列入 B5，但 SERVER.md 无 `/portfolios/summary` 专属行（仅 `:48`、`/api/portfolios` 与 `:101` execute），任务卡 §4 / 计划 §4、§10 亦未纳入，交付未动它 —— FS 与任务卡之间的既有范围措辞落差 | 归 PM/Planner：把状态行措辞收窄为「与 B5 契约字段相关的落地记录」，或补记 066 并注明详情归 Story §8（勿复制验收表）；澄清 B5 是否仍含 SERVER.md（若无对应行则改 FS 措辞或补该行，须另立范围）。本卡按任务卡 §4 执行、未越界，不据此判 AC-02 不满足 |

> 无 BLOCKER / MAJOR：契约与代码逐字段一致、零代码改动、范围与单一归属均守住、AC 无被改写、无 Status/Completed/Merged 越权。三项均为记录层 MINOR，`Pass with issues` 成立（[REVIEWER.md §5.1](../../../os/roles/REVIEWER.md)）。

### 12.7 负向对照记录（临时副本，不改被审文件）

按 [REVIEWER.md §2.3](../../../os/roles/REVIEWER.md)：在 `os.tmpdir()` 的 `docs/` 副本上突变 → 跑 `check-docs.cjs --root <tmp> --source-root .` → 清理；仓库业务文件零改动。

```text
NC0 unmodified copy        exit=0  扫描 134 份文档；链接 1364 条；ERROR 0；WARN 0
NC1 mutation applied (removed stats.unreadAlertCount from field set) = true
NC1 field removed          exit=0  扫描 134 份文档；链接 1364 条；ERROR 0；WARN 0   ← 缺陷未被发现
NC2 mutation applied (overThresholdCount -> 阈值类型数) = true
NC2 semantic corrupted     exit=0  扫描 134 份文档；链接 1364 条；ERROR 0；WARN 0   ← 缺陷未被发现
temp copy cleaned = true
```

补充**可证伪的独立字段集断言**（`fieldset.cjs`：从 `summary.js` 的返回/展开式派生期望键集，再与给定契约行比对，不采信 §11.2 清单）：

```text
A) 交付 ba5e5e1
code-derived expected : ["drift","lastExecutedAt","marketValueByCurrency","pendingRebalanceCount","positionCount","unreadAlertCount"]
contract-written      : ["drift","lastExecutedAt","marketValueByCurrency","pendingRebalanceCount","positionCount","unreadAlertCount"]
FIELDSET MATCH        : PASS   (exit 0)

B) 基线 3867298 的契约行（同一期望集）
contract-written      : ["drift","lastExecutedAt","marketValueByCurrency","pendingRebalanceCount","positionCount"]
FIELDSET MATCH        : FAIL   (exit 1)   ← 断言能失败，非恒真
```

即：AC-01 的字段集结论经本 Reviewer 独立、可证伪地复核成立；但同一缺陷在**卡内**证据（docs:check）下不可发现 → F-01。

### 12.8 残余风险 / 未验证项

- **未做运行时验证**：纯文档任务，未连真实后端/DB 调用 `GET /api/portfolios/summary`；字段事实来自亲读 `summary.js` 及依赖（静态对账），与 §11.8 声明一致，不冒充运行证据。065/068 的既有运行时/测试证据按 [REVIEWER.md §4](../../../os/roles/REVIEWER.md) 复用，未重复跑。
- **响应示例**：全文无该端点专属示例（§12.6 F-02），`API_CONTRACT.md` 的字段集与语义全部落在 `:87` 单行；若将来新增响应示例，需与契约行同步维护。
- **审查记录写入后的工作区**：本记录与任务卡 §12 写入后 `git status --porcelain` 会出现 2 个未提交改动（计划 §12 / 任务卡 §12）。**Reviewer 不 `git add` / `commit` / `push`**；是否随分支保留、由谁提交，归 Orchestrator / Human。
- **Story 整体验收**：US-004 §8 的 AC-16 行仍标「未验证」，整体验收结论、Story 状态推进、`Merged` 登记与关闭归 PM / Human；本判定不替代、不预填。

### 12.9 判定与边界

- **Verdict：`Pass with issues`**；US-004/AC-16 与 AC-01～AC-03 逐条满足；BLOCKER 0 / MAJOR 0 / MINOR 3（F-01～F-03，均已记录，不阻塞）。
- 判定词**不是状态**：未改 Task Status、未标 `Completed`、未改 AC / Scope / 已批准设计、未写 `Merged`、未合入 `main`、未 `git add` / `commit` / `push`；MINOR 的整改与关闭归 Orchestrator / PM / Human。
- 本记录按 [REVIEWER.md §3](../../../os/roles/REVIEWER.md) 写入计划 §12（唯一存放处），任务卡 [§12](./TASK-069.md#12-review-record) 仅一行结论与链接。

## 13. Completion Record

**结案（2026-11-06）**

| 项 | 事实 |
|---|---|
| 覆盖 AC | US-004 / AC-16（实质满足）；卡内 AC-01～AC-03 逐条满足（§12.5） |
| 实现 | `ba5e5e1`：`API_CONTRACT.md:87` 补 `stats.unreadAlertCount`（B16 口径）+ 校正 4 处措辞 + 显式声明 `needsRebalance`/`triggeredThresholds` 语义不变、`drift===null` 时两字段不可读；`FS-portfolio-ia-cleanup.md` 状态行补交付单元 B 落地记录、§11 补 `HD-15` |
| 审查 | 独立 Reviewer **`Pass with issues`**（§12，`2ceeb88`）：BLOCKER 0 / MAJOR 0 / MINOR 3 |
| 残余 MINOR | **F-01** 交付证据不足（`docs:check` 只校验链接与 Status，无法发现字段缺失/量纲错误；Reviewer 已用 `fieldset.cjs` 独立补验）→ 建议后续补「从代码派生期望字段集 → 与契约行机读比对」断言；**F-02** AC-16/AC35 字面写「响应示例」但全文无该端点示例（既有措辞问题，归 PM 改口径）；**F-03** FS 状态行「交付单元 B 落地记录」未列 066/B6~B14、且 B5 是否含 `SERVER.md` 存疑（归 PM/Planner 收窄措辞或另立范围） |
| 验证 | `npm run docs:check` = **134 文档 / 1364 链接 / ERROR 0 / WARN 0**（Implementer 与 Reviewer 各自亲跑一致）；`git diff --stat -- shared/ server/ client/ cron-worker/` **空**（零代码改动） |
| 关闭依据 | Human 2026-11-06 确认检验通过；按 [STATES.md §4](../../../os/process/STATES.md#4-谁可以改变状态) 登记 `Reviewing → Completed` |
| 合入 | **已合入（2026-11-06）**：**PR #43** → `d42a1bb` `Merge pull request #43 from tongweizj/feature/TASK-069`（分支 tip `a93c90b` 已是 `main` 祖先）；`Merged` = `d42a1bb` |

## 自检

- [x] Task 与批准依据对应，方案未改变需求。
- [x] 步骤可执行、依赖明确、AC 有验证方法。
- [x] 记录可追溯且只存一处，编号与相对链接正确。
