// src/services/transactionService.js
import axios from 'axios';

const api = axios.create({
    baseURL : import.meta.env.VITE_API_URL  || `http://localhost:8080/api`
  });

export const getTransactions = async () => {
  const res = await api.get('/transactions');
  return res.data;
};

export const getTransactionById = async (id) => {
  const res = await api.get(`/transactions/${id}`);
  return res.data;
};

export async function getTransactionsByPortfolio(portfolioId) {
  const res = await api.get(`/transactions/portfolio/${portfolioId}`);
  return res.data;
}

export const addTransaction = async (tx) => {
  return await api.post('/transactions', tx);
};

export const updateTransaction = async (id, tx) => {
  console.log("🚀 更新交易", id, tx);
  return await api.put(`/transactions/${id}`, tx);
};

export const deleteTransaction = async (id) => {
  return await api.delete(`/transactions/${id}`);
};
