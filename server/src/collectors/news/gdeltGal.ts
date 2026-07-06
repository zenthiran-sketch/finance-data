import { GDELT_GAL_RSS } from './sources.js';
import { fetchRssFeed } from './rssFetcher.js';
import { ingestMarketHeadline } from './marketIngest.js';
import { scoreHeadline } from './sentimentLocal.js';

export async function fetchGdeltGalNews() {
  const items = await fetchRssFeed(GDELT_GAL_RSS);
  let count = 0;
  for (const item of items) {
    const text = `${item.title} ${item.description}`;
    await ingestMarketHeadline({
      title: item.title,
      summary: item.description?.slice(0, 500),
      url: item.link,
      sentiment: scoreHeadline(text),
      eventType: 'news',
      ts: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
      source: 'gdelt',
      providerId: 'gdelt',
      requestUrl: GDELT_GAL_RSS,
      raw: item,
    });
    count++;
  }
  return count;
}
