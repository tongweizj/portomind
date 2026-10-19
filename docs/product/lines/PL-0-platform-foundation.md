# PL-0 平台基座线（Platform Foundation）

> 版本：v1.0 · 日期：2026-10-15
> 归属：[PRODUCT_LINES.md](../PRODUCT_LINES.md)「产品线 INDEX」中 **PL-0** 的明细子文件
> 内容范围：① 成熟度快评（总表 §2.4） ② 产品线 → 产品模块归属（总表 §3） ③ 全量功能评估 ④ 已实现功能点清单 ⑤ 架构实现明细（合并自原 `architecture/functions.md` §1~§4.11，原文件已[归档](../../archive/functions.md)） ⑥ **全系统参考附录**（API 总表 / 数据模型清单 / 路由与组件清单 / 业务规则速查 / 编码索引） ⑦ 技术债与一致性专项（原总表 §4.4 / §4.5）
> 说明：本线是**支撑线**——不直接交付用户价值，但决定上面六条线的可信度。因此原 `functions.md` 中**跨线**的总览、附录与全局规则收敛于此。

---

## 1. 定位与价值主张

**价值主张：**

**调度、数据质量、可观测性、设计一致性——决定上面六条线的可信度。**

本线不产生「功能」，而产生「信任」：数据是否按时到位、失败是否可见、日志能否追溯、界面是否一致。它被提升为产品级信任项而非纯技术项，因为上述任一环节出问题，都会以**用户可见的不可信**形式外化。

- **上游依赖**：无。
- **下游影响**：PL-1~PL-6 全部。
- **典型断链后果**：调度覆盖缺口 → 某类任务永不自动执行；节假日表未维护 → 误判开市、抓到空数据、误报缺口。

---

## 2. 成熟度快评

| 维度 | 评价 | 说明 |
|---|---|---|
| 功能覆盖 | 中 | 调度 / 防重 / 日历 / 容错 / 可观测性 / 设计 token 均具备 |
| 用户体验 | — | 面向自持运维者而非终端用户 |
| 数据可信 | 中 | ✅ 双份调度已收口（TASK-005）；✅ 枚举降为两份；余：无认证、CORS 过宽 |

**主要短板**：

① 无认证授权 + CORS 开放（P0，公网前必须闭环）；

② 缺数据质量看板；

③ 双轨样式与前端数据层不统一；

④ 节假日表需逐年维护。

---

## 3. 产品线 → 产品模块归属

| 模块 | 包含功能 | 支撑对象 | 现状 |
|---|---|---|---|
| **M0.1 调度与数据质量** | 调度清单、TaskRun 防重、交易日历、抓取容错 / 限流、完整性检查 | PL-2 / PL-4 / PL-5 / PL-6 | 三层防护到位；缺**数据质量看板**与年度流程 |
| **M0.2 系统运维** | 统一响应格式、traceId、请求日志、全局错误处理、日志脱敏、日志查看页 | 全部 | 较完整；日志页数据层不统一 |
| **M0.3 设计系统** | Design token、布局框架、通用状态组件（DataState/KpiCards）、涨跌色语义 | 全部前端 | token 已固化；**双轨样式并存** |

---

## 4. 全量功能评估

> 判定标准见 [PRODUCT_LINES.md](../PRODUCT_LINES.md) §评估框架。判定不改变任何代码。

| 编号 | 能力 | 判定 | 理由（产品视角） | 建议动作 | 优先级 |
|---|---|---|---|---|---|
| M0.1a | 双份调度实现 | ✅ **已完成** | 原：`server/tasks` 与 `cron-worker/tasks` 并存、能力已分化；已由 TASK-005 收敛为 `shared/` 唯一实现 + `cron-worker` 唯一调度所有者 | 已完成（ADR-002） | ~~P0~~ 已闭环 |
| M0.1b | TaskRun 防重 | 保留 | 进程内锁 + 数据库唯一索引双层，跨重启有效 | — | — |
| M0.1c | 交易日历 | **强化** | CN/HK `2027+` 未维护，未维护年份按空表处理（有 warn 但易忽略） | 建立「年度维护」清单与到期提醒；维护遗漏时升级为可见告警 | **P1** |
| M0.1d | 抓取容错 / 限流 | 保留 | 超时分类、主备回退、指数退避 + 抖动，工程成熟 | — | — |
| M0.1e | 完整性检查 | **修改** | 逻辑正确但文件偏大（约 386 行）且截断无提示 | 拆分 + 补截断提示（与 AS-07 同一动作） | P1 |
| M0.2a | 统一响应 / traceId / 脱敏 | 保留 | 横切能力齐全，可观测性到位 | — | — |
| M0.2b | 日志查看页 | **修改** | 手写 `useState/useEffect`，与全站 Query 数据层不一致 | 统一到 Query 数据层（与前端数据层合并一并处理） | P2 |
| M0.2c | CORS `origin:true` | **修改** | 实际允许任意来源——虽仅可信网络部署，但与「不暴露公网」的定位不一致，属底线风险 | 收紧为白名单（配置化） | **P0** |
| M0.2d | 无认证授权 | **强化** | 无登录 / 无多用户 / 无资源级授权；ROADMAP P1 前不可公网 | 公网前完成认证；即使内网也建议最少口令保护 | **P0**（公网前置） |
| M0.3a | Design token | 保留 | 主色 / 涨跌色等已固化，语义一致 | — | — |
| M0.3b | 双轨样式 | **合并** | 内联 token style 与 Tailwind 两套并存，长期维护成本高 | 明确单一主路径（建议 token + 组件封装），逐步收敛 | P2 |
| M0.3c | 通用状态组件 | 保留 | DataState 三态全站复用 | — | — |

---

## 5. 已实现功能点清单

### M0.1 调度与数据质量

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| — | 唯一调度所有者 | **`cron-worker` 是全项目唯一会注册 cron 的进程**；<br />`server` 侧无任何调度启动路径；<br />`shared/` 承载业务能力、worker 只持「触发权」，API 手动端点与定时触发走**同一函数** | TASK-005 / ADR-002 |
| — | 调度清单（5 类） | 价格同步 `0 3 * * *`、<br />完整性检查 `30 3 * * *`、提醒评估 `0 4 * * *`、汇率采集 `30 9 * * *`、自动再平衡 `0 0 * * *` | cron-worker |
| — | 统一调度工厂 | 5 个调度器统一由 `createCronScheduler()` 创建，共用 `SCHEDULER_TIMEZONE`（回落 `MARKET_TIMEZONE` → `America/Toronto`） | `schedulers/cronScheduler.js` |
| — | 全局总开关 | `SCHEDULER_ENABLED=false` 时 worker 不注册任何调度器（仅 worker 读取） | 环境变量 |
| — | 启动自检 | worker 启动打印 `SCHEDULERS_STARTED {"count":5,"owner":"cron-worker"}`，`count` 不足 5 说明有调度器注册失败或被关停 | 启动日志 |
| — | TaskRun 双层防重 | ① 进程内锁（`activeTasks` Map）→ `SKIPPED/ALREADY_RUNNING`；② 数据库锁（`TaskRun {taskName,runKey}` 唯一索引）→ `SKIPPED/DUPLICATE_RUN_KEY`（跨进程 / 跨重启有效） | `runTrackedTask` |
| — | 任务状态流转 | `RUNNING` → `failureCount>0 ? PARTIAL : SUCCEEDED`；异常 → `FAILED`；`finally` 无条件释放内存锁 | TaskRun |
| — | 逐资产 / 逐规则故障隔离 | 单条失败仅记录 `{item, category, provider, retryable, message}`，不中断整批 | 调度与引擎 |
| — | 交易日历 | `isMarketOpenToday(market)`：周末 false；CN/HK 查静态节假日表，US/CA 按规则计算（含 `easterSunday` 算法）；**静态表未维护年份打 warn**（避免「无节假日」被静默当全开市）；已维护 CN/HK 2024–2026，**2027+ 未维护** | `calendar.service.js` |
| — | 市场时区与日期归桶 | 市场时区 US `America/New_York` / CA `America/Toronto` / CN `Asia/Shanghai` / HK `Asia/Hong_Kong`；`canonicalDayTimestamp` / `dateBounds` / `monthBounds` / `todayString` 统一归桶 | `marketTime.js` |
| — | 完整性检查算法 | `expectedTradingDates`（按 launchDate 累加应有交易日）→ `missingDates`（任一候选桶都不存在的日期）+ `completenessRatio` → `groupMissingRanges`（间隔 ≤3 天合并）→ `clipRepairRanges`（默认 30 天窗口）→ `repairAsset` → **重查收敛**；未填 `launchDate` 记 `SKIPPED_NO_LAUNCH_DATE` | `integrityCheck.js` |
| — | 手动 CLI 入口 | `sync:prices`（价格同步）、`sync:history`（历史回补）、`check:integrity [--no-repair] [--dry-run]`（完整性检查） | cron-worker CLI |

### M0.2 系统运维

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| — | 统一响应格式 | 成功 `{success:true, data, pagination?}`；失败 `{success:false, message, traceId, details?}` | `apiResponse.js` |
| — | traceId 链路 | 每请求生成 UUID v4 → `req.traceId` + 响应头 `X-Trace-Id` | middleware |
| — | 请求日志 | `onFinished` 后记 `HTTP_ACCESS`：`{traceId, method, url(脱敏), status, durationMs}` | middleware |
| — | 全局错误处理 | `UNHANDLED_ERROR`；状态码推断（`ValidationError/CastError` → 400，`11000` → 409，否则 500） | errorHandler |
| — | 日志脱敏 | 敏感键（`authorization/cookie/password/secret/token/api-key/mongo_uri/database_url`）→ `[REDACTED]`；URL 查询串敏感参数同样处理；支持循环引用 | `logSanitizer.js` |
| — | 日志配置 | `app-%DATE%.log`（含 exception/rejection handler）+ `task-%DATE%.log`；`LOG_MAX_FILES` 控制保留（默认 60d） | `logger.js` |
| — | 日志查看页 | `/logs`：Server Log / Task Log 切换，日期 + 级别筛选，分页（**手写 `useState/useEffect`，未走 Query**） | `/logs` |
| — | 日志 API | `GET /logs`、`GET /logs/tasks` | API |
| — | CORS（现状） | `cors({origin:true})`——**当前实际允许任意来源**（白名单实现已注释、`CORS_ORIGINS` 未被读取） | `app.js` |
| — | 认证授权（现状） | **当前无登录、无多用户、无资源级授权**，仅适合可信本地网络；公网前必须闭环 | ADR-001（模板） |

### M0.3 设计系统

| 编号 | 功能点 | 功能描述 | 入口 |
|---|---|---|---|
| — | Design token | 品牌紫 `#635BFF`、品牌浅紫 `#EEEDFF`、页面底 `#F6F8FA`、卡片 `#FFFFFF`、边框 `#E3E8EE`、文本 `#0A2540/#5E6B7E/#8A95A5`、**涨 `#DF1B41` / 跌 `#0E9F6E`**（A 股约定）、警告 `#F5A524` | `design-tokens.js` |
| — | 布局 token | `sidebarWidth 232`、`topbarHeight 64`、`contentPaddingX 32`、`contentPaddingY 24` | `design-tokens.js` |
| — | 字体 | 中文 Noto Sans SC 优先，数字 Inter（`fontStack.numeric`） | `design-tokens.js` |
| — | 布局框架 | `AppLayout`：Sidebar（232px，8 项导航，激活态紫底紫字）+ 顶栏（64px，含未读铃铛）+ `<Outlet/>`；底部版本 `v0.9.2 · 自托管` | `layout/AppLayout` |
| — | 通用状态组件 | `DataState`：`LoadingState` / `EmptyState` / `ErrorState` 三态占位（全站复用） | `DataState` |
| — | 通用按钮组 | `ButtonGroup`：按 `type`（default / primary / danger）渲染按钮组 | `ButtonGroup` |
| — | 组合卡片组件 | `PortfolioCard`：市值分桶 / 持仓数 / `DriftBadge` / 未读提醒数 | `PortfolioCard` |
| — | 通用交易表 | `TransactionTable`：列可配，日期自动截取 | `TransactionTable` |
| — | KPI 卡组件 | `KpiCards`：4 张 KPI 卡（总市值 / 今日盈亏 / 累计盈亏比 / 持有资产数），已被 `PositionOverview` 引用 | `KpiCards` |
| — | 状态与数据层 | TanStack Query hooks（`retry:1`、`staleTime:60s`）：`usePortfolio` / `usePortfolios` / `useTransactions` / `useFamilySummary` / `useFxRates` / `useAlertRules` / `useAlertEvents` / `useUnreadAlertCount`（**5s 轮询**）+ 对应 mutation | `hooks/` |
| — | Service 层 | 10 个：`api.js`（axios 实例，`baseURL = VITE_API_URL \|\| /api`，超时 15s，响应拦截器直返 data、错误挂 `apiMessage/traceId/status`）+ `asset/portfolio/position/price/transaction/rebalance/alert/family/log` 九个领域 service | `services/` |
| — | 双轨样式（现状） | 布局 / 详情页用内联 token style，业务页面多用 Tailwind 工具类，**两套并存** | `client/src` |

---

## 6. 架构实现明细（合并自原 functions.md §1~§4.11）

### 6.1 文档目的与调研方法（原 §1）

本文（原 `functions.md`）是 PortoMind 实现的**功能架构清单**，回答三个问题：系统现在能做什么、这些能力由谁承载、功能之间的边界与依赖。以「功能」为编排单位（而非文件），与 [API_CONTRACT.md](../../dev/API_CONTRACT.md)（接口契约）、[ARCHITECTURE.md](../../architecture/ARCHITECTURE.md)（分层与依赖规则）互补。

**调研方法**：通读 `shared/` 全部业务内核（`models` / `services` / `tasks` / `fetchers` / `constants` / `config` / `utils`）；通读 `server/` 路由、控制器、中间件与任务 CLI 薄壳；通读 `client/src` 全部页面、组件、hooks、services、constants、utils；通读 `cron-worker/src` 全部调度器与任务；交叉核对 `PRD.md` 的功能编码与 `API_CONTRACT.md` 端点表。

### 6.2 系统总览（原 §2）

**定位**：自托管的个人 / 家庭投资组合管理应用，面向单用户本地可信网络部署。核心业务闭环：

```
资产主数据 → 交易流水 → 持仓/盈亏 → 目标配置 → 再平衡建议 → 提醒中心 → 家庭 RMB 汇总
                              ↑                               ↑
                       行情价格同步（每日）            汇率采集（每日）
```

**运行时形态（两进程 + 两代码模块）**：仓库为 **npm workspaces monorepo**，四个 workspace 中 `shared/` 是**代码模块（不是进程）**，被 `server` 与 `cron-worker` 两个进程共同加载：

| 模块 | 目录 | 形态 | 职责 | 入口 |
|---|---|---|---|---|
| **共享内核** | `shared/` | 库（无进程） | 全部业务引擎：models / services / tasks / fetchers / constants / config / utils | `shared/index.js` |
| **Web 前端** | `client/` | 进程 | SPA 界面，全部业务操作与可视化 | `client/src/main.jsx` |
| **API 服务** | `server/` | 进程 | REST API + 调度只读状态接口；**不注册任何 cron** | `server/server.js` → `app.js` |
| **调度 Worker** | `cron-worker/` | 进程 | **全项目唯一调度所有者**：5 类定时任务的注册与触发 | `cron-worker/index.js` |

> **启动约束（TASK-005 后已收敛）**：`cron-worker` 是**唯一**会注册 cron 的进程，`server` 侧不存在调度启动路径，`SCHEDULER_ENABLED` 只由 worker 读取。生产环境由 PM2 分别保活 `portomind-api` 与 `portomind-worker`，不再使用系统 crontab。`server` 与 `cron-worker` **共享同一个 MongoDB**，也共享 `shared/` 同一份业务实现——业务逻辑不存在第二份拷贝。
>
> **职责边界**：`shared/` 承载「业务能力」，`cron-worker` 只持有「触发权」。因此「API 手动触发端点」与「worker 定时触发」走的是**同一函数**，行为一致。详见 §6.5 与 [CRON_WORKER.md](../../manual/CRON_WORKER.md) §3。

**技术栈**

| 层 | 技术 |
|---|---|
| 前端 | React 19、Vite 6、React Router 7、TanStack Query 5、axios、recharts、Tailwind CSS 4、lucide-react |
| 共享内核 | Node.js（CommonJS）、Mongoose 6、axios、dayjs、winston（+ daily-rotate-file） |
| API 服务 | Node.js、Express 4、`@portomind/shared` |
| Worker | Node.js（CommonJS）、node-cron、`@portomind/shared`、p-limit、minimist、dotenv |
| 包管理 | npm workspaces（`shared` / `server` / `cron-worker` / `client`） |
| 测试 | Node.js 内置 `node --test`（HTTP 集成 + 表格驱动业务测试） |

**外部集成**

| 集成 | 用途 | 方向 | 覆盖市场 |
|---|---|---|---|
| Yahoo Finance Chart API | 行情抓取 | 出站 | 美股、加股（`.TO`）、港股（`.HK`） |
| 东方财富（push2 / push2his） | 行情抓取 | 出站 | A 股场内（`CN-SH` / `CN-SZ`），含个股 |
| 天天基金（fund.eastmoney.com） | 行情抓取 | 出站 | 场外基金（`CN-FUND`） |
| er-api（open.er-api.com） | 汇率采集 | 出站 | USD / CAD / HKD 对 CNY |
| MongoDB | 持久化 | 本地 | 唯一数据依赖 |

> 估值分位（AS-11）**无自动抓取**，以手动录入为主。

### 6.3 功能域地图与编码对照（原 §3）

**功能编码对照**（PRD 采用模块化需求编码，原文档沿用该编码以便双向追溯）：

| 前缀 | 功能域 | 编号范围 | 展开位置 |
|---|---|---|---|
| `AS` | 资产管理与行情价格 | AS-01 ~ AS-11 | [PL-1](./PL-1-ledger.md)（AS-01~03/09）、[PL-2](./PL-2-market-data.md)（AS-04~08/10/11） |
| `TR` | 交易记录与持仓计算 | TR-01 ~ TR-09 | [PL-1](./PL-1-ledger.md) |
| `CM` | 组合管理与配置 | CM-01 ~ CM-20 | [PL-3](./PL-3-portfolio.md)（CM-01~08/11~20）、[PL-4](./PL-4-rebalancing.md)（CM-09/10） |
| `RB` | 再平衡 | RB-01 ~ RB-11 | [PL-4](./PL-4-rebalancing.md) |
| `AL` | 提醒中心 | AL-01 ~ AL-10 | [PL-5](./PL-5-alerting.md) |
| `FAM` | 家庭视图与汇率 | FAM-01 ~ FAM-04 | [PL-6](./PL-6-household.md) |
| — | 估值分位 | AS-11 | [PL-2](./PL-2-market-data.md) |
| — | 调度与数据质量 / 系统运维 / 设计系统 | — | 本文件 §6.4 / §6.5 / §5 M0.3 |

**全景功能清单（12 个功能域 → 产品线映射）**

| # | 功能域 | 承载模块 | 归属产品线 |
|---|---|---|---|
| 1 | 资产管理 | client + shared | [PL-1](./PL-1-ledger.md) |
| 2 | 行情价格 | shared + cron-worker | [PL-2](./PL-2-market-data.md) |
| 3 | 交易记录 | client + shared | [PL-1](./PL-1-ledger.md) |
| 4 | 持仓与成本引擎 | shared | [PL-1](./PL-1-ledger.md) |
| 5 | 组合管理 | client + shared | [PL-3](./PL-3-portfolio.md) |
| 6 | 再平衡 | client + shared（AUTO **触发**在 cron-worker） | [PL-4](./PL-4-rebalancing.md) |
| 7 | 提醒中心 | client + shared（评估**触发**在 cron-worker） | [PL-5](./PL-5-alerting.md) |
| 8 | 家庭视图与汇率 | client + shared（采集**触发**在 cron-worker） | [PL-6](./PL-6-household.md) |
| 9 | 估值分位 | shared | [PL-2](./PL-2-market-data.md) |
| 10 | 任务调度与数据质量 | cron-worker | 本文件 |
| 11 | 系统运维 | client + server | 本文件 |
| 12 | 设计系统 | client | 本文件 |

**功能域依赖关系**

```text
资产管理 (1) ──┐
               ├──> 交易记录 (3) ──> 持仓/成本引擎 (4) ──┐
行情价格 (2) ──┘                                          ├──> 再平衡 (6)
                                                          │
组合管理 (5) ──(目标配置)─────────────────────────────────┘
                     │
                     ├──> 提醒中心 (7) ←── 估值分位 (9)
                     │
                     └──> 家庭视图 (8) ←── 汇率

任务调度 (10) ──驱动──> 行情价格 (2) / 提醒中心 (7) / 汇率 / 再平衡 (6)
系统运维 (11) ──横切──> 全部
```

### 6.4 任务调度与数据质量（原 §4.10）

**唯一调度所有者：`cron-worker`**。全部 5 类定时任务均由 worker 注册，`server` 不注册任何 cron。

| 任务 | 调度器文件 | cron（默认） | 内容 | 开关 |
|---|---|---|---|---|
| 价格同步 | `schedulers/priceScheduler.js` | `0 3 * * *` | 逐资产开市校验 + 抓取 + 幂等入库 | `PRICE_SYNC_CRON` |
| 完整性检查 | `schedulers/healthScheduler.js` | `30 3 * * *` | 应有交易日 vs 实际，缺口自动补全 | `HEALTH_CHECK_CRON` |
| 提醒评估 | `schedulers/alertScheduler.js` | `0 4 * * *` | `evaluateAll()` 全量规则评估 | `ALERT_EVAL_CRON` |
| 汇率采集 | `schedulers/fxScheduler.js` | `30 9 * * *` | 三币种对 CNY 采集入库 | `FX_SYNC_CRON` |
| 自动再平衡 | `schedulers/rebalanceScheduler.js` | `0 0 * * *` | **单日分发**：逐组合判到期 → 阈值检查 → 生成建议 → 写 AlertEvent | `REBALANCE_CHECK_CRON` |

> 上述路径均相对 `cron-worker/src/`。五个调度器统一由 `createCronScheduler()` 工厂创建（`schedulers/cronScheduler.js`），共用 `SCHEDULER_TIMEZONE`。

全局总开关：`SCHEDULER_ENABLED=false` 时 worker 不注册任何调度器（`server` 不读取该变量）。调度时区 `SCHEDULER_TIMEZONE`（回落 `MARKET_TIMEZONE` → `America/Toronto`）。

> ✅ **覆盖完整性（TASK-005 已收口）**：单一所有者下**全部 5 类任务都会自动运行**。迁移前「`cron-worker` 缺提醒/汇率/再平衡、`server` 缺完整性检查」的覆盖缺口已消除。决策依据见 [ADR-002](../../architecture/adr/ADR-002-single-scheduler.md)，运维操作见 [CRON_WORKER.md](../../manual/CRON_WORKER.md) §3。
>
> **启动自检**：worker 启动日志会打印 `SCHEDULERS_STARTED {"count":5,"owner":"cron-worker"}`。`count` 不足 5 说明有调度器注册失败或被环境变量关停。

**TaskRun 防重机制（两层防重）**

1. **进程内锁**：`activeTasks` Map，以 `taskName` 为键；已在跑 → `SKIPPED/ALREADY_RUNNING`。
2. **数据库锁**：`TaskRun` 的 `{taskName, runKey}` **唯一索引**，重复插入 `11000` → `SKIPPED/DUPLICATE_RUN_KEY`（跨进程/跨重启有效）。

**状态流转**：`RUNNING` → `failureCount>0 ? PARTIAL : SUCCEEDED`；异常 → `FAILED`；`finally` 无条件释放内存锁。

**逐资产故障隔离**：单资产失败仅记录 `{item, category, provider, retryable, message}`，不中断整批。

**交易日历与市场时区**

- `isMarketOpenToday(market)`：周末直接 `false`；CN/HK 查静态节假日表，US/CA 按规则计算。
- **US**（NYSE）：元旦、MLK Day、Presidents' Day、Good Friday、Memorial Day、Juneteenth、Independence Day、Labor Day、Thanksgiving、Christmas（周末顺延）。
- **CA**（TSX）：元旦、Good Friday、Victoria Day、Canada Day、Labour Day、Truth and Reconciliation、Thanksgiving、Christmas、Boxing Day。
- `easterSunday`：Anonymous Gregorian 算法。
- **静态表告警**：CN/HK 年份未维护时按空表处理并打 warn（每 `(label, year)` 一次），避免「无节假日」被静默当全开市。
- 已维护：CN `2024/2025/2026`；HK `2024/2025/2026`；**2027+ 未维护**。

**市场时区**（`shared/config/markets.js`）：US `America/New_York`、CA `America/Toronto`、CN 系 `Asia/Shanghai`、HK `Asia/Hong_Kong`。

**日期归桶**（`shared/utils/marketTime.js`，两进程共用同一实现）：

- `MARKET_TIMEZONE`（默认 `America/Toronto`），启动时非法即抛错。
- `canonicalDayTimestamp`：把任意时间戳规范到该市场日 `startOf('day')` 的 UTC。
- `dateBounds` / `monthBounds`：市场日的 UTC `[start, end)` 边界。
- `todayString`：市场当日字符串（用于调度 `runKey`）。

### 6.5 系统运维与横切关注点（原 §4.11）

**承载**：`server/middleware/*`、`server/utils/apiResponse.js`、`shared/config/logger.js`、`shared/utils/logSanitizer.js`、`client/src/pages/LogViewer.jsx`

| 能力 | 说明 |
|---|---|
| 统一响应格式 | 成功 `{success:true, data, pagination?}`；失败 `{success:false, message, traceId, details?}` |
| traceId | 每请求生成 UUID v4 → `req.traceId` + 响应头 `X-Trace-Id` |
| 请求日志 | `onFinished` 后记 `HTTP_ACCESS`：`{traceId, method, url(脱敏), status, durationMs}` |
| 全局错误处理 | `UNHANDLED_ERROR`；状态码推断（`ValidationError/CastError` → 400，`11000` → 409，否则 500） |
| 日志脱敏 | 敏感键（`authorization/cookie/password/secret/token/api-key/mongo_uri/database_url`）→ `[REDACTED]`；URL 查询串敏感参数同样处理；支持循环引用 |
| 日志配置 | `app-%DATE%.log`（含 exception/rejection handler）+ `task-%DATE%.log`；`LOG_MAX_FILES` 控制保留（默认 60d） |
| 日志查看页 | `/logs`：Server Log / Task Log 切换，日期 + 级别筛选，分页（手写 `useState/useEffect`，未走 Query） |
| CORS | `cors({origin: true})`——**当前实际允许任意来源**（白名单校验已注释） |
| 认证授权 | **当前无登录、无多用户、无资源级授权**，仅适合可信本地网络 |

---

## 7. 全系统参考附录（合并自原 functions.md §5~§8 / §10）

> 本附录为**跨线共享**的参考信息，各产品线子文件不再重复；涉及具体功能时请回到对应子文件。

### 7.1 API 端点总表

> 前缀 `/api`；`page/pageSize` 统一（`pageSize ≤ 100`，价格列表 ≤ 200）；创建返回 `201`，其余 `200`；错误码：`400` 参数/请求体无效、`404` 不存在、`409` 唯一键冲突、`422` 导入整批回滚、`500` 未处理错误、`502` 汇率采集失败。

| 模块 | 端点 | 归属 |
|---|---|---|
| 资产 | `GET/POST /assets`、`GET/PUT/DELETE /assets/:id` | [PL-1](./PL-1-ledger.md) |
| 价格 | `GET /prices/today`、`GET /prices/date/:date`、`GET /prices/symbol/:symbol/history`、`POST /prices`、`GET/PUT/DELETE /prices/:id` | [PL-2](./PL-2-market-data.md) |
| 交易 | `GET/POST /transactions`、`POST /transactions/import`、`GET/PUT/DELETE /transactions/:id` | [PL-1](./PL-1-ledger.md) |
| 组合 | `GET/POST /portfolios`、`GET /portfolios/summary`、`GET/PUT/DELETE /portfolios/:id` | [PL-3](./PL-3-portfolio.md) |
| 组合统计 | `GET /portfolios/:id/stats`、`GET /portfolios/:id/stats/actual-ratios`、`GET /portfolios/:pid/stats/positions`、`GET /portfolios/:pid/positions/history`、`GET /portfolios/:pid/transactions` | [PL-1](./PL-1-ledger.md) / [PL-3](./PL-3-portfolio.md) |
| 再平衡 | `GET/PUT /portfolios/:pid/rebalance-settings`、`POST .../rebalance/check`、`POST .../rebalance/suggestions`、`POST .../rebalance/execute`、`GET .../rebalance/history`、`POST /rebalance/:recordId/revoke`、`POST /rebalance/:recordId/reexecute` | [PL-4](./PL-4-rebalancing.md) |
| 提醒 | `GET /alerts/rules`、`POST /alerts/rules`、`GET/PUT/DELETE /alerts/rules/:id`、`GET /alerts/events`、`GET /alerts/events/unread-count`、`PATCH /alerts/events/:id/read`、`POST /alerts/evaluate` | [PL-5](./PL-5-alerting.md) |
| 家庭 | `GET /family/summary`、`GET /family/fx/rates`、`PUT /family/fx/rates/:currency`、`POST /family/fx/sync` | [PL-6](./PL-6-household.md) |
| 估值 | `GET /valuations`、`PUT /valuations/:indexCode/:metric` | [PL-2](./PL-2-market-data.md) |
| 日志 | `GET /logs`、`GET /logs/tasks` | 本文件（M0.2） |

详细请求/响应见 [API_CONTRACT.md](../../dev/API_CONTRACT.md)。

### 7.2 数据模型清单（全量）

**承载**：`shared/models/*.js`（**唯一实现**，server 与 cron-worker 均引用同一份，字段与索引只有一处定义）

| 模型 | 关键字段 | 唯一索引 / 主索引 | 归属 |
|---|---|---|---|
| **Asset** | `symbol`(uniq, 大写, 正则)、`name`、`market`、`currency`、`type`、`assetClass`(可 null)、`tags[]`、`launchDate`、`active`、`watchlist` | `{symbol:1}` unique | [PL-1](./PL-1-ledger.md) |
| **Portfolio** | `name`、`description`、`type`(活钱/稳健/长期)、`currency`、`accountType`、`archived`、`targets[{symbol,targetRatio,level}]`、`rebalanceSettings{absoluteDeviation,relativeDeviation,timeInterval,rebalanceSchedule}` | — | [PL-3](./PL-3-portfolio.md) |
| **Transaction** | `portfolioId`、`assetType`、`symbol`、`market`、`currency`、`action`、`quantity`、`price`、`fee`、`date`、`notes` | `{portfolioId,date:-1,_id:-1}`、`{portfolioId,symbol,date,_id}` | [PL-1](./PL-1-ledger.md) |
| **Price** | `symbol`、`name`、`price`、`currency`、`market`、`timestamp`(UTC 市场日边界) | `{symbol,timestamp}` **unique**；`{timestamp:-1,symbol:1}` | [PL-2](./PL-2-market-data.md) |
| **FxRate** | `currency`(USD/CAD/HKD)、`rateToCny`、`date`、`source`(er-api/manual)、`note` | `{currency,date:-1}` **unique** | [PL-6](./PL-6-household.md) |
| **Valuation** | `indexCode`、`indexName`、`metric`(pe/pb)、`value`、`percentile`、`date`、`source`、`note` | `{indexCode,metric,date:-1}` **unique** | [PL-2](./PL-2-market-data.md) |
| **RebalanceRecord** | `portfolioId`、`mode`(AUTO/MANUAL)、`suggestions[]`、`status`(PENDING/EXECUTED/REVOKED)、`triggeredThresholds[]`、`thresholdDetails[]`、`warnings[]`、`feeModel`、`cashBudget`、`funding`、`classMode`、`executedTransactionIds[]`、`reversalTransactionIds[]`、`sourceRecordId`、`executedAt`、`revokedAt` | — | [PL-4](./PL-4-rebalancing.md) |
| **AlertRule** | `scope`、`portfolioId`、`symbol`、`name`、`ruleType`、`params`、`direction`、`reason`、`validUntil`、`cooldownDays`、`active` | `{active,ruleType}`、`{portfolioId,active}`、`{symbol,active}` | [PL-5](./PL-5-alerting.md) |
| **AlertEvent** | `ruleId`、`portfolioId`、`symbol`、`level`、`title`、`content`、`snapshot`、`triggeredAt`、`status` | `{status,triggeredAt:-1}`、`{ruleId,triggeredAt:-1}`、`{portfolioId,status}` | [PL-5](./PL-5-alerting.md) |
| **TaskRun** | `taskName`、`runKey`、`trigger`、`status`、`startedAt`、`endedAt`、`durationMs`、`totalCount`、`successCount`、`failureCount`、`failures[]` | `{taskName,runKey}` **unique**；`{startedAt:-1,taskName}` | 本文件（M0.1） |

### 7.3 前端路由与组件清单

**路由表**（`client/src/router.jsx`）——全部页面嵌套于 `<AppLayout />`（共享 Sidebar + 顶栏）。

| 路径 | 页面 | 功能 | 归属 |
|---|---|---|---|
| `/` | `Dashboard` | 提醒中心（事件流/筛选/立即评估/规则入口） | [PL-5](./PL-5-alerting.md) |
| `/family` | `Family` | 家庭视图 | [PL-6](./PL-6-household.md) |
| `/alerts/rules` | `AlertRules` | 提醒规则管理 | [PL-5](./PL-5-alerting.md) |
| `/transactions` | `TransactionList` | 全局交易列表 | [PL-1](./PL-1-ledger.md) |
| `/transactions/new` | `AddTransaction` | 新增交易 | [PL-1](./PL-1-ledger.md) |
| `/transactions/import` | `ImportTransactions` | CSV 导入向导 | [PL-1](./PL-1-ledger.md) |
| `/transactions/edit/:id` | `EditTransaction` | 编辑交易 | [PL-1](./PL-1-ledger.md) |
| `/assets` | `AssetList` | 资产列表 | [PL-1](./PL-1-ledger.md) |
| `/assets/new`、`/assets/edit/:id` | `AssetForm` | 资产表单 | [PL-1](./PL-1-ledger.md) |
| `/prices` | `Prices/Today` | 今日/指定日价格 | [PL-2](./PL-2-market-data.md) |
| `/prices/:symbol/history` | `Prices/History` | 价格历史 | [PL-2](./PL-2-market-data.md) |
| `/portfolios` | `Portfolio/List` | 组合卡片列表 | [PL-3](./PL-3-portfolio.md) |
| `/portfolios/new`、`/portfolios/edit/:id` | `PortfolioForm` | 组合表单 | [PL-3](./PL-3-portfolio.md) |
| `/portfolios/view/:id[/:tab]` | `Portfolio/Detail` | 组合详情（4 Tab） | [PL-3](./PL-3-portfolio.md) |
| `/logs` | `LogViewer` | 日志查看 | 本文件（M0.2） |
| `*` | — | 重定向 `/portfolios` | — |

**组合详情 Tab**（默认 `positions`）：`positions` 持仓概览 / `position-history` 持仓历史 / `rebalance` 再平衡（3 子 Tab）/ `transactions` 交易记录。

**组件清单**

| 组件 | 职责 |
|---|---|
| `layout/AppLayout` | 主框架：Sidebar(232px) + 顶栏(64px，含未读铃铛) + `<Outlet/>` |
| `layout/Sidebar` | 8 项导航（激活态紫底紫字）+ 底部版本 `v0.9.2 · 自托管` |
| `DataState` | `LoadingState` / `EmptyState` / `ErrorState` 三态占位（全站复用） |
| `ButtonGroup` | 按 `type`（default/primary/danger）渲染按钮组 |
| `PortfolioCard` | 组合卡片：市值分桶 / 持仓数 / DriftBadge / 未读提醒数 |
| `TransactionTable` | 通用交易表（列可配，日期自动截取） |
| `KpiCards` | 4 张 KPI 卡（总市值 / 今日盈亏 / 累计盈亏比 / 持有资产数） |

**状态与数据层**——**TanStack Query hooks**（`retry:1`，`staleTime: 60s`）

| Hook | queryKey | 失效/轮询 |
|---|---|---|
| `usePortfolio(id)` | `['portfolio', id]` | — |
| `usePortfolios({includeArchived})` | `['portfolios-summary', ...]` | — |
| `useTransactions(portfolioId)` | `['transactions', pid]` | stale 30s |
| `useFamilySummary()` / `useFxRates()` | `['family-summary']` / `['fx-rates']` | — |
| `useUpsertFxRate()` / `useSyncFxRates()` | mutation | 失效 `fx-rates` + `family-summary` |
| `useAlertRules(params)` / `useAlertEvents(params)` | `['alert-rules'...]` / `['alert-events'...]` | events stale 30s |
| `useUnreadAlertCount()` | `['alert-unread-count']` | **`refetchInterval: 5000`**（全局轮询） |
| `useCreateAlertRule` / `useUpdateAlertRule` / `useDeleteAlertRule` | mutation | 失效 `alert-rules` |
| `useMarkAlertEventRead()` / `useEvaluateAlerts()` | mutation | 失效 `alert-events` + `alert-unread-count` + `portfolios-summary` |

> 资产/价格/交易/持仓/再平衡/日志页多为**直接调用 service + 组件内 `useState/useEffect`**，未走 Query hooks。

**Service 层**（10 个）：`api.js`（axios 实例，`baseURL = VITE_API_URL || /api`，超时 15s，响应拦截器直返 `data`、错误挂 `apiMessage/traceId/status`）+ `asset / portfolio / position / price / transaction / rebalance / alert / family / log` 九个领域 service。

**设计系统**

- **Design token**（`client/src/constants/design-tokens.js`）：品牌紫 `#635BFF`、品牌浅紫 `#EEEDFF`、页面底 `#F6F8FA`、卡片 `#FFFFFF`、边框 `#E3E8EE`、文本 `#0A2540/#5E6B7E/#8A95A5`、**涨 `#DF1B41` / 跌 `#0E9F6E`**（A 股约定）、警告 `#F5A524`。
- **布局 token**：`sidebarWidth 232`、`topbarHeight 64`、`contentPaddingX 32`、`contentPaddingY 24`。
- **字体**：中文 Noto Sans SC 优先，数字 Inter（`fontStack.numeric`）。
- **双轨样式**：布局/详情页用内联 token style，业务页面多用 Tailwind 工具类；两套并存。

### 7.4 关键业务规则速查

| 主题 | 口径 |
|---|---|
| 成本法 | 移动平均成本；买入成本含费；卖出净得扣费；现金分红不进持仓；分红再投等价买入 |
| 超卖校验 | 重放时 `quantity > 持仓量 + 1e-10` 抛 `INSUFFICIENT_POSITION`（新增/更新/删除/导入均校验） |
| A 股整手 | CN-SH/CN-SZ 买入非 100 整数倍 → **软警告不阻断**；卖出与基金不受限 |
| 目标校验 | 合计必须 100%（容差 `1e-6`）；禁止 asset 与 asset_class 混合 |
| 多币种 | 组合内**不跨币种汇总**；缺价 → 该币种桶 `null`；**家庭层才做 RMB 折算** |
| 缺价原则 | 估值字段为 `null`，不按零价误算；家庭折算「宁可少报不可错报」 |
| 再平衡执行 | 仅 MANUAL；仅 PENDING 可执行；建议需与记录严格一致；撤销生成反向交易 |
| AUTO 调度 | **只生成建议 + 提醒，绝不自动交易** |
| 提醒触发 | 严格大于/小于（等于不触发）；`cooldownDays` + 同日幂等抑制；单规则故障隔离 |
| 归档 | `archived=true` 不参与列表默认/家庭汇总/自动再平衡调度，数据保留 |
| 行情市场日 | 价格 `timestamp` 规范到市场日 0 点 UTC；查询边界按 `MARKET_TIMEZONE` |
| 任务防重 | 进程内 Map 锁 + `TaskRun` 唯一索引双层 |

### 7.5 需求编码索引（PRD ↔ 实现）

| 编码 | 功能 | 关键实现位置 |
|---|---|---|
| AS-01~03 | 资产 CRUD / 属性 / 列表 | `shared/services/asset.service.js`、`client/src/pages/Asset/*` |
| AS-04~05 | 今日 / 历史价格页 | `shared/services/price.service.js`、`client/src/pages/Prices/*` |
| AS-06 | 每日同步 | `shared/tasks/dailySync.js`（内核）、`cron-worker/src/schedulers/priceScheduler.js`（触发） |
| AS-07 | 完整性检查 | `cron-worker/src/tasks/integrityCheck.js`、`cron-worker/src/schedulers/healthScheduler.js` |
| AS-08 | 港股支持 | `shared/config/markets.js`、`shared/fetchers/*` 路由 |
| AS-09 | assetClass 大类 | `shared/models/asset.js`、`shared/constants/asset.constants.js` |
| AS-10 | A 股个股 | `shared/fetchers/eastmoneyFetcher.js` |
| AS-11 | 估值分位 | `shared/services/valuation.service.js`、`shared/models/valuation.js` |
| TR-01~03 | 交易 CRUD / 字段 / 超卖 | `shared/services/transaction.service.js` |
| TR-04~05 | 成本重放 / 持仓历史 | `shared/services/transaction/positionCalculator.js` |
| TR-06~08 | fee / 分红 / 整手 | 同上 + `client/src/pages/Transaction/*` |
| TR-09 | CSV 导入 | `shared/services/transaction.service.js#importTransactions`、`client/src/utils/csvImport.js` |
| CM-01~20 | 组合管理全量 | `shared/services/portfolio/*`、`client/src/pages/Portfolio/*` |
| RB-01~11 | 再平衡全量 | `shared/services/rebalance/*`、`client/src/pages/Portfolio/Rebalance*.jsx` |
| AL-01~10 | 提醒中心全量 | `shared/services/alert*.service.js`、`client/src/pages/Alerts/*`、`Dashboard.jsx` |
| FAM-01~04 | 家庭视图 | `shared/services/familySummary.service.js`、`client/src/pages/Family.jsx` |

### 7.6 维护规则

本文档组（[PRODUCT_LINES.md](../PRODUCT_LINES.md) + 本目录 7 个子文件）的更新时机：

- 新增或移除**功能域 / 页面 / API 端点 / 数据模型** → 更新对应**产品线子文件**；若跨线，同步更新本文件附录。
- 跨进程 / 跨模块职责发生变化（如调度所有权迁移、业务内核搬迁）→ 更新本文件 §6.2 / §6.4。
- 业务规则（成本法、校验口径、折算原则）发生变更 → 更新本文件 §7.4（唯一归属）。
- 技术债清单中的条目被清理或新增 → 更新本文件 §8。
- 产品线划分本身变化 → 更新 [PRODUCT_LINES.md](../PRODUCT_LINES.md) 与 INDEX。

实现细节（字段级、参数级）应就近维护在代码或 [API_CONTRACT.md](../../dev/API_CONTRACT.md)；本文档组保持「功能全景 + 边界 + 追溯」的粒度。

---

## 8. 技术债、遗留与一致性专项

### 8.1 架构级技术债的产品化处理（原总表 §4.4）

技术债被视为**产品风险**，因为它们会以「用户可见的不可信」或「迭代速度下降」的形式外化：

| 技术债 | 外化为哪种用户问题 | 产品化处理建议 |
|---|---|---|
| ~~双份调度实现~~ ✅ | ~~同一任务行为不一致 → 价格 / 提醒结果在不同部署下不同~~ | ✅ 已解决（TASK-005）：`shared/` 唯一实现 + 单一调度所有者 |
| 枚举复制（两份） | 新增市场（如新币种）时容易漏改一端 → 前端选不到 / 后端拒收 | 余：`shared/constants` ↔ `client/src/constants/enums.js` 双向同步；可考虑以「资产层为准、前端由后端驱动」彻底消除 |
| 无认证 + CORS 过宽 | 数据暴露风险（家庭资产全量可见） | 视为**部署前置条件**而非普通功能；公网前必须闭环 |
| 前端数据层不统一 | 页面加载 / 刷新行为不一致，改一处易漏另一处 | 统一到 Query；顺带清理空文件与未接入组件 |
| 节假日表逐年维护 | 某年节后误判开市 → 抓到空数据 / 误报缺口 | 把「年度维护」列为固定运维动作（可用到期提醒） |

**其余已知技术债**：

- **两份枚举复制**：`ASSET_*` 常量在 `shared/constants`（server + worker 共用）与 `client/src/constants/enums.js` 各存一份，改动需**双向同步**（原为三份，已收敛）。
- **CORS 开放（已确认为现状）**：`server/app.js` 用 `cors({ origin: true })` 允许任意来源，白名单实现被整段注释、`CORS_ORIGINS` **未被读取**。上线前需二选一收口：恢复白名单生效，或在网络层确保不对外暴露（见 [DEPLOYMENT.md](../../manual/DEPLOYMENT.md) §安全边界）。
- **完整性检查截断无提示**：缺失区间超 `maxRepairRanges=50` 时静默截断。
- **`integrityCheck.js` 偏大**（约 386 行），待拆分。
- **再平衡单日分发的隐式契约**：`rebalanceScheduler` 的到期规则（周一 / 每月 1 日）是硬编码的 `SCHEDULE_DUE_RULES`，新增 `rebalanceSchedule` 取值时必须同步补充规则，否则该频率**静默永不触发**。

### 8.2 未接入 / 死代码

| 文件 | 状态 | 归属 |
|---|---|---|
| `pages/Portfolio/Basic.jsx` | 组合基本信息 + 删除，**未被任何路由/Tab 引用**（已核实零引用） | [PL-3](./PL-3-portfolio.md) |
| `pages/Portfolio/TargetAllocation.jsx` | 目标配置回显，**未被引用**（已核实零引用） | [PL-3](./PL-3-portfolio.md) |
| `components/layout/Header.jsx`、`components/common/Header.jsx` | 旧版顶栏，未接入 | 本文件（M0.3） |
| `components/AddTransactionForm.jsx` | 遗留内联表单，未被引用 | 本文件（M0.3） |
| `components/layout/MainLayout.jsx`、`components/common/ErrorAlert.jsx`、`components/common/Loading.jsx`、`utils/formatters.js`、`utils/helpers.js`、`utils/chartConfig.js` | **空文件（0 字节）** | 本文件（M0.3） |

### 8.3 文档一致性问题（原总表 §4.5）

> **已核实并关闭**：以代码为准，`TargetAllocation.jsx` 与 `Basic.jsx` 均**零外部引用**（未挂载任何路由 / Tab），原 `functions.md` §9.1 的说法正确；目标配置的真实落地是 `PortfolioForm.jsx` 内联实现。PRD 中「已落地」的表述应理解为「能力已落地」，不代表该文件被接入。

| 冲突点 | 原 functions.md 说法 | PRD.md 说法 | 结论 |
|---|---|---|---|
| `pages/Portfolio/TargetAllocation.jsx` | §9.1 列为「未被任何路由 / Tab 引用」的遗留文件 | §4.1.7 / 更新记录称其为「前端大类视图」已落地 | ✅ **已核实**：文件确未被引用，维持「删除」建议；「已落地」指能力（在 `PortfolioForm` 内实现） |
| `pages/Portfolio/Basic.jsx` | §9.1 列为未接入遗留 | 未提及 | 待核实后一并处理（已核实零引用） |

> 结论：**删除类动作执行前必须先做一次「引用关系核实」**，避免删掉实际生效的代码。

---

## 9. 相关文档

- [PRODUCT_LINES.md](../PRODUCT_LINES.md) — 产品线总览与 INDEX（本文件的上级）
- [PL-1 投资账本线](./PL-1-ledger.md) · [PL-2 行情数据线](./PL-2-market-data.md) · [PL-3 组合与配置线](./PL-3-portfolio.md) · [PL-4 再平衡决策线](./PL-4-rebalancing.md) · [PL-5 提醒与通知线](./PL-5-alerting.md) · [PL-6 家庭总览线](./PL-6-household.md)
- [ARCHITECTURE.md](../../architecture/ARCHITECTURE.md) — 架构分层、模块边界、依赖规则
- [API_CONTRACT.md](../../dev/API_CONTRACT.md) — REST API 契约
- [CRON_WORKER.md](../../manual/CRON_WORKER.md) — 调度所有权、定时任务、排障
- [DEPLOYMENT.md](../../manual/DEPLOYMENT.md) — 部署与安全边界
- [DEPLOYMENT.md](../../manual/DEPLOYMENT.md) — 本地环境与验证命令
- [PRD.md](../specs/PRD.md) — 需求基线（功能编码来源）
- [ROADMAP.md](../ROADMAP.md) — 路线图
- [standards/DOCS.md](../../standards/DOCS.md) — 文档结构规范与单一归属规则
- [ADR-001 认证（模板）](../../architecture/adr/ADR-001-authentication.md) · [ADR-002 单一调度器与共享内核](../../architecture/adr/ADR-002-single-scheduler.md)
- [functions.md（已归档）](../../archive/functions.md) — 本文 §6 / §7 的原始来源
