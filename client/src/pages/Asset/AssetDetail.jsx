// 标的详情页（FS-asset-price-consolidation R4，OQ3 锁定 B 版）
// 结构：标题区收进基本属性 + 价格表现全宽面板（不做左右两栏）。
// 数据全部来自既有客户端服务：getAssetById / getPriceHistory，零服务端改动。
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Pencil } from 'lucide-react';
import { getAssetById } from '../../services/asset.service';
import { getPriceHistory } from '../../services/price.service';
import { getApiErrorMessage } from '../../services/api';
import { ASSET_TYPES } from '../../constants/enums';
import { colors, radii } from '../../constants/design-tokens';
import {
  GAP_THRESHOLD_DAYS,
  assetClassLabels,
  daysSince,
  describeGap,
  fmtChange,
  fmtPrice,
} from '../../utils/priceDisplay';

const typeLabels = Object.fromEntries(ASSET_TYPES.map(o => [o.value, o.label]));

/** 两个时间戳相差的整天数，用于判断涨跌幅是否真的是「当日」口径（审查 N-5）。 */
function daysBetween(a, b) {
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.round(Math.abs(t2 - t1) / 86400000);
}

function Sparkline({ data, width = 680, height = 56 }) {
  if (!data || data.length === 0) return null;
  const values = data.map(p => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const up = values[values.length - 1] >= values[0];
  const stroke = up ? colors.up : colors.down;
  const points = data
    .map((p, i) => {
      const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width;
      const y = height - ((p.price - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="近 30 日迷你走势">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function PriceChart({ data, width = 900, height = 220 }) {
  if (!data || data.length === 0) return null;
  const values = data.map(p => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const up = values[values.length - 1] >= values[0];
  const stroke = up ? colors.up : colors.down;
  const pts = data.map((p, i) => {
    const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width;
    const y = height - 12 - ((p.price - min) / range) * (height - 24);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="价格走势">
      <polygon points={area} fill={`${stroke}18`} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function AssetDetail() {
  const { id } = useParams();
  const [asset, setAsset] = useState(null);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  // 资产属性与价格记录分开报错：价格接口挂了不应把已加载的属性一起吞掉（审查 N-9）
  const [assetError, setAssetError] = useState('');
  const [priceError, setPriceError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setAssetError('');
      setPriceError('');
      try {
        const assetData = await getAssetById(id);
        if (cancelled) return;
        setAsset(assetData);

        try {
          const to = new Date();
          const from = new Date();
          from.setDate(from.getDate() - 90);
          const fmt = (d) => d.toISOString().slice(0, 10);
          const res = await getPriceHistory(assetData.symbol, {
            from: fmt(from),
            to: fmt(to),
            page: 1,
            pageSize: 100,
          });
          if (cancelled) return;
          const sorted = [...(res.data || [])]
            .filter(row => row.price != null)
            .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
            .map(row => ({ ...row, price: Number(row.price) }));
          setPoints(sorted);
        } catch (err) {
          if (!cancelled) setPriceError(getApiErrorMessage(err, '价格记录加载失败'));
        }
      } catch (err) {
        if (!cancelled) setAssetError(getApiErrorMessage(err, '加载标的详情失败'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const latest = points.length > 0 ? points[points.length - 1] : null;
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const changePct = latest && prev && prev.price
    ? ((latest.price - prev.price) / prev.price) * 100
    : null;
  const last30 = useMemo(() => points.slice(-30), [points]);
  // 详情页只有单个标的，无法建立「同市场基准」，因此**不做相对缺口判定**：
  // 有数据时只中性显示「N 天前」（避免长假期间按自然日误标红），
  // 只有 90 天内完全无数据才算确定的异常并标红。
  // 缺口告警的职责归列表页（今日行情），那里有同市场基准可比。
  const createdDays = asset ? daysSince(asset.createdAt) : null;
  const gap = describeGap({
    days: daysSince(latest?.timestamp),
    behindTradingDays: null,
    hasPeer: false,
    neverSynced: points.length === 0 && createdDays != null && createdDays < GAP_THRESHOLD_DAYS,
    suppressGap: asset ? !asset.active : false,
    beyondWindowDays: points.length === 0 ? 90 : null,
  });
  const change = fmtChange(changePct);
  // 末两点间距 >1 天时，「当日涨跌幅」名不副实 → 改为「较 N 天前」（审查 N-5）
  const changeSpanDays = latest && prev ? daysBetween(prev.timestamp, latest.timestamp) : null;
  const isDailyChange = changeSpanDays != null && changeSpanDays <= 1;

  if (loading) {
    return <p style={{ color: colors.textSecondary }}>加载中…</p>;
  }

  if (assetError || !asset) {
    return (
      <div className="space-y-3">
        <div className="rounded bg-red-50 p-3 text-red-700">{assetError || '未找到该标的'}</div>
        <Link to="/prices" style={{ color: colors.brand }}>← 返回今日行情</Link>
      </div>
    );
  }

  const metaBits = [
    asset.symbol,
    asset.market,
    asset.currency,
    typeLabels[asset.type] || asset.type,
    asset.assetClass ? (assetClassLabels[asset.assetClass] || asset.assetClass) : '未分类',
  ];
  if (asset.tags?.length) metaBits.push(asset.tags.join('/'));
  if (!asset.active) metaBits.push('已停用');

  return (
    <div className="space-y-4">
      <Link to="/prices" className="inline-flex items-center gap-1.5 text-sm hover:underline" style={{ color: colors.textSecondary }}>
        <ArrowLeft size={16} /> 返回今日行情
      </Link>

      {/* 标题区：基本属性内联（OQ3 B 版） */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
            {asset.name}
          </h1>
          <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            {metaBits.join(' · ')}
          </div>
        </div>
        <Link
          to={`/instruments/edit/${asset._id}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded"
          style={{ border: `1px solid ${colors.border}`, backgroundColor: colors.bgCard, color: colors.textPrimary }}
        >
          <Pencil size={15} /> 编辑属性
        </Link>
      </div>

      {/* 价格表现：全宽面板 */}
      <div
        style={{
          backgroundColor: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: radii.lg,
          padding: 18,
        }}
      >
        <h2 className="flex items-center gap-2" style={{ fontSize: 14, margin: '0 0 14px', color: colors.textPrimary }}>
          <span style={{ width: 4, height: 15, backgroundColor: colors.brand, borderRadius: 3 }} />
          价格表现
        </h2>

        {priceError ? (
          <div style={{ textAlign: 'center', color: colors.textMuted, padding: '36px 20px', fontSize: 13 }}>
            <div style={{ color: '#B42318', marginBottom: 8 }}>{priceError}</div>
            标的属性已正常加载，仅价格记录获取失败，可稍后刷新重试。
          </div>
        ) : points.length === 0 ? (
          <div style={{ textAlign: 'center', color: colors.textMuted, padding: '40px 20px', fontSize: 13 }}>
            <div style={{ fontSize: 30, marginBottom: 8, opacity: 0.5 }}>📭</div>
            {/* 空态也必须呈现缺口状态，否则 90 天的长尾红色标签会被算出来却永远不显示 */}
            <div style={{ color: gap.color, fontWeight: gap.isGap ? 600 : 400, marginBottom: 6 }}>
              最近更新：{gap.text}
            </div>
            暂无价格记录
            <div style={{ marginTop: 6, fontSize: 12 }}>遵循「缺价不按零价」原则，不显示 0 价误算。</div>
          </div>
        ) : (
          <>
            <div className="flex items-end gap-4 flex-wrap">
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 0.5, color: colors.textPrimary }}>
                {fmtPrice(latest.price, asset.currency)}
              </div>
              <div style={{ color: change.color, fontSize: 13, paddingBottom: 6 }}>
                {changePct == null ? (
                  <span>— <span style={{ color: colors.textMuted }}>（无前一交易日价）</span></span>
                ) : (
                  <>
                    {change.text}
                    <span style={{ color: colors.textMuted }}>
                      （{isDailyChange ? '当日' : `较 ${changeSpanDays} 天前`} · 按{asset.currency}计，不跨币汇总）
                    </span>
                  </>
                )}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: gap.color }}>
                最近更新：{gap.text}
              </div>
            </div>

            <div
              style={{
                margin: '14px 0 6px',
                backgroundColor: '#FBFBFD',
                border: `1px solid ${colors.border}`,
                borderRadius: radii.md,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6 }}>近 30 日迷你走势（sparkline · R7）</div>
              <Sparkline data={last30} />
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="flex items-center justify-between" style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6 }}>
                <span>完整历史走势</span>
                <Link to={`/prices/${encodeURIComponent(asset.symbol)}/history`} style={{ color: colors.brand }}>
                  查看完整历史 →
                </Link>
              </div>
              <PriceChart data={points} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
