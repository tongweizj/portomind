const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const scheduleJobs = require("./cron-jobs"); // 引入定时任务模块
const app = express();

var corsOptions = {
  origin: "http://localhost:5173"
};

app.use(cors(corsOptions));

// parse requests of content-type - application/json
app.use(bodyParser.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

const db = require("./models");
db.mongoose
  .connect(db.url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => {
    console.log("Connected to the database!");
  })
  .catch(err => {
    console.log("Cannot connect to the database!", err);
    process.exit();
  });

// 启动定时任务
scheduleJobs();

// simple route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to bezkoder application." });
});

//require("./doc/turorial.routes")(app); // 一个模块,使用单一路径 + router 文件 
require("./routes/etf.routes")(app);
const transactionRoutes = require('./routes/transaction');
app.use('/api/transactions', transactionRoutes);
// 挂载投资组合
const portfolioRoutes = require('./routes/portfolio');
app.use('/api/portfolios', portfolioRoutes);
// 中挂载 asset 路由
const assetRoutes = require('./routes/asset');
app.use('/api/assets', assetRoutes);
// set port, listen for requests
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});
