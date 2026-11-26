// Questrade 原格式 XLSX（Activities 工作表，TASK-102 / #102）。
// 只做「原报表列 → 标准列」的映射，逐行规范化复用 standardCsv.normalizeRow（规则唯一来源）。
//
// 原报表约定（见 docs/handbook/technical/API_CONTRACT.md「Questrade 原格式」）：
// - 工作簿由 exceljs 在服务端解析；导出包使用 x: 前缀命名空间与非 sheetN 的工作表文件名，
//   exceljs 不识别，读取前先把包规范化（normalizePackage）。全部单元格可能都是字符串。
// - 行按时间倒序（新 → 旧），输出前翻转为正序（#96 sequence 约定）；行号保留原工作表行号。
// - 日期恒为「YYYY-MM-DD 12:00:00 AM」，只取日期（仅日期精度，不涉及时区）。
// - 非零佣金为负数（扣款），映射为正的佣金绝对值；正数佣金（返佣）不猜，按无效报错。
// - 现金类行的数量 / 单价为 0，忽略；金额取 Net Amount（带符号）。
// - 换汇（FXT）：每端一行，不设组号，由预览按同账户同日配对（#101）。
// - 拆股（Dividends / DIS，描述含 SPLIT ON n SHS）：拆股比例 = (n + 份额变动) : n（#98）。
// - 证券划转（Other / BRW，跨币种 journal）：数量负为转出、正为转入；同账户同日同代码一出一入设共同组号；
//   转入行描述中的 BOOK VALUE 为转入币种的承接成本（#99）。
// - 标的可能是裸代码（缺 .TO 后缀）或 Questrade 内部代码：裸代码在 US / CA 已有资产中按报表币种唯一解析；
//   内部代码与跨币种划转的转入端由用户在页面提供代码映射（symbolMap），否则进入待核对，不猜。

const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const standardCsv = require('./standardCsv');

const SHEET_NAME = 'Activities';
const SPREADSHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

const REQUIRED_HEADERS = Object.freeze([
  'Transaction Date', 'Settlement Date', 'Action', 'Symbol', 'Description', 'Quantity', 'Price',
  'Commission', 'Net Amount', 'Currency', 'Account #', 'Activity Type'
]);

// 裸代码可能的市场：Questrade 交易美股与加股
const MARKET_CANDIDATES = Object.freeze(['US', 'CA']);
// Questrade 内部证券代码（如字母 + 6 位数字），不是交易代码
const INTERNAL_CODE = /^[A-Z]\d{5,}$/;

function fileError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'INVALID_IMPORT_FILE';
  return error;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 把非常规但合法的 OOXML 包整理成 exceljs 可读的形状：去 BOM、
 * spreadsheetml 命名空间前缀（x:）改为默认命名空间、工作表文件改名为 sheetN.xml 并同步关系与内容类型。
 */
async function normalizePackage(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw fileError('文件不是有效的 XLSX 工作簿');
  }
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
  const renames = new Map();
  let next = 1;
  const taken = new Set(names.map(name => (/^xl\/worksheets\/sheet(\d+)\.xml$/.exec(name) || [])[1]).filter(Boolean));
  for (const name of names) {
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name) && !/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      while (taken.has(String(next))) next += 1;
      taken.add(String(next));
      renames.set(name, `xl/worksheets/sheet${next}.xml`);
    }
  }
  for (const name of names) {
    if (!/\.(xml|rels)$/i.test(name)) continue;
    let xml = (await zip.file(name).async('string')).replace(/^\uFEFF/, '');
    const prefix = new RegExp(`xmlns:(\\w+)="${escapeRegExp(SPREADSHEET_NS)}"`).exec(xml)?.[1];
    if (prefix) {
      xml = xml
        .replace(new RegExp(`<(/?)${prefix}:`, 'g'), '<$1')
        .replace(new RegExp(`xmlns:${prefix}="`, 'g'), 'xmlns="');
    }
    for (const [from, to] of renames) {
      const tail = from.slice('xl/'.length);
      xml = xml.split(`/${from}"`).join(`/${to}"`).split(`"${tail}"`).join(`"${to.slice('xl/'.length)}"`);
    }
    zip.file(name, xml);
  }
  for (const [from, to] of renames) {
    zip.file(to, await zip.file(from).async('nodebuffer'));
    zip.remove(from);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('');
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return String(value.text);
    return '';
  }
  return String(value).trim();
}

async function readActivitiesSheet(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await normalizePackage(buffer));
  } catch (error) {
    if (error.code === 'INVALID_IMPORT_FILE') throw error;
    throw fileError('文件不是有效的 XLSX 工作簿');
  }
  const sheet = workbook.worksheets.find(item => item.name.trim().toLowerCase() === SHEET_NAME.toLowerCase());
  if (!sheet) throw fileError(`工作簿中没有 ${SHEET_NAME} 工作表`);
  const headerValues = sheet.getRow(1).values || [];
  const headers = [];
  for (let column = 1; column < headerValues.length; column += 1) headers.push(cellText(headerValues[column]));
  const records = [];
  for (let line = 2; line <= sheet.rowCount; line += 1) {
    const values = sheet.getRow(line).values || [];
    const raw = {};
    let blank = true;
    headers.forEach((header, index) => {
      const text = cellText(values[index + 1]);
      if (text) blank = false;
      if (header) raw[header.toLowerCase()] = text;
    });
    if (!blank) records.push({ line, raw });
  }
  return { headers: headers.filter(Boolean), records };
}

function datePart(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? '').trim());
  return match ? match[1] : String(value ?? '').trim();
}

function numberOf(value) {
  const text = String(value ?? '').trim().replace(/,/g, '');
  return text === '' ? NaN : Number(text);
}

function trimNumber(value) {
  return String(Number(value.toFixed(8)));
}

/** 原报表 Activity Type / Action → 标准活动类型；不支持返回 { activity: null, reason }。 */
function activityOf(raw) {
  const type = raw['activity type'] || '';
  const action = (raw.action || '').toUpperCase();
  const net = numberOf(raw['net amount']);
  const quantity = numberOf(raw.quantity);
  const description = raw.description || '';
  switch (type) {
    case 'Trades':
      if (action === 'BUY') return { activity: 'buy' };
      if (action === 'SELL') return { activity: 'sell' };
      break;
    case 'Dividends':
      if (action === 'DIS') {
        return /\bSPLIT\b/i.test(description) ? { activity: 'split' } : { activity: null, reason: '非拆股的股份分派（DIS）' };
      }
      if (net > 0) return { activity: 'div_cash' };
      return { activity: null, reason: '分红金额不为正（可能是预扣税或冲正，需人工核对）' };
    case 'FX conversion':
      return { activity: 'fx' };
    case 'Other':
      if (action === 'BRW') {
        if (quantity < 0) return { activity: 'transfer_out' };
        if (quantity > 0) return { activity: 'transfer_in' };
      }
      break;
    case 'Fees and rebates':
      if (net < 0) return { activity: 'fee' };
      return { activity: null, reason: '返还（正数金额）暂不支持导入' };
    case 'Deposits':
      if (net > 0) return { activity: 'cash_in' };
      break;
    case 'Withdrawals':
      if (net < 0) return { activity: 'cash_out' };
      break;
    case 'Interest':
      return { activity: 'interest' };
    default:
      break;
  }
  return { activity: null };
}

// 拆股描述「… SPLIT ON n SHS …」：n 为拆股前份额，比例 = (n + 份额变动) : n
function splitRatioOf(description, quantity) {
  const match = /SPLIT ON\s+([0-9]+(?:\.[0-9]+)?)\s+SHS/i.exec(description);
  const before = match ? Number(match[1]) : NaN;
  if (!(before > 0) || !Number.isFinite(quantity) || before + quantity <= 0) return '';
  return `${trimNumber(before + quantity)}:${trimNumber(before)}`;
}

function bookValueOf(description) {
  const match = /BOOK VALUE:\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i.exec(description);
  return match ? match[1].replace(/,/g, '') : '';
}

function toStandardFields(raw, activity, line) {
  const description = raw.description || '';
  const fields = {
    activity_type: activity || '',
    trade_date: datePart(raw['transaction date']),
    settlement_date: datePart(raw['settlement date']),
    source_row: String(line),
    account_number: raw['account #'],
    symbol: raw.symbol,
    quantity: '',
    unit_price: '',
    commission: '',
    cash_amount: raw['net amount'],
    cash_currency: raw.currency,
    notes: description.slice(0, 500)
  };
  if (activity === 'buy' || activity === 'sell') {
    const commission = numberOf(raw.commission);
    fields.quantity = raw.quantity;
    fields.unit_price = raw.price;
    // 原报表扣款佣金为负数；0 保留为明确的零佣金
    fields.commission = Number.isFinite(commission) ? (commission === 0 ? '0' : String(-commission)) : raw.commission;
  } else if (activity === 'split') {
    fields.quantity = raw.quantity;
    fields.split_ratio = splitRatioOf(description, numberOf(raw.quantity));
    fields.cash_amount = '';
  } else if (activity === 'transfer_out' || activity === 'transfer_in') {
    fields.quantity = raw.quantity;
    fields.cash_amount = '';
    if (activity === 'transfer_in') {
      fields.transfer_cost = bookValueOf(description);
      if (fields.transfer_cost) fields.transfer_cost_currency = raw.currency;
    }
  } else if (activity === 'fx') {
    fields.symbol = '';
  }
  return fields;
}

function bareSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

// 证券划转：同账户同日同代码恰好一出一入 → 共同组号；跨币种时转入端是另一币种的上市代码，须用户映射
function pairTransfers(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (entry.activity !== 'transfer_out' && entry.activity !== 'transfer_in') continue;
    const key = [entry.raw['account #'], entry.fields.trade_date, bareSymbol(entry.raw.symbol)].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  for (const legs of groups.values()) {
    const out = legs.filter(leg => leg.activity === 'transfer_out');
    const into = legs.filter(leg => leg.activity === 'transfer_in');
    if (out.length !== 1 || into.length !== 1) continue;
    const group = `qt-brw-${out[0].fields.trade_date}-${bareSymbol(out[0].raw.symbol)}`;
    out[0].fields.pair_group = group;
    into[0].fields.pair_group = group;
    const crossCurrency = (out[0].raw.currency || '') !== (into[0].raw.currency || '');
    if (crossCurrency && !/\.[A-Z]+$/i.test(into[0].raw.symbol || '')) into[0].symbolMapRequired = 'TRANSFER_LISTING';
  }
}

/**
 * 解析 Questrade 原格式 XLSX：返回 { headers, mapping: {}, rows, missingColumns }（同 PARSERS 契约）。
 * 输入为工作簿二进制（Buffer）；行按时间正序输出。
 */
async function parseQuestradeXlsx(buffer) {
  const { headers, records } = await readActivitiesSheet(buffer);
  const present = new Set(headers.map(header => header.toLowerCase()));
  const missingColumns = REQUIRED_HEADERS.filter(header => !present.has(header.toLowerCase()));

  const entries = records.map(({ line, raw }) => {
    const { activity, reason } = activityOf(raw);
    return { line, raw, activity, reason, fields: toStandardFields(raw, activity, line) };
  });
  pairTransfers(entries);

  const rows = entries.map(entry => {
    let candidate = null;
    let error = null;
    if (!entry.activity) {
      const type = entry.raw['activity type'] || '（空）';
      error = {
        code: 'UNSUPPORTED_ACTIVITY',
        reason: `Questrade 活动类型 ${type}${entry.raw.action ? ` / ${entry.raw.action}` : ''} 暂不支持导入${entry.reason ? `：${entry.reason}` : ''}`
      };
    } else {
      ({ candidate, error } = standardCsv.normalizeRow(entry.fields));
    }
    if (candidate) {
      candidate.marketCandidates = MARKET_CANDIDATES;
      // Questrade 的 Currency 是该行证券的交易币种：裸代码按此在 US / CA 资产中消歧
      candidate.listingCurrency = String(entry.raw.currency || '').toUpperCase() || null;
      const symbol = bareSymbol(entry.raw.symbol);
      if (symbol && INTERNAL_CODE.test(symbol)) candidate.symbolMapRequired = 'INTERNAL_CODE';
      if (entry.symbolMapRequired) candidate.symbolMapRequired = entry.symbolMapRequired;
    }
    return {
      rowKey: `R${entry.line}`,
      fileLine: entry.line,
      rowNumber: entry.line,
      rowNumberKind: 'original',
      fields: entry.fields,
      candidate: candidate || null,
      error: error || null
    };
  });
  // 原报表新 → 旧；#96 要求旧 → 新（同日仅日期精度的行按此顺序重放）
  rows.reverse();
  return { headers, mapping: {}, rows, missingColumns };
}

module.exports = { parseQuestradeXlsx, normalizePackage, REQUIRED_HEADERS };
