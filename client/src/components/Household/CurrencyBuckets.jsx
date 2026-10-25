// 家庭币种分桶（TASK-050 R8 / AC9）—— 纯展示组件，数据由 pages/Portfolio/List.jsx 统一取一次。
import { CURRENCY_LABELS } from '../../constants/enums';
import { formatCny, formatMoney } from '../../utils/priceDisplay';

// 展示顺序：外币在前、人民币在后（沿用搬移前的既有顺序）。
const BUCKET_ORDER = ['USD', 'CAD', 'CNY', 'HKD'];

export default function CurrencyBuckets({ buckets }) {
  const items = BUCKET_ORDER
    .map(currency => ({ currency, bucket: (buckets || {})[currency] }))
    .filter(item => item.bucket != null);

  if (items.length === 0) return <p className="text-sm text-gray-500">暂无资产分桶数据</p>;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map(({ currency, bucket }) => (
        <div key={currency} className="rounded-xl bg-white p-4 shadow">
          <p className="text-sm text-gray-500">
            {CURRENCY_LABELS[currency] || currency}（{currency}）
          </p>
          <p className="text-lg font-semibold text-gray-800 mt-1">{formatMoney(bucket.amount, currency)}</p>
          <p className="text-sm text-gray-500 mt-1">{formatCny(bucket.cnyValue)}</p>
          {currency !== 'CNY' && bucket.rate != null && (
            <p className="text-xs text-gray-400 mt-1">1 {currency} ≈ ¥{Number(bucket.rate).toFixed(4)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
