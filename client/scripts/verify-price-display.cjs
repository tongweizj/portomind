#!/usr/bin/env node
// 验证 client/src/utils/priceDisplay.js 的「数据缺口」判定与涨跌幅展示。
//
// 为什么需要它：项目目前没有客户端测试框架，而本模块承载「缺口是否误报」的核心口径。
// TASK-043 在此连续三轮返工（缺口分支不可达 → 星期几常量误报 → 相对基准法），
// 每次都靠人工推演，无法回归。本脚本把口径固化成可复跑的断言。
//
// 【期望值来源原则】所有期望值必须来自**业务事实或日历事实**，不得照抄实现公式。
// 反面教材：早期版本把期望值写成 `d === 1 ? 3 : d === 0 ? 2 : 1`，与实现同构，
// 导致即使模型完全错误，断言仍全绿（自证循环）。评审已就此定性为方法论错误。
//
// 运行：node client/scripts/verify-price-display.cjs
const path = require('path');
const os = require('os');
const fs = require('fs');
const esbuild = require('esbuild');

const entry = path.join(__dirname, '..', 'src', 'utils', 'priceDisplay.js');
const outfile = path.join(os.tmpdir(), `portomind-pricedisplay-${process.pid}.cjs`);

esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile,
});

// eslint-disable-next-line import/no-dynamic-require
const { describeGap, annotateGapFields, weekdaysBetween, fmtChange } = require(outfile);
fs.rmSync(outfile, { force: true });

let failed = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        实际=${JSON.stringify(actual)}  期望=${JSON.stringify(expected)}`);
}

// 固定日历事实：2026-10-16 周五、10-17 周六、10-18 周日、10-19 周一
function render(items, idx, extra = {}) {
  const it = annotateGapFields(items)[idx];
  return describeGap({
    days: it.latestDay ? 1 : null, // isGap 判定不依赖自然日数，只要 >0
    behindTradingDays: it.behindTradingDays,
    hasPeer: it.hasPeer,
    neverSynced: it.neverSynced,
    ...extra,
  });
}

const asset = (symbol, market, latestDay, extra = {}) => ({
  symbol, market, latestDay,
  price: latestDay ? 100 : null,
  createdAt: '2020-01-01',
  ...extra,
});

console.log('=== S1 周一：同市场全部标的都停在周五（正常，不应报警）===');
{
  const items = [asset('VOO', 'US', '2026-10-16'), asset('QQQ', 'US', '2026-10-16'), asset('VTI', 'US', '2026-10-16')];
  const a = annotateGapFields(items);
  check('S1 behind 全为 0', a.map(i => i.behindTradingDays), [0, 0, 0]);
  check('S1 不标红', render(items, 0).isGap, false);
}

console.log('\n=== S2 周二凌晨：周一收盘尚未入库，全组仍是周五（不应报警）===');
{
  const items = [asset('VOO', 'US', '2026-10-16'), asset('QQQ', 'US', '2026-10-16')];
  check('S2 不标红', render(items, 0).isGap, false);
}

console.log('\n=== S3 长周末后：US 全组停在节前（组内一致，不应报警）===');
{
  const items = [asset('VOO', 'US', '2026-09-04'), asset('QQQ', 'US', '2026-09-04'), asset('VTI', 'US', '2026-09-04')];
  check('S3 US 组不标红', render(items, 0).isGap, false);
}

console.log('\n=== S4 US 休市、CA 开市：两组各自一致（不应报警）===');
{
  // 按市场分组的意义：若用全局基准（CA 的 10-19）去比 US 的 10-12，会得出 behind=5 而误报
  const items = [
    asset('VOO', 'US', '2026-10-12'), asset('QQQ', 'US', '2026-10-12'),
    asset('XIC', 'CA', '2026-10-19'), asset('VCN', 'CA', '2026-10-19'),
  ];
  const a = annotateGapFields(items);
  check('S4 US 标的 behind=0（组内一致）', [a[0].behindTradingDays, a[1].behindTradingDays], [0, 0]);
  check('S4 US 组不标红', render(items, 0).isGap, false);
  check('S4 CA 组不标红', render(items, 2).isGap, false);
}

console.log('\n=== S5 组内个别标的落后：阈值边界（日历事实可独立复算）===');
{
  // 10-13(周二) -> 10-16(周五)：中间是 14、15、16 三个工作日
  check('S5 落后 3 个工作日 -> 标红', render([asset('VOO', 'US', '2026-10-16'), asset('LAG3', 'US', '2026-10-13')], 1).isGap, true);
  // 10-14(周三) -> 10-16(周五)：中间是 15、16 两个工作日
  check('S5 落后 2 个工作日 -> 不标红', render([asset('VOO', 'US', '2026-10-16'), asset('LAG2', 'US', '2026-10-14')], 1).isGap, false);
  // 10-12(周一) -> 10-16(周五)：中间是 13、14、15、16 四个工作日
  check('S5 落后 4 个工作日 -> 标红', render([asset('VOO', 'US', '2026-10-16'), asset('LAG4', 'US', '2026-10-12')], 1).isGap, true);
}

console.log('\n=== S6 单标的市场：无基准可比（宁可少报，不应报警）===');
{
  const items = [asset('ONLY1', 'US', '2026-09-01')];
  check('S6 无同组标的 -> 不标红', render(items, 0).isGap, false);
  check('S6 hasPeer=false', annotateGapFields(items)[0].hasPeer, false);
}

console.log('\n=== S7 长假：所有 CN 标的停在节前（不应报警）===');
{
  const items = [asset('510300', 'CN', '2026-02-13'), asset('159915', 'CN', '2026-02-13'), asset('512880', 'CN', '2026-02-13')];
  check('S7 CN 组不标红', render(items, 0).isGap, false);
}

console.log('\n=== S8 节后某 CN 标的没更新，其他更新了（应报警）===');
{
  const items = [asset('510300', 'CN', '2026-02-23'), asset('159915', 'CN', '2026-02-23'), asset('STALE', 'CN', '2026-02-13')];
  check('S8 落后标的标红', render(items, 2).isGap, true);
}

console.log('\n=== S9 新资产尚未同步（不是缺口）===');
{
  const items = [
    asset('VOO', 'US', '2026-10-16'),
    { symbol: 'NEW', market: 'US', latestDay: null, price: null, createdAt: new Date(Date.now() - 86400000).toISOString() },
  ];
  check('S9 标记 neverSynced', annotateGapFields(items)[1].neverSynced, true);
  check('S9 文案为「尚未同步」', render(items, 1).text, '尚未同步');
  check('S9 不标红', render(items, 1).isGap, false);
}

console.log('\n=== S10 老资产窗口内完全无数据（长尾缺口，应标红）===');
{
  const items = [
    asset('VOO', 'US', '2026-10-16'),
    { symbol: 'OLD', market: 'US', latestDay: null, price: null, createdAt: '2020-01-01' },
  ];
  check('S10 不标记 neverSynced', annotateGapFields(items)[1].neverSynced, false);
  const g = render(items, 1, { beyondWindowDays: 14 });
  check('S10 标红', g.isGap, true);
  check('S10 文案为「近 N 天」而非「≥N 天」', g.text, '近 14 天无数据 · 缺口');
}

console.log('\n=== S11 加载失败不得误判为缺口 ===');
{
  const items = [{ symbol: 'X', market: 'US', latestDay: null, price: null, createdAt: '2020-01-01' }];
  const g = render(items, 0, { loadFailed: true, beyondWindowDays: 14 });
  check('S11 文案为「加载失败」', g.text, '加载失败');
  check('S11 不标红', g.isGap, false);
}

console.log('\n=== S12 停用标的豁免 ===');
{
  const g = describeGap({ days: 20, behindTradingDays: 20, hasPeer: true, suppressGap: true });
  check('S12 不标红', g.isGap, false);
  check('S12 文案保留天数', g.text, '已停用 · 20 天前');
}

console.log('\n=== S13 weekdaysBetween 日历事实 ===');
{
  check('S13 周五->周一 = 1', weekdaysBetween('2026-10-16', '2026-10-19'), 1);
  check('S13 周五->下周五 = 5', weekdaysBetween('2026-10-16', '2026-10-23'), 5);
  check('S13 同日 = 0', weekdaysBetween('2026-10-16', '2026-10-16'), 0);
  check('S13 周一->周五 = 4', weekdaysBetween('2026-10-19', '2026-10-23'), 4);
}

console.log('\n=== S14 涨跌幅展示（红涨绿跌为中国惯例）===');
{
  check('S14 0 值中性文案', fmtChange(0).text, '0.00%');
  check('S14 0 值非红', fmtChange(0).color.toLowerCase() !== '#df1b41', true);
  check('S14 正数涨红', fmtChange(1.23).color.toLowerCase(), '#df1b41');
  check('S14 负数跌绿', fmtChange(-1.23).color.toLowerCase(), '#0e9f6e');
  check('S14 null 显示破折号', fmtChange(null).text, '—');
}

console.log('\n=== S15 脏数据（未来日期）不得抬高基准，否则整市场误报 ===');
{
  const items = [asset('VOO', 'US', '2026-10-16'), asset('DIRTY', 'US', '2099-01-01'), asset('LAG', 'US', '2026-10-13')];
  const a = annotateGapFields(items);
  check('S15 正常标的 behind=0（未被脏数据拖累）', a[0].behindTradingDays, 0);
  check('S15 正常标的不误报', render(items, 0).isGap, false);
  check('S15 真实落后标的仍标红', render(items, 2).isGap, true);
}

console.log('\n=== S16 market 大小写差异不应拆散分组 ===');
{
  const items = [asset('VOO', 'us', '2026-10-16'), asset('LAG', 'US', '2026-10-13')];
  check('S16 归一化后仍视为同组', annotateGapFields(items)[0].hasPeer, true);
  check('S16 落后标的标红', render(items, 1).isGap, true);
}

console.log('\n=== S17 详情页口径：单标的无基准时不做缺口判定（避免长假误报）===');
{
  const g = describeGap({ days: 30, behindTradingDays: 20, hasPeer: false });
  check('S17 即使落后很久也不标红', g.isGap, false);
  check('S17 仍诚实显示天数', g.text, '30 天前');
}

console.log('\n=== S18 详情页 90 天完全无数据（确定为异常，应标红）===');
{
  const g = describeGap({ days: null, hasPeer: false, beyondWindowDays: 90 });
  check('S18 标红', g.isGap, true);
  check('S18 文案', g.text, '近 90 天无数据 · 缺口');
}

console.log(`\n${failed === 0 ? '全部通过' : `${failed} 项失败`}`);
process.exit(failed === 0 ? 0 : 1);
