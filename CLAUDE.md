# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PortoMind 是自托管的单家庭投资组合管理应用：账本（移动平均成本）、多市场行情、目标 vs 实际偏离、再平衡建议、家庭层人民币折算。npm workspaces 模块化单体，四个 workspace：`shared` / `server` / `cron-worker` / `client`。业务文档与代码注释以简体中文为主。

## 常用命令

依赖只在仓库根安装一次：

```bash
npm ci
cp server/.env.example server/.env
cp client/.env.example client/.env
cp cron-worker/.env.example cron-worker/.env
npm run seed:baseline --workspace server   # 需要 MongoDB；幂等写入本地验证数据
```

开发进程：

```bash
npm run dev:server    # Express API :8080（nodemon）
npm run dev:client    # Vite :6600（vite.config.js 中 strictPort；README 里的 5173 已过时）
npm run dev:worker    # 唯一调度进程（可选）
```

验证：

```bash
npm test                 # 全部 workspace
npm run test:server      # server/test/integration/*.test.js（HTTP 集成，无需 MongoDB）
npm run test:worker      # cron-worker/test（node --test，无需 MongoDB）
cd server && node --test test/integration/api-contract.test.js       # 单个测试文件
cd cron-worker && node --test test/rebalanceScheduler.test.js
cd client && npm run lint && npm run build

cd server && npm run validate   # 仅语法检查，不连库
cd server && npm run verify     # 语法 + MongoDB 基线数据校验
npm run docs:check              # 根 README/CLAUDE.md、docs/ 与各 README/AGENTS 的链接、锚点、HTML 资产
npm run check:ignored           # 源码目录里被 .gitignore 静默忽略的文件
```

手动作业（调度内核的 CLI 薄壳）：

```bash
node cron-worker/src/tasks/dailySync.js
node cron-worker/src/tasks/historySync.cjs --from YYYY-MM-DD [--to ...] [--symbols VOO,510300] [--concurrency 3]
node cron-worker/src/tasks/integrityCheck.js [--symbols ...] [--from ...] [--to ...] [--no-repair] [--dry-run]
```

## 架构

```text
client ──HTTP──> server ──┐
                          ├──> @portomind/shared ──> MongoDB
cron-worker ──────────────┘
```

- `shared/` 是**唯一**业务内核：models、services、tasks、fetchers、constants、utils。业务规则出现第二份拷贝即视为缺陷。
- `server/` 只做协议层：入参校验、`{ success, data }` 响应包装、错误归一、认证闸门。**不得注册 cron**，不托管静态文件。
- `cron-worker/` 只持有**触发权**：注册全部定时任务，调用 `shared` 的服务；不含业务规则、不监听端口。
- `client/` 只做呈现与交互：不自算偏离阈值、不做跨币种折算、不 require `shared`、不直连数据库。
- 跨 workspace 引用必须用包名深引用 `require('@portomind/shared/<domain>/<file>')`，禁止 `../../shared/...` 相对路径穿透。

请求链路：页面 → TanStack Query hook → `client/src/services/*.service.js` → Express route → controller → `shared/services/*` → `shared/models/*` → MongoDB。列表响应用 `pagination: { page, pageSize, total }`。

调度链路：`cron-worker/index.js` → `src/tasks/scheduler.js` → `src/schedulers/*` → `shared/services/taskRunner.js` 的 `runTrackedTask`（TaskRun 防重 + 状态）→ `shared/tasks/*` → `shared/services/*` → `shared/fetchers/*`。

关键入口：

- `server/app.js` — 中间件与路由装配；**认证闸门挂载顺序**是硬约束（见下）。
- `shared/services/priceFetch.service.js` — 唯一的「市场 → 数据源」路由判定。
- `shared/config/logger.js` — 唯一日志实现，默认写仓库根 `logs/`，`server` 与 `cron-worker` 共用。
- `cron-worker/src/schedulers/cronScheduler.js` — 新增调度器一律复用 `createCronScheduler`，不要手写 node-cron 样板。
- `client/src/services/api.client.js` — 唯一 Axios 实例与错误规范化（响应拦截器已解包 `response.data`）。
- `client/src/router.jsx` + `client/src/constants/routes.js` — 唯一路由入口与路径生成器。

## 不可破坏的规则

1. **单一调度所有者**：全部定时任务只在 `cron-worker` 注册（ADR-002）。`server` 出现 cron 是架构回归。
2. **缺价不猜**：估值字段缺最新价/汇率时为 `null`，绝不按 0 计算；界面显示「—」。
3. **AUTO 再平衡只写建议与提醒，永不自动创建交易**；执行始终需要人工确认。
4. **`taskName` 与 `runKey` 是稳定契约**（`taskruns` 防重索引 `(taskName, runKey)`）。改名会导致历史断代。`rebalanceSchedule` 新增取值必须在 `rebalanceScheduler.js` 的 `SCHEDULE_DUE_RULES` 补规则，否则静默永不触发。
5. **认证闸门只有一个挂载点**：`server/app.js` 中 `/api/auth`（login/session 公开、logout 幂等）与 `/api/users`（路由级 admin）先挂载，之后 `app.use('/api', requireAuth)` 覆盖全部业务路由。禁止逐路由复制取 cookie / 查会话逻辑；测试不得引入跳过闸门的开关。
6. **枚举双份必须同步**：`shared/constants/asset.constants.js` 与 `client/src/constants/enums.js` 中的 `ASSET_TYPES / ASSET_CLASSES / ASSET_MARKETS / ASSET_CURRENCIES`。改一处必须改另一处。
7. **所有外部行情调用必须包 `withMarketDataTimeout` + `fetchWithRetry`**（`shared/fetchers/`、`shared/utils/retry.js`）；错误统一归一为带 `category` / `provider` / `retryable` 的 `MarketDataError`。不要在任务层或控制器里重写 symbol 前缀判断。
8. **symbol 契约遵循 ADR-003**：存储为按 market 派生的大写后缀键；新增/编辑资产与写价都通过共享派生层，不要各自清洗。
9. **每个进程只读自己的 `.env`**：`server` → `server/.env`，`cron-worker` → `cron-worker/.env`（由 `cron-worker/src/config/env.js` 在读取 `process.env` 的模块之前加载）。价格日期按 `MARKET_TIMEZONE`（默认 `America/Toronto`）归桶，数据库存 UTC。
10. **跨币种合计只发生在家庭层**；组合与持仓金额保留资产原币种。

## 测试

- 使用 Node 内置 `node --test`，无 Jest/Vitest。`server` 测试是 HTTP 级集成测试：`app.listen(0)` + 模型/会话 stub，不依赖 MongoDB；`cron-worker` 测试覆盖 fetcher、日历、重试、各调度器与到期规则。
- `shared/` 自身没有 test 脚本，只能通过两个后端的测试间接覆盖；改动 shared 逻辑时优先补能穿过 API 或调度层的断言。
- 任务函数支持 `options.dependencies` 依赖注入（默认回退真实实现），测试用它替换外部协作者。
- 改了调度器注册或再平衡到期规则，必须同步更新 `cron-worker/test/scheduler.test.js` / `rebalanceScheduler.test.js`。
- 修复 bug 时加一条「修复前失败、修复后通过」的回归测试；不要只断言「没抛异常」。

## Git 与文档工作流

- `main` 是长期集成分支，只能经 PR 合入，由 Human 执行合并；合并策略是 merge commit，**不 squash、不 rebase-merge**。
- 有任务卡时分支名 `feature/TASK-<id>[-<描述>]`；无任务卡的 typo/docs/chore 用 `fix/`、`docs/`、`chore/`。
- Conventional Commits：`feat(scope): ...`、`fix(scope): ...`、`docs(...)`，尽量在正文引用任务号。
- 需求、Spec、User Story、Task 与进度跟踪在 **GitHub Issues / Projects**，不在仓库内维护；仓库为 public，Issue/PR 中禁止写入真实持仓、金额、账号、`MONGO_URI` 或任何凭据。
- 文档遵循「单一归属」：同一主题只在一处写正文，其他地方链接引用。改动文档后运行 `npm run docs:check`；新增文档要同步 `docs/readme.md` 索引。

## 深入阅读

- 架构、模块边界、架构债：[docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)
- ADR（认证 / 单一调度器 / symbol 后缀）：[docs/architecture/adr/](docs/architecture/adr)
- API 契约：[docs/handbook/technical/API_CONTRACT.md](docs/handbook/technical/API_CONTRACT.md)
- 数据模型：[docs/handbook/technical/DATA_MODEL.md](docs/handbook/technical/DATA_MODEL.md)
- 部署、环境变量全表、验证命令：[docs/handbook/ops/DEPLOYMENT.md](docs/handbook/ops/DEPLOYMENT.md)
- 工程规范：[编码](docs/agents/CODING.md)、[测试](docs/agents/TESTING.md)、[Git](docs/agents/GIT.md)
- 调度引擎、防重与 TaskRun 契约：[docs/handbook/technical/CRON_WORKER_DEV.md](docs/handbook/technical/CRON_WORKER_DEV.md)
- 包级代理约定：[client/AGENTS.md](client/AGENTS.md)（注意其中 `api.js`/`symbolUtils.js` 等路径已过时，实际入口是 `src/services/api.client.js`；symbol 逻辑在 `shared/utils/symbol.js`）、[cron-worker/AGENTS.md](cron-worker/AGENTS.md)

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `tongweizj/portomind`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use the default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` plus ADRs in `docs/architecture/adr/`. See `docs/agents/domain.md`.
