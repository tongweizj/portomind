// client/src/hooks/usePriceSync.js
//
// TASK-071：admin 手动触发今日价格同步。
import { startPriceSync } from '../services/ops-center.service';
import { useOpsTaskStart } from './useOpsTaskStart';

export function usePriceSync() {
  return useOpsTaskStart(startPriceSync);
}
