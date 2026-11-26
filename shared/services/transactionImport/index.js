// 流水导入（TASK-094 / Spec #93）：完整批次预览 + 整批确认。
//
// 设计要点（见 docs/handbook/technical/API_CONTRACT.md「流水导入」）：
// - 无状态预览：确认请求重新携带文件、映射与决议，服务端重算预览；
//   previewToken（输入与处置摘要）不一致 → 输入已变；ledgerFingerprint（相关账本摘要）不一致 → 账本已变；
//   两者都返回 409 PREVIEW_STALE，用户须重新预览并确认。
// - 错误行或未决 review 行阻塞整批（422 IMPORT_BLOCKED），不写任何记录。
// - 每次确认最多写入 IMPORT_COMMIT_LIMIT 条来源流水；超出时只提交第 1 批，成对流水（pair_group）不拆开。
// - 单机 MongoDB 无多文档事务：ImportBatch 锁 + pending 写入 + 单语句翻转 committed + 故障补偿（commit.js）。
//
// 扩展点：PARSERS（#100 Wealthsimple / #102 Questrade）、matchRows（#95）、resolutions（#95–#99）。

// 模块分工（代码审查 T5）：input（校验 / 解码 / 代码映射）→ candidates（资产 / 佣金 / rawHash）→
// matching / pairing / transfers → ledger（同日顺序 / 超卖 / 持仓预演）→ batching（拆批）→ preview → confirm（commit.js 原子提交）。

const { IMPORT_COMMIT_LIMIT, IMPORT_PREVIEW_LIMIT } = require('../../constants/import.constants');
const standardCsv = require('./standardCsv');
const transfers = require('./transfers');
const { previewImport } = require('./preview');
const { commitImport } = require('./confirm');

function describeStandardFormat() {
  return {
    columns: standardCsv.STANDARD_COLUMNS,
    activityTypes: Object.entries(standardCsv.ACTIVITY_RULES).map(([type, rule]) => ({
      type,
      supported: rule.supported,
      required: rule.required || []
    })),
    commitLimit: IMPORT_COMMIT_LIMIT,
    previewLimit: IMPORT_PREVIEW_LIMIT
  };
}

module.exports = {
  listStagedTransfers: transfers.listStagedTransfers,
  discardStagedTransfer: transfers.discardStagedTransfer,
  buildTemplate: standardCsv.buildTemplate,
  describeStandardFormat,
  previewImport,
  commitImport
};
