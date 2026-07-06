import { eq } from 'drizzle-orm';
import { keyPool } from '../../credentials/keyPool.js';
import { appConfig } from '../../config.js';
import { getDb, schema } from '../../db/index.js';
import { ingestMetric, resolveSymbolsForNews } from './utils.js';

const US_TICKERS = new Set(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'JNJ']);

function finnhubSymbolVariants(symbol: string): string[] {
  const clean = symbol.replace(/\.(NS|US)$/i, '');
  if (symbol.includes('.NS') || symbol.includes('.US')) return [clean, symbol];
  if (US_TICKERS.has(clean)) return [clean];
  return [clean, `${clean}.NS`, `${clean}.NSE`];
}

async function fetchNewsSentiment(symbol: string, key: string): Promise<number | null> {
  for (const sym of finnhubSymbolVariants(symbol)) {
    const url = `https://finnhub.io/api/v1/news-sentiment?symbol=${encodeURIComponent(sym)}&token=${key}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as { companyNewsScore?: number; sentiment?: { bearishPercent?: number; bullishPercent?: number } };
      if (data.companyNewsScore != null) {
        return (data.companyNewsScore - 0.5) * 2;
      }
      if (data.sentiment?.bullishPercent != null && data.sentiment?.bearishPercent != null) {
        const net = (data.sentiment.bullishPercent - data.sentiment.bearishPercent) / 100;
        return Math.max(-1, Math.min(1, net));
      }
    } catch { /* try next variant */ }
  }
  return null;
}

async function fetchSocialSentiment(symbol: string, key: string): Promise<number | null> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 86400 * 3;
  for (const sym of finnhubSymbolVariants(symbol)) {
    const url = `https://finnhub.io/api/v1/stock/social-sentiment?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}&token=${key}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as {
        reddit?: Array<{ score?: number; mention?: number }>;
        twitter?: Array<{ score?: number; mention?: number }>;
      };
      const reddit = data.reddit || [];
      const twitter = data.twitter || [];
      const scores: number[] = [];
      for (const r of reddit) if (r.score != null) scores.push(r.score);
      for (const t of twitter) if (t.score != null) scores.push(t.score);
      if (scores.length === 0) continue;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return Math.max(-1, Math.min(1, avg));
    } catch { /* try next variant */ }
  }
  return null;
}

export async function fetchFinnhubSentiment() {
  const lease = await keyPool.acquire('finnhub', 'sentiment-news');
  if (!lease) return 0;

  const symbols = await resolveSymbolsForNews();
  const db = getDb(appConfig.databasePath);
  let count = 0;

  for (const symbol of symbols.slice(0, 15)) {
    const clean = symbol.replace(/\.(NS|US)$/i, '');
    const newsScore = await fetchNewsSentiment(symbol, lease.apiKey);
    if (newsScore != null) {
      await ingestMetric(clean, 'news_sentiment', newsScore, 'finnhub', 'sentiment-news', { raw: { newsScore } });
      count++;
    }
    const socialScore = await fetchSocialSentiment(symbol, lease.apiKey);
    if (socialScore != null) {
      await ingestMetric(clean, 'sentiment_score', socialScore, 'finnhub', 'sentiment-news', { raw: { socialScore } });
      count++;
    }

    const inst = await db.select().from(schema.instruments)
      .where(eq(schema.instruments.symbol, symbol))
      .limit(1);
    if (inst[0]?.currency === 'INR' && newsScore != null) {
      await ingestMetric(clean, 'sentiment_score', newsScore, 'finnhub', 'sentiment-news', {
        raw: { nseNewsFallback: true },
      });
    }
  }
  return count;
}
