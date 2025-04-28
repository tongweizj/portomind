import {
    createBrowserRouter,
    createRoutesFromElements,
    Route,
  } from 'react-router';
  import AppLayout from './components/layout/AppLayout';
  import Dashboard from './pages/Dashboard';
  import TransactionList from './pages/TransactionList';
  import AddTransaction from './pages/AddTransaction';
  import PortfolioList from './pages/PortfolioList';
  import PortfolioDetail from './pages/PortfolioDetail';
  import PortfolioForm from './pages/PortfolioForm';
  import PortfolioRebalance from './pages/PortfolioRebalanceSettings';
  import PositionOverview from './pages/PositionOverview';
  import PositionHistory from './pages/PositionHistory';
  import AssetList from './pages/AssetList';
  import AssetForm from './pages/AssetForm'; 
  import LogViewer from './pages/LogViewer';
  import EditTransaction from './pages/EditTransaction';



  const router = createBrowserRouter(
    createRoutesFromElements(
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<TransactionList />} />
        <Route path="/transactions/new" element={<AddTransaction />} />
        <Route path="/transactions/edit/:id" element={<EditTransaction />} />
        <Route path="/portfolios" element={<PortfolioList />} />
        <Route path="/portfolios/view/:id" element={<PortfolioDetail />} />
        <Route path="/portfolios/new" element={<PortfolioForm />} />
        <Route path="/portfolios/edit/:id" element={<PortfolioForm />} />
        <Route path="/portfolios/rebalance/:id" element={<PortfolioRebalance />} />
        <Route path="/portfolios/:id/positions" element={<PositionOverview />}/>
        <Route path="/portfolios/:id/positions/history" element={<PositionHistory />}/>
        <Route path="/assets" element={<AssetList />} />
        <Route path="/assets/new" element={<AssetForm />} />    
        <Route path='/assets/edit/:id' element={<AssetForm />} />
        <Route path="/logs" element={<LogViewer />} />
      </Route>
    )
  );
  
  export default router;
  