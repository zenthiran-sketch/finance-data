import type { PipelineId } from '@signal-terminal/shared';
import { ingestMetric } from './news/utils.js';

interface TradestieRow {
  ticker: string;
  no_of_comments: number;
  sentiment: string;
  sentiment_score: number;
}

/** WSB top-50 — metrics only; headlines aggregated via topStocks. */
export async function fetchWsbSentiment() {
  const url = 'https://api.tradestie.com/v1/apps/reddit';
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`WSB HTTP ${res.status}`);
  const data = await res.json() as TradestieRow[];
  let rank = 0;
  for (const item of data.slice(0, 50)) {
    rank++;
    const score = item.sentiment === 'Bullish'
      ? Math.max(0.1, item.sentiment_score ?? 0.1)
      : item.sentiment === 'Bearish'
        ? -Math.max(0.1, Math.abs(item.sentiment_score ?? 0.1))
        : item.sentiment_score ?? 0;
    await ingestMetric(item.ticker, 'sentiment_score', score, 'wsb', 'sentiment-news', { raw: item });
    await ingestMetric(item.ticker, 'reddit_mentions', item.no_of_comments, 'wsb', 'sentiment-news', { raw: item });
    await ingestMetric(item.ticker, 'reddit_rank', rank, 'wsb', 'sentiment-news', { raw: item });
  }
  return data.length;
}

export async function fetchEcondbMacro() {
  const url = 'https://www.econdb.com/api/series/?ticker=INDOCPI&format=json';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Econdb HTTP ${res.status}`);
  const data = await res.json();
  const { timeSeriesWriter } = await import('../timeseries/index.js');
  await timeSeriesWriter.ingest({
    dataset: 'metric',
    entityType: 'macro_series',
    entityId: 'india-cpi',
    ts: new Date().toISOString(),
    source: 'econdb',
    providerId: 'econdb',
    pipelineId: 'macro' as PipelineId,
    requestUrl: url,
    httpStatus: 200,
    raw: data,
    normalized: { metricKey: 'cpi', value: 0, unit: 'index' },
  });
}
