
export const fetchETFData = async () => {
    const response = await axios.get(import.meta.env.VITE_API_URL  || 'http://localhost:8080/api');
    return processETFData(response.data); // 使用之前的格式化方法
  };
  
  // 实时更新处理
  export const handleRealTimeUpdate = (prevData, newData) => {
    return prevData.map(etf => 
      etf.code === newData.code && 
      new Date(newData.timestamp) > new Date(etf.timestamp) 
        ? processETFData([newData])[0]
        : etf
    );
  };
  