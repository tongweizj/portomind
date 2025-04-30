import React from 'react';
import './TransactionTable.css';

/**
 * @param {Object} props
 * @param {Array} props.transactions    交易数组
 * @param {string[]} [props.columns]    需要展示的字段列表
 * @param {string} [props.className]    额外的 className，用于样式定制
 */
export function TransactionTable({
  transactions,
  columns = ['date', 'symbol', 'action', 'quantity', 'price'],
  className = '',
}) {
  console.log("transactions: ",transactions);
  return (
    <table className={`transaction-table ${className}`}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col}>{col.toUpperCase()}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {transactions.map((tx, i) => (
          <tr key={tx._id|| i}>
            {columns.map((col) => (
              <td key={col}>
                {col === 'date'
                  ? String(tx[col]).slice(0, 10)
                  : tx[col]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
