import axios from 'axios';

// const API_BASE = 'http://localhost:8080/api/assets';
const API_BASE = import.meta.env.VITE_API_URL + `/assets` || `http://localhost:8080/api/assets`

/**
 * 获取资产列表，支持分页、搜索、排序
 * GET /api/assets
 * @param {object} options
 * @param {number} options.page         当前页码
 * @param {number} options.pageSize     每页条数
 * @param {string} options.search       模糊搜索关键字
 * @param {string} options.sortBy       排序字段，如 'symbol'、'price'
 * @param {'asc'|'desc'} options.sortOrder 排序顺序
 * @returns {Promise<{ total: number, data: Array<Object> }>} 返回 { total, data: assets }
 */
export async function getAssets({
  page = 1,
  pageSize = 20,
  search,
  sortBy,
  sortOrder
} = {}) {
  const params = {
    page,
    pageSize
  };
  if (search)    params.search = search;
  if (sortBy)    params.sortBy = sortBy;
  if (sortOrder) params.sortOrder = sortOrder;

  const response = await axios.get(API_BASE, { params });
  return response.data; // 需后端返回 { total, data }
}

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


/**
 * 删除指定资产
 * DELETE /api/assets/:id
 * @param {string} id 资产 ID
 * @returns {Promise<void>}
 */
export const deleteAsset = async (id) => {
  const res = await axios.delete(`${API_BASE}/${id}`);
  return res.data;
};
