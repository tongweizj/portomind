module.exports = (app) => {
  const etfController = require('../controllers/etf.controller.js');
  const router = require("express").Router();

  // Create a fund
  router.post("/", etfController.create);
  // ETF 数据路由
  router.get('/daily', etfController.getETFPrices);
  // 获取基金每日信息
  router.get("/daily/:fundCode", etfController.getDailyInfo);

  app.use("/api/etfs", router);
};
