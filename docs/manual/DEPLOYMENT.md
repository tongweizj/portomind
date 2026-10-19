# 系统部署手册

> **系统部署与运行的单一归属文档**：系统总览/架构、前置条件、依赖安装、环境变量全表、
> 本地开发搭建、生产部署（构建/PM2/Nginx/上线检查）、验证与测试命令、安全边界、备份与迁移。
>
> 界面操作见 [client 使用手册](./CLIENT.md)；API 手动端点见 [server 使用手册](./SERVER.md)；
> 定时任务与数据质量见 [cron-worker 使用手册](./CRON_WORKER.md)。

当前版本适合部署在可信局域网，面向单用户。

---

## 1. 系统总览与架构

PortoMind 是 npm workspaces monorepo，由 **四个 workspace** 组成：

| workspace | 角色 | 是否进程 | 说明 |
|---|---|---|---|
| `shared` | 业务内核 | 否（代码库） | models / services / tasks / fetchers / constants / config / utils，**唯一实现** |
| `server` | API | 是 | Express，监听端口；**不注册任何 cron** |
| `cron-worker` | 调度 | 是 | **唯一调度所有者**，注册全部 5 类定时任务 + 提供 CLI |
| `client` | 前端 | 否（构建产物） | Vite SPA，构建为 `client/dist/` |

**调度所有权（ADR-002）**：`cron-worker` 是**唯一**调度所有者，单进程注册全部 5 类定时任务；
`server` 不注册任何 cron。因此不存在「二选一拓扑」，也不会有任务因选错所有者而静默停跑。
不要配置系统 cron 调用任务脚本，PM2 只负责保活。详见 [cron-worker 使用手册](./CRON_WORKER.md) §3。

---

## 2. 前置条件

- Node.js 与 npm（基线验证环境 Node 24 / npm 11；lockfile 决定依赖版本）
- 可访问的 MongoDB
- 两个终端窗口（开发）或 PM2（生产）

检查 MongoDB（Linux systemd 示例）：

```bash
sudo systemctl status mongod
mongosh 'mongodb://127.0.0.1:27017' --eval 'db.runCommand({ ping: 1 })'
```

---

## 3. 安装依赖

在**仓库根目录一次安装**即可，`@portomind/shared` 通过符号链接挂到各 workspace：

```bash
npm ci          # 或首次开发用 npm install
```

安装后可用根脚本操作各 workspace：

```bash
npm run test:server      # 只跑 server 测试
npm run test:worker      # 只跑 cron-worker 测试
npm run dev:server       # 启动后端 API
npm run dev:worker       # 启动调度进程
npm run dev:client       # 启动前端
npm test                 # = npm run test --workspaces --if-present（全部 workspace）
```

---

## 4. 环境变量

三个 `.env` 均被 Git 忽略，**不要提交数据库凭证**。当前前端 service 要求 `VITE_API_URL` 包含 `/api` 前缀。

### 4.1 server（API 进程）

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/portomind      # 与 cron-worker 同一库（必需）
PORT=8080
SCHEDULER_TIMEZONE=America/Toronto   # 仅日志查看接口按调度时区取当天日期，需与 worker 一致
MARKET_TIMEZONE=America/Toronto
# LOG_DIR 可选；默认写入仓库根 logs/，与 cron-worker 共用
# CORS_ORIGINS 当前不生效（见 §9 安全边界）
```

### 4.2 cron-worker（唯一调度进程）

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/portomind      # 与 server 同一库（必需）
SCHEDULER_ENABLED=true           # 唯一定时任务所有者（ADR-002）
SCHEDULER_TIMEZONE=America/Toronto
MARKET_TIMEZONE=America/Toronto
PRICE_SYNC_CRON=0 3 * * *        # 价格同步
HEALTH_CHECK_CRON=30 3 * * *     # 完整性检查
ALERT_EVAL_CRON=0 4 * * *        # 提醒评估
FX_SYNC_CRON=30 9 * * *          # 汇率同步
REBALANCE_CHECK_CRON=0 0 * * *   # 再平衡分发
INTEGRITY_AUTO_REPAIR=true
INTEGRITY_REPAIR_MAX_DAYS=30
MARKET_DATA_TIMEOUT_MS=10000
# LOG_DIR 可选；默认写入仓库根 logs/，与 server 共用
```

> 调度环境变量详解与开关见 [cron-worker 使用手册](./CRON_WORKER.md) §2.2；`server` 不持有 `SCHEDULER_ENABLED` 也没有 `*_CRON`。

### 4.3 client（前端）

```dotenv
VITE_API_URL=http://localhost:8080/api     # 构建时变量；若同域建议默认同源 /api 交由 Nginx 转发
```

---

## 5. 本地开发搭建

### 5.1 准备 .env

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
cp cron-worker/.env.example cron-worker/.env   # 只在需要跑定时任务时
```

开发环境默认配置与生产一致（`MONGO_URI=mongodb://127.0.0.1:27017/portomind_dev` 等），见各 `.env.example`。

### 5.2 创建基线数据

种子脚本使用固定 MongoDB ID，只 upsert 自己管理的记录，不会清空集合或删除其他开发数据，可重复运行：

```bash
cd server
npm run seed:baseline
```

脚本创建：2 个资产（`VTI`、`BND.TO`）、1 个组合（`Baseline Portfolio`，固定 ID `650000000000000000000010`）、4 笔交易、6 条价格（每个资产 3 天）。

### 5.3 启动（三个终端）

```bash
npm run dev:server        # 后端 :8080
npm run dev:client        # 前端 :5173
npm run dev:worker        # 可选，定时任务；这是唯一会执行定时任务的进程
```

后端成功连接 MongoDB 后，数据页面才可工作。只读快速检查：

```bash
curl http://localhost:8080/api/assets
curl http://localhost:8080/api/portfolios
curl http://localhost:8080/api/transactions
curl "http://localhost:8080/api/prices/date/$(date +%F)?page=1&pageSize=20"
```

### 5.4 恢复基线

再次运行种子与验证即可（脚本不会删除其他记录）：

```bash
cd server && npm run seed:baseline && npm run verify
```

删除整个开发数据库属于破坏性操作，本项目脚本不会自动执行。

---

## 6. 生产部署

### 6.1 构建与启动

```bash
git clone <repository-url> portomind
cd portomind
cp server/.env.example server/.env && cp client/.env.example client/.env && cp cron-worker/.env.example cron-worker/.env
npm install

# 验证（命令见 §8）
npm run test:server
npm run test:worker
npm run --workspace client lint
npm run --workspace client build

# 进程保活（PM2）
cd cron-worker && npm ci --omit=dev && pm2 start index.js --name portomind-worker --instances 1
cd ../server && npm ci --omit=dev && pm2 start server.js --name portomind-api --instances 1
pm2 save
```

将 `client/dist/` 交给 Nginx 或其他静态服务器。`VITE_API_URL` 是构建时变量；若前端和 API 同域，建议使用默认同源 `/api` 并由 Nginx 转发。

### 6.2 调度所有权确认

```bash
pm2 logs portomind-worker --lines 50 | grep SCHEDULERS_STARTED
# 期望：SCHEDULERS_STARTED {"owner":"cron-worker","count":5}

pm2 logs portomind-api --lines 50 | grep SCHEDULERS_STARTED
# 期望：无输出（server 不持有调度）
```

若使用 PM2 cluster 或多实例，只允许**一个** worker 实例启用调度，其余必须设 `SCHEDULER_ENABLED=false`。详细的调度机制与再平衡分发见 [cron-worker 使用手册](./CRON_WORKER.md) §3。

### 6.3 Nginx 示例

```nginx
server {
  listen 443 ssl;
  server_name portomind.example.internal;

  root /srv/portomind/client/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

TLS 证书配置因环境而异，示例未包含证书路径。

### 6.4 上线检查

- [ ] `npm test`、`npm run --workspace server verify`、前端 `lint` / `build` 全部通过（见 §8）。
- [ ] `cron-worker` 日志有 `SCHEDULERS_STARTED {"count":5}`，`server` 日志**无** `SCHEDULERS_STARTED`（§6.2）。
- [ ] `server` 与 `cron-worker` 使用**同一** `MONGO_URI` 与**同一** `logs/` 目录。
- [ ] API 未暴露到公网；`/api/logs` 仅在可信网络可访问。
- [ ] MongoDB 和日志目录有备份、容量与保留策略（见 §10）。
- [ ] 外部行情失败能在任务日志中追踪，但不会中断其他资产。

Docker 尚未作为当前交付方式；容器化前应先设计健康检查、非 root 用户、持久卷、备份恢复和调度器单例策略。

---

## 7. 验证与测试命令

这是验证/测试命令的**唯一归属**（其他地方引用，不复制）。

不依赖 MongoDB 的后端语法验证：

```bash
cd server && npm run validate
```

连接 MongoDB、检查语法和基线数据数量的统一验证：

```bash
cd server && npm run verify
```

后端自动化测试、前端验证、worker 测试：

```bash
cd server && npm test
cd client && npm run build && npm run lint
cd cron-worker && npm test
```

完整检查要求 `test`、`validate`、`lint` 和 `build` 全部成功。Vite 仍会提示主 bundle 超过 500 kB，是性能优化项，不影响构建产物正确性。根目录也可一次性跑全部 workspace 测试：`npm test`。

> **不要把测试数量写进文档**：用例数随开发变动，以 `npm test` 实际输出为准。

后端自动化测试覆盖 API 契约、资产与交易 CRUD、持仓移动平均成本、历史持仓、目标比例、价格分页与时区、再平衡闭环、任务防重和日志脱敏。

---

## 8. 已知环境说明

- **CORS 当前不校验来源**：`server/app.js` 使用 `cors({ origin: true })`，任意来源都被接受；`.env` 里的 `CORS_ORIGINS` 目前**不被读取**。安全边界与上线前要求见 §9。
- 当前使用 npm workspaces monorepo：`shared`（唯一业务实现）、`server`（API）、`cron-worker`（唯一调度）、`client`（前端）。改业务逻辑时改 `shared/`，不要在 `server`/`cron-worker` 下复制实现。
- 当前后端使用 Mongoose 6.13；跨主版本升级计划见 [`DEPENDENCY_UPGRADES.md`](../exec-plans/complete/DEPENDENCY_UPGRADES.md)。
- 默认日志写入**仓库根 `logs/`**（由 `shared/config/logger.js` 决定，`app-*.log` 与 `task-*.log` 分文件），并被 Git 忽略；`server` 与 `cron-worker` 共用该目录。日志脱敏规则见 §9。
- 当前组合计算按原币种分组，不会直接相加 USD、CAD 与 CNY；跨币种折算仅发生在家庭视图（业务口径见 [client 使用手册](./CLIENT.md) §5）。

功能验收以 [PRD](../product/specs/PRD.md) 的需求状态与自动化测试为准。

---

## 9. 安全边界

这是安全边界的**唯一归属**。

| 项 | 当前状态 | 说明 |
|---|---|---|
| 认证 / 多用户 | **无** | 没有登录体系与授权。**API 不要暴露到公网**，仅限可信局域网。ADR-001 目前只是模板。 |
| CORS | **不校验来源** | `server/app.js` 使用 `cors({ origin: true })`，**任意来源都被接受**；白名单实现被注释、`CORS_ORIGINS` 环境变量**不被读取**。单用户本地部署下可接受，但上线前必须二选一：① 恢复白名单实现并让 `CORS_ORIGINS` 生效；② 保持开放，但确保网络层（反向代理 / 防火墙）不对外暴露。 |
| 日志脱敏 | 已实现 | 请求日志**不记录请求头**；URL 中常见 token / API key / 密码参数及日志元数据中的敏感键统一替换为 `[REDACTED]`。仍应限制 `logs/` 与 MongoDB 的访问权限。 |
| 数据传输 | 取决于部署 | 示例使用 TLS；若在局域网内以 HTTP 直连，请自行评估风险。 |

---

## 10. 备份与迁移

这是备份/迁移的**唯一归属**。

需要备份的内容：

| 内容 | 位置 | 说明 |
|---|---|---|
| 业务数据 | MongoDB `portomind` 库 | 资产 / 组合 / 交易 / 价格 / 提醒 / 汇率 / TaskRun 全在此，**最重要** |
| 运行日志 | `logs/`（仓库根，`server` 与 `cron-worker` 共用） | `app-*.log` / `task-*.log` / `exceptions-*.log` / `rejections-*.log`；排障用，可按保留策略裁剪 |
| 前端产物 | `client/dist/` | 静态构建产物，可随时重新构建，不必备份 |

迁移服务器时直接拷贝数据库即可；前端重新 `npm run --workspace client build` 生成。
恢复后确认 `cron-worker` 日志出现 `SCHEDULERS_STARTED {"count":5}`（§6.2）。

---

## 相关文档

- [client 使用手册](./CLIENT.md) — 界面业务操作
- [server 使用手册](./SERVER.md) — API 进程、手动 API 端点
- [cron-worker 使用手册](./CRON_WORKER.md) — 定时任务、数据质量、CLI
- [API 契约](../dev/API_CONTRACT.md) — REST API 详细定义
- [ADR-002 单一调度器](../architecture/adr/ADR-002-single-scheduler.md) — 调度架构决策
