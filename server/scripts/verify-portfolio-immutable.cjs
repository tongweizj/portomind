#!/usr/bin/env node
// server/scripts/verify-portfolio-immutable.cjs
//
// TASK-047 AC1 的可复跑验证资产（Reviewer F-047-2：原证据只存在于计划文字，无法独立复现）。
//
// 为什么要真实库：`transaction.portfolioImmutable.test.js` 是 mock 用例，能证明守卫的
// **分支逻辑**，但不能证明「写入真的没发生」。AC1 明写「库内记录归属不变（用真实 DB 读回
// 验证，不接受仅 mock）」——本脚本补上这一层。
//
// 用法：
//   MONGO_URI=mongodb://127.0.0.1:27017/portomind_dev \
//     node server/scripts/verify-portfolio-immutable.cjs
//
// 写保护：库名必须含 `_dev` 或 `_test`，否则拒绝运行（避免误写生产库）。
// 清理：所有临时数据在 finally 中按已知 _id 精确删除，失败也会清理。
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

// 临时数据标记：symbol 与组合名都带这个前缀，便于人工排查残留
const TAG = `VERIFY47_${Date.now()}`;
const SYMBOL = `${TAG}.VF`;
const PORTFOLIO_A_NAME = `${TAG}_A`;
const PORTFOLIO_B_NAME = `${TAG}_B`;

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
    if (ids.transactionId) {
      const r = await Transaction.deleteOne({ _id: ids.transactionId });
      removed.push(`transactions:${r.deletedCount}`);
    }
    if (ids.portfolioIds.length > 0) {
      const r = await Portfolio.deleteMany({ _id: { $in: ids.portfolioIds } });
      removed.push(`portfolios:${r.deletedCount}`);
    }
    if (ids.assetId) {
      const r = await Asset.deleteOne({ _id: ids.assetId });
      removed.push(`assets:${r.deletedCount}`);
    }
    // 兜底：清扫同批次遗留（例如上次崩在中途），按 TAG 前缀匹配
    const leftoverTx = await Transaction.deleteMany({ symbol: SYMBOL });
    const leftoverPf = await Portfolio.deleteMany({ name: { $in: [PORTFOLIO_A_NAME, PORTFOLIO_B_NAME] } });
    const leftoverAsset = await Asset.deleteMany({ symbol: SYMBOL });
    if (leftoverTx.deletedCount) removed.push(`leftover-tx:${leftoverTx.deletedCount}`);
    if (leftoverPf.deletedCount) removed.push(`leftover-pf:${leftoverPf.deletedCount}`);
    if (leftoverAsset.deletedCount) removed.push(`leftover-asset:${leftoverAsset.deletedCount}`);
  } finally {
    console.log(`cleanup: ${removed.join(' ') || 'nothing to remove'}`);
  }
}

async function main() {
  const dbName = assertSafeDatabase(MONGO_URI);
  console.log(`db = ${dbName}`);
  console.log(`tag = ${TAG}\n`);

  await mongoose.connect(MONGO_URI);

  const ids = { transactionId: null, portfolioIds: [], assetId: null };
  let exitCode = 0;

  try {
    // ── 准备：两个组合 + 一个资产 + 一条归属 A 的交易 ──
    const pfA = await Portfolio.create({ name: PORTFOLIO_A_NAME, currency: 'CAD' });
    const pfB = await Portfolio.create({ name: PORTFOLIO_B_NAME, currency: 'CAD' });
    ids.portfolioIds = [pfA._id, pfB._id];

    const asset = await Asset.create({
      symbol: SYMBOL, name: `${TAG} asset`, market: 'US', currency: 'USD', type: 'etf', active: true
    });
    ids.assetId = asset._id;

    const tx = await transactionService.createTransaction({
      portfolioId: String(pfA._id),
      symbol: SYMBOL,
      action: 'buy',
      quantity: 10,
      price: 100,
      date: '2026-01-01'
    });
    ids.transactionId = tx._id;

    const A = String(pfA._id);
    const B = String(pfB._id);
    console.log(`created: portfolio A = ${A} | B = ${B} | tx = ${tx._id}\n`);

    // ── ① 改归属 → 400 TRANSACTION_PORTFOLIO_IMMUTABLE，且库内归属仍为 A ──
    let error1 = null;
    try {
      await transactionService.updateTransaction(String(tx._id), { portfolioId: B, quantity: 11 });
    } catch (error) {
      error1 = error;
    }
    check(
      '① 改归属被拒（400 PORTFOLIO_ID_IMMUTABLE）',
      Boolean(error1) && error1.status === 400 && error1.code === 'PORTFOLIO_ID_IMMUTABLE',
      error1 ? `status=${error1.status} code=${error1.code}` : '未抛错（守卫失效）'
    );

    const after1 = await Transaction.findById(tx._id).lean(); // ← 真实读回
    check(
      '① 库内归属未变（真实读回）',
      after1 && String(after1.portfolioId) === A,
      `portfolioId=${after1 ? after1.portfolioId : 'null'}（期望 A=${A}）`
    );
    check(
      '① 数量未被写入',
      after1 && after1.quantity === 10,
      `quantity=${after1 ? after1.quantity : 'null'}（期望 10）`
    );

    // ── ② 不传 portfolioId → 成功，归属不变 ──
    let error2 = null;
    let updated2 = null;
    try {
      updated2 = await transactionService.updateTransaction(String(tx._id), { quantity: 12 });
    } catch (error) {
      error2 = error;
    }
    check(
      '② 不传 portfolioId 更新成功',
      !error2 && updated2 && updated2.quantity === 12,
      error2 ? `抛错 ${error2.code}` : `quantity=${updated2 ? updated2.quantity : 'null'}`
    );
    const after2 = await Transaction.findById(tx._id).lean();
    check('② 归属仍为 A', after2 && String(after2.portfolioId) === A, `portfolioId=${after2 ? after2.portfolioId : 'null'}`);

    // ── ③ 传相同 portfolioId → 成功，归属不变（编辑页每次提交都带该字段） ──
    let error3 = null;
    let updated3 = null;
    try {
      updated3 = await transactionService.updateTransaction(String(tx._id), { portfolioId: A, quantity: 13 });
    } catch (error) {
      error3 = error;
    }
    check(
      '③ 传相同 portfolioId 更新成功（不得写成「出现即拒」）',
      !error3 && updated3 && updated3.quantity === 13,
      error3 ? `抛错 ${error3.code}` : `quantity=${updated3 ? updated3.quantity : 'null'}`
    );
    const after3 = await Transaction.findById(tx._id).lean();
    check('③ 归属仍为 A', after3 && String(after3.portfolioId) === A, `portfolioId=${after3 ? after3.portfolioId : 'null'}`);

    // ── ④ 创建路径仍可写入归属（WRITABLE_FIELDS 未被改动） ──
    const created4 = await transactionService.createTransaction({
      portfolioId: B, symbol: SYMBOL, action: 'buy', quantity: 5, price: 100, date: '2026-02-01'
    });
    check('④ 创建仍可带 portfolioId 写入 B', String(created4.portfolioId) === B, `portfolioId=${created4.portfolioId}`);
    await Transaction.deleteOne({ _id: created4._id });

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
    // 清理后复查：确认没有残留
    const leftoverTx = await Transaction.countDocuments({ symbol: SYMBOL });
    const leftoverAsset = await Asset.countDocuments({ symbol: SYMBOL });
    const leftoverPf = await Portfolio.countDocuments({ name: { $in: [PORTFOLIO_A_NAME, PORTFOLIO_B_NAME] } });
    const clean = leftoverTx === 0 && leftoverAsset === 0 && leftoverPf === 0;
    console.log(`残留检查：transactions=${leftoverTx} assets=${leftoverAsset} portfolios=${leftoverPf} => ${clean ? 'CLEAN' : 'DIRTY'}`);
    if (!clean) exitCode = 1;
    await mongoose.connection.close();
  }

  process.exit(exitCode);
}

main().catch(error => {
  console.error('VERIFY_FATAL', error && error.message ? error.message : error);
  process.exit(1);
});
