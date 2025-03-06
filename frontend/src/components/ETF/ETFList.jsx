import ETFCard from './ETFCard';
import { getMarketName } from '../../utils/marketUtils'; 
function  ETFList ({ etfs=[], onSelect })  {
    // 按市场类型分组
    const marketGroups = etfs.reduce((acc, etf) => {
      const market = etf.code.includes('.') ? 
        etf.code.split('.')[1] : 
        'CN';
      if (!acc[market]) acc[market] = [];
      acc[market].push(etf);
      return acc;
    }, {});
  
    return (
      <div className="market-groups">
        {Object.entries(marketGroups).map(([market, items]) => (
          <div key={market} className="market-section">
            <h3>{getMarketName(market)}</h3>
            <div className="etf-grid">
              {items.map(etf => (
                <ETFCard 
                  key={etf.code}
                  etf={etf}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  export default ETFList; 