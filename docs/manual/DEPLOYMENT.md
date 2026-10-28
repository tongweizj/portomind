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
不要配置系统 cron 调用任务脚本，PM2 只负责保活。详见 [cron-worker 运维手册](./CRON_WORKER_OPS.md)。

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
SCHEDULER_TIMEZONE=America/Toronto   # 只读/查询接口按调度时区取当天日期，需与 worker 一致
MARKET_TIMEZONE=America/Toronto
# LOG_DIR 可选；默认写入仓库根 logs/，与 cron-worker 共用

# TASK-058 认证（U1）：
CORS_ORIGINS=http://localhost:5173   # **白名单**，逗号分隔；生产必填，未配置则启动 fail-fast
SESSION_TTL_DAYS=7                   # 会话绝对过期天数（不做滑动续期）
COOKIE_SECURE=true                   # 生产必须 TLS；仅局域网 HTTP 调试才设 false（未设置时 production 默认 true）
NODE_ENV=production                  # 生产必须显式设置（触发 CORS fail-fast 与 Secure cookie 默认）；开发/测试保持未设置
TRUST_PROXY=1                        # 经 Nginx 等可信反代时设置（让 req.ip 取 X-Forwarded-For；直连保持未设置）
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

> 调度环境变量详解与开关见 [cron-worker 运维手册](./CRON_WORKER_OPS.md) §2；`server` 不持有 `SCHEDULER_ENABLED` 也没有 `*_CRON`。

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

### 5.5 用真实数据验收（整库镜像到开发库）

开发库是空的、或只有种子基线时，界面上的占比、图表、交易列表都看不出真实效果。把真实库整库镜像到开发库后，用前端验收更接近真实：

```bash
npm run sync:db -- --dry-run      # 先看计划，不写入
npm run sync:db                   # 执行 portomind -> portomind_dev
npm run sync:db -- --verify-only  # 只校验两边是否一致
```

| 规则 | 说明 |
|---|---|
| 引擎 | 官方 `mongodump` → gzip 归档 → `mongorestore`（`--nsFrom/--nsTo` 改名 + `--drop`）；BSON 类型、集合选项与索引由工具原生处理 |
| 依赖 | MongoDB Database Tools。Windows：`scoop install mongodb-database-tools`；其它平台见 [官方下载页](https://www.mongodb.com/try/download/database-tools)。工具不在 `PATH` 时脚本会兜底查 scoop 默认目录，也可用 `MONGODUMP_BIN` / `MONGORESTORE_BIN` 指定绝对路径 |
| 源库只读 | 脚本不对真实库做任何写操作 |
| 完全镜像 | 目标库同名集合先删再由工具整份还原（含索引）；源库没有的多余集合会被删除（`--no-prune` 保留） |
| 安全守卫 | 目标库名必须以 `_dev` / `_test` / `_e2e` 结尾，否则中止（`--force` 才放行）；源库与目标库同名直接拒绝。**这两条是官方工具没有的**，直接跑 `mongorestore` 灌错库不会有任何提示 |
| 连接来源 | 连接串取 `server/.env` 的 `MONGO_URI`，库名由 `--from` / `--to` 决定；跨实例可用 `--from-uri` / `--to-uri` |
| 部分同步 | `--only prices,transactions` 只同步指定集合；`--exclude taskruns` 跳过；`--parallel 8` 调整并行还原集合数 |
| 校验口径 | 集合清单、每集合精确条数、**索引清单**、`_id` 哈希（≤30 万条的集合）；任一不符则退出码为 1。`mongorestore` 自身不做回读比对，这一步是它没有的 |
| 临时归档 | 写系统临时目录，同步结束即删除 |

注意事项：

- 开发库是**快照**，验收前重跑一次。
- 之后在开发库上产生的写入（新建交易、手动同步价格、SSR 重算）不会回写真实库，也不会被下一次镜像保留——这正是「可以随便点、不怕弄脏真实数据」的目的。
- 镜像会连带复制源库的空集合；若源库有误建的空集合，可用 `--exclude` 跳过。
- 官方工具的参数必须写成 `--opt=value`，`--opt value` 会被当成位置参数报错（脚本内部已按此拼装，手工执行时注意）。

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
cd ../server && npm ci --omit=dev && NODE_ENV=production TRUST_PROXY=1 pm2 start server.js --name portomind-api --instances 1
pm2 save
```

> 生产必须显式 `NODE_ENV=production`：否则 CORS fail-fast 不生效、cookie 不会自动 `Secure`。经 Nginx 反代时再加 `TRUST_PROXY=1`，否则 `req.ip` 恒为代理地址（登录限速与审计失真）。

将 `client/dist/` 交给 Nginx 或其他静态服务器。`VITE_API_URL` 是构建时变量；若前端和 API 同域，建议使用默认同源 `/api` 并由 Nginx 转发。

### 6.2 调度所有权确认

```bash
pm2 logs portomind-worker --lines 50 | grep SCHEDULERS_STARTED
# 期望：SCHEDULERS_STARTED {"owner":"cron-worker","count":5}

pm2 logs portomind-api --lines 50 | grep SCHEDULERS_STARTED
# 期望：无输出（server 不持有调度）
```

若使用 PM2 cluster 或多实例，只允许**一个** worker 实例启用调度，其余必须设 `SCHEDULER_ENABLED=false`。详细的调度机制与再平衡分发见 [cron-worker 开发文档](../dev/CRON_WORKER_DEV.md) §3。

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

- **认证与 CORS 已由 TASK-058 U1 落地**：业务端点默认要求登录（`/api/auth/login` 等公开端点除外）；CORS 使用白名单 + `credentials:true`，`CORS_ORIGINS` 生效且生产必填。前端登录页/账户页（U2）尚未上线，**U1 不得单独发布**。详见 §9。
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
| 认证 / 多用户 | **已实现（TASK-058 U1，2026-10-27）** | 单租户多账号：`User` / `Session`（Mongo，绝对 7 天 TTL）+ `requireAuth` / `requireAdmin`；全部业务端点默认 401，`admin`/`member` 两角色；首次登录强制改密。前端登录页/账户页（U2/U3）未上线前 **U1 不得单独发布**。技术决策见 [ADR-001](../architecture/adr/ADR-001-authentication.md)。 |
| CORS | **白名单 + credentials** | `server/app.js` 按 `CORS_ORIGINS`（逗号分隔）放行，其它来源 403；`NODE_ENV=production` 且未配置 `CORS_ORIGINS` 时**启动失败**。开发态未配置时使用本地默认来源（localhost:5173 / 127.0.0.1:5173 / 192.168.2.110:9000）。 |
| 日志脱敏 | 已实现 | 请求日志**不记录请求头**；URL 中常见 token / API key / 密码参数及日志元数据中的敏感键统一替换为 `[REDACTED]`。仍应限制 `logs/` 与 MongoDB 的访问权限；认证只记 `AUTH_*` 事件（不打印密码/哈希）。 |
| 数据传输 | 取决于部署 | 公网部署必须 TLS：`COOKIE_SECURE=true`（production 默认 true）依赖 HTTPS；局域网 HTTP 调试可显式 `COOKIE_SECURE=false`。 |

### 9.1 首次部署与账号运维（TASK-058）

1. 启动 `server` 时若 `users` 集合为空，自动创建 **`admin` / `admin`**（`role=admin`，`mustChangePassword=true`），日志事件 `AUTH_SEEDED_DEFAULT_ADMIN`（**不打印密码**）。已有任意用户则跳过，不覆盖。
2. 首次登录后**必须改密**：除 `/api/auth/change-password`、`/api/auth/logout`、`/api/auth/session` 外，所有接口返回 `403 PASSWORD_CHANGE_REQUIRED`。
3. 忘记 admin 口令属运维动作（不进产品）：连库把目标用户 `passwordHash` 改为已知 bcrypt 哈希（cost 10）并置 `mustChangePassword=true`，或直接删除 `sessions` 集合中的该用户会话。
4. 会话存 `sessions` 集合，`createdAt` 上有 TTL 索引（`SESSION_TTL_DAYS` 天）；服务重启不掉线。
5. 账号管理入口在 `/account/users`（U3，未上线）；当前可用 `curl`/前端调用 `GET/POST /api/users`、`PATCH /api/users/:id`、`POST /api/users/:id/password`（均需 admin 会话）。

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
- [cron-worker 总览](./CRON_WORKER.md) — 入口；运维 / 产品介绍 / 开发三视角见其导航
- [API 契约](../dev/API_CONTRACT.md) — REST API 详细定义
- [ADR-002 单一调度器](../architecture/adr/ADR-002-single-scheduler.md) — 调度架构决策
