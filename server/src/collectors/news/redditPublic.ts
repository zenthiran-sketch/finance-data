import { REDDIT_SUBREDDITS } from './sources.js';
import { ingestMarketHeadline, extractCashtags } from './marketIngest.js';
import { scoreHeadline } from './sentimentLocal.js';

const UA = 'SignalTerminal/1.0 (market news aggregator)';

/** Fetch hot posts from busy subreddits via public JSON (no OAuth). */
export async function fetchRedditPublic() {
  let count = 0;
  for (const sub of REDDIT_SUBREDDITS) {
    const url = `https://www.reddit.com/r/${sub}/hot.json?limit=25`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) {
        console.error(`Reddit r/${sub}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json() as {
        data?: { children?: Array<{ data: {
          title: string; selftext?: string; url: string; permalink: string;
          created_utc: number; score: number; num_comments: number;
        } }> };
      };
      for (const child of data.data?.children || []) {
        const post = child.data;
        const text = `${post.title} ${post.selftext || ''}`;
        const tickers = extractCashtags(text);
        const link = post.permalink
          ? `https://www.reddit.com${post.permalink}`
          : post.url;
        await ingestMarketHeadline({
          title: post.title,
          summary: (post.selftext || '').slice(0, 400) || (tickers.length ? `Tickers: ${tickers.join(', ')}` : undefined),
          url: link,
          sentiment: scoreHeadline(text),
          eventType: 'social',
          ts: new Date(post.created_utc * 1000).toISOString(),
          source: `reddit-${sub}`,
          providerId: 'reddit',
          requestUrl: url,
          raw: { ...post, tickers, subreddit: sub, score: post.score, comments: post.num_comments },
        });
        count++;
      }
      await new Promise((r) => setTimeout(r, 1100));
    } catch (e) {
      console.error(`Reddit r/${sub}:`, (e as Error).message);
    }
  }
  return count;
}
