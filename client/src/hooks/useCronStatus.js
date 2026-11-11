// client/src/hooks/useCronStatus.js
//
// TASK-063：全看板唯一的 cron 状态快照查询。
// 固定 queryKey；首次挂载读取一次，之后只有手动 refetch。
// 逐项关闭窗口聚焦/重连/轮询/重挂自动路径——全局 QueryClient 没有关这些。
import { useQuery } from '@tanstack/react-query';
import { getCronStatus } from '../services/cron-status.service';

export const CRON_STATUS_QUERY_KEY = ['cron-status'];

export function useCronStatus() {
  const query = useQuery({
    queryKey: CRON_STATUS_QUERY_KEY,
    queryFn: getCronStatus,
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    refetchOnMount: false
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    isRefetchError: query.isRefetchError,
    error: query.error ?? null,
    refetch: query.refetch
  };
}
