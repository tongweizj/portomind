// server/services/rebalanceEngine/recorder.js

const RebalanceRecord = require('../../models/rebalanceRecord');

/** 创建记录 */
async function createRecord(portfolioId, mode, suggestions) {
  const rec = new RebalanceRecord({ portfolioId, mode, suggestions });
  return await rec.save();
}

/** 更新状态 */
async function updateStatus(recordId, status) {
  return await RebalanceRecord.findByIdAndUpdate(recordId, { status }, { new: true });
}

/** 查询历史 */
async function getHistory(portfolioId, page=1, pageSize=20) {
  const skip = (page-1)*pageSize;
  const [total, data] = await Promise.all([
    RebalanceRecord.countDocuments({ portfolioId }),
    RebalanceRecord.find({ portfolioId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean()
  ]);
  return { total, data };
}

/** 撤销 */
async function revoke(recordId) {
  await updateStatus(recordId, 'REVOKED');
  // 业务回滚 TODO
  return await RebalanceRecord.findById(recordId).lean();
}

/** 重做 */
async function reexecute(recordId) {
  const orig = await RebalanceRecord.findById(recordId).lean();
  // 重新生成… (可调用 thresholdChecker & suggestionGenerator)
  const rec = await createRecord(orig.portfolioId, orig.mode, orig.suggestions);
  await updateStatus(rec._id, 'EXECUTED');
  return rec;
}

module.exports = { createRecord, updateStatus, getHistory, revoke, reexecute };