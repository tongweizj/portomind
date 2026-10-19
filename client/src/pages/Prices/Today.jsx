// 今日行情（FS-asset-price-consolidation R3/R6/R7）
//
// 独立审查 B-1/B-2 修复：本页底座由「当日价格行」改为「标的全集」。
// 原实现的致命问题：以 getTodayPrices（仅返回 [今日00:00, 明日00:00) 的记录）作为行来源，
// 于是「最近更新」恒为 0 天 → 「≥3 天缺口标红」分支永不触发；
// 且今天没有价格的标的会直接从列表消失，与「让过期标的可见」的设计意图相反。
// 现改为：行 = 全部标的，价格/涨跌幅/更新时间由最近 N 日价格窗口按 symbol 合并而来。
//
// 数据仅用既有客户端服务（getAssets / getPricesByDate），零服务端改动。
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { getPricesByDate } from '../../services/price.service';
import { getAssets } from '../../services/asset.service';
import { getApiErrorMessage } from '../../services/api';
import { ASSET_CLASSES } from '../../constants/enums';
import { colors, radii } from '../../constants/design-tokens';
import {
  CHANGE_LOOKBACK_DAYS,
  annotateGapFields,
  assetClassLabels,
  daysSince,
  describeGap,
  fmtChange,
  fmtPrice,
  localDateStr,
} from '../../utils/priceDisplay';

const PAGE_SIZE = 200;

/**
 * 拉取最近 days 个日历日的价格，按 symbol 归并出「最新价 + 涨跌幅」。
 *
 * 关键实现细节：按**查询日**归组，而不是解析每行的 timestamp 再切日。
 * 因为请求本身就是按日发起的，查询日即市场日，天然规避 UTC/本地时区换算歧义。
 */
async function loadPriceWindow(days) {
  const dates = Array.from({ length: days }, (_, i) => localDateStr(i));
  const settled = await Promise.allSettled(
    dates.map(date => getPricesByDate(date, { page: 1, pageSize: PAGE_SIZE }))
  );

  const failedCount = settled.filter(r => r.status === 'rejected').length;
  const acc = new Map();

  settled.forEach((res, i) => {
    if (res.status !== 'fulfilled') return;
    const date = dates[i];
    (res.value?.data || []).forEach(row => {
      if (row.price == null || !row.symbol) return;
      const tsMs = new Date(row.timestamp).getTime();
      if (!Number.isFinite(tsMs)) return;

      let slot = acc.get(row.symbol);
      if (!slot) {
        slot = { latest: null, byDay: new Map() };
        acc.set(row.symbol, slot);
      }
      if (!slot.latest || tsMs > slot.latest.tsMs) {
        slot.latest = { price: Number(row.price), timestamp: row.timestamp, tsMs, day: date };
      }
      // 同一天可能有多条（重复同步），保留当天最后一条
      const day = slot.byDay.get(date);
      if (!day || tsMs > day.tsMs) slot.byDay.set(date, { price: Number(row.price), tsMs });
    });
  });

  const latestBySymbol = new Map();
  acc.forEach((slot, symbol) => {
    const series = [...slot.byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v.price);
    let change = null;
    if (series.length >= 2) {
      const last = series[series.length - 1];
      const prev = series[series.length - 2];
      if (prev) change = ((last - prev) / prev) * 100;
    }
    latestBySymbol.set(symbol, {
      price: slot.latest.price,
      timestamp: slot.latest.timestamp,
      latestDay: slot.latest.day,
      change,
    });
  });

  return { latestBySymbol, failedCount };
}

export default function Today() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [assetTotal, setAssetTotal] = useState(0);
  const [partialFailure, setPartialFailure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [watchFilter, setWatchFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      setPartialFailure(false);
      try {
        // 一次并行发出：1 次资产 + N 次日价格，仅 1 个 RTT（原实现是「2 次 → 7 次」两批串行）
        const [assetRes, priceWindow] = await Promise.all([
          getAssets({ page: 1, pageSize: 100 }),
          loadPriceWindow(CHANGE_LOOKBACK_DAYS),
        ]);
        if (cancelled) return;

        const assets = assetRes.data || [];
        const mapped = assets.map(asset => {
          const px = priceWindow.latestBySymbol.get(asset.symbol);
          return {
            key: asset._id,
            assetId: asset._id,
            symbol: asset.symbol,
            name: asset.name || asset.symbol,
            market: asset.market,
            currency: asset.currency,
            price: px ? px.price : null,
            timestamp: px ? px.timestamp : null,
            change: px ? px.change : null,
            latestDay: px ? px.latestDay : null,
            createdAt: asset.createdAt,
            assetClass: asset.assetClass,
            watchlist: !!asset.watchlist,
            active: asset.active !== false,
            gapDays: daysSince(px ? px.timestamp : null),
          };
        });

        // 相对基准法：取同市场「有价格标的」中最新的一天作基准，只判个别标的落后。
        // 周末 / 法定假日 / 长假（全组一致停更）都不会误报，也无需在客户端复制交易日历。
        setItems(annotateGapFields(mapped));
        // 用服务端返回的总数而非本页条数，否则标的多于 100 时「共 N 个」会少报
        setAssetTotal(assetRes.pagination?.total ?? assets.length);
        setPartialFailure(priceWindow.failedCount > 0);
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, '获取今日行情失败'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(item => {
      if (q && !(item.name.toLowerCase().includes(q) || item.symbol.toLowerCase().includes(q))) return false;
      if (watchFilter === 'watch' && !item.watchlist) return false;
      if (classFilter && item.assetClass !== classFilter) return false;
      return true;
    });
  }, [items, search, watchFilter, classFilter]);

  // 仅当「一个标的都没有」时才是真正的空态；有标的但无价格不属于空态（审查 B-2）
  const isTrulyEmpty = !loading && !error && assetTotal === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 style={{ fontSize: 21, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>今日行情</h1>
        <p style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
          跨资产每日监控 · 只读快视图。一眼扫完全部持仓的最新价与涨跌幅，点击任一行下钻到「标的详情」。
        </p>
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex items-center gap-2"
          style={{ flex: 1, minWidth: 220, backgroundColor: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: radii.md, padding: '9px 12px' }}
        >
          <Search size={15} color={colors.textMuted} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="按名称 / 代码搜索…"
            style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, background: 'transparent', color: colors.textPrimary }}
          />
        </div>
        <select
          value={watchFilter}
          onChange={e => setWatchFilter(e.target.value)}
          style={{ border: `1px solid ${colors.border}`, background: colors.bgCard, borderRadius: radii.md, padding: '9px 12px', fontSize: 13, color: colors.textSecondary }}
        >
          <option value="">全部标的</option>
          <option value="watch">仅关注</option>
        </select>
        <select
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
          style={{ border: `1px solid ${colors.border}`, background: colors.bgCard, borderRadius: radii.md, padding: '9px 12px', fontSize: 13, color: colors.textSecondary }}
        >
          <option value="">全部大类</option>
          {ASSET_CLASSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: colors.textMuted }}>
          共 {filtered.length} 个标的
          {assetTotal > items.length && `（服务端共 ${assetTotal} 个，当前仅加载前 ${items.length} 个）`}
        </span>
      </div>

      {error && <div className="rounded bg-red-50 p-3 text-red-700">{error}</div>}

      {partialFailure && (
        <div
          style={{
            fontSize: 12,
            color: colors.textSecondary,
            backgroundColor: colors.bgPage,
            border: `1px solid ${colors.border}`,
            borderRadius: radii.md,
            padding: '8px 12px',
          }}
        >
          部分日期的行情加载失败，相关标的的价格或涨跌幅可能显示为「—」。可稍后刷新重试。
        </div>
      )}

      {loading ? (
        <p style={{ color: colors.textSecondary }}>加载中…</p>
      ) : isTrulyEmpty ? (
        <div style={{ textAlign: 'center', color: colors.textMuted, padding: '40px 20px', fontSize: 13 }}>
          <div style={{ fontSize: 30, marginBottom: 8, opacity: 0.5 }}>📭</div>
          还没有任何标的
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => navigate('/instruments/new')}
              className="px-3 py-1.5 text-sm rounded text-white"
              style={{ backgroundColor: colors.brand }}
            >
              去添加标的
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border bg-white" style={{ borderRadius: radii.lg, overflow: 'hidden' }}>
            <thead style={{ backgroundColor: '#FBFBFD', color: colors.textMuted }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">名称 / 代码</th>
                <th className="px-4 py-3 text-right text-xs font-semibold">最新价</th>
                <th className="px-4 py-3 text-right text-xs font-semibold">涨跌幅</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">大类</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">最近更新</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="text-sm divide-y" style={{ color: colors.textPrimary }}>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: colors.textMuted }}>
                    没有匹配的标的
                  </td>
                </tr>
              )}
              {filtered.map(item => {
                const gap = describeGap({
                  days: item.gapDays,
                  behindTradingDays: item.behindTradingDays,
                  hasPeer: item.hasPeer,
                  neverSynced: item.neverSynced,
                  // 部分日期请求失败时，不得把「没取到」误判成「没数据」
                  loadFailed: item.price == null && partialFailure,
                  // 停用标的不再参与同步，永久缺口不应持续告警
                  suppressGap: !item.active,
                  // 窗口内完全无记录时，明确告知「至少 N 天无数据」并标红，而不是退化为灰色「无数据」
                  beyondWindowDays: item.price == null ? CHANGE_LOOKBACK_DAYS : null,
                });
                const change = fmtChange(item.change);
                return (
                  <tr
                    key={item.key}
                    onClick={() => navigate(`/instruments/${item.assetId}`)}
                    style={{ cursor: 'pointer', opacity: item.active ? 1 : 0.55 }}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold" style={{ color: colors.textPrimary }}>
                        {item.name}
                        {!item.active && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: colors.textMuted }}>· 已停用</span>
                        )}
                      </div>
                      <div style={{ color: colors.textSecondary, fontSize: 12 }}>{item.symbol} · {item.market}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{fmtPrice(item.price, item.currency)}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: change.color }}>
                      {change.text}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: 11,
                          padding: '2px 9px',
                          borderRadius: 20,
                          background: colors.bgPage,
                          color: colors.textSecondary,
                          border: `1px solid ${colors.border}`,
                        }}
                      >
                        {item.assetClass ? (assetClassLabels[item.assetClass] || item.assetClass) : '未分类'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: gap.color }}>{gap.text}</td>
                    <td className="px-4 py-3 text-right">
                      {/* 用真实 Link 保证键盘可达（审查 N-8），并阻止冒泡避免二次跳转 */}
                      <Link
                        to={`/instruments/${item.assetId}`}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 12, color: colors.brand }}
                      >
                        详情 →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => navigate('/instruments')}
          className="px-3 py-2 text-sm rounded"
          style={{ border: `1px solid ${colors.border}`, backgroundColor: colors.bgCard, color: colors.textPrimary }}
        >
          查看所有标的 →
        </button>
      </div>
    </div>
  );
}
