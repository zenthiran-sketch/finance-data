import type { ProviderAdapter } from './registry.js';
import { registerProvider } from './registry.js';

const adanos: ProviderAdapter = {
  id: 'adanos',
  name: 'Adanos',
  tier: 'free',
  requiresKey: true,
  signupUrl: 'https://adanos.io',
  limits: { perMonth: 250 },
  pipelines: ['sentiment-news'],
  markets: ['Stocks'],
  enabled: true,
  async testKey(lease) {
    const res = await fetch(`https://api.adanos.io/v1/sentiment/AAPL`, {
      headers: { Authorization: `Bearer ${lease.apiKey}` },
    });
    return res.ok;
  },
};

const finsignals: ProviderAdapter = {
  id: 'finsignals',
  name: 'FinSignals',
  tier: 'free',
  requiresKey: true,
  signupUrl: 'https://finsignals.io',
  limits: { perMonth: 1000 },
  pipelines: ['sentiment-news'],
  markets: ['Stocks'],
  enabled: true,
  async testKey(lease) {
    const res = await fetch('https://api.finsignals.io/v1/classify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lease.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'Apple stock beats earnings expectations' }),
    });
    return res.ok;
  },
};

registerProvider(adanos);
registerProvider(finsignals);

export async function fetchAdanosSentiment(symbol: string, apiKey: string) {
  const clean = symbol.replace(/\.(NS|US)$/i, '');
  const res = await fetch(`https://api.adanos.io/v1/sentiment/${clean}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ score?: number; sentiment?: number }>;
}

export async function fetchFinSignalsClassify(text: string, apiKey: string) {
  const res = await fetch('https://api.finsignals.io/v1/classify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ sentiment?: number; score?: number }>;
}
