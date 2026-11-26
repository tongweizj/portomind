// src/hooks/usePortfolioTransactions.js
// 组合内交易流水分页查询与删除（代码审查 T7：页面经 hook 调用 transaction.service）。
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteTransaction, getPortfolioTransactions } from '../services/transaction.service';

export function usePortfolioTransactions(portfolioId, { page, pageSize }) {
  return useQuery({
    queryKey: ['portfolio-transactions', portfolioId, page, pageSize],
    queryFn: () => getPortfolioTransactions(portfolioId, { page, pageSize }),
    enabled: Boolean(portfolioId),
    placeholderData: keepPreviousData,
    // 新增 / 编辑页写入后返回本页时须重新拉取（不沿用全局 60s staleTime）
    staleTime: 0,
    retry: 1,
  });
}

/** 删除流水（成对流水由服务端两端一起删除，Human 决定 10）；成功后刷新该组合流水 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTransaction,
    // 成对流水的另一端可能在其他组合：刷新全部组合的流水缓存
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio-transactions'] }),
  });
}
