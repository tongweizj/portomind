// server/services/alertCenter.service.js

/**
 * Alert Center Service（PRD §4.4）
 * - notify：再平衡触发时写入 AlertEvent（level=action）并发布内部事件（保留 EventEmitter 供订阅）；
 * - 规则评估与事件查询见 alertEngine.service.js / alert.controller.js。
 */

const { EventEmitter } = require('events');
const { logger }       = require('../config/logger');
const AlertEvent       = require('../models/alertEvent');

// 内部事件发布者，可供其他模块订阅
const alertEmitter = new EventEmitter();

/**
 * notify
 * 再平衡触发提醒：写入 AlertEvent（action 级，未读），记录日志并发布事件
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

  // 1. 写入事件（审计留存，前端通知中心展示）
  const event = await AlertEvent.create({
    ruleId: null,
    portfolioId,
    symbol: '',
    level: 'action',
    title: '组合再平衡建议',
    content: `检测到组合偏离阈值，生成 ${suggestions.length} 条再平衡建议，点击查看`,
    snapshot: { recordId: notification.recordId, suggestionsCount: suggestions.length },
    triggeredAt: notification.timestamp,
    status: 'unread'
  });

  // 2. 日志记录
  logger.info('REB_BALANCE_ALERT', { ...notification, eventId: event._id.toString() });

  // 3. 事件发布
  alertEmitter.emit('rebalanceAlert', notification);

  return event;
}

module.exports = {
  notify,
  alertEmitter  // 可在应用初始化时注册监听器
};
