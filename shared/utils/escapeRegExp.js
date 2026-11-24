// 用户输入转义为安全正则字面量；资产搜索等场景共用一份实现。
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegExp };
