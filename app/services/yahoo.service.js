const yahooFinance = require("yahoo-finance2").default;
const db = require("../models");
const etfDaily = db.etfDaily;

const getFundDailyInfo = async (fundCode) => {
  try {
    const result = await yahooFinance.quote(fundCode);
    console.log(result);
    const fundData = {
      code: result.symbol,
      name: result.shortName,
      price: result.regularMarketPrice,
      change: result.regularMarketChangePercent || 0,
      timestamp: new Date().toISOString(),
    };

    const existingFund = await etfDaily.findOne({
      fundCode,
      timestamp: { $gte: new Date().setHours(0, 0, 0, 0) }, // 当天零点
    });
    
    if (!existingFund) {
      // 保存数据到 MongoDB
      const fund = new etfDaily(fundData);
      await fund.save();// 保存到数据库
    }
    

    return fundData;
  } catch (err) {
    console.error("Error fetching fund data:", err.message);
    throw new Error("Failed to fetch fund daily info");
  }
};

//getFundDailyInfo("XQQ.TO").then(console.log);
module.exports = { getFundDailyInfo };