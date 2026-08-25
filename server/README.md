# PortoMind Server

Express + MongoDB 后端。完整运行步骤见 [开发文档](../doc/DEVELOPMENT.md)，接口定义见 [API 契约](../doc/API_CONTRACT.md)。

```bash
cp .env.example .env
npm ci
npm run dev
```

常用命令：

- `npm test`：核心业务和 HTTP 集成测试
- `npm run validate`：检查后端 JavaScript 语法
- `npm run seed:baseline`：幂等写入本地验证数据
- `npm run verify`：语法检查及 MongoDB 基线验证
- `npm run sync:prices`：人工执行一次价格同步

服务入口是 `app.js`；`server.js` 负责数据库连接、统一调度器启动和 HTTP 监听。不要直接运行 `tasks/priceScheduler.js`。
