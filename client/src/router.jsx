import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  } from 'react-router';

  import { ROUTE_PATTERNS } from './constants/routes';
  import List       from './pages/portfolios/List';
  import Detail     from './pages/portfolios/Detail';
  import Basic     from './pages/portfolios/Basic';
  // import Edit       from './pages/portfolios/Edit';
  import Rebalance  from './pages/portfolios/Rebalance';

// 原有（被注释）部分
import AppLayout            from './components/layout/AppLayout';
import Dashboard            from './pages/Dashboard';
import TransactionList      from './pages/Transaction/TransactionList';
import AddTransaction       from './pages/Transaction/AddTransaction';
import EditTransaction      from './pages/Transaction/EditTransaction';

// import PortfolioList        from './pages/PortfolioList';
// import PortfolioDetail      from './pages/PortfolioDetail';
import PortfolioForm        from './pages/portfolios/PortfolioForm';
// import PortfolioRebalance   from './pages/PortfolioRebalanceSettings';

import PositionOverview     from './pages/portfolios/PositionOverview';
import PositionHistory      from './pages/portfolios/PositionHistory';

import AssetList            from './pages/Asset/AssetList';
import AssetForm            from './pages/Asset/AssetForm';

import RebalanceSuggester   from './pages/portfolios/RebalanceSuggester';
import RebalanceHistory     from './pages/portfolios/RebalanceHistory';

import LogViewer            from './pages/LogViewer';

import Today from './pages/Prices/Today';
import History from './pages/Prices/History';
 

export default function AppRouter() {
  return (
    <Router>
      <Routes>
        {/* 所有页面都套在 AppLayout 下 */}
        <Route element={<AppLayout />}>
          {/* 仪表盘 */}
          <Route path="/" element={<Dashboard />} />
              {/* 交易流水 */}
              <Route path="/transactions" element={<TransactionList />} />
          <Route path="/transactions/new" element={<AddTransaction />} />
          <Route path="/transactions/edit/:id" element={<EditTransaction />} />

          {/* 旧版 持仓视图 */}
          <Route path="/portfolios/:id/positions" element={<PositionOverview />} />
          <Route path="/portfolios/:id/positions/history" element={<PositionHistory />} />

          {/* 旧版 再平衡建议 */}
          <Route path="/portfolios/:id/rebalance" element={<RebalanceSuggester />} />
          <Route path="/portfolios/:id/rebalance/history" element={<RebalanceHistory />} />

          {/* 旧版 资产管理 */}
          <Route path="/assets" element={<AssetList />} />
          <Route path="/assets/new" element={<AssetForm />} />
          <Route path="/assets/edit/:id" element={<AssetForm />} />

          {/* 旧版 日志查看 */}
          <Route path="/logs" element={<LogViewer />} />

        {/* 投资组合 列表 */}
        <Route
          path={ROUTE_PATTERNS.PORTFOLIO_LIST}
          element={<List />}
        />
        <Route path="/portfolios/newold" element={<PortfolioForm />} />
        <Route path={ROUTE_PATTERNS.PORTFOLIO_EDIT} element={<PortfolioForm />} />
        {/* 新建 投资组合 */}
        {/* <Route
          path={ROUTE_PATTERNS.PORTFOLIO_NEW}
          element={<Edit />}
        /> */}

        {/* 查看 投资组合 详情 */}
        <Route
          path={ROUTE_PATTERNS.PORTFOLIO_VIEW}
          element={<Detail />}
        />
        {/* 查看 投资组合 basic */}
        <Route
          path={ROUTE_PATTERNS.PORTFOLIO_BASIC}
          element={<Basic />}
        />

        {/* 编辑 投资组合 */}
        {/* <Route
          path={ROUTE_PATTERNS.PORTFOLIO_EDIT}
          element={<Edit />}
        /> */}

        {/* 再平衡 */}
        <Route
          path={ROUTE_PATTERNS.PORTFOLIO_REBALANCE}
          element={<Rebalance />}
        />
{/* —— 新增：价格分类 —— */}
<Route
          path="/prices"
          element={<Today />}
        />
        <Route
          path="/prices/:symbol/history"
          element={<History />}
        />
        {/* 默认重定向到 列表 页 */}
        <Route
          path="*"
          element={<Navigate to={ROUTE_PATTERNS.PORTFOLIO_LIST} replace />}
        />
        </Route>
      </Routes>
    </Router>
  );
}


  // const router = createBrowserRouter(
  //   createRoutesFromElements(
  //     <Route element={<AppLayout />}>
  //       <Route path="/" element={<Dashboard />} />
  //       <Route path="/transactions" element={<TransactionList />} />
  //       <Route path="/transactions/new" element={<AddTransaction />} />
  //       <Route path="/transactions/edit/:id" element={<EditTransaction />} />
  //       <Route path="/portfolios" element={<PortfolioList />} />
  //       <Route path="/portfolios/view/:id" element={<PortfolioDetail />} />
  //       <Route path="/portfolios/new" element={<PortfolioForm />} />
  //       <Route path="/portfolios/edit/:id" element={<PortfolioForm />} />
  //       <Route path="/portfolios/rebalance/:id" element={<PortfolioRebalance />} />
  //       <Route path="/portfolios/:id/positions" element={<PositionOverview />}/>
  //       <Route path="/portfolios/:id/positions/history" element={<PositionHistory />}/>
  //       <Route
  //         path="/portfolios/:id/rebalance"
  //         element={<RebalanceSuggester />}
  //       />
  //       <Route
  //         path="/portfolios/:id/rebalance/history"
  //         element={<RebalanceHistory />}
  //       />
  //       <Route path="/assets" element={<AssetList />} />
  //       <Route path="/assets/new" element={<AssetForm />} />    
  //       <Route path='/assets/edit/:id' element={<AssetForm />} />
  //       <Route path="/logs" element={<LogViewer />} />
  //     </Route>
  //   )
  // );
  
  // export default router;
  