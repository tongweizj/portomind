# project_nodejs_family-portfolio_api


## TODO
### 0.02 合并项目
- [x] 合并之前AI帮忙写的代码，把采集yahoo 和 sina 的 etf价格 合到一个项目里面去

### 0.03 第一个refoctory
- [x] route 合并
- [x] controller 合并
- [x] model 合并
- [x] service 合并

### 0.04 simple website
1. 用react做一个简单的页面，能看到每天的价格更新
### wait

2. 在nas上跑一个代码
3. 采集到nas 的moongodb里
4. 定时运行





## 四、重构步骤 TODO List

### 1. 抽象 PortfolioService

在 services/portfolio/index.js 中，导出：

getRebalanceSettings(pid)

updateRebalanceSettings(pid, cfg)

aggregatePositions(pid, symbol?)

calculatePnL(positions)


方法	多余逻辑	建议抽取到 Service
getPortfolioStats	- 直接对 Transaction 做聚合计算
- 算平均成本 (totalCost / quantity)	新建 PortfolioService.computeStats(portfolioId)，返回结构化结果


getActualRatios	
多余逻辑
- 召回 Transaction 并按 symbol 累加
- 根据 Price 集合取最新价格并计算比例
建议抽取到 Service
新建 PortfolioService.computeActualRatios(portfolioId)


getRebalanceSettings
多余逻辑
直接用 Mongoose 取 Portfolio.rebalanceSettings
建议抽取到 Service
调用 PortfolioService.getRebalanceSettings(pid)


updateRebalanceSettings	
多余逻辑
参数校验 + Mongoose 更新逻辑	
建议抽取到 Service
调用 PortfolioService.updateRebalanceSettings(pid, cfg)


getPositions / getPositionHistory
多余逻辑	
调用了 positionTracker，但还在 Controller 里做了分页
有一行 console.log 调试代码	
建议
分页逻辑也可抽到 PortfolioService.listPositions，去掉日志语句


        {
            "symbol": "AAPL",
            "quantity": 221,
            "avgCost": 198.35746606334843,
            "price": 210.615,
            "marketValue": 46545.915,
            "pnl": 2708.915,
            "pnlPct": 6.179517302735138
        },
    {
        "symbol": "AAPL",
        "assetType": "stock",
        "quantity": 221,
        "totalCost": 43837,
        "avgCost": 198.36
    },
    
### 2.拆分 RebalanceEngine

将现有的 thresholdChecker、suggestionGenerator、costEstimator、recorder 挪入 services/rebalance/ 子目录

添加 scheduleManager.js，封装 node-cron 注册/注销逻辑

### 3. 简化 Controllers

在 controllers/portfolio.controller.js 引入 PortfolioService，完全不直接操作 Model

在 controllers/rebalance.controller.js 引入 RebalanceEngine 各子服务

### 4.精炼 Routes

合并 /api/portfolios/:pid/rebalance/* 到 portfolio.routes.js

单独在 /api/rebalance 下挂载对 recordId 的 revoke/reexecute

### 5. 统一配置与注入

在 app.js 初始化 logger、db，并挂到 req.app.locals 或通过单例模块引用

Controller 接收 req.user、req.traceId 等上下文

### 6.编写单元测试

为 services/* 下的纯函数/异步函数编写 Jest 单元测试

在 Controller 测试中，用 Jest Mock 模拟 Service 返回

### 7.迁移任务脚本

将调度逻辑从 tasks/rebalanceScheduler.js 提取到 services/rebalance/scheduleManager.js

在 CLI 脚本或直接由 server.js 启动时调用

### 8. 逐步替换

先在不影响现有功能的情况下，逐个模块编写完毕并切换路由引用

发布灰度，验证日志、接口、前端联调无异常

五、收获与后期
可读性：新同学能快速在 services/portfolio 和 services/rebalance 下找到核心逻辑

可维护性：新增阈值策略、成本模型只需在对应模块修改，无需改动 Controller 或 Task

可测试性：纯函数化逻辑易 Mock 且覆盖率高

可扩展性：未来如果要支持新调度引擎（如 BullMQ），只需替换 scheduleManager

server/
├── models/                       
│   ├── portfolio.js              
│   ├── transaction.js            
│   ├── price.js                  
│   └── rebalanceRecord.js        
│
├── services/                     # 纯业务逻辑，无 Express 依赖
│   ├── portfolio/                # Portfolio 相关
│   │   ├── index.js              # 导出 PortfolioService
│   │   ├── positionTracker.js    # 持仓分析
│   │   └── rebalanceSettings.js  # 阈值配置读写
│   │
│   └── rebalance/                # RebalanceEngine 相关
│       ├── thresholdChecker.js
│       ├── suggestionGenerator.js
│       ├── costEstimator.js
│       ├── recorder.js
│       └── scheduleManager.js    # (可选) schedule 逻辑抽离
│
├── controllers/                  # 只负责 HTTP 层输入输出与校验
│   ├── portfolio.controller.js  
│   └── rebalance.controller.js  
│
├── routes/
│   ├── portfolio.routes.js       # 挂载 /api/portfolios
│   └── rebalanceRecord.routes.js # 挂载 /api/rebalance
│
├── validators/                   # express-validator 逻辑
│   ├── portfolioValidator.js
│   └── rebalanceValidator.js
│
├── tasks/                        # 与业务逻辑解耦，仅负责调用 ScheduleManager
│   └── rebalanceScheduler.js     
│
├── config/                       # 非业务配置，如 logger、db
│   ├── logger.js                 
│   └── db.js                     
│
├── app.js                        # Express app 初始化（不含 listen）
└── server.js                     # 引入 app.js 并启动或加载 cli 脚本




