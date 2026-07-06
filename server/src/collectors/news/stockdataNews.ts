import { keyPool } from '../../credentials/keyPool.js';
import { ingestNewsEvent, resolveSymbolsForNews } from './utils.js';
import { scoreHeadline } from './sentimentLocal.js';

export async function fetchStockDataNews() {
  const lease = await keyPool.acquire('stockdata', 'sentiment-news');
  if (!lease) return 0;
  const key = lease.apiKey;

  const symbols = await resolveSymbolsForNews();
  let count = 0;

  for (const symbol of symbols.slice(0, 10)) {
    const clean = symbol.replace(/\.(NS|US)$/i, '');
    const url = `https://api.stockdata.org/v1/news/all?symbols=${clean}&api_token=${key}&limit=10`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as {
        data?: Array<{ title: string; description?: string; url: string; published_at: string; source: string }>;
      };
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
    } catch {
      /* skip */
    }
  }
  return count;
}
