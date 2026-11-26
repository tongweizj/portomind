// 标准 CSV（TASK-094）：模板、列映射与逐行规范化。
// 唯一来源：模板表头、各活动类型必填规则、错误原因都由本文件生成，客户端不持有任何规则。
// 后续工单扩展：在 ACTIVITY_RULES 打开新类型（#97 分红/现金、#101 换汇、#98 拆股、#99 划转）。

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { parseCsv, toCsvLine } = require('./csv');
const { ASSET_MARKETS, ASSET_CURRENCIES } = require('../../constants/asset.constants');

dayjs.extend(utc);
dayjs.extend(timezone);

// 列顺序即模板表头顺序（snake_case 英文，便于用户借助 ChatGPT 转换其他券商报表）。
const STANDARD_COLUMNS = Object.freeze([
  { key: 'activity_type', label: '活动类型', description: 'buy / sell（其他类型陆续开放）' },
  { key: 'trade_date', label: '成交日期', description: 'YYYY-MM-DD' },
  { key: 'trade_time', label: '成交时间', description: 'HH:MM 或 HH:MM:SS；填写（含 00:00:00）即保留时刻精度' },
  { key: 'time_zone', label: '时区', description: 'IANA 时区名，如 America/Toronto、Asia/Shanghai；有成交时间而留空时，预览要求在页面确认北京或多伦多时区' },
  { key: 'settlement_date', label: '结算日', description: 'YYYY-MM-DD；留空表示未知' },
  { key: 'external_id', label: '原成交编号', description: '券商成交编号；没有则留空' },
  { key: 'source_row', label: '原行号', description: '原始报表中的行号；留空时预览使用上传文件行号' },
  { key: 'pair_group', label: '配对组号', description: '换汇 / 划转两条流水的共同组号（成对流水不拆批）' },
  { key: 'account_number', label: '账号', description: '可选；多账户报表按账号拆分，只保存哈希与末 4 位' },
  { key: 'symbol', label: '标的代码', description: '如 VTI、XEQT.TO、510300' },
  { key: 'market', label: '市场', description: `${ASSET_MARKETS.join(' / ')}；代码无市场后缀时必填` },
  { key: 'quantity', label: '数量', description: '正数；卖出可填负数（取绝对值）' },
  { key: 'unit_price', label: '单价', description: '大于 0' },
  { key: 'cash_amount', label: '现金金额', description: '券商带符号现金净额（流出为负，流入为正）' },
  { key: 'cash_currency', label: '币种', description: ASSET_CURRENCIES.join(' / ') },
  { key: 'commission', label: '佣金', description: '绝对值；留空表示未知（不等于 0），明确为 0 请填 0' },
  { key: 'transfer_cost', label: '划转成本', description: '证券转入的承接成本（后续开放）' },
  { key: 'transfer_cost_currency', label: '划转成本币种', description: '后续开放' },
  { key: 'notes', label: '备注', description: '≤500 字' }
]);

const COLUMN_KEYS = STANDARD_COLUMNS.map(column => column.key);

// 每个活动类型的必填字段与写入动作。supported=false 的类型已知但尚未开放，按行报「暂不支持」。
const ACTIVITY_RULES = Object.freeze({
  buy: { supported: true, action: 'buy', required: ['trade_date', 'symbol', 'quantity', 'unit_price', 'cash_currency'] },
  sell: { supported: true, action: 'sell', required: ['trade_date', 'symbol', 'quantity', 'unit_price', 'cash_currency'] },
  div_cash: { supported: false },
  div_reinvest: { supported: false },
  tax: { supported: false },
  interest: { supported: false },
  cash_in: { supported: false },
  cash_out: { supported: false },
  fee: { supported: false },
  fx: { supported: false },
  split: { supported: false },
  transfer_in: { supported: false },
  transfer_out: { supported: false }
});

const TEMPLATE_EXAMPLES = [
  {
    activity_type: 'buy', trade_date: '2026-01-05', trade_time: '10:30:00', time_zone: 'America/Toronto',
    settlement_date: '2026-01-06', external_id: 'T-0001', source_row: '2', symbol: 'VTI', market: 'US',
    quantity: '10', unit_price: '250.00', cash_amount: '-2501.00', cash_currency: 'USD', commission: '1.00',
    notes: '示例：买入'
  },
  {
    activity_type: 'sell', trade_date: '2026-02-10', settlement_date: '2026-02-11', source_row: '3',
    symbol: 'VTI', market: 'US', quantity: '-4', unit_price: '260.00', cash_amount: '1040.00',
    cash_currency: 'USD', commission: '0', notes: '示例：卖出（仅日期精度，无原成交编号）'
  }
];

function buildTemplate() {
  const lines = [toCsvLine(COLUMN_KEYS)];
  for (const example of TEMPLATE_EXAMPLES) lines.push(toCsvLine(COLUMN_KEYS.map(key => example[key] ?? '')));
  return `${lines.join('\r\n')}\r\n`;
}

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** 自动映射：表头与标准列名一致（忽略大小写/空格/连字符）即映射。 */
function autoMapping(headers) {
  const mapping = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (COLUMN_KEYS.includes(key) && !Object.values(mapping).includes(key)) mapping[index] = key;
  });
  return mapping;
}

function rowError(code, reason) {
  return { code, reason };
}

/** 用户手动列映射校验：{ <表头列序号>: <标准列名> }，一列一字段。 */
function validateMapping(mapping, headerCount) {
  if (mapping === undefined || mapping === null) return null;
  if (typeof mapping !== 'object' || Array.isArray(mapping)) return 'mapping must be an object';
  const used = new Set();
  for (const [index, key] of Object.entries(mapping)) {
    if (!/^\d+$/.test(index) || Number(index) >= headerCount) return `mapping column ${index} is out of range`;
    if (key === '' || key === null) continue;
    if (!COLUMN_KEYS.includes(key)) return `mapping target ${key} is not a standard column`;
    if (used.has(key)) return `mapping target ${key} is used more than once`;
    used.add(key);
  }
  return null;
}

function cleanMapping(mapping) {
  const out = {};
  for (const [index, key] of Object.entries(mapping || {})) if (key) out[index] = key;
  return out;
}

function parseNumber(value) {
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (text === '') return { blank: true };
  const number = Number(text);
  return Number.isFinite(number) ? { value: number } : { invalid: true };
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs.utc(value, 'YYYY-MM-DD').format('YYYY-MM-DD') === value;
}

function isTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * 单行规范化：原始字段 → 候选流水（尚未解析标的、未做匹配）。
 * 返回 { candidate } 或 { error: { code, reason } }。
 */
function normalizeRow(fields, { defaultTimeZone } = {}) {
  const activity = String(fields.activity_type ?? '').trim().toLowerCase();
  if (!activity) return { error: rowError('MISSING_FIELD', '缺少活动类型（activity_type）') };
  const rule = ACTIVITY_RULES[activity];
  if (!rule) return { error: rowError('UNKNOWN_ACTIVITY', `未知活动类型：${fields.activity_type}`) };
  if (!rule.supported) return { error: rowError('UNSUPPORTED_ACTIVITY', `活动类型 ${activity} 暂不支持导入`) };

  const missing = rule.required.filter(key => String(fields[key] ?? '').trim() === '');
  if (missing.length) return { error: rowError('MISSING_FIELD', `缺少关键字段：${missing.join(', ')}`) };

  const tradeDate = String(fields.trade_date).trim();
  if (!isDate(tradeDate)) return { error: rowError('INVALID_DATE', `成交日期格式无效：${tradeDate}（应为 YYYY-MM-DD）`) };

  const tradeTime = String(fields.trade_time ?? '').trim();
  let date;
  let dateKind = 'date';
  let timeZoneName = null;
  let timeZoneSource = null;
  let localTime = null;
  if (tradeTime) {
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(tradeTime)) {
      return { error: rowError('INVALID_TIME', `成交时间格式无效：${tradeTime}（应为 HH:MM[:SS]）`) };
    }
    localTime = tradeTime.length === 5 ? `${tradeTime}:00` : tradeTime;
    dateKind = 'datetime';
    const reportZone = String(fields.time_zone ?? '').trim();
    timeZoneName = reportZone || defaultTimeZone || null;
    timeZoneSource = reportZone ? 'report' : (timeZoneName ? 'user' : null);
    if (timeZoneName && !isTimeZone(timeZoneName)) return { error: rowError('INVALID_TIME_ZONE', `时区无效：${timeZoneName}`) };
    if (timeZoneName) {
      const parsed = dayjs.tz(`${tradeDate} ${localTime}`, 'YYYY-MM-DD HH:mm:ss', timeZoneName);
      if (!parsed.isValid()) return { error: rowError('INVALID_TIME', `成交时间无效：${tradeTime}`) };
      date = parsed.utc().toDate();
    } else {
      // TASK-096：有时间无时区 → 不猜时刻（date=null），由预览要求用户确认北京 / 多伦多时区。
      date = null;
    }
  } else {
    // 仅日期精度：与手动录入一致，存为该日 UTC 零点，dateKind 标明精度（不伪造时刻）。
    date = new Date(`${tradeDate}T00:00:00.000Z`);
  }

  const settlementText = String(fields.settlement_date ?? '').trim();
  if (settlementText && !isDate(settlementText)) {
    return { error: rowError('INVALID_DATE', `结算日格式无效：${settlementText}`) };
  }

  const quantity = parseNumber(fields.quantity);
  const price = parseNumber(fields.unit_price);
  const commission = parseNumber(fields.commission);
  const cash = parseNumber(fields.cash_amount);
  if (quantity.invalid || !quantity.value) return { error: rowError('INVALID_NUMBER', `数量无效：${fields.quantity}`) };
  if (price.invalid || !(price.value > 0)) return { error: rowError('INVALID_NUMBER', `单价必须大于 0：${fields.unit_price}`) };
  if (commission.invalid || (commission.value !== undefined && commission.value < 0)) {
    return { error: rowError('INVALID_NUMBER', `佣金无效：${fields.commission}`) };
  }
  if (cash.invalid) return { error: rowError('INVALID_NUMBER', `现金金额无效：${fields.cash_amount}`) };
  if (rule.action === 'buy' && quantity.value < 0) {
    return { error: rowError('INVALID_NUMBER', '买入数量不能为负数') };
  }

  const cashCurrency = String(fields.cash_currency).trim().toUpperCase();
  if (!ASSET_CURRENCIES.includes(cashCurrency)) {
    return { error: rowError('INVALID_CURRENCY', `币种无效：${fields.cash_currency}`) };
  }
  const market = String(fields.market ?? '').trim().toUpperCase();
  if (market && !ASSET_MARKETS.includes(market)) return { error: rowError('INVALID_MARKET', `市场无效：${fields.market}`) };

  const notes = String(fields.notes ?? '').trim();
  if (notes.length > 500) return { error: rowError('INVALID_NOTES', '备注超过 500 字') };

  const absQuantity = Math.abs(quantity.value);
  const grossAmount = absQuantity * price.value;
  let fee = commission.blank ? null : commission.value;
  let feeSource = commission.blank ? 'unknown' : 'broker';
  // 佣金缺失但有券商现金净额：按 |净额| 与成交金额之差推算（预览标明推算值）。
  if (fee === null && cash.value !== undefined) {
    const derived = rule.action === 'buy' ? Math.abs(cash.value) - grossAmount : grossAmount - Math.abs(cash.value);
    const rounded = Math.round(derived * 1e6) / 1e6;
    if (rounded >= 0) { fee = rounded; feeSource = 'derived'; }
  }

  return {
    candidate: {
      activityType: activity,
      action: rule.action,
      rawSymbol: String(fields.symbol).trim(),
      market: market || null,
      date,
      dateKind,
      timeZone: timeZoneName,
      timeZoneSource,
      needsTimeZone: dateKind === 'datetime' && !timeZoneName,
      localDate: tradeDate,
      localTime,
      // 结算日独立于成交日保存；缺失标记 unknown（不以成交日代替）
      settlementDate: settlementText ? new Date(`${settlementText}T00:00:00.000Z`) : null,
      settlementStatus: settlementText ? 'known' : 'unknown',
      quantity: absQuantity,
      price: price.value,
      grossAmount,
      fee,
      feeSource,
      cashAmount: cash.value ?? null,
      cashCurrency,
      cashAmountSource: cash.value === undefined ? null : 'broker',
      externalId: String(fields.external_id ?? '').trim() || null,
      sourceRow: String(fields.source_row ?? '').trim() || null,
      pairGroup: String(fields.pair_group ?? '').trim() || null,
      accountNumber: String(fields.account_number ?? '').trim() || null,
      notes
    }
  };
}

/**
 * 解析标准 CSV 文本：返回 { headers, mapping, rows }。
 * rows[i] = { rowKey, fileLine, rowNumber, rowNumberKind, fields, candidate?, error? }。
 */
function parseStandardCsv(text, { mapping, defaultTimeZone } = {}) {
  const records = parseCsv(text);
  if (records.length === 0) return { headers: [], mapping: {}, rows: [] };
  const [headerRecord, ...dataRecords] = records;
  const headers = headerRecord.cells.map(cell => cell.trim());
  const effective = mapping ? cleanMapping(mapping) : autoMapping(headers);

  const rows = dataRecords.map(record => {
    const fields = {};
    for (const [index, key] of Object.entries(effective)) fields[key] = record.cells[Number(index)] ?? '';
    const { candidate, error } = normalizeRow(fields, { defaultTimeZone });
    const sourceRow = candidate?.sourceRow ?? (String(fields.source_row ?? '').trim() || null);
    const originalNumber = sourceRow && /^\d+$/.test(sourceRow) ? Number(sourceRow) : null;
    return {
      rowKey: `L${record.line}`,
      fileLine: record.line,
      rowNumber: originalNumber ?? record.line,
      rowNumberKind: originalNumber ? 'original' : 'file',
      fields,
      candidate: candidate || null,
      error: error || null
    };
  });
  return { headers, mapping: effective, rows };
}

module.exports = {
  STANDARD_COLUMNS,
  COLUMN_KEYS,
  ACTIVITY_RULES,
  buildTemplate,
  autoMapping,
  validateMapping,
  normalizeRow,
  parseStandardCsv
};
