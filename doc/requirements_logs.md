## TODO List

1. **创建日志目录**：在 `server/` 根下创建 `logs/` 目录并设置写权限。
2. **安装依赖**：运行 `npm install winston winston-daily-rotate-file uuid on-finished`。
3. **添加配置文件**：在 `server/config/logger.js` 中集成 `winston-daily-rotate-file` 配置。
4. **开发中间件**：
   - `server/middleware/traceId.js` 生成并注入 `req.traceId`。
   - `server/middleware/requestLogger.js` 记录 HTTP 请求日志。
   - `server/middleware/errorHandler.js` 捕获异常并输出错误日志。
5. **创建日志路由**：在 `server/routes/logs.js` 中实现按 `level=error` 分页读取接口。
6. **更新任务脚本**：在 `server/tasks/priceFetcher.js` 中导入并使用 `logger`。
7. **集成中间件**：在 `server/server.js` 中按顺序引入并使用所有中间件及路由。
8. **环境变量配置**：在 `.env` 中添加并说明 `LOG_DIR`、`LOG_LEVEL`、`LOG_MAX_FILES`。
9. **本地测试**：
   - 验证日志按天切割生成。
   - 测试 HTTP 请求日志和全局异常日志。
   - 测试价格抓取任务日志。
10. **文档和提交**：
   - 更新 `README.md` 中日志功能说明。
   - 提交并发起 Pull Request。 
*/

## 项目目录结构
在 server/ 目录下新增日志功能相关文件
```markdown
server/
├── config/
│   └── logger.js          # Winston 日志基础配置，支持按天切割
├── middleware/
│   ├── traceId.js         # 生成并注入请求 Trace ID
│   ├── requestLogger.js   # HTTP 请求日志中间件
│   └── errorHandler.js    # 全局异常捕获与 Error 日志中间件
├── controllers/
├── models/
├── routes/
│   └── logs.js            # 提供 Error 级别日志查询 API
├── services/
├── tasks/
│   └── priceFetcher.js    # 投资品价格抓取脚本，支持日志
├── test/
├── logs/                  # 日志文件存储目录，确保存在并可写
├── server.js              # 应用入口，集成所有中间件
├── package.json
├── package-lock.json
└── README.md
```

## 日志文件存储路径

- 默认路径：`${project_root}/server/logs`
- 可通过环境变量 `LOG_DIR` 覆盖
- 部署时需确保该目录存在，并对应用有写权限

## 文件命名规则（v0.1）

- 按日期每日切割：`app-YYYY-MM-DD.log`
- 保留最近日志文件数量：默认 60 天，可通过 `LOG_MAX_FILES` 环境变量调整

## 日期切割方法（v0.1 支持）

- 使用 `winston-daily-rotate-file` 插件，按天生成新文件
- 支持自动清理过期文件

---
### 示例：`server/config/logger.js`
```js
const path = require('path');
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// 日志目录，优先取环境变量
const logDir = process.env.LOG_DIR || path.join(__dirname, '../logs');

// 创建 Logger 实例
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json()
  ),
  transports: [
    // 控制台输出
    new transports.Console(),
    // 按天切割文件
    new DailyRotateFile({
      dirname: logDir,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false,
      maxFiles: process.env.LOG_MAX_FILES || '60d',
      level: process.env.LOG_LEVEL || 'info'
    })
  ]
});

module.exports = logger;
```

### 任务脚本中日志支持（`server/tasks/priceFetcher.js`）
```js
const logger = require('../config/logger');
const fetch = require('node-fetch');

async function fetchMarketPrices() {
  const traceId = 'task-' + new Date().toISOString();
  try {
    logger.info('PRICE_FETCH_START', { traceId, timestamp: new Date().toISOString() });
    const response = await fetch('https://api.example.com/prices');
    const data = await response.json();
    logger.info('PRICE_FETCH_SUCCESS', { traceId, count: data.length });
    // 处理并保存 data...
  } catch (err) {
    logger.error('PRICE_FETCH_ERROR', { traceId, message: err.message, stack: err.stack });
    throw err;
  }
}

module.exports = { fetchMarketPrices };
```

### 路由注册（`server/server.js`）
```js
require('dotenv').config();
const express = require('express');
const logger = require('./config/logger');
const traceId = require('./middleware/traceId');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const logsRouter = require('./routes/logs');
const { fetchMarketPrices } = require('./tasks/priceFetcher');

const app = express();
app.use(express.json());

// 插入 Trace ID & 请求日志
app.use(traceId);
app.use(requestLogger);

// 日志查询接口
app.use('/api/logs', logsRouter);

// 全局错误处理
app.use(errorHandler);

// 示例：手动触发价格抓取任务
app.get('/api/tasks/fetch-prices', async (req, res, next) => {
  try {
    await fetchMarketPrices();
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Server started on port ${PORT}`));
```