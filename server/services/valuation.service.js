// server/services/valuation.service.js
// 估值分位服务（AS-11）：最新分位查询 / 手动录入。
// 衔接 index-valuation-selfcalc 产出：用户自算（或外部渠道获取）的 PE/PB 历史分位
// 手动录入后，即可作为 valuation_percentile 提醒规则（AL-10）的评估输入。
const Valuation = require('../models/valuation');
const { logger } = require('../config/logger');

const INDEX_METRICS = ['pe', 'pb'];

/**
 * 最新估值分位（每 indexCode+metric 取日期最近一条）。
 * @returns {Promise<Array>} 估值文档数组
 */
async function getLatestValuations() {
  const docs = await Valuation.find().sort({ date: -1, _id: -1 }).lean();
  const latest = new Map();
  for (const doc of docs) {
    const key = `${doc.indexCode}:${doc.metric}`;
    if (!latest.has(key)) latest.set(key, doc);
  }
  return [...latest.values()].sort((left, right) =>
    left.indexCode.localeCompare(right.indexCode) || left.metric.localeCompare(right.metric));
}

/** 指定 (indexCode, metric) 的最新分位；无数据返回 null。 */
async function getLatestValuation(indexCode, metric) {
  const doc = await Valuation
    .findOne({ indexCode: String(indexCode).toUpperCase(), metric })
    .sort({ date: -1, _id: -1 })
    .lean();
  return doc || null;
}

/** 手动录入（按 (indexCode, metric, date) 幂等 upsert）。 */
async function upsertValuation({ indexCode, indexName = '', metric, value, percentile, date = new Date(), source = 'manual', note = '' }) {
  const normalizedCode = String(indexCode).trim().toUpperCase();
  if (!INDEX_METRICS.includes(metric)) {
    throw new Error(`metric must be one of: ${INDEX_METRICS.join(', ')}`);
  }
  const val = Number(value);
  const pct = Number(percentile);
  if (!Number.isFinite(val) || val < 0) throw new Error('value must be a non-negative number');
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error('percentile must be between 0 and 100');
  }
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const doc = await Valuation.findOneAndUpdate(
    { indexCode: normalizedCode, metric, date: dayStart },
    {
      $set: {
        indexName: indexName || '',
        value: val,
        percentile: pct,
        source,
        note: note || ''
      }
    },
    { new: true, upsert: true, runValidators: true }
  );
  logger.info('VALUATION_UPSERTED', {
    indexCode: normalizedCode, metric, percentile: pct, date: dayStart.toISOString().slice(0, 10)
  });
  return doc;
}

module.exports = { INDEX_METRICS, getLatestValuations, getLatestValuation, upsertValuation };
