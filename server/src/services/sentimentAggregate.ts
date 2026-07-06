import { eq, and, desc } from 'drizzle-orm';
import { appConfig } from '../config.js';
import { getDb, schema } from '../db/index.js';
import { ingestMetric } from '../collectors/news/utils.js';

export async function computeSentimentComposite(symbol: string) {
  const db = getDb(appConfig.databasePath);
  const clean = symbol.replace(/\.(NS|US)$/i, '');

  const metrics = await db.select().from(schema.tsMetrics)
    .where(and(
      eq(schema.tsMetrics.entityId, clean),
      eq(schema.tsMetrics.entityType, 'instrument'),
    ))
    .orderBy(desc(schema.tsMetrics.ts))
    .limit(50);

  const latest = new Map<string, number>();
  for (const m of metrics) {
    if (!latest.has(m.metricKey)) latest.set(m.metricKey, m.value);
  }

  const weights: Record<string, number> = {
    sentiment_score: 0.4,
    reddit_mentions: 0.15,
    news_sentiment: 0.25,
    fear_greed_index: 0.2,
  };

  const events = await db.select().from(schema.tsEvents)
    .where(and(
      eq(schema.tsEvents.entityId, clean),
      eq(schema.tsEvents.entityType, 'instrument'),
    ))
    .orderBy(desc(schema.tsEvents.ts))
    .limit(20);

  const newsSentiments = events
    .filter((e) => e.sentiment != null)
    .map((e) => e.sentiment as number);
  const avgNews = newsSentiments.length
    ? newsSentiments.reduce((a, b) => a + b, 0) / newsSentiments.length
    : null;
  if (avgNews != null) latest.set('news_sentiment', avgNews);

  let totalWeight = 0;
  let composite = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const val = latest.get(key);
    if (val == null) continue;
    const normalized = key === 'reddit_mentions' ? Math.min(1, val / 100) : val;
    composite += normalized * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;

  const score = composite / totalWeight;
  await ingestMetric(clean, 'sentiment_composite', score, 'signal-terminal', 'sentiment-news', {
    raw: { components: Object.fromEntries(latest), totalWeight },
  });
  return score;
}

export async function computeAllSentimentComposites() {
  const db = getDb(appConfig.databasePath);
  const instruments = await db.select().from(schema.instruments).where(eq(schema.instruments.active, true));
  let count = 0;
  for (const inst of instruments.slice(0, 40)) {
    const score = await computeSentimentComposite(inst.symbol);
    if (score != null) count++;
  }
  return count;
}
