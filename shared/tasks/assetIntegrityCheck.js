const { inspectAssetIntegrity, TASK_NAME } = require('../services/assetIntegrity.service');
const { runTrackedTask } = require('../services/taskRunner');

async function runAssetIntegrityCheck({ now = new Date(), dependencies } = {}) {
  return runTrackedTask({
    taskName: TASK_NAME,
    trigger: 'MANUAL',
    runKey: `manual:${now.toISOString()}`,
    exclusiveRunKey: { key: 'manual:active', staleAfterMs: 15 * 60 * 1000 },
    execute: async () => {
      const result = await inspectAssetIntegrity({ now, dependencies });
      return { totalCount: result.total, successCount: result.total, result };
    }
  });
}

module.exports = { runAssetIntegrityCheck };
