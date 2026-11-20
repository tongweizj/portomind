const router = require('express').Router();
const { runAssetIntegrityCheck } = require('@portomind/shared/tasks/assetIntegrityCheck');
const { success, failure } = require('../utils/apiResponse');

router.post('/check', async (req, res, next) => {
  const body = req.body;
  if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
    return failure(req, res, 400, 'Asset information check takes no input');
  }
  try {
    const { taskName, runKey, status, startedAt, endedAt, reason, result } = await runAssetIntegrityCheck();
    let summary;
    if (result) {
      const { checkedAssetIds, ...publicSummary } = result;
      summary = publicSummary;
    }
    return success(res, { taskName, runKey, status, startedAt, endedAt, reason, summary });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
