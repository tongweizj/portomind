// client/src/hooks/useOpsTaskStart.js
//
// TASK-070/071：启动运维异步任务、轮询 TaskRun，并在终态刷新资产总表。
// 具体任务只提供 mutationFn（返回 202 + runId），不重复轮询状态机。
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOpsTaskRun } from './useOpsTaskRun';

const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'PARTIAL', 'FAILED']);

export function useOpsTaskStart(mutationFn) {
  const queryClient = useQueryClient();
  const [runId, setRunId] = useState(null);
  const mutation = useMutation({
    mutationFn,
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
