const axios = require('axios');

/**
 * 获取中国场外基金净值（来源：天天基金网）
 * 示例 symbol: 005827
 */
module.exports = async function getTiantianPrice(symbol) {
  try {
    const url = `https://fundgz.1234567.com.cn/js/${symbol}.js`;
    const res = await axios.get(url, {
      headers: {
        'Referer': 'https://fund.eastmoney.com',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const match = res.data.match(/jsonpgz\((.*)\)/);
    if (!match) throw new Error("无法解析基金数据");

    const json = JSON.parse(match[1]);

    return {
      symbol: json.fundcode,
      name: json.name,
      price: parseFloat(json.gsz),
      currency: 'CNY',
      market: 'CN-FUND',
      timestamp: new Date(`${json.gztime}:00`)
    };
  } catch (err) {
    console.error(`❌ 天天基金抓取失败: ${symbol}`, err.message);
    return null;
  }
}
