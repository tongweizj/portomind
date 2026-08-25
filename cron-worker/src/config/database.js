// cron-worker/src/config/database.js
// 基于 Mongoose 的数据库连接与断开封装，行为与 ../server 保持一致。

const mongoose = require('mongoose');
mongoose.set('strictQuery', true);

async function connect(uri = process.env.MONGO_URI) {
  if (!uri) throw new Error('MONGO_URI is required');
  await mongoose.connect(uri);
  return mongoose;
}

async function disconnect() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  connect,
  disconnect,
  mongoose
};
