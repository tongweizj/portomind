// server/test/integration/transactionImportQuestrade.api.test.js
//
// TASK-102（#102）：Questrade 原格式 XLSX（Activities 工作表）直接导入。
// 起真实 Express + 认证闸门；模型层用 helpers/importWorld 内存替身。
// XLSX 在测试时生成（不提交二进制）：questradeXlsx 仿照原报表的包结构（x: 命名空间前缀、
// 非 sheetN 的工作表文件名、绝对路径关系、全部单元格为字符串）；plainXlsx 用 exceljs 写普通工作簿。
// 全部样例为合成数据：标的、数量、金额、账号均为虚构（仓库为 public）。

process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'portomind-transaction-import-logs');

const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const ExcelJS = require('exceljs');

const app = require('../../app');
const { installAdminSession, uninstallSessionStub, authHeaders } = require('../helpers/auth');
const { installImportWorld } = require('../helpers/importWorld');
const marketData = require('@portomind/shared/services/marketData.service');

const PORTFOLIO_A = '64b000000000000000000c51';
const PORTFOLIO_B = '64b000000000000000000c52';
const ACCOUNT_NO = '90000001';

let server;
let baseUrl;

test.before(async () => {
  installAdminSession();
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  uninstallSessionStub();
  await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
});

async function call(method, pathname, body) {
  const headers = { cookie: authHeaders().cookie };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

const QT_HEADERS = ['Transaction Date', 'Settlement Date', 'Action', 'Symbol', 'Description', 'Quantity', 'Price',
  'Gross Amount', 'Commission', 'Net Amount', 'Currency', 'Account #', 'Activity Type', 'Account Type'];

const ZERO = { Quantity: '0.00000', Price: '0.00000000', 'Gross Amount': '0.00', Commission: '0.00' };

// 合成行（默认一笔加股买入）；日期按原报表写成「YYYY-MM-DD 12:00:00 AM」
function qtRow(row) {
  const base = {
    'Transaction Date': '2026-03-02', 'Settlement Date': '2026-03-03', Action: 'Buy', Symbol: 'SYNQ.TO',
    Description: 'SYNTHETIC CA EQUITY ETF WE ACTED AS AGENT', Quantity: '10.00000', Price: '20.00000000',
    'Gross Amount': '-200.00', Commission: '0.00', 'Net Amount': '-200.00', Currency: 'CAD',
    'Account #': ACCOUNT_NO, 'Activity Type': 'Trades', 'Account Type': 'Individual Margin'
  };
  const merged = { ...base, ...row };
  for (const key of ['Transaction Date', 'Settlement Date']) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(merged[key])) merged[key] = `${merged[key]} 12:00:00 AM`;
  }
  return merged;
}

function escapeXml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

// 仿原报表包结构：BOM + x: 前缀命名空间、xl/worksheets/sheet.xml、绝对路径关系、t="str" 字符串单元格
async function questradeXlsx(rows, { sheetName = 'Activities', headers = QT_HEADERS } = {}) {
  const bom = '\uFEFF<?xml version="1.0" encoding="utf-8"?>';
  const ns = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const records = [headers, ...rows.map(row => headers.map(header => row[header] ?? ''))];
  const sheetRows = records.map((cells, r) => `<x:row r="${r + 1}">${cells.map((value, c) => (value === ''
    ? ''
    : `<x:c r="${columnName(c)}${r + 1}" t="str"><x:v>${escapeXml(value)}</x:v></x:c>`)).join('')}</x:row>`).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `${bom}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" /><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml" /><Override PartName="/xl/worksheets/sheet.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" /></Types>`);
  zip.file('_rels/.rels', `${bom}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/xl/workbook.xml" Id="R0000000000000001" /></Relationships>`);
  zip.file('xl/workbook.xml', `${bom}<x:workbook ${ns}><x:bookViews><x:workbookView /></x:bookViews><x:sheets><x:sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="R0000000000000002" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `${bom}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="/xl/styles.xml" Id="rIdStyles" /><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet.xml" Id="R0000000000000002" /></Relationships>`);
  zip.file('xl/styles.xml', `${bom}<x:styleSheet ${ns} />`);
  zip.file('xl/worksheets/sheet.xml', `${bom}<x:worksheet ${ns}><x:sheetData>${sheetRows}</x:sheetData></x:worksheet>`);
  return (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');
}

// 普通工作簿（如用 Excel 另存）：exceljs 写出，数字为数值、日期为日期
async function plainXlsx(rows, { sheetName = 'Activities' } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(QT_HEADERS);
  for (const row of rows) sheet.addRow(QT_HEADERS.map(header => row[header] ?? null));
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
}

function freshWorld(t, extra = {}) {
  const world = installImportWorld(t, {
    portfolios: [
      { _id: PORTFOLIO_A, name: '合成组合 QT', currency: 'CAD' },
      { _id: PORTFOLIO_B, name: '合成组合 QT-B', currency: 'USD' }
    ],
    assets: [
      { _id: '64b000000000000000000e51', symbol: 'SYNQ.TO', type: 'etf', market: 'CA', currency: 'CAD', active: true },
      { _id: '64b000000000000000000e52', symbol: 'SYNU.US', type: 'etf', market: 'US', currency: 'USD', active: true },
      { _id: '64b000000000000000000e53', symbol: 'SYNJ.TO', type: 'etf', market: 'CA', currency: 'CAD', active: true },
      { _id: '64b000000000000000000e54', symbol: 'SYNJ.U.TO', type: 'etf', market: 'CA', currency: 'USD', active: true },
      { _id: '64b000000000000000000e55', symbol: 'SYNS.TO', type: 'etf', market: 'CA', currency: 'CAD', active: true }
    ],
    sourceAccounts: [],
    ...extra
  });
  t.mock.method(marketData, 'getLatestPrices', async () => ({}));
  return world;
}

function body(content, overrides = {}) {
  return {
    portfolioId: PORTFOLIO_A,
    format: 'questrade',
    file: { name: 'synthetic-activities.xlsx', encoding: 'base64', content },
    sourceAccount: { broker: 'questrade', alias: '合成 QT 账户' },
    ...overrides
  };
}

async function preview(input) {
  const response = await call('POST', '/api/transactions/import/preview', input);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}

async function previewAndCommit(input) {
  const data = await preview(input);
  const commit = await call('POST', '/api/transactions/import/commit', {
    ...input, previewToken: data.previewToken, ledgerFingerprint: data.ledgerFingerprint
  });
  return { preview: data, commit };
}

async function ledger(portfolioId = PORTFOLIO_A) {
  const list = await call('GET', `/api/portfolios/${portfolioId}/transactions`);
  assert.equal(list.status, 200, JSON.stringify(list.body));
  return list.body.data;
}

async function positions(portfolioId = PORTFOLIO_A) {
  const response = await call('GET', `/api/portfolios/${portfolioId}/stats/positions`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}

test('原报表倒序（新 → 旧）按时间正序预览，保留原行号、交易日与结算日；非零佣金为负数映射为正的费用；回读账本与持仓', async (t) => {
  freshWorld(t);
  // 第 2 行（最新）卖出，第 3 行（较早）买入
  const content = await questradeXlsx([
    qtRow({
      'Transaction Date': '2026-03-05', 'Settlement Date': '2026-03-06', Action: 'Sell', Quantity: '-4.00000', Price: '25.00000000',
      'Gross Amount': '100.00', Commission: '-1.25', 'Net Amount': '98.75'
    }),
    qtRow({})
  ]);
  const { preview: data, commit } = await previewAndCommit(body(content));
  assert.equal(data.counts.add, 2, JSON.stringify(data.rows));
  const [buy, sell] = data.rows;
  assert.deepEqual([buy.rowNumber, buy.rowNumberKind, sell.rowNumber, sell.rowNumberKind], [3, 'original', 2, 'original']);
  assert.deepEqual([buy.candidate.action, buy.candidate.quantity, buy.candidate.fee, buy.candidate.feeSource],
    ['buy', 10, 0, 'broker']);
  assert.deepEqual([sell.candidate.action, sell.candidate.quantity, sell.candidate.fee, sell.candidate.cashAmount],
    ['sell', 4, 1.25, 98.75]);
  assert.equal(sell.candidate.dateKind, 'date');
  assert.equal(new Date(sell.candidate.date).toISOString(), '2026-03-05T00:00:00.000Z');
  assert.equal(new Date(sell.candidate.settlementDate).toISOString(), '2026-03-06T00:00:00.000Z');
  assert.equal(sell.cashDifference ?? sell.candidate.cashDifference ?? null, null);

  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const txs = await ledger();
  assert.equal(txs.length, 2);
  const sold = txs.find(tx => tx.action === 'sell');
  assert.equal(sold.fee, 1.25);
  assert.equal(sold.source.rowNumber, 2);
  assert.equal(sold.source.rowNumberKind, 'original');
  assert.equal(new Date(sold.settlementDate).toISOString(), '2026-03-06T00:00:00.000Z');
  const pos = await positions();
  const synq = (pos.positions || pos).find(p => p.symbol === 'SYNQ.TO');
  assert.equal(synq.quantity, 6);
});

test('现金分红（含裸代码与内部代码）、独立费用、入金进入现金核对；内部代码待提供代码映射，映射后入账', async (t) => {
  freshWorld(t);
  const rows = [
    qtRow({ 'Activity Type': 'Fees and rebates', Action: 'FCH', Symbol: '', Description: 'SYNTHETIC DATA FEE', ...ZERO, 'Net Amount': '-4.95' }),
    qtRow({ 'Activity Type': 'Dividends', Action: 'DIV', Symbol: 'Z000001', Description: 'SYNTHETIC US ETF CASH DIV ON 9 SHS', ...ZERO, 'Net Amount': '3.10', Currency: 'USD' }),
    qtRow({ 'Activity Type': 'Dividends', Action: '', Symbol: 'SYNQ', Description: 'SYNTHETIC CA EQUITY ETF DIST', ...ZERO, 'Net Amount': '1.20' }),
    qtRow({ 'Activity Type': 'Deposits', Action: 'CON', Symbol: '', Description: 'SYNTHETIC CONTRIBUTION', ...ZERO, 'Net Amount': '1000.00' })
  ];
  const content = await questradeXlsx(rows);

  const first = await preview(body(content));
  assert.deepEqual(first.rows.map(row => row.rowNumber), [5, 4, 3, 2]);
  const byRow = Object.fromEntries(first.rows.map(row => [row.rowNumber, row]));
  assert.deepEqual([byRow[5].disposition, byRow[5].candidate.action, byRow[5].candidate.cashAmount], ['add', 'cash_in', 1000]);
  assert.deepEqual([byRow[4].disposition, byRow[4].candidate.action, byRow[4].candidate.symbol, byRow[4].candidate.cashAmount],
    ['add', 'div_cash', 'SYNQ.TO', 1.2]);
  assert.deepEqual([byRow[2].disposition, byRow[2].candidate.action, byRow[2].candidate.cashAmount], ['add', 'fee', -4.95]);
  assert.equal(byRow[3].disposition, 'review');
  assert.equal(byRow[3].code, 'SYMBOL_UNMAPPED');
  assert.equal(byRow[3].symbolMapKey, 'Z000001@USD');
  assert.deepEqual(byRow[3].options, ['symbolMap', 'skip']);
  assert.equal(first.blocking, true);

  const input = body(content, { symbolMap: { 'Z000001@USD': 'SYNU.US' } });
  const { preview: second, commit } = await previewAndCommit(input);
  const mapped = second.rows.find(row => row.rowNumber === 3);
  assert.deepEqual([mapped.disposition, mapped.candidate.symbol, mapped.candidate.mappedFrom, mapped.candidate.cashCurrency],
    ['add', 'SYNU.US', 'Z000001', 'USD']);
  assert.equal(mapped.symbolMapKey, 'Z000001@USD');
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const txs = await ledger();
  assert.deepEqual(txs.map(tx => tx.action).sort(), ['cash_in', 'div_cash', 'div_cash', 'fee']);
  assert.equal(txs.find(tx => tx.symbol === 'SYNU.US').cashAmount, 3.1);
});

test('换汇两端按同账户同日配对，拆股按描述推算比例，跨币种证券划转成对并以 BOOK VALUE 为承接成本；补齐代码映射后整批入账并回读', async (t) => {
  freshWorld(t);
  // 原报表新 → 旧：第 2–3 行划转（最新），4–5 行换汇，6 行拆股，7–8 行买入（最早）
  const content = await questradeXlsx([
    qtRow({ 'Transaction Date': '2026-04-10', 'Settlement Date': '2026-04-10', 'Activity Type': 'Other', Action: 'BRW', Symbol: 'SYNJ',
      Description: 'SYNTHETIC USD ETF JOURNAL POSITION FROM CAD BOOK VALUE: $1,020.00 CNV@ 1.3700', ...ZERO, Quantity: '100.00000', 'Net Amount': '0.00', Currency: 'USD' }),
    qtRow({ 'Transaction Date': '2026-04-10', 'Settlement Date': '2026-04-10', 'Activity Type': 'Other', Action: 'BRW', Symbol: 'SYNJ',
      Description: 'SYNTHETIC USD ETF JOURNAL POSITION TO USD', ...ZERO, Quantity: '-100.00000', 'Net Amount': '0.00', Currency: 'CAD' }),
    qtRow({ 'Transaction Date': '2026-04-02', 'Settlement Date': '2026-04-02', 'Activity Type': 'FX conversion', Action: 'FXT', Symbol: '',
      Description: 'SYNTHETIC CONVERSION - CAD/USD', ...ZERO, 'Net Amount': '1000.00', Currency: 'USD' }),
    qtRow({ 'Transaction Date': '2026-04-02', 'Settlement Date': '2026-04-02', 'Activity Type': 'FX conversion', Action: 'FXT', Symbol: '',
      Description: 'SYNTHETIC CONVERSION - CAD/USD', ...ZERO, 'Net Amount': '-1370.00', Currency: 'CAD' }),
    qtRow({ 'Transaction Date': '2026-03-20', 'Settlement Date': '2026-03-20', 'Activity Type': 'Dividends', Action: 'DIS', Symbol: 'SYNS',
      Description: 'SYNTHETIC SPLIT ETF STK SPLIT ON 9 SHS REC 03/18/26 PAY 03/20/26', ...ZERO, Quantity: '9.00000', 'Net Amount': '0.00' }),
    qtRow({ Symbol: 'SYNS.TO', Quantity: '9.00000', Price: '30.00000000', 'Gross Amount': '-270.00', Commission: '-0.99', 'Net Amount': '-270.99' }),
    qtRow({ Symbol: 'SYNJ.TO', Quantity: '100.00000', Price: '13.00000000', 'Gross Amount': '-1300.00', 'Net Amount': '-1300.00' })
  ]);

  const first = await preview(body(content));
  const byRow = Object.fromEntries(first.rows.map(row => [row.rowNumber, row]));
  assert.deepEqual(first.rows.map(row => row.rowNumber), [8, 7, 6, 5, 4, 3, 2]);
  // 换汇：同日一 CAD 一 USD → 建议配对
  assert.deepEqual([byRow[4].candidate.action, byRow[4].pair?.source, byRow[4].pair?.partnerRowNumber], ['fx', 'suggested', 5]);
  // 拆股：比例 = (9 + 9) : 9 = 2
  assert.deepEqual([byRow[6].disposition, byRow[6].candidate.action, byRow[6].candidate.quantity, byRow[6].candidate.splitRatio],
    ['add', 'split', 9, 2]);
  // 划转：转入端为另一币种上市代码，待提供代码映射（依赖证据缺失 → 阻塞）
  assert.deepEqual([byRow[2].code, byRow[2].symbolMapKey, byRow[2].candidate.transferCost, byRow[2].candidate.transferCostCurrency],
    ['SYMBOL_UNMAPPED', 'SYNJ@USD', 1020, 'USD']);
  assert.equal(byRow[2].candidate.pairGroup, byRow[3].candidate.pairGroup);
  assert.equal(first.blocking, true);

  const input = body(content, { symbolMap: { 'SYNJ@USD': 'SYNJ.U.TO' } });
  const { preview: second, commit } = await previewAndCommit(input);
  assert.equal(second.blocking, false, JSON.stringify(second.blockingReasons));
  assert.equal(second.counts.add, 7, JSON.stringify(second.rows.map(row => [row.rowNumber, row.disposition, row.code])));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));

  const txs = await ledger();
  assert.equal(txs.length, 7);
  const fxLegs = txs.filter(tx => tx.action === 'fx');
  assert.equal(fxLegs.length, 2);
  assert.equal(fxLegs[0].pairGroupId, fxLegs[1].pairGroupId);
  const transferIn = txs.find(tx => tx.action === 'transfer_in');
  assert.equal(transferIn.symbol, 'SYNJ.U.TO');
  const pos = await positions();
  const list = pos.positions || pos;
  assert.equal(list.find(p => p.symbol === 'SYNS.TO').quantity, 18);
  assert.equal(list.find(p => p.symbol === 'SYNJ.TO'), undefined);
  const usdLine = list.find(p => p.symbol === 'SYNJ.U.TO');
  assert.equal(usdLine.quantity, 100);
  assert.equal(usdLine.totalCost ?? usdLine.costBasis, 1020);
});

test('另存为普通工作簿（数值与日期单元格）同样可导入', async (t) => {
  freshWorld(t);
  const content = await plainXlsx([{
    ...qtRow({}),
    'Transaction Date': new Date('2026-03-02T00:00:00.000Z'),
    'Settlement Date': new Date('2026-03-03T00:00:00.000Z'),
    Quantity: 10, Price: 20, 'Gross Amount': -200, Commission: -1.5, 'Net Amount': -201.5
  }]);
  const data = await preview(body(content));
  assert.equal(data.counts.add, 1, JSON.stringify(data.rows));
  const [row] = data.rows;
  assert.deepEqual([row.candidate.localDate, row.candidate.quantity, row.candidate.price, row.candidate.fee, row.candidate.cashAmount],
    ['2026-03-02', 10, 20, 1.5, -201.5]);
  assert.equal(new Date(row.candidate.settlementDate).toISOString(), '2026-03-03T00:00:00.000Z');
});

test('文件与行级错误：非 base64 传输、缺 Activities 工作表、非 XLSX 内容返回 400；不支持的活动类型按行报错并保留原类型', async (t) => {
  freshWorld(t);
  const valid = await questradeXlsx([qtRow({})]);
  const text = await call('POST', '/api/transactions/import/preview', body(valid, { file: { name: 'a.xlsx', content: 'abc' } }));
  assert.equal(text.status, 400);
  assert.equal(text.body.code, 'INVALID_IMPORT_FILE');

  const wrongSheet = await call('POST', '/api/transactions/import/preview', body(await questradeXlsx([qtRow({})], { sheetName: 'Summary' })));
  assert.equal(wrongSheet.status, 400);
  assert.equal(wrongSheet.body.code, 'INVALID_IMPORT_FILE');
  assert.match(wrongSheet.body.message, /Activities/);

  const notXlsx = await call('POST', '/api/transactions/import/preview', body(Buffer.from('a,b,c\n1,2,3\n').toString('base64')));
  assert.equal(notXlsx.status, 400);
  assert.equal(notXlsx.body.code, 'INVALID_IMPORT_FILE');

  const badMap = await call('POST', '/api/transactions/import/preview', body(valid, { symbolMap: { SYNQ: 'synq' } }));
  assert.equal(badMap.status, 400);
  assert.equal(badMap.body.code, 'INVALID_SYMBOL_MAP');

  const data = await preview(body(await questradeXlsx([
    qtRow({ 'Activity Type': 'Other', Action: 'XYZ', Symbol: '', ...ZERO, 'Net Amount': '5.00' }),
    qtRow({ 'Activity Type': 'Trades', Action: 'Buy', Commission: '0.50' })
  ])));
  const byRow = Object.fromEntries(data.rows.map(row => [row.rowNumber, row]));
  assert.equal(byRow[2].code, 'UNSUPPORTED_ACTIVITY');
  assert.match(byRow[2].reason, /Other \/ XYZ/);
  // 正数佣金（返佣）不猜方向：按无效数字报错
  assert.equal(byRow[3].disposition, 'error');
  assert.equal(byRow[3].code, 'INVALID_NUMBER');
});
