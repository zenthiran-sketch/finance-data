import { ingestMetric } from './utils.js';

const XOOMAR_URL = 'https://xoomar.com/markets/api/sentiment';

export async function fetchXoomarSentiment() {
  try {
    const res = await fetch(XOOMAR_URL, { headers: { 'User-Agent': 'SignalTerminal/1.0' } });
    if (!res.ok) throw new Error(`Xoomar HTTP ${res.status}`);
    const data = await res.json() as { assets?: Array<{ symbol: string; sentiment: number }> };
    let count = 0;
    for (const asset of data.assets || []) {
      await ingestMetric(asset.symbol, 'sentiment_score', asset.sentiment, 'xoomar', 'sentiment-news', {
        raw: asset,
      });
      count++;
    }
    return count;
  } catch (e) {
    console.error('Xoomar:', (e as Error).message);
    return 0;
  }
}
