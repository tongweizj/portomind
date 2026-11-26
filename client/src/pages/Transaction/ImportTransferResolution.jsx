// src/pages/Transaction/ImportTransferResolution.jsx
// TASK-099：证券划转行的配对与承接成本展示 / 决议。
//   - 只展示服务端给出的配对对端、转出成本与承接成本（含来源），不自行计算成本或换算币种；
//   - 多个可配对对象时由用户指定（pairWith）；跨币种缺成本与换算依据时补充其中一项（transferCost / fxRate）；
//   - 决议随下一次预览提交给服务端。

const COST_SOURCE_LABELS = {
  carried: '承接转出成本', report: '报表给出', fx: '按换算依据折算', user: '用户补填',
};

function formatAmount(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function describeLeg(leg) {
  if (!leg) return '—';
  const where = leg.kind === 'row' ? `本文件第 ${leg.rowNumber} 行` : `已暂存（${leg.portfolioName || leg.portfolioId}${leg.sourceAccountAlias ? ` · ${leg.sourceAccountAlias}` : ''}${leg.rowNumber ? ` · 原行 ${leg.rowNumber}` : ''}）`;
  return `${leg.direction === 'out' ? '转出' : '转入'} ${leg.symbol} × ${formatAmount(leg.quantity)} · ${String(leg.date || '').slice(0, 10)} · ${where}`;
}

export default function ImportTransferResolution({ row, resolution, onChange }) {
  const transfer = row.transfer;
  if (!transfer) return null;
  const needsCost = row.options.includes('transferCost');
  const needsPair = row.options.includes('pairWith');

  return (
    <div className="mt-1 space-y-1 rounded border border-indigo-200 bg-white p-2">
      {transfer.partner ? (
        <div className="text-gray-700">对端：{describeLeg(transfer.partner)}</div>
      ) : (!needsPair && <div className="text-gray-500">尚无对端：确认后暂存，两边账本均不变</div>)}
      {transfer.removedCost !== undefined && transfer.removedCost !== null && (
        <div className="text-gray-600">
          转出成本 {formatAmount(transfer.removedCost)} {transfer.removedCostCurrency}
          {transfer.carryCost !== null && transfer.carryCost !== undefined && (
            <> → 承接成本 <strong>{formatAmount(transfer.carryCost)} {transfer.carryCostCurrency}</strong>
              （{COST_SOURCE_LABELS[transfer.carryCostSource] || transfer.carryCostSource}
              {transfer.fxRate ? `，1 ${transfer.removedCostCurrency} = ${transfer.fxRate} ${transfer.carryCostCurrency}` : ''}）</>
          )}
          ；划转本身不产生买卖盈亏
        </div>
      )}
      {needsPair && (
        <div className="space-y-1">
          {(transfer.candidates || []).map(candidate => (
            <label key={candidate.id} className="flex items-center gap-1">
              <input type="radio" name={`pair-${row.rowKey}`} checked={resolution.pairWith === candidate.id}
                onChange={() => onChange({ pairWith: candidate.id })} />
              {describeLeg(candidate)}
            </label>
          ))}
        </div>
      )}
      {needsCost && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="number" min="0" step="any" placeholder={`转入成本（${transfer.carryCostCurrency}）`}
            value={resolution.transferCost ?? ''} className="w-36 rounded border px-1 py-0.5"
            onChange={e => onChange(e.target.value === '' ? null : { transferCost: Number(e.target.value) })} />
          <span className="text-gray-500">或</span>
          <input type="number" min="0" step="any"
            placeholder={`1 ${transfer.removedCostCurrency} = ? ${transfer.carryCostCurrency}`}
            value={resolution.fxRate ?? ''} className="w-36 rounded border px-1 py-0.5"
            onChange={e => onChange(e.target.value === '' ? null : { fxRate: Number(e.target.value) })} />
        </div>
      )}
      {(needsPair || needsCost) && (
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={resolution.action === 'skip'}
            onChange={e => onChange(e.target.checked ? { action: 'skip' } : null)} />
          跳过此行
        </label>
      )}
    </div>
  );
}
