import { ingestNewsEvent } from './utils.js';
import type { PipelineId } from '@signal-terminal/shared';

export interface MarketHeadlineInput {
  title: string;
  summary?: string;
  url?: string;
  sentiment?: number;
  eventType?: 'news' | 'social';
  ts?: string;
  source: string;
  providerId: string;
  pipelineId?: PipelineId;
  requestUrl?: string;
  raw: unknown;
}

/** Ingest one headline into the market-wide feed (entityId = MARKET). */
export async function ingestMarketHeadline(input: MarketHeadlineInput) {
  await ingestNewsEvent({
    entityId: 'MARKET',
    title: input.title,
    summary: input.summary,
    url: input.url,
    sentiment: input.sentiment,
    eventType: input.eventType || 'news',
    ts: input.ts,
    source: input.source,
    providerId: input.providerId,
    pipelineId: input.pipelineId || 'sentiment-news',
    requestUrl: input.requestUrl,
    raw: input.raw,
  });
}

/** Extract $TICKER cashtags and bare uppercase tickers (1-5 chars) from text. */
export function extractCashtags(text: string): string[] {
  const found = new Set<string>();
  const cashtags = text.match(/\$[A-Z]{1,5}\b/g) || [];
  for (const c of cashtags) found.add(c.slice(1));
  return [...found];
}
