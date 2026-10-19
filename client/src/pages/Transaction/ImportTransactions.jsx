// src/pages/Transaction/ImportTransactions.jsx
// TASK-044 R4 / R7：CSV 导入仅在组合内发起 —— 路由 /portfolios/:id/transactions/import。
// 目标组合由路径锁定，页内不再有组合下拉选择器，也不存在「未选择组合」的提交路径。
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Upload, ArrowLeft } from 'lucide-react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { TRANSACTION_ACTIONS } from '../../constants/enums';
import { ROUTES } from '../../constants/routes';
import { importTransactions } from '../../services/transaction.service';
import { getApiErrorMessage } from '../../services/api';
import { parseCsv, mapColumns, rowToTransaction } from '../../utils/csvImport';

const FIELD_LABELS = {
  symbol: '代码', action: '方向', quantity: '份额', price: '价格',
  fee: '费用', date: '日期', notes: '备注', name: '名称',
};

const ACTION_LABELS = Object.fromEntries(TRANSACTION_ACTIONS.map(o => [o.value, o.label]));

export default function ImportTransactions() {
  const { id: portfolioId } = useParams();
  const navigate = useNavigate();
  const { data: portfolio } = usePortfolio(portfolioId);
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const backToTransactions = () => navigate(ROUTES.PORTFOLIO_TX_TAB(portfolioId));

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ''));
      if (parsed.length < 2) {
        setError('CSV 至少需要表头 + 1 行数据');
        return;
      }
      const [headerRow, ...dataRows] = parsed;
      setHeaders(headerRow);
      setRows(dataRows.slice(0, 50)); // 预览前 50 行
      setMapping(mapColumns(headerRow));
    };
    reader.readAsText(file, 'utf-8');
  };

  const buildPreview = () => rows.map((row, index) => {
    const { transaction, error: rowError } = rowToTransaction(row, mapping);
    return { index: index + 2, transaction, error: rowError };
  });

  const handleSubmit = async () => {
    if (!portfolioId) { setError('缺少目标组合，请返回组合的交易记录重新发起导入'); return; }
    const items = buildPreview();
    const invalid = items.filter(item => item.error);
    if (invalid.length > 0) {
      setError(`预览中存在 ${invalid.length} 行无效数据（见预览列表），请修正后导入`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      // 导入仍走服务端批量端点，逐行校验（重复检测 / 超卖 / 语义）不下移到前端（AC10）
      const data = await importTransactions({
        portfolioId,
        transactions: items.map(item => item.transaction)
      });
      setResult(data);
    } catch (err) {
      setError(getApiErrorMessage(err, '导入失败'));
    } finally {
      setLoading(false);
    }
  };

  const changeMapping = (columnIndex, field) => {
    // 移除该字段在其它列上的映射（一列一字段）
    const next = { ...mapping };
    for (const [index, target] of Object.entries(next)) {
      if (target === field) delete next[index];
    }
    if (field) next[columnIndex] = field;
    setMapping(next);
  };

  const previewRows = useMemo(() => {
    const build = () => rows.map((row, index) => {
      const { transaction, error: rowError } = rowToTransaction(row, mapping);
      return { index: index + 2, transaction, error: rowError };
    });
    return headers.length ? build() : [];
  }, [headers, rows, mapping]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to={ROUTES.PORTFOLIO_TX_TAB(portfolioId)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> 返回
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">导入交易（CSV）</h1>
      </div>

      {/* 目标组合（锁定）+ 文件选择。R7：无组合下拉选择器 */}
      <div className="rounded-xl bg-white p-6 shadow space-y-4">
        <div>
          <label className="mb-1 block text-sm text-gray-700">目标组合</label>
          <div className="rounded border bg-gray-50 px-3 py-2 text-sm text-gray-800">
            {portfolio?.name || '加载中…'}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-700">CSV 文件（天天基金/雪球导出）</label>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile}
            className="w-full rounded border px-3 py-2 text-sm" />
        </div>
        {fileName && <p className="text-xs text-gray-500">已读取：{fileName}</p>}
      </div>

      {headers.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow space-y-4">
          <h2 className="font-semibold text-gray-800">列映射</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {headers.map((header, index) => (
              <div key={`${header}-${index}`}>
                <label className="mb-1 block text-xs text-gray-500 truncate">{header || `列 ${index + 1}`}</label>
                <select value={mapping[index] || ''}
                  onChange={event => changeMapping(index, event.target.value)}
                  className="w-full rounded border px-2 py-1.5 text-sm bg-white">
                  <option value="">忽略</option>
                  {Object.entries(FIELD_LABELS).map(([field, label]) => (
                    <option key={field} value={field}>{label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <h2 className="pt-2 font-semibold text-gray-800">预览（前 {previewRows.length} 行）</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-2 py-2">行</th>
                  <th className="px-2 py-2">代码</th>
                  <th className="px-2 py-2">方向</th>
                  <th className="px-2 py-2 text-right">份额</th>
                  <th className="px-2 py-2 text-right">价格</th>
                  <th className="px-2 py-2 text-right">费用</th>
                  <th className="px-2 py-2">日期</th>
                  <th className="px-2 py-2">状态</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map(item => (
                  <tr key={item.index} className={`border-b ${item.error ? 'bg-red-50' : ''}`}>
                    <td className="px-2 py-2">{item.index}</td>
                    <td className="px-2 py-2">{item.transaction.symbol}</td>
                    {/* 与表格共用同一份中文映射，避免出现第三套显示口径（R8） */}
                    <td className="px-2 py-2">{ACTION_LABELS[item.transaction.action] || item.transaction.action}</td>
                    <td className="px-2 py-2 text-right">{item.transaction.quantity}</td>
                    <td className="px-2 py-2 text-right">{item.transaction.price}</td>
                    <td className="px-2 py-2 text-right">{item.transaction.fee}</td>
                    <td className="px-2 py-2">{item.transaction.date || '-'}</td>
                    <td className="px-2 py-2 text-red-700 text-xs">{item.error || '✓'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSubmit} disabled={loading}
              className="flex items-center gap-1 rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              <Upload className="w-4 h-4" /> {loading ? '导入中…' : '确认导入'}
            </button>
            {error && <span className="text-sm text-red-700">{error}</span>}
          </div>

          {result && (
            <div className="rounded bg-gray-50 p-4 text-sm space-y-1">
              <p className="font-medium text-gray-800">导入结果</p>
              <p>成功导入：<strong className="text-emerald-700">{result.imported}</strong> 条</p>
              <p>跳过重复：<strong className="text-gray-600">{result.skipped}</strong> 条</p>
              {result.errors?.length > 0 && (
                <ul className="space-y-1">
                  {result.errors.map((item, index) => (
                    <li key={index} className="text-red-700">行 {item.index + 1}：{item.message}</li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={backToTransactions}
                className="mt-2 text-blue-600 hover:underline">
                查看本组合交易记录 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
