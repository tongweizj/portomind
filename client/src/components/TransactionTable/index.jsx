import { Link } from 'react-router';
import { ASSET_TYPES, TRANSACTION_ACTION_LABELS } from '../../constants/enums';
import { ROUTES } from '../../constants/routes';
import { fmtPrice } from '../../utils/priceDisplay';
import './TransactionTable.css';

// TASK-044 R6：交易表格**唯一实现**，两处使用点共用：
//   ① 组合详情「交易记录」Tab（showPortfolio=false + onEdit/onDelete）
//   ② 「全部交易」聚合页（showPortfolio=true + onViewPortfolio，只读）
// 本组件只负责展示，不承载任何写校验——写路径始终经 transaction.service → 服务端（AC10）。

const ASSET_TYPE_LABELS = Object.fromEntries(ASSET_TYPES.map(o => [o.value, o.label]));

const DEFAULT_COLUMNS = ['date', 'symbol', 'action', 'assetType', 'quantity', 'price'];

// 中文表头（替换原先的 col.toUpperCase() 英文直出，Bug-3 根因之一）
const COLUMN_LABELS = {
  date: '日期',
  symbol: '资产代码',
  action: '类型',
  assetType: '证券类型',
  quantity: '份额',
  price: '价格',
  portfolio: '组合',
  operations: '操作',
};

/**
 * @param {Object} props
 * @param {Array} props.transactions              交易数组
 * @param {string[]} [props.columns]              展示字段（默认 日期/代码/类型/证券类型/份额/价格）
 * @param {boolean} [props.showPortfolio]         显示「组合」列（聚合页 true，组合内 false）
 * @param {Array} [props.portfolios]              showPortfolio 时用于按 _id 查组合名
 * @param {(tx:Object)=>void} [props.onEdit]      提供则渲染「编辑」（组合内）
 * @param {(tx:Object)=>void} [props.onDelete]    提供则渲染「删除」（组合内）
 * @param {(tx:Object)=>void} [props.onViewPortfolio] 提供则把组合名渲染成跳回组合交易 Tab 的链接
 * @param {string} [props.className]              额外 className
 */
export function TransactionTable({
  transactions = [],
  columns = DEFAULT_COLUMNS,
  showPortfolio = false,
  portfolios = [],
  onEdit,
  onDelete,
  onViewPortfolio,
  className = '',
}) {
  const hasActions = Boolean(onEdit || onDelete);

  const visibleColumns = [
    ...columns,
    ...(showPortfolio && !columns.includes('portfolio') ? ['portfolio'] : []),
    ...(hasActions && !columns.includes('operations') ? ['operations'] : []),
  ];

  const portfolioNames = new Map(portfolios.map(p => [String(p._id), p.name]));

  const renderCell = (tx, col) => {
    switch (col) {
      case 'date':
        // 交易日期可能是 Date 或 ISO 字符串，统一取日历日部分
        return tx.date ? String(tx.date).slice(0, 10) : '—';
      case 'action':
        // Bug-1：四值映射，分红两类不再被误显为「卖出」
        return TRANSACTION_ACTION_LABELS[tx.action] || tx.action || '—';
      case 'assetType':
        // Bug-3：枚举中文，不再直出 stock/etf
        return ASSET_TYPE_LABELS[tx.assetType] || tx.assetType || '—';
      case 'price':
        // Bug-2：按交易自身 currency 显示，不再硬编码 $
        return fmtPrice(tx.price, tx.currency);
      case 'portfolio': {
        const name = portfolioNames.get(String(tx.portfolioId)) || '未知组合';
        if (!onViewPortfolio) return name;
        return (
          <Link
            to={ROUTES.PORTFOLIO_TX_TAB(tx.portfolioId)}
            className="transaction-table__link"
          >
            {name}
          </Link>
        );
      }
      case 'operations':
        return (
          <span className="transaction-table__actions">
            {onEdit && (
              <button type="button" className="transaction-table__action" onClick={() => onEdit(tx)}>
                编辑
              </button>
            )}
            {onDelete && (
              <button type="button" className="transaction-table__action" onClick={() => onDelete(tx)}>
                删除
              </button>
            )}
          </span>
        );
      default:
        return tx[col] ?? '—';
    }
  };

  return (
    <table className={`transaction-table ${className}`}>
      <thead>
        <tr>
          {visibleColumns.map(col => (
            <th key={col}>{COLUMN_LABELS[col] || col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {transactions.map((tx, index) => (
          <tr key={tx._id || `row-${index}`}>
            {visibleColumns.map(col => (
              <td key={col}>{renderCell(tx, col)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
