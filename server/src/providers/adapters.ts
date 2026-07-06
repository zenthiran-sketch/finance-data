import type { ProviderAdapter } from './registry.js';
import { registerProvider, PROVIDER_REGISTRY } from './registry.js';
import type { Market } from '@signal-terminal/shared';
import type { Candle } from '@signal-terminal/shared';

const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

const COMMODITY_FUTURES: Record<string, string> = {
  XAU: 'GC=F',
  XAG: 'SI=F',
  XCU: 'HG=F',
};

type YahooChartJson = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: (number | null)[];
          volume?: (number | null)[];
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
        }>;
      };
    }>;
  };
};

function parseYahooChart(json: YahooChartJson): Candle[] {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Unexpected Yahoo response');
  const quote = result.indicators?.quote?.[0];
  const timestamps = result.timestamp || [];
  const candles: Candle[] = [];
  for (let i = 0; i < (quote?.close?.length || 0); i++) {
    if (quote?.close?.[i] != null) {
      candles.push({
        close: quote.close[i]!,
        volume: quote.volume?.[i] ?? null,
        open: quote.open?.[i] ?? undefined,
        high: quote.high?.[i] ?? undefined,
        low: quote.low?.[i] ?? undefined,
        date: timestamps[i] ? new Date(timestamps[i]! * 1000).toISOString().slice(0, 10) : undefined,
      });
    }
  }
  return candles;
}

async function fetchYahooCandles(yahooSym: string): Promise<{ candles: Candle[]; requestUrl: string }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?range=2y&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SignalTerminal/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as YahooChartJson;
  const candles = parseYahooChart(json);
  if (candles.length < 30) throw new Error('Not enough history');
  return { candles, requestUrl: url };
}

async function convertCandlesToInr(candles: Candle[]): Promise<Candle[]> {
  const { candles: fxCandles } = await fetchYahooCandles('INR=X');
  const rateByDate = new Map(fxCandles.filter((c) => c.date).map((c) => [c.date!, c.close]));
  let lastRate = fxCandles[fxCandles.length - 1]?.close ?? 83;
  return candles.map((c) => {
    const rate = (c.date && rateByDate.get(c.date)) || lastRate;
    if (c.date && rateByDate.has(c.date)) lastRate = rate;
    const mul = (v: number | undefined) => (v != null ? v * rate : undefined);
    return {
      ...c,
      close: c.close * rate,
      open: mul(c.open),
      high: mul(c.high),
      low: mul(c.low),
    };
  });
}

const binance: ProviderAdapter = {
  id: 'binance',
  name: 'Binance',
  tier: 'free',
  requiresKey: false,
  limits: {},
  pipelines: ['prices-crypto', 'live-stream'],
  markets: ['Crypto'],
  enabled: true,
  async fetchCandles(symbol) {
    const sym = symbol.replace('/', '') + (symbol.includes('USDT') ? '' : 'USDT');
    const clean = sym.includes('USDT') ? sym.replace('/', '') : `${sym.replace('/', '')}USDT`;
    let lastErr: Error | null = null;
    for (const host of BINANCE_HOSTS) {
      try {
        const url = `${host}/api/v3/klines?symbol=${clean}&interval=1d&limit=500`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json() as unknown[][];
        return {
          candles: raw.map((k) => ({
            close: +(k[4] as number),
            volume: +(k[5] as number),
            open: +(k[1] as number),
            high: +(k[2] as number),
            low: +(k[3] as number),
            date: new Date(k[0] as number).toISOString().slice(0, 10),
          })),
          requestUrl: url,
        };
      } catch (e) { lastErr = e as Error; }
    }
    throw lastErr || new Error('Binance fetch failed');
  },
};

registerProvider(binance);

const yahoo: ProviderAdapter = {
  id: 'yahoo',
  name: 'Yahoo Finance',
  tier: 'free',
  requiresKey: false,
  limits: {},
  pipelines: ['prices-stocks', 'prices-forex', 'prices-commodities'],
  markets: ['Stocks', 'Forex', 'Commodities'],
  enabled: true,
  async fetchCandles(symbol, market) {
    let yahooSym = symbol;
    let convertInr = false;
    if (market === 'Stocks' && !symbol.includes('.')) {
      yahooSym = `${symbol}.NS`;
    } else if (market === 'Commodities') {
      const base = symbol.split('/')[0].toUpperCase();
      yahooSym = COMMODITY_FUTURES[base] || symbol;
      convertInr = symbol.toUpperCase().includes('/INR');
    }
    let { candles, requestUrl } = await fetchYahooCandles(yahooSym);
    if (convertInr) candles = await convertCandlesToInr(candles);
    return { candles, requestUrl };
  },
};

registerProvider(yahoo);

const frankfurter: ProviderAdapter = {
  id: 'frankfurter',
  name: 'Frankfurter ECB',
  tier: 'free',
  requiresKey: false,
  limits: {},
  pipelines: ['prices-forex'],
  markets: ['Forex'],
  enabled: true,
  async fetchCandles(symbol) {
    const target = symbol.split('/')[0];
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 450);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const url = `https://api.frankfurter.dev/v1/${fmt(start)}..${fmt(end)}?base=INR&symbols=${target}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { rates?: Record<string, Record<string, number>> };
    const dates = Object.keys(data.rates || {}).sort();
    const candles = dates.map((d) => ({
      close: 1 / data.rates![d][target],
      date: d,
    }));
    return { candles, requestUrl: url };
  },
};

registerProvider(frankfurter);

const goldprice: ProviderAdapter = {
  id: 'goldprice',
  name: 'Goldprice.dev',
  tier: 'free',
  requiresKey: false,
  limits: {},
  pipelines: ['prices-commodities'],
  markets: ['Commodities'],
  enabled: false,
  async fetchCandles(symbol) {
    const metal = symbol.startsWith('XAU') ? 'XAU' : symbol.startsWith('XAG') ? 'XAG' : 'XCU';
    const quote = symbol.toUpperCase().includes('/INR') ? 'INR' : 'USD';
    const spotSym = `${metal}-${quote}-SPOT`;
    const url = `https://api.goldprice.dev/v1/spot/${spotSym}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { price?: string };
    const price = parseFloat(data.price || '');
    if (!price) throw new Error('No spot price');
    const today = new Date().toISOString().slice(0, 10);
    const candles = Array.from({ length: 60 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (59 - i));
      return { close: price, date: d.toISOString().slice(0, 10) };
    });
    candles[candles.length - 1] = { close: price, date: today };
    return { candles, requestUrl: url };
  },
};

registerProvider(goldprice);

function keyedAdapter(
  id: string,
  name: string,
  signupUrl: string,
  limits: ProviderAdapter['limits'],
  pipelines: ProviderAdapter['pipelines'],
  markets: Market[],
  buildUrl: (symbol: string, market: Market, key: string) => string,
  parseCandles: (json: unknown) => { close: number; volume?: number; date?: string }[],
  testOpts?: { symbol: string; market: Market },
): ProviderAdapter {
  const adapter: ProviderAdapter = {
    id,
    name,
    tier: 'free',
    requiresKey: true,
    signupUrl,
    limits,
    pipelines,
    markets,
    enabled: true,
    async fetchCandles(symbol, market, lease) {
      if (!lease) throw new Error(`${name} requires API key`);
      const url = buildUrl(symbol, market, lease.apiKey);
      const res = await fetch(url);
      if (res.status === 429) throw Object.assign(new Error('Rate limited'), { status: 429 });
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Invalid key'), { status: 401 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const candles = parseCandles(json);
      if (candles.length < 10) throw new Error('Not enough history');
      return { candles, requestUrl: url.replace(lease.apiKey, '***') };
    },
    async testKey(lease) {
      try {
        const sym = testOpts?.symbol ?? (markets[0] === 'Stocks' ? 'AAPL' : 'BTCUSDT');
        const mkt = testOpts?.market ?? markets[0];
        await adapter.fetchCandles!(sym, mkt, lease);
        return true;
      } catch { return false; }
    },
  };
  return adapter;
}

registerProvider(keyedAdapter(
  'finnhub', 'Finnhub', 'https://finnhub.io/register',
  { perMinute: 60 },
  ['prices-stocks', 'prices-crypto', 'prices-forex', 'live-stream', 'sentiment-news'],
  ['Stocks', 'Crypto', 'Forex'],
  (symbol, market, key) => {
    const sym = market === 'Crypto' ? symbol.replace('/', '') : symbol;
    const from = Math.floor(Date.now() / 1000) - 86400 * 400;
    const to = Math.floor(Date.now() / 1000);
    return `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}&token=${key}`;
  },
  (json) => {
    const j = json as { c?: number[]; v?: number[]; t?: number[] };
    if (!j.c) return [];
    return j.c.map((close, i) => ({
      close,
      volume: j.v?.[i],
      date: j.t?.[i] ? new Date(j.t[i]! * 1000).toISOString().slice(0, 10) : undefined,
    }));
  },
));

// Finnhub testKey override — free keys support quote but not always candles
const finnhubAdapter = PROVIDER_REGISTRY.find((p) => p.id === 'finnhub');
if (finnhubAdapter) {
  finnhubAdapter.testKey = async (lease) => {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${lease.apiKey}`);
    if (!res.ok) return false;
    const j = await res.json() as { c?: number };
    return (j.c ?? 0) > 0;
  };
}

registerProvider(keyedAdapter(
  'alphaVantage', 'Alpha Vantage', 'https://www.alphavantage.co/support/#api-key',
  { perDay: 25 },
  ['prices-stocks'],
  ['Stocks'],
  (symbol, _market, key) =>
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${key}`,
  (json) => {
    const j = json as Record<string, Record<string, Record<string, string>>>;
    const series = j['Time Series (Daily)'];
    if (!series) return [];
    return Object.keys(series).sort().map((d) => ({
      close: +series[d]['4. close'],
      volume: +series[d]['5. volume'],
      date: d,
    }));
  },
  { symbol: 'TCS', market: 'Stocks' },
));

registerProvider(keyedAdapter(
  'twelveData', 'Twelve Data', 'https://twelvedata.com/register',
  { perMinute: 8, perDay: 800 },
  ['prices-stocks', 'prices-crypto', 'prices-forex', 'live-stream'],
  ['Stocks', 'Crypto', 'Forex'],
  (symbol, market, key) => {
    const sym = market === 'Stocks' && !symbol.includes(':') ? `${symbol}:NSE` : symbol.replace('/', '');
    return `https://api.twelvedata.com/time_series?symbol=${sym}&interval=1day&outputsize=500&apikey=${key}`;
  },
  (json) => {
    const j = json as { values?: Array<{ datetime: string; close: string; volume?: string }> };
    return (j.values || []).reverse().map((v) => ({
      close: +v.close,
      volume: v.volume ? +v.volume : undefined,
      date: v.datetime.slice(0, 10),
    }));
  },
  { symbol: 'INFY', market: 'Stocks' },
));

registerProvider(keyedAdapter(
  'fmp', 'Financial Modeling Prep', 'https://site.financialmodelingprep.com/register',
  { perDay: 250 },
  ['prices-stocks', 'fundamentals'],
  ['Stocks'],
  (symbol, _market, key) =>
    `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${key}`,
  (json) => {
    const j = json as { historical?: Array<{ date: string; close: number; volume: number }> };
    return (j.historical || []).reverse().map((h) => ({
      close: h.close,
      volume: h.volume,
      date: h.date,
    }));
  },
));

registerProvider(keyedAdapter(
  'eodhd', 'EODHD', 'https://eodhd.com/register',
  { perDay: 20 },
  ['prices-stocks'],
  ['Stocks'],
  (symbol, _market, key) => {
    const US_TICKERS = new Set(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'JNJ', 'SPY', 'QQQ']);
    let sym = symbol;
    if (!symbol.includes('.')) {
      sym = US_TICKERS.has(symbol) ? `${symbol}.US` : `${symbol}.NSE`;
    }
    return `https://eodhd.com/api/eod/${sym}?api_token=${key}&fmt=json&period=d`;
  },
  (json) => {
    const arr = json as Array<{ date: string; close: number; volume: number }>;
    if (!Array.isArray(arr)) return [];
    return arr.map((d) => ({ close: d.close, volume: d.volume, date: d.date }));
  },
  { symbol: 'AAPL.US', market: 'Stocks' },
));

registerProvider(keyedAdapter(
  'fred', 'FRED', 'https://fred.stlouisfed.org/docs/api/api_key.html',
  { perDay: 1000 },
  ['macro'],
  ['Forex'],
  (_symbol, _market, key) =>
    `https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${key}&file_type=json&limit=100`,
  (json) => {
    const j = json as { observations?: Array<{ date: string; value: string }> };
    return (j.observations || []).filter((o) => o.value !== '.').map((o) => ({
      close: +o.value,
      date: o.date,
    }));
  },
));

import './adapters-extra.js';
import './adapters-prices.js';
import './adapters-keyed.js';

export {};
