import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router';

import AppLayout from './components/layout/AppLayout';
import { ROUTE_PATTERNS } from './constants/routes';
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
import TransactionList from './pages/Transaction/TransactionList';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/alerts/rules" element={<AlertRules />} />

          <Route path="/transactions" element={<TransactionList />} />
          <Route path="/transactions/new" element={<AddTransaction />} />
          <Route path="/transactions/edit/:id" element={<EditTransaction />} />

          <Route path="/assets" element={<AssetList />} />
          <Route path="/assets/new" element={<AssetForm />} />
          <Route path="/assets/edit/:id" element={<AssetForm />} />

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
