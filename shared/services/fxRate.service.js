// server/services/fxRate.service.js
// 汇率服务（PRD §3 前置）：最新汇率查询 / 每日采集 / 手动录入。
// - getLatestRates：各外币对 CNY 最新汇率（缺失币种不进结果，家庭汇总侧显式标缺）；
// - syncLatestRates：从公开源采集（er-api，免费免 key）逐币种 upsert；失败抛错由调度降级；
// - upsertRate：按 (currency, date) 幂等写入，手动录入 source='manual'。
const axios = require('axios');
const FxRate = require('../models/fxRate');
const { logger } = require('../config/logger');

const SUPPORTED_CURRENCIES = ['USD', 'CAD', 'HKD'];
const PROVIDER_URL = 'https://open.er-api.com/v6/latest/CNY';
const REQUEST_TIMEOUT_MS = 15000;

/**
 * 各外币对 CNY 最新汇率。
 * @param {Date} [now] 测试可注入
 * @returns {Promise<{USD?:number, CAD?:number, HKD?:number}>} 缺失币种不出现
 */
async function getLatestRates(now = new Date()) {
  const docs = await FxRate.find({ date: { $lte: now } })
    .sort({ date: -1, _id: -1 })
    .lean();
  const latestByCurrency = new Map();
  for (const doc of docs) {
    if (!latestByCurrency.has(doc.currency)) latestByCurrency.set(doc.currency, doc);
  }
  const result = {};
  for (const currency of SUPPORTED_CURRENCIES) {
    const doc = latestByCurrency.get(currency);
    if (doc) result[currency] = Number(doc.rateToCny);
  }
  return result;
}

/** 最新汇率详情（含日期与来源，前端展示/维护用）。 */
async function getLatestRateDocs() {
  const docs = await FxRate.find().sort({ date: -1, _id: -1 }).lean();
  const latestByCurrency = new Map();
  for (const doc of docs) {
    if (!latestByCurrency.has(doc.currency)) latestByCurrency.set(doc.currency, doc);
  }
  return SUPPORTED_CURRENCIES
    .filter(currency => latestByCurrency.has(currency))
    .map(currency => latestByCurrency.get(currency));
}

/** 按 (currency, date) 幂等写入。 */
async function upsertRate({ currency, rateToCny, date = new Date(), source = 'manual', note = '' }) {
  const normalized = String(currency).toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(normalized)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  const rate = Number(rateToCny);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('rateToCny must be a positive number');
  }
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const doc = await FxRate.findOneAndUpdate(
    { currency: normalized, date: dayStart },
    { $set: { rateToCny: rate, source, note: note || '' } },
    { new: true, upsert: true, runValidators: true }
  );
  return doc;
}

/**
 * 从公开源采集（er-api：https://open.er-api.com/v6/latest/CNY）。
 *
 * ⚠️ 方向：该接口以 **CNY 为 base**，返回的 `rates.USD` 是「1 CNY = X 外币」（约 0.149）。
 * 而本项目 `rateToCny` 的语义是「1 外币 = X CNY」（见 `models/fxRate.js`、手动录入、
 * `familySummary.service` 的 `amount * rate`）。因此这里必须取倒数后再返回，
 * 否则家庭折算会反向（TASK-051）。
 *
 * 返回 { USD, CAD, HKD } 各币种对 CNY 汇率；请求失败或值非法抛错
 * （调度层记日志，不中断服务）。http 可注入（测试用）。
 */
async function fetchFromProvider(http = axios) {
  const response = await http.get(PROVIDER_URL, { timeout: REQUEST_TIMEOUT_MS });
  const rates = response.data && response.data.rates;
  if (!rates) {
    throw new Error(`FxRate provider returned invalid payload for CNY base`);
  }
  const result = {};
  for (const currency of SUPPORTED_CURRENCIES) {
    // perCny = 1 CNY 折合多少外币；取倒数得到 rateToCny = 1 外币 折合多少 CNY
    const perCny = Number(rates[currency]);
    if (!Number.isFinite(perCny) || perCny <= 0) {
      throw new Error(`FxRate provider returned invalid rate for ${currency}: ${rates[currency]}`);
    }
    result[currency] = 1 / perCny;
  }
  return result;
}

/** 采集并入库最新汇率。 */
async function syncLatestRates({ date = new Date(), http } = {}) {
  const fetched = await fetchFromProvider(http);
  const upserted = [];
  for (const currency of SUPPORTED_CURRENCIES) {
    const doc = await upsertRate({
      currency,
      rateToCny: fetched[currency],
      date,
      source: 'er-api',
      note: `auto-sync ${date.toISOString().slice(0, 10)}`
    });
    upserted.push({ currency: doc.currency, rateToCny: doc.rateToCny, date: doc.date });
  }
  logger.info('FX_RATE_SYNC_DONE', { date: date.toISOString().slice(0, 10), count: upserted.length });
  return upserted;
}

module.exports = {
  SUPPORTED_CURRENCIES,
  getLatestRates,
  getLatestRateDocs,
  upsertRate,
  syncLatestRates,
  fetchFromProvider
};
