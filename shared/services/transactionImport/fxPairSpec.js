// 换汇两端的配对规则（TASK-101），供 pairing.js 使用。
// 两端相容：不同币种、金额一出一入（一负一正）。建议配对范围：同来源账户、同一报表日历日。

const EPSILON = 1e-9;

const FX_PAIR_SPEC = Object.freeze({
  prefix: 'FX',
  label: '换汇',
  isLeg: row => row.candidate.action === 'fx',
  compatible(left, right) {
    const a = left.candidate;
    const b = right.candidate;
    if (!a.cashCurrency || !b.cashCurrency || a.cashCurrency === b.cashCurrency) return false;
    return Math.abs(a.cashAmount) > EPSILON && Math.abs(b.cashAmount) > EPSILON && a.cashAmount * b.cashAmount < 0;
  },
  bucketOf: row => `${row.accountSelector || ''}|${row.candidate.localDate}`
});

module.exports = { FX_PAIR_SPEC };
