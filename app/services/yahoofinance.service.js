const yahooFinance = require("yahoo-finance2").default;
// const Fund = require("../models/fund.model"); 
const FundDailyData = require("../models/fundDailyData.model");

const getFundDailyInfo = async (fundCode) => {
  try {
    const result = await yahooFinance.quote(fundCode);
    const fundData = {
      fundCode,
      price: result.regularMarketPrice,
      change: result.regularMarketChangePercent || 0,
      timestamp: new Date().toISOString(),
    };

    const existingFund = await FundDailyData.findOne({
      fundCode,
      timestamp: { $gte: new Date().setHours(0, 0, 0, 0) }, // 当天零点
    });
    
    if (!existingFund) {
      // 保存数据到 MongoDB
      const fund = new FundDailyData(fundData);
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