import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from 'react-router';

import AppLayout from './components/layout/AppLayout';
import { ROUTE_PATTERNS } from './constants/routes';
import AssetDetail from './pages/Asset/AssetDetail';
import AssetForm from './pages/Asset/AssetForm';
import AssetList from './pages/Asset/AssetList';
import Dashboard from './pages/Dashboard';
import LogViewer from './pages/LogViewer';
import AlertRules from './pages/Alerts/AlertRules';
import Detail from './pages/Portfolio/Detail';
import List from './pages/Portfolio/List';
import PortfolioForm from './pages/Portfolio/PortfolioForm';
import History from './pages/Prices/History';
import Today from './pages/Prices/Today';
import AddTransaction from './pages/Transaction/AddTransaction';
import EditTransaction from './pages/Transaction/EditTransaction';
import ImportTransactions from './pages/Transaction/ImportTransactions';
import TransactionList from './pages/Transaction/TransactionList';

// 旧路由兼容（OQ5）：/assets/edit/:id → /instruments/edit/:id，保留 id
function LegacyAssetEditRedirect() {
  const { id } = useParams();
  return <Navigate to={`/instruments/edit/${id}`} replace />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/alerts/rules" element={<AlertRules />} />

          {/*
            交易已收拢为组合子资源（TASK-044）：
            - `/portfolios/transactions` = 跨组合「全部交易」聚合页（只读，2 段字面量）
            - 写操作一律 `/portfolios/:id/transactions/*`，portfolioId 取自路径
            - 旧 `/transactions` 路由族已删除，不做重定向（OQ3：命中 `*` 通配落 /portfolios）
            ⚠️ 字面量路由需先于动态路由声明：将来若新增 2 段 `/portfolios/:id`，聚合页会被吞掉。
          */}
          <Route path={ROUTE_PATTERNS.PORTFOLIO_TX_ALL} element={<TransactionList />} />
          <Route path={ROUTE_PATTERNS.PORTFOLIO_TX_NEW} element={<AddTransaction />} />
          <Route path={ROUTE_PATTERNS.PORTFOLIO_TX_EDIT} element={<EditTransaction />} />
          <Route path={ROUTE_PATTERNS.PORTFOLIO_TX_IMPORT} element={<ImportTransactions />} />

          {/* 标的：列表从「今日行情」屏底进入，不占顶层导航 */}
          <Route path="/instruments" element={<AssetList />} />
          <Route path="/instruments/new" element={<AssetForm />} />
          <Route path="/instruments/edit/:id" element={<AssetForm />} />
          <Route path="/instruments/:id" element={<AssetDetail />} />

          {/* 旧 /assets 路由兼容重定向（避免书签/历史失效） */}
          <Route path="/assets" element={<Navigate to="/instruments" replace />} />
          <Route path="/assets/new" element={<Navigate to="/instruments/new" replace />} />
          <Route path="/assets/edit/:id" element={<LegacyAssetEditRedirect />} />

          <Route path="/prices" element={<Today />} />
          <Route path="/prices/:symbol/history" element={<History />} />

          <Route path={ROUTE_PATTERNS.PORTFOLIO_LIST} element={<List />} />
          <Route path={ROUTE_PATTERNS.PORTFOLIO_NEW} element={<PortfolioForm />} />
          <Route path={ROUTE_PATTERNS.PORTFOLIO_EDIT} element={<PortfolioForm />} />
          <Route path={ROUTE_PATTERNS.PORTFOLIO_VIEW} element={<Detail />} />
          <Route path={ROUTE_PATTERNS.PORTFOLIO_TAB} element={<Detail />} />

          <Route path="/logs" element={<LogViewer />} />
          {/* TASK-050：原「家庭视图」页已下线（五区块并入 /portfolios），不设显式重定向，
              书签访问由下面的 `*` 通配承接落到组合列表页。 */}
          <Route
            path="*"
            element={<Navigate to={ROUTE_PATTERNS.PORTFOLIO_LIST} replace />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
