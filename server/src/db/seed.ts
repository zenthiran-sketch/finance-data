import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { getDefaultInstrumentSeeds } from '@signal-terminal/shared';
import { appConfig } from '../config.js';
import { getDb, schema } from './index.js';
import { runMigrations } from './migrations.js';
import { PROVIDER_REGISTRY } from '../providers/registry.js';
import '../providers/adapters.js';

export async function seed() {
  getDb(appConfig.databasePath);
  runMigrations();
  const db = getDb(appConfig.databasePath);
  const now = new Date().toISOString();

  for (const p of PROVIDER_REGISTRY) {
    try {
      await db.insert(schema.providers).values({
        id: p.id,
        name: p.name,
        tier: 'free',
        requiresKey: p.requiresKey,
        signupUrl: p.signupUrl ?? null,
        freeLimitsJson: JSON.stringify(p.limits),
        healthy: true,
      });
    } catch { /* exists */ }
  }

  const existingInstruments = await db.select().from(schema.instruments);
  const existingSymbols = new Set(existingInstruments.map((i) => `${i.market}:${i.symbol}`));

  const seeds = getDefaultInstrumentSeeds();
  for (const s of seeds) {
    const key = `${s.market}:${s.symbol}`;
    if (existingSymbols.has(key)) continue;
    await db.insert(schema.instruments).values({
      id: uuid(),
      symbol: s.symbol,
      name: s.name,
      market: s.market,
      currency: s.currency,
      exchange: s.exchange ?? null,
      active: true,
      inDefaultSeed: s.inDefaultSeed ?? false,
      createdAt: now,
    });
  }

  let watchlists = await db.select().from(schema.watchlists).where(eq(schema.watchlists.isDefault, true));
  let watchlistId = watchlists[0]?.id;
  if (!watchlistId) {
    watchlistId = uuid();
    await db.insert(schema.watchlists).values({
      id: watchlistId,
      name: 'My Watchlist',
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  const defaultInstruments = await db.select().from(schema.instruments)
    .where(eq(schema.instruments.inDefaultSeed, true));

  const existingItems = await db.select().from(schema.watchlistItems)
    .where(eq(schema.watchlistItems.watchlistId, watchlistId));
  const existingItemIds = new Set(existingItems.map((i) => i.instrumentId));

  for (let i = 0; i < defaultInstruments.length; i++) {
    if (existingItemIds.has(defaultInstruments[i].id)) continue;
    await db.insert(schema.watchlistItems).values({
      id: uuid(),
      watchlistId,
      instrumentId: defaultInstruments[i].id,
      sortOrder: i,
      addedAt: now,
    });
  }

  const macroSeries = [
    { id: 'macro-cpi', provider: 'fred', providerSeriesId: 'CPIAUCSL', name: 'CPI', country: 'US', unit: 'index', frequency: 'monthly' },
    { id: 'macro-fed', provider: 'fred', providerSeriesId: 'FEDFUNDS', name: 'Fed Funds Rate', country: 'US', unit: '%', frequency: 'monthly' },
  ];
  for (const m of macroSeries) {
    try {
      await db.insert(schema.macroSeries).values({ ...m, createdAt: now });
    } catch { /* exists */ }
  }

  console.log(`Seeded ${seeds.length} instruments, watchlist, providers`);
}

if (process.argv[1]?.includes('seed')) {
  seed().catch(console.error);
}
