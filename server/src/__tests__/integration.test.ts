import { describe, it, expect } from '@jest/globals';
import { buildSignal, computeIndicators, createQueue } from '@signal-terminal/shared';
import { keyPool } from '../credentials/keyPool.js';
import { PROVIDER_REGISTRY } from '../providers/registry.js';
import '../providers/adapters.js';

describe('integration', () => {
  it('has providers registered', () => {
    expect(PROVIDER_REGISTRY.length).toBeGreaterThan(3);
    expect(PROVIDER_REGISTRY.find((p) => p.id === 'binance')).toBeTruthy();
    expect(PROVIDER_REGISTRY.find((p) => p.id === 'yahoo')).toBeTruthy();
  });

  it('signal engine matches prototype shape', () => {
    const closes = Array.from({ length: 220 }, (_, i) => 100 + Math.sin(i / 10) * 5);
    const ind = computeIndicators(closes, Array(220).fill(1000));
    const sig = buildSignal(ind);
    expect(sig.label).toBeTruthy();
    expect(sig.confidence).toBeGreaterThan(0);
  });

  it('createQueue limits concurrency', async () => {
    const q = createQueue(2);
    let concurrent = 0;
    let max = 0;
    const job = async () => {
      concurrent++;
      max = Math.max(max, concurrent);
      await new Promise((r) => setTimeout(r, 50));
      concurrent--;
    };
    await Promise.all([q(job), q(job), q(job), q(job)]);
    expect(max).toBeLessThanOrEqual(2);
  });

  it('all providers are free tier', () => {
    for (const p of PROVIDER_REGISTRY) {
      expect(p.tier).toBe('free');
    }
  });
});
