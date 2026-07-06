import { eq, and, gte, desc } from 'drizzle-orm';
import { appConfig } from '../../config.js';
import { getDb, schema } from '../../db/index.js';
import { ingestMetric } from './utils.js';
import { extractCashtags } from './marketIngest.js';
import { APEWISDOM_FILTERS } from './sources.js';

export interface TopStock {
  symbol: string;
  score: number;
  rank: number;
  mentions: number;
  sentiment: number;
  sources: string[];
}

interface TickerAcc {
  mentions: number;
  sentimentSum: number;
  sentimentCount: number;
  sources: Set<string>;
  rankBonus: number;
}

function bump(acc: Map<string, TickerAcc>, symbol: string, opts: {
  mentions?: number;
  sentiment?: number;
  source: string;
  rankBonus?: number;
}) {
  const sym = symbol.replace('$', '').toUpperCase();
  if (!sym || sym.length > 5 || sym === 'MARKET') return;
  if (!/^[A-Z]{1,5}$/.test(sym)) return;

  let row = acc.get(sym);
  if (!row) {
    row = { mentions: 0, sentimentSum: 0, sentimentCount: 0, sources: new Set(), rankBonus: 0 };
    acc.set(sym, row);
  }
  row.mentions += opts.mentions ?? 1;
  if (opts.sentiment != null) {
    row.sentimentSum += opts.sentiment;
    row.sentimentCount++;
  }
  row.sources.add(opts.source);
  row.rankBonus = Math.max(row.rankBonus, opts.rankBonus ?? 0);
}

export async function aggregateTopStocks(limit = 50): Promise<TopStock[]> {
  const acc = new Map<string, TickerAcc>();

  for (const filter of APEWISDOM_FILTERS) {
    try {
      const url = `https://apewisdom.io/api/v1.0/filter/${filter}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as {
        results?: Array<{
          ticker: string; mentions: string | number; rank: string | number;
          mentions_24h_ago?: string | number; upvotes?: string | number;
        }>;
      };
      for (const row of data.results?.slice(0, 30) || []) {
        const mentions = typeof row.mentions === 'number' ? row.mentions : parseInt(String(row.mentions), 10) || 0;
        const rank = typeof row.rank === 'number' ? row.rank : parseInt(String(row.rank), 10) || 99;
        bump(acc, row.ticker, {
          mentions,
          source: `apewisdom-${filter}`,
          rankBonus: Math.max(0, 50 - rank),
        });
      }
    } catch { /* skip filter */ }
  }

  try {
    const res = await fetch('https://api.tradestie.com/v1/apps/reddit', {
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      const data = await res.json() as Array<{
        ticker: string; no_of_comments: number; sentiment: string; sentiment_score: number;
      }>;
      data.slice(0, 50).forEach((row, i) => {
        const sent = row.sentiment === 'Bullish' ? row.sentiment_score : row.sentiment === 'Bearish' ? -row.sentiment_score : 0;
        bump(acc, row.ticker, {
          mentions: row.no_of_comments,
          sentiment: sent,
          source: 'wsb',
          rankBonus: Math.max(0, 50 - i),
        });
      });
    }
  } catch { /* tradestie optional */ }

  const db = getDb(appConfig.databasePath);
  const cutoff = new Date(Date.now() - 48 * 3600_000).toISOString();
  const events = await db.select().from(schema.tsEvents)
    .where(and(
      eq(schema.tsEvents.entityId, 'MARKET'),
      gte(schema.tsEvents.ts, cutoff),
    ))
    .orderBy(desc(schema.tsEvents.ts))
    .limit(500);

  for (const e of events) {
    const text = `${e.title || ''} ${e.summary || ''}`;
    const tickers = extractCashtags(text);
    let rawTickers: string[] = [];
    try {
      const raw = JSON.parse(e.payloadJson || '{}') as { tickers?: string[] };
      rawTickers = raw.tickers || [];
    } catch { /* ignore */ }
    for (const t of [...tickers, ...rawTickers]) {
      bump(acc, t, { mentions: 1, sentiment: e.sentiment ?? undefined, source: e.source });
    }
  }

  const ranked: TopStock[] = [...acc.entries()]
    .map(([symbol, row]) => {
      const avgSent = row.sentimentCount > 0 ? row.sentimentSum / row.sentimentCount : 0;
      const score = row.mentions * 2 + row.rankBonus * 3 + avgSent * 10;
      return {
        symbol,
        score,
        rank: 0,
        mentions: row.mentions,
        sentiment: avgSent,
        sources: [...row.sources],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  for (const row of ranked) {
    await ingestMetric(row.symbol, 'top_stock_score', row.score, 'top-stocks', 'sentiment-news', { raw: row });
    await ingestMetric(row.symbol, 'top_stock_rank', row.rank, 'top-stocks', 'sentiment-news', { raw: row });
    await ingestMetric(row.symbol, 'reddit_mentions', row.mentions, 'top-stocks', 'sentiment-news', { raw: row });
    if (row.sentiment !== 0) {
      await ingestMetric(row.symbol, 'sentiment_score', row.sentiment, 'top-stocks', 'sentiment-news', { raw: row });
    }
  }

  return ranked;
}

export async function getLatestTopStocks(limit = 30): Promise<TopStock[]> {
  const db = getDb(appConfig.databasePath);
  const rows = await db.select().from(schema.tsMetrics)
    .where(and(
      eq(schema.tsMetrics.metricKey, 'top_stock_rank'),
      eq(schema.tsMetrics.entityType, 'instrument'),
    ))
    .orderBy(desc(schema.tsMetrics.ts))
    .limit(200);

  const latest = new Map<string, typeof rows[0]>();
  for (const r of rows) {
    if (!latest.has(r.entityId)) latest.set(r.entityId, r);
  }

  const scoreRows = await db.select().from(schema.tsMetrics)
    .where(and(
      eq(schema.tsMetrics.metricKey, 'top_stock_score'),
      eq(schema.tsMetrics.entityType, 'instrument'),
    ))
    .orderBy(desc(schema.tsMetrics.ts))
    .limit(200);
  const scores = new Map<string, number>();
  for (const r of scoreRows) {
    if (!scores.has(r.entityId)) scores.set(r.entityId, r.value);
  }

  const mentionRows = await db.select().from(schema.tsMetrics)
    .where(and(
      eq(schema.tsMetrics.metricKey, 'reddit_mentions'),
      eq(schema.tsMetrics.entityType, 'instrument'),
    ))
    .orderBy(desc(schema.tsMetrics.ts))
    .limit(200);
  const mentions = new Map<string, number>();
  for (const r of mentionRows) {
    if (!mentions.has(r.entityId)) mentions.set(r.entityId, r.value);
  }

  return [...latest.entries()]
    .map(([symbol, rankRow]) => ({
      symbol,
      rank: rankRow.value,
      score: scores.get(symbol) ?? 0,
      mentions: mentions.get(symbol) ?? 0,
      sentiment: 0,
      sources: [],
    }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}
