const asyncHandler = require('express-async-handler');
const priceService = require('../services/price.service');
const { isDateString, MARKET_TIMEZONE } = require('../utils/marketTime');
const { success, failure, pagination, parsePagination } = require('../utils/apiResponse');

function validatePagination(req, res) {
  for (const field of ['page', 'pageSize']) {
    if (req.query[field] !== undefined && !/^[1-9]\d*$/.test(req.query[field])) {
      failure(req, res, 400, `${field} must be a positive integer`);
      return false;
    }
  }
  if (Number(req.query.pageSize) > 200) {
    failure(req, res, 400, 'pageSize cannot exceed 200');
    return false;
  }
  return true;
}

function parseHistoryFilters(req, res) {
  const hasYear = req.query.year !== undefined;
  const hasMonth = req.query.month !== undefined;
  const hasRange = req.query.from !== undefined || req.query.to !== undefined;
  const year = hasYear ? Number(req.query.year) : undefined;
  const month = hasMonth ? Number(req.query.month) : undefined;

  if ((hasYear && (!Number.isInteger(year) || year < 1970 || year > 9998)) ||
      (hasMonth && (!Number.isInteger(month) || month < 1 || month > 12)) ||
      (hasMonth && !hasYear)) {
    failure(req, res, 400, 'Invalid year/month. month requires year and must be between 1 and 12.');
    return null;
  }
  if (hasYear && hasRange) {
    failure(req, res, 400, 'Use either year/month or from/to, not both.');
    return null;
  }
  if ((req.query.from && !isDateString(req.query.from)) || (req.query.to && !isDateString(req.query.to))) {
    failure(req, res, 400, 'Invalid date range. Use YYYY-MM-DD.');
    return null;
  }
  if (req.query.from && req.query.to && req.query.from > req.query.to) {
    failure(req, res, 400, 'from cannot be after to.');
    return null;
  }
  return { year, month, from: req.query.from, to: req.query.to };
}

exports.getPricesByDate = asyncHandler(async (req, res) => {
  if (!validatePagination(req, res)) return;
  if (!isDateString(req.params.date)) {
    return failure(req, res, 400, 'Invalid date format. Use YYYY-MM-DD.');
  }
  const { page, pageSize } = parsePagination(req.query, { maxPageSize: 200 });
  const result = await priceService.getPricesByDate(req.params.date, { page, pageSize });
  res.setHeader('X-Market-Timezone', MARKET_TIMEZONE);
  return success(res, result.data, { pagination: pagination(page, pageSize, result.total) });
});

exports.getTodayPrices = asyncHandler(async (req, res) => {
  if (!validatePagination(req, res)) return;
  const { page, pageSize } = parsePagination(req.query, { maxPageSize: 200 });
  const result = await priceService.getTodayLatest({ page, pageSize });
  res.setHeader('X-Market-Timezone', MARKET_TIMEZONE);
  return success(res, result.data, { pagination: pagination(page, pageSize, result.total) });
});

exports.getPriceHistory = asyncHandler(async (req, res) => {
  if (!validatePagination(req, res)) return;
  const filters = parseHistoryFilters(req, res);
  if (!filters) return;
  const { page, pageSize } = parsePagination(req.query, { maxPageSize: 200 });
  const result = await priceService.getPriceHistory(req.params.symbol, {
    ...filters,
    page,
    pageSize
  });
  res.setHeader('X-Market-Timezone', MARKET_TIMEZONE);
  return success(res, result.data, { pagination: pagination(page, pageSize, result.total) });
});

exports.getPriceById = asyncHandler(async (req, res) => {
  const price = await priceService.getPriceById(req.params.id);
  if (!price) return failure(req, res, 404, 'Price not found');
  return success(res, price);
});

exports.createPrice = asyncHandler(async (req, res) =>
  success(res, await priceService.createPrice(req.body), { status: 201 })
);

exports.updatePrice = asyncHandler(async (req, res) => {
  const updated = await priceService.updatePrice(req.params.id, req.body);
  if (!updated) return failure(req, res, 404, 'Price not found');
  return success(res, updated);
});

exports.deletePrice = asyncHandler(async (req, res) => {
  const deleted = await priceService.deletePrice(req.params.id);
  if (!deleted) return failure(req, res, 404, 'Price not found');
  return success(res, deleted);
});
