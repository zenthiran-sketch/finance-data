import type { InstrumentSeed, Market } from './types.js';
import { CRYPTO_SYMBOLS, STOCK_SYMBOLS, FOREX_TARGETS, MUTUAL_FUND_SCHEMES } from './types.js';

export function createQueue(concurrency: number) {
  let active = 0;
  const pending: Array<{
    fn: () => Promise<unknown>;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }> = [];

  function runNext() {
    if (active >= concurrency || pending.length === 0) return;
    active++;
    const { fn, resolve, reject } = pending.shift()!;
    fn().then(resolve, reject).finally(() => {
      active--;
      runNext();
    });
  }

  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      pending.push({ fn, resolve: resolve as (v: unknown) => void, reject });
      runNext();
    });
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function getDefaultInstrumentSeeds(): InstrumentSeed[] {
  const seeds: InstrumentSeed[] = [];

  for (const sym of CRYPTO_SYMBOLS) {
    seeds.push({
      symbol: sym.replace('USDT', '/USDT'),
      name: sym.replace('USDT', ''),
      market: 'Crypto',
      currency: 'USD',
      exchange: 'BINANCE',
      inDefaultSeed: true,
    });
  }

  for (const sym of STOCK_SYMBOLS) {
    const clean = sym.replace('.NS', '');
    seeds.push({
      symbol: clean,
      name: clean,
      market: 'Stocks',
      currency: 'INR',
      exchange: 'NSE',
      inDefaultSeed: true,
    });
  }

  for (const t of FOREX_TARGETS) {
    seeds.push({
      symbol: `${t}/INR`,
      name: `${t}/INR`,
      market: 'Forex',
      currency: 'INR',
      inDefaultSeed: true,
    });
  }

  const commodities = [
    { symbol: 'XAU/INR', name: 'Gold' },
    { symbol: 'XAG/INR', name: 'Silver' },
    { symbol: 'XCU/INR', name: 'Copper' },
  ];
  for (const c of commodities) {
    seeds.push({ ...c, market: 'Commodities' as Market, currency: 'INR', inDefaultSeed: false });
  }

  const nifty50 = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'ITC', 'SBIN',
    'BHARTIARTL', 'KOTAKBANK', 'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'TITAN',
    'SUNPHARMA', 'BAJFINANCE', 'WIPRO', 'ULTRACEMCO', 'NESTLEIND', 'TATAMOTORS',
    'POWERGRID', 'NTPC', 'M&M', 'HCLTECH', 'ADANIENT', 'JSWSTEEL', 'TATASTEEL',
    'TECHM', 'ONGC', 'COALINDIA', 'GRASIM', 'INDUSINDBK', 'CIPLA', 'DRREDDY',
    'EICHERMOT', 'APOLLOHOSP', 'DIVISLAB', 'BAJAJFINSV', 'HEROMOTOCO', 'BRITANNIA',
    'TATACONSUM', 'HDFCLIFE', 'SBILIFE', 'BPCL', 'ADANIPORTS', 'LTIM', 'HINDALCO',
  ];
  for (const sym of nifty50) {
    if (!seeds.find((s) => s.symbol === sym && s.market === 'Stocks')) {
      seeds.push({ symbol: sym, name: sym, market: 'Stocks', currency: 'INR', exchange: 'NSE' });
    }
  }

  const usStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V', 'JNJ'];
  for (const sym of usStocks) {
    seeds.push({ symbol: sym, name: sym, market: 'Stocks', currency: 'USD', exchange: 'NYSE' });
  }

  for (const mf of MUTUAL_FUND_SCHEMES) {
    seeds.push({
      symbol: mf.code,
      name: mf.name,
      market: 'MutualFunds',
      currency: 'INR',
      inDefaultSeed: false,
    });
  }

  return seeds;
}
