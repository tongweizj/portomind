const mongoose = require("mongoose");

const FundDailyDataSchema = new mongoose.Schema({
  fundCode: {
    type: String,
    required: true, // 对应的基金代码，例如 XQQ.TO
    ref: "Fund", // 关联到 Fund 模型
  },
  price: {
    type: Number,
    required: true, // 基金价格
  },
  change: {
    type: Number,
    required: false, // 基金涨跌额
  },
  timestamp: {
    type: Date,
    required: true, // 数据抓取的时间戳
  },
});

const FundDailyData = mongoose.model("FundDailyData", FundDailyDataSchema);
module.exports = FundDailyData;



// const mongoose = require("mongoose");

// const FundSchema = new mongoose.Schema({
//   fundCode: { type: String, required: true },
//   price: { type: Number, required: true },
//   change: { type: Number, required: false },
//   timestamp: { type: Date, default: Date.now },
// });

// module.exports = mongoose.model("Fund", FundSchema);
