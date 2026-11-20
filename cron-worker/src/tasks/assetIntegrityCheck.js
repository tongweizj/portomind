require('../config/env');
const mongoose = require('mongoose');
const { runAssetIntegrityCheck } = require('@portomind/shared/tasks/assetIntegrityCheck');
const TaskRun = require('@portomind/shared/models/taskRun');

async function main() {
  if (process.argv.includes('--help')) {
    console.log('用法：node src/tasks/assetIntegrityCheck.js');
    return;
  }
  if (process.argv.length > 2) throw new Error('未知参数');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI, { autoCreate: false, autoIndex: false });
  try {
    await TaskRun.createIndexes();
    console.log(JSON.stringify(await runAssetIntegrityCheck(), null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('资产信息检查失败：', error.name);
    process.exitCode = 1;
  });
}
