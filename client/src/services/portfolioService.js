// src/services/portfolioService.js
import axios from 'axios';

const api = axios.create({
  baseURL : import.meta.env.VITE_API_URL + `/portfolios` || `http://localhost:8080/api/portfolios`
});

export const createPortfolio = async (data) => {
  return await api.post('/', data);
};

// export const getAllPortfolios = async (data) => {
//   return await api.get('/', data);
// };
export const getAllPortfolios = async () => {
  const res = await api.get('/');

  // console.log("📦 返回的组合数据", res.data);
  return res.data; // ✅ 确保是返回 .data，而不是整个 res
};
export const getPortfolioById = async (id) => {
    return await api.get(`/${id}`).then(res=>res.data);
  };
  
  export const updatePortfolio = async (id, data) => {
    return await api.put(`/${id}`, data);
  };
  
  export const deletePortfolio = async (id) => {
    return await api.delete(`/${id}`);
  };
  
  // 获取实时持仓比例
export function getActualRatios(id) {
  return api
    .get(`/${id}/actual-ratios`)
    .then(res => res.data);
}