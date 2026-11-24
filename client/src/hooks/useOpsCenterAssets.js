// client/src/hooks/useOpsCenterAssets.js
//
// TASK-068：资产总表默认页查询。分页参数传给服务端，客户端不拉全量。
// queryKey 带参数，Ticket 03 增加筛选/排序时沿用同一形状。
import { useQuery } from '@tanstack/react-query';
import { getAssetsOverview } from '../services/ops-center.service';

export function useOpsCenterAssets({ page = 1, pageSize = 50 } = {}) {
  const query = useQuery({
    queryKey: ['ops-center-assets', { page, pageSize }],
    queryFn: () => getAssetsOverview({ page, pageSize }),
    staleTime: 30 * 1000,
    retry: 1
  });

  return {
    assets: query.data?.data ?? [],
    pagination: query.data?.pagination ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch
  };
}
