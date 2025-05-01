// server/services/fetchers/tiantianFetcher.js

const axios = require('axios');
const dayjs = require('dayjs');
const cheerio = require('cheerio');
/**
 * 实现 IFetcher 接口：天天基金（场外基金）抓最新与历史价
 */
module.exports = {
  /**
   * 抓取最新净值
   * @param {string} symbol — 基金代码（不带后缀）
   */
  async fetchLatest(symbol) {
    const url = `https://fundgz.1234567.com.cn/js/${symbol}.js`;
    const resp = await axios.get(url, {
      headers: {
        Referer: 'https://fund.1234567.com.cn/',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    // 响应格式： jsonpgz({...});
    const json = JSON.parse(resp.data.match(/jsonpgz\((.*)\)/)[1]);
    return {
      symbol:   json.fundcode,
      name:     json.name,
      price:    parseFloat(json.gsz),
      currency: 'CNY',
      market:   'CN-FUND',
      timestamp: dayjs(`${json.gztime}:00`, 'HH:mm:ss').toDate()
    };
  },

 /**
   * 抓取历史净值（自动翻页批量拉取）
   * @param {string} symbol — 基金代码（不带后缀）
   * @param {Date} from
   * @param {Date} to
   * @returns {Promise<Array<{ symbol, price, timestamp }>>}
   */
 async fetchHistory(symbol, from, to) {
    const fromStr = dayjs(from).format('YYYY-MM-DD');
    const toStr   = dayjs(to).format('YYYY-MM-DD');
    const pageSize = 20;  
    let page = 1;
    let totalPages = 1;
    const allRecords = [];

    while (page <= totalPages) {
      const url = [
        'https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz',
        `code=${symbol}`,
        `page=${page}`,
        `per=${pageSize}`,
        `sdate=${fromStr}`,
        `edate=${toStr}`
      ].join('&');

      const resp = await axios.get(url, {
        headers: {
          Referer: `https://fund.eastmoney.com/${symbol}.html`,
          'User-Agent': 'Mozilla/5.0',
        }
      });

      // 提取 JS 变量文本：var apidata={…};
      const m = resp.data.match(/var\s+apidata\s*=\s*(\{[\s\S]*\});/);
      if (!m) break;

      // 安全执行 JS 变量为对象
      let apiData;
      try {
        apiData = Function(`"use strict";return ${m[1]}`)();
      } catch (e) {
        console.error('tiantian fetchHistory eval error:', e);
        break;
      }

      // 首次拿到总页数
      totalPages = apiData.pages || 1;

      // 解析 HTML 表格内容
      const $ = cheerio.load(apiData.content || '');
      $('tr').each((i, el) => {
        const tds = $(el).find('td');
        const dateStr  = $(tds[0]).text().trim();
        const priceStr = $(tds[1]).text().trim();
        const price    = parseFloat(priceStr);
        if (dateStr && !isNaN(price)) {
          allRecords.push({
            symbol,
            price,
            timestamp: dayjs(dateStr, 'YYYY-MM-DD').toDate()
          });
        }
      });

      page += 1;
    }

    return allRecords;
  }
};

// https://api.fund.eastmoney.com/f10/lsjz?fundCode=005827&startDate=2025-01-01&endDate=2025-04-30&pageIndex=1&pageSize=2000
// http://     fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=110022&page=1&sdate=2019-01-01&edate=2019-02-13&per=20