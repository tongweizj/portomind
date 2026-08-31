import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Landmark, RefreshCw, Wallet, ArrowLeftRight, Scale } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { useFamilySummary, useFxRates, useSyncFxRates, useUpsertFxRate } from '../hooks/useFamily';
import { getApiErrorMessage } from '../services/api';

const CURRENCY_META = {
  CNY: { label: '人民币', symbol: '¥' },
  USD: { label: '美元', symbol: 'US$' },
  CAD: { label: '加元', symbol: 'CA$' },
  HKD: { label: '港币', symbol: 'HK$' },
};

const BUCKET_ORDER = ['USD', 'CAD', 'CNY', 'HKD'];

const ACTION_LABELS = { buy: '买入', sell: '卖出' };
const STATUS_LABELS = { PENDING: '待确认', EXECUTED: '已执行', REVOKED: '已撤销' };

function formatCny(value) {
  if (value == null) return '—';
  return `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function formatAmount(value, currency) {
  if (value == null) return '—';
  const meta = CURRENCY_META[currency] || {};
  return `${meta.symbol || ''}${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function BucketCards({ buckets }) {
  const items = BUCKET_ORDER
    .map(currency => ({ currency, meta: CURRENCY_META[currency], bucket: buckets[currency] }))
    .filter(item => item.bucket != null);
  if (items.length === 0) return <p className="text-sm text-gray-500">暂无资产分桶数据</p>;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map(({ currency, meta, bucket }) => (
        <div key={currency} className="rounded-xl bg-white p-4 shadow">
          <p className="text-sm text-gray-500">{meta.label}（{currency}）</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">{formatAmount(bucket.amount, currency)}</p>
          <p className="text-sm text-gray-500 mt-1">{formatCny(bucket.cnyValue)}</p>
          {currency !== 'CNY' && bucket.rate != null && (
            <p className="text-xs text-gray-400 mt-1">1 {currency} ≈ ¥{Number(bucket.rate).toFixed(4)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ContributionList({ contributions, navigate }) {
  if (!contributions || contributions.length === 0) return <EmptyState />;
  return (
    <div className="space-y-3">
      {contributions.map(contribution => {
        const bucketText = Object.entries(contribution.marketValueByCurrency || {})
          .map(([currency, amount]) => formatAmount(amount, currency))
          .join(' + ');
        return (
          <div key={String(contribution.portfolioId)}
            className="rounded-xl bg-white p-4 shadow cursor-pointer hover:bg-gray-50"
            onClick={() => navigate(`/portfolios/view/${contribution.portfolioId}/basic`)} role="button" tabIndex={0}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">{contribution.name}</p>
                <p className="text-sm text-gray-500">{bucketText || '暂无持仓'}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-800">{formatCny(contribution.cnyValue)}</p>
                <p className="text-sm text-gray-500">
                  {contribution.ratio != null ? `${contribution.ratio}%` : '折算不完整'}
                </p>
              </div>
            </div>
            {contribution.ratio != null && (
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(contribution.ratio, 100)}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FxManager() {
  const { data: rates = [], isLoading, isError } = useFxRates();
  const upsert = useUpsertFxRate();
  const [currency, setCurrency] = useState('USD');
  const [rate, setRate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (event) => {
    event.preventDefault();
    const value = Number(rate);
    if (!Number.isFinite(value) || value <= 0) { setError('请输入有效汇率'); return; }
    setSaving(true);
    setError('');
    try {
      await upsert.mutateAsync({ currency, data: { rateToCny: value, note: 'manual entry' } });
      setRate('');
    } catch (err) {
      setError(getApiErrorMessage(err, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl bg-white p-6 shadow space-y-4">
      <h2 className="font-semibold text-gray-800 flex items-center gap-2">
        <Scale className="w-4 h-4 text-gray-500" />
        汇率（1 外币 = ¥人民币）
      </h2>
      {isLoading ? <LoadingState />
        : isError ? <ErrorState />
          : rates.length === 0 ? <p className="text-sm text-gray-500">暂无汇率数据，可手动录入或一键同步</p>
            : (
              <ul className="space-y-2 text-sm">
                {rates.map(item => (
                  <li key={item.currency} className="flex items-center justify-between">
                    <span className="text-gray-600">{CURRENCY_META[item.currency]?.label}（{item.currency}）</span>
                    <span className="text-gray-800 font-medium">
                      {Number(item.rateToCny).toFixed(4)}
                      <span className="ml-2 text-xs text-gray-400">
                        {new Date(item.date).toISOString().slice(0, 10)} · {item.source === 'manual' ? '手动' : '自动'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
      <form onSubmit={handleSave} className="flex flex-wrap items-end gap-2 border-t pt-4">
        <div>
          <label className="mb-1 block text-xs text-gray-500">币种</label>
          <select value={currency} onChange={event => setCurrency(event.target.value)}
            className="rounded border px-3 py-2 text-sm bg-white">
            {['USD', 'CAD', 'HKD'].map(code => (
              <option key={code} value={code}>{CURRENCY_META[code].label}（{code}）</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">对人民币汇率</label>
          <input type="number" step="any" min="0" value={rate} placeholder="如 7.20"
            onChange={event => setRate(event.target.value)}
            className="w-36 rounded border px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
          {saving ? '保存中…' : '录入'}
        </button>
        {error && <p className="text-sm text-red-700 w-full">{error}</p>}
      </form>
    </div>
  );
}

export default function Family() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useFamilySummary();
  const sync = useSyncFxRates();
  const [syncError, setSyncError] = useState('');

  const handleSync = async () => {
    setSyncError('');
    try {
      await sync.mutateAsync();
      await refetch();
    } catch (err) {
      setSyncError(getApiErrorMessage(err, '同步失败'));
    }
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  const totalCny = data.totalCny;
  const incomplete = data.portfolioContributions?.some(item => item.cnyValue == null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Landmark className="w-6 h-6 text-blue-600" />
          家庭视图
        </h1>
        <button type="button" onClick={handleSync} disabled={sync.isPending}
          className="flex items-center gap-1 text-sm text-blue-600 border border-blue-200 rounded px-3 py-1.5 hover:bg-blue-50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${sync.isPending ? 'animate-spin' : ''}`} />
          同步汇率
        </button>
      </div>
      {syncError && <p className="text-sm text-red-700">{syncError}</p>}

      {/* FAM-01：家庭总资产（RMB 基准） */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-lg">
        <p className="text-blue-100 text-sm">家庭总资产（RMB 折算）</p>
        <p className="text-4xl font-bold mt-1">{formatCny(totalCny)}</p>
        <p className="text-blue-200 text-xs mt-2">
          {data.asOf ? `数据时点：${new Date(data.asOf).toLocaleString('zh-CN')}` : ''}
          {incomplete ? ' · 部分组合折算不完整（缺价或缺汇率）' : ''}
        </p>
      </div>

      {/* 币种分桶 */}
      <BucketCards buckets={data.buckets || {}} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* FAM-02：组合贡献 */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-gray-500" />
            组合贡献
          </h2>
          <ContributionList contributions={data.portfolioContributions} navigate={navigate} />
        </div>

        {/* FAM-04：最近动态 */}
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-gray-500" />
              最近交易
            </h2>
            {!data.recentTransactions || data.recentTransactions.length === 0 ? <EmptyState />
              : (
                <div className="rounded-xl bg-white p-4 shadow space-y-2">
                  {data.recentTransactions.map(tx => (
                    <div key={tx._id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                      <div>
                        <span className="font-medium text-gray-800">{tx.portfolioName}</span>
                        <span className="ml-2 text-gray-600">{tx.symbol}</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${tx.action === 'buy' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {ACTION_LABELS[tx.action]}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-800">{tx.quantity} × {tx.price}</span>
                        <span className="ml-2 text-xs text-gray-400">{new Date(tx.date).toISOString().slice(0, 10)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">最近再平衡</h2>
            {!data.recentRebalanceRecords || data.recentRebalanceRecords.length === 0 ? <EmptyState />
              : (
                <div className="rounded-xl bg-white p-4 shadow space-y-2">
                  {data.recentRebalanceRecords.map(record => (
                    <div key={record._id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                      <div>
                        <span className="font-medium text-gray-800">{record.portfolioName}</span>
                        <span className="ml-2 text-xs text-gray-400">{record.mode === 'AUTO' ? '自动' : '手动'}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          record.status === 'EXECUTED' ? 'bg-emerald-50 text-emerald-700'
                            : record.status === 'REVOKED' ? 'bg-gray-100 text-gray-500'
                              : 'bg-amber-50 text-amber-700'
                        }`}>
                          {STATUS_LABELS[record.status] || record.status}
                        </span>
                        <span className="ml-2 text-xs text-gray-400">
                          {new Date(record.timestamp).toISOString().slice(0, 10)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>

      {/* 汇率管理 */}
      <FxManager />
    </div>
  );
}
