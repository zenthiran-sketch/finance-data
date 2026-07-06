# Signal Terminal

Multi-provider financial data platform — React + Node monorepo.

## Features

- **Signal dashboard** — RSI, MACD, Bollinger, SMA-based signals (ported from `research.html`)
- **Free-tier APIs only** — Binance, Yahoo, Frankfurter, Finnhub, Twelve Data, FMP, Alpha Vantage, EODHD, FRED, and more
- **Multi-key pools** — add multiple free API keys per provider with rate-limit-aware rotation
- **Unified time-series store** — SQLite with `ts_bars`, `ts_ticks`, `ts_metrics`, `raw_ingestions`
- **Watchlist** — browse instrument catalog, add/remove for continuous monitoring
- **Live WebSocket** — Binance trade stream fan-out via `/api/ws`
- **Data Explorer** — query and export stored time series
- **Resilience** — per-instrument fallback chains, stale-data serving, never breaks the terminal

## Quick start

```bash
cd signal-terminal
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

- Dashboard: http://localhost:5173
- API: http://localhost:3001/api

## Project structure

```
signal-terminal/
├── shared/     # indicators, signal engine, types
├── server/     # Express API, collectors, SQLite, scheduler
└── client/     # React dashboard
```

## API keys

Open **API Keys** in the UI (`/settings/api-keys`). Keys are encrypted at rest. Assign each key to collection pipelines (`prices-stocks`, `live-stream`, etc.).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start server + client |
| `npm run build` | Build all packages |
| `npm run db:migrate` | Run SQLite migrations |
| `npm run db:seed` | Seed instruments + watchlist |
| `npm test` | Run tests |
