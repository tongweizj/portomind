#!/usr/bin/env node
// server/scripts/verify-csv-import-idempotency.cjs
//
// TASK-046 AC1/AC7 的可复跑验证资产（Reviewer F-046-2：原真实库证据只存在于计划文字，无法独立复现）。
//
// 为什么要真实库：`transaction.enhanced.test.js` 用「尊重 `select()` 投影的内存存储」验证了逻辑，
// 但那仍是替身——真实 Mongo 的投影行为（未请求字段确实不返回）是本次缺陷的根因所在。
// 本脚本在真实库上跑完整链路：`importTransactions` → 真实 `find().select().lean()` → `insertMany`。
//
// 用法：
//   MONGO_URI=mongodb://127.0.0.1:27017/portomind_dev \
//     node server/scripts/verify-csv-import-idempotency.cjs
//
// 写保护：库名必须含 `_dev` 或 `_test`，否则拒绝运行（避免误写生产库）。
// 清理：临时数据在 finally 中按 `_id` 精确删除，并按 TAG 前缀兜底清扫 + 残留复查。
// 退出码：0 = 全部 PASS；1 = 有 FAIL 或异常。

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
mongoose.set('strictQuery', true);

const Portfolio = require('@portomind/shared/models/portfolio');
const Asset = require('@portomind/shared/models/asset');
const Transaction = require('@portomind/shared/models/transaction');
const transactionService = require('@portomind/shared/services/transaction.service');

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/portomind_dev';
const MONGO_URI = process.env.MONGO_URI || DEFAULT_URI;

const TAG = `VERIFY46_${Date.now()}`;
const SYMBOL = `${TAG}.VF`;
const PORTFOLIO_NAME = `${TAG}_P`;
const OTHER_PORTFOLIO_NAME = `${TAG}_Q`;

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** 库名写保护：只允许 *_dev / *_test。 */
function assertSafeDatabase(uri) {
  let dbName;
  try {
    dbName = new URL(uri).pathname.replace(/^\//, '');
  } catch {
    throw new Error(`MONGO_URI 无法解析，拒绝运行：${uri}`);
  }
  if (!dbName) throw new Error('MONGO_URI 未包含库名，拒绝运行');
  if (!/_dev\b|_test\b/.test(dbName)) {
    throw new Error(`拒绝在库 "${dbName}" 上运行：库名必须包含 _dev 或 _test（避免误写生产库）`);
  }
  return dbName;
}

async function cleanup(ids) {
  const removed = [];
  try {
    const tx = await Transaction.deleteMany({ symbol: SYMBOL });
    if (tx.deletedCount) removed.push(`tx:${tx.deletedCount}`);
    const pf = await Portfolio.deleteMany({ name: { $in: [PORTFOLIO_NAME, OTHER_PORTFOLIO_NAME] } });
    if (pf.deletedCount) removed.push(`pf:${pf.deletedCount}`);
    const asset = await Asset.deleteMany({ symbol: SYMBOL });
    if (asset.deletedCount) removed.push(`asset:${asset.deletedCount}`);
  } finally {
    console.log(`cleanup: ${removed.join(' ') || 'nothing to remove'}`);
  }
}

async function main() {
  const dbName = assertSafeDatabase(MONGO_URI);
  console.log(`db = ${dbName}`);
  console.log(`tag = ${TAG}\n`);

  await mongoose.connect(MONGO_URI);

  const ids = { portfolioIds: [] };
  let exitCode = 0;

  try {
    const portfolio = await Portfolio.create({ name: PORTFOLIO_NAME, currency: 'CAD' });
    const other = await Portfolio.create({ name: OTHER_PORTFOLIO_NAME, currency: 'CAD' });
    ids.portfolioIds = [portfolio._id, other._id];

    await Asset.create({
      symbol: SYMBOL, name: `${TAG} asset`, market: 'US', currency: 'USD', type: 'etf', active: true
    });

    const csv = [
      { symbol: SYMBOL, action: 'buy', quantity: 10, price: 100, date: '2026-01-01' },
      { symbol: SYMBOL, action: 'buy', quantity: 5, price: 101, date: '2026-03-01', fee: 2 }
    ];
    const pid = String(portfolio._id);

    // ── ① 首次导入：imported=2 / skipped=0 ──
    const first = await transactionService.importTransactions({ portfolioId: pid, transactions: csv });
    check('① 首次导入 imported=2 / skipped=0', first.imported === 2 && first.skipped === 0, JSON.stringify(first));
    const rowsAfterFirst = await Transaction.countDocuments({ portfolioId: pid });
    check('① 库内新增 2 行', rowsAfterFirst === 2, `rows=${rowsAfterFirst}`);

    // ── ② 再导入同一批：imported=0 / skipped=2，库内仍 2 行（真实 Mongo 投影生效）──
    const second = await transactionService.importTransactions({ portfolioId: pid, transactions: csv });
    check('② 二次导入 imported=0 / skipped=2（AC1）', second.imported === 0 && second.skipped === 2, JSON.stringify(second));
    const rowsAfterSecond = await Transaction.countDocuments({ portfolioId: pid });
    check('② 库内仍只有 2 行（未新增）', rowsAfterSecond === 2, `rows=${rowsAfterSecond}`);

    // ── ③ 跨组合：同一批导入另一个组合应成功（AC3）──
    const intoOther = await transactionService.importTransactions({
      portfolioId: String(other._id), transactions: csv
    });
    check('③ 另一个组合导入成功（不跨组合判重，AC3）', intoOther.imported === 2 && intoOther.skipped === 0, JSON.stringify(intoOther));

    // ── ④ 字段差异不判重（AC4）──
    const variant = [{ symbol: SYMBOL, action: 'buy', quantity: 11, price: 100, date: '2026-01-01' }];
    const diff = await transactionService.importTransactions({ portfolioId: pid, transactions: variant });
    check('④ 仅 quantity 不同 → 照常导入（AC4）', diff.imported === 1 && diff.skipped === 0, JSON.stringify(diff));

    // ── 汇总 ──
    console.log(`\n断言总数 ${pass + failures.length} / 通过 ${pass} / 失败 ${failures.length}`);
    if (failures.length) {
      console.log('FAILED:');
      failures.forEach(item => console.log(` - ${item}`));
      exitCode = 1;
    }
  } catch (error) {
    console.error('VERIFY_CRASH', error && error.stack ? error.stack : error);
    exitCode = 1;
  } finally {
    await cleanup(ids);
    const leftoverTx = await Transaction.countDocuments({ symbol: SYMBOL });
    const leftoverPf = await Portfolio.countDocuments({ name: { $in: [PORTFOLIO_NAME, OTHER_PORTFOLIO_NAME] } });
    const leftoverAsset = await Asset.countDocuments({ symbol: SYMBOL });
    const clean = leftoverTx === 0 && leftoverPf === 0 && leftoverAsset === 0;
    console.log(`残留检查：transactions=${leftoverTx} portfolios=${leftoverPf} assets=${leftoverAsset} => ${clean ? 'CLEAN' : 'DIRTY'}`);
    if (!clean) exitCode = 1;
    await mongoose.connection.close();
  }

  process.exit(exitCode);
}

main().catch(error => {
  console.error('VERIFY_FATAL', error && error.message ? error.message : error);
  process.exit(1);
});
