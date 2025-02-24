const fetchFundData = require("./app/tasks/fetchFundData");
// const cleanupDatabase = require("./tasks/cleanupDatabase"); // 示例任务

function scheduleJobs() {
  fetchFundData();
  // cleanupDatabase(); // 添加其他任务
}

module.exports = scheduleJobs;
