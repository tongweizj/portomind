import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Upload, ArrowLeft } from 'lucide-react';
import { getPortfolios } from '../../services/portfolio.service';
import { importTransactions } from '../../services/transaction.service';
import { getApiErrorMessage } from '../../services/api';
import { parseCsv, mapColumns, rowToTransaction } from '../../utils/csvImport';

const FIELD_LABELS = {
  symbol: '代码', action: '方向', quantity: '份额', price: '价格',
  fee: '费用', date: '日期', notes: '备注', name: '名称',
};

export default function ImportTransactions() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [portfolios, setPortfolios] = useState([]);
  const [portfolioId, setPortfolioId] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 加载组合（惰性，页面首次打开时）
  useMemo(() => {
    getPortfolios().then(data => {
      setPortfolios(data);
      if (data.length > 0) setPortfolioId(data[0]._id);
    });
  }, []);

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

  // 按当前映射生成预览
  const buildPreview = () => rows.map((row, index) => {
    const { transaction, error: rowError } = rowToTransaction(row, mapping);
    return { index: index + 2, transaction, error: rowError };
  });

  const handleSubmit = async () => {
    if (!portfolioId) { setError('请选择目标组合'); return; }
    const items = buildPreview();
    const invalid = items.filter(item => item.error);
    if (invalid.length > 0) {
      setError(`预览中存在 ${invalid.length} 行无效数据（见预览列表），请修正后导入`);
      return;
    }
    setLoading(true);
    setError('');
    try {
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
        <button type="button" onClick={() => navigate('/transactions')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> 返回
        </button>
        <h1 className="text-2xl font-bold text-gray-800">导入交易（CSV）</h1>
      </div>

      {/* 文件与组合选择 */}
      <div className="rounded-xl bg-white p-6 shadow space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-52">
            <label className="mb-1 block text-sm text-gray-700">目标组合</label>
            <select value={portfolioId} onChange={event => setPortfolioId(event.target.value)}
              className="w-full rounded border px-3 py-2 bg-white">
              {portfolios.map(pf => <option key={pf._id} value={pf._id}>{pf.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-52">
            <label className="mb-1 block text-sm text-gray-700">CSV 文件（天天基金/雪球导出）</label>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile}
              className="w-full rounded border px-3 py-2 text-sm" />
          </div>
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
                    <td className="px-2 py-2">{item.transaction.action}</td>
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
              <button type="button" onClick={() => navigate('/transactions')}
                className="mt-2 text-blue-600 hover:underline">
                查看交易记录 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
