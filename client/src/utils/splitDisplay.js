// 拆股展示（TASK-098）：唯一实现，交易表格、最近交易与导入预览共用。
// 拆股流水的 quantity 是带符号份额变动；splitRatio = 新份额 / 旧份额（可缺失）。

/** 份额变动：正数带「+」，负数保留「-」。 */
export function formatShareChange(quantity) {
  const value = Number(quantity);
  if (quantity == null || !Number.isFinite(value)) return '—';
  return value > 0 ? `+${value}` : String(value);
}

/** 拆股比例：≥1 显示「1 拆 N」，<1 显示「N 合 1」；缺失显示「—」。 */
export function formatSplitRatio(ratio) {
  const value = Number(ratio);
  if (ratio == null || !Number.isFinite(value) || value <= 0) return '—';
  const round = number => Number(number.toPrecision(6));
  return value >= 1 ? `1 拆 ${round(value)}` : `${round(1 / value)} 合 1`;
}
