import { Link } from 'react-router';
import DataTaskCard from './DataTaskCard';
import { ROUTES } from '../../constants/routes';

export default function AssetCompletenessCard({ label, view, onRun, running, feedback }) {
  return (
    <div data-testid="asset-completeness-slot" className="space-y-2">
      <DataTaskCard label={label} view={view} />
      <div className="flex flex-wrap items-center gap-3 px-1 text-sm">
        {onRun && (
          <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" onClick={onRun} disabled={running}>
            {running ? '检查中…' : '运行资产信息检查'}
          </button>
        )}
        <Link to={ROUTES.ASSET_INTEGRITY} className="text-blue-700 hover:underline">查看详情</Link>
      </div>
      {feedback && <p role="status" className="px-1 text-sm">{feedback}</p>}
    </div>
  );
}
