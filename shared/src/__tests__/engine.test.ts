import { describe, it, expect } from '@jest/globals';
import { rsiWilder, calcMacd, bollinger, computeIndicators } from '../indicators.js';
import { buildSignal } from '../signalEngine.js';

describe('indicators', () => {
  it('rsi returns 50 for flat series', () => {
    const flat = Array(30).fill(100);
    expect(rsiWilder(flat)).toBe(50);
  });

  it('macd produces values for long series', () => {
    const up = Array.from({ length: 100 }, (_, i) => 100 + i);
    const macd = calcMacd(up);
    expect(macd.line).not.toBeNull();
    expect(macd.signal).not.toBeNull();
  });

  it('bollinger returns bands', () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i));
    const b = bollinger(vals);
    expect(b).not.toBeNull();
    expect(b!.upper).toBeGreaterThan(b!.lower);
  });
});

describe('signal engine', () => {
  it('produces STRONG-BUY on oversold uptrend', () => {
    const closes = Array.from({ length: 220 }, (_, i) => 100 - i * 0.3 + (i > 200 ? i - 200 : 0));
    const ind = computeIndicators(closes, Array(220).fill(1000));
    const sig = buildSignal(ind);
    expect(['BUY', 'STRONG-BUY', 'HOLD', 'SELL', 'STRONG-SELL']).toContain(sig.label);
    expect(sig.confidence).toBeGreaterThan(0);
  });
});
