import { keyPool } from '../../credentials/keyPool.js';
import type { KeyLease } from '../../credentials/keyPool.js';
import { fetchAdanosSentiment } from '../../providers/adapters-keyed.js';
import { ingestMetric, resolveSymbolsForNews } from './utils.js';

interface AdanosTrendingRow {
  ticker?: string;
  symbol?: string;
  buzz_score?: number;
  trend?: string;
  mentions?: number;
  sentiment_score?: number;
  bullish_pct?: number;
  bearish_pct?: number;
}

export async function fetchAdanosTrending(lease?: KeyLease) {
  const keyLease = lease ?? await keyPool.acquire('adanos', 'sentiment-news');
  if (!keyLease) return 0;

  const url = 'https://api.adanos.io/reddit/stocks/v1/trending?limit=20';
  let count = 0;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${keyLease.apiKey}`, Accept: 'application/json' },
    });
    if (!res.ok) return 0;
    const data = await res.json() as { results?: AdanosTrendingRow[]; data?: AdanosTrendingRow[] };
    const rows = data.results || data.data || (Array.isArray(data) ? data as AdanosTrendingRow[] : []);

    for (const row of rows.slice(0, 20)) {
      const ticker = (row.ticker || row.symbol || '').replace('$', '');
      if (!ticker) continue;
      const trendDir = row.trend === 'rising' ? 1 : row.trend === 'falling' ? -1 : 0;
      if (row.bullish_pct != null) await ingestMetric(ticker, 'bullish_pct', row.bullish_pct, 'adanos', 'sentiment-news', { raw: row });
      if (row.bearish_pct != null) await ingestMetric(ticker, 'bearish_pct', row.bearish_pct, 'adanos', 'sentiment-news', { raw: row });
      if (trendDir !== 0) await ingestMetric(ticker, 'adanos_trend', trendDir, 'adanos', 'sentiment-news', { raw: row });
      if (row.sentiment_score != null) {
        await ingestMetric(ticker, 'sentiment_score', row.sentiment_score, 'adanos', 'sentiment-news', { raw: row });
      }
      count++;
    }
  } catch (e) {
    console.error('Adanos trending:', (e as Error).message);
  }
  return count;
}

export async function fetchAdanosNews() {
  const lease = await keyPool.acquire('adanos', 'sentiment-news');
  if (!lease) return 0;

  const trending = await fetchAdanosTrending(lease);
  const symbols = await resolveSymbolsForNews();
  let count = trending;
  for (const symbol of symbols.slice(0, 8)) {
    try {
      const data = await fetchAdanosSentiment(symbol, lease.apiKey);
      if (!data) continue;
      const score = data.score ?? data.sentiment ?? 0;
      const clean = symbol.replace(/\.(NS|US)$/i, '');
      await ingestMetric(clean, 'sentiment_score', score, 'adanos', 'sentiment-news', { raw: data });
      count++;
    } catch { /* skip */ }
  }
  return count;
}
