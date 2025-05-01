// services/price.service.js (CommonJS 版)

const Price = require('../models/price');

async function getAllPrices() {
  return await Price.find().sort({ timestamp: -1 });
}

async function getPriceById(id) {
  return await Price.findById(id);
}

async function createPrice(data) {
  return await Price.create(data);
}

async function updatePrice(id, data) {
  return await Price.findByIdAndUpdate(id, data, { new: true });
}

async function deletePrice(id) {
  return await Price.findByIdAndDelete(id);
}

// 按 symbol 查询
async function getPricesBySymbol(symbol) {
  return await Price.find({ symbol }).sort({ timestamp: -1 });
}

module.exports = {
  getAllPrices,
  getPriceById,
  createPrice,
  updatePrice,
  deletePrice,
  getPricesBySymbol,
};
