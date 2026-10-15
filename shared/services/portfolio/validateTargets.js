const { ASSET_CLASSES } = require('../../constants/asset.constants');

const RATIO_TOLERANCE = 1e-6;
const ASSET_CLASS_SET = new Set(ASSET_CLASSES);

function targetError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'INVALID_PORTFOLIO_TARGETS';
  return error;
}

/**
 * 目标配置规范化（保存前调用，与 validateTargets 配套）：
 * - level='asset'：symbol 统一大写（资产代码约定）；
 * - level='asset_class'：symbol 统一小写（大类代码约定）。
 * @returns {Array} 规范化后的 targets（含 level 兜底 'asset'）
 */
function normalizeTargets(targets) {
  if (!Array.isArray(targets)) return targets;
  return targets.map(target => {
    const level = target.level === 'asset_class' ? 'asset_class' : 'asset';
    const symbol = String(target.symbol || '').trim();
    return {
      symbol: level === 'asset_class' ? symbol.toLowerCase() : symbol.toUpperCase(),
      targetRatio: Number(target.targetRatio),
      level
    };
  });
}

/**
 * 校验目标配置（CM-08 支持大类层级）。
 * - 每项目标：symbol 必填唯一、targetRatio 0-100、level ∈ ['asset','asset_class']；
 * - level='asset_class'：symbol 必须是大类代码（equity/bond/gold/cash，大小写不敏感）；
 * - 混合模式禁止：存在任一大类目标 → 全部必须为大类目标（二选一，语义清晰）；
 * - 合计必须 100%（容差 1e-6）。
 */
function validateTargets(targets) {
  if (targets === undefined) return;
  if (!Array.isArray(targets)) throw targetError('targets must be an array');
  if (targets.length === 0) return;

  const symbols = new Set();
  let total = 0;
  let hasClassLevel = false;
  let hasAssetLevel = false;

  for (const target of targets) {
    const rawSymbol = String(target?.symbol || '').trim();
    const ratio = Number(target?.targetRatio);
    const level = target?.level === undefined ? 'asset' : String(target.level);
    if (!rawSymbol) throw targetError('Each target must include a symbol');
    const symbol = level === 'asset_class' ? rawSymbol.toLowerCase() : rawSymbol.toUpperCase();
    if (symbols.has(symbol)) throw targetError(`Target symbol ${symbol} must be unique`);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
      throw targetError(`Target ratio for ${symbol} must be between 0 and 100`);
    }
    if (level !== 'asset' && level !== 'asset_class') {
      throw targetError(`Target level for ${symbol} must be 'asset' or 'asset_class'`);
    }
    if (level === 'asset_class') {
      if (!ASSET_CLASS_SET.has(symbol)) {
        throw targetError(`Target symbol ${symbol} is not a valid asset class (${ASSET_CLASSES.join(', ')})`);
      }
      hasClassLevel = true;
    } else {
      hasAssetLevel = true;
    }
    symbols.add(symbol);
    total += ratio;
  }

  if (hasClassLevel && hasAssetLevel) {
    throw targetError('Mixed targets are not allowed: use either asset-level or asset-class-level targets');
  }
  if (Math.abs(total - 100) > RATIO_TOLERANCE) {
    throw targetError(`Target ratios must total 100%; received ${total.toFixed(2)}%`);
  }
}

module.exports = { validateTargets, normalizeTargets };
