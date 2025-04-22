import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { addTransaction } from '../services/transactionService';
import { getAllPortfolios } from '../services/portfolioService';
import { inferMarketCurrency } from '../utils/symbolUtils';
import { getAllAssets } from '../services/assetService';

export default function AddTransaction() {
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState([]);
  const [allAssets, setAllAssets] = useState([]);
  const [filteredAssets, setFilteredAssets] = useState([]);
  const [form, setForm] = useState({
    portfolioId: '',
    assetType: 'stock',
    symbol: '',
    market: 'US',
    currency: 'USD',
    action: 'buy',
    quantity: '',
    price: '',
    date: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  useEffect(() => {
    async function fetchData() {
      const portfoliosData = await getAllPortfolios();
      const assetData = await getAllAssets();
      setPortfolios(portfoliosData);
      setAllAssets(assetData);
      setFilteredAssets(assetData);
      const initialAsset = assetData[0];
        // ✅ 默认设置为第一个组合的 ID（如果用户没有选择）
      if (portfoliosData.length > 0 && !form.portfolioId) {
        setForm(prev => ({ ...prev, 
          portfolioId: portfoliosData[0]._id|| '',
          symbol: initialAsset?.symbol || '',
          market: initialAsset?.market || 'US',
          currency: initialAsset?.currency || 'USD',
          assetType: initialAsset?.type || 'stock'
         }));
      }
    }
    fetchData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // ✅ 用户手动改 symbol 时，推断市场和币种
    if (name === 'symbol') {
      const [market, currency] = inferMarketCurrency(value);
      setForm({ ...form, symbol: value, market, currency });
      return;
    }
  
    // ✅ 用户选择市场时，根据当前 symbol 自动改后缀
    if (name === 'market') {
      const filtered = allAssets.filter(a => a.market === value);
      setFilteredAssets(filtered);
      const newMarket = value;
      const defaultAsset = filtered[0];
      console.log("filtered:" + defaultAsset)
  
      setForm({
        ...form,
        market: newMarket,
        symbol: defaultAsset.symbol,
        currency: defaultAsset.currency,
        assetType: defaultAsset.type
      });
      return;
    }
  
    // 其他字段正常处理
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      quantity: Number(form.quantity),
      price: Number(form.price)
    };
    await addTransaction(payload);
    navigate('/');
  };

  return (
    <div>
      <h2>添加交易记录</h2>
      <form onSubmit={handleSubmit}>
        <label>组合：</label>
        <select name="portfolioId" value={form.portfolioId} onChange={handleChange}>
          {portfolios.map(p => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select><br/>
        <label>市场：</label>
        <select name="market" value={form.market} onChange={handleChange}>
          <option value="US">美股</option>
          <option value="CA">加股</option>
          <option value="CN-SH">上海</option>
          <option value="CN-SZ">深圳</option>
          <option value="CN-FUND">中国基金</option>
        </select><br/>
        <label>选择资产：</label>
        <select name="symbol" value={form.symbol} onChange={handleChange}>
          {filteredAssets.map(a => (
            <option key={a._id} value={a.symbol}>{a.symbol} - {a.name}</option>
          ))}
        </select><br/>
        

        <label>交易类型：</label>
        <select name="action" value={form.action} onChange={handleChange}>
          <option value="buy">买入</option>
          <option value="sell">卖出</option>
        </select><br/>

        <input name="quantity" type="number" placeholder="份额" value={form.quantity} onChange={handleChange} /><br/>
        <input name="price" type="number" placeholder="价格" value={form.price} onChange={handleChange} /><br/>
        <input name="date" type="date" value={form.date} onChange={handleChange} /><br/>
        <textarea name="notes" placeholder="备注" value={form.notes} onChange={handleChange}></textarea><br/>

        <button type="submit">提交</button>
      </form>
    </div>
  );
}
