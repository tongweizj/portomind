// src/hooks/usePortfolios.js
import { useQuery } from '@tanstack/react-query';
import { getPortfolios } from '../services/portfolio.service';

/**
 * 获取所有投资组合
 * @returns {{
 *   data: Array|null,
 *   isLoading: boolean,
 *   isError: boolean,
 *   refetch: function
 * }}
 */
export function usePortfolios() {
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['portfolios'],
    queryFn: getPortfolios,
    staleTime: 1000 * 60,
    retry: 1,
  });

  return { data, isLoading, isError, refetch };
}
