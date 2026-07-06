import { getSqlite } from './index.js';

const DDL = `
CREATE TABLE IF NOT EXISTS instruments (
  id TEXT PRIMARY KEY, symbol TEXT NOT NULL, name TEXT NOT NULL, market TEXT NOT NULL,
  currency TEXT NOT NULL, exchange TEXT, active INTEGER DEFAULT 1, in_default_seed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_credentials (
  id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, label TEXT NOT NULL,
  encrypted_key TEXT NOT NULL, encrypted_secret TEXT, key_hint TEXT NOT NULL,
  enabled INTEGER DEFAULT 1, status TEXT NOT NULL DEFAULT 'active',
  assigned_pipelines_json TEXT NOT NULL DEFAULT '[]',
  last_used_at TEXT, last_validated_at TEXT, last_error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credential_quota (
  id INTEGER PRIMARY KEY AUTOINCREMENT, credential_id TEXT NOT NULL,
  window TEXT NOT NULL, window_start TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(credential_id, window, window_start)
);
CREATE TABLE IF NOT EXISTS watchlists (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS watchlist_items (
  id TEXT PRIMARY KEY, watchlist_id TEXT NOT NULL, instrument_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, added_at TEXT NOT NULL,
  UNIQUE(watchlist_id, instrument_id)
);
CREATE TABLE IF NOT EXISTS raw_ingestions (
  id TEXT PRIMARY KEY, dataset TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  provider_id TEXT NOT NULL, credential_id TEXT, pipeline_id TEXT,
  request_url TEXT, http_status INTEGER, fetched_at TEXT NOT NULL, duration_ms INTEGER,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS raw_ingestions_entity_idx ON raw_ingestions(entity_id, fetched_at);
CREATE TABLE IF NOT EXISTS ts_bars (
  id TEXT PRIMARY KEY, instrument_id TEXT NOT NULL, ts TEXT NOT NULL, resolution TEXT NOT NULL,
  open REAL, high REAL, low REAL, close REAL NOT NULL, volume REAL,
  source TEXT NOT NULL, provider_id TEXT NOT NULL, credential_id TEXT,
  ingestion_id TEXT, fetched_at TEXT NOT NULL,
  UNIQUE(instrument_id, ts, resolution)
);
CREATE INDEX IF NOT EXISTS ts_bars_idx ON ts_bars(instrument_id, resolution, ts);
CREATE TABLE IF NOT EXISTS ts_ticks (
  id TEXT PRIMARY KEY, instrument_id TEXT NOT NULL, ts TEXT NOT NULL,
  price REAL NOT NULL, bid REAL, ask REAL, change_pct REAL, volume REAL,
  stream_type TEXT, source TEXT NOT NULL, provider_id TEXT NOT NULL,
  credential_id TEXT, ingestion_id TEXT
);
CREATE INDEX IF NOT EXISTS ts_ticks_idx ON ts_ticks(instrument_id, ts);
CREATE TABLE IF NOT EXISTS ts_metrics (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  metric_key TEXT NOT NULL, ts TEXT NOT NULL, value REAL NOT NULL, unit TEXT,
  source TEXT NOT NULL, provider_id TEXT NOT NULL, ingestion_id TEXT,
  UNIQUE(entity_type, entity_id, metric_key, ts, source)
);
CREATE TABLE IF NOT EXISTS ts_events (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL, ts TEXT NOT NULL, title TEXT, summary TEXT,
  sentiment REAL, url TEXT, payload_json TEXT, event_hash TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL, provider_id TEXT NOT NULL, ingestion_id TEXT
);
CREATE TABLE IF NOT EXISTS ts_fundamentals (
  id TEXT PRIMARY KEY, instrument_id TEXT NOT NULL, as_of TEXT NOT NULL, period TEXT NOT NULL,
  statement_type TEXT NOT NULL, revenue REAL, net_income REAL, eps REAL, pe REAL, pb REAL,
  debt_to_equity REAL, payload_json TEXT, source TEXT NOT NULL, provider_id TEXT NOT NULL,
  ingestion_id TEXT, UNIQUE(instrument_id, period, statement_type, source)
);
CREATE TABLE IF NOT EXISTS ts_nav (
  id TEXT PRIMARY KEY, instrument_id TEXT NOT NULL, ts TEXT NOT NULL,
  nav REAL NOT NULL, source TEXT NOT NULL, ingestion_id TEXT,
  UNIQUE(instrument_id, ts)
);
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY, instrument_id TEXT NOT NULL, cycle_id TEXT, computed_at TEXT NOT NULL,
  price REAL, change_pct REAL, signal TEXT NOT NULL, confidence REAL,
  rsi REAL, vol_mult REAL, sl REAL, tp REAL, rr TEXT, rr_num REAL, note TEXT,
  error INTEGER DEFAULT 0, error_message TEXT, stale INTEGER DEFAULT 0, stale_since TEXT,
  source_provider TEXT, ingestion_id TEXT
);
CREATE INDEX IF NOT EXISTS signals_idx ON signals(instrument_id, computed_at);
CREATE TABLE IF NOT EXISTS macro_series (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, provider_series_id TEXT NOT NULL,
  name TEXT NOT NULL, country TEXT, unit TEXT, frequency TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tier TEXT NOT NULL DEFAULT 'free',
  requires_key INTEGER DEFAULT 0, signup_url TEXT, free_limits_json TEXT,
  healthy INTEGER DEFAULT 1, last_error TEXT, last_success_at TEXT
);
CREATE TABLE IF NOT EXISTS refresh_cycles (
  id TEXT PRIMARY KEY, tier TEXT NOT NULL, started_at TEXT NOT NULL,
  completed_at TEXT, status TEXT NOT NULL, errors_json TEXT, duration_ms INTEGER
);
CREATE TABLE IF NOT EXISTS data_quality_log (
  id TEXT PRIMARY KEY, instrument_id TEXT NOT NULL, date TEXT NOT NULL,
  provider_a TEXT NOT NULL, provider_b TEXT NOT NULL,
  close_a REAL NOT NULL, close_b REAL NOT NULL, diff_pct REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS live_subscriptions (
  id TEXT PRIMARY KEY, instrument_id TEXT NOT NULL, provider TEXT NOT NULL,
  subscribed_at TEXT NOT NULL, stream_type TEXT
);
`;

export function runMigrations() {
  const sqlite = getSqlite();
  sqlite.exec(DDL);
}
