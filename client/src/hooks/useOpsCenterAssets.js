// client/src/hooks/useOpsCenterAssets.js
//
// TASK-068 / TASK-069：资产总表查询。筛选/排序/分页参数全部传给服务端，
// 客户端不拉全量；queryKey 带完整参数，缓存按筛选条件隔离。
import { useQuery } from '@tanstack/react-query';
import { getAssetsOverview } from '../services/ops-center.service';

export function useOpsCenterAssets({
  page = 1,
  pageSize = 50,
  market,
  active,
  missingType,
  search,
  sortBy = 'priority',
  sortOrder = 'asc'
} = {}) {
  const params = { page, pageSize, market, active, missingType, search, sortBy, sortOrder };
  const query = useQuery({
    queryKey: ['ops-center-assets', params],
    queryFn: () => getAssetsOverview(params),
    staleTime: 30 * 1000,
    retry: 1,
    placeholderData: (previousData) => previousData
  });

  return {
    assets: query.data?.data ?? [],
    pagination: query.data?.pagination ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch
  };
}
