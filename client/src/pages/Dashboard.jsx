import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, Check, EyeOff, RefreshCw } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { usePortfolios } from '../hooks/usePortfolios';
import { useAlertEvents, useMarkAlertEventRead, useEvaluateAlerts } from '../hooks/useAlerts';

const LEVEL_STYLES = {
  info: 'border-blue-400',
  warning: 'border-amber-400',
  action: 'border-red-500',
};

const LEVEL_LABELS = { info: '信息', warning: '预警', action: '行动' };

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function EventCard({ event, onRead, onDismiss }) {
  const navigate = useNavigate();
  const isUnread = event.status === 'unread';

  const handleJump = () => {
    if (event.symbol) {
      navigate(`/prices/${event.symbol}/history`);
    } else if (event.portfolioId) {
      navigate(`/portfolios/view/${event.portfolioId}/rebalance`);
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${LEVEL_STYLES[event.level] || 'border-gray-300'} p-4 ${isUnread ? 'bg-white' : 'opacity-70'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={handleJump} role="button" tabIndex={0}>
          <div className="flex items-center gap-2">
            {isUnread && <span className="w-2 h-2 rounded-full bg-red-500" />}
            <span className="text-sm font-medium text-gray-800">{event.title}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              event.level === 'action' ? 'bg-red-50 text-red-700'
                : event.level === 'warning' ? 'bg-amber-50 text-amber-700'
                  : 'bg-blue-50 text-blue-700'
            }`}>{LEVEL_LABELS[event.level]}</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{event.content}</p>
          <p className="text-xs text-gray-400 mt-1">{formatTime(event.triggeredAt)}{event.symbol ? ` · ${event.symbol}` : ''}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isUnread ? (
            <button type="button" title="标记已读"
              onClick={() => onRead(event._id, 'read')}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
              <Check className="w-4 h-4" />
            </button>
          ) : null}
          <button type="button" title="忽略"
            onClick={() => onDismiss(event._id, 'dismissed')}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <EyeOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('unread');
  const [portfolioFilter, setPortfolioFilter] = useState('');
  const { data: portfolios = [] } = usePortfolios();
  const { data: events = [], isLoading, isError } = useAlertEvents({
    status: statusFilter === 'all' ? undefined : statusFilter,
    portfolioId: portfolioFilter || undefined,
    pageSize: 50
  });
  const markRead = useMarkAlertEventRead();
  const evaluate = useEvaluateAlerts();

  const eventList = useMemo(() => (Array.isArray(events) ? events : []), [events]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Bell className="w-6 h-6 text-blue-600" />
          提醒中心
        </h1>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => evaluate.mutate()}
            disabled={evaluate.isPending}
            className="flex items-center gap-1 text-sm text-blue-600 border border-blue-200 rounded px-3 py-1.5 hover:bg-blue-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${evaluate.isPending ? 'animate-spin' : ''}`} />
            立即评估
          </button>
          <button type="button" onClick={() => navigate('/alerts/rules')}
            className="text-sm text-gray-600 border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-100">
            规则管理
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {[{ key: 'unread', label: '未读' }, { key: 'all', label: '全部' }].map(item => (
            <button key={item.key} type="button"
              onClick={() => setStatusFilter(item.key)}
              className={`px-4 py-1.5 text-sm ${statusFilter === item.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {item.label}
            </button>
          ))}
        </div>
        <select value={portfolioFilter} onChange={event => setPortfolioFilter(event.target.value)}
          className="rounded border border-gray-200 px-3 py-1.5 text-sm bg-white">
          <option value="">全部组合</option>
          {portfolios.map(pf => (
            <option key={pf._id} value={pf._id}>{pf.name}</option>
          ))}
        </select>
      </div>

      {/* 事件列表 */}
      {isLoading ? <LoadingState />
        : isError ? <ErrorState />
          : eventList.length === 0 ? <EmptyState />
            : (
              <div className="space-y-3">
                {eventList.map(event => (
                  <EventCard key={event._id} event={event}
                    onRead={(id, status) => markRead.mutate({ id, status })}
                    onDismiss={(id, status) => markRead.mutate({ id, status })} />
                ))}
              </div>
            )}
    </div>
  );
}
