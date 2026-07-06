import type { ProviderAdapter } from './registry.js';
import { registerProvider } from './registry.js';
import type { Market } from '@signal-terminal/shared';

const US_TICKERS = new Set(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'JNJ']);

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
  fetchOpts?: (url: string, key: string) => RequestInit,
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
      const init = fetchOpts?.(url, lease.apiKey) || {};
      const res = await fetch(url, init);
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
  'tickdb', 'TickDB', 'https://tickdb.ai',
  { perDay: 500 },
  ['prices-stocks', 'prices-crypto', 'prices-forex'],
  ['Stocks', 'Crypto', 'Forex'],
  (symbol, market, key) => {
    const sym = market === 'Crypto' ? symbol.replace('/', '') : symbol;
    return `https://api.tickdb.ai/v1/ohlc?symbol=${encodeURIComponent(sym)}&interval=1d&limit=365`;
  },
  (json) => {
    const j = json as { data?: Array<{ date: string; close: number; volume?: number }> };
    return (j.data || []).map((d) => ({ close: d.close, volume: d.volume, date: d.date }));
  },
  { symbol: 'AAPL', market: 'Stocks' },
  (_url, key) => ({ headers: { 'X-API-Key': key, Accept: 'application/json' } }),
));

registerProvider(keyedAdapter(
  'fcs', 'FCS API', 'https://fcsapi.com',
  { perDay: 500 },
  ['prices-stocks', 'prices-forex', 'prices-crypto'],
  ['Stocks', 'Forex', 'Crypto'],
  (symbol, market, key) => {
    const sym = market === 'Stocks'
      ? (US_TICKERS.has(symbol) ? symbol : `${symbol}.NSE`)
      : symbol.replace('/', '');
    return `https://fcsapi.com/api-v3/stock/history?symbol=${encodeURIComponent(sym)}&period=1y&access_key=${key}`;
  },
  (json) => {
    const j = json as { response?: Array<{ d: string; c: number; v?: number }> };
    return (j.response || []).map((d) => ({ close: d.c, volume: d.v, date: d.d }));
  },
  { symbol: 'AAPL', market: 'Stocks' },
));

const publicDrop: ProviderAdapter = {
  id: 'publicdrop',
  name: 'PublicDrop',
  tier: 'free',
  requiresKey: false,
  limits: { perMinute: 120 },
  pipelines: ['prices-crypto'],
  markets: ['Crypto'],
  enabled: true,
  async fetchCandles(symbol) {
    const sym = symbol.replace('/', '').replace('USDT', '').toLowerCase();
    const url = `https://api.publicdrop.com/api/v1/crypto/${sym}/history?interval=1d&limit=365`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { prices?: Array<{ timestamp: string; close: number; volume?: number }> };
    const candles = (data.prices || []).map((p) => ({
      close: p.close,
      volume: p.volume,
      date: p.timestamp.slice(0, 10),
    }));
    if (candles.length < 10) throw new Error('Not enough history');
    return { candles, requestUrl: url };
  },
};

registerProvider(publicDrop);

registerProvider(keyedAdapter(
  'polygon', 'Polygon.io', 'https://polygon.io',
  { perMinute: 5 },
  ['prices-stocks'],
  ['Stocks'],
  (symbol, _market, key) => {
    const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    return `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${key}`;
  },
  (json) => {
    const j = json as { results?: Array<{ c: number; v?: number; t: number }> };
    return (j.results || []).map((r) => ({
      close: r.c,
      volume: r.v,
      date: new Date(r.t).toISOString().slice(0, 10),
    }));
  },
  { symbol: 'AAPL', market: 'Stocks' },
));

registerProvider(keyedAdapter(
  'alpaca', 'Alpaca', 'https://alpaca.markets',
  { perMinute: 200 },
  ['prices-stocks'],
  ['Stocks'],
  (symbol, _market, key) => {
    const start = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const end = new Date().toISOString().slice(0, 10);
    return `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=1Day&start=${start}&end=${end}&limit=500`;
  },
  (json) => {
    const j = json as { bars?: Array<{ c: number; v?: number; t: string }> };
    return (j.bars || []).map((b) => ({
      close: b.c,
      volume: b.v,
      date: b.t.slice(0, 10),
    }));
  },
  { symbol: 'AAPL', market: 'Stocks' },
  (_url, key) => ({
    headers: {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': key,
      Accept: 'application/json',
    },
  }),
));
