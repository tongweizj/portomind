// client/src/hooks/useOpsTaskRun.js
//
// TASK-070：读取一次 TaskRun 的状态/进度/结果；仅 RUNNING 时轮询。
import { useQuery } from '@tanstack/react-query';
import { getTaskRun } from '../services/ops-center.service';

export function useOpsTaskRun(runId) {
  const query = useQuery({
    queryKey: ['ops-center-task-run', runId],
    queryFn: () => getTaskRun(runId),
    enabled: Boolean(runId),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (queryState) => (
      queryState.state.data?.status === 'RUNNING' ? 1500 : false
    )
  });

  return {
    run: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null
  };
}
