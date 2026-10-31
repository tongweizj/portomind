# Feature Spec — 交易流水查询与筛选

> 状态：**草稿 · Backlog（本次不实现）**
> 提出日期：2026-10-18
> 负责人：Max
> 来源：由 `specs/completed/FS-transaction-consolidation.md` 的 **OQ1** 拆出（Human 裁决：「新以此创建一个产品需求，这一次不做」）
> 关联产品线：PL-1 投资账本线（M1.2 交易流水）
> 关联任务：TASK-045（Backlog，未排期）

---

## 0. TL;DR

给交易流水增加**服务端查询能力**：时间范围、交易类型，以及跨组合视角下的组合多选。当前 `GET /api/transactions` 仅支持 `page / pageSize / portfolioId / symbol` 四个参数，**无法按时间或类型筛选**，这使得「查上个月投入了多少」这类最基础的账本问句只能靠翻页目视。

**本需求不实现，仅登记**。TASK-044 只做信息架构收拢，不携带本需求。

---

## 1. Problem Statement

**用户问题**：账本的核心用途之一是回答「某段时间我做了什么」。当前交易列表只支持分页与「按组合 / 按标的」过滤，**没有时间维度**。要核对「2026 年 9 月的总投入」，用户只能在分页列表里逐页翻阅并自行累加。

**证据（已核实代码）**：
- `server/controllers/transaction.controller.js:30-39` — `GET /api/transactions` 仅解构 `portfolioId` 与 `symbol`。
- `server/controllers/transaction.controller.js:51-53` — `GET /api/portfolios/:pid/transactions` 仅接受 `symbol`。
- `client/src/services/transaction.service.js:7-17` — 前端服务层同样只暴露 `portfolioId` / `symbol`。
- 现有前端两处列表（`TransactionList.jsx`、`Portfolio/Transactions.jsx`）**均无任何工具栏**。

**不解决的代价**：跨组合查账（「本月总投入」「今年分红合计」）在 UI 上不可完成；也阻断了后续所有基于时间窗口的账本分析（月度投入趋势、现金流统计）。

---

## 2. Goals

- **G1** 可按**时间范围**（起止日）筛选流水。
- **G2** 可按**交易类型**（buy / sell / div_cash / div_reinvest）筛选。
- **G3** 跨组合视图下可按**多个组合**同时筛选。
- **G4** 筛选条件可与分页、排序共存，且**结果计数准确**（`pagination.total` 反映筛选后的总数，而非全量）。

---

## 3. Non-Goals

- **NG1 不做聚合统计**：不加「区间总投入 / 总分红 / 已实现盈亏」等汇总卡片，属后续独立需求。
- **NG2 不做导出**：不提供 CSV / Excel 导出。
- **NG3 不做保存的筛选器 / 自定义视图**。
- **NG4 不改交易本身的业务口径与数据结构**。

---

## 4. Requirements

| 编号 | 需求 | 说明 |
|---|---|---|
| **Q1** | `GET /api/transactions` 新增 `from` / `to`（`YYYY-MM-DD`），按 `date` 区间过滤 | 区间语义需明确为**闭区间**；`to` 应覆盖当日整天（注意交易 `date` 为 `Date` 类型，非纯日期） |
| **Q2** | `GET /api/transactions` 新增 `action`（枚举四值） | 非法值应 `400`，不得静默忽略 |
| **Q3** | `GET /api/transactions` 支持 `portfolioId` **多值** | 形如 `portfolioId=a&portfolioId=b` 或逗号分隔，二选一需在实现时定；单值场景保持向后兼容 |
| **Q4** | `GET /api/portfolios/:pid/transactions` 同步支持 `from` / `to` / `action` | 组合内 Tab 与全局页筛选能力应对齐 |
| **Q5** | 前端：交易列表增加筛选工具栏（时间范围 + 类型 + 组合），筛选条件写进 URL query 以便分享/刷新保持 | 属 TASK-044 交付后的增量改造 |
| **Q6** | `pagination.total` 必须为**筛选后**的计数 | 现有实现若沿用 `countDocuments(filter)` 需确认 filter 已合并全部条件 |

---

## 5. ⚠️ 技术前置：索引缺口（实现前必须评估）

`shared/models/transaction.js:32-33` 现有两个复合索引，**前缀均为 `portfolioId`**：

```
{ portfolioId: 1, date: -1, _id: -1 }
{ portfolioId: 1, symbol: 1, date: 1, _id: 1 }
```

这带来一个真实的性能问题：

- **指定单个组合 + 时间范围** → 可用第一个索引，`date` 在其前缀之后，范围扫描高效。
- **跨组合（不指定 portfolioId）+ 时间范围** → **两个索引都用不上前缀**，退化为 collection scan，且 `date DESC` 排序可能落入内存排序（有 32MB 排序上限风险）。
- **按 `action` 筛选** → 无任何索引覆盖。

因此本需求很可能需要**新增索引**，例如：

```
{ date: -1, _id: -1 }              // 跨组合按时间
{ action: 1, date: -1, _id: -1 }   // 按类型 + 时间
```

> 新增索引属于**数据层变更**，需评估对现有写入性能与数据量的影响。当前交易量（家庭 3 组合）预计很小，短期可接受 collection scan，但应在实现时明确记录取舍。

---

## 6. Open Questions

| 编号 | 问题 | 建议 |
|---|---|---|
| QO1 | `portfolioId` 多值用重复参数还是逗号分隔？ | 重复参数（`portfolioId=a&portfolioId=b`）更符合 HTTP 语义，但需确认现有 `parsePagination` 与校验函数是否兼容数组 |
| QO2 | 是否保留 `symbol` 参数？是否也需要多值？ | 保留单值；多值暂不需要 |
| QO3 | 筛选条件是否持久化到 localStorage？ | 建议只走 URL query，不持久化（可分享、可回退） |
| QO4 | 是否需要「最近 30 天 / 本月 / 本年」快捷时间区间？ | 建议提供预设按钮，但作为 Q5 的可选增强，不阻塞主线 |
| QO5 | 是否同步扩展 `Price` / 其他列表页的筛选？ | 否，本需求只覆盖交易流水 |

---

## 7. Why Split From TASK-044

TASK-044 的定位是**信息架构收拢 + 实现去重**，明确「仅前端改动」。而本需求必须改动 `server/controllers` 与 `shared/services`（且很可能需要新增数据库索引），性质不同、风险不同、验收方式不同。混在同一个任务里会让「收拢」这个目标失焦，也会让 Reviewer 难以界定回归面。

---

## 8. Related

- `specs/completed/FS-transaction-consolidation.md` — 父需求（OQ1 由本文承接）
- `handbook/product/lines/PL-1-ledger.md` — TR-01 交易 CRUD 的现状描述需在本需求落地后更新
- `shared/models/transaction.js` — 索引定义
