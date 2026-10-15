// shared/index.js
//
// @portomind/shared 的聚合入口（惰性）。
// 说明：
//  - 生产代码建议按需深引用（如 require('@portomind/shared/models/asset')）；
//  - 本入口仅为便捷访问与自检用途，所有子模块通过 getter **惰性**加载，
//    避免一次性加载全部模块（会触发 portfolio/rebalance 之间的循环依赖告警）。

function lazy(obj, name, request) {
  Object.defineProperty(obj, name, {
    enumerable: true,
    get() { return require(request); }
  });
}

const models = {};
lazy(models, 'alertEvent', './models/alertEvent');
lazy(models, 'alertRule', './models/alertRule');
lazy(models, 'asset', './models/asset');
lazy(models, 'fxRate', './models/fxRate');
lazy(models, 'db', './models/index');
lazy(models, 'portfolio', './models/portfolio');
lazy(models, 'price', './models/price');
lazy(models, 'rebalanceRecord', './models/rebalanceRecord');
lazy(models, 'taskRun', './models/taskRun');
lazy(models, 'transaction', './models/transaction');
lazy(models, 'valuation', './models/valuation');

const config = {};
lazy(config, 'logger', './config/logger');
lazy(config, 'markets', './config/markets');

const constants = {};
lazy(constants, 'asset', './constants/asset.constants');

const utils = {};
lazy(utils, 'marketTime', './utils/marketTime');
lazy(utils, 'logSanitizer', './utils/logSanitizer');
lazy(utils, 'retry', './utils/retry');

const services = {};
lazy(services, 'alertCenter', './services/alertCenter.service');
lazy(services, 'alertEngine', './services/alertEngine.service');
lazy(services, 'asset', './services/asset.service');
lazy(services, 'calendar', './services/calendar.service');
lazy(services, 'familySummary', './services/familySummary.service');
lazy(services, 'fxRate', './services/fxRate.service');
lazy(services, 'marketData', './services/marketData.service');
lazy(services, 'portfolio', './services/portfolio');
lazy(services, 'price', './services/price.service');
lazy(services, 'priceFetch', './services/priceFetch.service');
lazy(services, 'priceStorage', './services/priceStorage.service');
lazy(services, 'rebalance', './services/rebalance');
lazy(services, 'taskRunner', './services/taskRunner');
lazy(services, 'transaction', './services/transaction.service');
lazy(services, 'valuation', './services/valuation.service');

const tasks = {};
lazy(tasks, 'dailySync', './tasks/dailySync');

module.exports = { models, config, constants, utils, services, tasks };
