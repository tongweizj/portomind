// client/src/components/CronStatus/statusTone.js
//
// TASK-056（C-04）：**系统健康状态 → 颜色/文案/图标** 的唯一映射。
//
// 产品硬约束（FS §3 / Task AC1、AC6）：
//   - 本文件只能使用 design-tokens 的 status* token；
//   - **禁止**引用行情涨跌 token（up / down；红涨绿跌，语义相反）；
//   - `unknown` 只表示「未知 / 未跑 / 跳过 / 无数据」，**不得**替代业务成功；
//   - 颜色只是辅助信号：每个状态必须同时带文字与图标（AC5），灰度下也能区分。
//
// 后续 TASK-055 / TASK-063 必须消费这里的映射，不得各自新建色值或文案表。

import { colors } from '../../constants/design-tokens';

/** 四种系统状态（顺序即图例顺序，固定）。 */
export const STATUS_LEVELS = Object.freeze(['ok', 'warn', 'bad', 'unknown']);

/**
 * 单一映射：
 *   level  → { token, color, label, icon, description }
 * `token` 为 design-tokens 的键名（便于测试断言"用的是 token 而不是硬编码色值"）。
 */
export const STATUS_TONE = Object.freeze({
  ok: Object.freeze({
    level: 'ok',
    token: 'statusOk',
    color: colors.statusOk,
    label: '正常',
    icon: '✓',
    description: '达标 / 数据齐全'
  }),
  warn: Object.freeze({
    level: 'warn',
    token: 'statusWarn',
    color: colors.statusWarn,
    label: '需关注',
    icon: '!',
    description: '部分完成 / 需关注'
  }),
  bad: Object.freeze({
    level: 'bad',
    token: 'statusBad',
    color: colors.statusBad,
    label: '失败',
    icon: '×',
    description: '失败 / 缺数据'
  }),
  unknown: Object.freeze({
    level: 'unknown',
    token: 'statusIdle',
    color: colors.statusIdle,
    label: '未运行',
    icon: '–',
    description: '未知 / 未跑 / 跳过 / 无数据'
  })
});

/** 未知/非法 level 一律降级为 unknown —— 绝不降级为"正常"。 */
export function getStatusTone(level) {
  return STATUS_TONE[level] || STATUS_TONE.unknown;
}

/** 图例消费的稳定数组（顺序固定）。 */
export const STATUS_LEGEND_ITEMS = Object.freeze(
  STATUS_LEVELS.map((level) => STATUS_TONE[level])
);
