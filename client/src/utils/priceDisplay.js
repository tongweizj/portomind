// 价格展示口径统一（TASK-043 独立审查 N-6）
// 目的：Today 与 AssetDetail 曾各持一份 CURRENCY_META / fmtPrice / daysSince / gapLabel，
// 口径漂移风险高（例如缺口阈值只改一处）。此处为唯一实现。
import { ASSET_CLASSES } from '../constants/enums';
import { colors } from '../constants/design-tokens';

// 缺口阈值：**落后同市场基准的工作日数** ≥ 该值，才判为数据缺口并标红。
//
// 为什么不是「自然日差 >= 3」（2026-10-18 Human 裁定）：
// 价格同步 cron 每天 03:00 America/Toronto 执行（`cron-worker/src/schedulers/priceScheduler.js`），
// 周一 03:00 只能拿到上周五收盘，周一收盘要等周二 03:00 才入库。
// 若按自然日差，US/CA 标的每周一（乃至周二凌晨）都会整表误标红，告警迅速失去可信度。
//
// 最终采用「相对基准法」：同一市场的标的由同一次 cron 同步，正常情况下最新日期应当一致；
// 因此只在**个别标的落后于同市场基准**时才判缺口。这样周末、法定假日、长假（全体一致停更）
// 都不会误报，且不需要在客户端复制交易日历。详见 ExecPlan §10.7 / §10.8。
export const GAP_THRESHOLD_DAYS = 3;

// 涨跌幅回看窗口（日历日）。取 14 天而非 7 天：
// 中国春节/国庆休市常达 9–10 个日历日，7 天窗口会让节后所有 CN 标的涨跌幅退化为「—」。
export const CHANGE_LOOKBACK_DAYS = 14;

export const assetClassLabels = Object.fromEntries(ASSET_CLASSES.map(o => [o.value, o.label]));

const CURRENCY_META = {
  USD: { symbol: '$', digits: 2 },
  CAD: { symbol: 'C$', digits: 2 },
  CNY: { symbol: '¥', digits: 3 },
  HKD: { symbol: 'HK$', digits: 2 },
};

export function currencyMeta(currency) {
  return CURRENCY_META[currency] || { symbol: '', digits: 2 };
}

export function fmtPrice(value, currency) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const meta = currencyMeta(currency);
  return `${meta.symbol}${Number(value).toFixed(meta.digits)}`;
}

/** 距今整天数。未来时间戳（时区误差）归为 0，不产生负数。 */
export function daysSince(timestamp) {
  if (!timestamp) return null;
  const diff = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, Math.floor(diff / 86400000));
}

/**
 * 统计 (from, to] 区间内的周一~周五天数。
 *
 * 只排除周末、不排除法定假日，是**刻意**的：相对基准法下同一市场的标的一起休市，
 * 基准日会同步后退，假日不会造成组内偏差；只有组内个别标的落后才会被计数。
 */
export function weekdaysBetween(fromTs, toTs) {
  const from = new Date(fromTs);
  const to = new Date(toTs);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return null;
  if (to <= from) return 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  let count = 0;
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

/**
 * 为标的列表补充缺口判定所需的派生字段。
 *
 * 抽成纯函数的目的：让「相对基准法」可被独立测试（此前把逻辑内联在 Today 里，
 * 无法脱离 React 验证，只能靠人眼推演）。
 *
 * @param {Array<{market?:string, latestDay?:string|null, price?:number|null, createdAt?:string}>} items
 * @returns {Array} 原数组元素的浅拷贝，追加 hasPeer / behindTradingDays / neverSynced
 */
export function annotateGapFields(items) {
  // 市场标识归一化：避免 'us' / 'US ' 之类导致分组失效
  const marketOf = (item) => String(item.market || '').trim().toUpperCase();
  const todayStr = localDateStr(0);
  // 忽略「未来日期」——一条脏数据（如 2099-01-01）会把基准抬高，进而让整个市场变红
  const usableDay = (day) => (day && day <= todayStr ? day : null);

  const baselineByMarket = new Map();
  const peerCountByMarket = new Map();

  items.forEach(item => {
    const market = marketOf(item);
    const day = usableDay(item.latestDay);
    if (!market || !day) return;
    peerCountByMarket.set(market, (peerCountByMarket.get(market) || 0) + 1);
    const current = baselineByMarket.get(market);
    if (!current || day > current) baselineByMarket.set(market, day);
  });

  return items.map(item => {
    const market = marketOf(item);
    const day = usableDay(item.latestDay);
    const baseline = market ? baselineByMarket.get(market) : null;
    const createdDays = daysSince(item.createdAt);
    return {
      ...item,
      hasPeer: (peerCountByMarket.get(market) || 0) >= 2,
      behindTradingDays: day && baseline && day < baseline ? weekdaysBetween(day, baseline) : 0,
      neverSynced: item.price == null && createdDays != null && createdDays < GAP_THRESHOLD_DAYS,
    };
  });
}

/**
 * 生成缺口/新鲜度标签。
 *
 * @param {object} [params]
 * @param {number|null} [params.days] 距最新记录的自然日差；null 表示回溯窗口内无数据
 * @param {number|null} [params.behindTradingDays] 落后于同市场基准的工作日数
 * @param {boolean} [params.hasPeer] 同市场是否存在其他标的可作为基准
 * @param {boolean} [params.neverSynced] 从未同步过（新建标的）
 * @param {boolean} [params.loadFailed] 数据加载失败（不得误判为缺口）
 * @param {boolean} [params.suppressGap] 停用标的（不再参与同步，不应持续告警）
 * @param {number|null} [params.beyondWindowDays] 窗口内无数据时用于生成「≥N 天无数据」
 */
export function describeGap({
  days = null,
  behindTradingDays = null,
  hasPeer = false,
  neverSynced = false,
  loadFailed = false,
  suppressGap = false,
  beyondWindowDays = null,
} = {}) {
  if (loadFailed) return { text: '加载失败', color: colors.textMuted, isGap: false };

  if (suppressGap) {
    return { text: days == null ? '已停用' : `已停用 · ${days} 天前`, color: colors.textMuted, isGap: false };
  }

  if (days == null) {
    if (neverSynced) return { text: '尚未同步', color: colors.textMuted, isGap: false };
    if (beyondWindowDays != null) {
      // 「近 N 天无数据」而非「≥N 天」：资产可能只创建了 3 天就从未同步成功，
      // 此时说「≥14 天无数据」是事实性错误（审查 B2）
      return { text: `近 ${beyondWindowDays} 天无数据 · 缺口`, color: colors.up, isGap: true };
    }
    return { text: '无数据', color: colors.textMuted, isGap: false };
  }

  if (days <= 0) return { text: '今天', color: colors.textMuted, isGap: false };

  const text = `${days} 天前`;

  // 相对基准：仅当该市场存在可比的同组标的、且落后达到阈值时才判缺口。
  // 无同组标的时不做缺口判定（宁可少报不可错报），避免单一标的的自比较造成误报。
  if (!hasPeer || behindTradingDays == null) {
    return { text, color: colors.textMuted, isGap: false };
  }
  if (behindTradingDays >= GAP_THRESHOLD_DAYS) {
    return { text: `${text} · 缺口`, color: colors.up, isGap: true };
  }
  return { text, color: colors.textMuted, isGap: false };
}

/**
 * 涨跌幅展示。0 值用中性色（原实现「▲ 0.00%」标红会把持平误读为上涨）。
 * 注意：本系统的红涨绿跌为中国市场惯例。
 */
export function fmtChange(change) {
  if (change == null || Number.isNaN(Number(change))) {
    return { text: '—', color: colors.textMuted };
  }
  const value = Number(change);
  if (value === 0) return { text: '0.00%', color: colors.textMuted };
  const arrow = value > 0 ? '▲' : '▼';
  return {
    text: `${arrow} ${Math.abs(value).toFixed(2)}%`,
    color: value > 0 ? colors.up : colors.down,
  };
}

/** 生成本地日历日字符串 YYYY-MM-DD，offsetDays 为回溯天数。 */
export function localDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * RMB 金额展示：`¥` + 千分位 + 最多 2 位小数；`null`/`undefined` 显示「—」。
 *
 * TASK-049：从 `pages/Family.jsx` 的本地实现抽为唯一源头，供首页总资产卡与
 * `/family` 共用（AC2「同源同格式」）。`Family.jsx` 的本地副本按 R7 暂留，
 * 去重随 TASK-050 删除该页时一并处理。
 */
export function formatCny(value) {
  if (value == null) return '—';
  return `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}
