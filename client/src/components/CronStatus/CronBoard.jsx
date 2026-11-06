// client/src/components/CronStatus/CronBoard.jsx
//
// TASK-063：把 GET /api/cron/status 的单次快照接入 053 的 BoardShell。
//
// - 数据读取：useCronStatus（固定 queryKey，只首读 + 手动刷新；无轮询/无 mutation）
// - 五卡：价格 → 055 PriceTaskCard；其余四卡 → DataTaskCard（taskDataViews 派生）
// - 总览：buildOverview（bad > warn > 数据未就绪 > 全部正常）
// - 错误分层：整体请求失败时五卡统一不可用；有旧快照时保留旧数据并明确过时；
//            单卡字段异常只影响该卡（逐卡 build 函数）。
// - 只读：无任务触发/写操作。

import { useCronStatus } from '../../hooks/useCronStatus';
import { getApiErrorMessage } from '../../services/api';
import { colors } from '../../constants/design-tokens';
import BoardShell from './BoardShell';
import DataTaskCard from './DataTaskCard';
import PriceTaskCard from './PriceTaskCard';
import { getPriceView } from './priceDataState';
import {
  BOARD_SLOTS,
  UNKNOWN_TEXT,
  formatTimestamp
} from './unknownValue';
import {
  buildAlertView,
  buildFxView,
  buildIntegrityView,
  buildOverview,
  buildRebalanceView,
  buildUnavailableView
} from './taskDataViews';

const CARD_COMPONENTS = {
  'price-sync': PriceSlotCard,
  'integrity-check': DataTaskCard,
  'alert-evaluate': DataTaskCard,
  'fx-rate-sync': DataTaskCard,
  'rebalance': DataTaskCard
};

/** 价格卡 + lastSkip 独立行（PriceTaskCard 的 props 契约不含 lastSkip）。 */
function PriceSlotCard({ label, lastSkipText, ...priceProps }) {
  return (
    <div data-testid="price-slot" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <PriceTaskCard label={label} {...priceProps} />
      {lastSkipText && (
        <div
          data-testid="price-last-skip"
          style={{ color: colors.textMuted, fontSize: 12, padding: '0 4px' }}
        >
          {lastSkipText}
        </div>
      )}
    </div>
  );
}

function lastSkipTextOf(task) {
  const skip = task && task.lastSkip && typeof task.lastSkip === 'object' ? task.lastSkip : null;
  if (!skip) return null;
  const when = formatTimestamp(skip.skippedAt);
  const reason = typeof skip.reason === 'string' && skip.reason.length > 0 ? skip.reason : UNKNOWN_TEXT;
  if (when === '—' && reason === UNKNOWN_TEXT) return null;
  return `最近跳过 ${when} · ${reason}`;
}

function priceViewOf(task, requestError) {
  return getPriceView({
    dataState: task ? task.dataState : null,
    dataStateLevel: task ? task.dataStateLevel : null,
    requestError
  });
}

function buildCards(tasksByKey, { requestError, generatedAt, onRetry }) {
  const unavailable = Boolean(requestError);

  const priceTask = tasksByKey.get('daily-price-sync') || null;
  const priceView = unavailable
    ? buildUnavailableView()
    : priceViewOf(priceTask, null);
  const priceProps = {
    label: '价格同步',
    dataState: priceTask ? priceTask.dataState : null,
    dataStateLevel: priceTask ? priceTask.dataStateLevel : null,
    lastRunAt: priceTask && priceTask.lastRun ? priceTask.lastRun.startedAt : null,
    runState: priceTask && priceTask.stale
      ? '超时未完成'
      : (priceTask && priceTask.lastRun ? priceTask.lastRun.status : UNKNOWN_TEXT),
    requestError: unavailable ? requestError : null,
    snapshotAt: generatedAt || null,
    onRetry,
    lastSkipText: lastSkipTextOf(priceTask)
  };

  const integrityTask = tasksByKey.get('price-integrity-check') || null;
  const alertTask = tasksByKey.get('alert-evaluate') || null;
  const fxTask = tasksByKey.get('fx-rate-sync') || null;
  const rebalanceTask = tasksByKey.get('rebalance-check') || null;

  const views = {
    'integrity-check': unavailable ? buildUnavailableView() : buildIntegrityView(integrityTask),
    'alert-evaluate': unavailable ? buildUnavailableView() : buildAlertView(alertTask),
    'fx-rate-sync': unavailable ? buildUnavailableView() : buildFxView(fxTask),
    'rebalance': unavailable ? buildUnavailableView() : buildRebalanceView(rebalanceTask)
  };

  return {
    priceView,
    views,
    cards: {
      'price-sync': priceProps,
      'integrity-check': { view: views['integrity-check'] },
      'alert-evaluate': { view: views['alert-evaluate'] },
      'fx-rate-sync': { view: views['fx-rate-sync'] },
      'rebalance': { view: views['rebalance'] }
    }
  };
}

/**
 * @param {{
 *   snapshot?: object|null,
 *   error?: any,
 *   isLoading?: boolean,
 *   isFetching?: boolean,
 *   onRefresh?: Function,
 * }} props
 */
export function CronBoardView({
  snapshot = null,
  error = null,
  isLoading = false,
  isFetching = false,
  onRefresh
} = {}) {
  const hasSnapshot = Boolean(snapshot && Array.isArray(snapshot.tasks));
  const requestError = error || null;
  const generatedAt = hasSnapshot ? snapshot.generatedAt : null;
  const tasks = hasSnapshot ? snapshot.tasks.filter((task) => task && typeof task === 'object') : [];
  const tasksByKey = new Map(tasks.map((task) => [task.taskName, task]));

  const { priceView, views, cards } = buildCards(tasksByKey, {
    requestError: hasSnapshot ? null : requestError,
    generatedAt,
    onRetry: onRefresh
  });

  const entries = BOARD_SLOTS.map((slot) => {
    if (slot.key === 'price-sync') {
      const priceTask = tasksByKey.get('daily-price-sync') || null;
      return {
        present: Boolean(priceTask),
        hasRun: Boolean(priceTask && priceTask.lastRun),
        level: priceTask ? priceView.level : 'unknown',
        contractReady: Boolean(priceTask && priceTask.contractReady === true),
        stale: Boolean(priceTask && priceTask.stale === true)
      };
    }
    const view = views[slot.key];
    return {
      present: Boolean(view.present),
      hasRun: Boolean(view.lastRun),
      level: view.level,
      contractReady: Boolean(view.contractReady),
      stale: Boolean(view.stale)
    };
  });

  const overview = buildOverview(entries, {
    requestError,
    hasSnapshot,
    isLoading,
    generatedAt
  });

  const errorText = requestError ? getApiErrorMessage(requestError, '快照获取失败') : null;

  return (
    <div data-testid="cron-board">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap'
        }}
      >
        <button
          type="button"
          data-testid="cron-refresh"
          onClick={onRefresh}
          disabled={isFetching}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: `1px solid ${colors.border}`,
            background: colors.bgCard,
            color: colors.textSecondary,
            cursor: isFetching ? 'not-allowed' : 'pointer',
            fontSize: 12
          }}
        >
          {isFetching ? '刷新中…' : '刷新'}
        </button>
        {overview.staleNote && (
          <span data-testid="cron-stale-warning" style={{ color: colors.statusWarn, fontSize: 12 }}>
            {overview.staleNote}
          </span>
        )}
        {!hasSnapshot && errorText && (
          <span data-testid="cron-error" style={{ color: colors.statusBad, fontSize: 12 }}>
            {errorText}
          </span>
        )}
      </div>

      {!hasSnapshot && isLoading ? (
        <div
          data-testid="cron-loading"
          style={{
            padding: '24px 16px',
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            background: colors.bgCard,
            color: colors.textSecondary,
            fontSize: 12
          }}
        >
          正在读取任务快照…
        </div>
      ) : (
        <BoardShell
          summary={{
            snapshotAt: overview.snapshotAt,
            overallState: overview.overallState,
            overallLevel: overview.overallLevel,
            levels: overview.levels
          }}
          cards={cards}
          cardComponents={CARD_COMPONENTS}
        />
      )}
    </div>
  );
}

export default function CronBoard() {
  const { data, error, isLoading, isFetching, isRefetchError, refetch } = useCronStatus();
  const hasSnapshot = Boolean(data && Array.isArray(data.tasks));
  const requestError = error && (!hasSnapshot || isRefetchError) ? error : null;

  return (
    <CronBoardView
      snapshot={data}
      error={requestError}
      isLoading={isLoading}
      isFetching={isFetching}
      onRefresh={refetch}
    />
  );
}
