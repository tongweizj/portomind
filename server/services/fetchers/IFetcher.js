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
 */
