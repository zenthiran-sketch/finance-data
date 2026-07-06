function average(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return average(values.slice(values.length - period));
}

export function stdev(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  const mean = average(slice);
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

export function emaSeries(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let prev = average(values.slice(0, period));
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsiWilder(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
  }
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function calcMacd(values: number[], fast = 12, slow = 26, signalP = 9) {
  const emaFast = emaSeries(values, fast);
  const emaSlow = emaSeries(values, slow);
  const macdFull = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i]! - emaSlow[i]! : null
  );
  const macdCompact = macdFull.filter((v): v is number => v != null);
  if (macdCompact.length < signalP) {
    return { line: null, signal: null, prevLine: null, prevSignal: null };
  }
  const signalCompact = emaSeries(macdCompact, signalP);
  return {
    line: macdCompact[macdCompact.length - 1],
    signal: signalCompact[signalCompact.length - 1],
    prevLine: macdCompact[macdCompact.length - 2] ?? null,
    prevSignal: signalCompact[signalCompact.length - 2] ?? null,
  };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  const mean = average(slice);
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { mid: mean, upper: mean + mult * sd, lower: mean - mult * sd, sd };
}

export function computeIndicators(
  closes: number[],
  volumes?: (number | null | undefined)[] | null
) {
  const price = closes[closes.length - 1];
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : null;
  const rsi = rsiWilder(closes, 14);
  const macd = calcMacd(closes);
  const boll = bollinger(closes, 20, 2);
  const smaFast = sma(closes, 50);
  const smaSlow = sma(closes, 200);
  const sd14 = stdev(closes, 14);
  let volMult: number | null = null;
  if (volumes && volumes.length >= 21) {
    const baseline = average(volumes.slice(-21, -1).map((v) => v ?? 0));
    const last = volumes[volumes.length - 1];
    if (baseline > 0 && last != null) volMult = last / baseline;
  }
  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : null;
  return { price, prevClose, changePct, rsi, macd, boll, smaFast, smaSlow, sd14, volMult };
}
