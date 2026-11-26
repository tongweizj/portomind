// src/pages/Transaction/ImportMatchResolution.jsx
// TASK-095：重复成交 / 券商更正的逐行决议。
//   - 只展示服务端给出的候选旧流水、新旧值差异与可选处置（row.options），不自行判断是否重复；
//   - 用户选择 跳过 / 新增 / 更新（更新须指定候选之一），决议随下一次预览提交给服务端。

const ACTION_LABELS = { skip: '跳过此行', add: '作为新成交新增', update: '更新旧流水' };
const FIELD_LABELS = {
  symbol: '代码', date: '成交时间', dateKind: '时间精度', quantity: '数量', price: '单价',
  grossAmount: '成交金额', fee: '佣金', cashAmount: '现金金额', cashCurrency: '币种',
  settlementDate: '结算日', externalId: '原成交编号',
};
const MATCH_ACTIONS = ['skip', 'add', 'update'];

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function DiffList({ diff }) {
  if (!diff?.length) return <span className="text-gray-500">内容一致</span>;
  return (
    <ul className="space-y-0.5">
      {diff.map(item => (
        <li key={item.field}>
          {FIELD_LABELS[item.field] || item.field}：
          <span className="text-gray-500 line-through">{formatValue(item.before)}</span>
          {' → '}
          <span className="text-blue-700">{formatValue(item.after)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ImportMatchResolution({ row, resolution, onChange }) {
  const actions = MATCH_ACTIONS.filter(action => row.options.includes(action));
  // 佣金未知行只带 skip：沿用简单的「跳过」勾选，不展示匹配区块
  const isMatchRow = row.matches.length > 0 || row.duplicateOf;
  if (!actions.length) return null;
  if (!isMatchRow) {
    return (
      <label className="mt-1 flex items-center gap-1">
        <input type="checkbox" checked={resolution.action === 'skip'}
          onChange={e => onChange(e.target.checked ? { action: 'skip' } : null)} />
        跳过此行
      </label>
    );
  }
  const selectedTarget = resolution.targetId || (row.matches.length === 1 ? row.matches[0].id : '');
  return (
    <div className="mt-1 space-y-2">
      {row.duplicateOf && (
        <div className="rounded border border-amber-200 bg-white p-2">
          <div className="text-gray-600">与文件第 {row.duplicateOf.rowNumber} 行的差异：</div>
          <DiffList diff={row.duplicateOf.diff} />
        </div>
      )}
      {row.matches.map(match => (
        <label key={match.id} className="flex gap-2 rounded border border-amber-200 bg-white p-2">
          {actions.includes('update') && row.matches.length > 1 && (
            <input type="radio" name={`target-${row.rowKey}`} checked={resolution.action === 'update' && selectedTarget === match.id}
              onChange={() => onChange({ action: 'update', targetId: match.id })} aria-label="指定为更新对象" />
          )}
          <div>
            <div className="text-gray-600">
              旧流水{match.portfolioName ? `（组合：${match.portfolioName}）` : ''}
              {match.transaction ? ` · ${formatValue(match.transaction.date).slice(0, 10)} · 数量 ${formatValue(match.transaction.quantity)} · 单价 ${formatValue(match.transaction.price)}` : ''}
              {match.transaction?.notes ? ` · 备注「${match.transaction.notes}」（更新时保留）` : ''}
            </div>
            <DiffList diff={match.diff} />
          </div>
        </label>
      ))}
      <div className="flex flex-wrap gap-3">
        {actions.map(action => (
          <label key={action} className="flex items-center gap-1">
            <input type="radio" name={`action-${row.rowKey}`} checked={resolution.action === action}
              onChange={() => onChange(action === 'update'
                ? { action, ...(selectedTarget ? { targetId: selectedTarget } : {}) }
                : { action })} />
            {ACTION_LABELS[action]}
          </label>
        ))}
        {resolution.action && (
          <button type="button" className="text-gray-500 underline" onClick={() => onChange(null)}>清除决议</button>
        )}
      </div>
      {resolution.action === 'update' && !selectedTarget && (
        <div className="text-red-700">请在上方选择要更新的旧流水</div>
      )}
    </div>
  );
}
