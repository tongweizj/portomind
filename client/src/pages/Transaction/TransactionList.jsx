// src/pages/Transaction/TransactionList.jsx
// TASK-044 R3 / OQ5：「全部交易」跨组合聚合页（**只读**）。
// 由原顶层「交易记录」列表改造复用（文件名保留）：删内联 <table>、删「导入/创建」入口，
// 渲染收敛到唯一实现 TransactionTable，并补上组合/标的筛选（AC3）。
// 写操作一律回到所属组合上下文（组合详情 → 交易记录 Tab）。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { TransactionTable } from '../../components/TransactionTable';
import { ROUTES } from '../../constants/routes';
import { colors, radii } from '../../constants/design-tokens';
import { getApiErrorMessage } from '../../services/api';
import { getPortfolios } from '../../services/portfolio.service';
import { getTransactions } from '../../services/transaction.service';

const EMPTY_FILTERS = { portfolioId: '', symbol: '' };
const PAGE_SIZE = 20;

export default function TransactionList() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [page, setPage] = useState(1);
  // draft = 输入中的筛选条件；filters = 已生效的条件（提交后才查询，避免逐字请求）
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getPortfolios()
      .then(data => { if (active) setPortfolios(data); })
      .catch(() => { if (active) setPortfolios([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getTransactions({
      page,
      pageSize: PAGE_SIZE,
      portfolioId: filters.portfolioId || undefined,
      symbol: filters.symbol || undefined,
    })
      .then(result => {
        if (!active) return;
        setTransactions(result.data);
        setPagination(result.pagination || { page, pageSize: PAGE_SIZE, total: result.data.length });
      })
      .catch(err => { if (active) setError(getApiErrorMessage(err, '加载交易失败')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, filters]);

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    setFilters({ portfolioId: draft.portfolioId, symbol: draft.symbol.trim() });
  };

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setPage(1);
    setFilters(EMPTY_FILTERS);
  };

  const pageSize = pagination.pageSize || PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pageSize));
  const filtered = Boolean(filters.portfolioId || filters.symbol);

  return (
    <section className="space-y-4">
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>全部交易</h1>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '4px 0 0' }}>
          跨组合查阅交易流水。新增、编辑、删除与 CSV 导入请进入所属组合的「交易记录」Tab。
        </p>
      </div>

      {/* 筛选栏：组合 + 标的（AC3）。服务端已支持 portfolioId/symbol，本任务零服务端改动。 */}
      <form
        onSubmit={applyFilters}
        className="flex flex-wrap items-end gap-3 p-4"
        style={{ backgroundColor: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: radii.lg }}
      >
        <div>
          <label htmlFor="filter-portfolio" className="mb-1 block text-xs" style={{ color: colors.textSecondary }}>组合</label>
          <select
            id="filter-portfolio"
            value={draft.portfolioId}
            onChange={event => setDraft(prev => ({ ...prev, portfolioId: event.target.value }))}
            className="rounded px-3 py-2 text-sm"
            style={{ border: `1px solid ${colors.border}`, backgroundColor: colors.bgCard, minWidth: 200 }}
          >
            <option value="">全部组合</option>
            {portfolios.map(pf => (
              <option key={pf._id} value={pf._id}>{pf.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-symbol" className="mb-1 block text-xs" style={{ color: colors.textSecondary }}>资产代码</label>
          <input
            id="filter-symbol"
            value={draft.symbol}
            onChange={event => setDraft(prev => ({ ...prev, symbol: event.target.value }))}
            placeholder="如 VOO / 000001"
            className="rounded px-3 py-2 text-sm"
            style={{ border: `1px solid ${colors.border}`, minWidth: 180 }}
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium"
          style={{ backgroundColor: colors.brand, color: colors.textInverse, borderRadius: radii.md, border: 'none', cursor: 'pointer' }}
        >
          查询
        </button>
        {filtered && (
          <button
            type="button"
            onClick={resetFilters}
            className="px-4 py-2 text-sm"
            style={{ backgroundColor: colors.bgCard, color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: radii.md, cursor: 'pointer' }}
          >
            重置
          </button>
        )}
      </form>

      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded p-6 text-center text-sm" style={{ backgroundColor: colors.bgCard, color: colors.textMuted }}>
          数据加载中…
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded p-6 text-center text-sm" style={{ border: `1px dashed ${colors.border}`, color: colors.textMuted }}>
          {filtered ? '当前筛选条件下没有交易记录。' : '暂无交易记录。'}
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ backgroundColor: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: radii.lg }}>
          <TransactionTable
            transactions={transactions}
            showPortfolio
            portfolios={portfolios}
            onViewPortfolio={tx => navigate(ROUTES.PORTFOLIO_TX_TAB(tx.portfolioId))}
          />
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="disabled:opacity-40">上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} className="disabled:opacity-40">下一页</button>
        </div>
      )}
    </section>
  );
}
