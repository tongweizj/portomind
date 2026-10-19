// src/pages/Portfolio/Transactions.jsx
// TASK-044 R2：组合详情「交易记录」Tab —— 单个组合的流水维护主战场。
// 在此就地完成 新增 / 编辑 / 删除 / 导入，portfolioId 由路由 :id 锁定，不存在手选组合。
// 表格渲染收敛到唯一实现 TransactionTable（组合内不显示组合列）。
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { TransactionTable } from '../../components/TransactionTable';
import { ROUTES } from '../../constants/routes';
import { colors, radii } from '../../constants/design-tokens';
import { getApiErrorMessage } from '../../services/api';
import { deleteTransaction, getPortfolioTransactions } from '../../services/transaction.service';

const PAGE_SIZE = 20;

export default function Transactions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState({ data: [], pagination: { page: 1, pageSize: PAGE_SIZE, total: 0 } });
  const [page, setPage] = useState(1);
  // 删除后自增以重新拉取（避免把 fetch 逻辑抽成额外函数）
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getPortfolioTransactions(id, { page, pageSize: PAGE_SIZE })
      .then(data => {
        if (!active) return;
        // 删除末页最后一条后回退一页，避免停留在空页
        if (data.data.length === 0 && page > 1) {
          setPage(value => value - 1);
          return;
        }
        setResult(data);
      })
      .catch(err => { if (active) setError(getApiErrorMessage(err, '加载交易失败')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, page, reloadKey]);

  // 写路径始终经服务端（DELETE /transactions/:id），前端不做任何业务校验（AC10）
  const handleDelete = async (tx) => {
    setActionError('');
    try {
      await deleteTransaction(tx._id);
      setReloadKey(value => value + 1);
    } catch (err) {
      setActionError(getApiErrorMessage(err, '删除交易失败'));
    }
  };

  const totalPages = Math.max(1, Math.ceil((result.pagination.total || 0) / (result.pagination.pageSize || PAGE_SIZE)));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>交易记录</h2>
          <p style={{ fontSize: 13, color: colors.textMuted, margin: '4px 0 0' }}>
            本组合内的交易流水，可直接新增、编辑、删除与导入。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(ROUTES.PORTFOLIO_TX_IMPORT(id))}
            className="px-3 py-2 text-sm"
            style={{ backgroundColor: colors.bgCard, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radii.md, cursor: 'pointer' }}
          >
            导入 CSV
          </button>
          <button
            type="button"
            onClick={() => navigate(ROUTES.PORTFOLIO_TX_NEW(id))}
            className="px-3 py-2 text-sm font-medium"
            style={{ backgroundColor: colors.brand, color: colors.textInverse, border: 'none', borderRadius: radii.md, cursor: 'pointer' }}
          >
            新建交易
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {actionError && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}

      {loading ? (
        <div className="rounded p-6 text-center text-sm" style={{ backgroundColor: colors.bgCard, color: colors.textMuted }}>
          数据加载中…
        </div>
      ) : result.data.length === 0 ? (
        <div className="rounded p-6 text-center text-sm" style={{ border: `1px dashed ${colors.border}`, color: colors.textMuted }}>
          本组合暂无交易记录，可点击「新建交易」或「导入 CSV」。
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ backgroundColor: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: radii.lg }}>
          <TransactionTable
            transactions={result.data}
            showPortfolio={false}
            onEdit={tx => navigate(ROUTES.PORTFOLIO_TX_EDIT(id, tx._id))}
            onDelete={handleDelete}
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
