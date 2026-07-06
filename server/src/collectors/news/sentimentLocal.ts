const BULLISH = ['surge', 'rally', 'gain', 'beat', 'upgrade', 'bullish', 'record high', 'soar', 'jump', 'profit', 'growth', 'buy', 'outperform'];
const BEARISH = ['fall', 'drop', 'plunge', 'miss', 'downgrade', 'bearish', 'crash', 'slump', 'loss', 'decline', 'sell', 'underperform', 'warning'];

/** Score headline text -1..+1 using finance lexicon */
export function scoreHeadline(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of BULLISH) if (lower.includes(w)) score += 1;
  for (const w of BEARISH) if (lower.includes(w)) score -= 1;
  if (score === 0) return 0;
  return Math.max(-1, Math.min(1, score / 3));
}
