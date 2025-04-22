export const getMarketName = (marketCode) => {
    const marketMap = {
      'SH': '沪市',
      'SZ': '深市', 
      'HK': '港股',
      'US': '美股',
      'CN': '中国',
      'BJ': '北交所'
    };
    return marketMap[marketCode] || marketCode;
  };
  