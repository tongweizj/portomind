// client/src/components/CronStatus/unknownValue.js
//
// TASK-053（C-01）：骨架阶段的「未知」语义集中处。
//
// 这个文件存在的**唯一理由**是防止一个具体的产品事故：
//   骨架阶段没有数据，若任何一处用 `value || 0`、`value ?? '正常'`、默认绿色徽章之类的写法，
//   界面就会显示「5 个任务全部健康」——正是 FS §3 批判的「全绿误导」。
//   因此这里把一个显式常量 `UNKNOWN` 作为默认值，并在渲染层统一转成中性文案，
//   任何取值路径都不会把「缺失」渲染成「成功」。
//
// 约束（AC3 / AC4）：骨架阶段不得出现 `undefined` / `NaN` / `Invalid Date`。

/** 骨架阶段所有数据位的默认值。它**不是**空字符串 —— 空串会让 `value || ...` 类写法悄悄兜底。 */
export const UNKNOWN = Object.freeze({ __unknown: true });

export function isUnknown(value) {
  return value === UNKNOWN || value === undefined || value === null;
}

/** 未知态的展示文案。中性灰，不带任何成功/失败语义（AC3：不得默认渲染成绿色）。 */
export const UNKNOWN_TEXT = '未知';

/** 五个固定任务槽位（顺序固定，对应 C-01 的「恰好 5 个健康灯位」）。 */
export const BOARD_SLOTS = Object.freeze([
  { key: 'price-sync', label: '价格同步' },
  { key: 'integrity-check', label: '价格完整性' },
  { key: 'alert-evaluate', label: '提醒评估' },
  { key: 'fx-rate-sync', label: '汇率同步' },
  { key: 'rebalance', label: '再平衡建议' },
]);

/** 时间戳的安全渲染：未知 / 非法值一律显示占位符，绝不出现 Invalid Date（AC4）。 */
export function formatTimestamp(value) {
  if (isUnknown(value)) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', { hour12: false });
}

/** 数值的安全渲染：未知 / NaN / 非数值一律显示占位符，绝不出现 NaN（AC4）。 */
export function formatNumber(value) {
  if (isUnknown(value)) return '—';
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '—';
  return String(num);
}
