# PortoMind REST API 契约

API 前缀为 `/api`。客户端只通过 `VITE_API_URL` 配置此前缀；变量为空时使用同源 `/api`。

## 通用响应

成功响应：

```json
{
  "success": true,
  "data": [],
  "pagination": { "page": 1, "pageSize": 20, "total": 100 }
}
```

`pagination` 仅用于列表接口。列表查询统一使用 `page`（从 1 开始）和 `pageSize`（1–100；价格列表最多 200）。

价格业务日期统一使用 `MARKET_TIMEZONE`（默认 `America/Toronto`）解释，数据库始终保存 UTC `Date`。同步写入会将日价格规范到市场日边界，并通过 `{symbol, timestamp}` 唯一索引和 upsert 保证重复同步幂等。价格查询响应携带 `X-Market-Timezone`。

Asset 枚举：`type` 为 `stock | etf | fund | bond | cash`，`market` 为 `US | CA | CN-SH | CN-SZ | CN-FUND`，`currency` 为 `USD | CAD | CNY`。`active` 控制资产能否进入交易选择、行情同步等业务流程；`watchlist` 仅表示用户关注偏好，二者互不替代。

Portfolio 枚举：`type`（风险定位）为 `活钱 | 稳健 | 长期`；`accountType`（账户载体）为 `tiantian | xueqiu | tfsa | rrsp | resp | taxable | other`，二者正交。`accountType` 缺省为 `other`；存量组合未写入该字段时读取侧按 `other` 兜底。

交易方向统一使用小写 `buy | sell`。持仓采用移动平均成本：买入增加数量和 `quantity * price` 的账面成本；卖出按卖出前的平均成本减少账面成本，已实现盈亏为 `(卖出价 - 卖出前平均成本) * 卖出数量`。系统不允许做空，任何新增、修改或删除导致交易时点可用数量不足的操作都返回 `400`。交易查询统一按 `date DESC, _id DESC` 排序；计算持仓时则按相反顺序重放账本。

删除组合采用应用层级联：先删除该组合的交易和再平衡记录，再删除组合本身，并在响应中返回删除数量。若子资源清理失败，组合会保留，避免新增孤儿记录。

持仓概览和持仓历史共用移动平均成本计算器。持仓字段包括 `quantity`、`avgCost`、`remainingCost`、`latestPrice`、`marketValue`、`unrealizedPnl` 和 `pnlPct`；缺少最新价格时，后三个估值字段为 `null`，不会按零价格计算。当前阶段不引入汇率，金额保留资产的原始 `currency`；历史与实际比例仅在相同币种内汇总，不允许直接跨币种相加。

组合 `targets` 可以为空；非空时 symbol 不得重复、每个 `targetRatio` 必须位于 0–100，且比例总和必须为 100%（容差 `0.000001`）。创建与编辑接口均执行同一校验，失败返回 `400`。

再平衡第一版采用人工确认闭环：生成建议时创建 `PENDING` 记录但不创建交易；确认执行仅接受 `MANUAL`，按先卖后买顺序创建交易并标记 `EXECUTED`；撤销按原执行交易的逆序创建反向交易后标记 `REVOKED`；重做只创建一条关联原记录的新 `PENDING` 记录，仍需再次确认。自动调度只能生成建议，不能自动交易。买入资金仅来自请求中的 `cashBudget` 和卖出扣除手续费、税费后的净所得，不允许无资金买入。手续费为固定费用加成交额比例费用；第一版税费仅按卖出成交额计提。

错误响应：

```json
{
  "success": false,
  "message": "Portfolio not found",
  "traceId": "550e8400-e29b-41d4-a716-446655440000"
}
```

校验错误可能额外包含 `details`。状态码语义固定为：`400` 请求参数或请求体无效，`404` 资源/路由不存在，`409` 唯一键冲突，`500` 未处理的服务器错误。创建返回 `201`，其余成功请求返回 `200`。

## 接口清单

下表中的“返回 data”均位于通用成功响应的 `data` 字段中；“分页”表示同时返回通用 `pagination`。

| 方法与路径 | 请求参数 | 返回 data | 状态码 / 特有错误 |
| --- | --- | --- | --- |
| `GET /` | 无 | `{ message }` | `200` |
| `GET /api/assets` | Query: `page,pageSize,search?,sortBy?,sortOrder?,active?,watchlist?`；search 匹配代码、名称、标签，状态过滤值为 true/false | Asset 数组 + 分页 | `200`; 查询参数无效 `400` |
| `POST /api/assets` | Body: `{symbol,name,market,currency,type,tags?,watchlist?,active?}` | 新 Asset | `201`; `400`; symbol 重复 `409` |
| `GET /api/assets/:id` | Path: `id` | Asset | `200`; `400`; `404` |
| `PUT /api/assets/:id` | Path: `id`; Body: Asset 可更新字段 | 更新后 Asset | `200`; `400`; `404`; `409` |
| `DELETE /api/assets/:id` | Path: `id` | 删除的 Asset | `200`; `404` |
| `POST /api/prices` | Body: `{symbol,price,name?,currency?,market?,timestamp?}` | 新 Price | `201`; `400` |
| `GET /api/prices/today` | Query: `page,pageSize` | 当前市场日各 symbol 最新 Price 数组 + 分页 | `200`; `400` |
| `GET /api/prices/date/:date` | Path: `date` (`YYYY-MM-DD`); Query: `page,pageSize` | 指定市场日 Price 数组 + 分页 | `200`; 日期格式错误 `400` |
| `GET /api/prices/symbol/:symbol/history` | Path: `symbol`; Query: `year?,month?` 或 `from?,to?`，以及 `page,pageSize` | 历史 Price 数组 + 分页 | `200`; 过滤条件无效或冲突 `400` |
| `GET /api/prices/:id` | Path: `id` | Price | `200`; `400`; `404` |
| `PUT /api/prices/:id` | Path: `id`; Body: Price 可更新字段 | 更新后 Price | `200`; `404` |
| `DELETE /api/prices/:id` | Path: `id` | 删除的 Price | `200`; `404` |
| `GET /api/portfolios` | Query: `page,pageSize` | Portfolio 数组 + 分页 | `200` |
| `POST /api/portfolios` | Body: `{name,description?,type?,currency?,accountType?,targets?,rebalanceSettings?}` | 新 Portfolio | `201`; `400` |
| `GET /api/portfolios/:id` | Path: `id` | Portfolio | `200`; ID 无效 `400`; `404` |
| `PUT /api/portfolios/:id` | Path: `id`; Body: Portfolio 可更新字段 | 更新后 Portfolio | `200`; `400`; `404` |
| `DELETE /api/portfolios/:id` | Path: `id` | `{portfolio,deletedTransactions,deletedRebalanceRecords}`；级联删除交易和再平衡记录 | `200`; `400`; `404` |
| `GET /api/portfolios/:id/stats` | Path: `id` | 按 symbol 聚合的统计数组 | `200`; `500` |
| `GET /api/portfolios/:id/stats/actual-ratios` | Path: `id` | `[{symbol,currency,ratio}]`；比例按原币种分别计算 | `200`; `500` |
| `GET /api/portfolios/:pid/stats/positions` | Path: `pid`; Query: `page,pageSize,symbol?,sortBy?,sortOrder?` | 持仓数组 + 分页；缺价时估值字段为 null | `200`; 非法账本 `400`; `500` |
| `GET /api/portfolios/:pid/positions/history` | Path: `pid`; Query: `symbol?`, `interval=day\|week\|month` | 按日期及原币种分行的持仓时间序列 | `200`; interval 或账本无效 `400` |
| `GET /api/portfolios/:pid/transactions` | Path: `pid`; Query: `symbol?,page,pageSize` | Transaction 数组 + 分页 | `200`; `500` |
| `GET /api/portfolios/:pid/rebalance-settings` | Path: `pid` | RebalanceSettings | `200`; `404` |
| `PUT /api/portfolios/:pid/rebalance-settings` | Path: `pid`; Body: `{absoluteDeviation?,relativeDeviation?,timeInterval?,rebalanceSchedule?}` | 更新后 RebalanceSettings | `200`; `400`; `404` |
| `POST /api/portfolios/:pid/rebalance/check` | Path: `pid`; 空 Body | `{needsRebalance,triggeredThresholds,totalValue,details,reasons}` | `200`; `404`; `500` |
| `POST /api/portfolios/:pid/rebalance/suggestions` | Path: `pid`; Body: `{feeModel?: {fixedFee?,ratioFee?,taxRate?},cashBudget?: number}` | `{recordId,status:"PENDING",suggestions,triggeredThresholds,thresholdDetails,warnings,funding}` | `201`; 参数无效 `400`; `404` |
| `POST /api/portfolios/:pid/rebalance/execute` | Path: `pid`; Body: `{recordId,suggestions: object[],mode:"MANUAL"}` | `{recordId,status:"EXECUTED",transactionIds}` | `200`; 请求体/自动执行 `400`; 状态冲突 `409`; `404` |
| `GET /api/portfolios/:pid/rebalance/history` | Path: `pid`; Query: `page,pageSize` | RebalanceRecord 数组 + 分页 | `200`; `500` |
| `GET /api/transactions` | Query: `page,pageSize,portfolioId?,symbol?`；按 `date DESC,_id DESC` | Transaction 数组 + 分页 | `200` |
| `POST /api/transactions` | Body: `{portfolioId,symbol,action,quantity,price,date?,notes?}`；资产元数据由 Asset 派生 | 新 Transaction | `201`; 校验或超卖 `400`; 组合/资产不存在 `404` |
| `GET /api/transactions/:id` | Path: `id` | Transaction | `200`; `400`; `404` |
| `PUT /api/transactions/:id` | Path: `id`; Body: Transaction 可更新字段；更新后重放账本 | 更新后 Transaction | `200`; 校验或超卖 `400`; `404` |
| `DELETE /api/transactions/:id` | Path: `id`；删除后重放账本 | 删除的 Transaction | `200`; 导致超卖 `400`; `404` |
| `POST /api/rebalance/:recordId/revoke` | Path: `recordId`; 空 Body | `{recordId,status:"REVOKED",reversalTransactionIds}` | `200`; 状态冲突 `409`; `404` |
| `POST /api/rebalance/:recordId/reexecute` | Path: `recordId`; 空 Body | `{recordId,sourceRecordId,status:"PENDING",suggestions}` | `201`; 状态冲突 `409`; `404` |
| `GET /api/logs` | Query: `date?` (`YYYY-MM-DD`，默认市场当日), `level?` (`all\|error\|warn\|info\|verbose\|debug\|silly`), `page,pageSize` | 应用日志条目数组 + 分页 | `200`; 查询参数无效 `400`; `500` |
| `GET /api/logs/tasks` | Query: `date?` (`YYYY-MM-DD`，默认市场当日), `level?`, `page,pageSize` | 任务日志条目数组 + 分页 | `200`; 查询参数无效 `400`; `500` |

未注册的 API 路径返回 `404` 和通用错误结构。所有响应还会携带 `X-Trace-Id` 响应头。

## 当前安全边界

当前 API 没有登录、身份认证和资源级授权，只适合可信本地网络。引入多用户前，所有 Portfolio、Transaction、RebalanceRecord、TaskRun 和日志查询都必须补所有权或管理员授权，不能直接把当前接口暴露到公网。
