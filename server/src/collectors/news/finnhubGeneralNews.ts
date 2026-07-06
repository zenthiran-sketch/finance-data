import { keyPool } from '../../credentials/keyPool.js';
import { ingestMarketHeadline } from './marketIngest.js';
import { scoreHeadline } from './sentimentLocal.js';

/** Finnhub general market news — one API call, not per-symbol. */
export async function fetchFinnhubGeneralNews() {
  const lease = await keyPool.acquire('finnhub', 'sentiment-news');
  if (!lease) return 0;

  const url = `https://finnhub.io/api/v1/news?category=general&token=${lease.apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return 0;
    const items = await res.json() as Array<{
      headline: string; summary: string; url: string; datetime: number; source: string;
    }>;
    let count = 0;
    for (const item of (items || []).slice(0, 50)) {
      const text = `${item.headline} ${item.summary || ''}`;
      await ingestMarketHeadline({
        title: item.headline,
        summary: item.summary?.slice(0, 500),
        url: item.url,
        sentiment: scoreHeadline(text),
        eventType: 'news',
        ts: new Date(item.datetime * 1000).toISOString(),
        source: item.source || 'finnhub',
        providerId: 'finnhub',
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
