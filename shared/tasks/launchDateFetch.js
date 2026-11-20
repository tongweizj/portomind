const Asset = require('../models/asset');
const { getActiveAssets } = require('../services/asset.service');
const { fetchLaunchDate } = require('../fetchers/launchDateFetcher');

async function backfillLaunchDates({ apply = false, dependencies = {} } = {}) {
  const { listAssets = getActiveAssets, fetchDate = fetchLaunchDate, updateOne = filterMissingDate } = dependencies;
  const assets = await listAssets();
  const results = [];
  for (const asset of assets) {
    const { symbol, market } = asset;
    if (asset.launchDate != null) {
      results.push({ symbol, market, status: 'PRESERVED' });
      continue;
    }
    try {
      const found = await fetchDate(asset);
      if (!found.launchDate) {
        results.push({ symbol, market, status: 'UNKNOWN', ...found });
        continue;
      }
      const status = apply
        ? ((await updateOne(asset, found.launchDate)).modifiedCount === 1 ? 'UPDATED' : 'UNCHANGED')
        : 'PREVIEW';
      results.push({ symbol, market, status, ...found });
    } catch (error) {
      const reason = error.category || 'INTERNAL';
      results.push({ symbol, market, status: 'FAILED', provider: error.provider, reason });
    }
  }
  return { total: assets.length, results };
}

function filterMissingDate(asset, launchDate) {
  const { _id, symbol, market } = asset;
  return Asset.updateOne({ _id, symbol, market, active: true, launchDate: null }, { $set: { launchDate } });
}

module.exports = { backfillLaunchDates };
