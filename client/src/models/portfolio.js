/**
 * @typedef {Object} Portfolio
 * @property {string} _id             // 唯一标识
 * @property {string} name            // 投资组合名称
 * @property {string} [description]   // 可选的描述
 * @property {string} type            // 组合类型，如 "LongTerm"
 * @property {string} currency        // 货币单位，如 "CAD"
 * @property {Object.<string, number>} targetAllocation
 *   // 目标资产配置，key 为 symbol，value 为百分比
 * @property {string} createdAt       // ISO 时间字符串
 * @property {string} [updatedAt]     // ISO 时间字符串，最后更新时间
 */

/**
 * 创建一个空白 Portfolio 的辅助函数
 * @returns {Portfolio}
 */
export function createEmptyPortfolio() {
    return {
      _id: '',
      name: '',
      description: '',
      type: '',
      currency: '',
      targetAllocation: {},
      createdAt: new Date().toISOString(),
      updatedAt: undefined,
    };
  }  