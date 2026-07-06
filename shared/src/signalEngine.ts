import type { IndicatorSet, SignalLabel, SignalResult, SignalRow } from './types.js';

export function buildSignal(ind: IndicatorSet): SignalResult {
  let pts = 0;
  const reasons: string[] = [];

  if (ind.rsi != null) {
    if (ind.rsi < 25) { pts += 2.5; reasons.push(`RSI ${ind.rsi.toFixed(0)} oversold`); }
    else if (ind.rsi < 35) { pts += 1.4; reasons.push(`RSI ${ind.rsi.toFixed(0)} soft`); }
    else if (ind.rsi > 75) { pts -= 2.5; reasons.push(`RSI ${ind.rsi.toFixed(0)} overbought`); }
    else if (ind.rsi > 65) { pts -= 1.4; reasons.push(`RSI ${ind.rsi.toFixed(0)} hot`); }
  }

  if (ind.macd.line != null && ind.macd.signal != null) {
    const haveCrossData = ind.macd.prevLine != null && ind.macd.prevSignal != null;
    const bullCross = haveCrossData && ind.macd.line > ind.macd.signal && ind.macd.prevLine! <= ind.macd.prevSignal!;
    const bearCross = haveCrossData && ind.macd.line < ind.macd.signal && ind.macd.prevLine! >= ind.macd.prevSignal!;
    if (bullCross) { pts += 2.5; reasons.push('MACD bull cross'); }
    else if (ind.macd.line > ind.macd.signal) { pts += 1; reasons.push('MACD positive'); }
    if (bearCross) { pts -= 2.5; reasons.push('MACD bear cross'); }
    else if (ind.macd.line < ind.macd.signal) { pts -= 1; reasons.push('MACD negative'); }
  }

  if (ind.boll) {
    const { mid, upper, lower } = ind.boll;
    if (ind.price <= lower * 1.005) { pts += 2; reasons.push('At lower band'); }
    else if (ind.price <= mid - (mid - lower) * 0.5) { pts += 0.8; }
    if (ind.price >= upper * 0.995) { pts -= 2; reasons.push('At upper band'); }
    else if (ind.price >= mid + (upper - mid) * 0.5) { pts -= 0.8; }
  }

  if (ind.smaFast != null && ind.smaSlow != null) {
    if (ind.smaFast > ind.smaSlow) { pts += 0.5; reasons.push('Trend up (50>200d)'); }
    else { pts -= 0.5; reasons.push('Trend down (50<200d)'); }
  }

  let volFactor = 1;
  if (ind.volMult != null) {
    if (ind.volMult > 1.8) { volFactor = 1.15; reasons.push(`Vol ×${ind.volMult.toFixed(1)}`); }
    else if (ind.volMult < 0.6) { volFactor = 0.85; }
  }

  const total = Math.max(-8, Math.min(8, pts * volFactor));

  let label: SignalLabel;
  if (total >= 4.5) label = 'STRONG-BUY';
  else if (total >= 1.5) label = 'BUY';
  else if (total > -1.5) label = 'HOLD';
  else if (total > -4.5) label = 'SELL';
  else label = 'STRONG-SELL';

  const confidence = Math.round(Math.max(3, Math.min(97, 50 + total * 6)));

  let sl: number | null = null;
  let tp: number | null = null;
  let rr: string | null = null;
  let rrNum: number | null = null;
  if (label !== 'HOLD' && ind.sd14 != null) {
    const risk = Math.max(ind.sd14 * 1.2, ind.price * 0.003);
    rrNum = Math.max(1.2, Math.min(2.8, 1.8 + ((confidence - 50) / 50) * 0.8));
    if (label === 'BUY' || label === 'STRONG-BUY') {
      sl = ind.price - risk;
      tp = ind.price + risk * rrNum;
    } else {
      sl = ind.price + risk;
      tp = ind.price - risk * rrNum;
    }
    rr = `1:${rrNum.toFixed(1)}`;
  }

  if (reasons.length === 0) reasons.push('No strong confluence — indicators mixed/neutral');

  return { label, confidence, reasons, sl, tp, rr, rrNum };
}

export function toRow(
  symbol: string,
  market: SignalRow['market'],
  currency: string,
  ind: IndicatorSet,
  sig: SignalResult,
  instrumentId?: string
): SignalRow {
  return {
    symbol,
    market,
    currency,
    instrumentId,
    price: ind.price,
    changePct: ind.changePct,
    signal: sig.label,
    confidence: sig.confidence,
    rsi: ind.rsi,
    volMult: ind.volMult,
    sl: sig.sl,
    tp: sig.tp,
    rr: sig.rr,
    rrNum: sig.rrNum,
    note: sig.reasons.join(' · '),
    error: false,
  };
}

export function toErrorRow(
  symbol: string,
  market: SignalRow['market'],
  currency: string,
  reason?: string
): SignalRow {
  return {
    symbol,
    market,
    currency,
    price: null,
    changePct: null,
    signal: '—',
    confidence: null,
    rsi: null,
    volMult: null,
    sl: null,
    tp: null,
    rr: null,
    rrNum: null,
    note: reason || 'Data unavailable this cycle',
    error: true,
  };
}
