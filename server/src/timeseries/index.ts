import { v4 as uuid } from 'uuid';
import { eq, and, gte, lte, desc, sql, or, like } from 'drizzle-orm';
import type { DatasetType, EntityType, PipelineId } from '@signal-terminal/shared';
import { appConfig } from '../config.js';
import { getDb, schema } from '../db/index.js';

function dbPath() {
  return process.env.DATABASE_PATH || appConfig.databasePath;
}

export interface IngestionRecord {
  dataset: DatasetType;
  entityType: EntityType;
  entityId: string;
  ts: string;
  source: string;
  providerId: string;
  credentialId?: string;
  pipelineId: PipelineId;
  requestUrl?: string;
  httpStatus?: number;
  durationMs?: number;
  raw: unknown;
  normalized: Record<string, unknown>;
}

export class TimeSeriesWriter {
  async ingest(record: IngestionRecord): Promise<string> {
    const db = getDb(dbPath());
    const ingestionId = uuid();
    const fetchedAt = new Date().toISOString();

    await db.insert(schema.rawIngestions).values({
      id: ingestionId,
      dataset: record.dataset,
      entityType: record.entityType,
      entityId: record.entityId,
      providerId: record.providerId,
      credentialId: record.credentialId ?? null,
      pipelineId: record.pipelineId,
      requestUrl: record.requestUrl ?? null,
      httpStatus: record.httpStatus ?? null,
      fetchedAt,
      durationMs: record.durationMs ?? null,
      payloadJson: JSON.stringify(record.raw),
    });

    const n = record.normalized;

    if (record.dataset === 'bar') {
      await db.insert(schema.tsBars).values({
        id: uuid(),
        instrumentId: record.entityId,
        ts: record.ts,
        resolution: String(n.resolution || '1d'),
        open: n.open as number | undefined,
        high: n.high as number | undefined,
        low: n.low as number | undefined,
        close: n.close as number,
        volume: n.volume as number | undefined,
        source: record.source,
        providerId: record.providerId,
        credentialId: record.credentialId ?? null,
        ingestionId,
        fetchedAt,
      }).onConflictDoUpdate({
        target: [schema.tsBars.instrumentId, schema.tsBars.ts, schema.tsBars.resolution],
        set: {
          close: n.close as number,
          open: n.open as number | undefined,
          high: n.high as number | undefined,
          low: n.low as number | undefined,
          volume: n.volume as number | undefined,
          source: record.source,
          providerId: record.providerId,
          fetchedAt,
        },
      });
    } else if (record.dataset === 'tick') {
      await db.insert(schema.tsTicks).values({
        id: uuid(),
        instrumentId: record.entityId,
        ts: record.ts,
        price: n.price as number,
        bid: n.bid as number | undefined,
        ask: n.ask as number | undefined,
        changePct: n.changePct as number | undefined,
        volume: n.volume as number | undefined,
        streamType: n.streamType as string | undefined,
        source: record.source,
        providerId: record.providerId,
        credentialId: record.credentialId ?? null,
        ingestionId,
      });
    } else if (record.dataset === 'metric') {
      await db.insert(schema.tsMetrics).values({
        id: uuid(),
        entityType: record.entityType,
        entityId: record.entityId,
        metricKey: String(n.metricKey),
        ts: record.ts,
        value: n.value as number,
        unit: n.unit as string | undefined,
        source: record.source,
        providerId: record.providerId,
        ingestionId,
      }).onConflictDoNothing();
    } else if (record.dataset === 'event') {
      const eventHash = String(n.eventHash);
      await db.insert(schema.tsEvents).values({
        id: uuid(),
        entityType: record.entityType,
        entityId: record.entityId,
        eventType: String(n.eventType),
        ts: record.ts,
        title: n.title as string | undefined,
        summary: n.summary as string | undefined,
        sentiment: n.sentiment as number | undefined,
        url: n.url as string | undefined,
        payloadJson: JSON.stringify(n.payload ?? {}),
        eventHash,
        source: record.source,
        providerId: record.providerId,
        ingestionId,
      }).onConflictDoNothing();
    } else if (record.dataset === 'fundamental') {
      await db.insert(schema.tsFundamentals).values({
        id: uuid(),
        instrumentId: record.entityId,
        asOf: String(n.asOf),
        period: String(n.period),
        statementType: String(n.statementType),
        revenue: n.revenue as number | undefined,
        netIncome: n.netIncome as number | undefined,
        eps: n.eps as number | undefined,
        pe: n.pe as number | undefined,
        pb: n.pb as number | undefined,
        debtToEquity: n.debtToEquity as number | undefined,
        payloadJson: JSON.stringify(n.payload ?? {}),
        source: record.source,
        providerId: record.providerId,
        ingestionId,
      }).onConflictDoNothing();
    } else if (record.dataset === 'nav') {
      await db.insert(schema.tsNav).values({
        id: uuid(),
        instrumentId: record.entityId,
        ts: record.ts,
        nav: n.nav as number,
        source: record.source,
        ingestionId,
      }).onConflictDoUpdate({
        target: [schema.tsNav.instrumentId, schema.tsNav.ts],
        set: { nav: n.nav as number, source: record.source },
      });
    }

    return ingestionId;
  }

  async pruneTicks(olderThanDays = 7) {
    const db = getDb(dbPath());
    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
    await db.delete(schema.tsTicks).where(lte(schema.tsTicks.ts, cutoff));
  }
}

export const timeSeriesWriter = new TimeSeriesWriter();

export class TimeSeriesReader {
  async getBars(instrumentId: string, opts: { from?: string; to?: string; resolution?: string }) {
    const db = getDb(dbPath());
    const conditions = [eq(schema.tsBars.instrumentId, instrumentId)];
    if (opts.resolution) conditions.push(eq(schema.tsBars.resolution, opts.resolution));
    if (opts.from) conditions.push(gte(schema.tsBars.ts, opts.from));
    if (opts.to) conditions.push(lte(schema.tsBars.ts, opts.to));
    return db.select().from(schema.tsBars).where(and(...conditions)).orderBy(schema.tsBars.ts);
  }

  async getTicks(instrumentId: string, opts: { from?: string; to?: string; limit?: number }) {
    const db = getDb(dbPath());
    const conditions = [eq(schema.tsTicks.instrumentId, instrumentId)];
    if (opts.from) conditions.push(gte(schema.tsTicks.ts, opts.from));
    if (opts.to) conditions.push(lte(schema.tsTicks.ts, opts.to));
    let q = db.select().from(schema.tsTicks).where(and(...conditions)).orderBy(desc(schema.tsTicks.ts));
    if (opts.limit) return q.limit(opts.limit);
    return q;
  }

  async getMetrics(entityType: string, entityId: string, metricKey: string, opts: { from?: string; to?: string }) {
    const db = getDb(dbPath());
    const conditions = [
      eq(schema.tsMetrics.entityType, entityType),
      eq(schema.tsMetrics.entityId, entityId),
      eq(schema.tsMetrics.metricKey, metricKey),
    ];
    if (opts.from) conditions.push(gte(schema.tsMetrics.ts, opts.from));
    if (opts.to) conditions.push(lte(schema.tsMetrics.ts, opts.to));
    return db.select().from(schema.tsMetrics).where(and(...conditions)).orderBy(schema.tsMetrics.ts);
  }

  async getEvents(entityId: string, opts: { from?: string; to?: string; eventType?: string; limit?: number }) {
    const db = getDb(dbPath());
    const conditions = [eq(schema.tsEvents.entityId, entityId)];
    if (opts.eventType) conditions.push(eq(schema.tsEvents.eventType, opts.eventType));
    if (opts.from) conditions.push(gte(schema.tsEvents.ts, opts.from));
    if (opts.to) conditions.push(lte(schema.tsEvents.ts, opts.to));
    let q = db.select().from(schema.tsEvents).where(and(...conditions)).orderBy(desc(schema.tsEvents.ts));
    if (opts.limit) return q.limit(opts.limit);
    return q;
  }

  /** Per-symbol events plus MARKET headlines that mention the ticker. */
  async getSymbolNews(symbol: string, opts: { from?: string; to?: string; eventType?: string; limit?: number }) {
    const clean = symbol.replace(/\.(NS|US)$/i, '');
    const limit = opts.limit ?? 20;
    const direct = await this.getEvents(clean, { ...opts, limit: limit * 2 });

    const db = getDb(dbPath());
    const instrument = await db.select().from(schema.instruments)
      .where(eq(schema.instruments.symbol, clean))
      .limit(1);

    const base = clean.split('/')[0];
    const needles = new Set([clean, base, `$${base}`, `$${clean}`]);
    const name = instrument[0]?.name;
    if (name && name.toLowerCase() !== clean.toLowerCase() && name.length >= 3) {
      needles.add(name);
    }

    const marketConditions = [
      eq(schema.tsEvents.entityId, 'MARKET'),
      or(...[...needles].filter((n) => n.length >= 2).flatMap((n) => [
        like(schema.tsEvents.title, `%${n}%`),
        like(schema.tsEvents.summary, `%${n}%`),
      ])),
    ];
    if (opts.eventType) marketConditions.push(eq(schema.tsEvents.eventType, opts.eventType));
    if (opts.from) marketConditions.push(gte(schema.tsEvents.ts, opts.from));
    if (opts.to) marketConditions.push(lte(schema.tsEvents.ts, opts.to));

    const marketEvents = await db.select().from(schema.tsEvents)
      .where(and(...marketConditions))
      .orderBy(desc(schema.tsEvents.ts))
      .limit(limit * 3);

    const seen = new Set<string>();
    const merged: typeof direct = [];
    for (const e of [...direct, ...marketEvents]) {
      const key = e.eventHash || e.id;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(e);
    }
    merged.sort((a, b) => b.ts.localeCompare(a.ts));
    return merged.slice(0, limit);
  }

  async getLatestMetrics(entityId: string, entityType = 'instrument') {
    const db = getDb(dbPath());
    const rows = await db.select().from(schema.tsMetrics)
      .where(and(
        eq(schema.tsMetrics.entityId, entityId),
        eq(schema.tsMetrics.entityType, entityType),
      ))
      .orderBy(desc(schema.tsMetrics.ts))
      .limit(100);
    const latest = new Map<string, typeof rows[0]>();
    for (const r of rows) {
      if (!latest.has(r.metricKey)) latest.set(r.metricKey, r);
    }
    return [...latest.values()];
  }

  async getMarketFeed(limit = 30) {
    const db = getDb(dbPath());
    const events = await db.select().from(schema.tsEvents)
      .where(eq(schema.tsEvents.entityId, 'MARKET'))
      .orderBy(desc(schema.tsEvents.ts))
      .limit(limit);
    const { getLatestTopStocks } = await import('../collectors/news/topStocks.js');
    const topStocks = await getLatestTopStocks(25);
    return { events, topStocks, trending: topStocks.map((t) => ({
      entityId: t.symbol,
      value: t.rank,
      ts: new Date().toISOString(),
      source: 'top-stocks',
    })) };
  }

  async getFundamentals(instrumentId: string) {
    const db = getDb(dbPath());
    return db.select().from(schema.tsFundamentals)
      .where(eq(schema.tsFundamentals.instrumentId, instrumentId))
      .orderBy(desc(schema.tsFundamentals.asOf));
  }

  async getSignals(instrumentId: string, opts: { from?: string; to?: string }) {
    const db = getDb(dbPath());
    const conditions = [eq(schema.signals.instrumentId, instrumentId)];
    if (opts.from) conditions.push(gte(schema.signals.computedAt, opts.from));
    if (opts.to) conditions.push(lte(schema.signals.computedAt, opts.to));
    return db.select().from(schema.signals).where(and(...conditions)).orderBy(schema.signals.computedAt);
  }

  async getRawIngestions(opts: { entityId?: string; providerId?: string; limit?: number }) {
    const db = getDb(dbPath());
    const conditions = [];
    if (opts.entityId) conditions.push(eq(schema.rawIngestions.entityId, opts.entityId));
    if (opts.providerId) conditions.push(eq(schema.rawIngestions.providerId, opts.providerId));
    let q = db.select().from(schema.rawIngestions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.rawIngestions.fetchedAt));
    if (opts.limit) return q.limit(opts.limit);
    return q;
  }

  async getDatasetCatalog() {
    const db = getDb(dbPath());
    const barCounts = await db.select({
      instrumentId: schema.tsBars.instrumentId,
      count: sql<number>`count(*)`,
      minTs: sql<string>`min(${schema.tsBars.ts})`,
      maxTs: sql<string>`max(${schema.tsBars.ts})`,
    }).from(schema.tsBars).groupBy(schema.tsBars.instrumentId);
    return barCounts;
  }
}

export const timeSeriesReader = new TimeSeriesReader();
