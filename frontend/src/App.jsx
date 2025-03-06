// src/App.js
import { useState, useEffect } from 'react';
import axios from 'axios';
import { PulseLoader } from 'react-spinners';
import { Line } from 'react-chartjs-2';
import Header from './components/common/Header';
import ETFList from './components/ETF/ETFList';
import './styles/base.css' 

function App ()  {
  const [etfData, setEtfData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedETF, setSelectedETF] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:8080/api/etfs/daily');
        setEtfData(response.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 30000); // 每30秒更新
    return () => clearInterval(interval);
  }, []);

  if (loading) return <PulseLoader color="#36d7b7" />;
  if (error) return <ErrorAlert message={error} />;

  return (
    <div className="container">
      <Header />
      <ETFList 
        etfs={Array.isArray(etfData) ? etfData : []} 
        onSelect={setSelectedETF}
      />
      {selectedETF && (
        <ETFDetail 
          etf={selectedETF}
          Chart={() => (
            <Line 
              data={prepareChartData(selectedETF.history)}
              options={chartOptions}
            />
          )}
        />
      )}
    </div>
  );
};
export default App; 