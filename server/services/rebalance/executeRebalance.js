
const recorder    = require('./recorder');
/**
   * 执行再平衡建议并写记录
   * @param {String} portfolioId
   * @param {String} mode         "AUTO" | "MANUAL"
   * @param {Array}  suggestions  由 getSuggestions 返回的建议列表
   * @returns {Promise<Object>}   更新后的 RebalanceRecord 文档
   */
  async function executeRebalance(portfolioId, mode, suggestions) {
    // 1. 创建记录（PENDING）
    const record = await recorder.createRecord(portfolioId, mode, suggestions);
    // 2. TODO: 这里可以插入真正的 TransactionFlow 写入逻辑
    // 3. 标记已执行
    const updated = await recorder.updateStatus(record._id, 'EXECUTED');
    return updated;
  }

  module.exports = { executeRebalance };