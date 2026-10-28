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

## 认证与错误码（TASK-058 U1/U2/U3 起）

> U2/U3 前端接入（2026-10-27）：`GET /api/auth/session` 为全站会话唯一数据源（前端 `queryKey: ['session']`）；`user.lastLoginAt` 供账户页「上次登录」；业务端点 `401` 由前端统一清缓存并跳 `/login?next=<原路径>`（`/auth/login`、`/auth/session`、`/auth/logout` 的 401 属业务结果，不触发跳转）。

- **默认要求登录**：除 `POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/session` 外，全部 `/api/*` 端点都要求会话 cookie `pm_sid`；未登录/会话失效返回 `401`（body `code: UNAUTHENTICATED` 或 `ACCOUNT_DISABLED`）。
- **强制改密**：`mustChangePassword=true` 的账号只能访问 `change-password` / `logout` / `session`，其余返回 `403 PASSWORD_CHANGE_REQUIRED`。
- **角色**：`/api/users/*` 全部要求 `admin`；`member` 返回 `403 FORBIDDEN`。
- **错误码字段**：认证相关失败响应在通用结构上增加顶层 `code`（稳定机器码，前端据此写文案，**不要匹配 message**）。现有码：`INVALID_CREDENTIALS` · `ACCOUNT_DISABLED` · `ACCOUNT_LOCKED` · `PASSWORD_CHANGE_REQUIRED` · `FORBIDDEN` · `UNAUTHENTICATED` · `USERNAME_TAKEN` · `LAST_ADMIN_PROTECTED` · `CANNOT_DEACTIVATE_SELF` · `SELF_RESET_FORBIDDEN` · `PASSWORD_TOO_SHORT` · `PASSWORD_TOO_LONG` · `INVALID_USERNAME` · `INVALID_ROLE` · `INVALID_CURRENT_PASSWORD` · `INVALID_INPUT` · `INVALID_ID` · `USER_NOT_FOUND`。
- **CORS**：白名单 + `credentials:true`；非白名单 `Origin` 返回 `403`（`CORS_FORBIDDEN`）。开发态未配置 `CORS_ORIGINS` 时默认放行 localhost / 127.0.0.1 的 **5173 与 6600**（Vite dev 实际端口是 `client/vite.config.js` 的 6600，浏览器经代理发 POST 会带该 Origin）；生产必须显式配置，否则启动 fail-fast。
- **仅接受 `application/json`**：带请求体的写端点（`login` / `change-password` / `profile` / `users` 的 POST/PATCH）若 Content-Type 不是 JSON → `415 UNSUPPORTED_MEDIA_TYPE`（FS §8 CSRF：`SameSite=Lax` + JSON-only，配合不挂 `urlencoded` 解析器）。

Asset 枚举：`type` 为 `stock | etf | fund | bond | cash`，`market` 为 `US | CA | CN-SH | CN-SZ | CN-FUND | HK`，`currency` 为 `USD | CAD | CNY | HKD`（港股 AS-08：market=HK，Yahoo 代码形如 `0700.HK`），`assetClass` 为 `equity | bond | gold | cash | null`（AS-09：大类与 type 正交，null=未分类）。`active` 控制资产能否进入交易选择、行情同步等业务流程；`watchlist` 仅表示用户关注偏好，二者互不替代。

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

校验错误可能额外包含 `details`。认证/授权/CORS 类错误可能额外包含顶层 `code`（见「认证与错误码」）；状态码语义：`400` 请求参数或请求体无效，`401` 未登录/会话失效，`403` 已登录但无权限或需先改密（`PASSWORD_CHANGE_REQUIRED` / `FORBIDDEN` / CORS 拒绝），`404` 资源/路由不存在，`409` 唯一键/不变量冲突，`429` 登录限流锁定，`500` 未处理的服务器错误。创建返回 `201`，其余成功请求返回 `200`。

## 接口清单

下表中的“返回 data”均位于通用成功响应的 `data` 字段中；“分页”表示同时返回通用 `pagination`。

| 方法与路径 | 请求参数 | 返回 data | 状态码 / 特有错误 |
| --- | --- | --- | --- |
| `GET /` | 无 | `{ message }` | `200` |
| `POST /api/auth/login` | Body: `{username,password}`（用户名大小写不敏感，存小写） | `{user:{id,username,role,mustChangePassword,lastLoginAt}}` + `Set-Cookie: pm_sid=…`（httpOnly/SameSite=Lax/Path=/；生产 Secure） | `200`; 参数缺失 `400`; 非 JSON `415 UNSUPPORTED_MEDIA_TYPE`; 密码错 `401 INVALID_CREDENTIALS`; 账号停用 `401 ACCOUNT_DISABLED`; 连续 5 次失败后 `429 ACCOUNT_LOCKED` |
| `POST /api/auth/logout` | 无（无需登录，幂等） | `{ok:true}`；删除库中会话并清 cookie | `200` |
| `GET /api/auth/session` | 无（公开） | `{authenticated:boolean, user?:{id,username,role,mustChangePassword,lastLoginAt}}`（`lastLoginAt` 供账户页「上次登录」，未登录/无记录时为 `null`） | `200`（**未登录也 200**） |
| `POST /api/auth/change-password` | Body: `{currentPassword,newPassword}`（8–72 字符） | `{ok:true}`；成功后 `mustChangePassword=false`、该账号**其他会话失效**（保留当前） | `200`; 当前密码错 `400 INVALID_CURRENT_PASSWORD`; 密码不合规 `400 PASSWORD_TOO_SHORT` / `PASSWORD_TOO_LONG`; 未登录 `401` |
| `PATCH /api/auth/profile` | Body: `{username}` | `{user:{id,username,role,mustChangePassword}}` | `200`; 用户名非法 `400 INVALID_USERNAME`; 重名 `409 USERNAME_TAKEN` |
| `GET /api/users` | 无（admin） | `{items:[{id,username,role,active,mustChangePassword,lastLoginAt,createdAt}]}`（创建时间倒序；**不含 passwordHash**） | `200`; 未登录 `401`; 非 admin `403 FORBIDDEN` |
| `POST /api/users` | Body: `{username,password,role}`（admin） | `{user:{…}}`；`mustChangePassword=true`，对方首登强制改密 | `201`; 校验失败 `400`；重名 `409 USERNAME_TAKEN`；非 admin `403` |
| `PATCH /api/users/:id` | Path: `id`; Body: `{username?,role?,active?}`（admin） | `{user:{…}}`；停用时该用户现存会话立即删除 | `200`; 非法 id `400 INVALID_ID`; 不变量冲突 `409 LAST_ADMIN_PROTECTED` / `CANNOT_DEACTIVATE_SELF`; 非 admin `403` |
| `POST /api/users/:id/password` | Path: `id`; Body: `{newPassword}`（admin；**不能对自己**，D9） | `{ok:true}`；目标用户全部会话失效 + `mustChangePassword=true` | `200`; 对自己 `409 SELF_RESET_FORBIDDEN`; 校验失败 `400`; 非 admin `403` |
| `GET /api/assets` | Query: `page,pageSize,search?,sortBy?,sortOrder?,active?,watchlist?,assetClass?`；search 匹配代码、名称、标签，状态过滤值为 true/false，assetClass 取 `equity/bond/gold/cash/unclassified`（unclassified 匹配 null=未分类） | Asset 数组 + 分页 | `200`; 查询参数无效 `400` |
| `POST /api/assets` | Body: `{symbol,name,market,currency,type,assetClass?,tags?,watchlist?,active?}`（assetClass 空串/省略 = 未分类） | 新 Asset | `201`; `400`; symbol 重复 `409` |
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
| `GET /api/portfolios/summary` | `includeArchived`（可选，默认 `false`：CM-20 归档组合默认排除，传 `true` 包含） | Portfolio 数组（含 `stats: {positionCount, marketValueByCurrency, drift}`）。市值按币种分桶，不跨币种合计；某币种存在缺价持仓则该桶为 `null`。`drift` 仅反映绝对/相对偏离触发；无目标配置、无持仓或缺价时为 `null` | `200` |
| `POST /api/portfolios` | Body: `{name,description?,type?,currency?,accountType?,archived?,targets?,rebalanceSettings?}`。targets 每项：`{symbol,targetRatio,level?:'asset'\|'asset_class'}`（CM-08：缺省 asset；大类代码 equity/bond/gold/cash 小写；混合模式 400） | 新 Portfolio | `201`; `400` |
| `GET /api/portfolios/:id` | Path: `id` | Portfolio | `200`; ID 无效 `400`; `404` |
| `PUT /api/portfolios/:id` | Path: `id`; Body: Portfolio 可更新字段 | 更新后 Portfolio | `200`; `400`; `404` |
| `DELETE /api/portfolios/:id` | Path: `id` | `{portfolio,deletedTransactions,deletedRebalanceRecords}`；级联删除交易和再平衡记录 | `200`; `400`; `404` |
| `GET /api/portfolios/:id/stats` | Path: `id` | 按 symbol 聚合的统计数组 | `200`; `500` |
| `GET /api/portfolios/:id/stats/actual-ratios` | Path: `id`; Query: `level?`（`asset` 默认 / `asset_class`：按币种内大类占比返回，symbol 为大类代码） | `[{symbol,currency,ratio}]`；比例按原币种分别计算 | `200`; `500` |
| `GET /api/portfolios/:pid/stats/positions` | Path: `pid`; Query: `page,pageSize,symbol?,sortBy?,sortOrder?` | 持仓数组 + 分页；缺价时估值字段为 null | `200`; 非法账本 `400`; `500` |
| `GET /api/portfolios/:pid/positions/history` | Path: `pid`; Query: `symbol?`, `interval=day\|week\|month` | 按日期及原币种分行的持仓时间序列 | `200`; interval 或账本无效 `400` |
| `GET /api/portfolios/:pid/transactions` | Path: `pid`; Query: `symbol?,page,pageSize` | Transaction 数组 + 分页 | `200`; `500` |
| `GET /api/portfolios/:pid/rebalance-settings` | Path: `pid` | RebalanceSettings | `200`; `404` |
| `PUT /api/portfolios/:pid/rebalance-settings` | Path: `pid`; Body: `{absoluteDeviation?,relativeDeviation?,timeInterval?,rebalanceSchedule?}` | 更新后 RebalanceSettings | `200`; `400`; `404` |
| `POST /api/portfolios/:pid/rebalance/check` | Path: `pid`; 空 Body | `{needsRebalance,triggeredThresholds,totalValue,details,reasons}` | `200`; `404`; `500` |
| `POST /api/portfolios/:pid/rebalance/suggestions` | Path: `pid`; Body: `{feeModel?: {fixedFee?,ratioFee?,taxRate?},cashBudget?: number}` | `{recordId,status:"PENDING",suggestions,triggeredThresholds,thresholdDetails,warnings,funding,classMode?}`。CM-08：大类目标模式下建议按类内市值占比摊分并标注 `assetClass`；warnings 含 `CLASS_NO_POSITIONS:xx` / `UNCLASSIFIED_POSITIONS` | `201`; 参数无效 `400`; `404` |
| `POST /api/portfolios/:pid/rebalance/execute` | Path: `pid`; Body: `{recordId,suggestions: object[],mode:"MANUAL"}` | `{recordId,status:"EXECUTED",transactionIds}` | `200`; 请求体/自动执行 `400`; 状态冲突 `409`; `404` |
| `GET /api/portfolios/:pid/rebalance/history` | Path: `pid`; Query: `page,pageSize` | RebalanceRecord 数组 + 分页 | `200`; `500` |
| `GET /api/transactions` | Query: `page,pageSize,portfolioId?,symbol?`；按 `date DESC,_id DESC` | Transaction 数组 + 分页 | `200` |
| `GET /api/alerts/rules` | Query: `page,pageSize,active?,scope?,portfolioId?,ruleType?` | AlertRule 数组 + 分页 | `200` |
| `POST /api/alerts/rules` | Body: `{name,scope,portfolioId?,symbol?,ruleType,params?,direction?(signal),reason?(signal),validUntil?(signal),cooldownDays?,active?}`；scope=asset 须 symbol、scope=portfolio 须 portfolioId、signal 须 direction、price/gain/drift 须对应 params；`high_52w/low_52w` 可选 `params.lookbackDays`（1-3650）；`valuation_percentile` 须 `params.{indexCode,metric:'pe'\|'pb',threshold:0-100,direction:'above'\|'below'}` | 新 AlertRule | `201`; `400` |
| `GET/PUT/DELETE /api/alerts/rules/:id` | Path: `id` | 详情 / 更新 / 删除（事件保留审计） | `200`; `400`; `404` |
| `GET /api/alerts/events` | Query: `page,pageSize,status?,level?,portfolioId?,ruleId?` | AlertEvent 数组 + 分页（triggeredAt 倒序） | `200` |
| `PATCH /api/alerts/events/:id/read` | Path: `id`; Body: `{status:"read"\|"dismissed"}` | 更新后 AlertEvent | `200`; `400`; `404` |
| `GET /api/alerts/events/unread-count` | 无 | `{count}`（Dashboard 徽标） | `200` |
| `POST /api/alerts/evaluate` | 空 Body | 手动触发评估跑批：`{evaluated,created,archived,failed}` | `200` |
| `GET /api/family/summary` | 无 | 家庭汇总：`{totalCny, buckets:{USD|CAD|CNY|HKD:{amount,cnyValue,rate}}, fxRates, portfolioContributions:[{portfolioId,name,currency,marketValueByCurrency,cnyValue,ratio}], recentTransactions, recentRebalanceRecords}`。RMB 基准折算（最新 FxRate）；币种桶内缺价或该币种无汇率 → cnyValue/ratio 为 null 且不计入总额（不误报）；归档组合排除 | `200` |
| `GET /api/family/fx/rates` | 无 | 各外币对 CNY 最新汇率详情数组（含 date/source） | `200` |
| `PUT /api/family/fx/rates/:currency` | Path: `currency`（USD/CAD/HKD）；Body: `{rateToCny,date?,note?}` | 按 (currency, date) 幂等写入（source='manual'） | `201`; `400` |
| `POST /api/family/fx/sync` | 空 Body | 手动触发汇率采集（er-api）：`{count,records}`；采集失败 `502` | `200`; `502` |
| `GET /api/valuations` | 无 | 各指数最新估值分位数组（每 indexCode+metric 取最新一条） | `200` |
| `PUT /api/valuations/:indexCode/:metric` | Path: `indexCode`（如 000300）、`metric`（pe\|pb）；Body: `{value,percentile,indexName?,date?,note?}` | 按 (indexCode, metric, date) 幂等写入（source='manual'，衔接 index-valuation-selfcalc 自算结果） | `201`; `400` |
| `POST /api/transactions` | Body: `{portfolioId,symbol,action,quantity,price,fee?,date?,notes?}`；action ∈ `buy|sell|div_cash|div_reinvest`（TR-07）；资产元数据由 Asset 派生；CN 买入非整手响应附 `warnings:['CN_LOT_SIZE:symbol']`（TR-08，不阻断） | 新 Transaction | `201`; 校验或超卖 `400`; 组合/资产不存在 `404` |
| `GET /api/transactions/:id` | Path: `id` | Transaction | `200`; `400`; `404` |
| `PUT /api/transactions/:id` | Path: `id`; Body: Transaction 可更新字段；更新后重放账本 | 更新后 Transaction | `200`; 校验或超卖 `400`; `404` |
| `DELETE /api/transactions/:id` | Path: `id`；删除后重放账本 | 删除的 Transaction | `200`; 导致超卖 `400`; `404` |
| `POST /api/transactions/import` | Body: `{portfolioId,transactions:[{symbol,action,quantity,price,fee?,date?,notes?}]}`；≤500 行。数据校验失败/超卖 → 整批回滚（`422`+errors）；幂等：批次内去重 + 与库中按 (portfolioId,symbol,action,quantity,price,日,fee) 一致跳过 | `{imported,skipped,errors:[{index,message}]}` | `201`（含跳过）; `422`（整批回滚）; `400` |
| `POST /api/rebalance/:recordId/revoke` | Path: `recordId`; 空 Body | `{recordId,status:"REVOKED",reversalTransactionIds}` | `200`; 状态冲突 `409`; `404` |
| `POST /api/rebalance/:recordId/reexecute` | Path: `recordId`; 空 Body | `{recordId,sourceRecordId,status:"PENDING",suggestions}` | `201`; 状态冲突 `409`; `404` |
| `GET /api/logs` | Query: `date?` (`YYYY-MM-DD`，默认市场当日), `level?` (`all\|error\|warn\|info\|verbose\|debug\|silly`), `page,pageSize` | 应用日志条目数组 + 分页 | `200`; 查询参数无效 `400`; `500` |
| `GET /api/logs/tasks` | Query: `date?` (`YYYY-MM-DD`，默认市场当日), `level?`, `page,pageSize` | 任务日志条目数组 + 分页 | `200`; 查询参数无效 `400`; `500` |
| `GET /api/cron/status` | Query: `detail?`（缺省＝主视图；`rebalance`＝再平衡逐组合明细；其它非空值 `400`）、`date?`（`YYYY-MM-DD`，**仅 detail 校验/使用**；detail 下非法 `400`，主视图忽略该参数）、`portfolioId?`（ObjectId，仅 detail；非法/不存在仍 `200` + 空 `rows` + `notes[].code`） | **只读**聚合快照：`{generatedAt,timezone,staleThresholdHours,tasks:[5]}`。每项含 `taskName/lastRun(无记录 null)/stale/contractReady/dataState/dataStateLevel(ok\|warn\|bad\|unknown)/notes[]`。价格数据态：`{targetMarketDate,calendarPrevOpenDay,expected,fetched,missing[],byMarket,notListed[],unsupportedMarkets[],dayPriceSymbolCount}`；完整性/提醒/汇率/再平衡的 `result` 派生值在 `TASK-057` 落地前为 `null`（`contractReady=false` + `CONTRACT_NOT_READY`）。detail 形态：`{date,contractReady,generatedAt,summary:{totalPortfolios,due,generated,failed,skipped},rows[],notes[]}` | `200`; `detail` 非法 `400`；detail 下 `date` 非法 `400`；`portfolioId` 非法/不存在不报错（`200` + 空结果）。**不触发任何任务、不写任何集合** |

> `GET /api/cron/status` 是**只读聚合**端点（FS C-02 / TASK-054）：不注册 cron、不触发任务、不写库；字段全集与派生口径（含“有效目标日”）见 [TASK-054 ExecPlan](../exec-plans/complete/TASK-054-cron-status-aggregate-api.md) §4.3/§4.4。

未注册的 API 路径：**带合法会话**时返回 `404` 和通用错误结构；未认证请求会先被全站闸门拦为 `401`（闸门在 404 之前）。所有响应还会携带 `X-Trace-Id` 响应头。

## 当前安全边界

自 TASK-058 U1（2026-10-27）起 API 已有登录、身份认证与角色授权：

- 全部业务端点默认要求会话 cookie（`401`）；`admin`/`member` 都能读写业务数据，只有 `/api/users/*` 限 `admin`（`403`）。
- 单租户：**所有账号共享同一份家庭数据**，没有 `ownerId`/`tenantId`/资源级隔离；也给不出「按用户分权」的能力。
- 生产部署必须：TLS + `COOKIE_SECURE=true` + 配置 `CORS_ORIGINS` 白名单；**U1 不得与前端 U2 拆分发布**（否则全站 401）。
- 其余风险（日志脱敏、备份、MongoDB 访问控制）仍按 §DEPLOYMENT 安全边界执行。
