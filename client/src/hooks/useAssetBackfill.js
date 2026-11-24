// client/src/hooks/useAssetBackfill.js
//
// TASK-072：单资产历史补采的同步 mutation；组件只负责表单与结果展示。
import { useMutation } from '@tanstack/react-query';
import { backfillAsset } from '../services/ops-center.service';

export function useAssetBackfill() {
  return useMutation({
    mutationFn: ({ assetId, from, to }) => backfillAsset(assetId, { from, to })
  });
}
