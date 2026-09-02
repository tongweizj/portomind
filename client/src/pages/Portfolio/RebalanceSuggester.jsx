import { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataState';
import { getActualRatios } from '../../services/portfolio.service';
import {
  checkRebalance,
  executeSuggestions,
  getHistory,
  getSuggestions
} from '../../services/rebalance.service';
import { RebalanceTabContext } from './rebalanceTabContext';

export default function RebalanceSuggester() {
  const { id } = useParams();
  const { switchSubTab } = useContext(RebalanceTabContext);
  const [lastRun, setLastRun] = useState(null);
  const [actualRatios, setActualRatios] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [recordId, setRecordId] = useState('');
  const [funding, setFunding] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [feeModel, setFeeModel] = useState({ fixedFee: 0, ratioFee: 0, taxRate: 0 });
  const [cashBudget, setCashBudget] = useState(0);
  const [checkMessage, setCheckMessage] = useState('');
  const [thresholdDetails, setThresholdDetails] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [action, setAction] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let active = true;
    setInitialLoading(true);
    setLoadError(false);
    Promise.all([getHistory(id, { page: 1, pageSize: 20 }), getActualRatios(id)])
      .then(([history, ratios]) => {
        if (!active) return;
        setLastRun(history.data.find(record => record.status === 'EXECUTED') || null);
        const pending = history.data.find(record => record.status === 'PENDING');
        if (pending) {
          setRecordId(pending._id);
          setSuggestions(pending.suggestions || []);
          setFunding(pending.funding || null);
          setWarnings(pending.warnings || []);
          setThresholdDetails(pending.thresholdDetails || []);
        }
        setActualRatios(ratios);
      })
      .catch(() => active && setLoadError(true))
      .finally(() => active && setInitialLoading(false));
    return () => { active = false; };
  }, [id]);

  const run = async (name, operation) => {
    setAction(name);
    setActionError('');
    try {
      await operation();
    } catch {
      setActionError('操作失败，请稍后重试');
    } finally {
      setAction('');
    }
  };

  const handleCheck = () => run('check', async () => {
    const result = await checkRebalance(id);
    const thresholds = result.triggeredThresholds?.join('、');
    setThresholdDetails(result.details || []);
    setCheckMessage(result.needsRebalance
      ? `需要再平衡${thresholds ? `：${thresholds}` : ''}`
      : '当前不需要再平衡');
  });

  const handleSuggest = () => run('suggest', async () => {
    const result = await getSuggestions(id, { feeModel, cashBudget: Number(cashBudget) });
    setRecordId(result.recordId);
    setSuggestions(result.suggestions);
    setFunding(result.funding);
    setWarnings(result.warnings || []);
    setThresholdDetails(result.thresholdDetails || []);
  });

  const handleExecute = () => {
    if (!window.confirm('确认按“先卖后买”创建这些交易吗？')) return;
    run('execute', async () => {
      await executeSuggestions(id, recordId, suggestions, 'MANUAL');
      switchSubTab('history');
    });
  };

  if (initialLoading) return <LoadingState />;
  if (loadError) return <ErrorState />;

  const chartCurrent = actualRatios.map(item => ({ name: `${item.symbol} (${item.currency})`, value: item.ratio }));
  const chartPost = suggestions.map(item => ({ name: item.symbol, value: item.postRebalanceRatio }));

  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold">再平衡建议</h2>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-600">
          最近执行：{lastRun ? `${lastRun.timestamp} (${lastRun.mode})` : '暂无记录'}
        </span>
        <button onClick={handleCheck} disabled={Boolean(action)} className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">
          {action === 'check' ? '检查中…' : '检查再平衡'}
        </button>
        <button onClick={handleSuggest} disabled={Boolean(action)} className="rounded bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-50">
          {action === 'suggest' ? '生成中…' : '生成建议'}
        </button>
        <button onClick={handleExecute} disabled={Boolean(action) || suggestions.length === 0 || !recordId}
          className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50">
          {action === 'execute' ? '执行中…' : '执行建议'}
        </button>
      </div>
      <div className="grid gap-3 rounded bg-white p-4 shadow-sm sm:grid-cols-4">
        <label className="text-sm">可投入现金
          <input type="number" min="0" step="any" value={cashBudget}
            onChange={event => setCashBudget(event.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <label className="text-sm">固定手续费
          <input type="number" min="0" step="any" value={feeModel.fixedFee}
            onChange={event => setFeeModel(value => ({ ...value, fixedFee: Number(event.target.value) }))}
            className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <label className="text-sm">比例手续费（小数）
          <input type="number" min="0" max="1" step="any" value={feeModel.ratioFee}
            onChange={event => setFeeModel(value => ({ ...value, ratioFee: Number(event.target.value) }))}
            className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <label className="text-sm">卖出税率（小数）
          <input type="number" min="0" max="1" step="any" value={feeModel.taxRate}
            onChange={event => setFeeModel(value => ({ ...value, taxRate: Number(event.target.value) }))}
            className="mt-1 w-full rounded border px-2 py-1" />
        </label>
      </div>
      {checkMessage && <div className="rounded bg-blue-50 p-3 text-blue-800">{checkMessage}</div>}
      {actionError && <div className="rounded bg-red-50 p-3 text-red-700">{actionError}</div>}
      {recordId && <div className="text-sm text-gray-600">待确认记录：{recordId}</div>}
      {warnings.length > 0 && <div className="rounded bg-yellow-50 p-3 text-yellow-800">{warnings.join('；')}</div>}
      {funding && <div className="text-sm text-gray-600">
        卖出净所得 {Number(funding.saleProceeds || 0).toFixed(2)}；买入可用资金 {Number(funding.availableForBuys || 0).toFixed(2)}；剩余现金 {Number(funding.remainingCash || 0).toFixed(2)}
      </div>}
      {thresholdDetails.length > 0 && (
        <div className="overflow-x-auto rounded bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100"><tr>
              <th className="px-3 py-2 text-left">资产</th><th className="px-3 py-2 text-right">目标比例</th>
              <th className="px-3 py-2 text-right">当前比例</th><th className="px-3 py-2 text-right">绝对偏离</th>
              <th className="px-3 py-2 text-right">相对偏离</th><th className="px-3 py-2 text-left">触发项</th>
            </tr></thead>
            <tbody>{thresholdDetails.map(detail => (
              <tr key={detail.symbol} className="border-t">
                <td className="px-3 py-2">{detail.symbol}</td>
                <td className="px-3 py-2 text-right">{Number(detail.targetRatio).toFixed(2)}%</td>
                <td className="px-3 py-2 text-right">{Number(detail.currentRatio).toFixed(2)}%</td>
                <td className="px-3 py-2 text-right">{detail.absoluteDeviation == null ? '-' : `${Number(detail.absoluteDeviation).toFixed(2)}%`}</td>
                <td className="px-3 py-2 text-right">{detail.relativeDeviation == null ? '-' : `${Number(detail.relativeDeviation).toFixed(2)}%`}</td>
                <td className="px-3 py-2">{detail.triggeredThresholds?.join('、') || '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="overflow-x-auto rounded bg-white shadow-sm lg:col-span-2">
          {suggestions.length === 0 ? <EmptyState /> : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100"><tr>
                <th className="px-3 py-2 text-left">Symbol</th><th className="px-3 py-2 text-left">方向</th>
                <th className="px-3 py-2 text-right">数量</th><th className="px-3 py-2 text-right">成交额</th>
                <th className="px-3 py-2 text-right">手续费</th><th className="px-3 py-2 text-right">税费</th>
                <th className="px-3 py-2 text-right">调整后比例</th>
              </tr></thead>
              <tbody>{suggestions.map(item => (
                <tr key={item.symbol} className="border-t">
                  <td className="px-3 py-2">{item.symbol}</td><td className="px-3 py-2">{item.action}</td>
                  <td className="px-3 py-2 text-right">{item.quantity}</td>
                  <td className="px-3 py-2 text-right">{Number(item.grossValue).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(item.estimatedFee).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(item.estimatedTax).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(item.postRebalanceRatio).toFixed(2)}%</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
        <div className="rounded bg-white p-4 shadow-sm">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={chartCurrent} dataKey="value" nameKey="name" innerRadius={35} outerRadius={55}>
                {chartCurrent.map(item => <Cell key={item.name} />)}
              </Pie>
              <Pie data={chartPost} dataKey="value" nameKey="name" innerRadius={65} outerRadius={85}>
                {chartPost.map(item => <Cell key={item.name} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
