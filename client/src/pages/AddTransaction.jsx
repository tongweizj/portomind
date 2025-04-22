import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { addTransaction } from '../services/transactionService';
import { getAllPortfolios } from '../services/portfolioService';
import { inferMarketCurrency } from '../utils/symbolUtils';

export default function AddTransaction() {
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState([]);
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
    async function fetchPortfolios() {
      const res = await getAllPortfolios();
      setPortfolios(res);
        // ✅ 默认设置为第一个组合的 ID（如果用户没有选择）
      if (res.length > 0 && !form.portfolioId) {
        setForm(prev => ({ ...prev, portfolioId: res[0]._id }));
      }
    }
    fetchPortfolios();
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
      const newMarket = value;
      const baseSymbol = form.symbol.split('.')[0];  // 去掉后缀
  
      let suffix = '';
      if (newMarket === 'CA') suffix = '.TO';
      else if (newMarket === 'CN-SH') suffix = '.SS';
      else if (newMarket === 'CN-SZ') suffix = '.SZ';
      else if (newMarket === 'CN-FUND') suffix = '.cn';
  
      const newSymbol = baseSymbol + suffix;
  
      // 自动更新 currency
      const currencyMap = {
        'CA': 'CAD',
        'CN-SH': 'CNY',
        'CN-SZ': 'CNY',
        'CN-FUND': 'CNY',
        'US': 'USD'
      };
  
      setForm({
        ...form,
        market: newMarket,
        currency: currencyMap[newMarket] || 'USD',
        symbol: newSymbol
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

        <label>资产类型：</label>
        <select name="assetType" value={form.assetType} onChange={handleChange}>
          <option value="stock">股票</option>
          <option value="etf">ETF</option>
          <option value="crypto">加密货币</option>
          <option value="cash">现金</option>
          <option value="bond">债券</option>
        </select><br/>

        <label>代码：</label>
        <input name="symbol" value={form.symbol} onChange={handleChange} /><br/>

        <label>市场：</label>
        <select name="market" value={form.market} onChange={handleChange}>
          <option value="US">美股</option>
          <option value="CA">加股</option>
          <option value="CN-SH">上海</option>
          <option value="CN-SZ">深圳</option>
          <option value="CN-FUND">中国基金</option>
        </select><br/>

        <label>币种：</label>
        <select name="currency" value={form.currency} onChange={handleChange}>
          <option value="USD">美元</option>
          <option value="CAD">加元</option>
          <option value="CNY">人民币</option>
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
