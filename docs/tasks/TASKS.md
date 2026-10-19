# Tasks

## Active

| ID | Task | Priority | Status | Owner | ExecPlan |
|---|---|---|---|---|---|
| TASK-044 | 交易记录收拢进组合管理 | High | **INTEGRATING**：第二轮评审通过（R-1/R-2 闭环）+ Orchestrator 全系统验证通过（build/lint/路由 13-13/`npm test` 229-229/AC12 零服务端改动，见 ExecPlan §11.10）。**剩余两步属 Human**：① 授权或亲自 git 提交；② 最终验收 | Human | `docs/exec-plans/active/TASK-044-transaction-consolidation.md` |

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
|      |      |        |

## Done

| ID | Task | Completed | 产出 |
|---|---|---|---|
| TASK-043 | 标的频道合并（资产管理 + 价格） | 2026-10-18 | `docs/exec-plans/active/TASK-043-asset-price-consolidation.md` |

---

## Roadmap

1. 将资产管理和价格，合并。—— ✅ TASK-043
2. 将交易记录，收拢进组合管理 —— 🔄 TASK-044（INTEGRATING：评审通过 + 全系统验证通过；待 Human 授权提交与最终验收）
3. 家庭试图，融入进 dashboard —— 未立项
