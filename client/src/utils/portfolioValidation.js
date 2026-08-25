const RATIO_TOLERANCE = 1e-6;

export function validatePortfolioTargets(targets) {
  if (!Array.isArray(targets)) return '目标配置必须是数组';
  if (targets.length === 0) return '';

  const symbols = new Set();
  let total = 0;
  for (const target of targets) {
    const symbol = String(target.symbol || '').trim().toUpperCase();
    const ratio = Number(target.targetRatio);
    if (!symbol) return '每个目标都必须选择资产';
    if (symbols.has(symbol)) return `目标资产 ${symbol} 不能重复`;
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
      return `${symbol} 的目标比例必须在 0 到 100 之间`;
    }
    symbols.add(symbol);
    total += ratio;
  }
  if (Math.abs(total - 100) > RATIO_TOLERANCE) {
    return `目标比例总和必须为 100%，当前为 ${total.toFixed(2)}%`;
  }
  return '';
}
