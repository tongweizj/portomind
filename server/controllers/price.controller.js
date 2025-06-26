// controllers/price.controller.js (CommonJS 版)

const asyncHandler = require('express-async-handler');
const priceService = require('../services/price.service');

exports.getAllPrices = asyncHandler(async (req, res) => {
  const { date } = req.query;
  // 校验格式: 若传入但格式错误，返回错误
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid date format. Use YYYY-MM-DD.',
    });
  }
  const result = await priceService.getPricesByDate(date);
  res.json({
    success: true,
    date: result.date,
    data: result.data
  });
});

exports.getPriceById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const price = await priceService.getPriceById(id);
  if (!price) {
    return res.status(404).json({ success: false, message: 'Price not found' });
  }
  res.json({ success: true, data: price });
});

exports.createPrice = asyncHandler(async (req, res) => {
  const newPrice = await priceService.createPrice(req.body);
  res.status(201).json({ success: true, data: newPrice });
});

exports.updatePrice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updated = await priceService.updatePrice(id, req.body);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Price not found' });
  }
  res.json({ success: true, data: updated });
});

exports.deletePrice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await priceService.deletePrice(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Price not found' });
  }
  res.json({ success: true, data: deleted });
});

// 按 symbol 查询
exports.getPricesBySymbol = asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  const prices = await priceService.getPricesBySymbol(symbol);
  res.json({ success: true, data: prices });
});


/**
 * GET /api/prices/today
 * 查询所有资产当天的最新价格
 */
exports.getTodayPrices = asyncHandler(async (req, res) => {

    const prices = await priceService.getTodayPrices();
    res.json({ success: true, date: new Date().toISOString().slice(0, 10), data: prices });
  
});