const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const routes = require('./app/routes');

const app = express();
const PORT = process.env.PORT || 5000;

// 中间件
app.use(cors());
app.use(express.json());

// 连接 MongoDB
mongoose.connect('mongodb://tongweizj:tw273634@192.168.2.110:27017/express-api-demo', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// 路由
app.use('/api', routes);

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});