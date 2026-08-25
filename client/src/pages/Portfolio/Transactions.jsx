import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataState';
import { TransactionTable } from '../../components/TransactionTable';
import { getPortfolioTransactions } from '../../services/transaction.service';

export default function Transactions() {
  const { id } = useParams();
  const [result, setResult] = useState({ data: [], pagination: { page: 1, pageSize: 20, total: 0 } });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getPortfolioTransactions(id, { page, pageSize: 20 })
      .then(data => active && setResult(data))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, page]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState />;
  if (!result.data.length) return <EmptyState />;

  const totalPages = Math.ceil(result.pagination.total / result.pagination.pageSize);
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">交易</h2>
      <div className="overflow-x-auto"><TransactionTable transactions={result.data} /></div>
      <div className="flex justify-end gap-3 text-sm">
        <button disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="disabled:opacity-40">上一页</button>
        <span>第 {page} / {totalPages} 页</span>
        <button disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} className="disabled:opacity-40">下一页</button>
      </div>
    </section>
  );
}
