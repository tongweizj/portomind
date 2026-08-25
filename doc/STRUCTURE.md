# PortoMind 代码结构

## 前端

```text
client/src/
├── components/          通用展示、布局和 DataState
├── constants/           枚举与路由生成器
├── hooks/               页面数据 Hook
├── pages/
│   ├── Asset/
│   ├── Portfolio/       组合详情及独立 Tab
│   ├── Prices/
│   └── Transaction/
├── services/            每个业务一个 *.service.js
├── utils/               前端校验与格式化
├── router.jsx           唯一路由入口
└── main.jsx             React/TanStack Query 启动入口
```

所有 service 复用 `services/api.js` 的 Axios 实例。实例负责基础地址、统一成功结构解包和错误对象规范化；页面不自行拼接 host 或 `/api`。

组合详情的基本信息、目标配置、交易、持仓、持仓历史、再平衡设置、建议和历史各自负责数据请求，一个 Tab 失败不会阻断其他 Tab。

## 后端

```text
server/
├── app.js               Express 中间件和路由装配，不监听端口
├── server.js            数据库、统一调度器和 HTTP 启动
├── constants/           领域枚举
├── controllers/         HTTP 参数和响应适配
├── middleware/          traceId、访问日志、错误处理
├── models/              Mongoose 模型和索引
├── routes/              REST 路由；固定路由先于 /:id
├── services/
│   ├── fetchers/        外部行情适配器
│   ├── portfolio/       持仓查询和历史
│   ├── rebalance/       阈值、建议、执行、记录和调度
│   ├── transaction/     纯持仓计算器
│   └── *.service.js     顶层业务服务
├── tasks/               统一调度和人工同步入口
├── test/integration/    核心业务与 HTTP 契约测试
└── utils/               API 响应、时区和日志脱敏
```

调用方向固定为 Route → Controller → Service → Model。持仓纯计算不访问数据库；数据库适配层先标准化交易和价格，再调用同一计算器生成概览与历史。

## 调度边界

`tasks/scheduler.js` 是唯一调度启动入口，由 `server.js` 在数据库连接后调用。cron-worker 的 `schedulers/priceScheduler.js` 注册价格 cron、`schedulers/healthScheduler.js` 注册价格完整性检查 cron（晚于价格同步），二者共用 `schedulers/cronScheduler.js` 的 `createCronScheduler` 工厂；完整性检查由 `src/tasks/integrityCheck.js` 依据资产 `launchDate` 与市场交易日历推算 Expected Count、查 `Price` 得 Actual Count，输出完整率报告并按缺失区间自动回补。再平衡动态任务由 `services/rebalance/scheduleManager.js` 管理。所有任务通过 `services/taskRunner.js` 写入 `TaskRun`、生成摘要并防止重复运行。

## 已清理的旧边界

- 删除旧 ETF 页面、legacy Portfolio 页面、重复 API service 和空 WebSocket 文件。
- 删除引用不存在 service 的旧手工测试脚本。
- 删除独立再平衡调度脚本；不再通过导入副作用或系统 cron 启动任务。
- 旧需求文档仅用于历史追溯，不作为当前实现清单。
