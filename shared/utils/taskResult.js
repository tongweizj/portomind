// 全部跳过是 result 数据态，任务执行状态由 taskRunner 管理。
function allItemsSkipped({ totalCount, skippedCount }) {
  return totalCount > 0 && skippedCount === totalCount;
}

module.exports = { allItemsSkipped };
