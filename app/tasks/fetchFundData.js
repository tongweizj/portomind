const cron = require("node-cron");
const { getFundDailyInfo } = require("../services/yahoo.service");

// 基金代码列表
const fundCodes = [
    "XQQ.TO",
    "AAPL.TO",
    "AMZN.TO",
    "MSFT.TO",
    // 添加更多基金代码
  ];


// 定时任务：每天 9 点抓取所有基金信息
function fetchFundData() {
    cron.schedule("0 9 * * *", async () => {
      console.log("Fetching daily fund data...");
  
      try {
        // 使用 Promise.all 并发抓取所有基金数据
        const results = await Promise.all(
          fundCodes.map(async (fundCode) => {
            try {
              const result = await getFundDailyInfo(fundCode);
              console.log(`Successfully fetched data for ${fundCode}`);
              return result;
            } catch (error) {
              console.error(`Error fetching data for ${fundCode}:`, error.message);
              return null; // 返回 null 以标记抓取失败的基金
            }
          })
        );
  
        // 统计抓取结果
        const successfulFetches = results.filter((res) => res !== null);
        console.log(`Fetched ${successfulFetches.length} funds successfully.`);
      } catch (error) {
        console.error("Error fetching fund data:", error.message);
      }
    });
  }

module.exports = fetchFundData;