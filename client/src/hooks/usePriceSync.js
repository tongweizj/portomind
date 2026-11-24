// client/src/hooks/usePriceSync.js
//
// TASK-071：admin 手动触发今日价格同步。202 后轮询 TaskRun；终态刷新资产总表。
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { startPriceSync } from '../services/ops-center.service';
import { useOpsTaskRun } from './useOpsTaskRun';

const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'PARTIAL', 'FAILED']);

export function usePriceSync() {
  const queryClient = useQueryClient();
  const [runId, setRunId] = useState(null);
  const mutation = useMutation({
    mutationFn: startPriceSync,
    onSuccess: (data) => setRunId(data.runId)
  });
  const taskRun = useOpsTaskRun(runId);
  const status = taskRun.run?.status;

  useEffect(() => {
    if (!runId || !TERMINAL_STATUSES.has(status)) return;
    queryClient.invalidateQueries({ queryKey: ['ops-center-assets'] });
  }, [runId, status, queryClient]);

  return {
    start: mutation.mutate,
    isStarting: mutation.isPending,
    startError: mutation.error ?? null,
    run: taskRun.run,
    runError: taskRun.error ?? null,
    isLoadingRun: taskRun.isLoading,
    isRunning: status === 'RUNNING'
  };
}
