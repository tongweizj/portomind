// client/src/services/priceService.js

import axios from 'axios';

// 基础 API 路径，自动使用环境变量或相对路径
const API_BASE = import.meta.env.VITE_API_URL + `/prices` || `http://localhost:8080/api/prices`

/**
 * 获取指定日期所有资产的最新价格（分页）
 * GET /api/assets/prices?date=YYYY-MM-DD&page=&pageSize=
 * @param {object} options
 * @param {string} options.date     格式 'YYYY-MM-DD'
 * @param {number} options.page     当前页，默认 1
 * @param {number} options.pageSize 每页条数，默认 20
 * @returns {Promise<{ total: number, data: Array<{ symbol: string, price: number, timestamp: string }> }>} 价格列表
 */
export async function getTodayPrices({ date, page = 1, pageSize = 20 } = {}) {
  const params = { date, page, pageSize };
  const response = await axios.get(`${API_BASE}`, { params });
  return response.data;
}

/**
 * 获取单个资产的历史价格（分页 + 年月过滤）
 * GET /api/assets/:symbol/prices?year=&month=&page=&pageSize=
 * @param {string} symbol          资产代码
 * @param {object} options
 * @param {number} options.year    年份，如 2025
 * @param {number} options.month   月份 1-12
 * @param {number} options.page     当前页，默认 1
 * @param {number} options.pageSize 每页条数，默认 20
 * @returns {Promise<{ total: number, data: Array<{ date: string, price: number }> }>} 历史价格列表
 */
export async function getPriceHistory(
  symbol,
  { year, month, page = 1, pageSize = 20 } = {}
) {
  const params = { page, pageSize };
  if (year)  params.year = year;
  if (month) params.month = month;
  const response = await axios.get(`${API_BASE}/symbol/${symbol}`, { params });
  return response.data;
}