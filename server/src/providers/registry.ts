import type { PipelineId, Market } from '@signal-terminal/shared';
import type { KeyLease } from '../credentials/keyPool.js';
import type { Candle } from '@signal-terminal/shared';

export interface ProviderLimits {
  perMinute?: number;
  perDay?: number;
  perMonth?: number;
}

export interface ProviderAdapter {
  id: string;
  name: string;
  tier: 'free';
  requiresKey: boolean;
  signupUrl?: string;
  limits: ProviderLimits;
  pipelines: PipelineId[];
  markets: Market[];
  enabled: boolean;
  fetchCandles?(
    symbol: string,
    market: Market,
    lease?: KeyLease | null
  ): Promise<{ candles: Candle[]; requestUrl: string }>;
  fetchQuote?(
    symbol: string,
    market: Market,
    lease?: KeyLease | null
  ): Promise<{ price: number; changePct?: number; requestUrl: string }>;
  testKey?(lease: KeyLease): Promise<boolean>;
}

export const PROVIDER_REGISTRY: ProviderAdapter[] = [];

export function registerProvider(adapter: ProviderAdapter) {
  PROVIDER_REGISTRY.push(adapter);
}

export function getProviderChain(dataset: 'candles' | 'quote', market: Market): ProviderAdapter[] {
  return PROVIDER_REGISTRY.filter((p) => {
    if (!p.enabled) return false;
    if (!p.markets.includes(market)) return false;
    if (dataset === 'candles' && !p.fetchCandles) return false;
    if (dataset === 'quote' && !p.fetchQuote) return false;
    return true;
  });
}
