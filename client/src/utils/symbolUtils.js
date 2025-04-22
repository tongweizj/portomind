export function inferMarketCurrency(symbol = '') {
  const s = symbol.toUpperCase();

  if (s.endsWith('.TO')) return ['CA', 'CAD'];
  if (s.endsWith('.SS')) return ['CN-SH', 'CNY'];
  if (s.endsWith('.SZ')) return ['CN-SZ', 'CNY'];
  if (s.endsWith('.CN')) return ['CN-FUND', 'CNY'];

  return ['US', 'USD'];
}