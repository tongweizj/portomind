const Asset = require('../models/asset');

exports.getAllAssets = async (req, res) => {
  try {
    const assets = await Asset.find();
    res.json(assets);
  } catch (err) {
    res.status(500).json({ message: '获取资产失败', error: err });
  }
};

exports.createAsset = async (req, res) => {
  try {
    const newAsset = new Asset(req.body);
    const saved = await newAsset.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ message: '添加资产失败', error: err });
  }
};

exports.updateAsset = async (req, res) => {
  try {
    const updated = await Asset.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: '更新资产失败', error: err });
  }
};

exports.deleteAsset = async (req, res) => {
  try {
    await Asset.findByIdAndDelete(req.params.id);
    res.json({ message: '已删除' });
  } catch (err) {
    res.status(500).json({ message: '删除资产失败', error: err });
  }
};