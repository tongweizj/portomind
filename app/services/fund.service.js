const axios = require("axios");
const cheerio = require("cheerio");

const getFundDailyInfo = async (fundCode) => {
  try {
    // 构造目标 URL
    const url = `https://ca.finance.yahoo.com/quote/${fundCode}`;
    const { data } = await axios.get(url,{
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        }
    });

     // 输出抓取的 HTML
     console.log(data);

    // 使用 cheerio 解析 HTML
    const $ = cheerio.load(data);

    // 采集数据
    const price = $(".Fw(b).Fz(36px).Mb(-4px)").text().trim(); // 当前价格
    const change = $(".Fw(500).Pstart(8px).Fz(24px)").text().trim(); // 涨跌幅

    // 返回结果
    return {
      fundCode,
      price,
      change,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Error fetching fund data:", err.message);
    throw new Error("Failed to fetch fund daily info");
  }
};

module.exports = { getFundDailyInfo };
