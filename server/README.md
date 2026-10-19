# PortoMind Server

Express + MongoDB 后端（`@portomind/server`）。**业务引擎来自 `@portomind/shared`，本进程不持有任何定时任务。**

完整运行步骤见 [系统部署手册](../docs/manual/DEPLOYMENT.md)，接口定义见 [API 契约](../docs/dev/API_CONTRACT.md)，调度归属见 [调度进程手册](../docs/manual/CRON_WORKER.md) §3。

## 启动

仓库根目录是 npm workspaces monorepo，依赖在**根目录**统一安装：

```bash
cp server/.env.example server/.env
npm ci                  # 在仓库根目录执行
npm run dev:server      # 或在 server/ 下 npm run dev
```

## 常用命令

在 `server/` 下执行：

- `npm test`：核心业务和 HTTP 集成测试（`test/integration/*.test.js`）
- `npm run validate`：检查后端 JavaScript 语法
- `npm run seed:baseline`：幂等写入本地验证数据
- `npm run verify`：语法检查及 MongoDB 基线验证
- `npm run sync:prices`：人工执行一次价格同步（CLI 薄壳，调用 `shared` 内核）

## 目录职责

| 目录 | 内容 |
|---|---|
| `app.js` | Express 应用装配（路由、中间件、错误处理） |
| `server.js` | 入口：连接 MongoDB + HTTP 监听；**不启动任何 cron** |
| `routes/` `controllers/` | REST 接口层 |
| `middleware/` | traceId、访问日志、统一错误处理 |
| `utils/apiResponse.js` | 统一响应封装 |
| `tasks/dailySync.js` | 手动价格同步 CLI 薄壳（加载 `.env` → 建连 → 调用 `@portomind/shared/tasks/dailySync` → 断开） |
| `scripts/` | 基线种子与校验脚本 |
| `test/` | 集成测试 |

其余业务实现（models / services / tasks 内核 / fetchers / constants / config / utils）**全部在 `../shared`**，通过 `@portomind/shared/...` 引用。不要在本目录新增业务实现或复制既有实现。

> 定时任务由 `cron-worker` 独家注册（ADR-002）。若在本进程看到 `node-cron` 相关代码，那是架构回归。
