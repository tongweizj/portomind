import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useTransactions } from '../../hooks/useTransactions';
import { getSuggestions } from '../../services/rebalanceService';
import { TransactionTable } from '../../components/TransactionTable';
import { ButtonGroup } from '../../components/ButtonGroup';
import { ROUTES } from '../../constants/routes';

export default  function Rebalance() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: pf, isLoading: lp, isError: ep } = usePortfolio(id);
  const { data: txs, isLoading: lt, isError: et } = useTransactions(id);

 // 本地 state 存放 suggestions
 const [ops, setOps] = useState([]);
 const [loadingOps, setLoadingOps] = useState(false);
 const [errorOps, setErrorOps] = useState(false);

 // 只在 pf._id 加载完成后触发一次
 useEffect(() => {
   if (lp || lt || ep || et) return;      // 等待前序数据就绪，或者已有错误就不发
   setLoadingOps(true);
   getSuggestions(pf._id)
     .then(result => {
       setOps(result);
       setLoadingOps(false);
     })
     .catch(err => {
       console.error(err);
       setErrorOps(true);
       setLoadingOps(false);
     });
 }, [pf?._id, lp, lt, ep, et]);

  if (lp || lt) return <p>加载中…</p>;
  if (ep || et) return <p>数据加载出错</p>;


  const buttons = [
    { label: '新建', onClick: () => navigate('/portfolios/new'), type: 'primary' },

          { label: '返回详情', onClick: () => navigate(ROUTES.PORTFOLIO_VIEW(id)) },
  ];
  return (
    <div>
      <h1>再平衡：{pf.name}</h1>

      <TransactionTable
        transactions={ops}
        columns={['symbol', 'action', 'quantity']}
      />

      <ButtonGroup
        buttons={buttons}
      />
    </div>
  );
}
