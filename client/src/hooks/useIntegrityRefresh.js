// client/src/hooks/useIntegrityRefresh.js
//
// TASK-070：admin 手动刷新历史完整度。
import { startIntegrityCheck } from '../services/ops-center.service';
import { useOpsTaskStart } from './useOpsTaskStart';

export function useIntegrityRefresh() {
  return useOpsTaskStart(startIntegrityCheck);
}
