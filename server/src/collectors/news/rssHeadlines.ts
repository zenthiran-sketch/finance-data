import { RSS_FEEDS } from './sources.js';
import { fetchRssFeed } from './rssFetcher.js';
import { ingestMarketHeadline } from './marketIngest.js';
import { scoreHeadline } from './sentimentLocal.js';

export async function fetchRssHeadlines() {
  let count = 0;
  for (const feed of RSS_FEEDS) {
    try {
      const items = await fetchRssFeed(feed.url);
      for (const item of items.slice(0, 20)) {
        const text = `${item.title} ${item.description}`;
        await ingestMarketHeadline({
          title: item.title,
          summary: item.description?.slice(0, 500),
          url: item.link,
          sentiment: scoreHeadline(text),
          eventType: 'news',
          ts: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
          source: feed.id,
          providerId: feed.id,
          requestUrl: feed.url,
          raw: { ...item, feed: feed.name },
        });
        count++;
      }
    } catch (e) {
      console.error(`RSS ${feed.id} failed:`, (e as Error).message);
    }
  }
  return count;
}
