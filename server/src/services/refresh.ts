import { v4 as uuid } from 'uuid';
import { eq, desc } from 'drizzle-orm';
import type { SignalRow } from '@signal-terminal/shared';
import { createQueue, sleep, CRYPTO_SYMBOLS, STOCK_SYMBOLS, FOREX_TARGETS } from '@signal-terminal/shared';
import { appConfig } from '../config.js';
import { getDb, schema } from '../db/index.js';

function dbPath() {
  return process.env.DATABASE_PATH || appConfig.databasePath;
}
import { resilienceService } from './resilience.js';
import { EventEmitter } from 'events';

export const refreshEvents = new EventEmitter();

const limitedFetch = createQueue(4);

function pipelineForMarket(market: string): 'prices-crypto' | 'prices-stocks' | 'prices-forex' | 'prices-commodities' | 'prices-mutual-funds' {
  if (market === 'Crypto') return 'prices-crypto';
  if (market === 'Forex') return 'prices-forex';
  if (market === 'Commodities') return 'prices-commodities';
  if (market === 'MutualFunds') return 'prices-mutual-funds';
  return 'prices-stocks';
}

export class RefreshService {
  private running = false;

  async runCycle(tier: 'fast' | 'medium' | 'daily' = 'fast') {
    if (this.running) return { skipped: true };
    this.running = true;
    const cycleId = uuid();
    const startedAt = new Date().toISOString();
    const db = getDb(dbPath());

    await db.insert(schema.refreshCycles).values({
      id: cycleId,
      tier,
      startedAt,
      status: 'running',
    });

    const results: SignalRow[] = [];
    const errors = { crypto: 0, stocks: 0, forex: 0, other: 0 };
    let loaded = 0;

    try {
      const watchlistIds = await this.getWatchlistInstrumentIds();
      let instruments = await db.select().from(schema.instruments).where(eq(schema.instruments.active, true));

      instruments.sort((a, b) => {
        const aw = watchlistIds.has(a.id) ? 0 : 1;
        const bw = watchlistIds.has(b.id) ? 0 : 1;
        return aw - bw;
      });

      const total = instruments.length;
      const jobs = instruments.map((inst, i) => limitedFetch(async () => {
        await sleep(i * 100);
        try {
          const pipeline = pipelineForMarket(inst.market);
          const fetchSymbol = inst.market === 'Crypto'
            ? inst.symbol.replace('/', '') + 'USDT'
            : inst.market === 'Stocks' && inst.exchange === 'NSE'
              ? inst.symbol
              : inst.symbol;
          const { row, providerId } = await resilienceService.fetchWithFallback(
            inst.id, inst.symbol, inst.market as SignalRow['market'], pipeline, inst.currency,
          );
          await db.insert(schema.signals).values({
            id: uuid(),
            instrumentId: inst.id,
            cycleId,
            computedAt: new Date().toISOString(),
            price: row.price,
            changePct: row.changePct,
            signal: row.signal,
            confidence: row.confidence,
            rsi: row.rsi,
            volMult: row.volMult,
            sl: row.sl,
            tp: row.tp,
            rr: row.rr,
            rrNum: row.rrNum,
            note: row.note,
            error: row.error,
            errorMessage: row.error ? row.note : null,
            stale: row.stale ?? false,
            staleSince: row.staleSince ?? null,
            sourceProvider: providerId ?? null,
          });
          results.push(row);
          if (row.error) {
            if (inst.market === 'Crypto') errors.crypto++;
            else if (inst.market === 'Stocks') errors.stocks++;
            else if (inst.market === 'Forex') errors.forex++;
            else errors.other++;
          }
        } catch (e) {
          const errRow = {
            symbol: inst.symbol,
            market: inst.market as SignalRow['market'],
            currency: inst.currency,
            price: null,
            changePct: null,
            signal: '—' as const,
            confidence: null,
            rsi: null,
            volMult: null,
            sl: null,
            tp: null,
            rr: null,
            rrNum: null,
            note: (e as Error).message,
            error: true,
          };
          results.push(errRow);
        }
        loaded++;
        refreshEvents.emit('progress', { loaded, total, tier });
      }));

      await Promise.all(jobs);

      const completedAt = new Date().toISOString();
      await db.update(schema.refreshCycles).set({
        completedAt,
        status: 'completed',
        errorsJson: JSON.stringify(errors),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      }).where(eq(schema.refreshCycles.id, cycleId));

      refreshEvents.emit('cycle_complete', { cycleId, results, errors, tier });
      return { cycleId, results, errors };
    } finally {
      this.running = false;
    }
  }

  private async getWatchlistInstrumentIds(): Promise<Set<string>> {
    const db = getDb(dbPath());
    const lists = await db.select().from(schema.watchlists).where(eq(schema.watchlists.isDefault, true));
    if (!lists[0]) return new Set();
    const items = await db.select().from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.watchlistId, lists[0].id));
    return new Set(items.map((i) => i.instrumentId));
  }

  async getLatestSignals(): Promise<SignalRow[]> {
    const db = getDb(dbPath());
    const instruments = await db.select().from(schema.instruments).where(eq(schema.instruments.active, true));
    const rows: SignalRow[] = [];

    for (const inst of instruments) {
      const sigs = await db.select().from(schema.signals)
        .where(eq(schema.signals.instrumentId, inst.id))
        .orderBy(desc(schema.signals.computedAt))
        .limit(1);
      const s = sigs[sigs.length - 1];
      if (s) {
        rows.push({
          symbol: inst.symbol,
          market: inst.market as SignalRow['market'],
          currency: inst.currency,
          instrumentId: inst.id,
          price: s.price,
          changePct: s.changePct,
          signal: s.signal as SignalRow['signal'],
          confidence: s.confidence,
          rsi: s.rsi,
          volMult: s.volMult,
          sl: s.sl,
          tp: s.tp,
          rr: s.rr,
          rrNum: s.rrNum,
          note: s.note || '',
          error: s.error ?? false,
          stale: s.stale ?? false,
          staleSince: s.staleSince,
        });
      }
    }
    return rows;
  }
}

export const refreshService = new RefreshService();
