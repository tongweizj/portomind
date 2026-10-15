# PortoMind 开发与运行说明

> **本地开发环境的唯一归属文档**：依赖、`.env` 本地默认值、基线数据、启动、测试与验证命令。
> 生产部署见 [DEPLOY.md](./DEPLOY.md)；调度机制、价格同步、完整性检查与排障见 [OPERATIONS.md](./OPERATIONS.md)。

## 前置条件

- Node.js 与 npm
- 可访问的 MongoDB
- 两个终端窗口

2026-08-24 的基线验证环境为 Node.js 24.19.0、npm 11.17.0，以及位于 `mongodb://127.0.0.1:27017` 的 MongoDB。依赖版本来自仓库已有 lockfile。

Linux systemd 环境通常可以这样检查 MongoDB：

```bash
sudo systemctl status mongod
mongosh 'mongodb://127.0.0.1:27017' --eval 'db.runCommand({ ping: 1 })'
```

## 环境配置

在仓库根目录执行：

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
cp cron-worker/.env.example cron-worker/.env   # 可选：只在需要跑定时任务时
```

开发环境默认配置（与 `.env.example` 一致）：

```dotenv
# server/.env —— API 进程，不含任何调度配置
MONGO_URI=mongodb://127.0.0.1:27017/portomind_dev
PORT=8080
LOG_LEVEL=info
MARKET_TIMEZONE=America/Toronto
SCHEDULER_TIMEZONE=America/Toronto   # 仅供只读的调度状态接口展示
# LOG_DIR 可选；不设置时两个进程共用仓库根 logs/
```

```dotenv
# cron-worker/.env —— 全项目唯一的调度所有者
MONGO_URI=mongodb://127.0.0.1:27017/portomind_dev
SCHEDULER_ENABLED=true
SCHEDULER_TIMEZONE=America/Toronto
PRICE_SYNC_CRON=0 3 * * *
HEALTH_CHECK_CRON=0 5 * * *
ALERT_EVAL_CRON=0 4 * * *
FX_SYNC_CRON=30 9 * * *
REBALANCE_CHECK_CRON=0 0 * * *
```

```dotenv
# client/.env
VITE_API_URL=http://localhost:8080/api
```

三个 `.env` 均被 Git 忽略，不要提交数据库凭证。当前前端 service 的写法要求 `VITE_API_URL` 包含 `/api` 前缀。

**关于调度（不在此处展开）**：调度配置**只存在于 `cron-worker/.env`**。`server` 进程不注册任何 cron，`server/.env` 里写 `SCHEDULER_ENABLED` 或 `*_CRON` 不会生效。完整的调度所有权规则与启动方式见 [OPERATIONS.md](./OPERATIONS.md) §3。环境变量的生产必需项见 [DEPLOY.md](./DEPLOY.md) §「后端环境变量」。

## 安装依赖

根目录是 npm workspaces monorepo（`shared` / `server` / `cron-worker` / `client` 四个 workspace）。**在根目录一次安装即可**，`@portomind/shared` 会通过符号链接挂到各 workspace：

```bash
npm ci          # 或首次开发用 npm install
```

安装后如需单独操作某个 workspace，可用根脚本（见根 `package.json`）：

```bash
npm run test:server      # 只跑 server 测试
npm run test:worker      # 只跑 cron-worker 测试
npm run dev:server       # 启动后端 API
npm run dev:worker       # 启动调度进程
npm run dev:client       # 启动前端
```

## 创建基线数据

种子脚本使用固定 MongoDB ID，只 upsert 自己管理的记录，不会清空集合或删除其他开发数据，可以重复运行：

```bash
cd server
npm run seed:baseline
```

脚本创建：

- 2 个资产：`VTI`、`BND.TO`
- 1 个组合：`Baseline Portfolio`
- 4 笔交易：3 笔 VTI、1 笔 BND.TO
- 6 条价格：每个资产 3 天价格，最后一天为脚本执行当天

固定组合 ID 为 `650000000000000000000010`。

## 启动项目

终端 1（后端 API，在仓库根目录）：

```bash
npm run dev:server
```

后端地址：`http://localhost:8080`。

终端 2（前端，在仓库根目录）：

```bash
npm run dev:client
```

前端地址：`http://localhost:5173`。

后端成功连接 MongoDB 后，数据页面才可工作。可用以下只读请求快速检查：

```bash
curl http://localhost:8080/api/assets
curl http://localhost:8080/api/portfolios
curl http://localhost:8080/api/transactions
curl "http://localhost:8080/api/prices/date/$(date +%F)?page=1&pageSize=20"
```

终端 3（可选，定时任务，在仓库根目录）：

```bash
npm run dev:worker
```

这是**唯一**会执行定时任务的进程（价格同步、完整性检查、提醒评估、汇率同步、再平衡分发共 5 类）。`server` 进程无论怎么启动都不会跑定时任务。

## 验证命令

本节是验证/测试命令的**唯一归属**——[DEPLOY.md](./DEPLOY.md) 的上线检查与 [OPERATIONS.md](./OPERATIONS.md) 的任务验证均引用此处。

不依赖 MongoDB 的后端语法验证：

```bash
cd server
npm run validate
```

连接 MongoDB、检查语法和基线数据数量的统一验证命令：

```bash
cd server
npm run verify
```

后端自动化测试：

```bash
cd server
npm test
```

前端验证：

```bash
cd client
npm run build
npm run lint
```

cron-worker 测试：

```bash
cd cron-worker
npm test
```

完整检查要求 `test`、`validate`、`lint` 和 `build` 全部成功。Vite 仍会提示主 bundle 超过 500 kB，这是性能优化项，不影响构建产物正确性。

在根目录也可一次性跑全部 workspace 的测试：

```bash
npm test              # = npm run test --workspaces --if-present
```

> **不要把测试数量写进文档**：用例数随开发变动，以 `npm test` 的实际输出为准。带日期的历史数量只保留在产品需求文档的需求状态条目中。

后端自动化测试覆盖 API 契约、资产与交易 CRUD、持仓移动平均成本、历史持仓、目标比例、价格分页与时区、再平衡闭环、任务防重和日志脱敏。HTTP 集成测试会临时监听本地随机端口。

## 恢复基线

再次运行种子和验证即可恢复脚本管理的文档：

```bash
cd server
npm run seed:baseline
npm run verify
```

脚本不会删除其他记录。删除整个开发数据库属于破坏性操作，本项目脚本不会自动执行。

## 已知环境说明

- **CORS 当前不校验来源**：`server/app.js` 使用 `cors({ origin: true })`，任意来源都被接受；`.env` 里的 `CORS_ORIGINS` 目前**不被读取**。安全边界与上线前要求见 [DEPLOY.md](./DEPLOY.md) §「安全边界」。
- 当前使用 npm workspaces monorepo：`shared`（唯一业务实现）、`server`（API）、`cron-worker`（唯一调度）、`client`（前端）。改业务逻辑时改 `shared/`，不要在 `server`/`cron-worker` 下复制实现。
- 当前后端使用 Mongoose 6.13；跨主版本升级计划见 [`DEPENDENCY_UPGRADES.md`](../exec-plans/complete/DEPENDENCY_UPGRADES.md)。
- 默认日志写入**仓库根 `logs/`**（由 `shared/config/logger.js` 决定，`app-*.log` 与 `task-*.log` 分文件），并被 Git 忽略；`server` 与 `cron-worker` 两个进程共用该目录。日志脱敏规则见 [DEPLOY.md](./DEPLOY.md) §「安全边界」。
- 当前组合计算按原币种分组，不会直接相加 USD、CAD 与 CNY；跨币种折算仅发生在家庭视图——业务口径的唯一归属是 [USER_GUIDE.md](./USER_GUIDE.md) §5。

功能验收以 [PRD.md](../product/specs/PRD.md) 的需求状态与自动化测试为准（测试数量以 `npm test` 实际输出为准）。

## 相关文档

- [USER_GUIDE.md](./USER_GUIDE.md) — 功能怎么用（业务操作）
- [DEPLOY.md](./DEPLOY.md) — 生产部署、生产环境变量、备份、安全边界
- [OPERATIONS.md](./OPERATIONS.md) — 调度、价格同步、完整性检查、历史回补、排障
- [API_CONTRACT.md](../dev/API_CONTRACT.md) — REST API 契约
