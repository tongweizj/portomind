const axios = require('axios');
const cheerio = require('cheerio');
const ETF = require('../models/ETF');

// 抓取单个 ETF 的数据
async function fetchETFData(code) {
  const url = `https://finance.sina.com.cn/fund/quotes/${code}/bc.shtml`;
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    console.log(`Response status for ${code}:`, response.status); // Log status
    console.log(`Response data for ${code}:`, response.data); // Log raw HTML (optional)

    const name = $('h1.fund_name').text().trim();
    const price = parseFloat($('span.fund_data').text().trim());
    // const change = $('.change').text().trim();
    // const volume = parseFloat($('.volume').text().trim());
    const change = 'change';
    const volume = 20;
    console.log('ETF data fetched...');
    console.log(name);
    console.log(price);
    console.log(change);
    console.log(volume);
    return {
      code,
      name,
      price,
      change,
      volume,
    };
  } catch (error) {
    console.error(`Error fetching data for ETF ${code}:`, error);
    return null;
  }
}

// 抓取多个 ETF 的数据并保存到数据库
async function fetchAndSaveETFData(codes) {
  for (const code of codes) {
    const etfData = await fetchETFData(code);
    if (etfData) {
      const etf = new ETF(etfData);
      await etf.save();
      console.log(`Saved data for ETF ${code}`);
    }
  }
}

module.exports = {
  fetchAndSaveETFData,
};