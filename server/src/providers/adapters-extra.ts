import type { ProviderAdapter } from './registry.js';
import { registerProvider } from './registry.js';
import type { Market } from '@signal-terminal/shared';

const COINGECKO_IDS: Record<string, string> = {
  BTCUSDT: 'bitcoin', ETHUSDT: 'ethereum', BNBUSDT: 'binancecoin',
  SOLUSDT: 'solana', XRPUSDT: 'ripple', ADAUSDT: 'cardano',
  DOGEUSDT: 'dogecoin', AVAXUSDT: 'avalanche-2', LINKUSDT: 'chainlink', DOTUSDT: 'polkadot',
};

const coingecko: ProviderAdapter = {
  id: 'coingecko',
  name: 'CoinGecko',
  tier: 'free',
  requiresKey: false,
  limits: { perMinute: 30 },
  pipelines: ['prices-crypto'],
  markets: ['Crypto'],
  enabled: true,
  async fetchCandles(symbol) {
    const clean = symbol.replace('/', '').replace('USDT', '') + 'USDT';
    const id = COINGECKO_IDS[clean] || COINGECKO_IDS[clean.toUpperCase()];
    if (!id) throw new Error(`Unknown crypto symbol for CoinGecko: ${symbol}`);
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 429) throw Object.assign(new Error('Rate limited'), { status: 429 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { prices?: [number, number][]; total_volumes?: [number, number][] };
    const prices = data.prices || [];
    const volumes = data.total_volumes || [];
    const volMap = new Map(volumes.map(([t, v]) => [t, v]));
    const candles = prices.map(([ts, close]) => ({
      close,
      volume: volMap.get(ts) ?? null,
      date: new Date(ts).toISOString().slice(0, 10),
    }));
    if (candles.length < 30) throw new Error('Not enough history');
    return { candles, requestUrl: url };
  },
};

registerProvider(coingecko);

const mfapi: ProviderAdapter = {
  id: 'mfapi',
  name: 'mfapi.in',
  tier: 'free',
  requiresKey: false,
  limits: {},
  pipelines: ['prices-mutual-funds'],
  markets: ['MutualFunds'],
  enabled: true,
  async fetchCandles(symbol) {
    const schemeCode = symbol.replace(/^MF-/i, '');
    const url = `https://api.mfapi.in/mf/${schemeCode}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as {
      data?: Array<Record<string, string> | string[]>;
    };
    const rows = data.data || [];
    const candles = rows
      .map((r) => {
        if (Array.isArray(r)) {
          if (!r[2] || r[2] === 'NAV' || r[0] === 'Date') return null;
          return {
            close: parseFloat(String(r[2])),
            date: String(r[0]).split('-').reverse().join('-'),
          };
        }
        if (r && typeof r === 'object' && r.nav && r.date) {
          return {
            close: parseFloat(r.nav),
            date: String(r.date).split('-').reverse().join('-'),
          };
        }
        return null;
      })
      .filter((c): c is { close: number; date: string } => c != null && !Number.isNaN(c.close))
      .reverse();
    if (candles.length < 20) throw new Error('Not enough NAV history');
    return { candles, requestUrl: url };
  },
};

registerProvider(mfapi);

const exchangerateHost: ProviderAdapter = {
  id: 'exchangerateHost',
  name: 'ExchangeRate.host',
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
    start.setDate(start.getDate() - 400);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const url = `https://api.exchangerate.host/timeseries?start_date=${fmt(start)}&end_date=${fmt(end)}&base=INR&symbols=${target}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { rates?: Record<string, Record<string, number>> };
    const dates = Object.keys(data.rates || {}).sort();
    const candles = dates.map((d) => ({
      close: 1 / (data.rates![d][target] || 1),
      date: d,
    }));
    if (candles.length < 30) throw new Error('Not enough history');
    return { candles, requestUrl: url };
  },
};

registerProvider(exchangerateHost);

const stooq: ProviderAdapter = {
  id: 'stooq',
  name: 'Stooq',
  tier: 'free',
  requiresKey: false,
  limits: {},
  pipelines: ['prices-stocks'],
  markets: ['Stocks'],
  enabled: true,
  async fetchCandles(symbol, market) {
    let stooqSym = symbol.toLowerCase();
    if (!stooqSym.includes('.')) {
      stooqSym = market === 'Stocks' ? `${stooqSym}.ns` : `${stooqSym}.us`;
    }
    const url = `https://stooq.com/q/d/l/?s=${stooqSym}&i=d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'SignalTerminal/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split('\n').slice(1);
    const candles = lines.map((line) => {
      const [date, open, high, low, close, volume] = line.split(',');
      return {
        date,
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(close),
        volume: volume ? parseFloat(volume) : null,
      };
    }).filter((c) => !isNaN(c.close));
    if (candles.length < 30) throw new Error('Not enough history');
    return { candles, requestUrl: url };
  },
};

registerProvider(stooq);

function keyedAdapter(
  id: string,
  name: string,
  signupUrl: string,
  limits: ProviderAdapter['limits'],
  pipelines: ProviderAdapter['pipelines'],
  markets: Market[],
  buildUrl: (symbol: string, market: Market, key: string) => string,
  parseCandles: (json: unknown) => { close: number; volume?: number; date?: string }[],
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
        await adapter.fetchCandles!(markets[0] === 'Stocks' ? 'AAPL' : 'BTCUSDT', markets[0], lease);
        return true;
      } catch { return false; }
    },
  };
  return adapter;
}

registerProvider(keyedAdapter(
  'marketstack', 'Marketstack', 'https://marketstack.com/signup/free',
  { perMonth: 100 },
  ['prices-stocks'],
  ['Stocks'],
  (symbol, market, key) => {
    const sym = market === 'Stocks' && !symbol.includes('.') ? `${symbol}.XNSE` : symbol;
    return `http://api.marketstack.com/v1/eod?access_key=${key}&symbols=${sym}&limit=500`;
  },
  (json) => {
    const j = json as { data?: Array<{ date: string; close: number; volume: number }> };
    return (j.data || []).reverse().map((d) => ({
      close: d.close,
      volume: d.volume,
      date: d.date.slice(0, 10),
    }));
  },
));

registerProvider(keyedAdapter(
  'stockdata', 'StockData.org', 'https://www.stockdata.org/register',
  { perDay: 100 },
  ['prices-stocks', 'sentiment-news'],
  ['Stocks'],
  (symbol, _market, key) =>
    `https://api.stockdata.org/v1/data/eod?api_token=${key}&symbols=${symbol}&interval=day&sort=asc`,
  (json) => {
    const j = json as { data?: Array<{ date: string; close: number; volume: number }> };
    return (j.data || []).map((d) => ({
      close: d.close,
      volume: d.volume,
      date: d.date.slice(0, 10),
    }));
  },
));

export {};
