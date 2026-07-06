import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { eq, and, like, or, desc } from 'drizzle-orm';
import { appConfig } from '../config.js';
import { getDb, schema } from '../db/index.js';
import { refreshService, refreshEvents } from '../services/refresh.js';
import { resilienceService } from '../services/resilience.js';
import { timeSeriesReader } from '../timeseries/index.js';
import { classifyTrend, rankTrendingStocks } from '../services/sentimentTrend.js';
import { encrypt, keyHint } from '../credentials/encryption.js';
import { keyPool } from '../credentials/keyPool.js';
import { PROVIDER_REGISTRY } from '../providers/registry.js';
import type { PipelineId } from '@signal-terminal/shared';
import '../providers/adapters.js';

export const apiRouter = Router();

apiRouter.get('/health', async (_req, res) => {
  const rows = await refreshService.getLatestSignals();
  const health = resilienceService.getSystemHealth(rows);
  res.json({ ok: true, ...health });
});

apiRouter.get('/signals', async (_req, res) => {
  const rows = await refreshService.getLatestSignals();
  res.json(rows);
});

apiRouter.get('/signals/:symbol', async (req, res) => {
  const rows = await refreshService.getLatestSignals();
  const row = rows.find((r) => r.symbol === req.params.symbol);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

apiRouter.get('/signals/:symbol/history', async (req, res) => {
  const db = getDb(appConfig.databasePath);
  const inst = await db.select().from(schema.instruments).where(eq(schema.instruments.symbol, req.params.symbol)).limit(1);
  if (!inst[0]) return res.status(404).json({ error: 'Not found' });
  const history = await timeSeriesReader.getSignals(inst[0].id, {
    from: req.query.from as string,
    to: req.query.to as string,
  });
  res.json(history);
});

apiRouter.get('/candles/:symbol', async (req, res) => {
  const db = getDb(appConfig.databasePath);
  const inst = await db.select().from(schema.instruments).where(eq(schema.instruments.symbol, req.params.symbol)).limit(1);
  if (!inst[0]) return res.status(404).json({ error: 'Not found' });
  const bars = await timeSeriesReader.getBars(inst[0].id, {
    from: req.query.from as string,
    to: req.query.to as string,
    resolution: (req.query.resolution as string) || '1d',
  });
  res.json(bars);
});

apiRouter.get('/backtest/:symbol', async (req, res) => {
  const db = getDb(appConfig.databasePath);
  const inst = await db.select().from(schema.instruments).where(eq(schema.instruments.symbol, req.params.symbol)).limit(1);
  if (!inst[0]) return res.status(404).json({ error: 'Not found' });
  const bars = await timeSeriesReader.getBars(inst[0].id, {
    from: req.query.from as string,
    to: req.query.to as string,
    resolution: '1d',
  });
  const signals = await timeSeriesReader.getSignals(inst[0].id, {
    from: req.query.from as string,
    to: req.query.to as string,
  });
  res.json({ bars, signals });
});

apiRouter.get('/instruments', async (req, res) => {
  const db = getDb(appConfig.databasePath);
  const page = parseInt(req.query.page as string || '1', 10);
  const limit = parseInt(req.query.limit as string || '50', 10);
  const search = (req.query.search as string || '').toLowerCase();
  const market = req.query.market as string;

  let all = await db.select().from(schema.instruments).where(eq(schema.instruments.active, true));
  if (market && market !== 'All') all = all.filter((i) => i.market === market);
  if (search) all = all.filter((i) => i.symbol.toLowerCase().includes(search) || i.name.toLowerCase().includes(search));

  const start = (page - 1) * limit;
  res.json({ items: all.slice(start, start + limit), total: all.length, page, limit });
});

apiRouter.get('/watchlist', async (_req, res) => {
  const db = getDb(appConfig.databasePath);
  const lists = await db.select().from(schema.watchlists).where(eq(schema.watchlists.isDefault, true));
  if (!lists[0]) return res.json({ items: [] });
  const items = await db.select().from(schema.watchlistItems)
    .where(eq(schema.watchlistItems.watchlistId, lists[0].id))
    .orderBy(schema.watchlistItems.sortOrder);
  const signals = await refreshService.getLatestSignals();
  const instruments = await db.select().from(schema.instruments);
  res.json({
    watchlist: lists[0],
    items: items.map((item) => ({
      ...item,
      instrument: instruments.find((i) => i.id === item.instrumentId),
      signal: signals.find((s) => s.instrumentId === item.instrumentId),
    })),
  });
});

apiRouter.post('/watchlist/items', async (req, res) => {
  const db = getDb(appConfig.databasePath);
  const { instrumentId, symbol, market } = req.body as { instrumentId?: string; symbol?: string; market?: string };
  let id = instrumentId;
  if (!id && symbol && market) {
    const existing = await db.select().from(schema.instruments)
      .where(and(eq(schema.instruments.symbol, symbol), eq(schema.instruments.market, market))).limit(1);
    if (existing[0]) id = existing[0].id;
    else {
      id = uuid();
      await db.insert(schema.instruments).values({
        id,
        symbol,
        name: symbol,
        market,
        currency: market === 'Stocks' && symbol.length < 6 ? 'INR' : 'USD',
        active: true,
        createdAt: new Date().toISOString(),
      });
    }
  }
  const lists = await db.select().from(schema.watchlists).where(eq(schema.watchlists.isDefault, true));
  if (!lists[0] || !id) return res.status(400).json({ error: 'Invalid request' });
  await db.insert(schema.watchlistItems).values({
    id: uuid(),
    watchlistId: lists[0].id,
    instrumentId: id,
    sortOrder: 0,
    addedAt: new Date().toISOString(),
  }).onConflictDoNothing();
  res.json({ ok: true, instrumentId: id });
});

apiRouter.delete('/watchlist/items/:instrumentId', async (req, res) => {
  const db = getDb(appConfig.databasePath);
  const lists = await db.select().from(schema.watchlists).where(eq(schema.watchlists.isDefault, true));
  if (!lists[0]) return res.status(404).json({ error: 'No watchlist' });
  await db.delete(schema.watchlistItems).where(and(
    eq(schema.watchlistItems.watchlistId, lists[0].id),
    eq(schema.watchlistItems.instrumentId, req.params.instrumentId),
  ));
  res.json({ ok: true });
});

apiRouter.get('/credentials', async (_req, res) => {
  const db = getDb(appConfig.databasePath);
  const creds = await db.select().from(schema.apiCredentials);
  res.json(creds.map((c) => ({
    id: c.id,
    providerId: c.providerId,
    label: c.label,
    keyHint: c.keyHint,
    enabled: c.enabled,
    status: c.status,
    pipelines: JSON.parse(c.assignedPipelinesJson || '[]'),
    lastUsedAt: c.lastUsedAt,
    headroom: keyPool.remainingHeadroom(c.id, c.providerId),
  })));
});

apiRouter.get('/credentials/providers', (_req, res) => {
  res.json(PROVIDER_REGISTRY.map((p) => ({
    id: p.id,
    name: p.name,
    requiresKey: p.requiresKey,
    signupUrl: p.signupUrl,
    limits: p.limits,
    pipelines: p.pipelines,
    enabled: p.enabled,
  })));
});

apiRouter.post('/credentials', async (req, res) => {
  const db = getDb(appConfig.databasePath);
  const { providerId, label, apiKey, apiSecret, pipelines } = req.body as {
    providerId: string; label: string; apiKey: string; apiSecret?: string; pipelines: PipelineId[];
  };
  const provider = PROVIDER_REGISTRY.find((p) => p.id === providerId);
  if (!provider) return res.status(400).json({ error: 'Unknown provider' });
  const lease = { credentialId: '', providerId, apiKey, apiSecret };
  if (provider.testKey) {
    const ok = await provider.testKey(lease);
    if (!ok) return res.status(400).json({ error: 'Key validation failed' });
  }
  const id = uuid();
  const now = new Date().toISOString();
  await db.insert(schema.apiCredentials).values({
    id,
    providerId,
    label,
    encryptedKey: encrypt(apiKey),
    encryptedSecret: apiSecret ? encrypt(apiSecret) : null,
    keyHint: keyHint(apiKey),
    enabled: true,
    status: 'active',
    assignedPipelinesJson: JSON.stringify(pipelines || provider.pipelines),
    lastValidatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  res.json({ id, keyHint: keyHint(apiKey) });
});

apiRouter.delete('/credentials/:id', async (req, res) => {
  const db = getDb(appConfig.databasePath);
  await db.delete(schema.apiCredentials).where(eq(schema.apiCredentials.id, req.params.id));
  res.json({ ok: true });
});

apiRouter.get('/timeseries/catalog', async (_req, res) => {
  res.json(await timeSeriesReader.getDatasetCatalog());
});

apiRouter.get('/timeseries/bars', async (req, res) => {
  const instrumentId = req.query.instrumentId as string;
  if (!instrumentId) return res.status(400).json({ error: 'instrumentId required' });
  res.json(await timeSeriesReader.getBars(instrumentId, {
    from: req.query.from as string,
    to: req.query.to as string,
    resolution: req.query.resolution as string,
  }));
});

apiRouter.get('/timeseries/export', async (req, res) => {
  const instrumentId = req.query.instrumentId as string;
  const format = (req.query.format as string) || 'json';
  const bars = await timeSeriesReader.getBars(instrumentId, { resolution: '1d' });
  if (format === 'csv') {
    const csv = ['ts,open,high,low,close,volume', ...bars.map((b) =>
      `${b.ts},${b.open},${b.high},${b.low},${b.close},${b.volume}`)].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    return res.send(csv);
  }
  res.json(bars);
});

apiRouter.get('/news/top-stocks', async (req, res) => {
  const limit = Math.min(50, parseInt(String(req.query.limit || '30'), 10) || 30);
  const { getLatestTopStocks, aggregateTopStocks } = await import('../collectors/news/topStocks.js');
  let stocks = await getLatestTopStocks(limit);
  if (stocks.length < 5) {
    stocks = await aggregateTopStocks(limit);
  }
  res.json({ items: stocks });
});

apiRouter.get('/news/feed', async (req, res) => {
  const limit = Math.min(50, parseInt(String(req.query.limit || '30'), 10) || 30);
  const feed = await timeSeriesReader.getMarketFeed(limit);
  const [bullish, bearish] = await Promise.all([
    rankTrendingStocks({ direction: 'positive', limit: 15 }),
    rankTrendingStocks({ direction: 'negative', limit: 15 }),
  ]);
  res.json({ ...feed, bullish, bearish });
});

apiRouter.get('/sentiment/trending/:symbol', async (req, res) => {
  const symbol = req.params.symbol.replace(/\.(NS|US)$/i, '');
  res.json(await classifyTrend(symbol));
});

apiRouter.get('/sentiment/trending', async (req, res) => {
  const direction = req.query.direction as 'positive' | 'negative' | undefined;
  const market = req.query.market as string | undefined;
  const limit = Math.min(50, parseInt(String(req.query.limit || '20'), 10) || 20);
  const items = await rankTrendingStocks({ direction, market, limit });
  res.json({ direction: direction || 'all', items });
});

apiRouter.get('/news/:symbol', async (req, res) => {
  const symbol = req.params.symbol.replace(/\.(NS|US)$/i, '');
  const limit = Math.min(50, parseInt(String(req.query.limit || '20'), 10) || 20);
  const events = await timeSeriesReader.getSymbolNews(symbol, {
    from: req.query.from as string,
    to: req.query.to as string,
    eventType: req.query.eventType as string,
    limit,
  });
  res.json(events);
});

apiRouter.post('/news/:symbol/scrape', async (req, res) => {
  const symbol = req.params.symbol.replace(/\.(NS|US)$/i, '');
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const { scrapeSymbolNews } = await import('../collectors/news/symbolNews.js');
  const result = await scrapeSymbolNews(symbol);
  res.json(result);
});

apiRouter.get('/sentiment/:symbol', async (req, res) => {
  const symbol = req.params.symbol.replace(/\.(NS|US)$/i, '');
  const metrics = await timeSeriesReader.getLatestMetrics(symbol);
  const composite = metrics.find((m) => m.metricKey === 'sentiment_composite');
  const trend = metrics.find((m) => m.metricKey === 'sentiment_trend');
  const delta = metrics.find((m) => m.metricKey === 'sentiment_delta_24h');
  const confidence = metrics.find((m) => m.metricKey === 'trend_confidence');
  res.json({
    symbol,
    composite: composite?.value ?? null,
    sentimentTrend: trend?.value ?? null,
    delta24h: delta?.value ?? null,
    trendConfidence: confidence?.value ?? null,
    metrics: metrics.map((m) => ({
      key: m.metricKey,
      value: m.value,
      ts: m.ts,
      source: m.source,
    })),
  });
});

apiRouter.get('/timeseries/events', async (req, res) => {
  const entityId = req.query.entityId as string;
  if (!entityId) return res.status(400).json({ error: 'entityId required' });
  const events = await timeSeriesReader.getEvents(entityId, {
    from: req.query.from as string,
    to: req.query.to as string,
    eventType: req.query.eventType as string,
    limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
  });
  res.json(events);
});

apiRouter.post('/refresh', async (req, res) => {
  const tier = (req.query.tier as 'fast' | 'medium' | 'daily') || 'fast';
  const result = await refreshService.runCycle(tier);
  res.json(result);
});

apiRouter.get('/cycles/latest', async (_req, res) => {
  const db = getDb(appConfig.databasePath);
  const cycles = await db.select().from(schema.refreshCycles).orderBy(desc(schema.refreshCycles.startedAt)).limit(1);
  res.json(cycles[0] || null);
});

apiRouter.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onProgress = (data: unknown) => res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);
  const onComplete = (data: unknown) => res.write(`event: cycle_complete\ndata: ${JSON.stringify(data)}\n\n`);

  refreshEvents.on('progress', onProgress);
  refreshEvents.on('cycle_complete', onComplete);

  req.on('close', () => {
    refreshEvents.off('progress', onProgress);
    refreshEvents.off('cycle_complete', onComplete);
  });
});

apiRouter.get('/live/status', (_req, res) => {
  res.json({ connected: true, adapters: ['binance'] });
});

apiRouter.get('/providers/health', (_req, res) => {
  res.json(PROVIDER_REGISTRY.map((p) => ({
    id: p.id,
    name: p.name,
    healthy: p.enabled,
    requiresKey: p.requiresKey,
  })));
});
