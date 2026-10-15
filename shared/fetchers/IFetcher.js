// server/services/fetchers/IFetcher.js

/**
 * @interface IFetcher
 * 
 * 所有抓取器都应实现以下两个方法：
 * 
 * fetchLatest(symbol: string): Promise<{
 *   symbol: string,
 *   name: string,
 *   price: number,
 *   currency: string,
 *   market: string,
 *   timestamp: Date
 * }>
 * 
 * fetchHistory(symbol: string, from: Date, to: Date):
 *   Promise<Array<{
 *     symbol: string,
 *     price: number,
 *     timestamp: Date
 *   }>>
 *
 * 失败时抛出 MarketDataError，category 为：
 * TIMEOUT | RATE_LIMIT | NOT_FOUND | INVALID_RESPONSE | UPSTREAM。
 * 所有外部调用必须受 MARKET_DATA_TIMEOUT_MS 限制。
 */
