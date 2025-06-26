const express = require('express');
// 整个模块导入，后面用 priceController.someHandler
const priceController = require('../controllers/price.controller');
const router = express.Router();


// 全资产价格数据
router
  .route('/')
  .get(priceController.getAllPrices)
  .post(priceController.createPrice);

router
  .route('/:id')
  .get(priceController.getPriceById)
  .put(priceController.updatePrice)
  .delete(priceController.deletePrice);

// TODO: 重构
// 下面代码明显是重复的
// 查询所有资产今天的价格
router.get('/today', priceController.getTodayPrices);

// 按 symbol 获取所有价格（放在 :symbol 前，避免冲突）
router.get('/symbol/:symbol', priceController.getPricesBySymbol);



module.exports = router;
