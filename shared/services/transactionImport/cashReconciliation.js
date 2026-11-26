// 来源账户现金核对（TASK-103，Spec #93 AC-02 / AC-08）。
// 按「来源账户 + 实际现金币种」汇总跨组合的已入账流水，按现金日期归入核对期间：
// - 成交（buy / sell / div_reinvest）按券商结算日；结算日未知的成交不计入已知变动，单列于 unknownSettlement；
// - 现金类流水（分红、税、利息、划入划出、费用、换汇）有结算日用结算日，否则用活动日（报表现金到账日）；
// - 换汇两端各归本币种；两端按 (importBatchId, pairGroupId) 分组互指（显式组号可能跨文件重复）。
// 期初 / 期末余额由用户按币种提供（券商对账单数字），不落库。只有期初、期末齐备、无缺项且
// 期初 + 已知变动 = 期末时，该币种才标记「余额已核对」。
// 规则 10：只按币种分别计算，不做任何跨币种合计；规则 2：缺余额时计算值为 null，不按 0 处理。
// 可见性：只读已入账流水（visibility.js）；未完成提交残留的 pending 行只作为「流水不完整」缺项计数。

const mongoose = require('mongoose');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const Transaction = require('../../models/transaction');
const Portfolio = require('../../models/portfolio');
const SourceAccount = require('../../models/sourceAccount');
const ImportBatch = require('../../models/importBatch');
const { ASSET_CURRENCIES } = require('../../constants/asset.constants');
const { CASH_ACTIONS, PAIRED_ACTIONS } = require('../../constants/transaction.constants');
const { visibleQuery } = require('../transaction/visibility');
const { toView } = require('./sourceAccount.service');
const { businessError } = require('./common');

dayjs.extend(utc);
dayjs.extend(timezone);

// 有现金效果、须按结算日核对的成交动作（拆股、证券划转无现金效果，不参与）。
const SETTLED_TRADE_ACTIONS = Object.freeze(['buy', 'sell', 'div_reinvest']);
// 结算日未知的成交：成交日落在 [from − 回看天数, to] 内即可能在期间内结算，单列。
const SETTLEMENT_LOOKBACK_DAYS = 10;

// 现金日期规则（Human 决定 7）：随核对结果返回，界面原样展示，前端不另写一份规则文字。
const CASH_DATE_RULES = Object.freeze([
  { code: 'TRADE_SETTLEMENT_DATE', text: '买入、卖出、分红再投按券商结算日计入；结算日未知的成交单列，不计入已知变动。' },
  { code: 'CASH_ACTIVITY_DATE', text: '分红、税款、利息、现金划入划出、费用、换汇：报表有结算日用结算日，没有结算日按活动日（报表日期）计入，不视为结算日未知。' }
]);
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIME_ZONE = process.env.MARKET_TIMEZONE || 'America/Toronto';

const STATUS_LABELS = Object.freeze({ reconciled: '余额已核对', unreconciled: '未核对' });


function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100 || 0;
}

function isDay(value) {
  return typeof value === 'string' && DAY_PATTERN.test(value) && dayjs.utc(value).format('YYYY-MM-DD') === value;
}

function utcDay(value) {
  return value ? dayjs.utc(value).format('YYYY-MM-DD') : null;
}

// 活动日：仅日期的流水存当日 UTC 零点；有时刻的流水按其时区（缺省 MARKET_TIMEZONE）取本地日。
function activityDay(tx) {
  if (!tx.date) return null;
  if (tx.dateKind === 'datetime') return dayjs(tx.date).tz(tx.timeZone || DEFAULT_TIME_ZONE).format('YYYY-MM-DD');
  return utcDay(tx.date);
}

function cashCurrencyOf(tx) {
  return tx.cashCurrency || tx.currency;
}

function hasCashAmount(tx) {
  return typeof tx.cashAmount === 'number' && Number.isFinite(tx.cashAmount);
}

function settlementKnown(tx) {
  return tx.settlementStatus !== 'unknown' && Boolean(tx.settlementDate);
}

function pairKeyOf(tx) {
  if (!PAIRED_ACTIONS.includes(tx.action) || !tx.pairGroupId) return null;
  return `${tx.source?.importBatchId ? String(tx.source.importBatchId) : '-'}:${tx.pairGroupId}`;
}

function parseBalance(value, path) {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw businessError(400, 'INVALID_BALANCE', `余额必须为数字：${path}`);
  return number;
}

function parseInput(input = {}) {
  const { from, to } = input;
  if (!isDay(from) || !isDay(to) || from > to) {
    throw businessError(400, 'INVALID_PERIOD', '核对期间须为 YYYY-MM-DD，且 from 不晚于 to');
  }
  const balances = {};
  const raw = input.balances ?? {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw businessError(400, 'INVALID_BALANCE', 'balances 须为按币种的对象');
  for (const [currency, entry] of Object.entries(raw)) {
    if (!ASSET_CURRENCIES.includes(currency)) {
      throw businessError(400, 'INVALID_CURRENCY', `币种须为 ${ASSET_CURRENCIES.join(' / ')} 之一：${currency}`);
    }
    if (entry !== null && (typeof entry !== 'object' || Array.isArray(entry))) {
      throw businessError(400, 'INVALID_BALANCE', `balances.${currency} 须为 {opening, closing}`);
    }
    balances[currency] = {
      opening: parseBalance(entry?.opening, `balances.${currency}.opening`),
      closing: parseBalance(entry?.closing, `balances.${currency}.closing`)
    };
  }
  return { from, to, balances };
}

function itemView(tx, extra, portfolioNames) {
  return {
    id: String(tx._id),
    portfolioId: String(tx.portfolioId),
    portfolioName: portfolioNames.get(String(tx.portfolioId)) ?? null,
    action: tx.action,
    symbol: tx.symbol || null,
    tradeDate: activityDay(tx),
    settlementDate: utcDay(tx.settlementDate),
    settlementStatus: tx.settlementStatus || null,
    cashAmount: hasCashAmount(tx) ? tx.cashAmount : null,
    cashAmountSource: tx.cashAmountSource || null,
    rowNumber: tx.source?.rowNumber ?? null,
    importBatchId: tx.source?.importBatchId ? String(tx.source.importBatchId) : null,
    ...extra
  };
}

function sortItems(items) {
  return items.sort((a, b) => String(a.cashDate ?? a.tradeDate).localeCompare(String(b.cashDate ?? b.tradeDate)) ||
    String(a.tradeDate).localeCompare(String(b.tradeDate)) || a.id.localeCompare(b.id));
}

/**
 * 核对一个来源账户在 [from, to]（含两端，按现金日期）内各币种的已结算现金。
 * input = { from, to, balances?: { <币种>: { opening?, closing? } } }
 */
async function reconcileCash(sourceAccountId, input) {
  if (!mongoose.Types.ObjectId.isValid(sourceAccountId)) {
    throw businessError(400, 'INVALID_SOURCE_ACCOUNT_ID', 'Invalid source account ID');
  }
  const { from, to, balances } = parseInput(input);
  const account = await SourceAccount.findById(sourceAccountId).lean();
  if (!account) throw businessError(404, 'SOURCE_ACCOUNT_NOT_FOUND', 'Source account not found');

  const [visible, pending, batches] = await Promise.all([
    Transaction.find(visibleQuery({ sourceAccountId })).lean(),
    Transaction.find({ sourceAccountId, status: 'pending' }).lean(),
    ImportBatch.find({ sourceAccountId }).lean()
  ]);

  const portfolioIds = [...new Set(visible.map(tx => String(tx.portfolioId)))];
  const portfolios = portfolioIds.length ? await Portfolio.find({ _id: { $in: portfolioIds } }).lean() : [];
  const portfolioNames = new Map(portfolios.map(doc => [String(doc._id), doc.name]));

  // 换汇两端按 (导入批次, 组号) 分组；在全部可见流水中找对端（对端可落在期间外）
  const pairs = new Map();
  for (const tx of visible) {
    const key = pairKeyOf(tx);
    if (key) pairs.set(key, [...(pairs.get(key) || []), tx]);
  }

  const buckets = new Map();
  const bucket = (currency) => {
    if (!buckets.has(currency)) {
      buckets.set(currency, { items: [], unknownSettlement: [], cashAmountMissing: [], fxIncomplete: [], pending: 0 });
    }
    return buckets.get(currency);
  };
  const lookbackFrom = dayjs.utc(from).subtract(SETTLEMENT_LOOKBACK_DAYS, 'day').format('YYYY-MM-DD');
  const inPeriod = day => day !== null && day >= from && day <= to;

  for (const tx of visible) {
    const isTrade = SETTLED_TRADE_ACTIONS.includes(tx.action);
    if (!isTrade && !CASH_ACTIONS.includes(tx.action)) continue;
    // 分红再投未记券商现金额：分红与再投抵消，无现金效果
    if (tx.action === 'div_reinvest' && !hasCashAmount(tx)) continue;
    const currency = cashCurrencyOf(tx);
    const tradeDay = activityDay(tx);

    if (isTrade && !settlementKnown(tx)) {
      if (tradeDay >= lookbackFrom && tradeDay <= to) {
        bucket(currency).unknownSettlement.push(itemView(tx, { cashDate: null, cashDateBasis: null }, portfolioNames));
      }
      continue;
    }
    const basis = settlementKnown(tx) ? 'settlement' : 'activity';
    const cashDate = basis === 'settlement' ? utcDay(tx.settlementDate) : tradeDay;
    if (!inPeriod(cashDate)) continue;

    const target = bucket(currency);
    if (!hasCashAmount(tx)) {
      target.cashAmountMissing.push(itemView(tx, { cashDate, cashDateBasis: basis }, portfolioNames));
      continue;
    }
    let pair = null;
    const key = pairKeyOf(tx);
    if (key) {
      const legs = pairs.get(key);
      const other = legs.length === 2 ? legs.find(leg => String(leg._id) !== String(tx._id)) : null;
      pair = {
        key,
        groupId: tx.pairGroupId,
        counterpart: other
          ? { id: String(other._id), currency: cashCurrencyOf(other), cashAmount: hasCashAmount(other) ? other.cashAmount : null }
          : null
      };
      if (!other) target.fxIncomplete.push(String(tx._id));
    }
    target.items.push(itemView(tx, { cashDate, cashDateBasis: basis, pair }, portfolioNames));
  }

  for (const tx of pending) bucket(cashCurrencyOf(tx)).pending += 1;
  for (const currency of Object.keys(balances)) bucket(currency);

  // 被拆批推迟的行：同组合同文件最近一次确认仍有 deferred → 期间流水可能不完整（无法判定币种，计入全部币种）
  const latestByFile = new Map();
  for (const batch of batches.filter(item => item.status === 'committed')) {
    const key = `${batch.portfolioId}:${batch.fileName ?? ''}`;
    const previous = latestByFile.get(key);
    if (!previous || new Date(batch.createdAt) > new Date(previous.createdAt)) latestByFile.set(key, batch);
  }
  const deferredBatches = [...latestByFile.values()].filter(batch => Number(batch.counts?.deferred) > 0);
  const deferredRows = deferredBatches.reduce((sum, batch) => sum + Number(batch.counts.deferred), 0);

  const currencies = [...buckets.keys()].sort().map(currency => {
    const data = buckets.get(currency);
    const items = sortItems(data.items);
    const knownChange = roundMoney(items.reduce((sum, item) => sum + item.cashAmount, 0));
    const opening = balances[currency]?.opening ?? null;
    const closing = balances[currency]?.closing ?? null;
    const computedClosing = opening === null ? null : roundMoney(opening + knownChange);
    const difference = closing === null || computedClosing === null ? null : roundMoney(closing - computedClosing);

    const missing = [];
    if (opening === null) missing.push({ code: 'OPENING_BALANCE_MISSING', reason: '缺少期初余额（券商对账单）' });
    if (closing === null) missing.push({ code: 'CLOSING_BALANCE_MISSING', reason: '缺少券商期末余额' });
    if (data.unknownSettlement.length) {
      missing.push({ code: 'SETTLEMENT_UNKNOWN', reason: '有成交结算日未知，无法判断是否在期间内结算', count: data.unknownSettlement.length });
    }
    if (data.cashAmountMissing.length) {
      missing.push({ code: 'CASH_AMOUNT_MISSING', reason: '有流水缺少现金金额', count: data.cashAmountMissing.length });
    }
    if (data.fxIncomplete.length) {
      missing.push({ code: 'FX_PAIR_INCOMPLETE', reason: '换汇缺少另一端流水', count: data.fxIncomplete.length });
    }
    if (data.pending) {
      missing.push({ code: 'IMPORT_PENDING', reason: '有未完成提交的导入流水（不可见），期间流水不完整', count: data.pending });
    }
    if (deferredRows) {
      missing.push({ code: 'IMPORT_DEFERRED', reason: '有导入因拆批尚未入账的流水，期间流水可能不完整', count: deferredRows });
    }
    if (difference !== null && difference !== 0) {
      missing.push({ code: 'BALANCE_MISMATCH', reason: '计算期末与券商期末余额不一致', difference });
    }

    const byPortfolio = new Map();
    for (const item of items) {
      const entry = byPortfolio.get(item.portfolioId) ||
        { portfolioId: item.portfolioId, portfolioName: item.portfolioName, knownChange: 0, count: 0 };
      entry.knownChange = roundMoney(entry.knownChange + item.cashAmount);
      entry.count += 1;
      byPortfolio.set(item.portfolioId, entry);
    }

    const status = opening !== null && closing !== null && missing.length === 0 ? 'reconciled' : 'unreconciled';
    return {
      currency,
      status,
      statusLabel: STATUS_LABELS[status],
      openingBalance: opening,
      closingBalance: closing,
      knownChange,
      computedClosing,
      difference,
      missing,
      portfolios: [...byPortfolio.values()],
      items,
      unknownSettlement: sortItems(data.unknownSettlement),
      incomplete: sortItems(data.cashAmountMissing)
    };
  });

  return {
    sourceAccount: toView(account),
    period: { from, to },
    cashDateRules: CASH_DATE_RULES,
    reconciled: currencies.length > 0 && currencies.every(entry => entry.status === 'reconciled'),
    currencies
  };
}

module.exports = { reconcileCash, SETTLED_TRADE_ACTIONS, SETTLEMENT_LOOKBACK_DAYS, CASH_DATE_RULES };
