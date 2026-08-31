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

// ─────────────────────── CM-08：大类层级目标 ───────────────────────

test('大类层级目标：合法大类配置通过，缺省 level 视为 asset', () => {
  assert.doesNotThrow(() => validateTargets([
    { symbol: 'equity', targetRatio: 60, level: 'asset_class' },
    { symbol: 'bond', targetRatio: 40, level: 'asset_class' }
  ]));
  // 存量目标无 level 字段 → 默认 asset
  assert.doesNotThrow(() => validateTargets([{ symbol: 'VTI', targetRatio: 100 }]));
});

test('大类层级目标：非法大类代码拒绝', () => {
  assert.throws(
    () => validateTargets([{ symbol: 'realestate', targetRatio: 100, level: 'asset_class' }]),
    error => error.code === 'INVALID_PORTFOLIO_TARGETS' && error.message.includes('not a valid asset class')
  );
});

test('大类层级目标：混合模式禁止（资产级与大类级并存）', () => {
  assert.throws(
    () => validateTargets([
      { symbol: 'VTI', targetRatio: 50 },
      { symbol: 'bond', targetRatio: 50, level: 'asset_class' }
    ]),
    error => error.code === 'INVALID_PORTFOLIO_TARGETS' && error.message.includes('Mixed targets')
  );
});

test('大类层级目标：非法 level 拒绝', () => {
  assert.throws(
    () => validateTargets([{ symbol: 'equity', targetRatio: 100, level: 'sector' }]),
    error => error.code === 'INVALID_PORTFOLIO_TARGETS' && error.message.includes('level')
  );
});
