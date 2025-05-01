const express               = require("express");
const bodyParser            = require("body-parser");
const cors                  = require("cors");
const { logger }            = require('./config/logger');
const app                   = express();
require('dotenv').config();
const traceId               = require('./middleware/traceId');
const requestLogger         = require('./middleware/requestLogger');
const errorHandler          = require('./middleware/errorHandler');
const logsRouter            = require('./routes/logs.routes');
const rebalanceRecordRoutes = require('./routes/rebalanceRecord.routes');
const transactionRoutes     = require('./routes/transaction.routes');
const portfolioRoutes       = require('./routes/portfolio.routes');
const priceRoutes           = require('./routes/price.routes');
const assetRoutes           = require('./routes/asset.routes');

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://192.168.2.110:9000'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};

app.use(cors(corsOptions));

// 注入 Trace ID 中间件 & 请求日志中间件
app.use(traceId);
app.use(requestLogger);

// parse requests of content-type - application/json
app.use(bodyParser.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

const db = require("./models");
db.mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => {
    console.log("Connected to the database!");
    logger.info("Connected to the database!");
  })
  .catch(err => {
    console.log("Cannot connect to the database!", err);
    logger.error("Cannot connect to the database!", { error: err.message, stack: err.stack });
    process.exit();
  });

// 挂载路由
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Max application." });
});
app.use('/api/transactions', transactionRoutes);
app.use('/api/portfolios', portfolioRoutes); // 投资组合
app.use('/api/assets', assetRoutes); // asset 路由
app.use('/api/logs', logsRouter); // 日志查询接口
app.use('/api/rebalance', rebalanceRecordRoutes);
app.use('/api/prices', priceRoutes);

// 全局异常处理（需在所有路由之后注册）
app.use(errorHandler);
// set port, listen for requests
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});
