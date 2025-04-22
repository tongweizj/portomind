// server/controllers/portfolioController.js
const Portfolio = require('../models/portfolio');
const Transaction = require('../models/transaction');

exports.createPortfolio = async (req, res) => {
  try {
    const { name, description, type, currency } = req.body;

    const portfolio = new Portfolio({
      name,
      description,
      type,
      currency
    });

    const saved = await portfolio.save();
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
    const result = Object.values(stats).map(item => ({
      ...item,
      avgCost: item.quantity !== 0 ? (item.totalCost / item.quantity).toFixed(2) : 0
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: '统计计算失败', error: err.message });
  }
};
