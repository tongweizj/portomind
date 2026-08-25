const RebalanceRecord = require('../../models/rebalanceRecord');

async function createRecord(portfolioId, mode, suggestions, metadata = {}) {
  return new RebalanceRecord({
    portfolioId,
    mode,
    suggestions,
    status: 'PENDING',
    ...metadata
  }).save();
}

function updateStatus(recordId, status, fields = {}) {
  return RebalanceRecord.findByIdAndUpdate(
    recordId,
    { status, ...fields },
    { new: true, runValidators: true }
  );
}

function getRecord(recordId) {
  return RebalanceRecord.findById(recordId);
}

async function getHistory(portfolioId, page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  const [total, data] = await Promise.all([
    RebalanceRecord.countDocuments({ portfolioId }),
    RebalanceRecord.find({ portfolioId })
      .sort({ timestamp: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean()
  ]);
  return { total, data };
}

module.exports = { createRecord, updateStatus, getRecord, getHistory };
