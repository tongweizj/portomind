// src/hooks/usePortfolios.js
import { useQuery } from '@tanstack/react-query';
import { getPortfoliosSummary } from '../services/portfolio.service';

/**
 * 获取所有投资组合（列表汇总版，CM-12）。
 * 每项额外携带 stats: { positionCount, marketValueByCurrency, drift }。
 * @returns {{
 *   data: Array|null,
 *   isLoading: boolean,
 *   isError: boolean,
 *   refetch: function
 * }}
 */
export function usePortfolios() {
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['portfolios-summary'],
    queryFn: getPortfoliosSummary,
    staleTime: 1000 * 60,
    retry: 1,
  });

  return { data, isLoading, isError, refetch };
}
