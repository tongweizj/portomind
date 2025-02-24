// const ETF = require('../models/ETF');
const db = require("../models");
const Fund = db.fund;
const FundDailyData = require("../models/fundDailyData.model");
// 获取所有 ETF 数据
const getETFPrices = async (req, res) => {
  try {
    const prices = await FundDailyData.find();
    res.json(prices);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching ETF prices from database');
  }
};

module.exports = {
  getETFPrices,
};