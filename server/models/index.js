const mongoose = require("mongoose");
mongoose.Promise = global.Promise;

const db = {};
db.mongoose = mongoose;
db.etf = require("./etf.model.js")(mongoose);

module.exports = db;
