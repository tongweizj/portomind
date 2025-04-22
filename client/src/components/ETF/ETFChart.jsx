const ETFCard = ({ etf, onSelect }) => {
    // 根据市场显示不同货币符号
    const currencySymbol = etf.code.includes('.TO') ? 'C$' : '¥';
    
    // 涨跌样式
    const changeClass = etf.change > 0 ? 'up' : etf.change < 0 ? 'down' : 'neutral';
  
    return (
      <div className={`etf-card ${changeClass}`} onClick={() => onSelect(etf)}>
        <div className="etf-header">
          <span className="etf-code">{etf.code}</span>
          <span className="etf-market">{getMarketName(etf.code.split('.')[1] || 'CN')}</span>
        </div>
        <h4 className="etf-name">{etf.name}</h4>
        
        <div className="price-info">
          <span className="price">
            {currencySymbol}{etf.price.toFixed(2)}
          </span>
          <span className="change">
            {etf.change > 0 ? '+' : ''}
            {currencySymbol}{Math.abs(etf.change).toFixed(2)} 
            ({etf.changePercent}%)
          </span>
        </div>
  
        <div className="timestamp">{etf.timestamp}</div>
      </div>
    );
  };
  