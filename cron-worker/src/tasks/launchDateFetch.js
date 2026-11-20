require('../config/env');
const mongoose = require('mongoose');
const { backfillLaunchDates } = require('@portomind/shared/tasks/launchDateFetch');

async function runFromCommandLine(args) {
  if (args.includes('--help')) {
    console.log('用法：node src/tasks/launchDateFetch.js [--apply]（默认只预览）');
    return;
  }
  if (args.some(arg => arg !== '--apply')) throw new Error('未知参数，请运行 --help');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI, { autoCreate: false, autoIndex: false });
  try {
    const report = await backfillLaunchDates({ apply: args.includes('--apply') });
    console.log(JSON.stringify(report, null, 2));
    if (report.results.some(row => row.status === 'FAILED')) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runFromCommandLine(process.argv.slice(2)).catch(error => {
    console.error('上市/成立日期抓取命令失败：', error.name);
    process.exitCode = 1;
  });
}
