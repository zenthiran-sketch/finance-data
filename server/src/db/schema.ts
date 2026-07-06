import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const instruments = sqliteTable('instruments', {
  id: text('id').primaryKey(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  market: text('market').notNull(),
  currency: text('currency').notNull(),
  exchange: text('exchange'),
  active: integer('active', { mode: 'boolean' }).default(true),
  inDefaultSeed: integer('in_default_seed', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull(),
});

export const apiCredentials = sqliteTable('api_credentials', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  label: text('label').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  encryptedSecret: text('encrypted_secret'),
  keyHint: text('key_hint').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  status: text('status').notNull().default('active'),
  assignedPipelinesJson: text('assigned_pipelines_json').notNull().default('[]'),
  lastUsedAt: text('last_used_at'),
  lastValidatedAt: text('last_validated_at'),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const credentialQuota = sqliteTable('credential_quota', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  credentialId: text('credential_id').notNull(),
  window: text('window').notNull(),
  windowStart: text('window_start').notNull(),
  count: integer('count').notNull().default(0),
}, (t) => ({
  uniq: uniqueIndex('credential_quota_uniq').on(t.credentialId, t.window, t.windowStart),
}));

export const watchlists = sqliteTable('watchlists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const watchlistItems = sqliteTable('watchlist_items', {
  id: text('id').primaryKey(),
  watchlistId: text('watchlist_id').notNull(),
  instrumentId: text('instrument_id').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  addedAt: text('added_at').notNull(),
}, (t) => ({
  uniq: uniqueIndex('watchlist_items_uniq').on(t.watchlistId, t.instrumentId),
}));

export const rawIngestions = sqliteTable('raw_ingestions', {
  id: text('id').primaryKey(),
  dataset: text('dataset').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  providerId: text('provider_id').notNull(),
  credentialId: text('credential_id'),
  pipelineId: text('pipeline_id'),
  requestUrl: text('request_url'),
  httpStatus: integer('http_status'),
  fetchedAt: text('fetched_at').notNull(),
  durationMs: integer('duration_ms'),
  payloadJson: text('payload_json').notNull(),
}, (t) => ({
  entityIdx: index('raw_ingestions_entity_idx').on(t.entityId, t.fetchedAt),
}));

export const tsBars = sqliteTable('ts_bars', {
  id: text('id').primaryKey(),
  instrumentId: text('instrument_id').notNull(),
  ts: text('ts').notNull(),
  resolution: text('resolution').notNull(),
  open: real('open'),
  high: real('high'),
  low: real('low'),
  close: real('close').notNull(),
  volume: real('volume'),
  source: text('source').notNull(),
  providerId: text('provider_id').notNull(),
  credentialId: text('credential_id'),
  ingestionId: text('ingestion_id'),
  fetchedAt: text('fetched_at').notNull(),
}, (t) => ({
  uniq: uniqueIndex('ts_bars_uniq').on(t.instrumentId, t.ts, t.resolution),
  idx: index('ts_bars_idx').on(t.instrumentId, t.resolution, t.ts),
}));

export const tsTicks = sqliteTable('ts_ticks', {
  id: text('id').primaryKey(),
  instrumentId: text('instrument_id').notNull(),
  ts: text('ts').notNull(),
  price: real('price').notNull(),
  bid: real('bid'),
  ask: real('ask'),
  changePct: real('change_pct'),
  volume: real('volume'),
  streamType: text('stream_type'),
  source: text('source').notNull(),
  providerId: text('provider_id').notNull(),
  credentialId: text('credential_id'),
  ingestionId: text('ingestion_id'),
}, (t) => ({
  idx: index('ts_ticks_idx').on(t.instrumentId, t.ts),
}));

export const tsMetrics = sqliteTable('ts_metrics', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  metricKey: text('metric_key').notNull(),
  ts: text('ts').notNull(),
  value: real('value').notNull(),
  unit: text('unit'),
  source: text('source').notNull(),
  providerId: text('provider_id').notNull(),
  ingestionId: text('ingestion_id'),
}, (t) => ({
  uniq: uniqueIndex('ts_metrics_uniq').on(t.entityType, t.entityId, t.metricKey, t.ts, t.source),
}));

export const tsEvents = sqliteTable('ts_events', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  eventType: text('event_type').notNull(),
  ts: text('ts').notNull(),
  title: text('title'),
  summary: text('summary'),
  sentiment: real('sentiment'),
  url: text('url'),
  payloadJson: text('payload_json'),
  eventHash: text('event_hash').notNull(),
  source: text('source').notNull(),
  providerId: text('provider_id').notNull(),
  ingestionId: text('ingestion_id'),
}, (t) => ({
  hashUniq: uniqueIndex('ts_events_hash_uniq').on(t.eventHash),
}));

export const tsFundamentals = sqliteTable('ts_fundamentals', {
  id: text('id').primaryKey(),
  instrumentId: text('instrument_id').notNull(),
  asOf: text('as_of').notNull(),
  period: text('period').notNull(),
  statementType: text('statement_type').notNull(),
  revenue: real('revenue'),
  netIncome: real('net_income'),
  eps: real('eps'),
  pe: real('pe'),
  pb: real('pb'),
  debtToEquity: real('debt_to_equity'),
  payloadJson: text('payload_json'),
  source: text('source').notNull(),
  providerId: text('provider_id').notNull(),
  ingestionId: text('ingestion_id'),
}, (t) => ({
  uniq: uniqueIndex('ts_fundamentals_uniq').on(t.instrumentId, t.period, t.statementType, t.source),
}));

export const tsNav = sqliteTable('ts_nav', {
  id: text('id').primaryKey(),
  instrumentId: text('instrument_id').notNull(),
  ts: text('ts').notNull(),
  nav: real('nav').notNull(),
  source: text('source').notNull(),
  ingestionId: text('ingestion_id'),
}, (t) => ({
  uniq: uniqueIndex('ts_nav_uniq').on(t.instrumentId, t.ts),
}));

export const signals = sqliteTable('signals', {
  id: text('id').primaryKey(),
  instrumentId: text('instrument_id').notNull(),
  cycleId: text('cycle_id'),
  computedAt: text('computed_at').notNull(),
  price: real('price'),
  changePct: real('change_pct'),
  signal: text('signal').notNull(),
  confidence: real('confidence'),
  rsi: real('rsi'),
  volMult: real('vol_mult'),
  sl: real('sl'),
  tp: real('tp'),
  rr: text('rr'),
  rrNum: real('rr_num'),
  note: text('note'),
  error: integer('error', { mode: 'boolean' }).default(false),
  errorMessage: text('error_message'),
  stale: integer('stale', { mode: 'boolean' }).default(false),
  staleSince: text('stale_since'),
  sourceProvider: text('source_provider'),
  ingestionId: text('ingestion_id'),
}, (t) => ({
  idx: index('signals_idx').on(t.instrumentId, t.computedAt),
}));

export const macroSeries = sqliteTable('macro_series', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  providerSeriesId: text('provider_series_id').notNull(),
  name: text('name').notNull(),
  country: text('country'),
  unit: text('unit'),
  frequency: text('frequency'),
  createdAt: text('created_at').notNull(),
});

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tier: text('tier').notNull().default('free'),
  requiresKey: integer('requires_key', { mode: 'boolean' }).default(false),
  signupUrl: text('signup_url'),
  freeLimitsJson: text('free_limits_json'),
  healthy: integer('healthy', { mode: 'boolean' }).default(true),
  lastError: text('last_error'),
  lastSuccessAt: text('last_success_at'),
});

export const refreshCycles = sqliteTable('refresh_cycles', {
  id: text('id').primaryKey(),
  tier: text('tier').notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  status: text('status').notNull(),
  errorsJson: text('errors_json'),
  durationMs: integer('duration_ms'),
});

export const dataQualityLog = sqliteTable('data_quality_log', {
  id: text('id').primaryKey(),
  instrumentId: text('instrument_id').notNull(),
  date: text('date').notNull(),
  providerA: text('provider_a').notNull(),
  providerB: text('provider_b').notNull(),
  closeA: real('close_a').notNull(),
  closeB: real('close_b').notNull(),
  diffPct: real('diff_pct').notNull(),
});

export const liveSubscriptions = sqliteTable('live_subscriptions', {
  id: text('id').primaryKey(),
  instrumentId: text('instrument_id').notNull(),
  provider: text('provider').notNull(),
  subscribedAt: text('subscribed_at').notNull(),
  streamType: text('stream_type'),
});
