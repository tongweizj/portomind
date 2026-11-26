// src/components/portfolio/CashReconciliation.jsx
// TASK-103：来源账户现金核对。按来源账户 + 币种展示跨组合的已结算现金变动、结算日未知项、缺项与差额。
// 期初 / 期末余额由用户按券商对账单填写，随请求提交；是否「余额已核对」完全由服务端判定，
// 前端不做任何汇总或跨币种折算（规则 10），缺值显示「—」（规则 2）。
import { useMemo, useState } from 'react';
import { colors, radii } from '../../constants/design-tokens';
import { ASSET_CURRENCIES, TRANSACTION_ACTION_LABELS } from '../../constants/enums';
import { getApiErrorMessage } from '../../services/api.client';
import { useCashReconciliation } from '../../hooks/useTransactionImport';

const inputStyle = { border: `1px solid ${colors.border}`, borderRadius: radii.md, padding: '4px 8px', fontSize: 13 };

function money(value) {
  return value === null || value === undefined
    ? '—'
    : value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toNumberOrNull(text) {
  const trimmed = String(text ?? '').trim();
  return trimmed === '' ? null : Number(trimmed);
}

function ItemRows({ items }) {
  return items.map(item => (
    <tr key={item.id} style={{ borderTop: `1px solid ${colors.border}` }}>
      <td className="px-2 py-1">
        {item.cashDate ?? '—'}
        {item.cashDateBasis === 'activity' && <span style={{ color: colors.textMuted }}>（活动日）</span>}
      </td>
      <td className="px-2 py-1">{item.tradeDate ?? '—'}</td>
      <td className="px-2 py-1">{item.portfolioName ?? item.portfolioId}</td>
      <td className="px-2 py-1">{TRANSACTION_ACTION_LABELS[item.action] ?? item.action}{item.symbol ? ` · ${item.symbol}` : ''}</td>
      <td className="px-2 py-1 text-right">{money(item.cashAmount)}</td>
      <td className="px-2 py-1" style={{ color: colors.textMuted }}>
        {item.pair ? `换汇对端 ${item.pair.counterpart ? `${item.pair.counterpart.currency} ${money(item.pair.counterpart.cashAmount)}` : '缺失'}` : ''}
      </td>
    </tr>
  ));
}

function CurrencyResult({ entry }) {
  const ok = entry.status === 'reconciled';
  return (
    <div className="space-y-2 p-3" style={{ border: `1px solid ${colors.border}`, borderRadius: radii.md }}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <strong>{entry.currency}</strong>
        <span
          className="px-2 py-0.5 text-xs"
          style={{ borderRadius: radii.md, backgroundColor: ok ? colors.brandSurface : colors.bgPage, color: ok ? colors.brand : colors.warn }}
        >
          {entry.statusLabel}
        </span>
        <span>期初 {money(entry.openingBalance)}</span>
        <span>已知变动 {money(entry.knownChange)}</span>
        <span>计算期末 {money(entry.computedClosing)}</span>
        <span>券商期末 {money(entry.closingBalance)}</span>
        <span>差额 {money(entry.difference)}</span>
      </div>
      {entry.missing.length > 0 && (
        <ul className="list-disc pl-5 text-xs" style={{ color: colors.warn }}>
          {entry.missing.map(item => (
            <li key={item.code}>{item.reason}{item.count ? `（${item.count}）` : ''}{item.difference !== undefined ? `：${money(item.difference)}` : ''}</li>
          ))}
        </ul>
      )}
      {entry.portfolios.length > 0 && (
        <div className="text-xs" style={{ color: colors.textSecondary }}>
          {entry.portfolios.map(item => `${item.portfolioName ?? item.portfolioId}：${money(item.knownChange)}（${item.count} 笔）`).join('；')}
        </div>
      )}
      {(entry.items.length > 0 || entry.unknownSettlement.length > 0 || entry.incomplete.length > 0) && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: colors.textMuted }}>
                <th className="px-2 py-1 text-left">现金日期</th>
                <th className="px-2 py-1 text-left">成交 / 活动日</th>
                <th className="px-2 py-1 text-left">组合</th>
                <th className="px-2 py-1 text-left">类型</th>
                <th className="px-2 py-1 text-right">金额</th>
                <th className="px-2 py-1 text-left">备注</th>
              </tr>
            </thead>
            <tbody>
              <ItemRows items={entry.items} />
              {entry.unknownSettlement.length > 0 && (
                <tr><td colSpan={6} className="px-2 pt-2 font-medium" style={{ color: colors.warn }}>结算日未知（未计入变动）</td></tr>
              )}
              <ItemRows items={entry.unknownSettlement} />
              {entry.incomplete.length > 0 && (
                <tr><td colSpan={6} className="px-2 pt-2 font-medium" style={{ color: colors.warn }}>缺现金金额（未计入变动）</td></tr>
              )}
              <ItemRows items={entry.incomplete} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CashReconciliation({ portfolioId, sourceAccounts }) {
  const candidates = useMemo(
    () => sourceAccounts.filter(account => account.portfolioIds?.includes(portfolioId)),
    [sourceAccounts, portfolioId]
  );
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [balances, setBalances] = useState({});
  const reconciliation = useCashReconciliation();
  const result = reconciliation.data || null;
  const error = reconciliation.isError ? getApiErrorMessage(reconciliation.error, '现金核对失败') : '';
  const loading = reconciliation.isPending;

  if (candidates.length === 0) return null;
  const selectedId = accountId || candidates[0].id;

  const setBalance = (currency, key, value) =>
    setBalances(previous => ({ ...previous, [currency]: { ...previous[currency], [key]: value } }));

  const submit = (event) => {
    event.preventDefault();
    const payload = {};
    for (const [currency, entry] of Object.entries(balances)) {
      const opening = toNumberOrNull(entry.opening);
      const closing = toNumberOrNull(entry.closing);
      if (opening !== null || closing !== null) payload[currency] = { opening, closing };
    }
    reconciliation.mutate({ id: selectedId, from, to, balances: payload });
  };

  return (
    <section className="space-y-3 p-4" style={{ backgroundColor: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: radii.lg }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>来源账户现金核对</h3>
        <p style={{ fontSize: 12, color: colors.textMuted, margin: '4px 0 0' }}>
          汇总该来源账户在所有组合中的流水，按币种分别核对；成交按结算日（未知的单列），无结算日的现金类流水按活动日。
        </p>
      </div>
      <form onSubmit={submit} className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select value={selectedId} onChange={event => setAccountId(event.target.value)} style={inputStyle} aria-label="来源账户">
            {candidates.map(account => (
              <option key={account.id} value={account.id}>
                {account.alias}{account.accountKeyLast4 ? ` ·${account.accountKeyLast4}` : ''}
              </option>
            ))}
          </select>
          <input type="date" value={from} onChange={event => setFrom(event.target.value)} style={inputStyle} aria-label="期间开始" required />
          <span>至</span>
          <input type="date" value={to} onChange={event => setTo(event.target.value)} style={inputStyle} aria-label="期间结束" required />
        </div>
        <div className="flex flex-wrap gap-3">
          {ASSET_CURRENCIES.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-1">
              <span style={{ width: 64 }}>{label}</span>
              <input
                type="number" step="any" placeholder="期初余额" style={{ ...inputStyle, width: 110 }}
                value={balances[value]?.opening ?? ''} onChange={event => setBalance(value, 'opening', event.target.value)}
              />
              <input
                type="number" step="any" placeholder="券商期末余额" style={{ ...inputStyle, width: 120 }}
                value={balances[value]?.closing ?? ''} onChange={event => setBalance(value, 'closing', event.target.value)}
              />
            </div>
          ))}
        </div>
        <button
          type="submit" disabled={loading}
          className="px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: colors.brand, color: colors.textInverse, border: 'none', borderRadius: radii.md, cursor: 'pointer' }}
        >
          {loading ? '核对中…' : '核对'}
        </button>
      </form>

      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {result && (
        <div className="space-y-2">
          {result.cashDateRules?.length > 0 && (
            <ul className="list-disc pl-5 text-xs" style={{ color: colors.textSecondary }} aria-label="现金日期规则">
              {result.cashDateRules.map(rule => <li key={rule.code}>{rule.text}</li>)}
            </ul>
          )}
          {result.currencies.length === 0 ? (
            <div className="text-sm" style={{ color: colors.textMuted }}>该期间没有现金流水，也未填写余额。</div>
          ) : (
            result.currencies.map(entry => <CurrencyResult key={entry.currency} entry={entry} />)
          )}
        </div>
      )}
    </section>
  );
}
