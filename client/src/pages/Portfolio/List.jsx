import { useState } from 'react';
import { useNavigate } from 'react-router';
import { usePortfolios } from '../../hooks/usePortfolios';
import { useFamilySummary } from '../../hooks/useFamily';
import { PortfolioCard } from '../../components/PortfolioCard';
import { ButtonGroup } from '../../components/ButtonGroup';
import { ErrorState, LoadingState } from '../../components/DataState';
import CurrencyBuckets from '../../components/Household/CurrencyBuckets';
import ContributionBar from '../../components/Household/ContributionBar';
import RecentTransactions from '../../components/Household/RecentTransactions';
import RecentRebalance from '../../components/Household/RecentRebalance';
import FxPanel from '../../components/Household/FxPanel';
import { ROUTES } from '../../constants/routes';

// 组合列表页同时承担家庭横向汇总（TASK-050）：
//   标题行 → 币种分桶 → 组合占比条 → 组合卡片 → 最近交易/最近再平衡（lg 两列）→ 家庭汇率折叠面板
// 两个 query（组合 / 家庭汇总）相互独立、互不 await：任一失败只影响自己那一段，
// 不整页早退（原实现 `if (isLoading) return …` 会让家庭区块一并不显示）。
export default function List() {
  const navigate = useNavigate();
  // CM-20：默认只显示未归档组合，开关打开后包含已归档组合
  const [showArchived, setShowArchived] = useState(false);
  const { data: portfolios, isLoading, isError } = usePortfolios({ includeArchived: showArchived });
  const { data: family, isLoading: familyLoading, isError: familyError } = useFamilySummary();

  const portfolioList = portfolios || [];
  const buttons = [
    { label: '新建', onClick: () => navigate('/portfolios/new'), type: 'primary' },
  ];
  const archivedCount = portfolioList.filter(pf => pf.archived).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">投资组合</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={event => setShowArchived(event.target.checked)}
              className="rounded border-gray-300"
            />
            显示已归档{showArchived && archivedCount > 0 ? `（${archivedCount}）` : ''}
          </label>
          <ButtonGroup buttons={buttons} className="my-4" />
        </div>
      </div>

      {/* ② 币种分桶 + ③ 组合占比条：家庭汇总失败时只此一段报错，卡片照常渲染 */}
      {familyLoading ? (
        <LoadingState />
      ) : familyError ? (
        <ErrorState />
      ) : (
        family && (
          <>
            <CurrencyBuckets buckets={family.buckets} />
            <ContributionBar contributions={family.portfolioContributions} />
          </>
        )
      )}

      {/* ④ 组合卡片：loading/error 下沉到本区域，不再整页早退 */}
      {isLoading ? (
        <p>加载组合中…</p>
      ) : isError ? (
        <p>加载组合失败，请重试</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {portfolioList.map(pf => (
              <PortfolioCard
                key={pf._id}
                portfolio={pf}
                onClick={() => navigate(ROUTES.PORTFOLIO_VIEW(pf._id))}
              />
            ))}
          </div>

          {portfolioList.length === 0 && (
            <p className="text-gray-500">
              {showArchived ? '暂无组合' : '暂无进行中的组合；已归档组合可打开「显示已归档」查看'}
            </p>
          )}
        </>
      )}

      {/* ⑤ 最近交易 + ⑥ 最近再平衡：家庭汇总失败时整块不渲染，避免二次报错 */}
      {family && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentTransactions transactions={family.recentTransactions} />
          <RecentRebalance records={family.recentRebalanceRecords} />
        </div>
      )}

      {/* ⑦ 家庭汇率：默认收起，自取数据独立容错 */}
      <FxPanel />
    </div>
  );
}
