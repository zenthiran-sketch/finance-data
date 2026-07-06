export type Market = 'Crypto' | 'Stocks' | 'Forex' | 'Commodities' | 'MutualFunds';
export type SignalLabel = 'STRONG-BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG-SELL' | '—';
export type PipelineId =
  | 'prices-crypto'
  | 'prices-stocks'
  | 'prices-forex'
  | 'prices-commodities'
  | 'prices-mutual-funds'
  | 'fundamentals'
  | 'macro'
  | 'sentiment-news'
  | 'alt-data'
  | 'symbology'
  | 'live-stream';

export type DatasetType = 'bar' | 'tick' | 'metric' | 'event' | 'fundamental' | 'signal' | 'nav';
export type EntityType = 'instrument' | 'macro_series';

export interface Candle {
  close: number;
  volume?: number | null;
  open?: number;
  high?: number;
  low?: number;
  date?: string;
}

export interface Quote {
  price: number;
  changePct?: number | null;
  volume?: number | null;
  ts?: string;
}

export interface MacdResult {
  line: number | null;
  signal: number | null;
  prevLine: number | null;
  prevSignal: number | null;
}

export interface BollingerResult {
  mid: number;
  upper: number;
  lower: number;
  sd: number;
}

export interface IndicatorSet {
  price: number;
  prevClose: number | null;
  changePct: number | null;
  rsi: number | null;
  macd: MacdResult;
  boll: BollingerResult | null;
  smaFast: number | null;
  smaSlow: number | null;
  sd14: number | null;
  volMult: number | null;
}

export interface SignalResult {
  label: SignalLabel;
  confidence: number;
  reasons: string[];
  sl: number | null;
  tp: number | null;
  rr: string | null;
  rrNum: number | null;
}

export interface SignalRow {
  symbol: string;
  market: Market;
  currency: string;
  instrumentId?: string;
  price: number | null;
  changePct: number | null;
  signal: SignalLabel;
  confidence: number | null;
  rsi: number | null;
  volMult: number | null;
  sl: number | null;
  tp: number | null;
  rr: string | null;
  rrNum: number | null;
  note: string;
  error: boolean;
  stale?: boolean;
  staleSince?: string | null;
}

export interface InstrumentSeed {
  symbol: string;
  name: string;
  market: Market;
  currency: string;
  exchange?: string;
  inDefaultSeed?: boolean;
}

export const CRYPTO_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
];

export const STOCK_SYMBOLS = [
  'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS',
  'SBIN.NS', 'TATAMOTORS.NS', 'ITC.NS', 'BHARTIARTL.NS', 'LT.NS',
];

export const FOREX_TARGETS = ['USD', 'EUR', 'GBP', 'JPY'];
export const FOREX_BASE = 'INR';

export const SIGNAL_FILTERS = ['All', 'STRONG-BUY', 'BUY', 'HOLD', 'SELL', 'STRONG-SELL'] as const;

export const MUTUAL_FUND_SCHEMES = [
  { code: '125497', name: 'SBI Bluechip Fund' },
  { code: '120503', name: 'HDFC Top 100 Fund' },
  { code: '118989', name: 'Axis Bluechip Fund' },
  { code: '120716', name: 'Mirae Asset Large Cap Fund' },
  { code: '119551', name: 'Parag Parikh Flexi Cap Fund' },
  { code: '125354', name: 'ICICI Pru Bluechip Fund' },
  { code: '120586', name: 'Nippon India Large Cap Fund' },
  { code: '118632', name: 'Kotak Bluechip Fund' },
];

export const QUOTA_LIMITS: Record<string, { perMinute?: number; perDay?: number; perMonth?: number }> = {
  finnhub: { perMinute: 60 },
  twelveData: { perMinute: 8, perDay: 800 },
  fmp: { perDay: 250 },
  polygon: { perMinute: 5 },
  alphaVantage: { perDay: 25 },
  eodhd: { perDay: 20 },
  marketstack: { perMonth: 100 },
  stockdata: { perDay: 100 },
  fred: { perDay: 1000 },
  coingecko: { perMinute: 30 },
  tickdb: { perDay: 500 },
  fcs: { perDay: 500 },
  publicdrop: { perMinute: 120 },
  alpaca: { perMinute: 200 },
  adanos: { perMonth: 250 },
  finsignals: { perMonth: 1000 },
};
