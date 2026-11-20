import { Link } from 'react-router';
import { useCronStatus } from '../../hooks/useCronStatus';
import { getApiErrorMessage } from '../../services/api.client';
import { formatTimestamp } from '../../components/CronStatus/unknownValue';

const REASON_LABELS = {
  SYMBOL_FORMAT: '代码格式不符合要求',
  SYMBOL_SUFFIX: '代码后缀与市场不匹配',
  NAME_EMPTY: '缺少名称',
  NAME_TOO_LONG: '名称超过 120 个字符',
  MARKET_INVALID: '市场缺失或无效',
  CURRENCY_INVALID: '币种缺失或无效',
  CURRENCY_MISMATCH: '币种与市场不匹配',
  LAUNCH_DATE_MISSING: '缺少上市 / 成立日期',
  LAUNCH_DATE_INVALID: '上市 / 成立日期无效',
  LAUNCH_DATE_FUTURE: '上市 / 成立日期在未来',
  PRICE_EMPTY_3_MARKET_DAYS: '最近 3 个市场日价格全为空',
  INSUFFICIENT_MARKET_DAYS: '可核对的市场日不足 3 个'
};

export default function AssetIntegrityDetail() {
  const { data, error, isLoading } = useCronStatus();
  const snapshot = data?.assetCompleteness;
  const assets = snapshot?.incompleteAssets || [];
  return (
    <section className="space-y-4">
      <Link to="/logs?tab=board" className="text-sm text-blue-700 hover:underline">← 返回任务看板</Link>
      <h1 className="text-2xl font-bold">资产信息完整度</h1>
      {isLoading && <p>正在读取检查结果…</p>}
      {error && <p role="alert">{getApiErrorMessage(error, '检查结果读取失败')}</p>}
      {!isLoading && !error && !snapshot?.contractReady && <p>{snapshot?.notes?.[0]?.message || '尚无检查结果'}</p>}
      {snapshot?.contractReady && (
        <>
          <p className="text-sm text-gray-600">上次检查 {formatTimestamp(snapshot.checkedAt)}。上市／成立日期随保存更新，价格结果在手动检查后更新。</p>
          {!assets.length && <p>{snapshot.total ? '所有受检资产信息完整。' : '没有启用的资产。'}</p>}
          {assets.length > 0 && (
            <ul className="divide-y rounded border bg-white">
              {assets.map(asset => (
                <li key={asset.assetId} className="flex flex-wrap justify-between gap-3 p-4">
                  <div>
                    <h2 className="font-semibold">{asset.symbol || '未知代码'} · {asset.name || '未知名称'}</h2>
                    <p className="text-sm text-gray-600">{asset.market || '未知市场'}</p>
                    <ul className="list-disc pl-5 text-sm">
                      {asset.reasons.map(reason => <li key={reason}>{REASON_LABELS[reason] || reason}</li>)}
                    </ul>
                  </div>
                  <Link to={`/instruments/edit/${asset.assetId}`} state={{ fromIntegrity: true }} className="text-sm text-blue-700 hover:underline">编辑</Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
