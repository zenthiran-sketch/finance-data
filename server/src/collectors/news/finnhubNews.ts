import { keyPool } from '../../credentials/keyPool.js';
import { ingestNewsEvent, resolveSymbolsForNews } from './utils.js';
import { scoreHeadline } from './sentimentLocal.js';

export async function fetchFinnhubNews() {
  const lease = await keyPool.acquire('finnhub', 'sentiment-news');
  if (!lease) return 0;
  const key = lease.apiKey;

  const symbols = await resolveSymbolsForNews();
  let count = 0;
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

  for (const symbol of symbols.slice(0, 15)) {
    const clean = symbol.replace(/\.(NS|US)$/i, '');
    const url = `https://finnhub.io/api/v1/company-news?symbol=${clean}&from=${from}&to=${to}&token=${key}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const items = await res.json() as Array<{
        headline: string; summary: string; url: string; datetime: number; source: string;
      }>;
      for (const item of (items || []).slice(0, 10)) {
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
    } catch {
      /* skip symbol */
    }
  }
  return count;
}
