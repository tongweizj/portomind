import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ButtonGroup } from '../../components/ButtonGroup';
import { ROUTES } from '../../constants/routes';
import {  deletePortfolio } from '../../services/portfolioService';
export default function Basic(pf) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [actualRatios, setActualRatios] = useState([]);

  const buttons = [
     { label: '删除', onClick: () => handleDelete(), type: 'primary' },
    { label: '编辑', onClick: () => navigate(ROUTES.PORTFOLIO_EDIT(id)), type: 'primary' },
    { label: '返回', onClick: () => navigate(ROUTES.PORTFOLIO_LIST) },
  ];
  // console.log("txs: ", txs.data);
  // 删除组合
  const handleDelete = async () => {
    if (!window.confirm('确认要删除此组合及其所有配置吗？此操作不可撤销。')) return;
    try {
      await deletePortfolio(id);
      navigate('/portfolios');
    } catch (err) {
      alert('删除失败：' + (err.response?.data?.message || err.message));
    }
  };

  pf = pf.pf;

  return (

    /* 现有: 组合基本信息 */
    <div className="space-y-6">

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">{pf.name}</h1>
        <ButtonGroup buttons={buttons} className="my-4" />
      </div>
      <div className="bg-white p-4 rounded shadow text-sm text-gray-700">
        <p><strong>类型：</strong> {pf.type}</p>
        <p><strong>币种：</strong> {pf.currency}</p>
        <p><strong>描述：</strong> {pf.description || '暂无描述'}</p>
      </div>


      {/* 新增: 目标资产配置展示 */}
      <div className="bg-white p-4 rounded shadow text-sm text-gray-700">
        <h2 className="text-lg font-semibold mb-2">目标资产配置</h2>
        {pf.targets && pf.targets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 text-left">Symbol</th>
                  <th className="px-4 py-2 text-right">目标比例 (%)</th>
                  <th className="px-4 py-2 text-right">当前比例 (%)</th>
                </tr>
              </thead>
              <tbody>
                {pf.targets.map((t, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{t.symbol}</td>
                    <td className="px-4 py-2 text-right">{t.targetRatio}</td>
                    <td className="px-4 py-2 text-right">{(actualRatios.find(r => r.symbol === t.symbol)?.ratio ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">未设置目标资产配置。</p>
        )}
      </div>
    </div>
  );
}
