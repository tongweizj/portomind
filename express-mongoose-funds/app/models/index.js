const dbConfig = require("../config/db.config.js");

const mongoose = require("mongoose");
mongoose.Promise = global.Promise;

const db = {};
db.mongoose = mongoose;
db.url = dbConfig.url;
//db.tutorials = require("./tutorial.model.js")(mongoose);
db.fund = require("./fund.model.js")(mongoose);
db.fundDaily = require("./fundDailyData.model.js")(mongoose);
module.exports = db;
