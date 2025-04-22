// src/pages/TransactionList.jsx
import { useEffect, useState } from 'react';
import { getTransactions, deleteTransaction } from '../services/transactionService';
import { Link } from 'react-router';
import { getAllPortfolios } from '../services/portfolioService';

export default function TransactionList() {
  const [transactions, setTransactions] = useState([]);
  const [portfolios, setPortfolios] = useState([]);

  const fetchData = async () => {
    const data = await getTransactions();
    console.log('🧪 Fetched data:', data); // ✅ 检查返回是否为数组
    setTransactions(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    async function fetchData() {
      const txData = await getTransactions();
      const pfData = await getAllPortfolios();
      setTransactions(txData);
      setPortfolios(pfData);
    }
    fetchData();
  }, []);

  const findPortfolioName = (id) => {
    const pf = portfolios.find(p => p._id === id);
    return pf ? pf.name : '未知组合';
  };

  const handleDelete = async (id) => {
    await deleteTransaction(id);
    const txData = await getTransactions();
    setTransactions(txData);
  };

  return (
    <div>
      <h2>交易记录</h2>
      <table border="1" cellPadding="8" style={{ width: '100%' }}>
        <thead>
          <tr>
          <th>组合名称</th>
            <th>资产代码</th>
            <th>资产类型</th>
            <th>交易类型</th>
            <th>份额</th>
            <th>买入价</th>
            <th>日期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(tx => (
            <tr key={tx._id}>
              <td>{findPortfolioName(tx.portfolioId)}</td>
              <td>{tx.symbol}</td>
              <td>{tx.assetType}</td>
              <td>{tx.action === 'buy' ? '买入' : '卖出'}</td>
              <td>{tx.quantity}</td>
              <td>{tx.price}</td>
              <td>{new Date(tx.date).toLocaleDateString()}</td>
              <td>
                <Link to={`/edit/${tx._id}`}>编辑</Link> | 
                <button onClick={() => handleDelete(tx._id)}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
