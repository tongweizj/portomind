# Tasks

## Active

> `TASK-050` 已于 2026-10-21 完成两轮独立复核：首轮 **有条件通过**（AC14 在「贡献列表为空」边界不满足，R-1）；R-1 返修后**复验通过**（Reviewer 自写 25 断言 25 PASS + 两轮缺陷注入负向对照，见任务卡 §12/§13 与 ExecPlan §14/§15）→ **AC1–AC20 全部满足，可进 `Integrating`**，最终验收归 Human。改动未提交（`feature/TASK-050` 工作树）。
>
> 分支：`feature/TASK-050`（= `c463c85`，工作区干净）。
>
> ⚠️ **分支提醒**：`main` 停在 `891d0f7`，不含 `TASK-044` / `TASK-048` / `TASK-049` / `TASK-050`；合并入库属 Human 职权。

| ID | Task | Priority | Status | Owner | ExecPlan |
|---|---|---|---|---|---|
| TASK-050 | 组合列表页承接家庭五区块，`/family` 下线 | High | **REVIEWING（R-1 返修后复验通过）**：2026-10-21 实施完成（5 个新组件 + 12 文件，含删 `Family.jsx`）；首轮独立评审有条件通过（AC14 空态失效），R-1 改单出口结构后**独立复验通过** —— build 2408 modules / eslint 0-0 / AC15+AC16+OD-2 grep 达标 / 自写 25 断言 25 PASS（5 场景）/ 两轮注入负向对照（整块早退 9 FAIL、精确 R-1 形态 5 FAIL）。**AC1–AC20 全部满足，待 `Orchestrator` 置 `Integrating`** | `Orchestrator` → `Human` 最终验收 | [`exec-plans/active/TASK-050`](../exec-plans/active/TASK-050-portfolio-list-household-blocks.md) |

## Backlog

> 已立项但**不排期**。启动前需 Human 重新确认优先级。

| ID | Task | Priority | 说明 | Spec |
|---|---|---|---|---|
| TASK-045 | 交易流水查询与筛选 | Medium | 由 TASK-044 的 OQ1 拆出，本次不做；需动 `server/` + `shared/` 且可能新增索引 | `docs/product/specs/FS-transaction-query-filters.md` |
| TASK-046 | CSV 二次导入未去重（幂等失效） | High | **根因已定位**：`transaction.service.js:233` 的 `select()` 漏 `portfolioId`，库内比对键恒为 `undefined\|...`，永不命中 → `skipped` 恒 0；既有测试 mock 无视投影故全绿。修 1 行 + 修测试 | `docs/tasks/active/TASK-046-csv-import-dedup.md` |
| TASK-047 | TASK-044 审查遗留整改（M-1/M-2/M-5/M-6） | High | **M-2 已定方案②（2026-10-19 Human 裁决）**：URL 组合 id 与交易归属不符时**静默迁移归属**，后端 `updateTransaction` 亦接受改写 → **后端拒绝改写 `portfolioId`**（放开 `shared/`，仅限该守卫）+ 前端报错。另含导航无高亮回归（M-1）、E2E 恒真断言（M-5）、路由脚本复制表（M-6）。M-3 已拆出 TASK-048（✅ 2026-10-20 已完成结案）；M-4 文档索引已闭环。**唯一阻塞：待 Planner 产出 ExecPlan** | `docs/tasks/active/TASK-047-review-followups.md` |
| TASK-051 | 家庭折算汇率方向反了（`rateToCny` 存成 `1 CNY = X 外币`） | High | 由 `TASK-050` 实施期 **F-1** 立项（2026-10-21）。采集端取 `open.er-api.com/v6/latest/CNY`（`1 CNY = X 外币`）却当 `rateToCny`（`1 外币 = X 人民币`）入库，折算再乘 → **USD/CAD 严重低估、HKD 反被高估 37.6%**；真实数据实测 `totalCny` 3,151 vs 修正后 76,128（**偏差 24 倍**）。`fxRate.service` 零单测、既有测试手填 `7.2` 绕过采集端故全绿；手动录入 `7.2` 可修但次日 09:30 cron 覆盖回错值。**待 Human 裁决 OQ1（修采集端 / 折算端 / 双字段）与 OQ2（历史数据处置）** | `docs/tasks/active/TASK-051-fx-rate-direction.md` |

## Blocked

| ID | Task | Reason |
|---|---|---|
| — | 无 | 当前无技术阻塞；`TASK-050` 的 R-1 已复验通过（AC1–AC20 全部满足），待 `Orchestrator` 置 `Integrating` |

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
3. 家庭视图，融入进 dashboard —— ✅ **拆分式搬迁已完成**：`TASK-049` 总资产卡 → `/`（2026-10-19 结案）；`TASK-050` 其余五块 → `/portfolios` 且 `/family` 下线（2026-10-21 实施完成，独立评审有条件通过 → R-1 返修并复验通过）。需求：[`FS-household-view-split.md`](../product/specs/FS-household-view-split.md)
4. 交易线遗留修复（建议顺序）：`TASK-046`（CSV 幂等失效，P0 数据风险，修 1 行 + 修 mock）→ `TASK-047`（M-2 归属守卫等）→ ~~`TASK-048`（分红标签）~~ ✅ **已完成 2026-10-20**
5. 家庭线遗留（本 FS 明确不做，需独立立项）：家庭总资产趋势（`FAM-01` P1，无快照模型）· 家庭视图按账户类型/大类分组（PRD `CM-05`/`AS-09` 声称已就绪，实现中 `familySummary` 既无 `accountType` 也无大类聚合）
