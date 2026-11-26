// 来源账户服务（TASK-094）。
// 识别规则：有账号时按 (broker, sha256(broker+账号)) 识别同一实际账户——别名可改、跨批跨组合不变；
// 无账号时由用户选择已有来源账户（id）或新建。完整账号从不落库。

const crypto = require('crypto');
const mongoose = require('mongoose');
const SourceAccount = require('../../models/sourceAccount');
const { SOURCE_BROKERS } = require('../../constants/import.constants');
const { businessError } = require('./common');


function normalizeAccountNumber(value) {
  return String(value ?? '').trim().replace(/[\s-]/g, '').toUpperCase();
}

function accountKeyHash(broker, accountNumber) {
  const normalized = normalizeAccountNumber(accountNumber);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(`${broker}:${normalized}`).digest('hex');
}

function last4(accountNumber) {
  const normalized = normalizeAccountNumber(accountNumber);
  return normalized ? normalized.slice(-4) : undefined;
}

function toView(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    broker: doc.broker,
    alias: doc.alias,
    accountKeyLast4: doc.accountKeyLast4 || null,
    accountType: doc.accountType || null,
    portfolioIds: (doc.portfolioIds || []).map(String)
  };
}

async function listSourceAccounts() {
  const docs = await SourceAccount.find({}).sort({ alias: 1 }).lean();
  return docs.map(toView);
}

async function renameSourceAccount(id, alias) {
  const value = String(alias ?? '').trim();
  if (!value || value.length > 60) throw businessError(400, 'INVALID_ALIAS', 'alias must be 1-60 characters');
  const doc = await SourceAccount.findByIdAndUpdate(id, { $set: { alias: value } }, { new: true, runValidators: true }).lean();
  if (!doc) throw businessError(404, 'SOURCE_ACCOUNT_NOT_FOUND', 'Source account not found');
  return toView(doc);
}

/**
 * 只读解析（预览用，不写库）：返回 { existing, planned }。
 * - input = { id } 选择已有来源账户；或 { broker, alias, accountNumber? } 新建/按账号识别；
 * - fileAccountNumber：报表中的账号（已按账户拆分后的唯一值），优先于手填账号。
 */
async function resolveSourceAccount(input, { fileAccountNumber } = {}) {
  if (!input || typeof input !== 'object') {
    throw businessError(400, 'SOURCE_ACCOUNT_REQUIRED', 'sourceAccount is required');
  }
  const alias = input.alias === undefined ? undefined : String(input.alias).trim();
  if (alias !== undefined && alias.length > 60) throw businessError(400, 'INVALID_ALIAS', 'alias must be 1-60 characters');

  if (input.id) {
    if (!mongoose.Types.ObjectId.isValid(input.id)) throw businessError(400, 'INVALID_SOURCE_ACCOUNT_ID', 'Invalid source account ID');
    const existing = await SourceAccount.findById(input.id).lean();
    if (!existing) throw businessError(404, 'SOURCE_ACCOUNT_NOT_FOUND', 'Source account not found');
    if (fileAccountNumber) {
      const hash = accountKeyHash(existing.broker, fileAccountNumber);
      if (existing.accountKeyHash && existing.accountKeyHash !== hash) {
        throw businessError(400, 'SOURCE_ACCOUNT_MISMATCH', '报表账号与所选来源账户不一致，请改选或新建来源账户');
      }
    }
    return { existing, planned: { ...existing, alias: alias || existing.alias } };
  }

  const broker = String(input.broker ?? '').trim().toLowerCase();
  if (!SOURCE_BROKERS.includes(broker)) {
    throw businessError(400, 'INVALID_BROKER', `broker must be one of: ${SOURCE_BROKERS.join(', ')}`);
  }
  const accountNumber = fileAccountNumber || input.accountNumber;
  const hash = accountKeyHash(broker, accountNumber);
  if (hash) {
    const existing = await SourceAccount.findOne({ broker, accountKeyHash: hash }).lean();
    if (existing) return { existing, planned: { ...existing, alias: alias || existing.alias } };
  }
  if (!alias) throw businessError(400, 'INVALID_ALIAS', '新建来源账户需要填写账户别名');
  return {
    existing: null,
    planned: {
      broker,
      alias,
      accountKeyHash: hash || undefined,
      accountKeyLast4: last4(accountNumber),
      accountType: input.accountType ? String(input.accountType).trim().slice(0, 60) : undefined
    }
  };
}

/** 确认时落库：新建（并发同账号新建由唯一索引兜底后改读）或更新别名；记录关联组合。 */
async function ensureSourceAccount(resolved, portfolioId) {
  let id = resolved.existing?._id;
  if (!id) {
    try {
      const created = await SourceAccount.create({ ...resolved.planned, portfolioIds: [portfolioId] });
      return created._id;
    } catch (error) {
      if (error.code !== 11000 || !resolved.planned.accountKeyHash) throw error;
      const existing = await SourceAccount.findOne({
        broker: resolved.planned.broker,
        accountKeyHash: resolved.planned.accountKeyHash
      }).lean();
      id = existing._id;
    }
  }
  const update = { $addToSet: { portfolioIds: portfolioId } };
  if (resolved.planned.alias && resolved.planned.alias !== resolved.existing?.alias) {
    update.$set = { alias: resolved.planned.alias };
  }
  await SourceAccount.updateOne({ _id: id }, update);
  return id;
}

module.exports = {
  accountKeyHash,
  last4,
  toView,
  listSourceAccounts,
  renameSourceAccount,
  resolveSourceAccount,
  ensureSourceAccount
};
