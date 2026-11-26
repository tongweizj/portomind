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
  { key: 'activity_type', label: '活动类型', description: 'buy / sell / div_reinvest / div_cash / tax / interest / cash_in / cash_out / fee / split / fx（划转陆续开放）' },
  { key: 'trade_date', label: '成交日期', description: 'YYYY-MM-DD' },
  { key: 'trade_time', label: '成交时间', description: 'HH:MM 或 HH:MM:SS；填写（含 00:00:00）即保留时刻精度' },
  { key: 'time_zone', label: '时区', description: 'IANA 时区名，如 America/Toronto、Asia/Shanghai；有成交时间而留空时，预览要求在页面确认北京或多伦多时区' },
  { key: 'settlement_date', label: '结算日', description: 'YYYY-MM-DD；留空表示未知' },
  { key: 'external_id', label: '原成交编号', description: '券商成交编号；没有则留空' },
  { key: 'source_row', label: '原行号', description: '原始报表中的行号；留空时预览使用上传文件行号' },
  { key: 'pair_group', label: '配对组号', description: '换汇 / 划转两条流水的共同组号（成对流水不拆批）；换汇未填时按同账户同日配对' },
  { key: 'account_number', label: '账号', description: '可选；多账户报表按账号拆分，只保存哈希与末 4 位' },
  { key: 'symbol', label: '标的代码', description: '如 VTI、XEQT.TO、510300；利息、现金划转、独立费用可留空' },
  { key: 'market', label: '市场', description: `${ASSET_MARKETS.join(' / ')}；代码无市场后缀时必填` },
  { key: 'quantity', label: '数量', description: '正数；卖出可填负数（取绝对值）；现金类流水可留空；拆股填带符号份额变动（拆股增加为正，合股减少为负）' },
  { key: 'unit_price', label: '单价', description: '大于 0；现金类流水可留空' },
  { key: 'cash_amount', label: '现金金额', description: '券商带符号现金净额（流出为负，流入为正）；现金类流水必填（现金分红可由数量×单价推算）；cash_in / cash_out / fee 方向由类型决定' },
  { key: 'cash_currency', label: '币种', description: `实际现金币种（可与资产币种不同）：${ASSET_CURRENCIES.join(' / ')}` },
  { key: 'commission', label: '佣金', description: '成交佣金绝对值；留空表示未知（不等于 0），明确为 0 请填 0；独立费用请单列 fee 行' },
  { key: 'split_ratio', label: '拆股比例', description: '拆股新旧份额比，如 2:1（1 拆 2）、1:10（10 合 1）或 2；可留空，填写时须与拆股前持仓和份额变动一致' },
  { key: 'transfer_cost', label: '划转成本', description: '证券转入的承接成本（后续开放）' },
  { key: 'transfer_cost_currency', label: '划转成本币种', description: '后续开放' },
  { key: 'notes', label: '备注', description: '≤500 字' }
]);

const COLUMN_KEYS = STANDARD_COLUMNS.map(column => column.key);

// 每个活动类型的必填字段与写入动作。supported=false 的类型已知但尚未开放，按行报「暂不支持」。
// kind=trade：影响持仓（标的、数量、单价必填，沿用既有成本规则）；
// kind=cash：纯现金流水（金额 cash_amount 必填，标的可选；数量 / 单价可空）。
// sign：+ / - 表示方向由类型决定（金额取绝对值后加符号）；缺省保留券商符号（如退税、负利息）。
const ACTIVITY_RULES = Object.freeze({
  buy: { supported: true, kind: 'trade', action: 'buy', required: ['trade_date', 'symbol', 'quantity', 'unit_price', 'cash_currency'] },
  sell: { supported: true, kind: 'trade', action: 'sell', required: ['trade_date', 'symbol', 'quantity', 'unit_price', 'cash_currency'] },
  div_reinvest: { supported: true, kind: 'trade', action: 'div_reinvest', required: ['trade_date', 'symbol', 'quantity', 'unit_price', 'cash_currency'] },
  // 现金分红：缺 cash_amount 时可由数量 × 单价推算（标明推算值）
  div_cash: { supported: true, kind: 'cash', action: 'div_cash', required: ['trade_date', 'cash_currency'] },
  tax: { supported: true, kind: 'cash', action: 'tax', required: ['trade_date', 'cash_amount', 'cash_currency'] },
  interest: { supported: true, kind: 'cash', action: 'interest', required: ['trade_date', 'cash_amount', 'cash_currency'] },
  cash_in: { supported: true, kind: 'cash', action: 'cash_in', sign: '+', required: ['trade_date', 'cash_amount', 'cash_currency'] },
  cash_out: { supported: true, kind: 'cash', action: 'cash_out', sign: '-', required: ['trade_date', 'cash_amount', 'cash_currency'] },
  fee: { supported: true, kind: 'cash', action: 'fee', sign: '-', required: ['trade_date', 'cash_amount', 'cash_currency'] },
  // 换汇（TASK-101）：每端一行，金额保留券商符号（卖出端为负、买入端为正），币种为该端币种；无标的。
  // 两端以 pair_group 关联；未填组号时由预览按同账户同日配对（见 pairing.js）。
  fx: { supported: true, kind: 'cash', action: 'fx', noSymbol: true, required: ['trade_date', 'cash_amount', 'cash_currency'] },
  // 拆股（TASK-098）：单价 / 币种 / 佣金可留空；份额变动带符号
  split: { supported: true, kind: 'trade', action: 'split', required: ['trade_date', 'symbol', 'quantity'] },
  transfer_in: { supported: false },
  transfer_out: { supported: false }
});

// 金额推算的精度（去除浮点噪声，不做分币舍入：券商净额的分币差异原样保留）
function roundAmount(value) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * 成交行（buy / sell）缺券商现金净额、但数量、单价与佣金完整时，推算现金净额（cashAmountSource=derived）。
 * 买入流出 −(成交金额 + 佣金)，卖出流入 成交金额 − 佣金。分红再投不推算（股息与买入相抵，净额由券商给出）。
 * 佣金由用户补值 / 确认按零之后同样适用；就地修改 candidate。
 */
function deriveCashAmount(candidate) {
  if (candidate.cashAmount !== null || candidate.fee === null) return;
  if (candidate.action === 'buy') candidate.cashAmount = roundAmount(-(candidate.grossAmount + candidate.fee));
  else if (candidate.action === 'sell') candidate.cashAmount = roundAmount(candidate.grossAmount - candidate.fee);
  else return;
  candidate.cashAmountSource = 'derived';
}

/** 券商净额与「成交金额 ± 佣金」之差（保留分币差异，仅供核对展示）；无法比较或一致时为 null。 */
function cashDifferenceOf(candidate) {
  if (candidate.cashAmountSource !== 'broker' || candidate.fee === null || candidate.feeSource === 'derived') return null;
  let expected;
  if (candidate.action === 'buy') expected = -(candidate.grossAmount + candidate.fee);
  else if (candidate.action === 'sell') expected = candidate.grossAmount - candidate.fee;
  else return null;
  const difference = roundAmount(candidate.cashAmount - expected);
  return Math.abs(difference) > 1e-9 ? difference : null;
}

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
  },
  {
    activity_type: 'split', trade_date: '2026-03-02', source_row: '4', symbol: 'VTI', market: 'US',
    quantity: '6', split_ratio: '2:1', notes: '示例：1 拆 2（份额变动 = 拆股前 6 股 ×(2-1)；单价、佣金留空）'
  },
  {
    activity_type: 'div_cash', trade_date: '2026-03-20', source_row: '5', symbol: 'VTI', market: 'US',
    cash_amount: '4.37', cash_currency: 'USD', notes: '示例：现金分红（数量、单价可空）'
  },
  {
    activity_type: 'tax', trade_date: '2026-03-20', source_row: '6', symbol: 'VTI', market: 'US',
    cash_amount: '-0.66', cash_currency: 'USD', notes: '示例：股息预扣税（独立一行）'
  },
  {
    activity_type: 'interest', trade_date: '2026-03-31', source_row: '7', cash_amount: '0.12',
    cash_currency: 'CAD', notes: '示例：利息（无标的）'
  },
  {
    activity_type: 'fx', trade_date: '2026-04-02', source_row: '8', pair_group: 'FX-1', cash_amount: '-1370.00',
    cash_currency: 'CAD', notes: '示例：换汇卖出端（两端同组号，各记本币种带符号金额）'
  },
  {
    activity_type: 'fx', trade_date: '2026-04-02', source_row: '9', pair_group: 'FX-1', cash_amount: '1000.00',
    cash_currency: 'USD', notes: '示例：换汇买入端'
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
  if (rule.noSymbol && String(fields.symbol ?? '').trim() !== '') {
    return { error: rowError('INVALID_FIELD', `活动类型 ${activity} 不填标的（symbol）`) };
  }

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

  if (rule.action === 'split') {
    return normalizeSplit(fields, { activity, date, dateKind, timeZoneName, timeZoneSource, tradeDate, localTime, settlementText });
  }

  const quantity = parseNumber(fields.quantity);
  const price = parseNumber(fields.unit_price);
  const commission = parseNumber(fields.commission);
  const cash = parseNumber(fields.cash_amount);
  if (cash.invalid) return { error: rowError('INVALID_NUMBER', `现金金额无效：${fields.cash_amount}`) };

  const cashCurrency = String(fields.cash_currency).trim().toUpperCase();
  if (!ASSET_CURRENCIES.includes(cashCurrency)) {
    return { error: rowError('INVALID_CURRENCY', `币种无效：${fields.cash_currency}`) };
  }
  const market = String(fields.market ?? '').trim().toUpperCase();
  if (market && !ASSET_MARKETS.includes(market)) return { error: rowError('INVALID_MARKET', `市场无效：${fields.market}`) };

  const notes = String(fields.notes ?? '').trim();
  if (notes.length > 500) return { error: rowError('INVALID_NOTES', '备注超过 500 字') };

  const amounts = rule.kind === 'cash'
    ? normalizeCashAmounts(rule, { quantity, price, commission, cash })
    : normalizeTradeAmounts(rule, { quantity, price, commission, cash, fields });
  if (amounts.error) return amounts;

  return {
    candidate: {
      activityType: activity,
      action: rule.action,
      kind: rule.kind,
      rawSymbol: String(fields.symbol ?? '').trim(),
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
      ...amounts,
      cashCurrency,
      externalId: String(fields.external_id ?? '').trim() || null,
      sourceRow: String(fields.source_row ?? '').trim() || null,
      pairGroup: String(fields.pair_group ?? '').trim() || null,
      accountNumber: String(fields.account_number ?? '').trim() || null,
      notes
    }
  };
}

// 拆股比例：「新:旧」（2:1、1:10，也接受 /）或单个数字（新 / 旧）。
function parseSplitRatio(value) {
  const text = String(value ?? '').trim();
  if (text === '') return { blank: true };
  const pair = text.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  const ratio = pair ? Number(pair[1]) / Number(pair[2]) : (/^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN);
  return Number.isFinite(ratio) && ratio > 0 && ratio !== 1 ? { value: ratio } : { invalid: true };
}

/** 拆股行（TASK-098）：份额变动带符号且非零；不记单价；佣金只能留空或为 0；币种可留空（填写时须与资产币种一致）。 */
function normalizeSplit(fields, context) {
  const quantity = parseNumber(fields.quantity);
  if (quantity.invalid || !quantity.value) return { error: rowError('INVALID_NUMBER', `拆股份额变动必须为非零数字：${fields.quantity}`) };
  const ratio = parseSplitRatio(fields.split_ratio);
  if (ratio.invalid) return { error: rowError('INVALID_NUMBER', `拆股比例无效：${fields.split_ratio}（应为 2:1、1:10 或正数）`) };
  if (ratio.value !== undefined && (ratio.value > 1) !== (quantity.value > 0)) {
    return { error: rowError('SPLIT_RATIO_CONFLICT', `拆股比例 ${fields.split_ratio} 与份额变动 ${fields.quantity} 方向不一致`) };
  }
  const commission = parseNumber(fields.commission);
  if (commission.invalid || (commission.value !== undefined && commission.value !== 0)) {
    return { error: rowError('INVALID_NUMBER', `拆股不应有佣金：${fields.commission}`) };
  }
  const cashCurrency = String(fields.cash_currency ?? '').trim().toUpperCase() || null;
  if (cashCurrency && !ASSET_CURRENCIES.includes(cashCurrency)) {
    return { error: rowError('INVALID_CURRENCY', `币种无效：${fields.cash_currency}`) };
  }
  const market = String(fields.market ?? '').trim().toUpperCase();
  if (market && !ASSET_MARKETS.includes(market)) return { error: rowError('INVALID_MARKET', `市场无效：${fields.market}`) };
  const notes = String(fields.notes ?? '').trim();
  if (notes.length > 500) return { error: rowError('INVALID_NOTES', '备注超过 500 字') };
  const { activity, date, dateKind, timeZoneName, timeZoneSource, tradeDate, localTime, settlementText } = context;
  return {
    candidate: {
      activityType: activity,
      action: 'split',
      kind: 'trade',
      rawSymbol: String(fields.symbol).trim(),
      market: market || null,
      date,
      dateKind,
      timeZone: timeZoneName,
      timeZoneSource,
      needsTimeZone: dateKind === 'datetime' && !timeZoneName,
      localDate: tradeDate,
      localTime,
      settlementDate: settlementText ? new Date(`${settlementText}T00:00:00.000Z`) : null,
      settlementStatus: settlementText ? 'known' : 'unknown',
      quantity: quantity.value,
      price: null,
      splitRatio: ratio.value ?? null,
      grossAmount: null,
      fee: 0,
      feeSource: commission.blank ? undefined : 'broker',
      cashAmount: null,
      cashCurrency,
      cashAmountSource: null,
      externalId: String(fields.external_id ?? '').trim() || null,
      sourceRow: String(fields.source_row ?? '').trim() || null,
      pairGroup: String(fields.pair_group ?? '').trim() || null,
      accountNumber: String(fields.account_number ?? '').trim() || null,
      notes
    }
  };
}

// 成交行（buy / sell / div_reinvest）：数量、单价必填；佣金留空 = 未知，可由券商净额推算。
function normalizeTradeAmounts(rule, { quantity, price, commission, cash, fields }) {
  if (quantity.invalid || !quantity.value) return { error: rowError('INVALID_NUMBER', `数量无效：${fields.quantity}`) };
  if (price.invalid || !(price.value > 0)) return { error: rowError('INVALID_NUMBER', `单价必须大于 0：${fields.unit_price}`) };
  if (commission.invalid || (commission.value !== undefined && commission.value < 0)) {
    return { error: rowError('INVALID_NUMBER', `佣金无效：${fields.commission}`) };
  }
  if (rule.action !== 'sell' && quantity.value < 0) {
    return { error: rowError('INVALID_NUMBER', `${rule.action === 'buy' ? '买入' : '分红再投'}数量不能为负数`) };
  }

  const absQuantity = Math.abs(quantity.value);
  const grossAmount = absQuantity * price.value;
  let fee = commission.blank ? null : commission.value;
  let feeSource = commission.blank ? 'unknown' : 'broker';
  // 佣金缺失但有券商现金净额：按 |净额| 与成交金额之差推算（预览标明推算值）。
  // 明确填写的佣金（含 0）原样保留，不因净额的分币差异改写。
  if (fee === null && cash.value !== undefined) {
    const derived = rule.action === 'sell' ? grossAmount - Math.abs(cash.value) : Math.abs(cash.value) - grossAmount;
    const rounded = roundAmount(derived);
    if (rounded >= 0) { fee = rounded; feeSource = 'derived'; }
  }
  const amounts = {
    action: rule.action,
    quantity: absQuantity,
    price: price.value,
    grossAmount,
    fee,
    feeSource,
    cashAmount: cash.value ?? null,
    cashAmountSource: cash.value === undefined ? null : 'broker'
  };
  deriveCashAmount(amounts);
  return amounts;
}

// 现金类行：金额 = 券商净额（带符号）；现金分红缺净额时由数量 × 单价推算。成交佣金不适用。
function normalizeCashAmounts(rule, { quantity, price, commission, cash }) {
  if (quantity.invalid || price.invalid || (quantity.value !== undefined && quantity.value <= 0) ||
      (price.value !== undefined && price.value <= 0)) {
    return { error: rowError('INVALID_NUMBER', '现金类流水的数量 / 单价可留空，填写时必须为正数') };
  }
  if (commission.invalid || (commission.value !== undefined && commission.value !== 0)) {
    return { error: rowError('INVALID_FIELD', '现金类流水不填佣金：独立费用请单列 fee 行') };
  }
  const quantityValue = quantity.value ?? null;
  const priceValue = price.value ?? null;
  const grossAmount = quantityValue !== null && priceValue !== null ? roundAmount(quantityValue * priceValue) : null;
  let cashAmount = cash.value ?? null;
  let cashAmountSource = cashAmount === null ? null : 'broker';
  if (cashAmount === null && rule.action === 'div_cash' && grossAmount !== null) {
    cashAmount = grossAmount;
    cashAmountSource = 'derived';
  }
  if (cashAmount === null) return { error: rowError('MISSING_FIELD', '缺少关键字段：cash_amount') };
  if (cashAmount === 0) return { error: rowError('INVALID_NUMBER', '现金金额不能为 0') };
  if (rule.sign === '+') cashAmount = Math.abs(cashAmount);
  if (rule.sign === '-') cashAmount = -Math.abs(cashAmount);
  return {
    quantity: quantityValue,
    price: priceValue,
    grossAmount,
    fee: 0,
    feeSource: null,
    cashAmount,
    cashAmountSource
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
  deriveCashAmount,
  cashDifferenceOf,
  buildTemplate,
  autoMapping,
  validateMapping,
  normalizeRow,
  parseStandardCsv
};
