import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchWatchlist, fetchInstruments, addToWatchlist, removeFromWatchlist } from '../api';

const MARKETS = ['All', 'Crypto', 'Stocks', 'Forex', 'Commodities', 'MutualFunds'] as const;
type MarketFilter = (typeof MARKETS)[number];

const MARKET_LABELS: Record<string, string> = {
  All: 'All markets',
  Crypto: 'Crypto',
  Stocks: 'Stocks',
  Forex: 'Forex',
  Commodities: 'Commodities',
  MutualFunds: 'Mutual funds',
};

interface WatchItem {
  instrumentId: string;
  instrument?: { symbol: string; name?: string; market: string; currency?: string };
  signal?: {
    price: number | null;
    changePct: number | null;
    signal: string;
    confidence: number | null;
    currency?: string;
  };
}

interface CatalogItem {
  id: string;
  symbol: string;
  name: string;
  market: string;
}

function signalClass(label: string) {
  switch (label) {
    case 'STRONG-BUY': return 'strongbuy';
    case 'BUY': return 'buy';
    case 'HOLD': return 'hold';
    case 'SELL': return 'sell';
    case 'STRONG-SELL': return 'strongsell';
    default: return 'error';
  }
}

function marketAbbrev(market: string) {
  const map: Record<string, string> = {
    Crypto: 'CRY', Stocks: 'STK', Forex: 'FX', Commodities: 'CMD', MutualFunds: 'MF',
  };
  return map[market] || market.slice(0, 3).toUpperCase();
}

function fmtPrice(v: number | null | undefined, currency = 'USD') {
  if (v == null || Number.isNaN(v)) return '—';
  const sym = currency === 'INR' ? '₹' : currency === 'EUR' ? '€' : '$';
  const digits = v >= 1000 ? 0 : v >= 1 ? 2 : 4;
  return `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function WatchlistSkeleton() {
  return (
    <div className="wl-layout" aria-hidden>
      <div className="wl-panel wl-panel-watch">
        <div className="wl-skeleton-block" style={{ height: 28, width: '50%' }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="wl-skeleton-card" />
        ))}
      </div>
      <div className="wl-panel wl-panel-browse">
        <div className="wl-skeleton-block" style={{ height: 28, width: '40%' }} />
        <div className="wl-skeleton-block" style={{ height: 40, width: '100%', marginBottom: 12 }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="wl-skeleton-row" />
        ))}
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<{ items: WatchItem[] }>({ items: [] });
  const [catalog, setCatalog] = useState<{ items: CatalogItem[]; total: number }>({ items: [], total: 0 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [market, setMarket] = useState<MarketFilter>('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const [w, c] = await Promise.all([
        fetchWatchlist(),
        fetchInstruments({
          search: debouncedSearch || undefined,
          market: market === 'All' ? undefined : market,
          page: 1,
        }),
      ]);
      setWatchlist(w);
      setCatalog(c);
    } catch {
      setError('Could not load watchlist. Check that the server is running.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debouncedSearch, market]);

  useEffect(() => { load(); }, [load]);

  const watchIds = useMemo(
    () => new Set(watchlist.items?.map((i) => i.instrumentId) || []),
    [watchlist.items],
  );

  const bullishCount = useMemo(
    () => watchlist.items?.filter((i) => i.signal?.signal === 'BUY' || i.signal?.signal === 'STRONG-BUY').length || 0,
    [watchlist.items],
  );

  const bearishCount = useMemo(
    () => watchlist.items?.filter((i) => i.signal?.signal === 'SELL' || i.signal?.signal === 'STRONG-SELL').length || 0,
    [watchlist.items],
  );

  const handleAdd = async (inst: CatalogItem) => {
    if (watchIds.has(inst.id) || addingId) return;
    setAddingId(inst.id);
    try {
      await addToWatchlist({ instrumentId: inst.id });
      await load(true);
    } finally {
      setAddingId(null);
    }
  };

  const handleRemove = async (instrumentId: string) => {
    if (removingId) return;
    setRemovingId(instrumentId);
    try {
      await removeFromWatchlist(instrumentId);
      await load(true);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="wl-page">
      <header className="wl-hero">
        <div className="wl-hero-text">
          <p className="wl-hero-eyebrow">Track what matters</p>
          <h1 className="wl-hero-title">Watchlist</h1>
          <p className="wl-hero-desc">
            Save instruments you follow and jump straight to live signals and charts.
          </p>
        </div>
        <div className="wl-hero-actions">
          <button
            type="button"
            className="wl-refresh-btn"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            aria-busy={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="wl-stats" role="group" aria-label="Watchlist summary">
        <div className="wl-stat-tile">
          <span className="wl-stat-num">{watchlist.items?.length || 0}</span>
          <span className="wl-stat-lbl">Saved</span>
        </div>
        <div className="wl-stat-tile wl-stat-bull">
          <span className="wl-stat-num">{bullishCount}</span>
          <span className="wl-stat-lbl">Bullish</span>
        </div>
        <div className="wl-stat-tile wl-stat-bear">
          <span className="wl-stat-num">{bearishCount}</span>
          <span className="wl-stat-lbl">Bearish</span>
        </div>
        <div className="wl-stat-tile">
          <span className="wl-stat-num">{catalog.total.toLocaleString()}</span>
          <span className="wl-stat-lbl">In catalog</span>
        </div>
      </div>

      {error && (
        <div className="wl-error" role="alert">
          <span>{error}</span>
          <button type="button" className="wl-retry-btn" onClick={() => load()}>Retry</button>
        </div>
      )}

      {loading ? (
        <WatchlistSkeleton />
      ) : (
        <div className="wl-layout">
          <section className="wl-panel wl-panel-watch" aria-labelledby="wl-watch-heading">
            <div className="wl-panel-head">
              <h2 id="wl-watch-heading" className="wl-panel-title">
                <span className="wl-panel-icon" aria-hidden>◆</span>
                My watchlist
              </h2>
              <p className="wl-panel-desc">
                {watchlist.items?.length
                  ? `${watchlist.items.length} instrument${watchlist.items.length === 1 ? '' : 's'} tracked`
                  : 'Add symbols from the catalog to get started'}
              </p>
            </div>

            {!watchlist.items?.length ? (
              <div className="wl-empty-state">
                <span className="wl-empty-icon" aria-hidden>☆</span>
                <p>Your watchlist is empty</p>
                <span className="wl-empty-hint">Browse instruments on the right and tap Add to save them here.</span>
              </div>
            ) : (
              <ul className="wl-watch-list" aria-label="Saved instruments">
                {watchlist.items.map((item) => {
                  const sym = item.instrument?.symbol;
                  const mkt = item.instrument?.market || '';
                  const sig = item.signal;
                  const currency = sig?.currency || item.instrument?.currency || 'USD';
                  return (
                    <li key={item.instrumentId} className="wl-watch-card">
                      <div className="wl-watch-main">
                        <div className="wl-watch-symbol-row">
                          {sym ? (
                            <Link
                              to={`/chart/${encodeURIComponent(sym)}`}
                              className="wl-symbol-link"
                            >
                              {sym}
                            </Link>
                          ) : (
                            <span className="wl-symbol-link">—</span>
                          )}
                          {mkt && (
                            <span className={`mkt-badge mkt-${mkt.toLowerCase()}`} title={mkt}>
                              {marketAbbrev(mkt)}
                            </span>
                          )}
                        </div>
                        {item.instrument?.name && item.instrument.name !== sym && (
                          <span className="wl-instrument-name">{item.instrument.name}</span>
                        )}
                        <div className="wl-watch-price-row">
                          <span className="wl-watch-price">{fmtPrice(sig?.price, currency)}</span>
                          {sig?.changePct != null && (
                            <span className={`chg-pill ${sig.changePct >= 0 ? 'chg-up' : 'chg-down'}`}>
                              {sig.changePct >= 0 ? '+' : ''}{sig.changePct.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="wl-watch-signal">
                        {sig?.signal ? (
                          <span className={`pill pill-${signalClass(sig.signal)}`}>{sig.signal}</span>
                        ) : (
                          <span className="wl-no-signal">No signal</span>
                        )}
                        {sig?.confidence != null && (
                          <div className="conf-cell wl-watch-conf">
                            <span className="conf-val">{sig.confidence}%</span>
                            <div className="conf-bar" role="progressbar" aria-valuenow={sig.confidence} aria-valuemin={0} aria-valuemax={100} aria-label="Signal confidence">
                              <div className="conf-fill" style={{ width: `${Math.min(100, sig.confidence)}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="wl-remove-btn"
                        onClick={() => handleRemove(item.instrumentId)}
                        disabled={removingId === item.instrumentId}
                        aria-label={sym ? `Remove ${sym} from watchlist` : 'Remove from watchlist'}
                      >
                        {removingId === item.instrumentId ? '…' : 'Remove'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="wl-panel wl-panel-browse" aria-labelledby="wl-browse-heading">
            <div className="wl-panel-head">
              <h2 id="wl-browse-heading" className="wl-panel-title">
                <span className="wl-panel-icon" aria-hidden>◇</span>
                Browse instruments
              </h2>
              <p className="wl-panel-desc">Search and filter by market, then add to your watchlist.</p>
            </div>

            <div className="wl-search-wrap">
              <label htmlFor="wl-search" className="visually-hidden">Search instruments</label>
              <input
                id="wl-search"
                type="search"
                className="wl-search-input"
                placeholder="Search by symbol or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div
              className="wl-filter-chips"
              role="radiogroup"
              aria-label="Filter by market"
            >
              {MARKETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={market === m}
                  className={`wl-filter-chip ${market === m ? 'active' : ''}`}
                  onClick={() => setMarket(m)}
                >
                  {MARKET_LABELS[m] || m}
                </button>
              ))}
            </div>

            {!catalog.items?.length ? (
              <div className="wl-empty-state wl-empty-compact">
                <span className="wl-empty-icon" aria-hidden>⌕</span>
                <p>No instruments match your search</p>
                <span className="wl-empty-hint">Try a different symbol or clear the market filter.</span>
              </div>
            ) : (
              <ul className="wl-browse-list" aria-label="Instrument catalog">
                {catalog.items.map((inst) => {
                  const inList = watchIds.has(inst.id);
                  const isAdding = addingId === inst.id;
                  return (
                    <li key={inst.id} className="wl-browse-row">
                      <div className="wl-browse-info">
                        <div className="wl-browse-symbol-row">
                          <Link
                            to={`/chart/${encodeURIComponent(inst.symbol)}`}
                            className="wl-symbol-link"
                          >
                            {inst.symbol}
                          </Link>
                          <span className={`mkt-badge mkt-${inst.market.toLowerCase()}`} title={inst.market}>
                            {marketAbbrev(inst.market)}
                          </span>
                        </div>
                        {inst.name && inst.name !== inst.symbol && (
                          <span className="wl-instrument-name">{inst.name}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className={`wl-add-btn ${inList ? 'in-list' : ''}`}
                        disabled={inList || isAdding}
                        onClick={() => handleAdd(inst)}
                        aria-label={inList ? `${inst.symbol} already in watchlist` : `Add ${inst.symbol} to watchlist`}
                      >
                        {inList ? '✓ Saved' : isAdding ? 'Adding…' : '+ Add'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="wl-catalog-count" aria-live="polite">
              Showing {catalog.items?.length || 0} of {catalog.total.toLocaleString()} instruments
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
