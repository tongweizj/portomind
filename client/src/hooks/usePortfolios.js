// src/hooks/usePortfolios.js
import { useQuery } from '@tanstack/react-query';
import { getPortfoliosSummary } from '../services/portfolio.service';

/**
 * 获取所有投资组合（列表汇总版，CM-12）。
 * 每项额外携带 stats: { positionCount, marketValueByCurrency, drift }。
 * CM-20：默认排除已归档组合；includeArchived=true 时包含归档组合。
 * @param {Object} [options]
 * @param {boolean} [options.includeArchived=false] 是否包含已归档组合
 * @returns {{
 *   data: Array|null,
 *   isLoading: boolean,
 *   isError: boolean,
 *   refetch: function
 * }}
 */
export function usePortfolios({ includeArchived = false } = {}) {
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['portfolios-summary', { includeArchived }],
    queryFn: () => getPortfoliosSummary({ includeArchived }),
    staleTime: 1000 * 60,
    retry: 1,
  });

  return { data, isLoading, isError, refetch };
}
