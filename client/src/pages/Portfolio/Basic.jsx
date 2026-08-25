import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/DataState';
import { usePortfolio } from '../../hooks/usePortfolio';
import { getApiErrorMessage } from '../../services/api';
import { deletePortfolio } from '../../services/portfolio.service';
import { ROUTES } from '../../constants/routes';

export default function Basic() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: portfolio, isLoading, isError } = usePortfolio(id);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  if (isLoading) return <LoadingState />;
  if (isError || !portfolio) return <ErrorState />;

  const handleDelete = async () => {
    if (!window.confirm('确认删除此组合、全部交易及再平衡记录吗？此操作不可撤销。')) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deletePortfolio(id);
      navigate(ROUTES.PORTFOLIO_LIST);
    } catch (error) {
      setDeleteError(getApiErrorMessage(error, '删除组合失败'));
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{portfolio.name}</h2>
        <div className="flex gap-2">
          <button onClick={() => navigate(ROUTES.PORTFOLIO_EDIT(id))}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white">编辑</button>
          <button onClick={handleDelete} disabled={deleting}
            className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50">
            {deleting ? '删除中…' : '删除'}
          </button>
        </div>
      </div>
      {deleteError && <div className="rounded bg-red-50 p-3 text-red-700">{deleteError}</div>}
      <dl className="grid gap-4 rounded bg-white p-5 shadow-sm sm:grid-cols-3">
        <div><dt className="text-sm text-gray-500">类型</dt><dd>{portfolio.type}</dd></div>
        <div><dt className="text-sm text-gray-500">基础币种</dt><dd>{portfolio.currency}</dd></div>
        <div><dt className="text-sm text-gray-500">创建时间</dt><dd>{portfolio.createdAt?.slice(0, 10) || '-'}</dd></div>
        <div className="sm:col-span-3"><dt className="text-sm text-gray-500">描述</dt><dd>{portfolio.description || '暂无描述'}</dd></div>
      </dl>
    </section>
  );
}
