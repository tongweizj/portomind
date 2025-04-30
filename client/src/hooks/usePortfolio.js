// src/hooks/usePortfolio.js
import { useQuery } from '@tanstack/react-query';
import { fetchPortfolio } from '../services/portfolio';

/**
 * 获取单个组合详情
 * @param {string} id 组合的唯一 ID
 * @returns {{
 *   data: Object|null,
 *   isLoading: boolean,
 *   isError: boolean,
 *   refetch: function
 * }}
 */
export function usePortfolio(id) {
  const { data = null, isLoading, isError, refetch } = useQuery({
    queryKey: ['portfolio', id],
    queryFn: () => fetchPortfolio(id),
    enabled: Boolean(id),
    staleTime: 1000 * 60,
    retry: 1,
  });

  return { data, isLoading, isError, refetch };
}
