// 表单按 ISO 日期部分展示，避免浏览器本地时区改动日期。
export function launchDateValue(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)
    ? value.slice(0, 10)
    : '';
}
