const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const traceId = require('./middleware/traceId');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { success, failure } = require('./utils/apiResponse');

const transactionRoutes = require('./routes/transaction.routes');
const portfolioRoutes = require('./routes/portfolio.routes');
const assetRoutes = require('./routes/asset.routes');
const logsRouter = require('./routes/logs.routes');
const rebalanceRecordRoutes = require('./routes/rebalanceRecord.routes');
const priceRoutes = require('./routes/price.routes');
const alertRoutes = require('./routes/alert.routes');

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://192.168.2.110:9000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// app.use(cors({
//   origin(origin, callback) {
//     if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
//     const error = new Error('Not allowed by CORS');
//     error.status = 403;
//     return callback(error);
//   }
// }));
app.use(cors({ origin: true }));
app.use(traceId);
app.use(requestLogger);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => success(res, { message: 'Welcome to Portomind API.' }));
app.use('/api/transactions', transactionRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/logs', logsRouter);
app.use('/api/rebalance', rebalanceRecordRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/alerts', alertRoutes);

app.use((req, res) => failure(req, res, 404, 'API route not found'));
app.use(errorHandler);

module.exports = app;
