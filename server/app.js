const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { logger } = require('@portomind/shared/config/logger');
const traceId = require('./middleware/traceId');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { success, failure } = require('./utils/apiResponse');
const { requireAuth } = require('./middleware/auth');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const transactionRoutes = require('./routes/transaction.routes');
const portfolioRoutes = require('./routes/portfolio.routes');
const assetRoutes = require('./routes/asset.routes');
const logsRouter = require('./routes/logs.routes');
const rebalanceRecordRoutes = require('./routes/rebalanceRecord.routes');
const priceRoutes = require('./routes/price.routes');
const alertRoutes = require('./routes/alert.routes');
const familyRoutes = require('./routes/family.routes');
const valuationRoutes = require('./routes/valuation.routes');
const cronStatusRoutes = require('./routes/cronStatus.routes');

// ---------------------------------------------------------------------------
// CORS 白名单（TASK-058 / FS §6 U1-R10）
// - 与认证同批上线：白名单 + credentials:true（不能再用 origin:true）
// - 生产（NODE_ENV=production）未配置 CORS_ORIGINS → 启动 fail-fast
// - 非生产未配置时使用本地开发默认值，保证 `npm run dev` 开箱可用
// ---------------------------------------------------------------------------
const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const DEV_DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // TASK-058 U2（D-3）：client/vite.config.js 的 dev 端口是 6600（strictPort）。
  // 浏览器经 Vite 代理发 POST 时会带 `Origin: http://localhost:6600`，同样受本白名单约束，
  // 开发默认来源必须覆盖实际端口，否则「登录」会被 CORS 403 拒绝。
  'http://localhost:6600',
  'http://127.0.0.1:6600',
  'http://192.168.2.110:9000'
];

if (isProduction && configuredOrigins.length === 0) {
  throw new Error(
    'CORS_ORIGINS is required in production: set a comma-separated allow-list (e.g. https://portomind.example.com)'
  );
}

const allowedOrigins = configuredOrigins.length > 0
  ? configuredOrigins
  : (isProduction ? [] : DEV_DEFAULT_ORIGINS);

const app = express();

// 反向代理支持（TASK-058 / Reviewer MAJOR-2）：经 Nginx 等反代时需让 Express 读取
// X-Forwarded-For，否则 req.ip 恒为代理地址 → 登录限速与审计 IP 失真。
// 默认不信任；部署在可信反代后设 TRUST_PROXY=1（或具体跳数）。
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy !== undefined && trustProxy !== '') {
  if (/^\d+$/.test(trustProxy)) {
    app.set('trust proxy', Number(trustProxy));
  } else if (trustProxy === 'true') {
    app.set('trust proxy', true);
  } else if (trustProxy !== 'false') {
    logger.warn('TRUST_PROXY_INVALID', {
      value: trustProxy,
      message: 'TRUST_PROXY 仅支持整数跳数或 true/false；已按「不信任」处理'
    });
  }
}

if (!process.env.NODE_ENV) {
  logger.warn('NODE_ENV_NOT_SET', {
    message: 'NODE_ENV 未设置：按开发态运行（CORS 用开发默认来源、cookie 非 Secure）。生产部署请显式设 NODE_ENV=production'
  });
}

app.use(traceId);
app.use(requestLogger);
app.use(cors({
  origin(origin, callback) {
    // 无 Origin：同源/服务端调用/测试 fetch —— 不涉及浏览器跨源，放行
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error(`Origin not allowed by CORS: ${origin}`);
    error.status = 403;
    error.code = 'CORS_FORBIDDEN';
    return callback(error);
  },
  credentials: true
}));
app.use(cookieParser());
app.use(bodyParser.json());
// 不挂 urlencoded：FS §8 要求「仅接受 application/json」（同时消除表单类 CSRF 面）。

app.get('/', (req, res) => success(res, { message: 'Welcome to Portomind API.' }));

// 公开 / 半公开端点：必须在全站闸门之前挂载（login/session 公开，logout 幂等）
app.use('/api/auth', authRoutes);
// 管理员端点：路由级 requireAuth + requireAdmin 自含
app.use('/api/users', userRoutes);

// ★ 全站准入闸门（TASK-058）：其后的全部业务路由都必须先通过认证
app.use('/api', requireAuth);

app.use('/api/transactions', transactionRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/logs', logsRouter);
app.use('/api/rebalance', rebalanceRecordRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/valuations', valuationRoutes);
// TASK-054：只读聚合（GET /api/cron/status）；不注册 cron、不提供触发能力
app.use('/api/cron', cronStatusRoutes);

app.use((req, res) => failure(req, res, 404, 'API route not found'));
app.use(errorHandler);

module.exports = app;
module.exports.CORS_ALLOWED_ORIGINS = allowedOrigins;
