// const ETF = require('../models/ETF');
const db = require("../models");
const Etf = db.etf;
const etfDaily = db.etfDaily;
// const EtfDaily = require("../models/etf-daily.model");
const { getFundDailyInfo } = require("../services/yahoo.service");

// Create and Save a new fund
const create = (req, res) => {
  if (!req.body.code) {
    res.status(400).send({ message: "Content can not be empty!" });
    return;
  }

  // Create a fund
  const etf = new Etf({
    code: req.body.code,
    name: req.body.name
  });
  console.log(etf);
  // Save Tutorial in the database
  etf
    .save(etf)
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message:
          err.message || "Some error occurred while creating the Tutorial."
      });
    });
};

// 获取所有 ETF 数据
const getETFPrices = async (req, res) => {
  try {
    const prices = await etfDaily.find();
    res.json(prices);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching ETF prices from database');
  }
};

// 获得单个etf的所有价格
const getDailyInfo = async (req, res) => {
  try {
    const etfCode = req.params.fundCode;
    // if (!fundCode) {
    //   return res.status(400).send({ message: "Fund code is required" });
    // }
    console.log(etfCode);
    const info = await getFundDailyInfo(etfCode);
    console.log(info);
    // getFundDailyInfo("XQQ.TO").then(console.log);
    res.json(info);
  } catch (err) {
    res.status(500).send({
      message: "Error fetching fund daily info",
      error: err.message,
    });
  }
};
module.exports = {
  getETFPrices,
  getDailyInfo,
  create
};