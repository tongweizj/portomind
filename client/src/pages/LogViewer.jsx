import { useEffect, useState } from 'react';
import axios from 'axios';

export default function LogViewer() {
  const [log, setLog] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLog = async () => {
      try {
        const res = await axios.get('/api/logs/sync.log');
        setLog(res.data);
      } catch (err) {
        setLog('⚠️ 无法加载日志，请检查服务器日志路径。');
      } finally {
        setLoading(false);
      }
    };

    fetchLog();
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">价格同步日志</h1>
      {loading ? (
        <p className="text-gray-500">加载中...</p>
      ) : (
        <pre className="bg-black text-green-300 text-sm p-4 rounded overflow-auto whitespace-pre-wrap max-h-[70vh]">
          {log}
        </pre>
      )}
    </div>
  );
}
