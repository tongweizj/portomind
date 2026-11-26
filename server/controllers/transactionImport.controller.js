// TASK-094：流水导入协议层（模板下载 / 预览 / 确认）与来源账户。
// 只做入参形状校验与响应包装；解析、匹配、整批写入全部在 shared/services/transactionImport。

const mongoose = require('mongoose');
const transactionImport = require('@portomind/shared/services/transactionImport');
const sourceAccountService = require('@portomind/shared/services/transactionImport/sourceAccount.service');
const cashReconciliation = require('@portomind/shared/services/transactionImport/cashReconciliation');
const { success, failure } = require('../utils/apiResponse');

// 业务错误（带 status + code）在此直接响应，以便透出 details（如 PREVIEW_STALE 的原因、拆批提示）。
function respondError(req, res, next, error) {
  if (error.name === 'ValidationError' || error.name === 'CastError') error.status = 400;
  if (Number.isInteger(error.status) && error.status < 500 && typeof error.code === 'string') {
    return failure(req, res, error.status, error.message, error.details, { code: error.code });
  }
  return next(error);
}

exports.downloadTemplate = (req, res) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="portomind-transactions-template.csv"');
  res.status(200).send(transactionImport.buildTemplate());
};

exports.getFormat = (req, res) => success(res, transactionImport.describeStandardFormat());

exports.preview = async (req, res, next) => {
  try {
    return success(res, await transactionImport.previewImport(req.body));
  } catch (error) {
    return respondError(req, res, next, error);
  }
};

exports.commit = async (req, res, next) => {
  try {
    return success(res, await transactionImport.commitImport(req.body), { status: 201 });
  } catch (error) {
    return respondError(req, res, next, error);
  }
};

exports.listSourceAccounts = async (req, res, next) => {
  try {
    return success(res, await sourceAccountService.listSourceAccounts());
  } catch (error) {
    return respondError(req, res, next, error);
  }
};

exports.renameSourceAccount = async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return failure(req, res, 400, 'Invalid source account ID');
  try {
    return success(res, await sourceAccountService.renameSourceAccount(req.params.id, req.body?.alias));
  } catch (error) {
    return respondError(req, res, next, error);
  }
};

// TASK-103：来源账户按币种核对已结算现金（只读计算；期初 / 期末余额随请求提供，不落库）
exports.reconcileCash = async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return failure(req, res, 400, 'Invalid source account ID');
  try {
    return success(res, await cashReconciliation.reconcileCash(req.params.id, req.body || {}));
  } catch (error) {
    return respondError(req, res, next, error);
  }
};
