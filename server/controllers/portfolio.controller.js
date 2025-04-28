// server/controllers/portfolioController.js
const Portfolio = require('../models/portfolio');
const Transaction = require('../models/transaction');
const Price = require('../models/price');
const PortfolioService = require('../services/portfolioService');
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
    // 可选：同时删除该组合的所有交易记录
    await Transaction.deleteMany({ portfolioId: req.params.id });
    res.json({ message: '组合及交易记录已删除' });
  } catch (err) {
    res.status(500).json({ message: '删除失败', error: err.message });
  }
};

// ✅ 获取组合统计（净持仓，资产总值等）
exports.getPortfolioStats = async (req, res) => {
  try {
    const portfolioId = req.params.id;
    const transactions = await Transaction.find({ portfolioId });

    const stats = {};

    for (const tx of transactions) {
      const key = tx.symbol;

      if (!stats[key]) {
        stats[key] = {
          symbol: tx.symbol,
          assetType: tx.assetType,
          quantity: 0,
          totalCost: 0,
        };
      }

      const multiplier = tx.action === 'buy' ? 1 : -1;
      stats[key].quantity += multiplier * tx.quantity;
      stats[key].totalCost += multiplier * tx.quantity * tx.price;
    }

    // 计算平均持仓成本
    const result = Object.values(stats).map(item => {
      const avgCost =
        item.quantity !== 0
          ? parseFloat((item.totalCost / item.quantity).toFixed(2))
          : 0;

      return {
        symbol: item.symbol,
        assetType: item.assetType,
        quantity: item.quantity,
        totalCost: parseFloat(item.totalCost.toFixed(2)),
        avgCost: avgCost
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: '统计计算失败', error: err.message });
  }
};



/**
 * GET /api/portfolios/:id/actual-ratios
 * 计算给定组合下，每个资产的实际持仓比例
 */
exports.getActualRatios = async (req, res) => {
  try {
    const portfolioId = req.params.id;

    // 1. 拉取该组合下所有交易记录
    const txs = await Transaction.find({ portfolioId });

    // 2. 按 symbol 累加净持仓数量（买 + / 卖 -）
    const positionMap = {};
    txs.forEach(tx => {
      const sign = tx.action === 'buy' ? 1 : -1;
      positionMap[tx.symbol] = (positionMap[tx.symbol] || 0) + sign * tx.quantity;
    });

    // 3. 过滤掉净持仓 <= 0 的资产
    const assets = Object.entries(positionMap)
      .filter(([symbol, qty]) => qty > 0);

    // 4. 获取最新价格 & 计算各资产市值
    let totalValue = 0;
    const assetValues = await Promise.all(
      assets.map(async ([symbol, qty]) => {
        const priceDoc = await Price
          .findOne({ symbol })
          .sort({ date: -1 });               // 最新一条
        const price = priceDoc ? priceDoc.price : 0;
        const value = price * qty;
        totalValue += value;
        return { symbol, value };
      })
    );

    // 5. 计算比例并返回
    const ratios = assetValues.map(({ symbol, value }) => ({
      symbol,
      ratio: totalValue > 0
        ? Number((value / totalValue * 100).toFixed(1))
        : 0
    }));

    res.json(ratios);
  } catch (err) {
    console.error('❌ getActualRatios error:', err);
    res.status(500).json({ message: '获取实际持仓比例失败', error: err.message });
  }
};

/* stard: 新增 getRebalanceSettings 接口 开始 */
exports.getRebalanceSettings = async (req, res, next) => {
  try {
    const portfolio = await Portfolio.findById(req.params.pid);
    if (!portfolio) {
      return res.status(404).json({ message: '组合未找到' });
    }
    // 直接返回子文档 rebalanceSettings
    res.json(portfolio.rebalanceSettings);
  } catch (err) {
    next(err);
  }
};
/* end: 新增 getRebalanceSettings 接口 结束 */

/* stard: 新增 updateRebalanceSettings 接口 开始 */
exports.updateRebalanceSettings = async (req, res, next) => {
  try {
    const { absoluteDeviation, relativeDeviation, timeInterval } = req.body;
    const updates = {};

    // 1. 参数校验 & 构建更新对象
    if (absoluteDeviation !== undefined) {
      if (absoluteDeviation < 0 || absoluteDeviation > 100) {
        return res.status(400).json({ message: 'absoluteDeviation 必须在 0-100 之间' });
      }
      updates['rebalanceSettings.absoluteDeviation'] = absoluteDeviation;
    }
    if (relativeDeviation !== undefined) {
      if (relativeDeviation < 0 || relativeDeviation > 100) {
        return res.status(400).json({ message: 'relativeDeviation 必须在 0-100 之间' });
      }
      updates['rebalanceSettings.relativeDeviation'] = relativeDeviation;
    }
    if (timeInterval !== undefined) {
      if (!Number.isInteger(timeInterval) || timeInterval < 1) {
        return res.status(400).json({ message: 'timeInterval 必须是大于等于1的整数' });
      }
      updates['rebalanceSettings.timeInterval'] = timeInterval;
    }

    // 2. 执行更新
    const updatedPortfolio = await Portfolio.findByIdAndUpdate(
      req.params.pid,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updatedPortfolio) {
      return res.status(404).json({ message: '组合未找到' });
    }

    // 3. 返回更新后的设置
    res.json(updatedPortfolio.rebalanceSettings);
  } catch (err) {
    next(err);
  }
};
/* end: 新增 updateRebalanceSettings 接口 结束 */


/**
 * GET /api/portfolios/:pid/positions
 * 持仓概览：分页返回聚合 + 盈亏计算后的结果
 */
exports.getPositions = async (req, res, next) => {
  try {
    const { pid }      = req.params;
    const page         = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize     = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);
    const symbolFilter = req.query.symbol || null;
    
    /* start: 调用聚合 & 盈亏计算 */
    // 1. 聚合持仓
    const rawPositions = await positionTracker.aggregate(pid, symbolFilter);
    console.log("rawPositions: ", rawPositions);
  
    // 2. 计算浮动盈亏
    const positionsWithPnl = positionTracker.calculatePnL(rawPositions);
    /* end: 调用聚合 & 盈亏计算 */

    // 3. 分页逻辑
    const total = positionsWithPnl.length;
    const start = (page - 1) * pageSize;
    const data  = positionsWithPnl.slice(start, start + pageSize);

    res.json({ total, data });
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
    const { pid }     = req.params;
    const symbol      = req.query.symbol || null;
    const interval    = req.query.interval || 'day'; // day | week | month

    /* start: 调用历史趋势服务 */
    const history = await positionTracker.getHistory(pid, symbol, interval);
    /* end: 调用历史趋势服务 */

    res.json({ data: history });
  } catch (err) {
    next(err);
  }
};