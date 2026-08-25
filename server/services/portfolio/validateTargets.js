const RATIO_TOLERANCE = 1e-6;

function targetError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'INVALID_PORTFOLIO_TARGETS';
  return error;
}

function validateTargets(targets) {
  if (targets === undefined) return;
  if (!Array.isArray(targets)) throw targetError('targets must be an array');
  if (targets.length === 0) return;

  const symbols = new Set();
  let total = 0;
  for (const target of targets) {
    const symbol = String(target?.symbol || '').trim().toUpperCase();
    const ratio = Number(target?.targetRatio);
    if (!symbol) throw targetError('Each target must include a symbol');
    if (symbols.has(symbol)) throw targetError(`Target symbol ${symbol} must be unique`);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
      throw targetError(`Target ratio for ${symbol} must be between 0 and 100`);
    }
    symbols.add(symbol);
    total += ratio;
  }
  if (Math.abs(total - 100) > RATIO_TOLERANCE) {
    throw targetError(`Target ratios must total 100%; received ${total.toFixed(2)}%`);
  }
}

module.exports = { validateTargets };
