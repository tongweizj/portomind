// server/controllers/transactionController.js
const mongoose = require('mongoose');
const Transaction = require('../models/transaction');
const { getTransactionsByPortfolio } = require('../services/transactionService');

exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: 'Failed to get all transactions', error: err });
  }
};

exports.getByPortfolio = async (req, res) => {
  try {
    const { pid } = req.params;
    console.log("pid: ",req)
    const { symbol, page, pageSize } = req.query;
    const result = await getTransactionsByPortfolio(pid, {
      symbol,
      page:    Number(page)    || 1,
      pageSize:Number(pageSize)|| 50
    });

    //const txs = await Transaction.find({ portfolioId: req.params.portfolioId }).sort({ date: -1 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching transactions', error: err });
  }
};

// 获取单个交易记录（用于编辑）
exports.getTransactionById = async (req, res) => {

  try {
    const id = req.params.id;
    console.log("🟢 进入 getTransactionById，参数ID =", id);
    // ✅ 如果 id 不是合法 ObjectId，直接返回 400
    if (!mongoose.Types.ObjectId.isValid(id)) {
     return res.status(400).json({ message: '无效的交易 ID' });
   }
    // const transaction = await Transaction.findById(id);
    const transaction = await Transaction.findOne({ _id: mongoose.Types.ObjectId(id) });
    if (!transaction) {
      return res.status(404).json({ message: '交易记录未找到' });
    }

    res.json(transaction);
  } catch (err) {
    // res.status(500).json({ message: '获取交易记录失败', error: err });
    res.status(500).json({ message: '获取交易记录失败', error: err.message || err.toString() });

  }
};

// 添加交易
exports.createTransaction = async (req, res) => {
  try {
    const { portfolioId, assetType, symbol, market, currency, action, quantity, price, date, notes } = req.body;

    // ✅ 1. 校验 portfolioId 是否存在且格式合法
    if (!portfolioId || !mongoose.Types.ObjectId.isValid(portfolioId)) {
      return res.status(400).json({ message: '无效或缺失的 portfolioId' });
    }

    // ✅ 2. 创建交易对象
    const newTx = new Transaction({
      portfolioId,
      assetType,
      symbol,
      market,
      currency,
      action,
      quantity,
      price,
      date,
      notes
    });

    const saved = await newTx.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ message: '保存交易失败', error: err.message || err });
  }
};


// 更新交易记录
exports.updateTransaction = async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;

    const updatedTransaction = await Transaction.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedTransaction) {
      return res.status(404).json({ message: '交易记录未找到' });
    }

    res.json(updatedTransaction);
  } catch (err) {
    res.status(500).json({ message: '更新交易记录失败', error: err });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    await Transaction.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed', error: err });
  }
};
