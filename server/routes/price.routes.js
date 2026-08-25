const express = require('express');
const priceController = require('../controllers/price.controller');

const router = express.Router();

// 查询端点保持明确，并全部先于动态 CRUD /:id 注册。
router.get('/today', priceController.getTodayPrices);
router.get('/date/:date', priceController.getPricesByDate);
router.get('/symbol/:symbol/history', priceController.getPriceHistory);

router.post('/', priceController.createPrice);
router.get('/:id', priceController.getPriceById);
router.put('/:id', priceController.updatePrice);
router.delete('/:id', priceController.deletePrice);

module.exports = router;
