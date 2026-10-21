# Tasks

## Active

> **无活跃任务。** `TASK-048` 已于 2026-10-20 评审通过并由 Human 验收结案（见 Done 表）；`TASK-050` 的两项硬前置（`TASK-049` / `TASK-048`）**均已解除**，但尚未启动。
>
> 分支：`feature/TASK-048-family-dividend-label`（自 `feature/TASK-049` 顶端 `56c6507` 拉出，**改动未提交**）。
>
> ⚠️ **分支提醒**：`main` 停在 `891d0f7`，不含 `TASK-044` / `TASK-048` / `TASK-049`；`feature/TASK-050` 也是从 `main` 拉出的空基线，启动前须重建（rebase 到 `feature/TASK-048` 之上）。

## Backlog

> 已立项但**不排期**。启动前需 Human 重新确认优先级。

| ID | Task | Priority | 说明 | Spec |
|---|---|---|---|---|
| TASK-045 | 交易流水查询与筛选 | Medium | 由 TASK-044 的 OQ1 拆出，本次不做；需动 `server/` + `shared/` 且可能新增索引 | `docs/product/specs/FS-transaction-query-filters.md` |
| TASK-046 | CSV 二次导入未去重（幂等失效） | High | **根因已定位**：`transaction.service.js:233` 的 `select()` 漏 `portfolioId`，库内比对键恒为 `undefined\|...`，永不命中 → `skipped` 恒 0；既有测试 mock 无视投影故全绿。修 1 行 + 修测试 | `docs/tasks/active/TASK-046-csv-import-dedup.md` |
| TASK-047 | TASK-044 审查遗留整改（M-1/M-2/M-5/M-6） | High | **M-2 已定方案②（2026-10-19 Human 裁决）**：URL 组合 id 与交易归属不符时**静默迁移归属**，后端 `updateTransaction` 亦接受改写 → **后端拒绝改写 `portfolioId`**（放开 `shared/`，仅限该守卫）+ 前端报错。另含导航无高亮回归（M-1）、E2E 恒真断言（M-5）、路由脚本复制表（M-6）。M-3 已拆出 TASK-048（✅ 2026-10-20 已完成结案）；M-4 文档索引已闭环。**唯一阻塞：待 Planner 产出 ExecPlan** | `docs/tasks/active/TASK-047-review-followups.md` |

## Blocked

| ID | Task | Reason |
|---|---|---|
| TASK-050 | 组合列表页承接家庭五区块，`/family` 下线 | ✅ **两项硬前置均已解除**：① `TASK-049`（2026-10-19 完成，总资产卡已在 `/`）；② `TASK-048`（2026-10-20 完成，`TRANSACTION_ACTION_LABELS` 单一导出就位，AC16 可直接复用）。需求已起草（FS 交付单元 G2 / R8–R18 / AC9–AC20）。⚠️ **仍未启动的两个原因**：现 `feature/TASK-050` 从 `main` 拉出，缺 `TASK-044`+`TASK-048`+`TASK-049` 改动，须先 rebase；且需 Planner 产出 `Approved` ExecPlan（`D-3`） |

## Done

| ID | Task | Completed | 产出 |
|---|---|---|---|
| TASK-048 | Family 页分红类交易标签修正（M-3） | 2026-10-20 | **改动未提交**（`feature/TASK-048-family-dividend-label` 工作树，4 源文件）；任务卡 [`complete/TASK-048`](./complete/TASK-048-family-dividend-label.md)；ExecPlan [`complete/TASK-048`](../exec-plans/complete/TASK-048-family-dividend-label.md)。沉淀：`constants/enums.js` 的 `TRANSACTION_ACTION_LABELS` 成为全仓唯一派生（3 处 → 1 处），`TASK-050` 的 AC16 直接复用。遗留：**F-6/R-2** 任务卡 §1 与 AC1 措辞为恒真断言，待 Human 改写；`N-2` 两处表单 `<option>` 硬编码待 `TASK-050` 后收敛 |
| TASK-049 | Dashboard 承接家庭总资产卡 | 2026-10-19 | 提交 `69576ad` + `56c6507`（`feature/TASK-049-dashboard-household-total`，**未合入 `main`**）；任务卡 [`complete/TASK-049`](./complete/TASK-049-dashboard-household-total.md)；ExecPlan [`complete/TASK-049`](../exec-plans/complete/TASK-049-dashboard-household-total.md)。遗留：`R-2` 顶栏铃铛 `title="提醒中心"` 名实不符 → 并入 `TASK-047`/`TASK-050` |
| TASK-044 | 交易记录收拢进组合管理 | 2026-10-19 | 提交 `30dc525`；任务卡 [`complete/TASK-044`](./complete/TASK-044-transaction-consolidation.md)；ExecPlan [`complete/TASK-044`](../exec-plans/complete/TASK-044-transaction-consolidation.md) |
| TASK-043 | 标的频道合并（资产管理 + 价格） | 2026-10-19 | 提交 `891d0f7`（2026-10-18）；任务卡 [`complete/TASK-043`](./complete/TASK-043-asset-price-consolidation.md)；ExecPlan [`complete/TASK-043`](../exec-plans/complete/TASK-043-asset-price-consolidation.md)。遗留：FS 的 R6/验收标准措辞待 PM/Human 同步为新口径（§11 Final Notes） |

---

## Roadmap

1. 将资产管理和价格，合并。—— ✅ TASK-043
2. 将交易记录，收拢进组合管理 —— ✅ TASK-044
3. 家庭视图，融入进 dashboard —— 🔄 **拆分式搬迁（非整页合并）**：`TASK-049` 总资产卡 → `/` ✅ **已完成 2026-10-19**；`TASK-050` 其余五块 → `/portfolios` 且 `/family` 下线（**前置已全部解除，可启动**；仍需分支基线校正 + `Approved` ExecPlan）。需求：[`FS-household-view-split.md`](../product/specs/FS-household-view-split.md)
4. 交易线遗留修复（建议顺序）：`TASK-046`（CSV 幂等失效，P0 数据风险，修 1 行 + 修 mock）→ `TASK-047`（M-2 归属守卫等）→ ~~`TASK-048`（分红标签）~~ ✅ **已完成 2026-10-20**
5. 家庭线遗留（本 FS 明确不做，需独立立项）：家庭总资产趋势（`FAM-01` P1，无快照模型）· 家庭视图按账户类型/大类分组（PRD `CM-05`/`AS-09` 声称已就绪，实现中 `familySummary` 既无 `accountType` 也无大类聚合）
