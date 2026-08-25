// cron-worker/src/config/env.js
// 统一环境变量加载：任何入口（index.js 或 src/tasks/* 直接运行）只需 require 本模块，
// 即加载 cron-worker/.env（非 server/.env），不再各自调用 dotenv。
// 注意：必须在读取 process.env 的模块（如 marketTime、timeout）之前 require 本模块。

const path = require('path');
const dotenv = require('dotenv');

const ENV_PATH = path.resolve(__dirname, '../../.env');
dotenv.config({ path: ENV_PATH });

module.exports = { ENV_PATH };
