// client/src/components/OpsCenter/AssetDataTabs.jsx
//
// TASK-075：资产数据 tab 的子视图编排：资产总表 / 采集记录。
// 子视图落 URL（`?tab=assets&view=records`），刷新保持；只挂载当前子视图，
// 采集记录的请求只在该子视图激活时发出。

import { useSearchParams } from 'react-router';
import { colors } from '../../constants/design-tokens';
import { ASSET_VIEW_PARAM, ASSET_VIEW_RECORDS, ASSET_VIEWS, normalizeAssetView } from '../../constants/logTabs';
import AssetDataPanel from './AssetDataPanel';
import CollectionRecordsPanel from './CollectionRecordsPanel';

export default function AssetDataTabs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = normalizeAssetView(searchParams.get(ASSET_VIEW_PARAM));

  const selectView = (key) => {
    if (key === activeView) return;
    const next = new URLSearchParams(searchParams);
    next.set(ASSET_VIEW_PARAM, key);
    setSearchParams(next);
  };

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="资产数据视图" className="flex items-center gap-2 text-sm">
        {ASSET_VIEWS.map((view) => {
          const selected = view.key === activeView;
          return (
            <button
              key={view.key}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`ops-asset-view-${view.key}`}
              onClick={() => selectView(view.key)}
              className="px-3 py-1 rounded"
              style={{
                backgroundColor: selected ? colors.brand : 'transparent',
                color: selected ? '#fff' : colors.textSecondary,
                border: `1px solid ${selected ? colors.brand : '#E5E7EB'}`
              }}
            >
              {view.label}
            </button>
          );
        })}
      </div>
      {activeView === ASSET_VIEW_RECORDS ? <CollectionRecordsPanel /> : <AssetDataPanel />}
    </div>
  );
}
