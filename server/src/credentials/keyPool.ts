import type { PipelineId } from '@signal-terminal/shared';
import { eq, and } from 'drizzle-orm';
import { appConfig } from '../config.js';
import { getDb, getSqlite, schema } from '../db/index.js';
import { decrypt } from './encryption.js';
import { PROVIDER_REGISTRY } from '../providers/registry.js';

export interface KeyLease {
  credentialId: string;
  providerId: string;
  apiKey: string;
  apiSecret?: string;
}

type QuotaWindow = 'minute' | 'day' | 'month';

function dbPath() {
  return process.env.DATABASE_PATH || appConfig.databasePath;
}

function windowStart(window: QuotaWindow): string {
  const now = new Date();
  if (window === 'minute') return now.toISOString().slice(0, 16);
  if (window === 'day') return now.toISOString().slice(0, 10);
  return now.toISOString().slice(0, 7);
}

export class KeyPool {
  async acquire(providerId: string, pipelineId: PipelineId): Promise<KeyLease | null> {
    const db = getDb(dbPath());
    const creds = await db.select().from(schema.apiCredentials)
      .where(eq(schema.apiCredentials.providerId, providerId));

    const eligible = creds.filter((c) => {
      if (!c.enabled || c.status === 'invalid' || c.status === 'disabled') return false;
      const pipelines: string[] = JSON.parse(c.assignedPipelinesJson || '[]');
      if (pipelines.length > 0 && !pipelines.includes(pipelineId)) return false;
      if (c.status === 'rate_limited') {
        const lastUsed = c.lastUsedAt ? new Date(c.lastUsedAt).getTime() : 0;
        if (Date.now() - lastUsed < 60_000) return false;
      }
      return this.remainingHeadroom(c.id, providerId) > 0;
    });

    if (eligible.length === 0) return null;

    eligible.sort((a, b) => {
      const headroomA = this.remainingHeadroom(a.id, providerId);
      const headroomB = this.remainingHeadroom(b.id, providerId);
      if (headroomB !== headroomA) return headroomB - headroomA;
      const la = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const lb = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      return la - lb;
    });

    const pick = eligible[0];
    return {
      credentialId: pick.id,
      providerId,
      apiKey: decrypt(pick.encryptedKey),
      apiSecret: pick.encryptedSecret ? decrypt(pick.encryptedSecret) : undefined,
    };
  }

  private getLimits(providerId: string) {
    return PROVIDER_REGISTRY.find((p) => p.id === providerId)?.limits || {};
  }

  remainingHeadroom(credentialId: string, providerId: string): number {
    const limits = this.getLimits(providerId);
    getDb(dbPath());
    const sqlite = getSqlite();
    const getCount = (window: QuotaWindow, limit?: number) => {
      if (!limit) return Infinity;
      const ws = windowStart(window);
      const row = sqlite.prepare(
        'SELECT count FROM credential_quota WHERE credential_id = ? AND window = ? AND window_start = ?'
      ).get(credentialId, window, ws) as { count: number } | undefined;
      return limit - (row?.count ?? 0);
    };
    return Math.min(
      getCount('minute', limits.perMinute),
      getCount('day', limits.perDay),
      getCount('month', limits.perMonth),
    );
  }

  async release(lease: KeyLease, result: 'success' | 'rate_limited' | 'invalid' | 'error') {
    const db = getDb(dbPath());
    const now = new Date().toISOString();

    if (result === 'rate_limited') {
      await db.update(schema.apiCredentials)
        .set({ status: 'rate_limited', lastUsedAt: now, lastError: 'Rate limited' })
        .where(eq(schema.apiCredentials.id, lease.credentialId));
    } else if (result === 'invalid') {
      await db.update(schema.apiCredentials)
        .set({ status: 'invalid', lastUsedAt: now, lastError: 'Invalid key' })
        .where(eq(schema.apiCredentials.id, lease.credentialId));
    } else if (result === 'success') {
      await db.update(schema.apiCredentials)
        .set({ status: 'active', lastUsedAt: now, lastError: null })
        .where(eq(schema.apiCredentials.id, lease.credentialId));
      await this.bumpQuota(lease.credentialId, lease.providerId);
    }
  }

  private async bumpQuota(credentialId: string, providerId: string) {
    const limits = this.getLimits(providerId);
    const db = getDb(dbPath());
    for (const [window, limit] of Object.entries({ minute: limits.perMinute, day: limits.perDay, month: limits.perMonth })) {
      if (!limit) continue;
      const ws = windowStart(window as QuotaWindow);
      const existing = await db.select().from(schema.credentialQuota)
        .where(and(
          eq(schema.credentialQuota.credentialId, credentialId),
          eq(schema.credentialQuota.window, window),
          eq(schema.credentialQuota.windowStart, ws),
        ));
      if (existing[0]) {
        await db.update(schema.credentialQuota)
          .set({ count: existing[0].count + 1 })
          .where(eq(schema.credentialQuota.id, existing[0].id));
      } else {
        await db.insert(schema.credentialQuota).values({
          credentialId,
          window,
          windowStart: ws,
          count: 1,
        });
      }
    }
  }
}

export const keyPool = new KeyPool();
