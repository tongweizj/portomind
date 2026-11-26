// 流水导入输入层（代码审查 T5 自 index.js 拆出）：请求体校验、文件解码、格式 → 解析器、代码映射（symbolMap，#102）。

const mongoose = require('mongoose');
const { marketFromSuffix } = require('../../utils/symbol');
const {
  IMPORT_FORMATS,
  BINARY_IMPORT_FORMATS,
  IMPORT_TIME_ZONE_CHOICES
} = require('../../constants/import.constants');
const standardCsv = require('./standardCsv');
const wealthsimpleCsv = require('./wealthsimpleCsv');
const questradeXlsx = require('./questradeXlsx');
const { businessError, markReview } = require('./common');

// 格式 → 解析器。解析器契约：(content, { mapping, defaultTimeZone }) → { headers, mapping, rows, missingColumns? }
// （可返回 Promise）。文本格式 content 为字符串；二进制格式（BINARY_IMPORT_FORMATS，如 Questrade XLSX）为 Buffer。
// rows 必须按时间正序（旧 → 新）输出（#96：sequence 即同时刻重放顺序）。
// 原格式解析器（非 standard）自带列识别，不接受手动列映射，并自行报告缺失的原报表列（missingColumns）。
const PARSERS = {
  standard: standardCsv.parseStandardCsv,
  wealthsimple: wealthsimpleCsv.parseWealthsimpleCsv,
  questrade: questradeXlsx.parseQuestradeXlsx
};

function decodeFile(file, format) {
  if (!file || typeof file !== 'object' || typeof file.content !== 'string') {
    throw businessError(400, 'INVALID_IMPORT_FILE', 'file.content must be a string');
  }
  const encoding = file.encoding || 'text';
  if (!['text', 'base64'].includes(encoding)) throw businessError(400, 'INVALID_IMPORT_FILE', 'file.encoding must be text or base64');
  const name = file.name === undefined ? '' : String(file.name).slice(0, 255);
  if (BINARY_IMPORT_FORMATS.includes(format)) {
    if (encoding !== 'base64') throw businessError(400, 'INVALID_IMPORT_FILE', `format ${format} requires file.encoding = base64`);
    return { content: Buffer.from(file.content, 'base64'), name };
  }
  const text = encoding === 'base64' ? Buffer.from(file.content, 'base64').toString('utf8') : file.content;
  return { content: text, name };
}

// 代码映射（#102）：报表代码 → 资产库存储代码（带市场后缀）。键为「代码@币种」（优先）或「代码」。
// 内部代码与跨币种划转的转入端（candidate.symbolMapRequired）没有映射时进入待核对，不猜。
const SYMBOL_MAP_REASONS = Object.freeze({
  INTERNAL_CODE: '报表使用券商内部证券代码，无法对应资产库代码',
  TRANSFER_LISTING: '跨币种划转的转入端是该证券另一币种的上市代码，报表代码无法区分'
});

function symbolMapKeyOf(candidate) {
  return `${String(candidate.rawSymbol || '').trim().toUpperCase()}@${candidate.listingCurrency || candidate.cashCurrency || ''}`;
}

function applySymbolMap(rows, symbolMap) {
  for (const row of rows) {
    if (row.disposition !== 'pending' || !row.candidate?.rawSymbol) continue;
    const key = symbolMapKeyOf(row.candidate);
    const mapped = symbolMap[key] ?? symbolMap[key.split('@')[0]];
    if (mapped) {
      row.candidate.mappedFrom = row.candidate.rawSymbol;
      row.candidate.rawSymbol = mapped;
      row.candidate.market = null;
      row.candidate.marketCandidates = null;
      row.candidate.symbolMapRequired = null;
      row.symbolMapKey = key;
      continue;
    }
    if (!row.candidate.symbolMapRequired) continue;
    markReview(row, 'SYMBOL_UNMAPPED', `${SYMBOL_MAP_REASONS[row.candidate.symbolMapRequired]}：请在代码映射中为 ${key} 指定资产代码（如 VTI.US、XEQT.TO），或跳过此行`, ['symbolMap', 'skip']);
    row.symbolMapKey = key;
  }
}

function validateSymbolMap(symbolMap) {
  if (symbolMap === undefined || symbolMap === null) return;
  const entries = typeof symbolMap === 'object' && !Array.isArray(symbolMap) ? Object.entries(symbolMap) : null;
  if (!entries || entries.length > 500) {
    throw businessError(400, 'INVALID_SYMBOL_MAP', 'symbolMap must be an object of at most 500 entries');
  }
  for (const [key, value] of entries) {
    if (typeof value !== 'string' || !marketFromSuffix(value.trim().toUpperCase()) || value !== value.trim().toUpperCase() || !key.trim()) {
      throw businessError(400, 'INVALID_SYMBOL_MAP', `symbolMap[${key}] must be an upper-case storage symbol with a market suffix (e.g. VTI.US, XEQT.TO)`);
    }
  }
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw businessError(400, 'INVALID_BODY', 'request body must be an object');
  }
  if (!mongoose.Types.ObjectId.isValid(input.portfolioId)) {
    throw businessError(400, 'INVALID_PORTFOLIO_ID', 'Invalid or missing portfolioId');
  }
  const format = input.format || 'standard';
  if (!IMPORT_FORMATS.includes(format)) {
    throw businessError(400, 'UNSUPPORTED_FORMAT', `format must be one of: ${IMPORT_FORMATS.join(', ')}`);
  }
  if (input.resolutions !== undefined && (typeof input.resolutions !== 'object' || Array.isArray(input.resolutions) || input.resolutions === null)) {
    throw businessError(400, 'INVALID_RESOLUTIONS', 'resolutions must be an object keyed by rowKey');
  }
  validateSymbolMap(input.symbolMap);
  // TASK-096：页面确认的时区只允许北京 / 多伦多（报表自带 time_zone 列不受此限制）
  if (input.timeZone !== undefined && input.timeZone !== null && input.timeZone !== '' &&
      !IMPORT_TIME_ZONE_CHOICES.includes(input.timeZone)) {
    throw businessError(400, 'INVALID_TIME_ZONE', `timeZone must be one of: ${IMPORT_TIME_ZONE_CHOICES.join(', ')}`);
  }
  return format;
}

module.exports = { PARSERS, decodeFile, applySymbolMap, validateInput };
