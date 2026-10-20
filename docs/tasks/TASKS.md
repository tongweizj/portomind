# Tasks

## Active

> `TASK-049` 已实施、独立评审通过，Orchestrator 已置 `INTEGRATING`（全系统验证 229/229）。**剩余两步属 Human**：git 提交 + 最终验收。`TASK-050` 仍需待 `TASK-048` 与 `TASK-049` 收尾后方可启动。

| ID | Task | Priority | Status | Owner | ExecPlan |
|---|---|---|---|---|---|
| TASK-049 | Dashboard 承接家庭总资产卡 | High | **INTEGRATING**：独立评审通过（AC1–AC8）+ **Orchestrator 全系统验证通过**（`build` exit 0 / `eslint` 0 error / **229 pass 0 fail** / AC6 零服务端改动），审查遗留 R-1（`readme.md:59,72`）**已闭环**。**剩余：Human 提交 + 最终验收**。⚠️ 未闭环 **R-2**（`AppLayout.jsx:87,91` 铃铛 `title="提醒中心"`）超 Scope，待 Human 裁决并入 047/050。Human 已裁决主色与 `h1` 图标均**不改**（ExecPlan §11.6） | `Orchestrator`（已完成）→ `Human`（提交 + 验收） | [`exec-plans/active/TASK-049`](../exec-plans/active/TASK-049-dashboard-household-total.md) |

## Backlog

> 已立项但**不排期**。启动前需 Human 重新确认优先级。

| ID | Task | Priority | 说明 | Spec |
|---|---|---|---|---|
| TASK-045 | 交易流水查询与筛选 | Medium | 由 TASK-044 的 OQ1 拆出，本次不做；需动 `server/` + `shared/` 且可能新增索引 | `docs/product/specs/FS-transaction-query-filters.md` |
| TASK-046 | CSV 二次导入未去重（幂等失效） | High | **根因已定位**：`transaction.service.js:233` 的 `select()` 漏 `portfolioId`，库内比对键恒为 `undefined\|...`，永不命中 → `skipped` 恒 0；既有测试 mock 无视投影故全绿。修 1 行 + 修测试 | `docs/tasks/active/TASK-046-csv-import-dedup.md` |
| TASK-047 | TASK-044 审查遗留整改（M-1/M-2/M-5/M-6） | High | **M-2 已定方案②（2026-10-19 Human 裁决）**：URL 组合 id 与交易归属不符时**静默迁移归属**，后端 `updateTransaction` 亦接受改写 → **后端拒绝改写 `portfolioId`**（放开 `shared/`，仅限该守卫）+ 前端报错。另含导航无高亮回归（M-1）、E2E 恒真断言（M-5）、路由脚本复制表（M-6）。M-3 已拆出 TASK-048；M-4 文档索引已闭环。**唯一阻塞：待 Planner 产出 ExecPlan** | `docs/tasks/active/TASK-047-review-followups.md` |
| TASK-048 | Family 页分红类交易显示 `undefined`（M-3） | Medium | 由 TASK-047 拆出。`Family.jsx:17` 硬编码 `{buy, sell}`、`:238` 无兜底 → `div_cash`/`div_reinvest` 渲染 `undefined`；`:237` 二元染色把分红染成跌绿。修法要求把中文映射收敛为 `enums.js` 单一导出（现全仓已有 3 处同类派生）。与 TASK-047 无文件交叠，可并行 | `docs/tasks/active/TASK-048-family-dividend-label.md` |

## Blocked

| ID | Task | Reason |
|---|---|---|
| TASK-050 | 组合列表页承接家庭五区块，`/family` 下线 | **硬前置**：① `TASK-049`（总资产卡须先搬到 `/`，否则删 `/family` 会丢失总资产）；② `TASK-048`（分红标签须先修，否则 `undefined` 缺陷被搬到组合页）。需求已起草（FS 交付单元 G2 / R8–R18 / AC9–AC20） |

## Done

| ID | Task | Completed | 产出 |
|---|---|---|---|
| TASK-044 | 交易记录收拢进组合管理 | 2026-10-19 | 提交 `30dc525`；任务卡 [`complete/TASK-044`](./complete/TASK-044-transaction-consolidation.md)；ExecPlan [`complete/TASK-044`](../exec-plans/complete/TASK-044-transaction-consolidation.md) |
| TASK-043 | 标的频道合并（资产管理 + 价格） | 2026-10-19 | 提交 `891d0f7`（2026-10-18）；任务卡 [`complete/TASK-043`](./complete/TASK-043-asset-price-consolidation.md)；ExecPlan [`complete/TASK-043`](../exec-plans/complete/TASK-043-asset-price-consolidation.md)。遗留：FS 的 R6/验收标准措辞待 PM/Human 同步为新口径（§11 Final Notes） |

---

## Roadmap

1. 将资产管理和价格，合并。—— ✅ TASK-043
2. 将交易记录，收拢进组合管理 —— ✅ TASK-044
3. 家庭视图，融入进 dashboard —— 🔄 **已立项，拆分式搬迁（非整页合并）**：`TASK-049` 总资产卡 → `/`；`TASK-050` 其余五块 → `/portfolios` 且 `/family` 下线。需求：[`FS-household-view-split.md`](../product/specs/FS-household-view-split.md)
4. 交易线遗留修复（建议顺序）：`TASK-046`（CSV 幂等失效，P0 数据风险，修 1 行 + 修 mock）→ `TASK-047`（M-2 归属守卫等）→ `TASK-048`（分红标签）——**`TASK-048` 现同时是 `TASK-050` 的硬前置，建议提前**
5. 家庭线遗留（本 FS 明确不做，需独立立项）：家庭总资产趋势（`FAM-01` P1，无快照模型）· 家庭视图按账户类型/大类分组（PRD `CM-05`/`AS-09` 声称已就绪，实现中 `familySummary` 既无 `accountType` 也无大类聚合）
