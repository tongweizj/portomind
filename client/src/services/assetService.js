import axios from 'axios';

const API_BASE = 'http://localhost:8080/api/assets';

export const getAllAssets = async () => {
  const res = await axios.get(API_BASE);
  return res.data;
};

export const getAssetById = async (id) => {
  const res = await axios.get(`${API_BASE}/${id}`);
  return res.data;
};

export const createAsset = async (data) => {
  const res = await axios.post(API_BASE, data);
  return res.data;
};

export const updateAsset = async (id, data) => {
  const res = await axios.put(`${API_BASE}/${id}`, data);
  return res.data;
};

export const deleteAsset = async (id) => {
  const res = await axios.delete(`${API_BASE}/${id}`);
  return res.data;
};
