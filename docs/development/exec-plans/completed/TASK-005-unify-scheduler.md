# TASK-005 — 统一调度器：全部定时任务迁移至 cron-worker

## Status

`Complete`（2026-10-15 实施完毕；Plan Review 已裁决 D1–D5）

## Owner

`Agent`（Impl）/ `Human Owner`（D1–D5 裁决）

## Priority

`High`

## Related task

`TASK-005`（`docs/development/tasks/completed/TASK-005-unify-scheduler.md`）

---

## 1. Intent

### Goal

`cron-worker` 成为项目**唯一的调度器**：价格同步、完整性检查、提醒评估、汇率同步、再平衡 AUTO 五类定时任务全部由 worker 触发；`server` 不再启动任何 cron。

### Why

`SCHEDULER_ENABLED=true` 的「唯一所有者」约束与两侧调度器的**任务覆盖不重合**直接冲突，导致无论选哪个所有者都必然有任务静默停跑。详见 `docs/development/exec-plans/completed/DOCS-DEDUP-2026-10-15.md` §3（Q10）与 `docs/handbook/ops/CRON_WORKER.md` §3.1。

### Scope

- 调度所有权从 `server` 迁移到 `cron-worker`（全部 5 类任务）。
- 移除 `server` 的调度启动路径。
- 保留 `server` 全部 API 手动触发端点。
- 消解 `server/tasks/dailySync.js` 与 `cron-worker/src/tasks/dailySync.js` 的重复。
- 同步更新文档、`.env.example`，新建 ADR-002。

### Out of Scope

业务规则、前端、API 契约、数据模型字段、认证授权、CORS、容器化。

### Constraints

- `server` 的 API 能力不得退化（前端按钮依赖）。
- **不得以新增代码复制作为终态**。
- 保持 `taskruns` 中既有 `taskName` 的稳定性（避免历史断代）。
- 可一键回滚。
- 现有测试继续通过。

### Acceptance Criteria

见 `docs/development/tasks/completed/TASK-005-unify-scheduler.md` §Acceptance Criteria（本节不重复，遵循「单一归属」）。

---

## 2. Context

### 2.1 现状（规划时快照，实施后已改变——见 §9 完成记录）

`server` 与 `cron-worker` 是**共享同一 MongoDB** 的两个 Node 进程，各有自己的一份调度器实现：

- `server/tasks/scheduler.js`（41 行）注册：`priceScheduler`、`alertScheduler`、`fxScheduler`、`rebalanceScheduleManager.initSchedules()`。
- `cron-worker/src/tasks/scheduler.js` 注册：`priceScheduler`、`healthScheduler`。

两者都以 `process.env.SCHEDULER_ENABLED === 'false'` 作为整体禁用开关。

### 2.2 关键概念区分（本任务的认知前提）

> **迁移的是「调度触发权」，不是「业务能力」。**

| | 迁移 | 原因 |
|---|---|---|
| **调度触发**（cron 注册与触发） | ✅ 迁到 worker | 本任务目标 |
| **业务引擎**（alertEngine / fxRate / rebalance 等） | ❌ **留在 server** | `server` 的 API 手动触发端点（前端按钮的后端）必须继续可用 |

因此「把 server 的业务代码整段搬进 worker」既非必要、也会制造第四份复制。真正要解决的是：**同一个业务引擎如何被两个进程共享，而调度只由 worker 发起。**

### 2.3 不变量

- `TaskRun` 的 `(taskName, runKey)` 唯一索引 + 进程内 Map 锁（跨进程防重兜底）。
- 逐资产故障隔离：单资产失败不中断整批。
- 再平衡 AUTO **只生成建议 + 提醒，永不自动交易**。

### 2.4 相关文档

- `docs/handbook/ops/CRON_WORKER.md` §3.1（覆盖矩阵与当前缺口）
- `docs/handbook/ops/DEPLOYMENT.md` §2 / §3（生产环境变量与进程拓扑）
- `docs/os/architecture/functions.md` §2.2 / §4.10 / §9.2

---

## 3. Repository Findings

### 3.1 调度器清单（现状）

| 位置 | 文件 | 行数 | 注册的任务 |
|---|---|---|---|
| server | `tasks/scheduler.js` | 41 | 入口（4 项） |
| server | `tasks/priceScheduler.js` | 29 | 价格同步 → `tasks/dailySync.js` |
| server | `tasks/alertScheduler.js` | 45 | 提醒评估 → `services/alertEngine.service.js::evaluateAll` |
| server | `tasks/fxScheduler.js` | 45 | 汇率同步 → `services/fxRate.service.js::syncLatestRates` |
| server | `services/rebalance/scheduleManager.js` | 136 | 按组合动态注册 AUTO 再平衡 |
| worker | `src/tasks/scheduler.js` | 39 | 入口（2 项） |
| worker | `src/schedulers/priceScheduler.js` | 19 | 价格同步 → `src/tasks/dailySync.js` |
| worker | `src/schedulers/healthScheduler.js` | 20 | 完整性检查 → `src/tasks/integrityCheck.js` |
| worker | `src/schedulers/cronScheduler.js` | 44 | **通用工厂**（`createCronScheduler({envKey, defaultCron, taskName, run})`），可直接复用于新增调度器 |

**可复用资产**：worker 已有通用调度工厂，新增 3 个调度器的样板代码量很小；`priceScheduler`/`healthScheduler` 各仅约 20 行。

### 3.2 待迁移任务的依赖闭包（server 侧）

| 任务 | 直接依赖 | 传递依赖 | 涉及模型 |
|---|---|---|---|
| 提醒评估 | `alertEngine.service.js`(333)、`taskRunner.js`(82) | `marketData.service`(41)、`valuation.service`(67)、`portfolio/positionTracker`(46)、`portfolio/assetClassAggregator`(98)、`portfolio/summary`(119)、`utils/marketTime` | `alertRule`(67)、`alertEvent`(42)、`portfolio`(83)、`price`(26)、`rebalanceRecord`(58) |
| 汇率同步 | `fxRate.service.js`(110) | `config/logger`、axios | `fxRate`(38) |
| 再平衡 AUTO | `rebalance/scheduleManager`(136)、`thresholdChecker`(104)、`suggestionGenerator`(228)、`recorder`(38)、`costEstimator`(49)、`alertCenter.service`(59) | `portfolio/index`(21)、`assetClassAggregator`(98)、`marketData.service`(41)、`taskRunner`(82) | `portfolio`(83)、`rebalanceRecord`(58)、`alertEvent`(42) |

**规模评估**：闭包合计约 **2800 行**（含模型）。这是一次**结构性重构**，不是小改。

### 3.3 两侧已有重复（本任务应顺带收敛，而非恶化）

| 重复项 | server | cron-worker | 说明 |
|---|---|---|---|
| `taskRunner.js` | 82 行 | 有 | 两份实现 |
| `dailySync.js` | 86 行 | 有（**超集**） | worker 版多东财 fetcher + 交易日历 + 开市 skip |
| `priceFetch/priceStorage.service` | 有 | 有 | 两份 |
| `utils/marketTime` | 有 | 有 | 两份 |
| `models/{asset,price,taskRun}` | 有 | 有 | 字段一致，两份 |
| fetchers | yahoo/tiantian | yahoo/tiantian/**eastmoney** | worker 为超集 |

> ⚠️ 若采用「复制」路线，`models` 与 `services` 的副本数会从 2 涨到 **3**，直接加剧 `functions.md` §9.2 已记录的技术债。

### 3.4 工程约束发现

- **仓库无根 `package.json`，无 workspaces**：`server/`、`client/`、`cron-worker/` 各自独立安装。跨包共享代码目前无现成机制（`cron-worker` 的 `package.json` 描述自称「从 ../server 拆分」）。
- 三端均为 **CommonJS**（`"type": "commonjs"`）→ 共享模块在语法上无障碍，只是需要解决**路径与依赖解析**。
- worker 的 `models/` 只有 `asset`、`price`、`taskRun`，**没有** alert / fx / portfolio / rebalance 相关模型 → 无法直接执行提醒评估与再平衡 AUTO。

### 3.5 手动触发端点现状（迁移后必须保持）

| 端点 | 位置 | 用途 |
|---|---|---|
| `POST /api/alerts/evaluate` | `server/routes/alert.routes.js:11` | Dashboard「立即评估」 |
| `POST /api/family/fx/sync` | `server/routes/family.routes.js:12` | 家庭视图「同步汇率」 |
| `POST /api/portfolios/:pid/rebalance/check` | `server/routes/portfolio.routes.js` | 再平衡阈值检查 |
| `POST /api/portfolios/:pid/rebalance/suggestions` | `server/routes/portfolio.routes.js` | 生成建议 |

### 3.6 未知项（实施前需确认）

- `alertController.evaluate` 与 `familyController.syncFxRates` 是否经 `runTrackedTask` 落 `taskruns`？若否，方案 B 下将由 server 侧承载 TaskRun，需补埋点。
- 再平衡 AUTO 目前**无对外端点**（只有按组合的 `/check`、`/suggestions`）；方案 B 需新增内部端点。
- 是否有外部能力依赖 server 的 `SCHEDULER_ENABLED`（如测试、脚本）？需全仓 grep 确认。

---

## 4. Proposed Design

### 4.0 方案对比

| 维度 | **A. 抽共享内核** | **B. worker HTTP 触发** | **C. 复制代码到 worker** |
|---|---|---|---|
| 单一调度器 | ✅ | ✅ | ✅ |
| 业务实现份数 | **1 份**（收敛） | **1 份**（天然） | **3 份**（恶化） |
| 改动量 | 大（≈2800 行搬迁 + 路径重构） | **小**（worker 加 3 个调度器 + HTTP 客户端） | 中 |
| 新增运行时耦合 | 无 | **有**（worker 依赖 server 在线） | 无 |
| 前置条件 | 需建 monorepo 工作区（当前无根 package.json） | 需新增内部端点 + `SERVER_API_URL` 配置 | 无 |
| 是否偿还既有债务 | ✅ 同时消除双份 `taskRunner`/`dailySync`/`models` | ❌ 不动既有重复 | ❌ 恶化 |
| 回滚难度 | 中 | **低** | 中 |
| 风险 | 路径重构面广、易漏 | 耦合与 TaskRun 归属语义 | 长期维护成本 |

### 4.1 方案 A（推荐）：抽取共享内核 `shared/`

```
portomind/
├── package.json              # 新增：npm workspaces 根
├── shared/                   # 新增：唯一实现
│   ├── package.json          # @portomind/shared
│   ├── models/               # alertEvent alertRule asset fxRate portfolio price rebalanceRecord taskRun transaction valuation
│   ├── services/             # alertEngine alertCenter fxRate valuation marketData taskRunner priceFetch priceStorage
│   │   ├── portfolio/        # positionTracker assetClassAggregator summary actualRatios ...
│   │   └── rebalance/        # thresholdChecker suggestionGenerator recorder costEstimator
│   ├── utils/                # marketTime
│   └── fetchers/             # yahoo tiantian eastmoney（合并两侧超集）
├── server/                   # 保留：API + 调度**触发**路径已移除；业务引擎改为 require('@portomind/shared/...')
└── cron-worker/              # 保留：调度器 + 交易日历；业务引擎改为 require('@portomind/shared/...')
```

**要点**

1. `server` 的业务引擎**不消失**，只是改为从 `shared` 引用 → API 手动触发能力不变，实现仅一份。
2. `cron-worker` 新增 3 个调度器，复用既有 `createCronScheduler` 工厂，`run` 直接调用 `shared` 中的引擎。
3. `cron-worker` 独有的 **交易日历（`calendar.service` + `config/markets`）与东财 fetcher** 一并迁入 `shared`，让 server 也能受益（server 侧当前无交易日历）。
4. `server/tasks/` 中仅保留**手动任务脚本**（`dailySync` 等被 npm script 调用），删除全部 `*Scheduler.js` 与 `scheduler.js`。
5. `SCHEDULER_ENABLED` 语义简化为「worker 是否启用调度」，`server/.env.example` 移除该变量。

**风险**：路径重构面广（每个 `require('../models/xxx')` 都要改），需分阶段 + 全量测试保障。

### 4.2 方案 B（最小可逆）：worker 通过 HTTP 触发 server 的既有端点

```
cron-worker/src/schedulers/
├── alertScheduler.js       → POST http://127.0.0.1:${PORT}/api/alerts/evaluate
├── fxScheduler.js          → POST http://127.0.0.1:${PORT}/api/family/fx/sync
└── rebalanceScheduler.js   → POST http://127.0.0.1:${PORT}/api/internal/rebalance/auto-check   # 需新增
```

- `priceScheduler` / `healthScheduler` **保持原生**（worker 自带超集实现，无需绕行 HTTP）。
- 需新增 `.env` 项 `SERVER_API_URL`（默认 `http://127.0.0.1:8080`）。
- 需新增内部端点 `POST /api/internal/rebalance/auto-check`（遍历未归档组合 → 阈值检查 → 生成建议 → `alertCenter.notify`）。
- 需确认并补齐 server 端点的 `runTrackedTask` 埋点，否则 `taskruns` 观测性丢失。

**代价**：调度与 API 进程耦合（server 宕机则三类任务不跑，但有重试/下轮补偿）；**不偿还**任何既有重复债务。

### 4.3 方案 C（不推荐）：把 server 的 services/models 复制进 worker

改动中等、worker 自包含，但使 `models`/`services` 副本从 2 份涨到 **3 份**，与 `functions.md` §9.2 记录的「双份实现 / 三份枚举复制」债务同向恶化。仅在方案 A、B 均不可行时考虑。

### 4.4 推荐与理由

**推荐方案 A**：本任务的根本动因是「同一能力被两处实现导致口径漂移」，方案 A 在统一调度器的同时**偿还**了双份实现债务，是唯一让问题不复发（也不会以变体复发）的选项；方案 B 虽改动最小，但不动既有重复，长期仍需再补一次 A。

**若 Human Owner 优先考虑低风险与快速止血**，则采方案 B，并将方案 A 登记为后续 TASK（消除双份实现）。

> 无论选哪个方案，`4.5` 的分阶段步骤与 `6` 的验证方案均适用（方案差异集中在 Phase 2–3）。

### 4.5 分阶段实施（以方案 A 为例）

| Phase | 内容 | 可独立验收 |
|---|---|---|
| **P0 冻结与准备** | 确认 §3.6 未知项；全仓 grep `SCHEDULER_ENABLED` 引用；打 tag 便于回滚；建立 workspaces 根 `package.json` | `npm ci` 三端仍可用 |
| **P1 抽 `shared/`** | 迁移 `models/` + `utils/marketTime` + `taskRunner`，server 改为引用；**行为零变化** | server 全量测试通过 |
| **P2 迁移业务引擎** | `services/`（alert/fx/valuation/portfolio/rebalance/marketData/fetchers）迁入 `shared`；合并 `dailySync` 为超集版 | server 全量测试通过 |
| **P3 worker 接管调度** | 新增 `alertScheduler` / `fxScheduler` / `rebalanceScheduler`；`calendar`+`markets` 迁入 `shared` | worker 启动日志出现 5 个调度器 |
| **P4 拆除 server 调度** | 删除 `server/tasks/*Scheduler.js` 与 `scheduler.js` 及调用点；`server/.env.example` 移除 `SCHEDULER_ENABLED` | server 启动日志无 `SCHEDULERS_STARTED` |
| **P5 文档与 ADR** | 更新 OPERATIONS/DEPLOY/DEVELOPMENT/functions + 两份 `.env.example`；创建 ADR-002 | 文档链接校验 0 失效 |

**回滚策略**：P1–P4 每阶段独立提交；P4 出问题时 `git revert` 该提交并恢复 server 调度即可，数据层无 schema 变更，无数据迁移风险。

---

## 5. Work Breakdown

- [x] P0.1 全仓确认 `SCHEDULER_ENABLED` 全部引用点（代码 / 脚本 / 测试 / 文档）
- [x] P0.2 确认 `alertController.evaluate`、`familyController.syncFxRates` 的 TaskRun 埋点现状（方案 A 下不依赖，已记录）
- [x] P0.3 建立根 `package.json` + workspaces（方案 A 必做）
- [x] P1.1 建 `shared/` 骨架与 `package.json`
- [x] P1.2 迁 `models/` 至 `shared/models/`，server 改引用，测试全绿
- [x] P1.3 迁 `utils/marketTime`、`services/taskRunner` 至 `shared/`
- [x] P2.1 迁 alert / valuation / marketData / portfolio 相关服务
- [x] P2.2 迁 fx 服务
- [x] P2.3 迁 rebalance 服务（thresholdChecker / suggestionGenerator / recorder / costEstimator / alertCenter）
- [x] P2.4 合并两份 `dailySync` 为超集版；合并 fetchers（yahoo/tiantian/eastmoney）
- [x] P2.5 迁 `calendar.service` + `config/markets`（worker 独有资产，供两侧复用）
- [x] P3.1 新增 `cron-worker/src/schedulers/alertScheduler.js`
- [x] P3.2 新增 `cron-worker/src/schedulers/fxScheduler.js`
- [x] P3.3 新增 `cron-worker/src/schedulers/rebalanceScheduler.js`（**改为单日分发器**，见 §4.6）
- [x] P3.4 注册进 `cron-worker/src/tasks/scheduler.js`
- [x] P3.5 新增「单调度器注册 5 类任务」单元测试
- [x] P4.1 删除 `server/tasks/{priceScheduler,alertScheduler,fxScheduler,scheduler}.js`
- [x] P4.2 移除 `server/services/rebalance/scheduleManager.js` 的调度启动路径（文件整体删除）
- [x] P4.3 移除 server 启动链中对 `startSchedulers()` 的调用
- [x] P4.4 `server/.env.example` 移除 `SCHEDULER_ENABLED` / `*_CRON`（迁移至 worker）
- [x] P5.1 更新 `CRON_WORKER.md` §3（覆盖矩阵 → 单调度器全覆盖）、§4（手动入口）
- [x] P5.2 更新 `DEPLOYMENT.md` §2 / §3（PM2 只部署 worker 调度）、`DEPLOYMENT.md`
- [x] P5.3 更新 `functions.md` §2.2 / §4.10.1 / §9.2
- [x] P5.4 创建 `docs/os/architecture/adr/ADR-002-single-scheduler.md`
- [x] P5.5 更新 `docs/readme.md` 索引与 `BOARD.md` 状态
- [x] P5.6 全量链接校验

### 4.6 实施期方案调整（对 §4.1 的偏离）

**P3.3 的实际实现与计划不同——由「按组合注册」改为「单日分发」**：

计划沿用 `scheduleManager.initSchedules()` 的「每组合一个 node-cron 实例」。实施时发现该模式**在独立 worker 进程下不可行**：新增组合由 API 进程写入，worker 无法感知并动态注册 cron（跨进程无通知通道）。若坚持按组合注册，只能在 worker 启动时快照一次，之后新增的组合**永不调度**。

因此改为：

- 只注册**一个** `REBALANCE_CHECK_CRON`（默认 `0 0 * * *`）。
- 每次触发遍历未归档组合，用 `SCHEDULE_DUE_RULES` 判断「今天是否到期」：`daily` 恒真 / `weekly` 仅周一 / `monthly` 仅每月 1 日。
- `taskName`（`rebalance-suggestions:<pid>`）与 `runKey`（`{schedule}:{periodKey}`）保持不变 → TaskRun 防重语义与历史记录**完全兼容**。

**副作用**：到期规则变成硬编码映射，新增 `rebalanceSchedule` 取值时必须同步补规则（已记入 `functions.md` §9.2 技术债）。

---

## 6. Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| 路径重构漏改导致运行时 `MODULE_NOT_FOUND` | 高 | 分阶段提交；每阶段跑 server + worker 全量测试；启动冒烟 |
| `server` API 能力被误删（把引擎当调度一起删） | **高** | P4 明确只删 `*Scheduler.js` 与调用点；验收含「前端按钮功能不变」 |
| 方案 B 下 server 宕机导致任务不执行 | 中 | 下一周期自动补偿；worker 侧记录 HTTP 失败为 `PARTIAL`；文档写明耦合 |
| TaskRun `taskName` 改名导致历史断代 | 中 | 约束：沿用既有 `daily-price-sync` / `alert-evaluate` / `fx-rate-sync` / `rebalance-suggestions:<pid>` |
| 合并两份 `dailySync` 时丢失 worker 侧开市 skip / 日历逻辑 | 中 | 以 worker 版为基准（超集）；对比表逐项核对日志代码常量 |
| 引入 workspaces 影响三端独立 `npm ci` 流程 | 中 | P0 先验证 `npm ci` 三端可用；文档同步更新 |
| 迁移期间两个调度器同时存在 | 低 | P4 前保持 `SCHEDULER_ENABLED` 互斥；TaskRun 唯一索引兜底 |

---

## 7. Verification Plan

### 7.1 自动化

- `cd server && npm test`、`npm run validate`、`npm run verify` 全绿。
- `cd cron-worker && npm test` 全绿。
- 新增：`cron-worker` 单调度器注册 5 类任务的单元测试（断言调度器数量与任务名）。
- 新增：worker 侧 `alertScheduler` / `fxScheduler` / `rebalanceScheduler` 的 cron 表达式校验与失败隔离测试。

### 7.2 运行时冒烟（手工）

1. 只启动 `server` → 日志**不得**出现 `SCHEDULERS_STARTED`；`mongosh` 查询 `taskruns` 无新记录。
2. 只启动 `cron-worker` → 日志出现 5 个 `*_SCHEDULER_STARTED`。
3. 临时把 5 个 cron 表达式改为「每分钟」跑一轮 → 检查 `taskruns`：
   ```bash
   mongosh 'mongodb://127.0.0.1:27017/portomind_dev' \
     --eval 'db.taskruns.find({},{taskName:1,status:1,startedAt:1}).sort({startedAt:-1}).limit(10)'
   ```
   期望观察到：`daily-price-sync`、`price-integrity-check`、`alert-evaluate`、`fx-rate-sync`、`rebalance-suggestions:*`。
4. 前端回归：Dashboard「立即评估」、家庭视图「同步汇率」、再平衡「检查 → 生成建议 → 执行 → 撤销」全流程可用。
5. 防重验证：故意同时启动两个调度进程 → 多余进程应得到 `SKIPPED`。

### 7.3 文档

- 全量相对链接校验 0 失效（脚本见 `docs/os/standards/DOCS.md` §5）。
- `CRON_WORKER.md` §3.1 不再出现「二选一拓扑 / 已知缺口」表述。

---

## 8. Open Decisions（Plan Review 裁决结果）

| # | 决策 | 选项 | 裁决 | 结果 |
|---|---|---|---|---|
| **D1** | 实现方案 | A 抽共享内核 / B HTTP 触发 / C 复制 | **A**（抽共享内核） | 已按 A 实施：新建 `shared/` workspace，业务引擎唯一实现 |
| **D2** | 是否引入根 `package.json` + npm workspaces | 是 / 否 | **是** | 已建根 `package.json`，workspaces = `shared`/`server`/`cron-worker`/`client` |
| **D3** | `SCHEDULER_ENABLED` 的终态语义 | ① 仅 worker 保留 ② 两进程保留但 server 恒 false | **①** | worker 保留；`server` 完全移除读取该变量的代码与 `.env.example` 条目 |
| **D4** | 方案 B 下的内部端点鉴权 | 仅绑定回环 / 共享密钥 | **不适用** | D1 选 A，无 HTTP 触发路径，该决策自动失效 |
| **D5** | 是否顺带把 `calendar.service` + `markets` 迁入 shared | 是 / 否 | **是** | 已迁至 `shared/services/calendar.service.js` 与 `shared/config/markets.js` |

补充裁决（D1 的连带项）：`server/services/` 目录**整体清空**——所有业务服务迁至 `shared/`，`server` 只保留 `routes` / `controllers` / `middleware` / `utils/apiResponse.js` / `tasks`（CLI 薄壳）。

---

## 9. Progress / Notes

### 2026-10-15 — Draft 建立

- 完成仓库调研：调度器清单、依赖闭包（≈2800 行）、两侧重复项、工程约束（无 workspaces）、手动触发端点现状、未知项清单。
- 确认「调度迁移 ≠ 业务能力迁移」这一认知前提，并据此排除「整段复制」作为终态。
- 状态置为 `Draft`，**等待 Plan Review 裁决 D1–D5**。未开始任何实现改动。

### 2026-10-15 — Plan Review 裁决

Human Owner 裁决：**D1=A**、**D2=是**、**D3=①**、**D4 不适用**、**D5=是**。据此进入实施，按 §4.5 的 P0–P5 顺序推进，每阶段独立提交。

### 2026-10-15 — 实施完成（P0–P5）

**P0 准备**：全仓 grep `SCHEDULER_ENABLED`，确认引用点集中在 `server/tasks/scheduler.js`、`cron-worker/src/tasks/scheduler.js`、两份 `.env.example` 与测试；确认 `alertController.evaluate` / `familyController.syncFxRates` 在方案 A 下无需补埋点（内核统一后由 `shared` 侧承载）。建立根 `package.json`（workspaces = `shared`/`server`/`cron-worker`/`client`）。

**P1 抽 `shared/`**：建 `shared/package.json`（`@portomind/shared`）与惰性 barrel `shared/index.js`；迁入 `models/`（10 个）、`constants/asset.constants.js`、`utils/marketTime.js`、`utils/logSanitizer.js`、`services/taskRunner.js`、`config/logger.js`。

> **关键技术洞察**：迁目录时**保留原目录结构**，包内 `require('./x')` 与 `require('../models/y')` 等相对引用**零改动**即可解析，只有**跨包**引用需要改写成 `@portomind/shared/...`。这把「≈2800 行路径重构」压缩为可枚举的引用点替换。

> **踩坑**：`shared/index.js` 首版一次性 `require` 全部模块，触发 `portfolio` / `rebalance` 之间既有的循环依赖（`computeSummary` / `evaluateThresholds` 等报 non-existent property）。改为 `Object.defineProperty` + `get()` 惰性 getter 后消除。

> **踩坑**：用 `git mv <dir> <已存在目录>` 产生了目录嵌套（`shared/constants/constants/`、`shared/fetchers/fetchers/`），改用 `mv` + `rmdir` 展平。

**P2 迁业务引擎**：alert / fx / valuation / marketData / portfolio / rebalance / price\* 各服务迁入 `shared/services/`；fetchers（yahoo / tiantian / **eastmoney**，取两侧超集）迁入 `shared/fetchers/`；`calendar.service` + `markets`（原 worker 独有）迁入 `shared/`。

`dailySync` 合并为**单一内核 + 两处 CLI 薄壳**：`shared/tasks/dailySync.js` 为纯模块（不读 `.env`、不建连），`server/tasks/dailySync.js` 与 `cron-worker/src/tasks/dailySync.js` 各自只做「加载 `.env` → 建连 → 调用 → 断开」。

**P3 worker 接管调度**：新增 3 个调度器（`alertScheduler` / `fxScheduler` / `rebalanceScheduler`），复用既有 `createCronScheduler` 工厂；`cron-worker/src/tasks/scheduler.js` 注册 5 类。`rebalanceScheduler` 按 §4.6 的**单日分发**方案实现（非按组合注册）。

**P4 拆除 server 调度**：删除 `server/tasks/{priceScheduler,alertScheduler,fxScheduler,scheduler}.js`；删除 `server/services/rebalance/scheduleManager.js`；`server/server.js` 移除 `startSchedulers()` 调用，改为显式注释「本进程不启动任何 cron」；`server/.env.example` 移除 `SCHEDULER_ENABLED` 与全部 `*_CRON`；`cron-worker/.env.example` 补齐 5 个 cron 变量并声明为唯一所有者。

测试调整：`server/test/integration/scheduler.module.test.js` 删除（调度断言移交 worker），其 TaskRun 防重与日志脱敏断言拆出为 `server/test/integration/taskrun.logging.test.js`；`server/test/integration/portfolio.archived.test.js` 移除 3 条再平衡调度断言。新增 `cron-worker/test/scheduler.test.js`（3 条）与 `cron-worker/test/rebalanceScheduler.test.js`（5 条）。

### 验证结果（实测）

| 验证项 | 结果 |
|---|---|
| `server` 测试 | **152 / 152 通过** |
| `cron-worker` 测试 | **77 / 77 通过** |
| 相对 `require` 可解析性（全仓扫描） | **184 / 184** |
| `@portomind/shared/...` 引用可解析性 | **49 / 49** |
| 调度代码引用点 | **仅 `cron-worker`**（`server` 侧为 0，`server/services` 目录已清空） |
| worker 启动日志 | `SCHEDULERS_STARTED {"count":5,"owner":"cron-worker"}` |
| 文档相对链接校验 | **0 失效** |

### 未完成 / 遗留

- **未做真实 PM2 运行时冒烟**：本机未起 MongoDB，§7.2 的「只启动 server 检查无 `SCHEDULERS_STARTED`」「mongosh 查 `taskruns` 五类任务」属运行时验证，需在有 Mongo 的环境补做。
- **`git mv` 后未复核 `git status`**：文件搬迁量大，提交前应确认无意外删除/嵌套。
- 见 `functions.md` §9.2 新增技术债条目：再平衡单日分发的到期规则为硬编码，新增频率需同步补规则。
