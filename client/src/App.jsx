// src/App.js
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router';
import axios from 'axios';
import { PulseLoader } from 'react-spinners';
import { Line } from 'react-chartjs-2';
import Header from './components/common/Header';
import ETFList from './components/ETF/ETFList';
import Sidebar from './components/Sidebar';
import TransactionList from './pages/TransactionList';
import AddTransaction from './pages/AddTransaction';
import EditTransaction from './pages/EditTransaction';
import './styles/base.css' 
export default function App() {
  return (
    <Router>
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div style={{ flex: 1, padding: '20px' }}>
          <Routes>
            <Route path="/" element={<TransactionList />} />
            <Route path="/add" element={<AddTransaction />} />
            <Route path="/edit/:id" element={<EditTransaction />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
// function App ()  {
//   const [etfData, setEtfData] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const [selectedETF, setSelectedETF] = useState(null);

//   useEffect(() => {
//     const fetchData = async () => {
//       try {
//         const response = await axios.get('http://localhost:8080/api/etfs/daily');
//         setEtfData(response.data);
//       } catch (err) {
//         setError(err.message);
//       } finally {
//         setLoading(false);
//       }
//     };
    
//     fetchData();
//     const interval = setInterval(fetchData, 30000); // 每30秒更新
//     return () => clearInterval(interval);
//   }, []);

//   if (loading) return <PulseLoader color="#36d7b7" />;
//   if (error) return <ErrorAlert message={error} />;

//   return (
//     <div className="container">
//       <Header />
//       <ETFList 
//         etfs={Array.isArray(etfData) ? etfData : []} 
//         onSelect={setSelectedETF}
//       />
//       {selectedETF && (
//         <ETFDetail 
//           etf={selectedETF}
//           Chart={() => (
//             <Line 
//               data={prepareChartData(selectedETF.history)}
//               options={chartOptions}
//             />
//           )}
//         />
//       )}
//     </div>
//   );
// };
