/**
 * @typedef {Object} Transaction
 * @property {string} _id             // 唯一标识
 * @property {string} portfolioId     // 所属组合 ID
 * @property {string} date            // ISO 格式日期
 * @property {string} symbol          // 证券代码
 * @property {'BUY'|'SELL'} action    // 操作类型
 * @property {number} quantity        // 数量
 * @property {number} price           // 单价
 * @property {number} [cost]          // 可选：交易成本
 * @property {string} [note]          // 可选备注
 */

/**
 * 创建一个空白 Transaction 的辅助函数
 * @returns {Transaction}
 */
export function createEmptyTransaction() {
    return {
      _id: '',
      portfolioId: '',
      date: new Date().toISOString(),
      symbol: '',
      action: 'BUY',
      quantity: 0,
      price: 0,
      cost: undefined,
      note: undefined,
    };
  }
  