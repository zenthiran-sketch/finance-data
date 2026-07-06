import type { PipelineId } from '@signal-terminal/shared';
import { timeSeriesWriter } from '../timeseries/index.js';
import crypto from 'crypto';

export async function fetchFearGreedIndex() {
  const url = 'https://api.alternative.me/fng/?limit=30';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fear&Greed HTTP ${res.status}`);
  const data = await res.json() as { data?: Array<{ value: string; value_classification: string; timestamp: string }> };
  for (const item of data.data || []) {
    const hash = crypto.createHash('sha256').update(`fng-${item.timestamp}`).digest('hex');
    await timeSeriesWriter.ingest({
      dataset: 'metric',
      entityType: 'macro_series',
      entityId: 'crypto-fear-greed',
      ts: new Date(+item.timestamp * 1000).toISOString(),
      source: 'alternative.me',
      providerId: 'fearGreed',
      pipelineId: 'sentiment-news' as PipelineId,
      requestUrl: url,
      httpStatus: 200,
      raw: item,
      normalized: {
        metricKey: 'fear_greed_index',
        value: +item.value,
        unit: 'index',
        eventHash: hash,
        eventType: 'sentiment',
        title: item.value_classification,
      },
    });
  }
  return data.data?.length ?? 0;
}

export async function fetchTreasuryRates() {
  const url = 'https://api.fiscaldata.treasury.gov/services/api/v1/accounting/od/avg_interest_rates?sort=-record_date&page[size]=30';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Treasury HTTP ${res.status}`);
  const data = await res.json() as { data?: Array<{ record_date: string; avg_interest_rate_amt: string; security_desc: string }> };
  for (const item of data.data || []) {
    if (!item.security_desc?.includes('Treasury')) continue;
    const hash = crypto.createHash('sha256').update(`treasury-${item.record_date}-${item.security_desc}`).digest('hex');
    await timeSeriesWriter.ingest({
      dataset: 'metric',
      entityType: 'macro_series',
      entityId: 'us-treasury-rates',
      ts: item.record_date,
      source: 'treasury.gov',
      providerId: 'treasury',
      pipelineId: 'macro' as PipelineId,
      requestUrl: url,
      httpStatus: 200,
      raw: item,
      normalized: {
        metricKey: 'treasury_rate',
        value: parseFloat(item.avg_interest_rate_amt),
        unit: 'percent',
        eventHash: hash,
        eventType: 'macro',
        title: item.security_desc,
      },
    });
  }
  return data.data?.length ?? 0;
}

export async function fetchCoinCapPrices() {
  const assets = ['bitcoin', 'ethereum', 'solana'];
  let count = 0;
  for (const asset of assets) {
    const url = `https://api.coincap.io/v2/assets/${asset}/history?interval=d1`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as { data?: Array<{ priceUsd: string; time: number }> };
      for (const point of (data.data || []).slice(-30)) {
        const hash = crypto.createHash('sha256').update(`coincap-${asset}-${point.time}`).digest('hex');
        await timeSeriesWriter.ingest({
          dataset: 'bar',
          entityType: 'instrument',
          entityId: asset.toUpperCase(),
          ts: new Date(point.time).toISOString().slice(0, 10),
          source: 'coincap',
          providerId: 'coincap',
          pipelineId: 'prices-crypto' as PipelineId,
          requestUrl: url,
          httpStatus: 200,
          raw: point,
          normalized: { close: parseFloat(point.priceUsd), resolution: '1d', eventHash: hash },
        });
        count++;
      }
    } catch { /* skip asset */ }
  }
  return count;
}
