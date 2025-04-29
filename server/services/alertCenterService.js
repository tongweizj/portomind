// server/services/alertCenterService.js

/**
 * Alert Center Service
 * 用于将再平衡事件通知外部系统（如邮件、推送、Webhook 等）
 */

const { EventEmitter } = require('events');
const logger           = require('../config/logger');

// 内部事件发布者，可供其他模块订阅
const alertEmitter = new EventEmitter();

/**
 * notify
 * 触发再平衡警报，记录日志并发布事件
 * @param {Object} payload
 * @param {String} payload.portfolioId
 * @param {Object} payload.record      // RebalanceRecord 文档
 * @param {Array}  payload.suggestions // 建议列表
 */
async function notify({ portfolioId, record, suggestions }) {
  const notification = {
    type: 'REB_BALANCE_ALERT',
    portfolioId,
    recordId:       record._id.toString(),
    timestamp:      record.timestamp || new Date(),
    suggestionsCount: suggestions.length,
    suggestions
  };

  // 1. 日志记录
  logger.info('REB_BALANCE_ALERT', notification);

  // 2. 事件发布
  alertEmitter.emit('rebalanceAlert', notification);
}

module.exports = {
  notify,
  alertEmitter  // 可在应用初始化时注册监听器
};
