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
import Family from './pages/Family';
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

          <Route path="/family" element={<Family />} />

          <Route path="/alerts/rules" element={<AlertRules />} />

          <Route path="/transactions" element={<TransactionList />} />
          <Route path="/transactions/new" element={<AddTransaction />} />
          <Route path="/transactions/import" element={<ImportTransactions />} />
          <Route path="/transactions/edit/:id" element={<EditTransaction />} />

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
          <Route
            path="*"
            element={<Navigate to={ROUTE_PATTERNS.PORTFOLIO_LIST} replace />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
