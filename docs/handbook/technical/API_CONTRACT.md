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

资产建档时，`symbol` 按请求中的 `market` 派生为标准大写存储键，已知后缀可以省略或写错，服务端在查重前按市场纠正。编辑时 `symbol` 与 `market` 均不可变，回传等价键允许保留，修改返回 `400`。后缀表见 [ADR-003](../../architecture/adr/ADR-003-symbol-suffix-contract.md)。

手动写价时，提供 `market` 即按该市场派生 symbol。新建可省略 market，此时使用标准后缀或资产主数据中唯一匹配的市场。缺少确定市场时保留清洗后的原键。更新 symbol 或 market 时，省略的字段沿用该价格记录的值；仅更新价格等字段时保留原键。手动写价沿用请求时间戳。

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

校验错误可能额外包含 `details`。认证/授权/CORS 类错误可能额外包含顶层 `code`（见「认证与错误码」）；状态码语义：`400` 请求参数或请求体无效，`401` 未登录/会话失效，`403` 已登录但无权限或需先改密（`PASSWORD_CHANGE_REQUIRED` / `FORBIDDEN` / CORS 拒绝），`404` 资源/路由不存在，`409` 唯一键/不变量冲突，`429` 登录限流锁定，`500` 未处理的服务器错误。创建返回 `201`，其余成功请求返回 `200`；运维中心手动任务被受理后在后台执行，返回 `202`（见 `POST /api/ops-center/integrity-check`）。

## 响应形状例外

通用形状是「列表端点返回 `data: []` + `pagination`，非列表端点只返回 `data`」。以下 5 处**有意偏离**，均属既定行为而非缺陷；改动前须新增任务并更新本节，勿悄悄「统一」。

| 端点 | 形状 | 原因与约束 |
| --- | --- | --- |
| `GET /api/users` | `data: {items:[...]}`（**包装对象，不是数组**），且**不分页** | **全仓唯一**的包装式列表。保持现状，**不改为裸数组**（会破坏 `client/src/hooks/useUsers.js` 与 `pages/AccountUsers`）。响应不含 `passwordHash`。 |
| `GET /api/valuations` | `data: [...]` 裸数组、**不分页** | 数据量有界（指数 × 指标的当前最新一条）。**当前无前端消费方（server-only）**，前端不建 service 属预期。 |
| `GET /api/family/fx/rates` | `data: [...]` 裸数组、**不分页** | 同上：受支持币种数量有界。 |
| `GET /api/cron/status` | `data: {…}` 对象快照、**非列表** | 只读聚合视图，返回单个看板对象；不带 `pagination` 键。 |
| 其余非列表端点 | 只有 `data` | 如 `/api/portfolios/summary`（`data` 是聚合数组，但**不是分页列表**）；**不含 `pagination` 键**，前端不应探测该字段。 |

除上表列出的端点外，列表端点统一为 `data: []` + `pagination: {page,pageSize,total}`；该对象**恰有这三个键**、取值均为数字，不附加其他分页字段。

协约由 `server/test/integration/api-contract.crud.test.js` 的可执行断言锁定（`{items}` 包装、pagination 形状一致性、非列表端点无 `pagination`），修改形状会直接使测试失败。

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
| `GET /api/assets` | Query: `page,pageSize,search?,sortBy?,sortOrder?,active?,watchlist?,assetClass?`；search 匹配代码、名称、标签，状态过滤值为 true/false，assetClass 取 `equity/bond/gold/cash/unclassified`（unclassified 匹配 null=未分类） | Asset 数组 + 分页，返回的 `symbol` 遵循 [ADR-003 存储格式](../../architecture/adr/ADR-003-symbol-suffix-contract.md) | `200`; 查询参数无效 `400` |
| `POST /api/assets` | Body: `{symbol,name,market,currency,type,assetClass?,tags?,watchlist?,active?,launchDate?}`（assetClass 空串/省略 = 未分类） | 新 Asset | `201`; `400`; symbol 重复 `409` |
| `GET /api/assets/:id` | Path: `id` | Asset | `200`; `400`; `404` |
| `PUT /api/assets/:id` | Path: `id`; Body: Asset 可更新字段。`launchDate` 接受非未来的 `YYYY-MM-DD` 或 `null`（清空）。省略保留原值 | 更新后 Asset | `200`; `400`; `404`; `409` |
| `DELETE /api/assets/:id` | Path: `id` | 删除的 Asset | `200`; `404` |
| `POST /api/prices` | Body: `{symbol,price,name?,currency?,market?,timestamp?}` | 新 Price | `201`; `400` |
| `GET /api/prices/today` | Query: `page,pageSize` | 当前市场日各 symbol 最新 Price 数组 + 分页 | `200`; `400` |
| `GET /api/prices/date/:date` | Path: `date` (`YYYY-MM-DD`); Query: `page,pageSize` | 指定市场日 Price 数组 + 分页，返回的 `symbol` 遵循 [ADR-003 存储格式](../../architecture/adr/ADR-003-symbol-suffix-contract.md) | `200`; 日期格式错误 `400` |
| `GET /api/prices/symbol/:symbol/history` | Path: `symbol`; Query: `year?,month?` 或 `from?,to?`，以及 `page,pageSize` | 历史 Price 数组 + 分页 | `200`; 过滤条件无效或冲突 `400` |
| `GET /api/prices/:id` | Path: `id` | Price | `200`; `400`; `404` |
| `PUT /api/prices/:id` | Path: `id`; Body: Price 可更新字段 | 更新后 Price | `200`; `404` |
| `DELETE /api/prices/:id` | Path: `id` | 删除的 Price | `200`; `404` |
| `GET /api/portfolios` | Query: `page,pageSize` | Portfolio 数组 + 分页 | `200` |
| `GET /api/portfolios/summary` | `includeArchived`（可选，默认 `false`：CM-20 归档组合默认排除，传 `true` 包含） | Portfolio 数组，每项含 `stats: {positionCount, marketValueByCurrency, lastExecutedAt, pendingRebalanceCount, drift, unreadAlertCount}`。市值按币种分桶，不跨币种合计；某币种存在缺价持仓则该桶为 `null`。`lastExecutedAt` 为最近一次 `EXECUTED` 再平衡时间（`Date|null`，无记录为 `null`；沿用 `computeSummary` 既有的最近一条 `EXECUTED` 记录查询，不为此新增查询）；`pendingRebalanceCount` 为该组合 `PENDING` 的 `RebalanceRecord` 条数（整数，默认 0，一次批量聚合）；`unreadAlertCount` 为该组合未读（`status:'unread'`）提醒事件数（整数，默认 0；按现存组合分组统计，删除组合后其事件不计入；资产级 `portfolioId:null` 事件归提醒列表但不归入任何组合计数，B16 口径）。`drift` 仅反映绝对/相对偏离触发，`needsRebalance` / `triggeredThresholds` 语义不变（仍仅绝对/相对偏离）；非 null 时含 `{needsRebalance, triggeredThresholds, dueByTime, overThresholdCount}`：`dueByTime` 表示 `timeInterval` 是否触发但**不扩义** `needsRebalance`，`overThresholdCount` 为超阈**标的数**（非阈值类型数）；无目标配置、无持仓或缺价时 `drift` 为 `null`，`dueByTime` / `overThresholdCount` 两字段不可读 | `200` |
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
| `POST /api/transactions/import`（旧版，已由 preview/commit 取代，仅保留兼容脚本） | Body: `{portfolioId,transactions:[{symbol,action,quantity,price,fee?,date?,notes?}]}`；≤500 行。数据校验失败/超卖 → 整批回滚（`422`+errors）；幂等：批次内去重 + 与库中按 (portfolioId,symbol,action,quantity,price,日,fee) 一致跳过 | `{imported,skipped,errors:[{index,message}]}` | `201`（含跳过）; `422`（整批回滚）; `400` |
| `GET /api/transactions/import/template` | 无 | 标准 CSV 模板（`text/csv` 附件，非 `{success,data}` 包装）：表头 + 合成示例行；列定义见 `GET /api/transactions/import/format` | `200` |
| `GET /api/transactions/import/format` | 无 | `{columns:[{key,label,description}], activityTypes:[{type,supported,required}], commitLimit:500, previewLimit:5000}`（开放 `buy`/`sell`/`div_reinvest`/`div_cash`/`tax`/`interest`/`cash_in`/`cash_out`/`fee`；`split`（TASK-098：必填 `trade_date,symbol,quantity`，`quantity` 为带符号份额变动，可选列 `split_ratio` 写作 `2:1` / `1:10` / 正数，单价与币种可留空，佣金只能为空或 0）、`fx`（TASK-101，见下文换汇配对）、`transfer_out`/`transfer_in`（TASK-099：必填 `trade_date,symbol,quantity`，可选 `transfer_cost,transfer_cost_currency,transfer_fx_rate`，仅转入行可填） | `200` |
| `POST /api/transactions/import/preview` | Body: `{portfolioId, format:'standard'\|'wealthsimple'\|'questrade', file:{name,encoding?:'text'\|'base64',content}, sourceAccount:{id,alias?}\|{broker,alias,accountNumber?}, mapping?:{<表头列序号>:<标准列名>}, accountSelector?, timeZone?:'Asia/Shanghai'\|'America/Toronto', symbolMap?:{<报表代码>@<币种>\|<报表代码>:<资产存储代码>}, resolutions?:{<rowKey>:{action:'skip'\|'add'}\|{action:'update',targetId?}\|{fee}\|{confirmZeroFee:true}\|{order:'before'\|'after'}\|{pairWith:<另一端 rowKey>}\|{pairWith:<划转对端 rowKey\|legId>}\|{transferCost:number}\|{fxRate:number}}}`（决议须在该行 `options` 内；`update` 的 `targetId` 须为 `matches[].id` 之一，唯一候选时可省略）；请求体上限 2mb（仅导入端点）。只读，覆盖完整文件（≤5000 行）。TASK-096：报表有成交时间但无时区 → 行 `review` `TIME_ZONE_UNCONFIRMED`（`candidate.date=null`，给出 `localDate/localTime`），阻塞原因 `TIME_ZONE_REQUIRED`，用 `timeZone` 确认（其他值 `400 INVALID_TIME_ZONE`）；同日顺序跨报表或混合精度且「之前 / 之后」会改变超卖、剩余成本或已实现盈亏 → 行 `review` `ORDER_AMBIGUOUS`（`orderConflict:{day,kind:'cross_report'\|'mixed_precision',existing,rowKeys}`），同组各行以 `order` 确认；同报表仅日期的同日成交按原行顺序。TASK-098：拆股行在重放中缺少拆股前持仓 → 行 `review` `SPLIT_NO_POSITION`，已知比例与份额变动冲突（或拆后份额不为正）→ 行 `review` `SPLIT_RATIO_CONFLICT`，二者 `options:['skip']`，暂停入账直到跳过或修正文件后重新预览；通过的拆股行附 `splitEffect:{quantityBefore,quantityAfter,remainingCost,avgCostBefore,avgCostAfter}`；`positionsAfter` 是确认后本次涉及标的的持仓预演（同一重放规则，与确认后 `GET /api/portfolios/:id/stats/positions` 口径一致；账本无法重放时为 `null`）。TASK-099 证券划转：划转行不参与成交匹配与换汇配对，候选对端 = 同文件反方向划转行 + 服务端暂存的反方向一端（两端都有 `pair_group` 时按组号，否则份额一致且成交日相差 ≤10 天）；唯一 → 自动配对（`disposition:'add'`），多个 → `review` `TRANSFER_PAIR_AMBIGUOUS`（`transfer.candidates`，用 `pairWith` 指定），没有 → `disposition:'stage'` `TRANSFER_AWAITING_COUNTERPART`（确认时暂存，不进账本、不阻塞整批）；已暂存的同内容行 → `skip` `TRANSFER_ALREADY_STAGED`。核对：份额不一致 `TRANSFER_QUANTITY_MISMATCH`、转出端持仓不足 `TRANSFER_INSUFFICIENT_POSITION`、成本币种与转入资产不一致 `TRANSFER_COST_CURRENCY`（均为 error）；跨币种且转入成本与换算依据均缺 → `review` `TRANSFER_COST_REQUIRED`（`options:['transferCost','fxRate','skip']`）。承接成本优先级：`transferCost` 决议 > 报表 `transfer_cost` > 同币种承接转出成本 > 换算依据（决议 `fxRate` 优先于报表）× 转出成本 | `{previewToken, ledgerFingerprint, target, sourceAccount:{id\|null,isNew,broker,alias,accountKeyLast4}, accounts:[{selector,accountKeyLast4,rowCount}], requiresAccountSelection, requiresTimeZone, timeZoneOptions, headers, mapping, rows:[{rowKey,rowNumber,rowNumberKind:'original'\|'file',fileLine,disposition:'add'\|'update'\|'skip'\|'review'\|'error',code,reason,options,resolved,orderConflict,orderResolved,splitEffect,transfer:{direction,pairKey?,partner:{kind:'row'\|'staged',rowKey,legId,direction,portfolioId,portfolioName,sourceAccountId,sourceAccountAlias,symbol,currency,quantity,date,rowNumber}\|null,candidates?,removedCost,removedCostCurrency,carryCost,carryCostCurrency,carryCostSource,fxRate,crossCurrency}\|null,matches:[{id,portfolioId,portfolioName?,transaction?,diff?:[{field,before,after}]}],duplicateOf:{rowKey,rowNumber,diff}\|null,targetId,pair:{groupId,source:'explicit'\|'user'\|'suggested',partnerRowKey,partnerRowNumber}\|null,pairCandidates:[{rowKey,rowNumber,date,cashAmount,cashCurrency}],symbolMapKey,candidate}]（`candidate` 含 `dateKind,timeZone,timeZoneSource,localDate,localTime,settlementDate,settlementStatus,splitRatio,mappedFrom`）, positionsAfter:[{symbol,currency,quantity,remainingCost,avgCost,realizedPnl}]\|null, counts, blocking, blockingReasons:[{code,reason}], commitLimit, batches:[{index,count,firstRowNumber,lastRowNumber}], requiresSplit, counterpartPortfolioIds}`（`counts` 含 `stage`；`stage` 行计入 500 条批次，划转配对两端不拆批） | `200`; 入参/映射无效 `400`; 组合或来源账户不存在 `404`; 文件超限 `413` |
| `POST /api/transactions/import/commit` | Body: preview 的全部入参 + `{previewToken, ledgerFingerprint}`。服务端在导入锁内重算预览：输入不一致或账本已变 → `409 PREVIEW_STALE`（`details.reason`: `INPUT_CHANGED`/`LEDGER_CHANGED`）；存在错误或未决待核对 → `422 IMPORT_BLOCKED`；同组合并发确认 → `409 IMPORT_IN_PROGRESS`（TASK-099：划转对端组合正在确认另一导入同样 409）；暂存对端在预览后被其他确认占用或被放弃 → `409 PREVIEW_STALE`。配对到暂存对端时，对端流水与本行同一次确认写入对端组合（各自保留来源账户与组合归属）。只写第 1 批（≤500 条来源流水，同 `pair_group` 及配对的换汇两端不拆开：两端落在第 500 / 501 行时第 1 批为 499 条），整批要么全部可见要么全部不可见 | `{importBatchId, sourceAccountId, added, updated, staged, counterpartsWritten, skipped, review, deferred, remainingBatches, rows:[{rowKey,rowNumber,rowNumberKind,disposition,code,reason,transactionId,transferLegId,counterpartTransactionId}]}` | `201`; `400`; `409`; `422` |
| `GET /api/transactions/import/transfers` | Query: `portfolioId?` | 暂存待配对的证券划转一端（TASK-099）：`[{id,portfolioId,portfolioName,sourceAccountId,direction,symbol,currency,quantity,date,dateKind,pairGroup,transferCost,transferCostCurrency,transferFxRate,rowNumber,rowNumberKind,fileName,status,createdAt}]` | `200`; `400` |
| `DELETE /api/transactions/import/transfers/:id` | 无 | 放弃暂存的一端（`staged → discarded`），之后需重新提供该端报表行：`{id,status:'discarded'}` | `200`; `400`; 不存在或已入账 `404 TRANSFER_LEG_NOT_FOUND` |

> **重复成交识别与更正（TASK-095）**：匹配范围为目标组合 + 同一来源账户 + 同一方向。待核对 `code`：`EXTERNAL_ID_CHANGED`（同编号内容不同，可 update/skip）、`EXTERNAL_ID_OTHER_PORTFOLIO`（同编号在其他组合，仅 skip）、`EXTERNAL_ID_CONFLICT_IN_FILE`（同文件同方向重复编号内容不同，skip/add，`duplicateOf` 给出与原行差异）、`TRADE_CHANGED`（无编号，时间戳 + 标的 + 数量 + 成交金额一致但其他字段不同，update/skip）、`AMOUNT_CHANGED`（仅成交金额不同，update/add/skip）、`MULTIPLE_CANDIDATES`、`DATE_ONLY_MATCH`（无编号仅日期的同日候选）、`LEGACY_CANDIDATE`（同日缺来源账户的旧账）。唯一一致匹配 → `skip`/`ALREADY_IMPORTED`（一对一认领）。`update` 改写目标旧流水的成交值与来源引用，**不覆盖 `notes`**，不改组合归属；确认在同一 ImportBatch 内写入，失败按预写原值恢复。

> **现金流水与净额核对（TASK-097）**：`candidate` 另含 `kind:'trade'|'cash'`、`cashAmountSource:'broker'|'derived'|null`、`cashDifference`。现金类（`div_cash` / `tax` / `interest` / `cash_in` / `cash_out` / `fee`）以带符号 `cash_amount` 为金额（`cash_in` 取正、`cash_out` / `fee` 取负，其余保留券商符号），标的可空，数量 / 单价可空（`div_cash` 缺金额时按数量 × 单价推算，标 `derived`），不得填成交佣金（`INVALID_FIELD`）；不改变持仓。现金币种可与资产币种不同（仅成交行仍报 `CURRENCY_MISMATCH`）。成交行优先保存券商净额，`cashDifference` 为券商净额与「成交金额 ± 佣金」的分币差异（保留不改写）；缺净额且佣金已知（含补值 / 确认按零）时推算净额（买 −(成交金额 + 佣金)，卖 成交金额 − 佣金，分红再投不推算）。无编号现金流水与同来源账户同日、同类型、同币种、同金额（`div_cash` 另比标的）的旧流水 → `CASH_DUPLICATE`，与同文件前行重复 → `CASH_DUPLICATE_IN_FILE`；两者均为 skip/add 的人工核对，完全一致也不自动跳过。有编号的现金流水按编号匹配（同 TASK-095）。

> **换汇配对与共同入账（TASK-101）**：`fx` 每端一行，无标的（填写 → `INVALID_FIELD`），`cash_amount` 保留券商符号、`cash_currency` 为该端币种；两端须不同币种、一出一入。配对：同 `pair_group` 恰好两端 → `pair.source='explicit'`（只有一端 → `review` `FX_PAIR_INCOMPLETE`，仅 skip；多于两端或不相容 → `error` `FX_PAIR_INVALID`）；用户以 `{pairWith}` 指定 → `user`（一端指定即可，另一端不得指向别处）；未填组号时同来源账户、同一报表日历日内互为唯一相容候选 → `suggested`（预览展示，确认导入即采纳）。同范围多种可能 → `review` `FX_PAIR_AMBIGUOUS`，无候选 → `FX_UNPAIRED`，`pairCandidates` 列出可指定的另一端（options `pairWith`/`skip`）。未配对端阻塞整批，任何一端不单独入账；全部决议后一端 `skip` 而另一端仍要写入 → 写入端 `review` `FX_PARTNER_SKIPPED`（仅 skip）。配对组号写入两端 `pairGroupId`（建议 / 指定配对为生成的 `fx-<hash>`），两端在同一 ImportBatch 内同一次 pending→committed 翻转可见，失败回滚后两端均不可见。换汇再次导入沿用 `CASH_DUPLICATE` 核对。

> **Wealthsimple 原格式 CSV（TASK-100）**：`format:'wealthsimple'` 直接上传 activities export（17 列 snake_case 表头）。服务端识别原报表列，不接受手动列映射（非空 `mapping` → `400 INVALID_MAPPING`），缺必需原列（`effective_date`、`activity_type`、`activity_sub_type`、`symbol`、`currency`、`quantity`、`unit_price`、`commission`、`net_cash_amount`）→ 阻塞原因 `MISSING_COLUMNS`。映射：`Trade` + 子类型 `BUY`/`SELL` → `buy`/`sell`（方向只看子类型，`direction` 恒为 LONG 不参与；卖出数量为负取绝对值），`Dividend` → `div_cash`，`Tax` → `tax`，`Interest` → `interest`，`MoneyMovement`（EFT、Interac e-Transfer 等）按净额符号 → `cash_in`/`cash_out`；其他类型行报 `UNSUPPORTED_ACTIVITY`（原因含原类型 / 子类型）。现金类行忽略原报表重复金额的 `quantity`，金额取 `net_cash_amount`；`account_id` 作账号（只存哈希与末 4 位）；`effective_time`（含 `00:00:00` 明确午夜）无时区，须以 `timeZone` 确认；行号为上传文件行号（`rowNumberKind:'file'`），原描述存入备注（≤500 字）。标的为裸代码：在已有资产 `<代码>.US` / `<代码>.TO` 中唯一解析，两者都有 → `MARKET_AMBIGUOUS`，都没有 → `ASSET_NOT_FOUND`。`currency` 是现金币种：成交现金币种与资产币种不同（美股以 CAD 结算）且描述带 `FX Rate: <r>`（1 资产币种 = r 现金币种）时，单价 / 佣金按 r 换回资产币种计持仓成本，`cashAmount` 保持券商现金净额与币种，`candidate.cashFxRate = r`，`cashDifference` 按报表原始现金币种金额核对；没有报表汇率则仍报 `CURRENCY_MISMATCH`（不猜汇率）。

> **Questrade 原格式 XLSX（TASK-102）**：`format:'questrade'` 直接上传 Activities 报表工作簿。**传输**：导入 API 仅收 JSON，工作簿以 `file:{name, encoding:'base64', content:<base64>}` 放入请求体（受导入端点 2mb 上限约束，base64 约膨胀 4/3；`encoding` 不是 `base64` → `400 INVALID_IMPORT_FILE`）。服务端用 exceljs 解析（先把 `x:` 前缀命名空间、非 `sheetN.xml` 工作表名等非常规包结构规范化）；不是有效 XLSX 或缺 `Activities` 工作表 → `400 INVALID_IMPORT_FILE`；缺必需原列（`Transaction Date`、`Settlement Date`、`Action`、`Symbol`、`Description`、`Quantity`、`Price`、`Commission`、`Net Amount`、`Currency`、`Account #`、`Activity Type`）→ `MISSING_COLUMNS`；不接受 `mapping`。原报表新 → 旧，预览按旧 → 新输出；行号为原工作表行号（`rowNumberKind:'original'`，`rowKey` 为 `R<行号>`）。日期只取日期部分（原报表恒为 `12:00:00 AM`，按仅日期精度，不涉及时区），交易日与结算日分别保留。映射：`Trades` `Buy`/`Sell` → `buy`/`sell`（卖出数量为负取绝对值；非零佣金为负数，取反为佣金，`0.00` 为明确零佣金；正数佣金不猜 → `INVALID_NUMBER`），`Dividends`（净额为正，`DIV` 或空 Action）→ `div_cash`，`Dividends` `DIS` 且描述含 `SPLIT` → `split`（`split_ratio = (n + 份额变动) : n`，`n` 取自 `SPLIT ON n SHS`），`FX conversion` `FXT` → `fx`（每端一行、不设组号，按同账户同日建议配对），`Other` `BRW` → 数量负 `transfer_out` / 正 `transfer_in`（同账户同日同代码一出一入设共同组号 `qt-brw-<日期>-<代码>`；转入行描述 `BOOK VALUE: $x` 作为转入币种的 `transfer_cost`，缺失则按 #99 `TRANSFER_COST_REQUIRED`；`CNV@` 汇率方向不确定，不使用），`Fees and rebates` 净额为负 → `fee`，`Deposits` → `cash_in`，`Withdrawals` → `cash_out`，`Interest` → `interest`；其他（含负数分红、正数返还、非拆股 `DIS`）→ `UNSUPPORTED_ACTIVITY`（原因含原类型 / Action）。现金类行忽略为 0 的数量 / 单价，金额取 `Net Amount`；`Account #` 作账号；描述存入备注。**标的**：带 `.TO` 等后缀按后缀解析；裸代码在已有 `<代码>.US` / `<代码>.TO` 中按该行 `Currency`（证券交易币种）筛选后唯一解析。Questrade 内部证券代码（字母 + ≥5 位数字）与跨币种划转的转入端（另一币种上市代码，报表代码无法区分）不猜：行 `review` `SYMBOL_UNMAPPED`（`options:['symbolMap','skip']`，`symbolMapKey` 形如 `<代码>@<币种>`），由请求体 `symbolMap` 指定资产存储代码（值须为带市场后缀的大写代码，否则 `400 INVALID_SYMBOL_MAP`；键 `<代码>@<币种>` 优先于 `<代码>`，适用于所有格式）后重新预览；采用映射的行 `candidate.mappedFrom` 为原报表代码、`symbolMapKey` 保留供页面修改。
| `GET /api/source-accounts` | 无 | 来源账户数组 `[{id,broker,alias,accountKeyLast4,accountType,portfolioIds}]`（不含完整账号） | `200` |
| `PATCH /api/source-accounts/:id` | Body: `{alias}`（1–60 字） | 更新后的来源账户（别名不影响身份） | `200`; `400`; `404` |
| `POST /api/source-accounts/:id/cash-reconciliation` | Body: `{from:'YYYY-MM-DD', to:'YYYY-MM-DD', balances?:{<币种>:{opening?:number\|null, closing?:number\|null}}}`（TASK-103；只读计算，余额为用户按券商对账单填写，不落库；POST 仅因携带余额） | `{sourceAccount, period:{from,to}, cashDateRules:[{code,text}], reconciled, currencies:[{currency, status:'reconciled'\|'unreconciled', statusLabel:'余额已核对'\|'未核对', openingBalance, closingBalance, knownChange, computedClosing, difference, missing:[{code,reason,count?,difference?}], portfolios:[{portfolioId,portfolioName,knownChange,count}], items:[{id,portfolioId,portfolioName,action,symbol,tradeDate,settlementDate,settlementStatus,cashDate,cashDateBasis:'settlement'\|'activity',cashAmount,cashAmountSource,rowNumber,importBatchId,pair:{key,groupId,counterpart:{id,currency,cashAmount}\|null}\|null}], unknownSettlement:[item], incomplete:[item]}]}`。汇总该来源账户**跨组合**的已入账流水（pending 不可见），按 `cashCurrency` 分币种计算，**无跨币种合计**。现金日期：成交（buy/sell/有现金额的 div_reinvest）用结算日，结算日未知的成交（成交日在 `from` 前 10 天至 `to`）不计入变动、列入 `unknownSettlement`；现金类流水有结算日用结算日，否则用活动日（Human 决定 7：不视为结算日未知；规则文字由 `cashDateRules` 返回，界面原样展示，条目以 `cashDateBasis` 标注依据）。换汇两端各归本币种，按 `(importBatchId, pairGroupId)` 互指对端。`missing` 码：`OPENING_BALANCE_MISSING` / `CLOSING_BALANCE_MISSING` / `SETTLEMENT_UNKNOWN` / `CASH_AMOUNT_MISSING` / `FX_PAIR_INCOMPLETE` / `IMPORT_PENDING`（未完成提交残留）/ `IMPORT_DEFERRED`（同组合同文件最近一次确认仍有拆批推迟行，计入全部币种）/ `BALANCE_MISMATCH`。缺期初时 `computedClosing`/`difference` 为 `null`。仅当期初、期末齐备、`missing` 为空（差额为 0，按分取整）时 `status='reconciled'`；`reconciled` = 至少一个币种且全部已核对 | `200`; 期间无效 `400 INVALID_PERIOD`; 币种 / 余额无效 `400 INVALID_CURRENCY` / `INVALID_BALANCE`; `404 SOURCE_ACCOUNT_NOT_FOUND` |
| `POST /api/rebalance/:recordId/revoke` | Path: `recordId`; 空 Body | `{recordId,status:"REVOKED",reversalTransactionIds}` | `200`; 状态冲突 `409`; `404` |
| `POST /api/rebalance/:recordId/reexecute` | Path: `recordId`; 空 Body | `{recordId,sourceRecordId,status:"PENDING",suggestions}` | `201`; 状态冲突 `409`; `404` |
| `GET /api/logs` | Query: `date?` (`YYYY-MM-DD`，默认市场当日), `level?` (`all\|error\|warn\|info\|verbose\|debug\|silly`), `page,pageSize` | 应用日志条目数组 + 分页 | `200`; 查询参数无效 `400`; `500` |
| `GET /api/logs/tasks` | Query: `date?` (`YYYY-MM-DD`，默认市场当日), `level?`, `page,pageSize` | 任务日志条目数组 + 分页 | `200`; 查询参数无效 `400`; `500` |
| `GET /api/cron/status` | Query: `detail?`（缺省＝主视图；`rebalance`＝再平衡逐组合明细；其它非空值 `400`）、`date?`（`YYYY-MM-DD`，**仅 detail 校验/使用**；detail 下非法 `400`，主视图忽略该参数）、`portfolioId?`（ObjectId，仅 detail；非法/不存在仍 `200` + 空 `rows` + `notes[].code`） | **只读**聚合快照：`{generatedAt,timezone,staleThresholdHours,tasks:[5]}`。每项含 `taskName/lastRun(无记录 null)/stale/contractReady/dataState/dataStateLevel(ok\|warn\|bad\|unknown)/notes[]`。价格数据态：`{targetMarketDate,calendarPrevOpenDay,expected,fetched,missing[],byMarket,notListed[],unsupportedMarkets[],dayPriceSymbolCount}`；完整性/提醒/汇率/再平衡的 `result` 派生值在缺失时为 `null`（`contractReady=false` + `CONTRACT_NOT_READY`）；TASK-057 落地后按冻结 `result` 归一化。detail 形态：`{date,contractReady,generatedAt,summary:{totalPortfolios,due,generated,failed,skipped},rows[],notes[]}` | `200`; `detail` 非法 `400`；detail 下 `date` 非法 `400`；`portfolioId` 非法/不存在不报错（`200` + 空结果）。**不触发任何任务、不写任何集合** |
| `GET /api/ops-center/assets` | Query: `page,pageSize`（默认 `1/50`，上限 100）、`market`（`ASSET_MARKETS`）、`active`（`true` 默认 / `false` / `all`）、`missingType`（`validity\|today_price\|basic_info\|history_gap`）、`search`（symbol/name 子串，≤100 字符）、`sortBy`（`priority` 默认 / `symbol\|name\|market\|currency`）、`sortOrder`（`asc` 默认 / `desc`）。 | 资产总表数组 + 分页。每项 `{assetId,symbol,name,market,currency,launchDate,todayPrice:{marketDay,status,priceDate},basicInfo:{complete,missingFields},validity:{status},history:{status,checkedAt,expected,actual,missing,ratio}}`。`history.status ∈ unavailable \| checked \| unknown`。默认只取 `active`；默认问题优先排序（有效性待核查/无法判断 → 今日价缺失 → 基础信息缺失 → 历史缺口 → 完整），同组按 `symbol` 升序。缺失/未知值为 `null`，不补 0。 | `200`; 非法筛选/排序/分页参数 `400`; 未登录 `401`。**只读，不触发任务、不写集合** |
| `POST /api/ops-center/integrity-check` | 空 Body。非空 Body（对象、数组或标量，如 `{repair:true}`）返回 `400`；手动刷新禁止补采。 | `{runId,taskName,runKey,status:'RUNNING',startedAt}`；任务在后台执行，客户端用 `GET /api/ops-center/task-runs/:id` 轮询。 | `202`; 请求体非空 `400`; 已有活跃运行 `409 TASK_ALREADY_RUNNING`（`details.activeRun` 含 `runId/taskName/runKey/status/startedAt/progress`）; 未登录 `401`。**不创建交易、不自动补采** |
| `POST /api/ops-center/price-sync` | Body 可省略或用 `{}`（= 全部 active）；或 `{marketGroup:'CN'\|'US_CA'}`。`marketGroup` 只接受这两个值；其他字段/值 `400`。 | `{runId,taskName,runKey,status:'RUNNING',startedAt}`；`taskName='daily-price-sync'`，任务在后台执行，用同一 task-run 详情契约轮询。`result.assets[]` 含逐资产 `status`/`priceDate`/`reason`；不保存原始价格序列。 | `202`; 非法市场组/额外字段 `400`; 已有活跃运行 `409 TASK_ALREADY_RUNNING`; 未登录 `401`。**不修改 cron 调度** |
| `POST /api/ops-center/assets/:id/price-backfill` | Path: 资产 ObjectId。Body 可省略；或 `{from?,to?}`（`YYYY-MM-DD`）；或 `{year}`（1970–当前市场年）。`year` 与 `from/to` 互斥。缺省为当前年份；区间会裁到 `launchDate` 与目标市场日。 | **同步等待**后返回 `{runId,status,assetId,symbol,market,from,to,expectedCount,missingBeforeCount,missingAfterCount,fetchedCount,failures[]}`；`status` 为 TaskRun 的 `SUCCEEDED`/`PARTIAL`，仍缺日期时 `missingAfterCount > 0`。只补缺失交易日，不保存原始价格序列。 | `200`; 非法资产 id/区间/年份/无 `launchDate` `400`; 资产不存在 `404`; 同资产已有补采 `409 TASK_ALREADY_RUNNING`; 未登录 `401`。**同步等待，可能耗时** |
| `POST /api/ops-center/price-backfill` | Body: `{assetIds:[ObjectId,...],from?,to?,year?,preview?}`；`assetIds` 非空且 ≤500；`year` 与 `from/to` 互斥。批量选择由客户端传 asset ids；`preview:true` 只读预估，`preview:false`/省略异步执行。 | `preview:true` → `{assetCount,readyCount,skippedCount,missingDateCount,range,assets[]}`，`range` 在未显式传区间时回填可预览资产的有效起止；不创建 TaskRun；执行 → `202 {runId,taskName:'asset-history-backfill-batch',runKey,status,startedAt}`，由 task-run 详情读取进度/结果。逐资产结果在父 TaskRun `result.assets`（`status` 非 `succeeded` 时带 `reason`/`message`），子任务为 `asset-history-backfill`。 | `200`（预览）; `202`（启动）; 非法 assetIds/区间/年份 `400`; 已有批量运行 `409 TASK_ALREADY_RUNNING`; 未登录 `401`。**预览不写库** |
| `GET /api/ops-center/task-runs` | Query: `page,pageSize`（默认 `1/20`，上限 100）、`taskName`（`daily-price-sync\|asset-history-backfill\|asset-history-backfill-batch\|price-integrity-check`，缺省为这四类）、`assetId`（ObjectId）、`from`/`to`（`YYYY-MM-DD`，按 `MARKET_TIMEZONE` 自然日，含 `to` 当日；`from > to` 为 `400`）。 | 采集记录数组 + 分页，按 `startedAt` 倒序。运行行 `{kind:'run',runId,taskName,runKey,trigger,status,startedAt,endedAt,durationMs,counts:{totalCount,successCount,failureCount},scope:{marketGroup,assetId,symbol,assetCount,from,to}}`；跳过行（来自 `taskskips`）`{kind:'skip',skipId,runId:null,taskName,runKey,trigger,status:'SKIPPED',reason,activeRunKey,startedAt,endedAt:null,durationMs:null,counts:null,scope:null}`。列表不含 `result` 正文与 `lockKey`。 | `200`; 非法筛选/分页 `400`; 未登录 `401`。只读，不读取服务器原始日志 |
| `GET /api/ops-center/task-runs/:id` | Path: `id`（ObjectId） | TaskRun 投影：`{runId,taskName,runKey,trigger,status,stale,startedAt,endedAt,durationMs,progress,counts:{totalCount,successCount,failureCount},failures,result,assetResults}`。`progress` 为 `{completed,total,updatedAt}|null`；`stale` 由服务端按任务的心跳阈值判定，仅表示 `RUNNING` 超过阈值未更新，不自动改状态。不返回 `lockKey`。 | `200`; 非法 id `400`; 不存在 `404`; 未登录 `401`。只读 |

> `GET /api/ops-center/assets` 的字段口径（TASK-068）：
> - `todayPrice.marketDay` 是 `marketDay.service` 计算的市场日，不是自然日。`priced` / `missing` / `not_listed` 时为目标市场日；`market_closed` / `not_due` 时为状态所指的当前市场日（`todayStr`），避免把上一目标日误标为休市/未到点；`unknown` 时若可确定为目标市场日则返回，否则为 `null`。
> - `todayPrice.status ∈ priced | missing | market_closed | not_due | not_listed | unknown`：`priced` 表示目标市场日已有价格；`missing` 表示已到同步点、市场开市且无价格；`market_closed` 表示当前市场日休市；`not_due` 表示尚未到该市场当日同步点；`not_listed` 表示目标市场日早于资产 `launchDate`；`unknown` 表示市场不受支持、无法确定目标日或价格源不可用。`priceDate` 仅在 `priced` 时返回实际价格入桶日期（`MARKET_TIMEZONE`），否则为 `null`。
> - `basicInfo` 只检查 `symbol/name/market/currency/launchDate` 五个元数据字段；`missingFields` 取 `symbol|name|market|currency|launchDate`（含格式非法），不包含价格、类型、标签或启用状态。
> - `validity.status` 按最近 3 个目标市场日判断：任一有价 `normal`；全空 `needs_review`（表示资产资料可能有问题，**不是采集失败**）；无 `launchDate`、上市不足 3 个市场日或市场不受支持为 `unknown`。休市日不计入 3 个市场日。
> - `history` 的三态契约（TASK-070）：
>   - `unavailable`：从未有可用的 `price-integrity-check` 运行（`SUCCEEDED`/`PARTIAL`、已结束且 `result.assets` 为数组）。此时 `checkedAt/expected/actual/missing/ratio` 全部为 `null`，客户端显示「尚未检查」。
>   - `checked`：最近一次可用运行中该资产状态为 `OK` 或 `GAP`，且 `expected >= 3`；`checkedAt` 为该次运行 `endedAt`，`expected` 为理论交易日数，`actual` 为与理论日匹配的实际有价日数，`missing` 为二者之差，`ratio = actual / expected`（0–1）。客户端按百分比展示，不用 0 冒充未知。
>   - `unknown`：可用运行中没有该资产条目，或条目为 `SKIPPED_NO_LAUNCH_DATE` / `INSUFFICIENT_SAMPLE` / `ERROR`，或关键计数/比例缺失、`expected < 3`，或历史运行查询降级失败。除 `checkedAt` 外其余计数为 `null`；客户端显示「无法判断」。
>   - `GAP` 只表示「检测到缺失交易日」，**不推断**为停牌、上游采集失败或供应商异常；当前模型没有独立的交易状态/采集失败信号。
>   - `missingType=history_gap` 只在 `history.status='checked'` 且 `missing > 0` 时命中；`unavailable` / `unknown` 不得被当成缺口。
> - `missingType` 口径：`validity` 命中待核查/无法判断；`today_price` 只命中 `missing`（休市/未到点/未上市不算缺价）；`basic_info` 命中基础信息不完整；`history_gap` 见上。筛选、搜索、排序和分页全部在服务端完成，客户端不得拉取全量后自行切片。
> - 价格源查询失败时，受影响资产的 `todayPrice.status` 与 `validity.status` 降级为 `unknown`，不得伪造 `missing` / `needs_review`；市场日历计算失败也降级为 `unknown` 并记录 `OPS_CENTER_*_FAILED` 日志。
> - 端点只要求登录，不新增 admin 校验；admin 可见的资产编辑链接是 UI 约定，不是安全边界。
>
> 采集记录口径（TASK-075，`GET /api/ops-center/task-runs` 与详情的 `assetResults`）：
> - 列表合并 TaskRun 与 `taskskips` 跳过事件（MongoDB `$unionWith`，要求 MongoDB ≥ 4.4），服务端统一排序与分页。带 `assetId` 筛选时只匹配 TaskRun（单资产补采匹配 `result.assetId`，其余匹配 `result.assets[].assetId`），跳过事件不关联资产，不出现在结果中。
> - `scope` 是 `result` 的范围摘要：`marketGroup`（今日同步，`null` = 全部 active）、`assetId`/`symbol`（单资产补采）、`assetCount`（`result.assetCount` 或 `result.assets` 长度）、`from`/`to`（`result.from/to`，否则取 `result.assets[]` 的 `from/to` 或 `priceDate` 极值）。`result` 缺失时各字段为 `null`。
> - 详情新增 `assetResults`：四类任务逐资产明细归一为 `{assetId,symbol,market,status,reason,message,from,to,priceDate,missingCount,missingRanges[],missingRangesTruncated,childRunId}`，`status ∈ succeeded \| partial \| failed \| skipped \| unknown`。映射：今日同步 `fetched/skipped/failed`，失败行的 `message` 由同 symbol 的 `failures[].message` 合并（`；` 分隔）；完整性检查 `OK→succeeded`、`GAP→partial`（`reason='GAP'`，`missingCount/missingRanges` 为缺口）、`ERROR→failed`（`message` 同样按 symbol 合并 `failures[]`）、`SKIPPED_NO_LAUNCH_DATE`/`INSUFFICIENT_SAMPLE→skipped`（`reason` 为原状态）；单资产补采按运行状态归一为一行，`reason` 取 `failures[0].category`，`message` 合并全部 `failures[].message`，`missingCount = missingAfterCount`；批量补缺失沿用父 `result.assets[]`，`childRunId` 为子任务 runId，该资产的缺失区间读子任务详情。`result` 缺失（运行中、旧记录、任务异常）时 `assetResults` 为 `null`，不是空数组。
> - 端点只要求登录；member 与 admin 看到同样的只读记录。

> `GET /api/ops-center/task-runs/:id` 的 `runKey` 对正常记录保持稳定；stale 恢复会把旧 `RUNNING` 记录改为 `FAILED` 并改键为 `interrupted:<id>`，审计关联以 `runId` 为准。该字段不参与前端路由或资源定位。

> `POST /api/ops-center/integrity-check`、`POST /api/ops-center/price-sync`、单资产补采与批量补采创建的 TaskRun 的 `result` 形状
> 由 [CRON_WORKER_DEV.md §5.5](./CRON_WORKER_DEV.md#55-result-字段与跳过观测task-057) 维护；历史完整度读模型由
> integrity-check 结果派生，客户端不得自行重算。

> `GET /api/cron/status` 是**只读聚合**端点。价格覆盖按 `byMarket` 的目标日分别查价，顶层 `targetMarketDate` 取最晚目标日，`expected` 和 `fetched` 为各市场的合计。TASK-078 更新了分组目标日规则。其余字段定义见 TASK-054 ExecPlan §4.3/§4.4。

TASK-073 起，`GET /api/cron/status` 不再返回 `assetCompleteness`；`POST /api/asset-integrity/check` 已退休，已登录请求返回 404（未登录仍先返回 401）。历史 TaskRun 保留。

价格同步 `notes` 可包含 `PRICE_NO_NEW_DATA`、`PRICE_STALE`、`PRICE_NOT_FOUND_STREAK`，见 TASK-074 的阈值裁决。提示按服务端的市场日历及已完成的应采批次派生。旧价为提示，估值仍消费原价格值或缺价 `null`。

> **TASK-064（读侧契约兼容，2026-11-05）**：
> - 每个 task 条目新增**可选** `lastSkip: {taskName,runKey,reason,skippedAt,trigger} | null`，来源为 `taskskips` 最近一次事件；`lastSkip` 与 `lastRun` **分离**，不替换、不冒充成功，无集合/无记录时为 `null`。
> - 汇率 `dataState.currencies` 为 `{USD/CAD/HKD: {ok: boolean|null, rateToCny: number|null}}`：`ok:true` 才表示本次写入完成；仅数值形态为 `ok:null`（`NUMERIC_OBSERVATION_ONLY`，不证明成功/方向）；缺币种/非法容器的 `contractReady=false` 并带 `CURRENCY_MISSING`/`CURRENCY_INVALID`/`CONTRACT_NOT_READY`。判级：三币全 ok→`ok`；显式失败全败→`bad`、混合→`warn`；无显式失败但有仅观测/缺失时，有成功项→`warn`，否则 `unknown`。
> - 再平衡 `perPortfolio[]` 每项含 `status`；`due` 只认显式布尔（`null` 保持未知）、`suggestionsCount` 只认显式非负有限数（`null` 不折算 0）。`contractReady` 要求 `perPortfolio` 覆盖全部未归档组合；缺项→`PER_PORTFOLIO_INCOMPLETE`。判级：存在失败→`bad`；到期未解决/`SKIPPED`/未知→`warn`；全部到期项已生成或明确未超阈→`ok`；缺契约→`unknown`。
> - 查询预算：主视图只读聚合由 **6 次增至 7 次**（+1 次 `TaskSkip` 批量聚合，`$sort skippedAt:-1` + `$group $first`，单次拿五项）；detail 视图不查询 `taskskips`，预算与既有行为不变。

未注册的 API 路径：**带合法会话**时返回 `404` 和通用错误结构；未认证请求会先被全站闸门拦为 `401`（闸门在 404 之前）。所有响应还会携带 `X-Trace-Id` 响应头。

## 当前安全边界

自 TASK-058 U1（2026-10-27）起 API 已有登录、身份认证与角色授权：

- 全部业务端点默认要求会话 cookie（`401`）；`admin`/`member` 都能读写业务数据，只有 `/api/users/*` 限 `admin`（`403`）。
- 单租户：**所有账号共享同一份家庭数据**，没有 `ownerId`/`tenantId`/资源级隔离；也给不出「按用户分权」的能力。
- 生产部署必须：TLS + `COOKIE_SECURE=true` + 配置 `CORS_ORIGINS` 白名单；**U1 不得与前端 U2 拆分发布**（否则全站 401）。
- 其余风险（日志脱敏、备份、MongoDB 访问控制）仍按 §DEPLOYMENT 安全边界执行。
