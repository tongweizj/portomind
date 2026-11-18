#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { ASSET_CURRENCIES } = require('@portomind/shared/constants/asset.constants');
const { STALE_FACTOR, staleThresholdHours } = require('@portomind/shared/constants/cronStatus.constants');
const { normalizeSymbol } = require('@portomind/shared/utils/symbol');
const { marketDate } = require('@portomind/shared/utils/marketTime');
const {
  ROOT, args, withDb, assertReadOnly, digest, validSymbol, inventory, priceInventory, targetsOf, isAssetTarget, reportError
} = require('./symbol-data-tools.cjs');

const DEFAULT_OUT = path.join(ROOT, 'docs/development/tasks/active/TASK-077-data-quality-report.md');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function range(first, last = first) {
  const displayDate = date => date instanceof Date && Number.isFinite(+date) ? date.toISOString() : '—';
  const start = displayDate(first);
  const end = displayDate(last);
  return start === end ? start : start + ' ~ ' + end;
}

function describePrices(prices) {
  return prices.map(row => JSON.stringify(row.symbol) + ' × ' + row.count + ' (' + range(row.first, row.last) + ')').join(' / ');
}

async function dualKeys(read, index) {
  const { dual, stranded, ambiguous } = priceInventory(index, await read.priceStats());
  return [
    ...ambiguous.map(({ symbol, candidates, count, first, last }) => [
      JSON.stringify(symbol), candidates.map(owner => owner.symbol + ' (' + owner.market + ', ' + owner.id + ')').join(', '),
      count, range(first, last), '高', '归属歧义，暂停涉及此键的删除'
    ]),
    ...dual.map(row => [
      row.previous + ' / ' + row.id, describePrices(row.prices),
      row.prices.reduce((sum, price) => sum + price.count, 0),
      row.prices.map(price => range(price.first, price.last)).join(' / '),
      '高', row.blocked ? '键数或归属异常，暂停删除' : '由 Human 核对 D-b 删除清单'
    ]),
    ...stranded.map(row => [
      row.previous + ' / ' + row.id, describePrices(row.prices) + ' → ' + row.canonical,
      row.prices.reduce((sum, price) => sum + price.count, 0),
      row.prices.map(price => range(price.first, price.last)).join(' / '),
      '高', '现存历史在归一后无法精确命中；保留并交 Orchestrator 确认验收口径'
    ])
  ];
}

function invalidSymbols(index) {
  return index.rows.filter(({ doc, keys }) => !validSymbol(doc.symbol) || doc.symbol !== keys?.canonical)
    .map(({ doc, keys }) => [
      String(doc._id), JSON.stringify(doc.symbol) + ' (' + (doc.market ?? '缺失 market') + ') → ' + (keys?.canonical ?? '无法派生'),
      1, range(doc.createdAt), '中', '可考虑在 TASK-076 报告建档契约异常'
    ]);
}

async function notFound(read, index, zone) {
  const runs = await read.find('taskruns', { 'failures.category': 'NOT_FOUND' });
  const groups = new Map();
  for (const run of runs) {
    if (!(run.startedAt instanceof Date) || !Number.isFinite(+run.startedAt)) {
      throw new Error('NOT_FOUND 记录缺少有效 startedAt，无法判断连续天数。');
    }
    const day = marketDate(run.startedAt, zone);
    for (const failure of run.failures) {
      if (failure.category !== 'NOT_FOUND') continue;
      const owner = index.aliases.get(normalizeSymbol(failure.item));
      const asset = owner?.size === 1 ? [...owner][0].doc : null;
      const key = JSON.stringify([asset ? String(asset._id) : failure.item, failure.provider, run.taskName]);
      const group = groups.get(key) || { asset, ambiguous: owner?.size > 1, provider: failure.provider, task: run.taskName, items: new Set(), days: new Set() };
      group.items.add(failure.item);
      group.days.add(day);
      groups.set(key, group);
    }
  }

  return [...groups.values()].map(({ asset, ambiguous, provider, task, items, days }) => {
    const sorted = [...days].sort();
    let start = sorted.length - 1;
    while (start > 0 && Date.parse(sorted[start]) - Date.parse(sorted[start - 1]) === DAY) start -= 1;
    const streak = sorted.length - start;
    const currency = ASSET_CURRENCIES.includes(asset?.currency) ? asset.currency : '未知币种';
    const active = asset ? String(asset.active === true) : ambiguous ? '归属歧义' : '资产未找到';
    return [
      [...items].sort().join(', '),
      [task, provider ?? '未知 provider', currency, 'active=' + active, '历史 ' + days.size + ' 个失败日'].join(' / '),
      streak, sorted[start] + ' ~ ' + sorted.at(-1), asset?.active && streak > 1 ? '高' : '中',
      '核对上游代码、币种桶和后续采集；由 Human 判断是否升级连续失败'
    ];
  });
}

async function staleRuns(read, now) {
  const rows = await read.find('taskruns', { status: 'RUNNING' });
  return rows.flatMap(doc => {
    const threshold = staleThresholdHours(doc.taskName);
    if (!(doc.startedAt instanceof Date) || !Number.isFinite(+doc.startedAt) ||
      +doc.startedAt >= +now - threshold * HOUR) return [];
    return [[String(doc._id), doc.taskName + ' / ' + doc.runKey + ' / 阈值 ' + threshold + ' h',
      1, range(doc.startedAt), '中', '核对进程与任务日志；评估是否升级长期 RUNNING 告警']];
  });
}

async function dangling(read, index) {
  const [transactions, portfolios] = await Promise.all([read.find('transactions'), read.find('portfolios')]);
  const missing = symbol => typeof symbol !== 'string' || !index.exact.has(symbol);
  const recommendation = '核对历史键映射和真实归属；归一后仍悬挂时评估升级';
  return [
    ...transactions.filter(row => missing(row.symbol)).map(row => [
      'transactions/' + row._id, JSON.stringify(row.symbol), 1, range(row.date), '高', recommendation
    ]),
    ...portfolios.flatMap(row => targetsOf(row).flatMap((target, i) =>
      isAssetTarget(target) && missing(target.symbol) ? [[
        'portfolios/' + row._id + '/targets/' + i, JSON.stringify(target.symbol), 1, range(row.createdAt),
        '高', recommendation
      ]] : []))
  ];
}

async function scan(db, now, zone) {
  const read = assertReadOnly(db);
  // 资产读取失败时，僵尸 RUNNING 仍可独立扫描。
  const assets = await read.find('assets').then(inventory).catch(error => error);
  const usingAssets = work => () => {
    if (assets instanceof Error) throw assets;
    return work(assets);
  };
  const categories = [
    ['双键资产、键歧义与旧键影响', usingAssets(index => dualKeys(read, index))],
    ['资产 symbol 格式', usingAssets(invalidSymbols)],
    ['NOT_FOUND 连续失败', usingAssets(index => notFound(read, index, zone))],
    ['僵尸 RUNNING', () => staleRuns(read, now)],
    ['悬挂 symbol 引用', usingAssets(index => dangling(read, index))]
  ];
  return Promise.all(categories.map(async ([title, run]) => {
    try {
      return { title, rows: await run() };
    } catch (error) {
      return { title, error: reportError(error) };
    }
  }));
}

function markdown(value) {
  return String(value ?? '—').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('|', '&#124;').replace(/[\r\n]/g, ' ');
}

function render(db, now, zone, sections) {
  const files = [__filename, require.resolve('./symbol-data-tools.cjs')];
  const successful = sections.filter(section => section.rows);
  const largest = [...successful].sort((a, b) => b.rows.length - a.rows.length)[0];
  const total = successful.reduce((sum, section) => sum + section.rows.length, 0);
  return [
    '# 数据质量探测报告', '',
    '- 探测日期（' + zone + '）：' + marketDate(now, zone) + '（' + now.toISOString() + '）',
    '- 数据库：' + markdown(db.databaseName),
    ...files.map(file => '- ' + path.basename(file) + ' SHA256：' + digest(fs.readFileSync(file))),
    '- 口径：active 为存储值 true；ADR-003 派生取 TASK-073；价格按 MongoDB 精确键计数，价格日期范围为 UTC。',
    '- NOT_FOUND 取同任务、资产、provider 的最近一段连续失败日期，按调度时区去重。没有失败记录的日期断开连续段；历史失败不代表目前仍失败。币种按 ASSET_CURRENCIES 与 asset.currency。',
    '- 僵尸阈值由 staleThresholdHours 计算（STALE_FACTOR = ' + STALE_FACTOR + '）；悬挂引用以全部资产存储键精确比较，组合按 Portfolio 模型的资产级口径检查（含缺省 level）。',
    ...sections.flatMap(({ title, rows, error }) => [
      '', '## ' + title, '',
      ...(error ? ['扫描失败：' + markdown(error)] : rows.length ? [
        '| 标识 | 值 | 数量 | 日期范围 | 建议严重度 | 升级建议 |',
        '|---|---|---:|---|---|---|',
        ...rows.map(row => '| ' + row.map(markdown).join(' | ') + ' |')
      ] : ['（无）'])
    ]),
    '', '## 汇总与 TASK-076 升级', '',
    '成功扫描 ' + successful.length + '/' + sections.length + ' 类，报告 ' + total + ' 行。' +
      (largest?.rows.length ? '行数最多：' + largest.title + '（' + largest.rows.length + '）。' : ''),
    '行数包括不同视角下的同一资产。Human 可结合实际缺价或业务影响、重现频率、归属和修复责任决定是否将某一类纳入 TASK-076。先按手册排查历史口径并处理扫描失败。', ''
  ].join('\n');
}

async function main(argv) {
  const options = args(argv, ['--uri', '--out'], ['--help']);
  if (options['--help']) {
    console.log('用法：node scripts/probe-symbol-data-quality.cjs [--uri <URI>] [--out <路径>] [--help]\n' +
      '只读探测五类问题。URI 默认取 MONGO_URI 或 server/.env。\n默认报告：' + DEFAULT_OUT);
    return 0;
  }

  const now = new Date();
  return withDb(options['--uri'], async db => {
    const zone = process.env.SCHEDULER_TIMEZONE || process.env.MARKET_TIMEZONE || 'America/Toronto';
    const sections = await scan(db, now, zone);
    const out = path.resolve(options['--out'] || DEFAULT_OUT);
    fs.writeFileSync(out, render(db, now, zone, sections), 'utf8');
    console.log('探测报告：' + out);
    return sections.some(section => section.error) ? 1 : 0;
  });
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
    console.error(reportError(error));
    process.exitCode = 1;
  });
}
