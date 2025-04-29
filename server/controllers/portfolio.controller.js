// server/controllers/portfolioController.js
const Portfolio = require('../models/portfolio');
const Transaction = require('../models/transaction');
const Price = require('../models/price');
const PortfolioService = require('../services/portfolio');
const { positionTracker } = PortfolioService;

exports.createPortfolio = async (req, res) => {
  try {
    // const { name, description, type, currency } = req.body;
    const newPortfolio = new Portfolio(req.body);
    const saved = await newPortfolio.save();

    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ message: '创建组合失败', error: err.message });
  }
};

// ✅ 获取所有组合
exports.getAllPortfolios = async (req, res) => {
  try {
    const portfolios = await Portfolio.find().sort({ createdAt: -1 });
    res.json(portfolios);
  } catch (err) {
    res.status(500).json({ message: '获取组合列表失败', error: err.message });
  }
};

// ✅ 获取单个组合详情
exports.getPortfolioById = async (req, res) => {
  try {
    const portfolio = await Portfolio.findById(req.params.id);
    if (!portfolio) return res.status(404).json({ message: '组合未找到' });
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ message: '获取组合失败', error: err.message });
  }
};

// ✅ 更新组合
exports.updatePortfolio = async (req, res) => {
  try {
    const updated = await Portfolio.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: '更新组合失败', error: err.message });
  }
};

// ✅ 删除组合
exports.deletePortfolio = async (req, res) => {
  try {
    await Portfolio.findByIdAndDelete(req.params.id);
    res.json({ message: '组合已删除' });
  } catch (err) {
    res.status(500).json({ message: '删除失败', error: err.message });
  }
};

// TODO: 获取组合资产总值
exports.getPortfolioStats = async (req, res, next) => {
  try {
    const stats = await PortfolioService.computeStats(req.params.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
};

// ✅ 获取组合统计:净持仓
// exports.getPortfolioNetPositionStats = async (req, res, next) => {
//   try {
//     const stats = await PortfolioService.computeNetPositionStats(req.params.id);
//     res.json(stats);
//   } catch (err) {
//     next(err);
//   }
// };


/**
 * GET /api/portfolios/:id/actual-ratios
 * 计算给定组合下，每个资产的实际持仓比例
 */
exports.getActualRatios = async (req, res, next) => {
  try {
    const ratios = await PortfolioService.computeActualRatios(req.params.id);
    res.json(ratios);
  } catch (err) {
    next(err);
  }
};


/* stard: 新增 getRebalanceSettings 接口 开始 */
exports.getRebalanceSettings = async (req, res, next) => {
  try {
    const settings = await PortfolioService.getRebalanceSettings(req.params.pid);
    res.json(settings);
  } catch (err) {
    next(err);
  }
};
/* end: 新增 getRebalanceSettings 接口 结束 */

/* stard: 新增 updateRebalanceSettings 接口 开始 */
exports.updateRebalanceSettings = async (req, res, next) => {
  try {
    const updatedSettings = await PortfolioService.updateRebalanceSettings(
      req.params.pid,
      req.body
    );
    res.json(updatedSettings);
  } catch (err) {
    // 如果 Service 抛出“Portfolio not found”，映射为 404
    if (err.message.includes('not found')) {
      return res.status(404).json({ message: err.message });
    }
    // 其余交给全局 ErrorHandler（会输出 400/422 错误集）
    next(err);
  }
};

 exports.getPositions = async (req, res, next) => {
     try {
       const { pid } = req.params;
       const { page, pageSize, symbol } = req.query;
       const result = await PortfolioService.listPositions(pid, { page, pageSize, symbol });
       res.json(result);
     } catch (err) {
       next(err);
     }
  };
/**
 * GET /api/portfolios/:pid/positions/history
 * 持仓历史：返回指定标的或全组合在给定粒度下的时间序列
 */
exports.getPositionHistory = async (req, res, next) => {
  try {
    const { pid } = req.params;
    const symbol = req.query.symbol || null;
    const interval = req.query.interval || 'day'; // day | week | month

    /* start: 调用历史趋势服务 */
    const history = await positionTracker.getHistory(pid, symbol, interval);
    /* end: 调用历史趋势服务 */

    res.json({ data: history });
  } catch (err) {
    next(err);
  }
};