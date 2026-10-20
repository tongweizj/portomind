// src/components/Household/TotalAssetsCard.jsx
// TASK-049（FS-household-view-split 交付单元 G1）：把 `/family` 的「家庭总资产（RMB 折算）」
// 卡抽成独立组件搬入首页。与 `/family` 同源：同一 `useFamilySummary()`（queryKey 相同，
// 两页共享缓存）、同一 `formatCny`（AC2）。
//
// R-4：本组件自带加载/错误回退，且**不向上抛**——family-summary 失败只会让这张卡变成
// 错误提示，下方提醒列表由 Dashboard 自身状态独立驱动，不受影响。
import { useNavigate } from 'react-router';
import { ErrorState, LoadingState } from '../DataState';
import { useFamilySummary } from '../../hooks/useFamily';
import { formatCny } from '../../utils/priceDisplay';
import { ROUTES } from '../../constants/routes';

export default function TotalAssetsCard() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useFamilySummary();

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  const totalCny = data?.totalCny;
  // 与 Family.jsx:182 同一判定式
  const incomplete = data?.portfolioContributions?.some(item => item.cnyValue == null);

  const goToPortfolios = () => navigate(ROUTES.PORTFOLIO_LIST);
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      goToPortfolios();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToPortfolios}
      onKeyDown={handleKeyDown}
      aria-label="家庭总资产，点击进入组合管理"
      className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-lg cursor-pointer transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-400"
    >
      <p className="text-blue-100 text-sm">家庭总资产（RMB 折算）</p>
      <p className="text-4xl font-bold mt-1">{formatCny(totalCny)}</p>
      <p className="text-blue-200 text-xs mt-2">
        {data?.asOf ? `数据时点：${new Date(data.asOf).toLocaleString('zh-CN')}` : ''}
        {incomplete ? ' · 部分组合折算不完整（缺价或缺汇率）' : ''}
      </p>
    </div>
  );
}
