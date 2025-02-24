const express = require('express');
const etfController = require('../controllers/etfController');

const router = express.Router();

// ETF 数据路由
router.get('/etf-prices', etfController.getETFPrices);

module.exports = router;