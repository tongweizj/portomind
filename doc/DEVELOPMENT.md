# PortoMind 开发与运行说明

本文档记录当前可重复的本地开发和验证环境。

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
```

开发环境默认配置：

```dotenv
# server/.env
MONGO_URI=mongodb://127.0.0.1:27017/portomind_dev
PORT=8080
LOG_LEVEL=info
LOG_DIR=./logs
LOG_MAX_FILES=60d
SCHEDULER_ENABLED=true
SCHEDULER_TIMEZONE=America/Toronto
PRICE_SYNC_CRON=0 3 * * *
```

```dotenv
# client/.env
VITE_API_URL=http://localhost:8080/api
```

两个 `.env` 均被 Git 忽略，不要提交数据库凭证。当前前端 service 的写法要求 `VITE_API_URL` 包含 `/api` 前缀。

## 安装依赖

使用 lockfile 保持版本一致：

```bash
cd server
npm ci

cd ../client
npm ci
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

## 验证命令

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

前端验证：

```bash
cd client
npm run build
npm run lint
```

完整检查要求 `test`、`validate`、`lint` 和 `build` 全部成功。Vite 仍会提示主 bundle 超过 500 kB，这是性能优化项，不影响构建产物正确性。

后端自动化测试覆盖 API 契约、资产与交易 CRUD、持仓移动平均成本、历史持仓、目标比例、价格分页与时区、再平衡闭环、任务防重和日志脱敏。HTTP 集成测试会临时监听本地随机端口。

## 启动项目

终端 1：

```bash
cd server
npm run dev
```

后端地址：`http://localhost:8080`。

终端 2：

```bash
cd client
npm run dev
```

前端地址：`http://localhost:5173`。

后端成功连接 MongoDB 后，数据页面才可工作。可用以下只读请求快速检查：

```bash
curl http://localhost:8080/api/assets
curl http://localhost:8080/api/portfolios
curl http://localhost:8080/api/transactions
curl "http://localhost:8080/api/prices/date/$(date +%F)?page=1&pageSize=20"
```

## 定时任务所有权

价格同步和再平衡建议统一由后端 Node 常驻进程启动。系统 cron 不再调用任务脚本；PM2 只负责保活，并且只能有一个设置 `SCHEDULER_ENABLED=true` 的进程。若使用 PM2 cluster，多余 worker 必须设置 `SCHEDULER_ENABLED=false`。

默认价格同步表达式为 `0 3 * * *`，即按 `SCHEDULER_TIMEZONE` 每天 03:00 执行一次。`TaskRun` 的 `(taskName, runKey)` 唯一索引会阻止多个进程重复取得同一次任务；进程内锁会阻止相同任务并发进入。

需要人工同步时使用：

```bash
cd server
npm run sync:prices
```

价格完整性检查（cron-worker 提供，回答「每支基金理论应有多少价格、实际采了多少」）：

```bash
cd cron-worker
npm run check:integrity              # 全部激活资产；存在缺口时自动调 historySync 补全
npm run check:integrity -- --no-repair   # 只出报告，不自动补全
npm run check:integrity -- --symbols VOO,510300 --from 2024-01-01
```

完整性检查按资产的 `launchDate`（可选字段，未填写的资产跳过）与所属市场推算理论交易日数，查询 `Price` 实际记录数，输出含 `missingCount` 与 `completenessRatio` 的结构化报告；存在缺口时 TaskRun 记 `DATA_GAP`（status=PARTIAL）并按缺失区间自动回补。相关 cron 与开关：

```dotenv
PRICE_SYNC_CRON=0 3 * * *        # 价格同步，默认每天 03:00
HEALTH_CHECK_CRON=30 3 * * *     # 健康检查，晚于价格同步 30 分钟
INTEGRITY_AUTO_REPAIR=true       # 缺口自动补全开关
INTEGRITY_REPAIR_MAX_DAYS=30     # 自动补全只覆盖最近 N 天，更早缺口延后（防超大规模回补）
```

预览缺口报告、不执行补全：

```bash
cd cron-worker
npm run check:integrity -- --dry-run
```

每次任务在任务日志和 `taskruns` 集合记录 `TASK_START`、`TASK_END`、起止时间、成功数、失败数和耗时。某个资产失败只记录该资产，不中断其余同步。日志 API 支持历史日期，例如：

```bash
curl "http://localhost:8080/api/logs/tasks?date=2026-08-24&level=all&page=1&pageSize=20"
```

请求日志不记录请求头；URL 中常见 token、API key、密码参数及日志元数据中的敏感键会统一替换为 `[REDACTED]`。

## 恢复基线

再次运行种子和验证即可恢复脚本管理的文档：

```bash
cd server
npm run seed:baseline
npm run verify
```

脚本不会删除其他记录。删除整个开发数据库属于破坏性操作，本项目脚本不会自动执行。

## 已知环境说明

- API CORS 白名单当前接受 `http://localhost:5173`，但不接受所有 Vite host 或端口。
- 当前后端使用 Mongoose 6.13；跨主版本升级计划见 [`DEPENDENCY_UPGRADES.md`](./DEPENDENCY_UPGRADES.md)。
- 默认日志写入 `server/logs/`，并被 Git 忽略。
- 当前组合计算按原币种分组，不会直接相加 USD、CAD 与 CNY；尚未提供组合基准币种换算。

页面和 API 的实测状态见 [`FUNCTIONAL_BASELINE.md`](./FUNCTIONAL_BASELINE.md)。重构改变状态后应同步更新该文件。
