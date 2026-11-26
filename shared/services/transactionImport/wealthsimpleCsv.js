// Wealthsimple 原格式 CSV（activities export，TASK-100 / #100）。
// 只做「原报表列 → 标准列」的映射，逐行规范化复用 standardCsv.normalizeRow（规则唯一来源）。
//
// 原报表约定（见 docs/handbook/technical/API_CONTRACT.md「Wealthsimple 原格式」）：
// - 买卖方向来自 activity_sub_type（BUY / SELL）；direction 列恒为 LONG，不参与判定；卖出数量为负。
// - currency 是现金（结算）币种，不是标的上市币种：美股成交与分红也以 CAD 记账；
//   跨币种成交的描述带「FX Rate: <CAD/USD>」，用于把单价换回资产币种（不猜汇率，缺失则报错）。
// - 现金类行（Dividend / Tax / Interest / MoneyMovement）的 quantity 重复现金金额，忽略；金额取 net_cash_amount。
// - 无时区、无原成交编号、无原行号：行号用上传文件行号，时刻由用户确认北京 / 多伦多时区。
// - 标的为裸代码（无交易所后缀），在 US / CA 已有资产中唯一解析（见 index.js resolveAssets）。
// - 行按时间正序（旧 → 新），满足 #96 的 sequence 约定，无需翻转。

const { parseCsv } = require('./csv');
const standardCsv = require('./standardCsv');

const REQUIRED_HEADERS = Object.freeze([
  'effective_date', 'activity_type', 'activity_sub_type', 'symbol', 'currency',
  'quantity', 'unit_price', 'commission', 'net_cash_amount'
]);

// 裸代码可能的市场：Wealthsimple 交易美股与加股
const MARKET_CANDIDATES = Object.freeze(['US', 'CA']);

const TRADE_SUB_TYPES = Object.freeze({ BUY: 'buy', SELL: 'sell' });
const CASH_TYPES = Object.freeze({ Dividend: 'div_cash', Tax: 'tax', Interest: 'interest' });

/** 原报表 activity_type / activity_sub_type → 标准活动类型；不支持返回 null。 */
function activityOf(type, subType, netCash) {
  if (type === 'Trade') return TRADE_SUB_TYPES[subType] || null;
  if (CASH_TYPES[type]) return CASH_TYPES[type];
  // 现金划转（EFT 存取款、Interac e-Transfer 等）：方向按券商净额符号
  if (type === 'MoneyMovement') {
    const amount = Number(String(netCash ?? '').trim());
    if (!Number.isFinite(amount) || amount === 0) return null;
    return amount > 0 ? 'cash_in' : 'cash_out';
  }
  return null;
}

function reportFxRateOf(description) {
  const match = /FX Rate:\s*([0-9]+(?:\.[0-9]+)?)/i.exec(description);
  const rate = match ? Number(match[1]) : NaN;
  return rate > 0 ? rate : null;
}

function toStandardFields(raw) {
  const type = String(raw.activity_type ?? '').trim();
  const subType = String(raw.activity_sub_type ?? '').trim().toUpperCase();
  const activity = activityOf(type, subType, raw.net_cash_amount);
  const isTrade = type === 'Trade';
  const description = String(raw.description ?? '').trim();
  return {
    type,
    subType,
    activity,
    description,
    fields: {
      activity_type: activity || '',
      trade_date: raw.effective_date,
      trade_time: raw.effective_time,
      settlement_date: raw.settlement_date,
      account_number: raw.account_id,
      symbol: raw.symbol,
      // 现金类行的 quantity 只是金额的重复，不作为数量
      quantity: isTrade ? raw.quantity : '',
      unit_price: isTrade ? raw.unit_price : '',
      commission: isTrade ? raw.commission : '',
      cash_amount: raw.net_cash_amount,
      cash_currency: raw.currency,
      notes: description.slice(0, 500)
    }
  };
}

/**
 * 解析 Wealthsimple 原格式 CSV：返回 { headers, mapping: {}, rows, missingColumns }（同 PARSERS 契约）。
 */
function parseWealthsimpleCsv(text, { defaultTimeZone } = {}) {
  const records = parseCsv(text);
  if (records.length === 0) return { headers: [], mapping: {}, rows: [], missingColumns: [] };
  const [headerRecord, ...dataRecords] = records;
  const headers = headerRecord.cells.map(cell => cell.trim());
  const indexOf = new Map(headers.map((header, index) => [header.toLowerCase(), index]));
  const missingColumns = REQUIRED_HEADERS.filter(key => !indexOf.has(key));

  const rows = dataRecords.map(record => {
    const raw = {};
    for (const [key, index] of indexOf) raw[key] = record.cells[index] ?? '';
    const mapped = toStandardFields(raw);
    let candidate = null;
    let error = null;
    if (!mapped.activity) {
      error = {
        code: 'UNSUPPORTED_ACTIVITY',
        reason: `Wealthsimple 活动类型 ${mapped.type || '（空）'}${mapped.subType ? ` / ${mapped.subType}` : ''} 暂不支持导入`
      };
    } else {
      ({ candidate, error } = standardCsv.normalizeRow(mapped.fields, { defaultTimeZone }));
    }
    if (candidate) {
      candidate.marketCandidates = MARKET_CANDIDATES;
      if (candidate.kind === 'trade') candidate.reportFxRate = reportFxRateOf(mapped.description);
    }
    return {
      rowKey: `L${record.line}`,
      fileLine: record.line,
      rowNumber: record.line,
      rowNumberKind: 'file',
      fields: mapped.fields,
      candidate: candidate || null,
      error: error || null
    };
  });
  return { headers, mapping: {}, rows, missingColumns };
}

module.exports = { parseWealthsimpleCsv, REQUIRED_HEADERS };
