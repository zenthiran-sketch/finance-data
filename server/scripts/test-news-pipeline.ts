/**
 * One-off news pipeline smoke test — run: npx tsx scripts/test-news-pipeline.ts
 */
import { initDb } from '../src/db/init.js';
import { seed } from '../src/db/seed.js';
import { getDb, schema } from '../src/db/index.js';
import { appConfig } from '../src/config.js';
import { sql, desc } from 'drizzle-orm';
import { runNewsFast, runSentimentMedium, runNewsKeyed } from '../src/collectors/news/index.js';
import { rankTrendingStocks } from '../src/services/sentimentTrend.js';

async function probeUrl(label: string, url: string, opts?: RequestInit) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...opts, headers: { 'User-Agent': 'SignalTerminal/1.0', ...opts?.headers } });
    const ms = Date.now() - t0;
    let sample = '';
    if (res.ok) {
      const text = await res.text();
      sample = text.slice(0, 120).replace(/\s+/g, ' ');
    }
    return { label, ok: res.ok, status: res.status, ms, sample };
  } catch (e) {
    return { label, ok: false, status: 0, ms: Date.now() - t0, sample: (e as Error).message };
  }
}

async function main() {
  console.log('=== News Pipeline Test ===\n');

  console.log('--- External source probes ---');
  const probes = await Promise.all([
    probeUrl('GDELT GAL RSS', 'http://data.gdeltproject.org/gdeltv3/gal/feed.rss'),
    probeUrl('CNN Business RSS', 'http://rss.cnn.com/rss/money_latest.rss'),
    probeUrl('Yahoo Finance RSS', 'https://finance.yahoo.com/news/rssindex'),
    probeUrl('Bloomberg RSS', 'https://feeds.bloomberg.com/markets/news.rss'),
    probeUrl('Tradestie WSB', 'https://api.tradestie.com/v1/apps/reddit'),
    probeUrl('ApeWisdom', 'https://apewisdom.io/api/v1.0/filter/all-stocks'),
  ]);
  for (const p of probes) {
    console.log(`${p.ok ? 'OK' : 'FAIL'} [${p.status}] ${p.label} (${p.ms}ms)`);
    if (p.sample) console.log(`     ${p.sample}…`);
  }

  initDb();
  await seed();

  const db = getDb(appConfig.databasePath);
  const before = await db.select({ count: sql<number>`count(*)` }).from(schema.tsEvents);
  console.log(`\n--- DB before collectors: ${before[0]?.count ?? 0} events ---`);

  console.log('\n--- Running runNewsFast (GDELT + RSS) ---');
  const fast = await runNewsFast();
  console.log(JSON.stringify(fast));

  console.log('\n--- Running runSentimentMedium (WSB + ApeWisdom + Xoomar + Reddit) ---');
  const medium = await runSentimentMedium();
  console.log(JSON.stringify(medium));

  console.log('\n--- Running runNewsKeyed (Finnhub + StockData + Adanos) ---');
  const keyed = await runNewsKeyed();
  console.log(JSON.stringify(keyed));

  const after = await db.select({ count: sql<number>`count(*)` }).from(schema.tsEvents);
  const added = (after[0]?.count ?? 0) - (before[0]?.count ?? 0);
  console.log(`\n--- DB after collectors: ${after[0]?.count ?? 0} events (+${added}) ---`);

  const recent = await db.select().from(schema.tsEvents).orderBy(desc(schema.tsEvents.ts)).limit(8);
  console.log('\n--- Sample headlines (latest 8) ---');
  for (const e of recent) {
    console.log(`[${e.source}] ${e.entityId} | ${e.ts.slice(0, 16)} | ${(e.title || '').slice(0, 80)}`);
  }

  const bySource = await db.select({
    source: schema.tsEvents.source,
    count: sql<number>`count(*)`,
  }).from(schema.tsEvents).groupBy(schema.tsEvents.source);
  console.log('\n--- Events by source ---');
  for (const row of bySource) console.log(`  ${row.source}: ${row.count}`);

  const bullish = await rankTrendingStocks({ direction: 'positive', limit: 5 });
  const bearish = await rankTrendingStocks({ direction: 'negative', limit: 5 });
  console.log('\n--- Trending bullish ---', bullish.map((t) => `${t.symbol}(${t.confidence.toFixed(2)})`).join(', ') || 'none');
  console.log('--- Trending bearish ---', bearish.map((t) => `${t.symbol}(${t.confidence.toFixed(2)})`).join(', ') || 'none');

  console.log('\n=== Done ===');
}

main().catch((e) => { console.error(e); process.exit(1); });
