import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import axios from 'axios';

export default function PortfolioStats() {
  const { id } = useParams();
  const [stats, setStats] = useState([]);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await axios.get(`http://localhost:8080/api/portfolios/${id}/stats`);
        console.log("获取统计数据：", res.data);

        // 模拟当前价格
        const prices = {
          VTI: 25,
          '123': 28,
        };

        const enriched = res.data.map(item => {
          const quantity = Number(item.quantity) || 0;
          const totalCost = Number(item.totalCost) || 0;
          const avgCost = Number(item.avgCost) || 0;
          const currentPrice = prices[item.symbol.toUpperCase()] ?? avgCost;

          const marketValue = currentPrice * quantity;
          const unrealizedProfit = marketValue - totalCost;

          return {
            ...item,
            currentPrice,
            marketValue,
            unrealizedProfit: Number.isFinite(unrealizedProfit) ? unrealizedProfit : 0
          };
        });

        console.log("✅ enriched 数据：", enriched);
        setStats(enriched);
      } catch (err) {
        console.error('获取统计失败：', err);
      }
    }

    fetchStats();
  }, [id]);

  return (
    <div>
      <h3>资产统计</h3>
      {stats.length === 0 ? (
        <p>暂无交易记录</p>
      ) : (
        <table border="1" cellPadding="8" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>代码</th>
              <th>类型</th>
              <th>持有</th>
              <th>均价</th>
              <th>现价</th>
              <th>市值</th>
              <th>盈亏</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(item => (
              <tr key={item.symbol}>
                <td>{item.symbol}</td>
                <td>{item.assetType}</td>
                <td>{item.quantity}</td>
                <td>${item.avgCost.toFixed(2)}</td>
                <td>${item.currentPrice.toFixed(2)}</td>
                <td>${item.marketValue.toFixed(2)}</td>
                <td style={{ color: item.unrealizedProfit >= 0 ? 'green' : 'red' }}>
                  {item.unrealizedProfit >= 0 ? '+' : ''}
                  ${item.unrealizedProfit.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}