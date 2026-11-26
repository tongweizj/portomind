// 候选行准备（代码审查 T5 自 index.js 拆出）：资产解析（裸代码 / 市场后缀 / 跨币种成交换算）、
// 佣金决议与现金净额推导、内容摘要 rawHash。

const Asset = require('../../models/asset');
const { toStorageSymbol, marketFromSuffix, normalizeSymbol } = require('../../utils/symbol');
const standardCsv = require('./standardCsv');
const { sha256, markError, markReview } = require('./common');

async function resolveAssets(rows) {
  const storageSymbols = new Set();
  for (const row of rows) {
    if (row.disposition !== 'pending') continue;
    const { rawSymbol, market } = row.candidate;
    // 无标的的现金流水（利息、划转、独立费用等）：不解析资产，币种即现金币种
    if (!rawSymbol && row.candidate.kind === 'cash') {
      row.candidate.symbol = null;
      row.asset = null;
      continue;
    }
    // 原格式报表的裸代码（无后缀、无市场列，#100）：在候选市场的已有资产中唯一解析，见下方
    if (!market && !marketFromSuffix(rawSymbol) && row.candidate.marketCandidates) {
      row.candidate.symbolOptions = row.candidate.marketCandidates
        .map(candidateMarket => toStorageSymbol(normalizeSymbol(rawSymbol), candidateMarket));
      row.candidate.symbolOptions.forEach(symbol => storageSymbols.add(symbol));
      continue;
    }
    const effectiveMarket = market || marketFromSuffix(rawSymbol);
    if (!effectiveMarket) {
      markError(row, 'MARKET_REQUIRED', `标的 ${rawSymbol} 无市场后缀，需填写 market`);
      continue;
    }
    if (market && marketFromSuffix(rawSymbol) && marketFromSuffix(rawSymbol) !== market) {
      markError(row, 'MARKET_MISMATCH', `标的 ${rawSymbol} 的后缀与 market=${market} 不一致`);
      continue;
    }
    row.candidate.symbol = toStorageSymbol(normalizeSymbol(rawSymbol), effectiveMarket);
    storageSymbols.add(row.candidate.symbol);
  }
  const assets = storageSymbols.size
    ? await Asset.find({ symbol: { $in: [...storageSymbols] } }).lean()
    : [];
  const bySymbol = new Map(assets.map(asset => [asset.symbol, asset]));
  for (const row of rows) {
    if (row.disposition !== 'pending' || !row.candidate.symbolOptions) continue;
    // 报表给出证券交易币种（#102 Questrade）时，只接受币种一致的资产
    const listingCurrency = row.candidate.listingCurrency;
    const found = row.candidate.symbolOptions.filter(symbol => bySymbol.has(symbol) &&
      (!listingCurrency || bySymbol.get(symbol).currency === listingCurrency));
    if (found.length === 1) { row.candidate.symbol = found[0]; continue; }
    if (found.length > 1) {
      markError(row, 'MARKET_AMBIGUOUS', `标的 ${row.candidate.rawSymbol} 在多个市场都有资产（${found.join(' / ')}），报表无法区分`);
    } else {
      markError(row, 'ASSET_NOT_FOUND', `资产 ${row.candidate.symbolOptions.join(' 或 ')}${listingCurrency ? `（${listingCurrency}）` : ''} 不存在，请先在资产管理中添加或提供代码映射`);
    }
  }
  for (const row of rows) {
    if (row.disposition !== 'pending' || !row.candidate.symbol) continue;
    const asset = bySymbol.get(row.candidate.symbol);
    if (!asset) { markError(row, 'ASSET_NOT_FOUND', `资产 ${row.candidate.symbol} 不存在，请先在资产管理中添加`); continue; }
    if (!asset.active) { markError(row, 'ASSET_INACTIVE', `资产 ${row.candidate.symbol} 已停用`); continue; }
    // 现金类流水保留实际现金币种（可与资产币种不同，如美股分红以 CAD 入账）；
    // 影响持仓成本的跨币种成交：报表给出汇率时（#100 Wealthsimple 描述中的 FX Rate）把单价 / 佣金换回资产币种，
    // 现金净额仍为现金币种；报表没有汇率则不猜，报错。
    // 拆股行（TASK-098）可不填币种；填写时须与资产币种一致（拆股不做汇率换算）。
    // 划转行（TASK-099）不涉及现金，不核对成交币种。
    if (row.candidate.kind !== 'cash' && !row.candidate.isTransfer &&
        (row.candidate.action !== 'split' || row.candidate.cashCurrency) &&
        asset.currency !== row.candidate.cashCurrency) {
      if (!row.candidate.reportFxRate || row.candidate.action === 'split') {
        markError(row, 'CURRENCY_MISMATCH', `成交币种 ${row.candidate.cashCurrency} 与资产币种 ${asset.currency} 不一致，且报表未给出汇率（跨币种成交需要报表汇率）`);
        continue;
      }
      standardCsv.convertTradeToAssetCurrency(row.candidate, row.candidate.reportFxRate);
    }
    row.asset = { type: asset.type, market: asset.market, currency: asset.currency };
  }
}

function rawHashOf(candidate) {
  return sha256([
    candidate.action, candidate.symbol, new Date(candidate.date).toISOString(), candidate.dateKind,
    candidate.quantity, candidate.price, candidate.fee, candidate.cashAmount, candidate.cashCurrency,
    candidate.externalId, candidate.splitRatio ?? null
  ]);
}

// 佣金确定（券商 / 推算 / 补值 / 确认按零）后，缺券商净额的成交行按数量 × 单价 ± 佣金推算净额。
function applyCashDerivation(row) {
  standardCsv.deriveCashAmount(row.candidate);
  row.candidate.cashDifference = standardCsv.cashDifferenceOf(row.candidate);
}

// 佣金未知：需用户补值（fee）或明确按零（confirmZeroFee）。决议后成为 user / confirmed_zero。
function applyFeeResolution(row, resolution) {
  if (row.candidate.fee !== null) return;
  if (resolution && resolution.confirmZeroFee === true) {
    row.candidate.fee = 0;
    row.candidate.feeSource = 'confirmed_zero';
    return;
  }
  if (resolution && resolution.fee !== undefined) {
    const fee = Number(resolution.fee);
    if (Number.isFinite(fee) && fee >= 0) {
      row.candidate.fee = fee;
      row.candidate.feeSource = 'user';
      return;
    }
  }
  markReview(row, 'FEE_UNKNOWN', '佣金缺失且无法由现金净额推导：请补填佣金或确认按 0 处理', ['fee', 'confirmZeroFee', 'skip']);
}

module.exports = { resolveAssets, rawHashOf, applyCashDerivation, applyFeeResolution };
