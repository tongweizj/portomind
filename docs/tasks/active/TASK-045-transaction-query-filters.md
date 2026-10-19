# TASK-045 — 交易流水查询与筛选

## Metadata

**Status:**  
`BACKLOG`（已立项，**不排期**，本次不做）

**Priority:**  
`Medium`

**Owner:**  
`未分配`

**Created:**  
`2026-10-18`

**Related Product Spec:**  
`docs/product/specs/FS-transaction-query-filters.md`（草稿 · Backlog）

**Execution Plan:**  
`未创建`

---

## 1. Goal

给交易流水增加服务端查询能力：**时间范围**（`from`/`to`）、**交易类型**（`action`）、跨组合视角下的**组合多选**，并在前端交易列表提供筛选工具栏。

## 2. Why Backlog

本需求由 `FS-transaction-consolidation.md` 的 **OQ1** 拆出（Human 裁决 2026-10-18：「新以此创建一个产品需求，这一次不做」）。

拆分理由：它必须改动 `server/controllers`、`shared/services`，且**很可能需要新增数据库索引**，与 TASK-044「仅前端、IA 收拢」的定位性质不同，混在同一任务内会让回归面无法界定。

## 3. Scope

- `GET /api/transactions` 新增 `from` / `to` / `action` / `portfolioId` 多值
- `GET /api/portfolios/:pid/transactions` 同步支持 `from` / `to` / `action`
- 前端交易列表筛选工具栏（时间范围 + 类型 + 组合），条件写入 URL query
- `pagination.total` 反映筛选后计数

## 4. ⚠️ 前置技术评估（未解决）

现有 `shared/models/transaction.js:32-33` 两个复合索引**前缀均为 `portfolioId`**：

```
{ portfolioId: 1, date: -1, _id: -1 }
{ portfolioId: 1, symbol: 1, date: 1, _id: 1 }
```

因此「跨组合 + 时间范围」查询**用不上索引前缀**，会退化为 collection scan 并可能内存排序；按 `action` 筛选无索引覆盖。实现前必须评估是否新增：

```
{ date: -1, _id: -1 }
{ action: 1, date: -1, _id: -1 }
```

当前交易量（家庭 3 组合）预计很小，短期可接受扫描，但需明确记录取舍。

## 5. Notes

- 本任务**不阻塞** TASK-044。TASK-044 的「全部交易」页只提供**服务端已支持**的筛选（按组合 `portfolioId`、按标的 `symbol`），不含时间与类型筛选。
- 启动本任务前需 Human 重新确认优先级；FS 需从 Backlog 提升为待评审并完成批准流程。
