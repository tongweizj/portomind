const test = require('node:test');
const assert = require('node:assert/strict');
const Portfolio = require('../../models/portfolio');

// CM-05 账户类型：enum 校验 + 默认值。
// 存量组合无该字段时由业务侧按 'other' 兜底，模型层只负责新写入值的约束。

test('组合模型 accountType 缺省为 other 且合法值通过校验', () => {
  const doc = new Portfolio({ name: '测试组合' });
  assert.equal(doc.accountType, 'other');
  assert.equal(doc.validateSync(), undefined);

  const tfsa = new Portfolio({ name: '测试组合', accountType: 'tfsa' });
  assert.equal(tfsa.accountType, 'tfsa');
  assert.equal(tfsa.validateSync(), undefined);
});

test('组合模型拒绝非法 accountType', () => {
  const doc = new Portfolio({ name: '测试组合', accountType: 'robinhood' });
  const error = doc.validateSync();
  assert.ok(error, '非法 accountType 应触发校验错误');
  assert.ok(error.errors.accountType, '错误应落在 accountType 字段上');
});
