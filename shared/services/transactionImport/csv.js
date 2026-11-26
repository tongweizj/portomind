// RFC4180 风格的 CSV 分词（TASK-094，由 client/src/utils/csvImport.js 迁入 shared）。
// 支持引号字段、转义引号、CRLF/LF、字段内换行；返回 [{ line, cells }]，
// line 为该记录在上传文件中的起始物理行号（1 起），供「缺原行号时用上传文件行号」使用。

function parseCsv(text) {
  const source = String(text ?? '').replace(/^﻿/, '');
  const records = [];
  let cells = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const pushField = () => { cells.push(field); field = ''; };
  const pushRecord = () => {
    if (cells.some(value => value.trim() !== '')) records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      pushField();
      pushRecord();
      line += 1;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  if (field !== '' || cells.length > 0) {
    pushField();
    pushRecord();
  }
  return records;
}

function escapeCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsvLine(values) {
  return values.map(escapeCell).join(',');
}

module.exports = { parseCsv, toCsvLine };
