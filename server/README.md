# project_nodejs_family-portfolio_api

阶段 3：迭代开发
3.1 环境与工具准备
 在 server/services/fetchers/ 下按接口规范创建模板文件

 更新 ESLint/Prettier 配置，强制统一代码风格

 搭建本地测试数据库实例，准备测试数据

3.2 重构现有抓取逻辑
 抽取 IFetcher 接口（定义 TS 接口或 JSDoc）

 将 tiantianPrice.js 改写为 TiantianFetcher implements IFetcher

 将 yahooPrice.js 改写为 YahooFetcher implements IFetcher

 重写 LatestPriceService：

 getLatest(symbol) → 调度对应 Fetcher

 统一异常与返回值格式

 重写 syncPrices()：

 采用新 LatestPriceService

 日志与错误记录统一到 winston

3.3 增加历史价格抓取
 在各 Fetcher 中实现 fetchHistory(symbol, { from, to })：

天天基金：逐日请求或批量接口

Yahoo：调用 yahoo-finance2 的历史接口

 实现 HistoryPriceService:

 验证参数合法性（日期格式、范围大小）

 批量并发限速（避免被封 IP）

 存储去重与索引使用

 新增任务脚本 historySyncTask.js:

 接受命令行参数 --from、--to

 支持 CRON 定时补齐前 1 周／1 月历史

3.4 API 与文档
 在 routes/prices.js 中新增历史查询路由

 编写 Swagger/OpenAPI 文档

 更新 Postman 集合，增加历史接口示例