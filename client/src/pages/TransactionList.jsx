// src/pages/TransactionList.jsx
import { useEffect, useState } from 'react';
import { getTransactions, deleteTransaction } from '../services/transactionService';
import { Link } from 'react-router';

export default function TransactionList() {
  const [transactions, setTransactions] = useState([]);

  const fetchData = async () => {
    const data = await getTransactions();
    console.log('🧪 Fetched data:', data); // ✅ 检查返回是否为数组
    setTransactions(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    await deleteTransaction(id);
    fetchData();
  };

  return (
    <div>
      <h2>交易记录</h2>
      <table border="1" cellPadding="8" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Code</th>
            <th>基金名称</th>
            <th>买入价</th>
            <th>净值</th>
            <th>现价</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(tx => (
            <tr key={tx._id}>
              <td>{tx.symbol}</td>
              <td>{tx.assetType}</td>
              <td>{tx.price}</td>
              <td>{tx.quantity}</td>
              <td>--</td>
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
