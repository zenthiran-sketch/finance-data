import { ingestMetric, ingestNewsEvent } from './utils.js';

const APE_URL = 'https://apewisdom.io/api/v1.0/filter/all-stocks';

interface ApeRow {
  ticker: string;
  name: string;
  mentions: string | number;
  mentions_24h_ago?: string | number;
  upvotes: string | number;
  rank: string | number;
  rank_24h_ago?: string | number;
}

function num(v: string | number | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : parseInt(String(v), 10) || 0;
}

export async function fetchApeWisdomSentiment() {
  const res = await fetch(APE_URL);
  if (!res.ok) throw new Error(`ApeWisdom HTTP ${res.status}`);
  const data = await res.json() as { results?: ApeRow[] };
  const rows = data.results || [];
  let count = 0;
  for (const row of rows.slice(0, 50)) {
    const ticker = row.ticker.replace('$', '');
    const mentions = num(row.mentions);
    const mentionsPrior = num(row.mentions_24h_ago);
    const rank = num(row.rank);
    const rankPrior = num(row.rank_24h_ago);
    const mentionVelocity = mentionsPrior > 0
      ? (mentions - mentionsPrior) / mentionsPrior
      : mentions > 0 ? 1 : 0;
    const rankDelta = rankPrior > 0 ? rankPrior - rank : 0;

    await ingestMetric(ticker, 'reddit_mentions', mentions, 'apewisdom', 'sentiment-news', { raw: row });
    await ingestMetric(ticker, 'reddit_rank', rank, 'apewisdom', 'sentiment-news', { raw: row });
    await ingestMetric(ticker, 'mention_velocity', mentionVelocity, 'apewisdom', 'sentiment-news', { raw: row });
    await ingestMetric(ticker, 'rank_delta_24h', rankDelta, 'apewisdom', 'sentiment-news', { raw: row });

    const momentum = rankDelta > 10 || mentionVelocity > 0.5 ? 'surging' : 'steady';
    await ingestNewsEvent({
      entityId: ticker,
      title: `${ticker} trending on Reddit (#${rank}, ${mentions} mentions, ${momentum})`,
      summary: `${row.name} — mentions ${mentionsPrior}→${mentions}, rank ${rankPrior}→${rank}`,
      eventType: 'social',
      source: 'apewisdom',
      providerId: 'apewisdom',
      pipelineId: 'sentiment-news',
      requestUrl: APE_URL,
      raw: row,
    });
    count++;
  }
  return count;
}
