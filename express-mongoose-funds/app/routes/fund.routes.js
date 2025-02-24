module.exports = (app) => {
  const funds = require("../controllers/fund.controller.js");
  const router = require("express").Router();

  // Create a fund
  router.post("/create", funds.create);
  // 获取基金每日信息
  router.get("/daily/:fundCode", funds.getDailyInfo);
  // ETF 数据路由
  //router.get('/daily/china-etf-prices', etfController.getETFPrices);
  app.use("/api/funds", router);
};
