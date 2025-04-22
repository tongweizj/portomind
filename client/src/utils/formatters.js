export const processETFData = (rawData) => {
    // 按 code 分组，取最新时间戳的数据
    const etfMap = new Map();
    
    rawData.forEach(item => {
      if (!etfMap.has(item.code) || 
          new Date(item.timestamp) > new Date(etfMap.get(item.code).timestamp)) {
        etfMap.set(item.code, item);
      }
    });
  
    // 计算涨跌幅百分比
    return Array.from(etfMap.values()).map(etf => ({
      code: etf.code,
      name: etf.name,
      price: etf.price,
      change: etf.change,
      changePercent: ((etf.change / (etf.price - etf.change)) * 100).toFixed(2),
      timestamp: new Date(etf.timestamp).toLocaleString()
    }));
  };
  