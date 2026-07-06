import type { SignalRow } from '@signal-terminal/shared';

const BASE = '/api';

export async function fetchSignals(): Promise<SignalRow[]> {
  const res = await fetch(`${BASE}/signals`);
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch(`${BASE}/health`);
  return res.json();
}

export async function triggerRefresh(tier = 'fast') {
  const res = await fetch(`${BASE}/refresh?tier=${tier}`, { method: 'POST' });
  return res.json();
}

export async function fetchWatchlist() {
  const res = await fetch(`${BASE}/watchlist`);
  return res.json();
}

export async function fetchInstruments(params: { search?: string; market?: string; page?: number }) {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.market) q.set('market', params.market);
  if (params.page) q.set('page', String(params.page));
  const res = await fetch(`${BASE}/instruments?${q}`);
  return res.json();
}

export async function addToWatchlist(body: { instrumentId?: string; symbol?: string; market?: string }) {
  const res = await fetch(`${BASE}/watchlist/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function removeFromWatchlist(instrumentId: string) {
  await fetch(`${BASE}/watchlist/items/${instrumentId}`, { method: 'DELETE' });
}

export async function fetchCredentials() {
  const res = await fetch(`${BASE}/credentials`);
  return res.json();
}

export async function fetchProviders() {
  const res = await fetch(`${BASE}/credentials/providers`);
  return res.json();
}

export async function saveCredential(body: {
  providerId: string;
  label: string;
  apiKey: string;
  apiSecret?: string;
  pipelines: string[];
}) {
  const res = await fetch(`${BASE}/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed');
  return res.json();
}

export async function deleteCredential(id: string) {
  await fetch(`${BASE}/credentials/${id}`, { method: 'DELETE' });
}

export async function fetchTimeseriesCatalog() {
  const res = await fetch(`${BASE}/timeseries/catalog`);
  return res.json();
}

export async function fetchBars(instrumentId: string, from?: string, to?: string) {
  const q = new URLSearchParams({ instrumentId });
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const res = await fetch(`${BASE}/timeseries/bars?${q}`);
  return res.json();
}

export async function fetchBacktest(symbol: string, from?: string, to?: string) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const res = await fetch(`${BASE}/backtest/${encodeURIComponent(symbol)}?${q}`);
  if (!res.ok) throw new Error('Failed to load chart data');
  return res.json();
}

export async function fetchSignal(symbol: string): Promise<SignalRow> {
  const res = await fetch(`${BASE}/signals/${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error('Signal not found');
  return res.json();
}

export async function fetchNews(symbol: string, limit = 20) {
  const res = await fetch(`${BASE}/news/${encodeURIComponent(symbol)}?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load news');
  return res.json();
}

export async function fetchSentiment(symbol: string) {
  const res = await fetch(`${BASE}/sentiment/${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error('Failed to load sentiment');
  return res.json();
}

export async function fetchNewsFeed(limit = 30) {
  const res = await fetch(`${BASE}/news/feed?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load feed');
  return res.json();
}

export interface TopStock {
  symbol: string;
  score: number;
  rank: number;
  mentions: number;
  sentiment: number;
  sources?: string[];
}

export async function fetchTopStocks(limit = 30) {
  const res = await fetch(`${BASE}/news/top-stocks?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load top stocks');
  const data = await res.json();
  return data.items as TopStock[];
}

export interface TrendItem {
  symbol: string;
  market: string;
  direction: 'positive' | 'negative' | 'neutral';
  composite: number | null;
  delta24h: number | null;
  confidence: number;
  sentimentTrend: number;
  reasons: string[];
  sources: string[];
}

export async function fetchSentimentTrending(direction?: 'positive' | 'negative', limit = 20) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (direction) q.set('direction', direction);
  const res = await fetch(`${BASE}/sentiment/trending?${q}`);
  if (!res.ok) throw new Error('Failed to load trends');
  const data = await res.json();
  return data.items as TrendItem[];
}

export function connectSSE(onEvent: (type: string, data: unknown) => void) {
  const es = new EventSource(`${BASE}/events`);
  es.addEventListener('progress', (e) => onEvent('progress', JSON.parse(e.data)));
  es.addEventListener('cycle_complete', (e) => onEvent('cycle_complete', JSON.parse(e.data)));
  return es;
}

export function connectWS(onTick: (data: unknown) => void) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/api/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ action: 'subscribe', channel: 'watchlist' }));
  ws.onmessage = (e) => {
    try { onTick(JSON.parse(e.data)); } catch { /* ignore */ }
  };
  return ws;
}
