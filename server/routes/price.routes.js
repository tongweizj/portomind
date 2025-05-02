const express = require('express');
// 整个模块导入，后面用 priceController.someHandler
const priceController = require('../controllers/price.controller');

const router = express.Router();

// 按 symbol 获取所有价格（放在 :symbol 前，避免冲突）
router.get('/symbol/:symbol', priceController.getPricesBySymbol);

// 原有 CRUD 路由
router
  .route('/')
  .get(priceController.getAllPrices)
  .post(priceController.createPrice);

// 查询所有资产今天的价格
router.get('/today', priceController.getTodayPrices);

router
  .route('/:id')
  .get(priceController.getPriceById)
  .put(priceController.updatePrice)
  .delete(priceController.deletePrice);

module.exports = router;
