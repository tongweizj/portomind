# PortoMind

PortoMind 是一个自托管的个人投资组合管理应用，覆盖资产、行情、交易、持仓、目标配置、再平衡建议和任务日志。当前版本面向单用户本地部署；建议仅在可信网络中运行。

![PortoMind Logo](./doc/logo.png)

## 当前能力

- 资产 CRUD、搜索、分页、排序、关注列表和启用状态
- Yahoo Finance 与天天基金行情适配器、日价格幂等同步、历史价格查询
- 交易 CRUD、超卖校验和移动平均成本持仓计算
- 组合目标比例校验、持仓概览及历史趋势
- “生成建议 → 用户确认执行 → 撤销/重做”的再平衡闭环
- Node 常驻调度、任务防重、逐资产故障隔离和可追踪日志
- 前后端统一 API 响应与 Axios 错误处理

当前不支持登录、多用户、汇率换算或无人值守自动交易。不同币种不会直接合计。

## 技术栈

- 前端：React 19、Vite 6、React Router 7、TanStack Query、Tailwind CSS
- 后端：Node.js、Express 4、Mongoose 6、MongoDB
- 任务：node-cron、Winston、MongoDB `TaskRun` 防重记录
- 测试：Node.js test runner、HTTP 集成测试和表格驱动业务测试

## 快速开始

要求 Node.js、npm 和 MongoDB。项目验证基线使用 Node.js 24。

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env

cd server
npm ci
npm run seed:baseline
npm run dev
```

另开终端：

```bash
cd client
npm ci
npm run dev
```

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8080`
- API 前缀：`http://localhost:8080/api`

生产部署必须保证只有一个 Node 进程设置 `SCHEDULER_ENABLED=true`。PM2 只负责保活，不要再通过系统 cron 调用价格或再平衡脚本。

## 验证

```bash
cd server
npm test
npm run validate

cd ../client
npm run lint
npm run build
```

需要连接本地 MongoDB 的可重复基线验证：

```bash
cd server
npm run verify
```

## 文档

- [开发与运行说明](./doc/DEVELOPMENT.md)
- [部署说明](./doc/DEPLOY.md)
- [生产操作指南（行情与数据质量）](./doc/OPERATIONS.md)
- [REST API 契约](./doc/API_CONTRACT.md)
- [项目结构](./doc/STRUCTURE.md)
- [功能验证基线](./doc/FUNCTIONAL_BASELINE.md)
- [依赖升级评估](./doc/DEPENDENCY_UPGRADES.md)
- [后续路线图](./doc/ROADMAP.md)

## 重要业务规则

- 交易方向为 `buy | sell`，数量和价格必须大于零，禁止做空。
- 持仓采用移动平均成本；卖出按卖出前平均成本减少剩余成本。
- 非空目标配置必须精确合计 100%。
- 再平衡自动任务只生成建议，不会自动创建交易。
- 日价格按 `MARKET_TIMEZONE` 解释，数据库保存 UTC 时间。
- 当前金额保留资产原币种；在引入可信汇率源前不做跨币种汇总。

## 安全边界

当前没有认证与授权，API 不应直接暴露到公网。日志会脱敏常见 Token、密码、API Key 和连接字符串，但仍应限制日志文件和 MongoDB 的访问权限。

## License

后端 package 当前声明 ISC。若准备公开发布，应在仓库根目录补充正式 `LICENSE` 文件并统一前后端许可声明。
