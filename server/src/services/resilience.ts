import { eq, desc } from 'drizzle-orm';
import type { SignalRow, Market, PipelineId } from '@signal-terminal/shared';
import { computeIndicators, buildSignal, toRow, toErrorRow } from '@signal-terminal/shared';
import { appConfig } from '../config.js';
import { getDb, schema } from '../db/index.js';

function dbPath() {
  return process.env.DATABASE_PATH || appConfig.databasePath;
}
import { getProviderChain } from '../providers/registry.js';
import { keyPool } from '../credentials/keyPool.js';
import { timeSeriesWriter } from '../timeseries/index.js';
import '../providers/adapters.js';

export type HealthStatus = 'live' | 'degraded' | 'partial';

export class ResilienceService {
  getQuotaHeadroom(): number {
    return 0.8; // simplified; KeyPool tracks per-key
  }

  async fetchWithFallback(
    instrumentId: string,
    symbol: string,
    market: Market,
    pipelineId: PipelineId,
    currency: string,
  ): Promise<{ row: SignalRow; providerId?: string }> {
    const chain = getProviderChain('candles', market);
    const errors: string[] = [];

    for (const provider of chain) {
      let lease = null;
      if (provider.requiresKey) {
        lease = await keyPool.acquire(provider.id, pipelineId);
        if (!lease) {
          errors.push(`${provider.id}: no key`);
          continue;
        }
      }
      try {
        const { candles, requestUrl } = await provider.fetchCandles!(symbol, market, lease);
        const start = Date.now();
        for (const c of candles) {
          await timeSeriesWriter.ingest({
            dataset: 'bar',
            entityType: 'instrument',
            entityId: instrumentId,
            ts: c.date || new Date().toISOString().slice(0, 10),
            source: provider.id,
            providerId: provider.id,
            credentialId: lease?.credentialId,
            pipelineId,
            requestUrl,
            httpStatus: 200,
            durationMs: Date.now() - start,
            raw: c,
            normalized: { ...c, resolution: '1d' },
          });
        }
        if (lease) await keyPool.release(lease, 'success');
        const closes = candles.map((c) => c.close);
        const volumes = candles.map((c) => c.volume);
        const ind = computeIndicators(closes, volumes);
        const sig = buildSignal(ind);
        const row = toRow(symbol, market, currency, ind, sig, instrumentId);
        return { row, providerId: provider.id };
      } catch (e) {
        const err = e as Error & { status?: number };
        if (lease) {
          if (err.status === 429) await keyPool.release(lease, 'rate_limited');
          else if (err.status === 401) await keyPool.release(lease, 'invalid');
          else await keyPool.release(lease, 'error');
        }
        errors.push(`${provider.id}: ${err.message}`);
      }
    }

    const stale = await this.serveStale(instrumentId, symbol, market, currency);
    if (stale) return { row: stale };
    return { row: toErrorRow(symbol, market, currency, errors.join(' · ')) };
  }

  async serveStale(
    instrumentId: string,
    symbol: string,
    market: Market,
    currency: string,
  ): Promise<SignalRow | null> {
    const db = getDb(dbPath());
    const last = await db.select().from(schema.signals)
      .where(eq(schema.signals.instrumentId, instrumentId))
      .orderBy(desc(schema.signals.computedAt))
      .limit(1);
    if (!last[0] || last[0].error) return null;
    const s = last[0];
    return {
      symbol,
      market,
      currency,
      instrumentId,
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
      note: s.note || 'Stale data',
      error: false,
      stale: true,
      staleSince: s.computedAt,
    };
  }

  getSystemHealth(rows: SignalRow[]): { status: HealthStatus; stale: number; errors: number } {
    const stale = rows.filter((r) => r.stale).length;
    const errors = rows.filter((r) => r.error).length;
    if (errors > 0 && errors === rows.length) return { status: 'partial', stale, errors };
    if (stale > 0 || errors > 0) return { status: 'degraded', stale, errors };
    return { status: 'live', stale, errors };
  }
}

export const resilienceService = new ResilienceService();
