// client/src/hooks/useBatchBackfill.js
//
// TASK-074：批量补采预览 mutation + 异步启动/轮询；启动部分复用 useOpsTaskStart。
import { useMutation } from '@tanstack/react-query';
import { previewBatchBackfill, startBatchBackfill } from '../services/ops-center.service';
import { useOpsTaskStart } from './useOpsTaskStart';

export function useBatchBackfill() {
  const task = useOpsTaskStart(startBatchBackfill);
  const previewMutation = useMutation({ mutationFn: previewBatchBackfill });

  return {
    ...task,
    preview: previewMutation.mutate,
    previewData: previewMutation.data ?? null,
    isPreviewing: previewMutation.isPending,
    previewError: previewMutation.error ?? null
  };
}
