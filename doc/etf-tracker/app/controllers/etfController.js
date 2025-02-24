const ETF = require('../models/ETF');

// 获取所有 ETF 数据
const getETFPrices = async (req, res) => {
  try {
    const prices = await ETF.find();
    res.json(prices);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching ETF prices from database');
  }
};

module.exports = {
  getETFPrices,
};