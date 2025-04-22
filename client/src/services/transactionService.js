// src/services/transactionService.js
import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8080/api'  // ✅ 指向你的后端端口
  });

export const getTransactions = async () => {
  const res = await api.get('/transactions');
  return res.data;
};

export const getTransactionById = async (id) => {
  const res = await api.get(`/transactions/${id}`);
  return res.data;
};

export const addTransaction = async (tx) => {
  return await api.post('/transactions', tx);
};

export const updateTransaction = async (id, tx) => {
  return await api.put(`/transactions/${id}`, tx);
};

export const deleteTransaction = async (id) => {
  return await api.delete(`/transactions/${id}`);
};
