import { eq, and, desc, lte, gte } from 'drizzle-orm';
import { appConfig } from '../config.js';
import { getDb, schema } from '../db/index.js';
import { ingestMetric } from '../collectors/news/utils.js';

export type TrendDirection = 'positive' | 'negative' | 'neutral';

export interface TrendResult {
  symbol: string;
  market: string;
  direction: TrendDirection;
  composite: number | null;
  delta24h: number | null;
  confidence: number;
  sentimentTrend: number;
  reasons: string[];
  sources: string[];
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

async function getMetricAt(entityId: string, metricKey: string, beforeTs?: string) {
  const db = getDb(appConfig.databasePath);
  const conditions = [
    eq(schema.tsMetrics.entityId, entityId),
    eq(schema.tsMetrics.entityType, 'instrument'),
    eq(schema.tsMetrics.metricKey, metricKey),
  ];
  if (beforeTs) conditions.push(lte(schema.tsMetrics.ts, beforeTs));
  const rows = await db.select().from(schema.tsMetrics)
    .where(and(...conditions))
    .orderBy(desc(schema.tsMetrics.ts))
    .limit(1);
  return rows[0] ?? null;
}

async function getLatestMetricsMap(entityId: string) {
  const db = getDb(appConfig.databasePath);
  const rows = await db.select().from(schema.tsMetrics)
    .where(and(
      eq(schema.tsMetrics.entityId, entityId),
      eq(schema.tsMetrics.entityType, 'instrument'),
    ))
    .orderBy(desc(schema.tsMetrics.ts))
    .limit(80);
  const map = new Map<string, typeof rows[0]>();
  for (const r of rows) {
    if (!map.has(r.metricKey)) map.set(r.metricKey, r);
  }
  return map;
}

export async function computeSentimentDelta(symbol: string, hours = 24): Promise<number | null> {
  const clean = symbol.replace(/\.(NS|US)$/i, '');
  const current = await getMetricAt(clean, 'sentiment_composite');
  const cutoff = hoursAgo(hours);
  const prior = await getMetricAt(clean, 'sentiment_composite', cutoff);
  if (!current) return null;
  if (!prior || prior.ts === current.ts) return 0;
  return current.value - prior.value;
}

export async function classifyTrend(symbol: string): Promise<TrendResult> {
  const clean = symbol.replace(/\.(NS|US)$/i, '');
  const db = getDb(appConfig.databasePath);
  const allInst = await db.select().from(schema.instruments);
  const inst = allInst.find((i) =>
    i.symbol === symbol || i.symbol.replace(/\.(NS|US)$/i, '') === clean,
  );
  const market = inst?.market ?? 'Stocks';

  const metrics = await getLatestMetricsMap(clean);
  const composite = metrics.get('sentiment_composite')?.value ?? null;
  const deltaStored = metrics.get('sentiment_delta_24h')?.value;
  const delta24h = deltaStored ?? await computeSentimentDelta(clean);
  const mentionVelocity = metrics.get('mention_velocity')?.value ?? 0;
  const rankDelta = metrics.get('rank_delta_24h')?.value ?? 0;
  const newsSentiment = metrics.get('news_sentiment')?.value ?? null;
  const adanosTrend = metrics.get('adanos_trend')?.value;
  const bullishPct = metrics.get('bullish_pct')?.value;
  const bearishPct = metrics.get('bearish_pct')?.value;

  const reasons: string[] = [];
  const sources = [...new Set([...metrics.values()].map((m) => m.source))];

  let sentimentTrend = 0;
  let confidence = 0.3;

  const hasMomentum = mentionVelocity > 0.5 || rankDelta > 10;
  const newsBuzz = newsSentiment != null && Math.abs(newsSentiment) > 0.2;

  if (composite != null && delta24h != null) {
    if (composite > 0.15 && delta24h > 0.1 && (hasMomentum || newsBuzz)) {
      sentimentTrend = 1;
      reasons.push(`Composite ${composite.toFixed(2)} rising (+${delta24h.toFixed(2)} 24h)`);
      confidence += 0.25;
    } else if (composite < -0.15 && delta24h < -0.1 && (hasMomentum || newsBuzz)) {
      sentimentTrend = -1;
      reasons.push(`Composite ${composite.toFixed(2)} falling (${delta24h.toFixed(2)} 24h)`);
      confidence += 0.25;
    }
  }

  if (mentionVelocity > 0.5) {
    reasons.push(`Mention velocity +${(mentionVelocity * 100).toFixed(0)}%`);
    confidence += 0.15;
  }
  if (rankDelta > 10) {
    reasons.push(`Reddit rank climbed ${rankDelta} spots`);
    confidence += 0.15;
  }
  if (newsBuzz && newsSentiment != null) {
    reasons.push(`News sentiment ${newsSentiment > 0 ? 'positive' : 'negative'} (${newsSentiment.toFixed(2)})`);
    confidence += 0.1;
  }

  const wsbRank = metrics.get('reddit_rank')?.source === 'wsb' ? metrics.get('reddit_rank')?.value : null;
  const wsbScore = metrics.get('sentiment_score')?.source === 'wsb' ? metrics.get('sentiment_score')?.value : null;
  if (wsbRank != null && wsbRank <= 20 && wsbScore != null && wsbScore > 0) {
    confidence += 0.1;
    reasons.push('WSB top-20 bullish');
  }

  if (adanosTrend === 1 || (bullishPct != null && bearishPct != null && bullishPct > bearishPct && adanosTrend !== -1)) {
    sentimentTrend = 1;
    reasons.push('Adanos trend rising');
    confidence += 0.2;
  } else if (adanosTrend === -1 || (bullishPct != null && bearishPct != null && bearishPct > bullishPct && adanosTrend !== 1)) {
    sentimentTrend = -1;
    reasons.push('Adanos trend falling');
    confidence += 0.2;
  }

  confidence = Math.min(1, confidence);

  let direction: TrendDirection = 'neutral';
  if (sentimentTrend > 0) direction = 'positive';
  else if (sentimentTrend < 0) direction = 'negative';

  await ingestMetric(clean, 'sentiment_trend', sentimentTrend, 'signal-terminal', 'sentiment-news', {
    raw: { reasons, confidence },
  });
  await ingestMetric(clean, 'trend_confidence', confidence, 'signal-terminal', 'sentiment-news');
  if (delta24h != null) {
    await ingestMetric(clean, 'sentiment_delta_24h', delta24h, 'signal-terminal', 'sentiment-news');
  }

  return {
    symbol: clean,
    market,
    direction,
    composite,
    delta24h,
    confidence,
    sentimentTrend,
    reasons,
    sources,
  };
}

export async function computeAllTrends() {
  const db = getDb(appConfig.databasePath);
  const instruments = await db.select().from(schema.instruments).where(eq(schema.instruments.active, true));
  let count = 0;
  for (const inst of instruments) {
    await classifyTrend(inst.symbol);
    count++;
  }
  return count;
}

export async function rankTrendingStocks(opts: {
  direction?: TrendDirection;
  market?: string;
  limit?: number;
}): Promise<TrendResult[]> {
  const db = getDb(appConfig.databasePath);
  const limit = opts.limit ?? 20;
  const cutoff = hoursAgo(48);

  const instruments = await db.select().from(schema.instruments).where(eq(schema.instruments.active, true));
  const instBySymbol = new Map(instruments.map((i) => [i.symbol.replace(/\.(NS|US)$/i, ''), i]));

  const metricRows = await db.select().from(schema.tsMetrics)
    .where(and(
      eq(schema.tsMetrics.entityType, 'instrument'),
      gte(schema.tsMetrics.ts, cutoff),
    ))
    .orderBy(desc(schema.tsMetrics.ts));

  const byEntity = new Map<string, Map<string, typeof metricRows[0]>>();
  for (const r of metricRows) {
    if (!byEntity.has(r.entityId)) byEntity.set(r.entityId, new Map());
    const m = byEntity.get(r.entityId)!;
    if (!m.has(r.metricKey)) m.set(r.metricKey, r);
  }

  const results: TrendResult[] = [];
  for (const [entityId, metrics] of byEntity) {
    const trendVal = metrics.get('sentiment_trend')?.value ?? 0;
    const wantPositive = opts.direction === 'positive';
    const wantNegative = opts.direction === 'negative';
    if (wantPositive && trendVal <= 0) continue;
    if (wantNegative && trendVal >= 0) continue;
    if (!wantPositive && !wantNegative && trendVal === 0) continue;

    const inst = instBySymbol.get(entityId);
    if (opts.market && inst?.market !== opts.market) continue;

    const confidence = metrics.get('trend_confidence')?.value ?? 0.3;
    const composite = metrics.get('sentiment_composite')?.value ?? null;
    const delta24h = metrics.get('sentiment_delta_24h')?.value ?? null;
    const mentionVelocity = metrics.get('mention_velocity')?.value;
    const rankDelta = metrics.get('rank_delta_24h')?.value;
    const reasons: string[] = [];
    if (composite != null) reasons.push(`Composite ${composite.toFixed(2)}`);
    if (delta24h != null) reasons.push(`24h delta ${delta24h >= 0 ? '+' : ''}${delta24h.toFixed(2)}`);
    if (mentionVelocity != null && mentionVelocity > 0.5) reasons.push(`Mentions surging (+${(mentionVelocity * 100).toFixed(0)}%)`);
    if (rankDelta != null && rankDelta > 10) reasons.push(`Rank up ${rankDelta}`);

    results.push({
      symbol: entityId,
      market: inst?.market ?? 'Stocks',
      direction: trendVal > 0 ? 'positive' : trendVal < 0 ? 'negative' : 'neutral',
      composite,
      delta24h,
      confidence,
      sentimentTrend: trendVal,
      reasons,
      sources: [...new Set([...metrics.values()].map((m) => m.source))],
    });
  }

  results.sort((a, b) => {
    const conf = b.confidence - a.confidence;
    if (conf !== 0) return conf;
    return Math.abs(b.delta24h ?? 0) - Math.abs(a.delta24h ?? 0);
  });

  return results.slice(0, limit);
}
