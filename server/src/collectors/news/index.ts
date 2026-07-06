import { fetchGdeltGalNews } from './gdeltGal.js';
import { fetchRssHeadlines } from './rssHeadlines.js';
import { fetchWsbSentiment } from '../sentimentMacro.js';
import { aggregateTopStocks } from './topStocks.js';

export async function runNewsFast() {
  const [gdelt, rss] = await Promise.all([
    fetchGdeltGalNews().catch((e) => { console.error('GDELT:', e); return 0; }),
    fetchRssHeadlines().catch((e) => { console.error('RSS:', e); return 0; }),
  ]);
  return { gdelt, rss, total: gdelt + rss };
}

export async function runSentimentMedium() {
  const mod = await import('./index-collectors.js');
  const [wsb, reddit, redditOAuth] = await Promise.all([
    fetchWsbSentiment().catch((e) => { console.error('WSB:', e); return 0; }),
    mod.fetchRedditPublic().catch((e) => { console.error('Reddit public:', e); return 0; }),
    mod.fetchRedditOfficial().catch((e) => { console.error('Reddit OAuth:', e); return 0; }),
  ]);
  const topStocks = await aggregateTopStocks(50).catch((e) => { console.error('Top stocks:', e); return []; });
  const { computeAllTrends } = await import('../../services/sentimentTrend.js');
  const trends = await computeAllTrends().catch(() => 0);
  return { wsb, reddit, redditOAuth, topStocks: topStocks.length, trends };
}

export async function runNewsKeyed() {
  const mod = await import('./index-collectors.js');
  const [finnhubGeneral, adanos] = await Promise.all([
    mod.fetchFinnhubGeneralNews().catch((e) => { console.error('Finnhub general:', e); return 0; }),
    mod.fetchAdanosNews().catch((e) => { console.error('Adanos:', e); return 0; }),
  ]);
  const topStocks = await aggregateTopStocks(50).catch(() => []);
  const { computeAllTrends } = await import('../../services/sentimentTrend.js');
  const trends = await computeAllTrends().catch(() => 0);
  return { finnhubGeneral, adanos, topStocks: topStocks.length, trends };
}

export { fetchGdeltGalNews } from './gdeltGal.js';
export { fetchRssHeadlines } from './rssHeadlines.js';
export { aggregateTopStocks, getLatestTopStocks } from './topStocks.js';
