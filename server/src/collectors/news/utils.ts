import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import type { PipelineId } from '@signal-terminal/shared';
import { appConfig } from '../../config.js';
import { getDb, schema } from '../../db/index.js';
import { timeSeriesWriter } from '../../timeseries/index.js';

export function eventHash(source: string, url: string, title: string) {
  return crypto.createHash('sha256').update(`${source}|${url}|${title}`).digest('hex');
}

export async function getWatchlistSymbols(limit = 30): Promise<string[]> {
  const db = getDb(appConfig.databasePath);
  const lists = await db.select().from(schema.watchlists).where(eq(schema.watchlists.isDefault, true));
  if (!lists[0]) return [];
  const items = await db.select().from(schema.watchlistItems)
    .where(eq(schema.watchlistItems.watchlistId, lists[0].id));
  const instruments = await db.select().from(schema.instruments);
  const ids = new Set(items.map((i) => i.instrumentId));
  return instruments
    .filter((i) => ids.has(i.id))
    .map((i) => i.symbol)
    .slice(0, limit);
}

export async function getDefaultSeedSymbols(limit = 20): Promise<string[]> {
  const db = getDb(appConfig.databasePath);
  const instruments = await db.select().from(schema.instruments).where(eq(schema.instruments.active, true));
  return instruments.slice(0, limit).map((i) => i.symbol);
}

export async function resolveSymbolsForNews(): Promise<string[]> {
  const watch = await getWatchlistSymbols(25);
  if (watch.length >= 3) return watch;
  const seed = await getDefaultSeedSymbols(20);
  return [...new Set([...watch, ...seed])].slice(0, 25);
}

export interface NewsEventInput {
  entityId: string;
  title: string;
  summary?: string;
  url?: string;
  sentiment?: number;
  eventType: string;
  ts?: string;
  source: string;
  providerId: string;
  pipelineId: PipelineId;
  requestUrl?: string;
  raw: unknown;
}

export async function ingestNewsEvent(input: NewsEventInput) {
  const hash = eventHash(input.source, input.url || input.title, input.title);
  await timeSeriesWriter.ingest({
    dataset: 'event',
    entityType: 'instrument',
    entityId: input.entityId,
    ts: input.ts || new Date().toISOString(),
    source: input.source,
    providerId: input.providerId,
    pipelineId: input.pipelineId,
    requestUrl: input.requestUrl,
    httpStatus: 200,
    raw: input.raw,
    normalized: {
      eventHash: hash,
      eventType: input.eventType,
      title: input.title,
      summary: input.summary,
      sentiment: input.sentiment,
      url: input.url,
      payload: input.raw,
    },
  });
}

export async function ingestMetric(
  entityId: string,
  metricKey: string,
  value: number,
  providerId: string,
  pipelineId: PipelineId,
  opts?: { entityType?: 'instrument' | 'macro_series'; unit?: string; raw?: unknown },
) {
  await timeSeriesWriter.ingest({
    dataset: 'metric',
    entityType: opts?.entityType || 'instrument',
    entityId,
    ts: new Date().toISOString(),
    source: providerId,
    providerId,
    pipelineId,
    raw: opts?.raw || { metricKey, value },
    normalized: { metricKey, value, unit: opts?.unit },
  });
}

/** Extract tickers from text using $SYM or word match against known symbols */
export function extractTickers(text: string, knownSymbols: string[]): string[] {
  const found = new Set<string>();
  const upper = text.toUpperCase();
  for (const sym of knownSymbols) {
    const clean = sym.replace(/\.(NS|US)$/i, '').replace('/', '');
    if (clean.length >= 2 && upper.includes(clean.toUpperCase())) found.add(sym);
    if (upper.includes(`$${clean.toUpperCase()}`)) found.add(sym);
  }
  const cashtags = text.match(/\$[A-Z]{1,6}/g) || [];
  for (const c of cashtags) found.add(c.slice(1));
  return [...found];
}
