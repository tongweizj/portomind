# 系统架构（ARCHITECTURE）

> 版本：v2.0 · 日期：2026-10-26
> 状态：**现行有效**。v1.0 是未填充的通用英文模板（含 PostgreSQL / Prisma / OAuth / Teams 等本项目**不存在**的设定），v2.0 按实际代码重写，并接收原 PL-0 §6.2 的**技术栈**与**外部集成**两节（该节已随迁移从 PL-0 撤销，本文为唯一归属）。
>
> **本文唯一负责**：架构风格、技术栈、外部集成、模块边界与依赖规则、数据流、持久化架构、架构约束、已知架构债。
>
> **本文不经管**（各主题已有唯一归属，此处只链接，不复制）：

| 主题 | 唯一归属 |
|---|---|
| 系统总览与三进程运行时拓扑 | [DEPLOYMENT.md §1](../manual/DEPLOYMENT.md) |
| 定时任务清单与时间表 | [CRON_WORKER.md §2](../manual/CRON_WORKER.md) |
| 调度引擎 / 两层防重 / TaskRun 契约 | [CRON_WORKER_DEV.md](../dev/CRON_WORKER_DEV.md) |
| 模型字段 / 枚举 / 索引 / 契约缺口 | [DATA_MODEL.md](../dev/DATA_MODEL.md) |
| 前端路由 / 组件 / 数据层 / 设计 token | [CLIENT_DEV.md](../dev/CLIENT_DEV.md) |
| HTTP 端点契约 | [API_CONTRACT.md](../dev/API_CONTRACT.md) |
| 环境变量全表 / 部署步骤 / 安全边界 | [DEPLOYMENT.md](../manual/DEPLOYMENT.md) §4 / §6 / §9 |

---

## 1. 架构风格

**npm workspaces monorepo 的模块化单体**：一个共享业务内核 `shared/`，外加三个薄外壳（Web 前端、API 进程、调度进程）。三进程的拓扑与职责见 [DEPLOYMENT.md §1](../manual/DEPLOYMENT.md)，本文只固定结构决定。

**明确不引入**：消息队列、缓存层（Redis/Memcached）、微服务拆分、进程间 RPC、独立迁移框架。理由：单用户、单实例、数据量以千条计——每多一层基础设施就多一个故障源和一处需要同步的定义。

两条已裁决的结构决定，变更须写新 ADR：

| 决定 | 含义 | 记录 |
|---|---|---|
| 单一调度所有者 | 全部定时任务只在 `cron-worker` 注册；不要用系统 crontab 或 `server` 定时器补 | [ADR-002](./adr/ADR-002-single-scheduler.md)（Accepted） |
| 业务内核单一实现 | 全部业务规则、模型、抓取器只在 `shared/` 存在一份；两个后端进程加载同一份代码 | ADR-002 附带的架构后果 |

---

## 2. 技术栈

> 只记主版本号，精确版本以各 `package.json` 为准（`DOCS.md §3.1`：不写会漂移的硬数字）。

| 层 | 技术 | 要点 |
|---|---|---|
| **前端** `client/` | React 19、Vite 6、React Router 7、TanStack Query 5、axios、Recharts、Tailwind CSS 4、lucide-react | SPA，构建产物 `client/dist/`；**`server` 不托管静态文件**，生产由 Nginx 分发 |
| **共享内核** `shared/` | Node.js（CommonJS）、Mongoose 6、axios、dayjs、winston + winston-daily-rotate-file | 无进程、无入口服务；被两个后端进程共同 require |
| **API 服务** `server/` | Node.js、Express 4、body-parser、cors、express-async-handler、uuid、dotenv | 不注册任何 cron |
| **调度 Worker** `cron-worker/` | Node.js（CommonJS）、node-cron 4、p-limit、minimist、dotenv | 纯 Node，无 Web 框架，不监听端口 |
| **包管理** | npm workspaces | 四个 workspace：`shared` / `server` / `cron-worker` / `client` |
| **测试** | Node.js 内置 `node --test` | `server/test/` = HTTP 集成测试；`cron-worker/test/` = 单元与调度测试 |

**「测试」一行的对账结果**：原 PL-0 写「HTTP 集成 + 表格驱动业务测试」，实测测试**只存在于 `server/` 与 `cron-worker/` 两个 workspace**；`shared/` 与 `client/` 自身既无 test 脚本也无测试依赖。即：共享内核没有独立单测，只能通过两个外壳的测试间接覆盖——这是当前测试结构的真实形状。

**日志**：`winston` 是唯一日志实现（`shared/config/logger.js`），按天切割到 `app-*.log`（通用）与 `task-*.log`（任务专用），默认写入**仓库根 `logs/`**，使 `server` 的日志查询接口能读到 `cron-worker` 产生的任务日志。两个进程写不同文件名，共用目录不互相覆盖。

---

## 3. 外部集成

### 3.1 集成清单

| 集成 | 实际端点 | 用途 | 方向 | 覆盖市场 |
|---|---|---|---|---|
| **Yahoo Finance Chart API** | `query1.finance.yahoo.com` / `query2.finance.yahoo.com`（互为主备） | 行情抓取 | 出站 | 美股、加股（`.TO`）、港股（`.HK`） |
| **东方财富** | `push2.eastmoney.com` / `push2delay.eastmoney.com`（实时行情，互为主备）+ `push2his.eastmoney.com`（K 线历史） | 行情抓取 | 出站 | A 股场内（`CN-SH` / `CN-SZ`），含个股 |
| **天天基金** | `api.fund.eastmoney.com/f10/lsjz`（历史净值接口） | 场外基金净值 | 出站 | 场外基金（`CN-FUND`） |
| **er-api** | `open.er-api.com/v6/latest/CNY` | 汇率采集 | 出站 | USD / CAD / HKD 对 CNY |
| **MongoDB** | `MONGO_URI` | 持久化 | — | **唯一数据依赖** |

### 3.2 统一容错（全仓唯一实现，不要在别处重写）

| 机制 | 实现位置 | 规则 |
|---|---|---|
| 超时 | `shared/fetchers/timeout.js` | 每次外部调用受 `MARKET_DATA_TIMEOUT_MS` 限制（默认 10s），超时抛 `MarketDataError(TIMEOUT)` |
| 重试 | `shared/utils/retry.js` | 仅当 `error.retryable === true` 才重试；最多 3 次，指数退避 + 全量抖动（避免多任务同时重试打崩上游） |
| 错误归一 | `shared/fetchers/errors.js` | 统一收敛为 `MarketDataError`，携带 provider 与错误码，便于任务层区分「可重试」与「数据不存在」 |
| 数据源选择 | `shared/services/priceFetch.service.js` | **唯一**的「市场 → 数据源」判定处 |

**数据源路由规则**（先按资产 `market` 字段，缺失时按 symbol 特征推断）：

```text
CN-FUND                        → 天天基金（净值）
CN / CN-SH / CN-SZ、.SS/.SZ/6位数字 → 东方财富
US / CA / HK、.HK / .TO        → Yahoo Finance
（其余兜底）                    → Yahoo Finance
```

### 3.3 集成约束

- 全部**出站、只读**。外部数据源只用于填充 `prices` / `fxrates`，不得借其写入任何业务集合。
- **不存凭证**：四家均为公开免密钥接口，因此没有凭证管理面；将来若引入付费源，密钥只进环境变量，不进本文档。
- **估值分位（AS-11）无自动抓取**，以手动录入为主——这是已知能力缺口，不是遗漏。
- 缺价/缺汇率时**不得编造**：估值字段记 `null`，不按 0 计（见 §7）。

### 3.4 与 PL-0 原文的对账修正（迁移时发现）

| PL-0 原写法 | 实际代码 |
|---|---|
| 东方财富「`push2` / `push2his`」 | 行情是 `push2` + `push2delay` **主备对**；`push2his` 只服务 K 线历史 |
| 天天基金「`fund.eastmoney.com`」 | 那是 `Referer` 头；真实 API 是 `api.fund.eastmoney.com/f10/lsjz` |
| MongoDB「本地」 | 由 `MONGO_URI` 决定，`server` 与 `cron-worker` **必须指向同一实例**；不是进程内嵌库 |

另有一条**行为缺陷**（不是文档问题）：er-api 返回以 CNY 为基的汇率，采集端却直接当 `rateToCny` 入库，导致折算方向相反。详见 §8 与 [DATA_MODEL.md §5](../dev/DATA_MODEL.md)。

---

## 4. 模块边界与依赖规则

### 4.1 依赖方向

```text
client ──HTTP──> server ──┐
                          ├──> @portomind/shared ──> MongoDB
cron-worker ──────────────┘
```

| 依赖 | 允许 | 说明 |
|---|---|---|
| `client` → `server` | ✅ | 只经 `client/src/services/` 的 axios 实例；不直连数据库、不 require `shared` |
| `server` → `shared` | ✅ | 深引用 `require('@portomind/shared/<领域>/<文件>')` |
| `cron-worker` → `shared` | ✅ | 同上 |
| `shared` → 第三方库 | ✅ | 仅 mongoose / axios / dayjs / winston |
| `shared` → `server` / `cron-worker` / `client` | ❌ | 已核：`shared/` 内 0 处反向引用 |
| `server` ↔ `cron-worker` | ❌ | 两者互不感知，只通过共享 DB 与 `shared/` 协作 |

### 4.2 职责边界

- **`shared/` 承载「业务能力」，`cron-worker/` 只持有「触发权」。** 因此「API 手动触发」与「定时触发」走的是**同一函数**，不存在两套行为。
- **`client/` 只做呈现与交互**：不自算偏离阈值（阈值判定在 `shared`）、不跨币种折算（只有家庭层做）、不直接访问数据库或加载后端模型。
- **`server/` 只做协议层**：入参校验、响应包装（`{ success, data }`）、错误归一；业务规则一律下沉 `shared`。
- **`cron-worker/` 不监听端口、不提供 HTTP 服务**，也不含业务规则。

### 4.3 各模块明确不得做的事

| 模块 | 禁止 |
|---|---|
| `client` | 直连数据库 · 存密钥 · 引入 `@portomind/shared` · 自算百分比阈值 |
| `server` | 注册 cron · 承载业务规则 · 托管静态文件（生产由 Nginx） · 暴露触发/写操作类调度接口（**只读聚合查询除外**，如 `GET /api/cron/status`） |
| `cron-worker` | 引入 Web 框架 · 监听端口 · 直接改业务数据而不经 `shared` 服务层 |
| `shared` | 依赖进程环境（已核：无 `process.exit`、不读 CLI 参数、不注册信号） · 引用任何外壳模块 |

### 4.4 跨包引用方式

必须 `require('@portomind/shared/...')` 走包名深引用，**不得**用相对路径穿透到别的 workspace（如 `require('../../shared/...')`）。这样 `shared` 的物理位置变化才不会波及调用方。

---

## 5. 数据流

### 5.1 读 / 写请求链路

```text
页面 / 组件
  ↓  hooks（TanStack Query，缓存与失效）
  ↓  services/*.js（axios 实例，只拼 URL 与传参）
  ↓  Express router（server/routes/，路径匹配）
  ↓  controller（server/controllers/，校验 + 响应组装）
  ↓  shared/services/*（业务规则）
  ↓  shared/models/*（Mongoose）
  ↓  MongoDB
```

响应统一 `{ success, data }` 包装（`server/utils/apiResponse.js`），异常经 `server/middleware/errorHandler.js` 归一，请求带 `traceId` 贯穿日志。

### 5.2 定时任务链路

```text
cron-worker/index.js
  ↓  src/tasks/scheduler（node-cron 注册，唯一调度入口）
  ↓  任务入口（dailySync / integrityCheck / alertEvaluate / fxSync / rebalanceScheduler）
  ↓  runTrackedTask（写 TaskRun：防重 + 状态）
  ↓  shared/tasks/*（任务编排） → shared/services/*（业务规则） → shared/fetchers/*（外部抓取）
  ↓  MongoDB（业务集合 + taskruns） ／ logs/task-YYYY-MM-DD.log
```

两个进程共用 `LOG_DIR`（默认仓库根 `logs/`），因此 `server` 的日志查询接口可以直接读出 `cron-worker` 写下的任务日志——这是**日志方向**的运行态通道；结构化运行态与数据态由只读聚合接口 `GET /api/cron/status`（TASK-054）提供。

---

## 6. 持久化架构

| 项 | 现状 |
|---|---|
| 数据库 | MongoDB 单库；`server` 与 `cron-worker` 指向同一实例、同一库名 |
| 访问层 | Mongoose 6，模型定义全部在 `shared/models/`（唯一），`server` 与 `cron-worker` 共用同一份 |
| 索引 | 写在 model 定义的 `index` / `unique` 选项里，连接时由 Mongoose 自动创建（未显式配置 `autoIndex`） |
| 迁移机制 | **没有独立迁移框架，也没有 migrations 目录**。schema 变更 = 改 model + 依赖自动索引；历史数据修复靠 `scripts/` 下的一次性脚本 |
| 事务 | **未使用**。全仓无 `startSession` / `withTransaction`，跨集合写入靠服务层顺序与幂等键保证，**不是原子操作** |
| 一致性 | 关键不变量在服务层校验（数据库层无法表达跨集合约束） |
| 保留策略 | **无 TTL**，业务集合与 `taskruns` / `alertevents` 只增不减 |

字段、枚举、默认值、索引明细与已知契约缺口，全部见 [DATA_MODEL.md](../dev/DATA_MODEL.md)（本文不复制字段表）。

---

## 7. 架构约束（必须保持）

以下规则是「结构不被破坏」的底线，评审与实现都要以本文为准：

1. **业务规则只在 `shared/` 实现一次。** 出现第二份拷贝即为缺陷——这是本项目最常复发的问题模式。
2. **`cron-worker` 是唯一调度所有者。** 不要用系统 crontab、`server` 定时器或手工 `setInterval` 补任务。
3. **「市场 → 数据源」判定只在 `priceFetch.service.js`。** 别在任务层或控制器里再写一遍 symbol 前缀判断。
4. **所有外部调用必须包 `withMarketDataTimeout` + `fetchWithRetry`。** 裸 `axios.get` 会把一次网络抖动放大成任务失败。
5. **缺价不猜。** 估值字段为 `null`，绝不按 0 价计算——宁可界面显示「—」，也不给一个看起来正常的错数字。
6. **AUTO 再平衡只写建议与提醒，不写交易。** 任务层永远不得产出交易流水。
7. **跨包引用必须走 `@portomind/shared/*`**，不用相对路径穿透 workspace。
8. **枚举双份必须同步。** `ASSET_TYPES / ASSET_CLASSES / ASSET_MARKETS / ASSET_CURRENCIES` 存在两份：`shared/constants/asset.constants.js` 与 `client/src/constants/enums.js`。改一处必须改另一处（这是当前唯一的双份定义，见 §8）。
9. **前端不自算偏离、不折算币种。** 目标 vs 实际须走 `POST /api/portfolios/:pid/rebalance/check`（含每个标的的绝对/相对偏离），不得在前端复制阈值逻辑。
10. **认证闸门只有一处挂载点（TASK-058 U1 起）**：`app.use('/api', requireAuth)` 覆盖全部业务路由；`/api/auth/*`（login/session 公开、logout 幂等）与 `/api/users/*`（路由级 `requireAuth + requireAdmin`）在其之前挂载。禁止逐路由复制「取 cookie / 查会话 / 判角色」逻辑；测试只允许 stub 会话查询，不得引入跳过闸门的开关。CORS 必须是**白名单 + `credentials:true`**，生产（`NODE_ENV=production`）未配 `CORS_ORIGINS` 启动 fail-fast。

---

## 8. 已知架构债

只列**结构性**问题；逐条的实现细节与影响面在各自归属文档里。

| # | 债 | 现状 | 后果 |
|---|---|---|---|
| 1 | ~~认证与账号运营界面未完成~~（**已闭环：TASK-058 U1+U2+U3，2026-10-27**） | 后端：`User`/`Session` + `requireAuth`/`requireAdmin` + `/api/auth/*` + `/api/users/*` + 默认 admin seed + 登录限速 + CORS 白名单；前端：`/login`、`/account`、`/account/users` + 会话 Provider + 路由守卫 + 401 拦截 + 强制改密闸门 + 顶栏头像下拉，侧栏假「退出登录」已删除（独立真实浏览器验收 28/28 PASS） | 无未认证访问；**U1 与 U2 必须同批发布**（单独 U1 会全站 401） |
| 2 | **CORS 已收敛为白名单**（TASK-058 U1 已实施） | `server/app.js` 使用白名单 + `credentials:true`；生产未配 `CORS_ORIGINS` 启动 fail-fast；开发态有本地默认来源 | 原「任意来源可跨域」风险已解除 |
| 3 | **汇率方向反向**（TASK-051） | 采集端把「1 CNY = X 外币」当 `rateToCny` 入库 | 家庭层折算整体失真，USD/CAD 低估、HKD 高估 |
| 4 | **`symbol` 写法不统一** | 无归一化层；`assets/prices` 用裸代码，部分 `transactions/targets` 带 `.cn` 后缀 | 跨表关联不能假设字符串可直接比较；再平衡可能查不到价 |
| 5 | **TaskRun 契约残缺** | 无 `result` 字段（`strict` 下静默丢弃）、`status` 无 `SKIPPED` | `SUCCEEDED` 只能读成「跑完没抛异常」，不能读成「有新数据」 |
| 6 | **无 TTL / 无归档** | `taskruns`、`alertevents` 无限增长 | 长期运行后查询变慢，且没有清理口径 |
| 7 | **无数据库事务** | 见 §6 | 多集合写入非原子，中断会留下半完成状态（靠幂等键兜底，但并非全覆盖） |
| 8 | **枚举双份定义** | 见 §7 第 8 条 | 新增市场/类型时极易漏同步，前后端表现不一致 |
| 9 | **controller 未完全下沉** | 10 个 controller 中 3 个直接 `require('@portomind/shared/models/*')` 并自行查询 | 与 §7 第 1 条「规则只在 shared」冲突；新功能应走 `shared/service`（新增的 `cronStatus` 即如此），旧的可增量收敛 |
| 10 | **运行态查询只读且尚不完整** | `GET /api/cron/status`（TASK-054）已提供 TaskRun 只读聚合，但 `server` 仍**不提供**触发 / 写操作端点；数据态可视化还需前端（TASK-053/055） | 数据是否「按时到位」目前只能靠接口/日志判断，看板尚未落地 |

---

## 9. 架构决策记录（ADR）

位置：`docs/architecture/adr/`

| ADR | 主题 | 状态 |
|---|---|---|
| [ADR-002](./adr/ADR-002-single-scheduler.md) | 单一调度器：全部定时任务收敛到 `cron-worker` | `Accepted` |
| [ADR-001](./adr/ADR-001-authentication.md) | 认证机制（服务端会话 + 角色） | `Accepted`（U1+U2+U3 均已实施，2026-10-27） |

本文汇总**当前架构是什么**，ADR 解释**为什么这样决定**。新增结构决定时先写 ADR，再改本文。

---

## 10. 相关文档

- [DEPLOYMENT.md](../manual/DEPLOYMENT.md) — 系统总览与运行时拓扑（§1）、环境变量全表（§4）、生产部署（§6）、安全边界（§9）
- [DATA_MODEL.md](../dev/DATA_MODEL.md) — 数据模型、索引、已知契约缺口
- [CLIENT_DEV.md](../dev/CLIENT_DEV.md) — 前端实现、路由、数据层
- [API_CONTRACT.md](../dev/API_CONTRACT.md) — HTTP 端点契约
- [CRON_WORKER_DEV.md](../dev/CRON_WORKER_DEV.md) — 调度引擎、防重、TaskRun 契约
- [PRODUCT_LINES.md](../product/PRODUCT_LINES.md) — 产品定位与七条产品线
- [DOCS.md](../standards/DOCS.md) — 文档结构规范与单一归属规则

---

## 11. 维护规则

**何时更新本文**：新增/移除进程或 workspace · 结构决定变化（新 ADR）· 新增外部集成或数据源 · 依赖方向或模块边界变化 · 持久化方案变化（引入事务/TTL/迁移工具）· 技术栈主版本跃迁。

**不要写进本文**：端点清单（→ `API_CONTRACT`）· 模型字段表（→ `DATA_MODEL`）· 组件与 hooks 清单（→ `CLIENT_DEV`）· 部署命令与运维步骤（→ `DEPLOYMENT` / `CRON_WORKER_OPS`）· 业务口径与计算规则（→ `CLIENT.md §5`）· 任务号与排期（→ `TASKS.md`）。

目标是：**新开发者或 agent 读完本文，能在动手前知道「改哪里、不许碰什么、坑在哪」**。
