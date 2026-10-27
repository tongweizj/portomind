# server 使用手册

> **server（API 进程）的单一归属文档**：进程是什么、如何运行、端口与日志、手动 API 端点、专属排障。
>
> server 是纯后端，**没有界面、不注册任何定时任务**。界面操作见 [client 使用手册](./CLIENT.md)；
> 定时任务与数据质量程序见 [cron-worker 使用手册](./CRON_WORKER.md)；安装/生产部署见 [系统部署手册](./DEPLOYMENT.md)。

---

## 1. 这是什么

`server` 是 PortoMind 的 **Express API 进程**，监听端口（默认 `8080`），对前端与手动运维提供 HTTP 接口。

关键事实：

- **不持有任何调度**：没有 `SCHEDULER_ENABLED`，也没有 `*_CRON`（见 [cron-worker 总览](./CRON_WORKER.md) §1）。所有自动任务都由 cron-worker 触发。
- **不连券商、不自动交易**：再平衡只生成建议，执行需人工确认。
- **无认证授权**（ADR-001 仅模板）：API 不可暴露公网，仅限可信局域网。安全边界见 [系统部署手册](./DEPLOYMENT.md) §「安全边界」。

---

## 2. 运行

### 2.1 本地开发

```bash
npm run dev:server        # 仓库根执行；等价 nodemon/server 热重载
```

后端地址：`http://localhost:8080`。后端成功连接 MongoDB 后，数据页面才可工作。安装/依赖/
环境变量/基线数据见 [系统部署手册](./DEPLOYMENT.md) §「本地开发搭建」。

### 2.2 生产

```bash
cd server
npm ci --omit=dev
pm2 start server.js --name portomind-api --instances 1
pm2 save
```

生产保活、Nginx 转发、`cron-worker` 的 PM2 配置见 [系统部署手册](./DEPLOYMENT.md) §「生产部署」。

### 2.3 快速健康检查

```bash
curl http://localhost:8080/api/assets
curl http://localhost:8080/api/portfolios
curl http://localhost:8080/api/transactions
curl "http://localhost:8080/api/prices/date/$(date +%F)?page=1&pageSize=20"
```

---

## 3. 环境变量

完整变量表见 [系统部署手册](./DEPLOYMENT.md) §「环境变量」。本进程**必需** `MONGO_URI`；
与 cron-worker **必须共享同一 `MONGO_URI` 与同一 `logs/` 目录**（后者供 `GET /api/logs/tasks` 读取 worker 任务日志）。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MONGO_URI` | —（**必需**） | MongoDB 连接串，须与 cron-worker 同一库 |
| `PORT` | `8080` | 监听端口 |
| `SCHEDULER_TIMEZONE` | `America/Toronto` | 只读/查询类端点解析“当天”所用时区（`GET /api/cron/status` 的目标市场日、`GET /api/logs` 的默认日期），需与 worker 一致 |
| `MARKET_TIMEZONE` | `America/Toronto` | 价格归桶时区（改动前务必评估既有数据） |
| `LOG_DIR` | 仓库根 `logs/` | 可选；默认与 cron-worker 共用 |
| `CORS_ORIGINS` | 不生效 | 当前 `server/app.js` 用 `cors({ origin: true })` 接受任意来源；该变量**未被读取**（见安全边界） |

---

## 4. 日志

- 通用日志：`logs/app-*.log`；任务日志由 cron-worker 写入 `logs/task-*.log`（两进程共用目录，文件名不冲突）。
- 日志脱敏：请求日志不记录请求头；URL/日志中的 token / API key / 密码 / 敏感键统一替换为 `[REDACTED]`。
- 可通过 `GET /api/logs/tasks` 在界面查看后台任务日志（需与 cron-worker 共享 `logs/`）。

---

## 5. 手动 API 端点

这些端点中，除标注「只读」的 `GET /api/cron/status` 外，其余提供**手动触发**能力，与 cron-worker 的定时任务**共用同一业务引擎**（`@portomind/shared`），
结果口径一致。自动触发由 cron-worker 负责（见 [cron-worker 总览](./CRON_WORKER.md) §2）。

| 方法 | 路径 | 作用 |
|---|---|---|
| `GET` | `/api/cron/status` | **只读**聚合查询：5 个定时任务的最近一次运行（运行态）+ 数据态派生指标（价格完成度 / 完整性缺口 / 提醒 / 汇率 / 再平衡）。**不触发任务、不写库**；详情用 `?detail=rebalance&date=&portfolioId=`（同一端点，不新增第二条路由） |
| `POST` | `/api/alerts/evaluate` | 手动跑一次提醒规则评估（界面「立即评估」按钮同效） |
| `POST` | `/api/family/fx/sync` | 手动同步汇率（USD/CAD/HKD → CNY） |
| `PUT` | `/api/family/fx/rates/<CUR>` | 手动录入汇率，如 `PUT /api/family/fx/rates/USD` body `{"rateToCny":7.2}`（数据以 `manual` 标记） |
| `PUT` | `/api/valuations/<CODE>/<METRIC>` | 手动录入估值分位，如 `PUT /api/valuations/000300/pe` body `{"value":12.5,"percentile":25}` |
| `POST` | `/api/portfolios/:pid/rebalance/execute` | 执行再平衡建议（仅在本系统生成交易流水，**不连券商**） |
| `GET` | `/api/logs/tasks` | 读取后台任务日志（需与 cron-worker 共享 `logs/`） |

示例：

```bash
curl -X POST http://localhost:8080/api/alerts/evaluate
curl -X POST http://localhost:8080/api/family/fx/sync
curl -X PUT http://localhost:8080/api/family/fx/rates/USD -H 'Content-Type: application/json' -d '{"rateToCny":7.2}'
curl -X PUT http://localhost:8080/api/valuations/000300/pe -H 'Content-Type: application/json' -d '{"value":12.5,"percentile":25}'
curl http://localhost:8080/api/cron/status
curl 'http://localhost:8080/api/cron/status?detail=rebalance&date=2026-10-26'
```

> 估值分位（`valuation_percentile` 规则）必须先有数据，家庭视图没有录入入口，只能走本 API。

> `GET /api/cron/status` 的「目标市场日」按每日 **03:00** 的价格同步时点计算：日历上的“上一开市日”若尚未到采集时点，会自动回退到最近一次已到点采集覆盖的交易日（避免周末/假日假缺口）。若修改 cron-worker 的 `PRICE_SYNC_CRON`，必须同步修改 `shared/constants/cronStatus.constants.js` 的 `PRICE_SYNC_DUE_HOUR` / `PRICE_SYNC_DUE_MINUTE`。

完整的请求/响应契约见 [API 契约](../dev/API_CONTRACT.md)。

---

## 6. 排障

| 现象 | 原因与处理 |
|---|---|
| 启动报端口占用 | 另一进程占了 `PORT`；改 `PORT` 或释放占用 |
| 数据页空白 / 接口 500 | 多半是 `MONGO_URI` 连不上或库未初始化；先 `npm run verify`（见 [系统部署手册](./DEPLOYMENT.md) §「验证与测试命令」） |
| CORS 报错 | 当前 `cors({ origin: true })` 应接受任意来源；若前端仍报 CORS，检查 `VITE_API_URL` 是否带 `/api` 前缀、Nginx 是否透传 `/api/` |
| 看不到后台任务日志 | `server` 与 `cron-worker` 必须共享同一 `logs/` 目录 |
| API 暴露到公网 | 危险。确保反向代理/防火墙不对外暴露；认证见 [系统部署手册](./DEPLOYMENT.md) §「安全边界」 |

---

## 相关文档

- [client 使用手册](./CLIENT.md) — 界面业务操作
- [cron-worker 总览](./CRON_WORKER.md) — 入口；运维 / 产品介绍 / 开发三视角见其导航
- [系统部署手册](./DEPLOYMENT.md) — 安装/启动/生产部署/环境变量/安全边界/备份
- [API 契约](../dev/API_CONTRACT.md) — REST API 详细定义
