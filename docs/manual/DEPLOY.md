# PortoMind 部署说明

> **生产部署的唯一归属文档**：构建、生产环境变量、PM2、Nginx、上线检查、备份与迁移、安全边界。
> 本地开发环境与验证命令见 [DEVELOPMENT.md](./DEVELOPMENT.md)；调度机制与数据质量运维见 [OPERATIONS.md](./OPERATIONS.md)。

当前版本适合部署在可信局域网，面向单用户。

---

## 1. 构建

```bash
git clone <repository-url> portomind
cd portomind

cp server/.env.example server/.env
cp client/.env.example client/.env
cp cron-worker/.env.example cron-worker/.env

# 依赖在仓库根统一安装（npm workspaces：shared / server / cron-worker / client）
npm install

# 验证
npm run test:server
npm run test:worker
npm run --workspace client lint
npm run --workspace client build
```

完整验证命令清单（`test` / `validate` / `lint` / `build` / `verify`）的唯一归属是 [DEVELOPMENT.md](./DEVELOPMENT.md) §「验证命令」。

将 `client/dist/` 交给 Nginx 或其他静态服务器。`VITE_API_URL` 是构建时变量；若前端和 API 同域，建议使用默认同源 `/api` 并由 Nginx 转发。

---

## 2. 后端环境变量

### 2.1 server（API 进程）

至少配置：

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/portomind
PORT=8080
SCHEDULER_TIMEZONE=America/Toronto   # 仅日志查看接口按调度时区取当天日期，需与 worker 一致
MARKET_TIMEZONE=America/Toronto
```

> `server` **不持有任何调度**：没有 `SCHEDULER_ENABLED`，也没有 `*_CRON`（见 §3）。
> `CORS_ORIGINS` 可以留空——**它当前不生效**（见 §6 安全边界）。
> `LOG_DIR` 可留空：默认写入**仓库根 `logs/`**，与 `cron-worker` 共用（这样 `GET /api/logs/tasks` 能读到 worker 的任务日志）。

### 2.2 cron-worker（唯一调度进程）

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/portomind
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
```

调度的完整环境变量清单与开关详解见 [OPERATIONS.md](./OPERATIONS.md) §3.2。

MongoDB 账号应只拥有 PortoMind 数据库所需权限；`.env` 和日志文件不能进入静态目录或版本控制。

---

## 3. 进程与调度所有权

**架构决策（[ADR-002](../architecture/adr/ADR-002-single-scheduler.md)）**：`cron-worker` 是 **唯一**的调度所有者，
单进程注册全部 5 类定时任务；`server` **不注册任何 cron**。因此**不存在**「二选一拓扑」，也不会再有任务因选错所有者而静默停跑。
不要配置系统 cron 调用任务脚本，PM2 只负责保活。

```bash
cd cron-worker
npm ci --omit=dev
pm2 start index.js --name portomind-worker --instances 1

cd ../server
npm ci --omit=dev
pm2 start server.js --name portomind-api --instances 1

pm2 save
```

启动自检：

```bash
pm2 logs portomind-worker --lines 50 | grep SCHEDULERS_STARTED
# 期望：SCHEDULERS_STARTED {"owner":"cron-worker","count":5}

pm2 logs portomind-api --lines 50 | grep SCHEDULERS_STARTED
# 期望：无输出（server 不持有调度）
```

若使用 PM2 cluster 或多实例，只允许**一个** worker 实例启用调度，其余必须设 `SCHEDULER_ENABLED=false`。
详细的调度机制、再平衡分发规则与故障隔离见 [OPERATIONS.md](./OPERATIONS.md) §3.1。

---

## 4. Nginx 示例

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

---

## 5. 上线检查

- [ ] `npm test`、`npm run --workspace server verify`、前端 `lint` / `build` 全部通过（命令见 [DEVELOPMENT.md](./DEVELOPMENT.md) §「验证命令」）。
- [ ] `npm audit --omit=dev` 前后端均无已知漏洞。
- [ ] `cron-worker` 日志有 `SCHEDULERS_STARTED {"count":5}`，`server` 日志**无** `SCHEDULERS_STARTED`（见 §3）。
- [ ] `server` 与 `cron-worker` 使用**同一** `MONGO_URI` 与**同一** `logs/` 目录。
- [ ] API 未暴露到公网；`/api/logs` 仅在可信网络可访问。
- [ ] MongoDB 和日志目录有备份、容量与保留策略（见 §7）。
- [ ] 外部行情失败能在任务日志中追踪，但不会中断其他资产。

Docker 尚未作为当前交付方式；容器化前应先设计健康检查、非 root 用户、持久卷、备份恢复和调度器单例策略。

---

## 6. 安全边界

本节是安全边界的**唯一归属**；[USER_GUIDE.md](./USER_GUIDE.md) §1 与 [README](../README.md) 只做一句话引用。

| 项 | 当前状态 | 说明 |
|---|---|---|
| 认证 / 多用户 | **无** | 没有登录体系与授权。**API 不要暴露到公网**，仅限可信局域网。ADR-001 目前只是模板。 |
| CORS | **不校验来源** | `server/app.js` 使用 `cors({ origin: true })`，**任意来源都被接受**；白名单实现被注释、`CORS_ORIGINS` 环境变量**不被读取**。单用户本地部署下可接受，但上线前必须二选一：① 恢复白名单实现并让 `CORS_ORIGINS` 生效；② 保持开放，但确保网络层（反向代理 / 防火墙）不对外暴露。 |
| 日志脱敏 | 已实现 | 请求日志**不记录请求头**；URL 中常见 token / API key / 密码参数及日志元数据中的敏感键统一替换为 `[REDACTED]`。仍应限制 `logs/` 与 MongoDB 的访问权限。 |
| 数据传输 | 取决于部署 | 示例使用 TLS；若在局域网内以 HTTP 直连，请自行评估风险。 |

---

## 7. 备份与迁移

本节是备份/迁移的**唯一归属**；[USER_GUIDE.md](./USER_GUIDE.md) §6 只做引用。

需要备份的内容：

| 内容 | 位置 | 说明 |
|---|---|---|
| 业务数据 | MongoDB `portomind` 库 | 资产 / 组合 / 交易 / 价格 / 提醒 / 汇率 / TaskRun 全在此，**最重要** |
| 运行日志 | `logs/`（仓库根，`server` 与 `cron-worker` 共用） | `app-*.log` / `task-*.log` / `exceptions-*.log` / `rejections-*.log`；排障用，可按保留策略裁剪 |
| 前端产物 | `client/dist/` | 静态构建产物，可随时重新构建，不必备份 |

迁移服务器时直接拷贝数据库即可；前端重新 `npm run --workspace client build` 生成。
恢复后确认 `cron-worker` 日志出现 `SCHEDULERS_STARTED {"count":5}`（§3）。

---

## 相关文档

- [USER_GUIDE.md](./USER_GUIDE.md) — 功能怎么用（业务操作）
- [DEVELOPMENT.md](./DEVELOPMENT.md) — 本地开发环境与验证命令
- [OPERATIONS.md](./OPERATIONS.md) — 调度所有权、价格同步、完整性检查、历史回补、排障
