const axios = require('axios');
const cheerio = require('cheerio');
// const ETF = require("../models/fundDailyData.model");
const db = require("../models");
const etfDaily = db.etfDaily;
// 抓取单个 ETF 的数据
async function fetchETFData(code) {
  const url = `https://finance.sina.com.cn/fund/quotes/${code}/bc.shtml`;
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const name = $('h1.fund_name').text().trim();
    const price = parseFloat($('span.fund_data').text().trim());

    const change = 0;
    const volume = 20;

    // let timestamp =  new Date().toISOString();
    let codeStr =  code.toString();
    return {
      code:codeStr,
      name,
      price,
      change,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error fetching data for ETF ${code}:`, error);
    return null;
  }
}

// 抓取多个 ETF 的数据并保存到数据库
async function fetchAndSaveChineseETFData(codes) {
  for (const code of codes) {
    const etfData = await fetchETFData(code);
    // console.log(`etfData: ${etfData.codeStr}`);
    if (etfData) {
      const etf = new etfDaily(etfData);
      await etf.save();
      console.log(`Saved data for ETF ${code}`);
    }
  }
}

module.exports = {
  fetchAndSaveChineseETFData,
};