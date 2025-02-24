module.exports = mongoose => {
  const FundSchema =  mongoose.Schema({
    code: {
      type: String,
      required: true,
      unique: true, // 每个基金代码必须唯一
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true, // 基金名称（可选）
    },
    createdAt: {
      type: Date,
      required: false,
      default: Date.now, // 创建时间
    },
  });

  const Fund = mongoose.model("fund", FundSchema);
  return Fund;
}





