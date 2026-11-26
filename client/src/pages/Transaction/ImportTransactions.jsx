// src/pages/Transaction/ImportTransactions.jsx
// TASK-044 R4 / R7：导入仅在组合内发起 —— 路由 /portfolios/:id/transactions/import，目标组合由路径锁定。
// TASK-094：标准 CSV 完整批次预览 + 确认。
//   - 页面只读取文件文本、收集来源账户 / 列映射 / 逐行决议，并展示服务端返回的预览与当次结果；
//   - 解析、映射应用、标的派生、匹配、超卖与拆批全部由服务端完成（client 不持有业务规则）；
//   - TASK-096：报表有时间无时区时由用户确认北京 / 多伦多时区；同日顺序影响结果时由用户确认先后（服务端判定）；
//   - 任何输入变化都使预览失效，必须重新预览后才能确认；服务端检测到账本变化时同样要求重新预览。
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Upload, ArrowLeft, Download, RefreshCw } from 'lucide-react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { SOURCE_BROKERS, TRANSACTION_ACTION_LABELS } from '../../constants/enums';
import { ROUTES } from '../../constants/routes';
import { getApiErrorMessage } from '../../services/api.client';
import {
  commitImport,
  downloadImportTemplate,
  getImportFormat,
  listSourceAccounts,
  previewImport,
} from '../../services/transactionImport.service';
import ImportMatchResolution from './ImportMatchResolution';

const DISPOSITION_LABELS = {
  add: '新增', update: '更新', skip: '跳过', review: '待核对', error: '错误', deferred: '下一批',
};
const DISPOSITION_STYLES = {
  add: 'text-emerald-700', update: 'text-blue-700', skip: 'text-gray-500',
  review: 'text-amber-700', error: 'text-red-700', deferred: 'text-gray-500',
};
const FEE_SOURCE_LABELS = { derived: '推算', user: '补填', confirmed_zero: '确认为 0', unknown: '未知' };
const TIME_ZONE_OPTIONS = [
  { value: '', label: '未确认（报表时间带时区时无需选择）' },
  { value: 'America/Toronto', label: '多伦多（America/Toronto）' },
  { value: 'Asia/Shanghai', label: '北京（Asia/Shanghai）' },
];
const PAIR_SOURCE_LABELS = { explicit: '按组号配对', user: '已指定配对', suggested: '建议配对（确认导入即采纳）' };

const ORDER_LABELS = {
  cross_report: { before: '在已有流水之前', after: '在已有流水之后' },
  mixed_precision: { before: '在带时刻成交之前', after: '在带时刻成交之后' },
};

function formatTradeTime(c) {
  if (!c) return '—';
  // 时区未确认：只显示报表原始日期时间，不猜换算后的时刻
  if (!c.date) return `${c.localDate || ''} ${c.localTime || ''}（时区待确认）`.trim();
  return formatDate(c.date, c.dateKind);
}

function formatDate(value, kind) {
  if (!value) return '—';
  const text = String(value);
  return kind === 'datetime' ? text.replace('T', ' ').slice(0, 19) + ' UTC' : text.slice(0, 10);
}

function saveText(fileName, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ImportTransactions() {
  const { id: portfolioId } = useParams();
  const navigate = useNavigate();
  const { data: portfolio } = usePortfolio(portfolioId);

  const [format, setFormat] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [sourceMode, setSourceMode] = useState('new');
  const [sourceId, setSourceId] = useState('');
  const [broker, setBroker] = useState('other');
  const [alias, setAlias] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [accountSelector, setAccountSelector] = useState('');
  const [resolutions, setResolutions] = useState({});
  const [preview, setPreview] = useState(null);
  const [stale, setStale] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getImportFormat().then(setFormat).catch(() => {});
    listSourceAccounts()
      .then(list => {
        setAccounts(list);
        if (list.length) { setSourceMode('existing'); setSourceId(list[0].id); }
      })
      .catch(() => {});
  }, []);

  // 任一输入变化 → 预览失效（必须重新预览才能确认）
  const invalidate = () => { if (preview) setStale(true); setResult(null); };

  const sourceAccount = useMemo(() => {
    if (sourceMode === 'existing') return alias.trim() ? { id: sourceId, alias: alias.trim() } : { id: sourceId };
    return { broker, alias: alias.trim(), ...(accountNumber.trim() ? { accountNumber: accountNumber.trim() } : {}) };
  }, [sourceMode, sourceId, broker, alias, accountNumber]);

  const buildPayload = (overrides = {}) => ({
    portfolioId,
    format: 'standard',
    file,
    sourceAccount,
    ...(mapping ? { mapping } : {}),
    ...(accountSelector ? { accountSelector } : {}),
    ...(timeZone ? { timeZone } : {}),
    resolutions,
    ...overrides,
  });

  const handleFile = (event) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFile({ name: picked.name, encoding: 'text', content: String(reader.result || '') });
      setMapping(null);
      setAccountSelector('');
      setResolutions({});
      setPreview(null);
      setStale(false);
      setResult(null);
      setError('');
    };
    reader.readAsText(picked, 'utf-8');
  };

  const runPreview = async (overrides) => {
    if (!file) { setError('请先选择 CSV 文件'); return; }
    if (sourceMode === 'new' && !alias.trim()) { setError('请填写来源账户别名'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await previewImport(buildPayload(overrides));
      setPreview(data);
      setMapping(data.mapping);
      setAccountSelector(data.accountSelector || '');
      setStale(false);
    } catch (err) {
      setError(getApiErrorMessage(err, '预览失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!preview || stale || preview.blocking) return;
    setLoading(true);
    setError('');
    try {
      const data = await commitImport(buildPayload({
        previewToken: preview.previewToken,
        ledgerFingerprint: preview.ledgerFingerprint,
      }));
      setResult(data);
      setStale(true);
      listSourceAccounts().then(setAccounts).catch(() => {});
      if (sourceMode === 'new' && data.sourceAccountId) {
        // 新建的来源账户已落库：后续批次 / 重新预览按 id 引用同一身份
        setSourceMode('existing');
        setSourceId(data.sourceAccountId);
      }
    } catch (err) {
      if (err.code === 'PREVIEW_STALE' || err.code === 'IMPORT_IN_PROGRESS') setStale(true);
      setError(getApiErrorMessage(err, '导入失败'));
    } finally {
      setLoading(false);
    }
  };

  const changeMapping = (columnIndex, key) => {
    const next = { ...(mapping || {}) };
    for (const [index, target] of Object.entries(next)) if (target === key) delete next[index];
    if (key) next[columnIndex] = key; else delete next[columnIndex];
    setMapping(next);
    invalidate();
  };

  // 同日顺序决议作用于同组全部行（服务端要求同组决议一致）
  const setOrderResolution = (rowKeys, order) => {
    setResolutions(current => {
      const next = { ...current };
      for (const key of rowKeys) next[key] = { order };
      return next;
    });
    invalidate();
  };

  const setResolution = (rowKey, value) => {
    setResolutions(current => {
      const next = { ...current };
      if (value) next[rowKey] = value; else delete next[rowKey];
      return next;
    });
    invalidate();
  };

  const resultRowsByKey = useMemo(
    () => new Map((result?.rows || []).map(row => [row.rowKey, row])),
    [result]
  );
  const columnOptions = format?.columns || [];
  const canCommit = preview && !stale && !preview.blocking && !loading;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to={ROUTES.PORTFOLIO_TX_TAB(portfolioId)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> 返回
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">导入流水（标准 CSV）</h1>
      </div>

      {/* 目标组合（锁定）、来源账户、文件 */}
      <div className="rounded-xl bg-white p-6 shadow space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-700">目标组合</label>
            <div className="rounded border bg-gray-50 px-3 py-2 text-sm text-gray-800">{portfolio?.name || '加载中…'}</div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-700">
              报表无时区时按此解读成交时间
              {preview?.requiresTimeZone && <span className="ml-2 text-amber-700">（需确认）</span>}
            </label>
            <select value={timeZone} onChange={e => { setTimeZone(e.target.value); invalidate(); }}
              className="w-full rounded border bg-white px-3 py-2 text-sm">
              {TIME_ZONE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        <fieldset className="space-y-3 rounded border p-4">
          <legend className="px-1 text-sm text-gray-700">来源账户（每份报表对应一个来源账户）</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" checked={sourceMode === 'existing'} disabled={!accounts.length}
                onChange={() => { setSourceMode('existing'); invalidate(); }} /> 选择已有账户
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={sourceMode === 'new'}
                onChange={() => { setSourceMode('new'); invalidate(); }} /> 新建账户
            </label>
          </div>
          {sourceMode === 'existing' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <select value={sourceId} onChange={e => { setSourceId(e.target.value); invalidate(); }}
                className="rounded border bg-white px-3 py-2 text-sm" aria-label="来源账户">
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.alias}（{SOURCE_BROKERS.find(b => b.value === account.broker)?.label || account.broker}
                    {account.accountKeyLast4 ? ` …${account.accountKeyLast4}` : ''}）
                  </option>
                ))}
              </select>
              <input value={alias} onChange={e => { setAlias(e.target.value); invalidate(); }} maxLength={60}
                placeholder="修改别名（可选，不影响账户身份）" className="rounded border px-3 py-2 text-sm" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <select value={broker} onChange={e => { setBroker(e.target.value); invalidate(); }}
                className="rounded border bg-white px-3 py-2 text-sm" aria-label="券商">
                {SOURCE_BROKERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <input value={alias} onChange={e => { setAlias(e.target.value); invalidate(); }} maxLength={60}
                placeholder="账户别名（必填）" className="rounded border px-3 py-2 text-sm" />
              <input value={accountNumber} onChange={e => { setAccountNumber(e.target.value); invalidate(); }}
                placeholder="账号（可选，仅保存哈希与末 4 位）" className="rounded border px-3 py-2 text-sm" />
            </div>
          )}
        </fieldset>

        <div className="flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="mb-1 block text-sm text-gray-700">CSV 文件（标准模板格式，或上传后手动列映射）</label>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <button type="button"
            onClick={async () => {
              try { saveText('portomind-transactions-template.csv', await downloadImportTemplate()); }
              catch (err) { setError(getApiErrorMessage(err, '模板下载失败')); }
            }}
            className="flex items-center gap-1 rounded border px-3 py-2 text-sm text-gray-700">
            <Download className="w-4 h-4" /> 下载标准模板
          </button>
          <button type="button" onClick={() => runPreview()} disabled={loading || !file}
            className="flex items-center gap-1 rounded bg-gray-800 px-4 py-2 text-sm text-white disabled:opacity-50">
            <RefreshCw className="w-4 h-4" /> {preview ? '重新预览' : '生成预览'}
          </button>
        </div>
        {file && <p className="text-xs text-gray-500">已读取：{file.name}</p>}
        {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      </div>

      {preview && (
        <div className="rounded-xl bg-white p-6 shadow space-y-5">
          {stale && (
            <div className="rounded bg-amber-50 p-3 text-sm text-amber-800">
              输入已变化或账本已更新：当前预览已失效，请点击「重新预览」后再确认。
            </div>
          )}

          <div className="grid gap-2 text-sm md:grid-cols-3">
            <div>目标：<strong>{preview.target.name}</strong></div>
            <div>
              来源：<strong>{preview.sourceAccount.alias}</strong>
              {preview.sourceAccount.accountKeyLast4 ? ` …${preview.sourceAccount.accountKeyLast4}` : ''}
              {preview.sourceAccount.isNew ? '（确认时新建）' : ''}
            </div>
            <div>文件：{preview.fileName || '—'}（共 {preview.counts.total} 行）</div>
          </div>

          {preview.accounts.length > 1 && (
            <div className="space-y-1 text-sm">
              <label className="block text-gray-700">报表包含多个账户，请选择本次导入的账户（其余账户请另行导入）</label>
              <select value={accountSelector}
                onChange={e => { setAccountSelector(e.target.value); invalidate(); }}
                className="rounded border bg-white px-3 py-2">
                <option value="">请选择</option>
                {preview.accounts.map(item => (
                  <option key={item.selector} value={item.selector}>…{item.accountKeyLast4}（{item.rowCount} 行）</option>
                ))}
              </select>
            </div>
          )}

          <details open={preview.blockingReasons.some(item => item.code === 'MISSING_COLUMNS')}>
            <summary className="cursor-pointer font-semibold text-gray-800">列映射</summary>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {preview.headers.map((header, index) => (
                <div key={`${header}-${index}`}>
                  <label className="mb-1 block truncate text-xs text-gray-500">{header || `列 ${index + 1}`}</label>
                  <select value={mapping?.[index] || ''} onChange={e => changeMapping(index, e.target.value)}
                    className="w-full rounded border bg-white px-2 py-1.5 text-sm">
                    <option value="">忽略</option>
                    {columnOptions.map(column => (
                      <option key={column.key} value={column.key}>{column.key}（{column.label}）</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </details>

          <div className="flex flex-wrap gap-4 text-sm">
            {['add', 'update', 'skip', 'review', 'error'].map(key => (
              <span key={key} className={DISPOSITION_STYLES[key]}>{DISPOSITION_LABELS[key]} {preview.counts[key]}</span>
            ))}
          </div>
          {preview.blockingReasons.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-red-700">
              {preview.blockingReasons.map(item => <li key={item.code}>{item.reason}</li>)}
            </ul>
          )}
          {preview.requiresSplit && (
            <p className="rounded bg-blue-50 p-3 text-sm text-blue-800">
              共 {preview.batches.reduce((sum, b) => sum + b.count, 0)} 条待写入，超过每次 {preview.commitLimit} 条上限：
              本次确认提交第 1 批（{preview.batches[0].count} 条，成对流水不拆开），完成后重新预览继续下一批。
            </p>
          )}

          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-left text-gray-500">
                  <th className="px-2 py-2">行号</th>
                  <th className="px-2 py-2">处置</th>
                  <th className="px-2 py-2">类型</th>
                  <th className="px-2 py-2">代码</th>
                  <th className="px-2 py-2">成交时间</th>
                  <th className="px-2 py-2">结算日</th>
                  <th className="px-2 py-2 text-right">数量</th>
                  <th className="px-2 py-2 text-right">单价</th>
                  <th className="px-2 py-2 text-right">佣金</th>
                  <th className="px-2 py-2 text-right">现金净额</th>
                  <th className="px-2 py-2">现金币种</th>
                  <th className="px-2 py-2">原成交编号</th>
                  <th className="px-2 py-2">原因 / 决议</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map(row => {
                  const c = row.candidate;
                  const committed = resultRowsByKey.get(row.rowKey);
                  const disposition = committed?.disposition || row.disposition;
                  const resolution = resolutions[row.rowKey] || {};
                  return (
                    <tr key={row.rowKey} className={`border-b ${row.disposition === 'error' ? 'bg-red-50' : row.disposition === 'review' ? 'bg-amber-50' : ''}`}>
                      <td className="px-2 py-2 whitespace-nowrap" title={row.rowNumberKind === 'original' ? '原报表行号' : '上传文件行号'}>
                        {row.rowNumber}{row.rowNumberKind === 'file' ? '（文件）' : ''}
                      </td>
                      <td className={`px-2 py-2 whitespace-nowrap ${DISPOSITION_STYLES[disposition] || ''}`}>
                        {DISPOSITION_LABELS[disposition] || disposition}
                      </td>
                      <td className="px-2 py-2">{c ? (TRANSACTION_ACTION_LABELS[c.action] || c.activityType) : '—'}</td>
                      <td className="px-2 py-2">{c?.symbol || '—'}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatTradeTime(c)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {c ? (c.settlementStatus === 'known' ? formatDate(c.settlementDate, 'date') : '未知') : '—'}
                      </td>
                      <td className="px-2 py-2 text-right">{c?.quantity ?? '—'}</td>
                      <td className="px-2 py-2 text-right">{c?.price ?? '—'}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        {c?.kind === 'cash' ? '—' : (c?.fee ?? '—')}
                        {c?.kind !== 'cash' && c?.feeSource && FEE_SOURCE_LABELS[c.feeSource] ? <span className="ml-1 text-xs text-gray-500">({FEE_SOURCE_LABELS[c.feeSource]})</span> : null}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        {c?.cashAmount ?? '—'}
                        {c?.cashAmountSource === 'derived' ? <span className="ml-1 text-xs text-gray-500">(推算)</span> : null}
                        {c?.cashDifference != null ? <div className="text-xs text-amber-700" title="券商净额与 数量×单价±佣金 的差异（保留券商净额）">差 {c.cashDifference}</div> : null}
                      </td>
                      <td className="px-2 py-2">{c?.cashCurrency || '—'}</td>
                      <td className="px-2 py-2">{c?.externalId || '—'}</td>
                      <td className="px-2 py-2 text-xs">
                        {row.reason && <div className="text-gray-700">{row.reason}</div>}
                        {row.options.includes('confirmZeroFee') && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <input type="number" min="0" step="any" placeholder="补填佣金"
                              value={resolution.fee ?? ''} className="w-24 rounded border px-1 py-0.5"
                              onChange={e => setResolution(row.rowKey, e.target.value === '' ? null : { fee: Number(e.target.value) })} />
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={resolution.confirmZeroFee === true}
                                onChange={e => setResolution(row.rowKey, e.target.checked ? { confirmZeroFee: true } : null)} />
                              确认按 0
                            </label>
                          </div>
                        )}
                        {row.options.includes('order') && row.orderConflict && (
                          <div className="mt-1 flex flex-wrap items-center gap-3">
                            {['before', 'after'].map(order => (
                              <label key={order} className="flex items-center gap-1">
                                <input type="radio" name={`order-${row.rowKey}`} checked={resolution.order === order}
                                  onChange={() => setOrderResolution(row.orderConflict.rowKeys, order)} />
                                {ORDER_LABELS[row.orderConflict.kind]?.[order] || order}
                              </label>
                            ))}
                          </div>
                        )}
                        {row.orderResolved && !row.options.includes('order') && (
                          <div className="text-gray-500">已确认顺序：{row.orderResolved === 'before' ? '之前' : '之后'}</div>
                        )}
                        {/* TASK-101：换汇两端配对。配对与候选全部由服务端给出，页面只展示并回传用户指定的另一端 */}
                        {row.pair && (
                          <div className="text-gray-500">
                            {PAIR_SOURCE_LABELS[row.pair.source] || '已配对'}：与第 {row.pair.partnerRowNumber} 行共同入账
                          </div>
                        )}
                        {row.options.includes('pairWith') && (
                          <select value={resolution.pairWith || ''} aria-label="指定换汇另一端"
                            onChange={e => setResolution(row.rowKey, e.target.value ? { pairWith: e.target.value } : null)}
                            className="mt-1 rounded border bg-white px-1 py-0.5">
                            <option value="">指定另一端…</option>
                            {row.pairCandidates.map(item => (
                              <option key={item.rowKey} value={item.rowKey}>
                                第 {item.rowNumber} 行 · {item.date || '—'} · {item.cashAmount ?? '—'} {item.cashCurrency || ''}
                              </option>
                            ))}
                          </select>
                        )}
                        <ImportMatchResolution row={row} resolution={resolution}
                          onChange={value => setResolution(row.rowKey, value)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleCommit} disabled={!canCommit}
              className="flex items-center gap-1 rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              <Upload className="w-4 h-4" /> {loading ? '处理中…' : '确认导入'}
            </button>
            {preview.blocking && !stale && <span className="text-sm text-red-700">存在阻塞项，整批不可提交</span>}
          </div>

          {result && (
            <div className="rounded bg-gray-50 p-4 text-sm space-y-1">
              <p className="font-medium text-gray-800">当次导入结果</p>
              <p>新增：<strong className="text-emerald-700">{result.added}</strong> 条 · 更新：{result.updated} 条 · 跳过：{result.skipped} 条 · 待核对：{result.review} 条</p>
              {result.deferred > 0 && <p className="text-blue-800">尚有 {result.deferred} 条留待下一批：请点击「重新预览」继续。</p>}
              <button type="button" onClick={() => navigate(ROUTES.PORTFOLIO_TX_TAB(portfolioId))}
                className="mt-2 text-blue-600 hover:underline">查看本组合交易记录 →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
