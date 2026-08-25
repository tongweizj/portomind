const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTargets } = require('../../services/portfolio/validateTargets');

test('组合目标比例允许空配置或精确合计 100%', () => {
  assert.doesNotThrow(() => validateTargets([]));
  assert.doesNotThrow(() => validateTargets([
    { symbol: 'VTI', targetRatio: 60 },
    { symbol: 'BND', targetRatio: 40 }
  ]));
});

test('组合目标比例总和不是 100% 时返回明确校验错误', () => {
  assert.throws(
    () => validateTargets([{ symbol: 'VTI', targetRatio: 80 }]),
    error => error.status === 400 && error.code === 'INVALID_PORTFOLIO_TARGETS' &&
      error.message.includes('80.00%')
  );
});

test('组合目标配置拒绝重复资产和越界比例', () => {
  assert.throws(
    () => validateTargets([
      { symbol: 'VTI', targetRatio: 50 },
      { symbol: 'vti', targetRatio: 50 }
    ]),
    error => error.code === 'INVALID_PORTFOLIO_TARGETS' && error.message.includes('unique')
  );
  assert.throws(
    () => validateTargets([{ symbol: 'VTI', targetRatio: 101 }]),
    error => error.code === 'INVALID_PORTFOLIO_TARGETS' && error.message.includes('between 0 and 100')
  );
});
