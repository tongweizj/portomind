// const { getFundDailyInfo } = require("../services/fund.service");
const { getFundDailyInfo } = require("../services/yahoofinance.service");
const db = require("../models");
const Fund = db.fund;
// Create and Save a new fund
exports.create = (req, res) => {
  // Validate request
  console.log('req.body')
  console.log(req.body)
  if (!req.body.code) {
    res.status(400).send({ message: "Content can not be empty!" });
    return;
  }

  // Create a fund
  const fund = new Fund({
    code: req.body.code,
    name: req.body.name
  });
  console.log(fund);
  // Save Tutorial in the database
  fund
    .save(fund)
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



exports.getDailyInfo = async (req, res) => {
  try {
    const fundCode = req.params.fundCode;
    // if (!fundCode) {
    //   return res.status(400).send({ message: "Fund code is required" });
    // }

    const info = await getFundDailyInfo(fundCode);
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



