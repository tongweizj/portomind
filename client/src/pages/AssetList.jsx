import { useEffect, useState } from 'react';
import { getAllAssets, deleteAsset } from '../services/assetService';
import { useNavigate } from 'react-router';

export default function AssetList() {
  const [assets, setAssets] = useState([]);
  const navigate = useNavigate();

  const loadAssets = async () => {
    const res = await getAllAssets();
    setAssets(res);
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const handleDelete = async (id) => {
    if (confirm('确定要删除吗？')) {
      await deleteAsset(id);
      loadAssets();
    }
  };

  return (
    <div>
      <h2>资产列表</h2>
      <button onClick={() => navigate('/assets/new')}>添加资产</button>
      <table border="1">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Market</th>
            <th>Currency</th>
            <th>Type</th>
            <th>Active</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {assets.map(asset => (
            <tr key={asset._id}>
              <td>{asset.symbol}</td>
              <td>{asset.name}</td>
              <td>{asset.market}</td>
              <td>{asset.currency}</td>
              <td>{asset.type}</td>
              <td>{asset.active ? '✅' : '❌'}</td>
              <td>
                <button onClick={() => navigate(`/assets/edit/${asset._id}`)}>编辑</button>
                <button onClick={() => handleDelete(asset._id)}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}