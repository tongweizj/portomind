const mongoose = require('mongoose');
const { fetchAndStorePrice } = require('../services/priceService');

// ✅ 连接数据库
mongoose.connect('mongodb://etfdata:etfdata123@192.168.2.110:27017/etf-data?authSource=admin', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

(async () => {
  const symbols = ['AAPL', '600519.SS', 'TD.TO', '005827.cn'];

  for (const symbol of symbols) {
    const result = await fetchAndStorePrice(symbol);
    console.log("📦 最终结果：", result);
  }

  mongoose.connection.close();
})();
