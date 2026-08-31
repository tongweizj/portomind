// src/utils/csvImport.js
// CSV 解析与交易列映射（TR-09）。
// 支持天天基金/雪球导出常见列名；方向值（买入/卖出/现金分红/分红再投/申购/赎回）自动归一。

/** 简单 CSV 解析（支持引号包裹字段与转义引号）。 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => {
    if (row.some(value => value.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushField();
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows;
}

const COLUMN_HINTS = {
  symbol: ['代码', '证券代码', '证券编号', '基金代码', 'code', 'symbol'],
  name: ['名称', '证券名称', '基金名称', 'name'],
  action: ['方向', '操作', '交易类型', 'action'],
  quantity: ['份额', '数量', '成交数量', '基金份额', 'quantity'],
  price: ['单价', '价格', '成交价格', '单位净值', 'price'],
  fee: ['费用', '手续费', 'fee'],
  date: ['日期', '成交日期', '交易日期', 'date'],
  notes: ['备注', '说明', 'notes'],
};

const ACTION_HINTS = {
  buy: ['买入', '申购', '买'],
  sell: ['卖出', '赎回', '卖'],
  div_cash: ['现金分红', '分红', '股息'],
  div_reinvest: ['分红再投', '红利再投', '再投'],
};

/** 表头 → 字段映射（返回每列的目标字段名）。 */
export function mapColumns(headerRow) {
  const normalized = headerRow.map(value => String(value || '').trim());
  const mapping = {};
  for (let index = 0; index < normalized.length; index += 1) {
    const header = normalized[index];
    for (const [field, hints] of Object.entries(COLUMN_HINTS)) {
      if (hints.includes(header)) {
        mapping[index] = field;
        break;
      }
      // 宽松匹配：忽略大小写/空格/括号
      const compact = header.replace(/[\s（）()]/g, '').toLowerCase();
      if (hints.some(hint => compact === hint.replace(/[\s（）()]/g, '').toLowerCase())) {
        mapping[index] = field;
        break;
      }
    }
  }
  return mapping;
}

export function normalizeAction(value) {
  const text = String(value || '').trim();
  for (const [action, hints] of Object.entries(ACTION_HINTS)) {
    if (hints.includes(text)) return action;
  }
  return text.toLowerCase();
}

/** 日期归一：2026-08-31 / 2026/08/31 / 20260831 → 'YYYY-MM-DD'；无效返回 null。 */
export function normalizeDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d{4}\/\d{2}\/\d{2}/.test(text)) return text.slice(0, 10).replace(/\//g, '-');
  const compact = text.replace(/[^\d]/g, '');
  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  return null;
}

/**
 * 行 → 交易对象。返回 { transaction, error? }。
 * symbol 缺失时尝试用「代码+名称」补全（前端无法查 Asset，交由后端校验）。
 */
export function rowToTransaction(row, mapping) {
  const get = field => {
    const index = Object.entries(mapping).find(([, target]) => target === field)?.[0];
    return index === undefined ? '' : String(row[Number(index)] || '').trim();
  };
  const action = normalizeAction(get('action'));
  const date = normalizeDate(get('date'));
  const symbol = get('symbol') || '';
  const transaction = {
    symbol: symbol.toUpperCase(),
    action,
    quantity: Number(get('quantity')),
    price: Number(get('price')),
    fee: get('fee') ? Number(get('fee')) : 0,
    notes: get('notes') || ''
  };
  if (date) transaction.date = date;
  if (get('name')) transaction.notes = transaction.notes
    ? `${get('name')} ${transaction.notes}`
    : get('name');

  if (!symbol) return { transaction, error: '缺少证券代码列' };
  if (!['buy', 'sell', 'div_cash', 'div_reinvest'].includes(action)) {
    return { transaction, error: `无法识别的方向：${get('action')}` };
  }
  if (!Number.isFinite(transaction.quantity) || transaction.quantity <= 0) {
    return { transaction, error: `份额无效：${get('quantity')}` };
  }
  if (!Number.isFinite(transaction.price) || transaction.price <= 0) {
    return { transaction, error: `价格无效：${get('price')}` };
  }
  if (!Number.isFinite(transaction.fee) || transaction.fee < 0) {
    return { transaction, error: `费用无效：${get('fee')}` };
  }
  if (!date) return { transaction, error: `日期无效：${get('date')}` };
  return { transaction, error: null };
}
