// client/src/hooks/useTaskRecords.js
//
// TASK-075：采集记录列表查询。筛选与分页全部作为服务端参数；queryKey 带完整参数。
import { useQuery } from '@tanstack/react-query';
import { listTaskRecords } from '../services/ops-center.service';

export function useTaskRecords(params) {
  const query = useQuery({
    queryKey: ['ops-center-task-records', params],
    queryFn: () => listTaskRecords(params),
    staleTime: 15 * 1000,
    retry: 1,
    placeholderData: (previousData) => previousData
  });

  return {
    records: query.data?.data ?? [],
    pagination: query.data?.pagination ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null
  };
}
