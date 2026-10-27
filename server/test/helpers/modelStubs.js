// server/test/helpers/modelStubs.js
//
// TASK-054 单元测试用的模型静态方法替身。
// 目的：cronStatus.service 的查询全部走 mongoose 静态方法（find/aggregate/distinct），
// 测试里用本文件替换它们，从而在没有数据库的情况下注入「世界状态」。
// 注意：只用于 server/test/ 内部，不进入生产代码。

const TaskRun = require('@portomind/shared/models/taskRun');
const Asset = require('@portomind/shared/models/asset');
const Price = require('@portomind/shared/models/price');
const Portfolio = require('@portomind/shared/models/portfolio');
const FxRate = require('@portomind/shared/models/fxRate');

const MODELS = { TaskRun, Asset, Price, Portfolio, FxRate };

// 记录每次 aggregate 的管线，供测试断言"查询形状"（D-19/D-18 的唯一真实执行载体）
const state = { pipelines: [] };

function getCapturedPipelines() {
  return state.pipelines;
}

function chainable(rows) {
  // 模拟 Asset.find({...}).select('...').lean()
  return {
    select() { return this; },
    lean: async () => rows
  };
}

/**
 * 用一份「世界状态」替换模型静态方法；返回 restore()。
 *
 * world = {
 *   latestRuns: [{ _id: taskName, doc: rawTaskRunDoc }],       // Q1（按任务最近一条）
 *   rebalanceRuns: [{ _id: taskName, doc: rawTaskRunDoc }],    // rebalance-check + 逐组合
 *   assets: [{ symbol, name, market, launchDate }],
 *   prices: [{ symbol, timestamp }],
 *   portfolios: [{ _id, name, accountType, archived, rebalanceSettings }],
 *   fxCount: 3 | null,
 *   distinctPriceSymbols: ['...']                              // Q7 诊断
 * }
 */
function applyWorld(world = {}) {
  const originals = new Map();
  for (const Model of Object.values(MODELS)) {
    originals.set(Model, {
      aggregate: Model.aggregate,
      find: Model.find,
      distinct: Model.distinct
    });
  }

  const latestRuns = world.latestRuns || [];
  const rebalanceRuns = world.rebalanceRuns || [];
  state.pipelines = [];

  TaskRun.aggregate = async (pipeline) => {
    const text = JSON.stringify(pipeline || []);
    state.pipelines.push({ model: 'TaskRun', pipeline });
    // service 里 rebalance 查询的 $match 含 'rebalance-suggestions' 正则
    return text.includes('rebalance-suggestions') ? rebalanceRuns : latestRuns;
  };
  Asset.find = () => chainable(world.assets || []);
  Price.find = () => chainable(world.prices || []);
  Price.distinct = async () => world.distinctPriceSymbols || [];
  Portfolio.find = () => chainable(world.portfolios || []);
  FxRate.aggregate = async (pipeline) => {
    state.pipelines.push({ model: 'FxRate', pipeline });
    return world.fxCount == null ? [] : [{ _id: 'latest', count: world.fxCount }];
  };

  return function restore() {
    for (const [Model, o] of originals) {
      Model.aggregate = o.aggregate;
      Model.find = o.find;
      Model.distinct = o.distinct;
    }
  };
}

module.exports = { applyWorld, getCapturedPipelines, MODELS };
