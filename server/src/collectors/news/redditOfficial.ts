import { REDDIT_SUBREDDITS } from './sources.js';
import { ingestMarketHeadline, extractCashtags } from './marketIngest.js';
import { scoreHeadline } from './sentimentLocal.js';

async function getRedditToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SignalTerminal/1.0',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token?: string };
  return data.access_token || null;
}

export async function fetchRedditOfficial() {
  const token = await getRedditToken();
  if (!token) return 0;

  let count = 0;
  for (const sub of REDDIT_SUBREDDITS.slice(0, 5)) {
    const url = `https://oauth.reddit.com/r/${sub}/hot?limit=25`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'SignalTerminal/1.0',
      },
    });
    if (!res.ok) continue;
    const data = await res.json() as {
      data?: { children?: Array<{ data: {
        title: string; selftext?: string; url: string; permalink: string;
        created_utc: number; score: number;
      } }> };
    };
    for (const child of data.data?.children || []) {
      const post = child.data;
      const text = `${post.title} ${post.selftext || ''}`;
      const tickers = extractCashtags(text);
      await ingestMarketHeadline({
        title: post.title,
        summary: (post.selftext || '').slice(0, 400),
        url: post.permalink ? `https://www.reddit.com${post.permalink}` : post.url,
        sentiment: scoreHeadline(text),
        eventType: 'social',
        ts: new Date(post.created_utc * 1000).toISOString(),
        source: `reddit-${sub}`,
        providerId: 'reddit',
        requestUrl: url,
        raw: { ...post, tickers, subreddit: sub },
      });
      count++;
    }
  }
  return count;
}
