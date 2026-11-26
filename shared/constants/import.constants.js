// 流水导入（TASK-094 / Spec #93）的共享常量。
// SOURCE_BROKERS 与 client/src/constants/enums.js 的 SOURCE_BROKERS 必须同步（同 ASSET_* 双份规则）。

const SOURCE_BROKERS = Object.freeze(['wealthsimple', 'questrade', 'other']);

// 导入格式 → 解析器在 shared/services/transactionImport/index.js 的 PARSERS 注册；
// standard 标准 CSV（#94）、wealthsimple 原格式 CSV（#100）、questrade 原格式 XLSX（#102）。
const IMPORT_FORMATS = Object.freeze(['standard', 'wealthsimple', 'questrade']);
// 二进制格式：file.encoding 必须为 base64，解析器收到 Buffer。
const BINARY_IMPORT_FORMATS = Object.freeze(['questrade']);

// 每次确认最多写入的来源流水行数（Human 决定：按源报表活动行计，成对行不拆批）。
const IMPORT_COMMIT_LIMIT = 500;
// 预览覆盖完整报表；超过该行数直接拒绝（防止误传超大文件）。
const IMPORT_PREVIEW_LIMIT = 5000;

// 预览行处置（预览 rows[].disposition 与 counts 的键）：add 新增、update 更新旧流水、skip 跳过、
// review 待核对（需用户决议）、error 错误（error 与未决 review 阻塞整批）、
// stage（TASK-099）证券划转先到的一端，确认时暂存在服务端（不进账本、不阻塞整批），等待另一端。
// 确认结果另有 deferred：可写入但被拆批推迟到后续批次的行（不是预览处置）。
const IMPORT_DISPOSITIONS = Object.freeze(['add', 'update', 'skip', 'review', 'error', 'stage']);

// TASK-099：无 pair_group 时自动配对的日期窗口（转出与转入的成交日相差不超过该天数）。
const TRANSFER_PAIR_WINDOW_DAYS = 10;

// TASK-096：报表有成交时间但无时区时，用户只能在北京 / 多伦多之间确认（Spec #93 AC-04）。
// 报表自带的 time_zone 列可以是任意有效 IANA 时区。
const IMPORT_TIME_ZONE_CHOICES = Object.freeze(['Asia/Shanghai', 'America/Toronto']);

module.exports = {
  SOURCE_BROKERS,
  IMPORT_TIME_ZONE_CHOICES,
  IMPORT_FORMATS,
  BINARY_IMPORT_FORMATS,
  IMPORT_COMMIT_LIMIT,
  IMPORT_PREVIEW_LIMIT,
  IMPORT_DISPOSITIONS,
  TRANSFER_PAIR_WINDOW_DAYS
};
