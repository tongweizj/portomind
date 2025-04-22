const yahoo = require('./yahooPrice');
const tiantian = require('./tiantianPrice');
const Price = require('../models/price');
/**
 * 统一价格获取入口，根据 symbol 自动分发
 * 示例:
 * - "AAPL"     -> Yahoo
 * - "600519.SS" -> Yahoo
 * - "005827.cn" -> 天天基金
 */
async function getLatestPrice(symbol) {
  if (symbol.endsWith('.cn')) {
    const fundCode = symbol.replace('.cn', '');
    return await tiantian.getFundPrice(fundCode);
  } else {
    return await yahoo.getYahooPrice(symbol);
  }
}

/**
 * 查询并保存价格（如果当天还没保存）
 */
async function fetchAndStorePrice(symbol) {
    const priceData = await getLatestPrice(symbol);
    if (!priceData) return null;
  
    // 查找今天是否已有数据（按 symbol + 日期）
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
  
    const exists = await Price.findOne({
      symbol: priceData.symbol,
      timestamp: { $gte: startOfDay }
    });
  
    if (!exists) {
      await new Price(priceData).save();
      console.log(`✅ 已保存价格：${symbol}`);
    } else {
      console.log(`ℹ️ 已存在今日数据：${symbol}`);
    }
  
    return priceData;
  }
  
  module.exports = {
    getLatestPrice,
    fetchAndStorePrice
  };