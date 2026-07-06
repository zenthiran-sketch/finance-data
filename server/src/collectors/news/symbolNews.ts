import { keyPool } from '../../credentials/keyPool.js';
import { ingestMetric, ingestNewsEvent } from './utils.js';
import { scoreHeadline } from './sentimentLocal.js';

const UA = 'SignalTerminal/1.0 (symbol news aggregator)';
const US_TICKERS = new Set(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'JNJ']);
const APE_URL = 'https://apewisdom.io/api/v1.0/filter/all-stocks';

function cleanSymbol(symbol: string) {
  return symbol.replace(/\.(NS|US)$/i, '');
}

function finnhubSymbolVariants(symbol: string): string[] {
  const clean = cleanSymbol(symbol);
  if (symbol.includes('.NS') || symbol.includes('.US')) return [clean, symbol];
  if (US_TICKERS.has(clean)) return [clean];
  return [clean, `${clean}.NS`, `${clean}.NSE`];
}

function mentionsSymbol(text: string, clean: string): boolean {
  const upper = text.toUpperCase();
  const base = clean.toUpperCase();
  if (upper.includes(`$${base}`)) return true;
  return new RegExp(`\\b${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

async function fetchFinnhubCompanyNews(symbol: string, key: string): Promise<number> {
  const clean = cleanSymbol(symbol);
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  let count = 0;

  for (const sym of finnhubSymbolVariants(symbol)) {
    const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}&token=${key}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const items = await res.json() as Array<{
        headline: string; summary: string; url: string; datetime: number; source: string;
      }>;
      if (!Array.isArray(items) || items.length === 0) continue;
      for (const item of items.slice(0, 15)) {
        const text = `${item.headline} ${item.summary || ''}`;
        await ingestNewsEvent({
          entityId: clean,
          title: item.headline,
          summary: item.summary?.slice(0, 500),
          url: item.url,
          sentiment: scoreHeadline(text),
          eventType: 'news',
          ts: new Date(item.datetime * 1000).toISOString(),
          source: item.source || 'finnhub',
          providerId: 'finnhub',
          pipelineId: 'sentiment-news',
          requestUrl: url,
          raw: item,
        });
        count++;
      }
      if (count > 0) break;
    } catch {
      /* try next symbol variant */
    }
  }
  return count;
}

async function fetchStockDataCompanyNews(symbol: string, key: string): Promise<number> {
  const clean = cleanSymbol(symbol);
  const url = `https://api.stockdata.org/v1/news/all?symbols=${encodeURIComponent(clean)}&api_token=${key}&limit=15`;
  try {
    const res = await fetch(url);
    if (!res.ok) return 0;
    const data = await res.json() as {
      data?: Array<{ title: string; description?: string; url: string; published_at: string; source: string }>;
    };
    let count = 0;
    for (const item of data.data || []) {
      const text = `${item.title} ${item.description || ''}`;
      await ingestNewsEvent({
        entityId: clean,
        title: item.title,
        summary: item.description?.slice(0, 500),
        url: item.url,
        sentiment: scoreHeadline(text),
        eventType: 'news',
        ts: item.published_at,
        source: item.source || 'stockdata',
        providerId: 'stockdata',
        pipelineId: 'sentiment-news',
        requestUrl: url,
        raw: item,
      });
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}

async function fetchFinnhubNewsSentiment(symbol: string, key: string): Promise<number> {
  const clean = cleanSymbol(symbol);

  for (const sym of finnhubSymbolVariants(symbol)) {
    const url = `https://finnhub.io/api/v1/news-sentiment?symbol=${encodeURIComponent(sym)}&token=${key}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as {
        companyNewsScore?: number;
        sentiment?: { bearishPercent?: number; bullishPercent?: number };
      };
      let newsScore: number | null = null;
      if (data.companyNewsScore != null) {
        newsScore = (data.companyNewsScore - 0.5) * 2;
      } else if (data.sentiment?.bullishPercent != null && data.sentiment?.bearishPercent != null) {
        const net = (data.sentiment.bullishPercent - data.sentiment.bearishPercent) / 100;
        newsScore = Math.max(-1, Math.min(1, net));
      }
      if (newsScore != null) {
        await ingestMetric(clean, 'news_sentiment', newsScore, 'finnhub', 'sentiment-news', { raw: { newsScore } });
        return 1;
      }
    } catch {
      /* try next variant */
    }
  }
  return 0;
}

type SocialPoint = {
  atTime?: number;
  mention?: number;
  score?: number;
  positiveScore?: number;
  negativeScore?: number;
};

async function fetchFinnhubSocialSentiment(symbol: string, key: string): Promise<number> {
  const clean = cleanSymbol(symbol);
  const to = Math.floor(Date.now() / 1000);
  const from = to - 86400 * 7;
  let ingested = 0;

  for (const sym of finnhubSymbolVariants(symbol)) {
    const url = `https://finnhub.io/api/v1/stock/social-sentiment?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}&token=${key}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as {
        reddit?: SocialPoint[];
        twitter?: SocialPoint[];
        data?: SocialPoint[];
      };

      const reddit = data.reddit || [];
      const twitter = data.twitter || [];
      const generic = data.data || [];
      const scores: number[] = [];

      for (const r of reddit) if (r.score != null) scores.push(r.score);
      for (const t of twitter) if (t.score != null) scores.push(t.score);
      for (const g of generic) if (g.score != null) scores.push(g.score);

      if (scores.length > 0) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const socialScore = Math.max(-1, Math.min(1, avg));
        await ingestMetric(clean, 'social_sentiment', socialScore, 'finnhub', 'sentiment-news', {
          raw: { reddit: reddit.length, twitter: twitter.length, data: generic.length },
        });
        await ingestMetric(clean, 'sentiment_score', socialScore, 'finnhub', 'sentiment-news', {
          raw: { source: 'finnhub-social' },
        });
        ingested++;
      }

      const recentPoints = [...reddit, ...twitter, ...generic]
        .filter((p) => (p.mention ?? 0) > 0)
        .sort((a, b) => (b.atTime ?? 0) - (a.atTime ?? 0))
        .slice(0, 8);

      for (const point of recentPoints) {
        const ts = point.atTime
          ? new Date(point.atTime * 1000).toISOString()
          : new Date().toISOString();
        const score = point.score ?? 0;
        await ingestNewsEvent({
          entityId: clean,
          title: `Social buzz: ${point.mention} mentions (sentiment ${score >= 0 ? '+' : ''}${score.toFixed(2)})`,
          summary: `Aggregated Reddit/Twitter activity for ${clean}`,
          sentiment: Math.max(-1, Math.min(1, score)),
          eventType: 'social',
          ts,
          source: 'finnhub-social',
          providerId: 'finnhub',
          pipelineId: 'sentiment-news',
          requestUrl: url,
          raw: point,
        });
        ingested++;
      }

      if (ingested > 0) break;
    } catch {
      /* try next variant */
    }
  }
  return ingested;
}

async function fetchRedditSymbolPosts(symbol: string): Promise<number> {
  const clean = cleanSymbol(symbol);
  const queries = [`$${clean}`, clean];
  let count = 0;
  const seen = new Set<string>();

  for (const q of queries) {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&limit=25&t=month`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) continue;
      const data = await res.json() as {
        data?: { children?: Array<{ data: {
          title: string; selftext?: string; url: string; permalink: string;
          created_utc: number; score: number; num_comments: number; subreddit: string;
        } }> };
      };

      for (const child of data.data?.children || []) {
        const post = child.data;
        const text = `${post.title} ${post.selftext || ''}`;
        if (!mentionsSymbol(text, clean)) continue;
        const link = post.permalink ? `https://www.reddit.com${post.permalink}` : post.url;
        if (seen.has(link)) continue;
        seen.add(link);

        await ingestNewsEvent({
          entityId: clean,
          title: post.title,
          summary: (post.selftext || '').slice(0, 400) || `r/${post.subreddit} · ${post.score} upvotes · ${post.num_comments} comments`,
          url: link,
          sentiment: scoreHeadline(text),
          eventType: 'social',
          ts: new Date(post.created_utc * 1000).toISOString(),
          source: `reddit-${post.subreddit}`,
          providerId: 'reddit',
          pipelineId: 'sentiment-news',
          requestUrl: url,
          raw: { ...post, score: post.score, comments: post.num_comments },
        });
        count++;
      }
      await new Promise((r) => setTimeout(r, 1100));
    } catch {
      /* try next query */
    }
  }

  if (count > 0) {
    await ingestMetric(clean, 'reddit_mentions', count, 'reddit', 'sentiment-news', { raw: { symbolScrape: true } });
  }
  return count;
}

async function fetchApeWisdomSymbol(symbol: string): Promise<number> {
  const clean = cleanSymbol(symbol);
  try {
    const res = await fetch(APE_URL);
    if (!res.ok) return 0;
    const data = await res.json() as {
      results?: Array<{
        ticker: string; name: string; mentions: string | number;
        mentions_24h_ago?: string | number; rank: string | number; rank_24h_ago?: string | number;
      }>;
    };
    const row = (data.results || []).find(
      (r) => r.ticker.replace('$', '').toUpperCase() === clean.toUpperCase(),
    );
    if (!row) return 0;

    const num = (v: string | number | undefined) =>
      typeof v === 'number' ? v : parseInt(String(v ?? '0'), 10) || 0;
    const mentions = num(row.mentions);
    const rank = num(row.rank);

    await ingestMetric(clean, 'reddit_mentions', mentions, 'apewisdom', 'sentiment-news', { raw: row });
    await ingestMetric(clean, 'reddit_rank', rank, 'apewisdom', 'sentiment-news', { raw: row });

    await ingestNewsEvent({
      entityId: clean,
      title: `${clean} trending on Reddit (#${rank}, ${mentions} mentions)`,
      summary: `${row.name} — rank ${rank}, ${mentions} mentions in tracked subreddits`,
      eventType: 'social',
      source: 'apewisdom',
      providerId: 'apewisdom',
      pipelineId: 'sentiment-news',
      requestUrl: APE_URL,
      raw: row,
    });
    return 2;
  } catch {
    return 0;
  }
}

export interface SymbolNewsScrapeResult {
  symbol: string;
  finnhub: number;
  stockdata: number;
  newsSentiment: number;
  social: number;
  total: number;
  message?: string;
}

/** On-demand news + social fetch for a single symbol. */
export async function scrapeSymbolNews(symbol: string): Promise<SymbolNewsScrapeResult> {
  const clean = cleanSymbol(symbol);
  if (!clean) {
    return {
      symbol: clean, finnhub: 0, stockdata: 0, newsSentiment: 0, social: 0, total: 0,
      message: 'Invalid symbol',
    };
  }

  let finnhub = 0;
  let stockdata = 0;
  let newsSentiment = 0;
  let social = 0;

  const fhLease = await keyPool.acquire('finnhub', 'sentiment-news');
  if (fhLease) {
    const [newsCount, newsMetricCount, socialCount] = await Promise.all([
      fetchFinnhubCompanyNews(clean, fhLease.apiKey),
      fetchFinnhubNewsSentiment(clean, fhLease.apiKey),
      fetchFinnhubSocialSentiment(clean, fhLease.apiKey),
    ]);
    finnhub = newsCount;
    newsSentiment = newsMetricCount;
    social += socialCount;
  }

  const sdLease = await keyPool.acquire('stockdata', 'sentiment-news');
  if (sdLease) {
    stockdata = await fetchStockDataCompanyNews(clean, sdLease.apiKey);
  }

  const [redditPosts, apeWisdom] = await Promise.all([
    fetchRedditSymbolPosts(clean),
    fetchApeWisdomSymbol(clean),
  ]);
  social += redditPosts + apeWisdom;

  const { classifyTrend } = await import('../../services/sentimentTrend.js');
  const { computeSentimentComposite } = await import('../../services/sentimentAggregate.js');
  await Promise.all([
    classifyTrend(clean).catch(() => {}),
    computeSentimentComposite(clean).catch(() => {}),
  ]);

  const total = finnhub + stockdata + newsSentiment + social;

  return {
    symbol: clean,
    finnhub,
    stockdata,
    newsSentiment,
    social,
    total,
    message: total === 0
      ? !fhLease && !sdLease
        ? 'No social posts found. Add Finnhub/StockData keys in Settings for news headlines.'
        : 'No new headlines or social posts found for this symbol.'
      : undefined,
  };
}
