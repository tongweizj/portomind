const RATIO_TOLERANCE = 1e-6;
const ASSET_CLASS_SET = new Set(['equity', 'bond', 'gold', 'cash']);

/**
 * 目标配置校验（CM-08 支持大类层级，与后端 validateTargets 口径一致）。
 * - level ∈ ['asset','asset_class']；asset_class 的 symbol 必须是大类代码；
 * - 混合模式禁止：存在任一大类目标则全部必须为大类目标；
 * - 合计必须 100%（容差 1e-6）。
 * @returns {string} 错误信息；空串 = 合法
 */
export function validatePortfolioTargets(targets) {
  if (!Array.isArray(targets)) return '目标配置必须是数组';
  if (targets.length === 0) return '';

  const symbols = new Set();
  let total = 0;
  let hasClassLevel = false;
  let hasAssetLevel = false;

  for (const target of targets) {
    const symbol = String(target.symbol || '').trim().toUpperCase();
    const ratio = Number(target.targetRatio);
    const level = target.level === undefined ? 'asset' : String(target.level);
    if (!symbol) return '每个目标都必须选择资产或大类';
    if (symbols.has(symbol)) return `目标 ${symbol} 不能重复`;
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
      return `${symbol} 的目标比例必须在 0 到 100 之间`;
    }
    if (level !== 'asset' && level !== 'asset_class') {
      return `${symbol} 的目标层级无效`;
    }
    if (level === 'asset_class') {
      if (!ASSET_CLASS_SET.has(symbol)) return `${symbol} 不是有效大类（equity/bond/gold/cash）`;
      hasClassLevel = true;
    } else {
      hasAssetLevel = true;
    }
    symbols.add(symbol);
    total += ratio;
  }

  if (hasClassLevel && hasAssetLevel) {
    return '不允许混合配置：要么全部资产级目标，要么全部大类级目标';
  }
  if (Math.abs(total - 100) > RATIO_TOLERANCE) {
    return `目标比例总和必须为 100%，当前为 ${total.toFixed(2)}%`;
  }
  return '';
}

export const ASSET_CLASS_LEVELS = ['equity', 'bond', 'gold', 'cash'];
