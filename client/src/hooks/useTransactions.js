// src/hooks/useTransactions.js
import { useQuery } from '@tanstack/react-query';
import { fetchTransactions } from '../services/transaction';

/**
 * 获取某个组合下的流水列表
 * @param {string} portfolioId 组合 ID
 * @returns {{
 *   data: Array|null,
 *   isLoading: boolean,
 *   isError: boolean,
 *   refetch: function
 * }}
 */
export function useTransactions(portfolioId) {
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['transactions', portfolioId],
    queryFn: () => fetchTransactions(portfolioId),
    enabled: Boolean(portfolioId),
    staleTime: 1000 * 30,
    retry: 1,
  });

  return { data, isLoading, isError, refetch };
}