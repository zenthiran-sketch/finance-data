import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SignalRow } from '@signal-terminal/shared';
import { fetchSignals, fetchHealth, triggerRefresh, connectSSE, connectWS, fetchWatchlist, fetchSentimentTrending } from '../api';

type SortKey = 'symbol' | 'market' | 'price' | 'changePct' | 'signal' | 'confidence' | 'rsi';
type SortDir = 'asc' | 'desc';

const SIGNAL_RANK: Record<string, number> = {
  'STRONG-BUY': 5, BUY: 4, HOLD: 3, SELL: 2, 'STRONG-SELL': 1, '—': 0,
};

const SORTABLE: { key: SortKey; label: string; align?: 'left' | 'right' | 'center' }[] = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'market', label: 'Market' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'signal', label: 'Signal', align: 'center' },
  { key: 'confidence', label: 'Confidence', align: 'right' },
  { key: 'rsi', label: 'RSI', align: 'right' },
];

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

function fmtPrice(v: number | null, currency: string) {
  if (v == null) return '—';
  const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : '';
  return sym + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function marketAbbrev(market: string) {
  const map: Record<string, string> = {
    Crypto: 'CRY', Stocks: 'STK', Forex: 'FX', Commodities: 'CMD', MutualFunds: 'MF',
  };
  return map[market] || market.slice(0, 3).toUpperCase();
}

function compareRows(a: SignalRow, b: SignalRow, key: SortKey, dir: SortDir, livePrices: Record<string, number>) {
  const mul = dir === 'asc' ? 1 : -1;
  const priceA = livePrices[a.symbol] ?? a.price ?? -Infinity;
  const priceB = livePrices[b.symbol] ?? b.price ?? -Infinity;

  switch (key) {
    case 'symbol':
      return mul * a.symbol.localeCompare(b.symbol);
    case 'market':
      return mul * a.market.localeCompare(b.market);
    case 'price':
      return mul * (priceA - priceB);
    case 'changePct':
      return mul * ((a.changePct ?? -Infinity) - (b.changePct ?? -Infinity));
    case 'signal':
      return mul * ((SIGNAL_RANK[a.signal] ?? 0) - (SIGNAL_RANK[b.signal] ?? 0));
    case 'confidence':
      return mul * ((a.confidence ?? -1) - (b.confidence ?? -1));
    case 'rsi':
      return mul * ((a.rsi ?? -1) - (b.rsi ?? -1));
    default:
      return 0;
  }
}

function SignalInstrumentCard({
  row: r,
  livePrice,
  sentimentTrend,
  onOpen,
}: {
  row: SignalRow;
  livePrice?: number;
  sentimentTrend?: number;
  onOpen: (row: SignalRow) => void;
}) {
  const price = livePrice ?? r.price;
  return (
    <article
      className={`signal-instrument-card clickable-row ${r.error ? 'row-error' : ''} ${r.stale ? 'row-stale' : ''}`}
      onClick={() => onOpen(r)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(r)}
      tabIndex={0}
      role="button"
      aria-label={`Open chart for ${r.symbol}`}
    >
      <div className="signal-card-head">
        <div className="signal-card-symbol-wrap">
          <span className="symbol-link">{r.symbol}</span>
          {r.stale && <span className="stale-badge">STALE</span>}
          {sentimentTrend != null && sentimentTrend !== 0 && (
            <span className={`sentiment-trend-chip ${sentimentTrend > 0 ? 'trend-bull' : 'trend-bear'}`}>
              {sentimentTrend > 0 ? '▲ Bull' : '▼ Bear'}
            </span>
          )}
        </div>
        <span className={`pill pill-${signalClass(r.signal)}`}>{r.signal}</span>
      </div>
      <div className="signal-card-sub">
        <span className={`mkt-badge mkt-${r.market.toLowerCase()}`}>{marketAbbrev(r.market)}</span>
        <span className="signal-card-price">{fmtPrice(price, r.currency)}</span>
        {r.changePct != null && (
          <span className={`chg-pill ${r.changePct >= 0 ? 'chg-up' : 'chg-down'}`}>
            {r.changePct >= 0 ? '▲' : '▼'} {Math.abs(r.changePct).toFixed(2)}%
          </span>
        )}
      </div>
      <div className="signal-card-metrics">
        <div className="signal-card-metric">
          <span className="metric-label">Confidence</span>
          <span className="metric-value">{r.confidence != null ? `${r.confidence}%` : '—'}</span>
          {r.confidence != null && (
            <div className="conf-bar conf-bar-wide" aria-hidden>
              <div className="conf-fill" style={{ width: `${r.confidence}%` }} />
            </div>
          )}
        </div>
        <div className="signal-card-metric">
          <span className="metric-label">RSI</span>
          <span className={`metric-value rsi-val ${r.rsi != null && r.rsi > 70 ? 'rsi-hot' : r.rsi != null && r.rsi < 30 ? 'rsi-cold' : ''}`}>
            {r.rsi?.toFixed(1) ?? '—'}
          </span>
        </div>
      </div>
      {r.note && <p className="signal-card-note">{r.note}</p>}
    </article>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [health, setHealth] = useState<{ status: string; stale: number; errors: number }>({ status: 'live', stale: 0, errors: 0 });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [market, setMarket] = useState('All');
  const [signalFilter, setSignalFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'confidence', dir: 'desc' });
  const [sentimentTrends, setSentimentTrends] = useState<Record<string, number>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const openChart = useCallback((row: SignalRow) => {
    navigate(`/chart/${encodeURIComponent(row.symbol)}`, {
      state: { signal: row, livePrice: livePrices[row.symbol] },
    });
  }, [navigate, livePrices]);

  const load = async () => {
    const [s, h, w, bull, bear] = await Promise.all([
      fetchSignals(),
      fetchHealth(),
      fetchWatchlist(),
      fetchSentimentTrending('positive', 30).catch(() => []),
      fetchSentimentTrending('negative', 30).catch(() => []),
    ]);
    setSignals(s);
    setHealth(h);
    const ids = new Set<string>((w.items || []).map((i: { instrumentId: string }) => i.instrumentId));
    setWatchlistIds(ids);
    const trendMap: Record<string, number> = {};
    for (const t of bull) trendMap[t.symbol] = 1;
    for (const t of bear) trendMap[t.symbol] = -1;
    setSentimentTrends(trendMap);
  };

  useEffect(() => {
    load();
    const es = connectSSE((type, data) => {
      if (type === 'progress') {
        const d = data as { loaded: number; total: number };
        setProgress(`Updating… ${d.loaded}/${d.total}`);
      }
      if (type === 'cycle_complete') {
        setProgress('');
        setLoading(false);
        load();
      }
    });
    const ws = connectWS((tick) => {
      const t = tick as { type?: string; symbol?: string; price?: number };
      if (t.type === 'quote_tick' && t.symbol && t.price != null) {
        setLivePrices((p) => ({ ...p, [t.symbol!]: t.price! }));
      }
    });
    return () => { es.close(); ws.close(); };
  }, []);

  const filtered = useMemo(() => {
    let rows = [...signals];
    if (market !== 'All') rows = rows.filter((r) => r.market === market);
    if (signalFilter !== 'All') rows = rows.filter((r) => r.signal === signalFilter);
    if (watchlistOnly) rows = rows.filter((r) => r.instrumentId && watchlistIds.has(r.instrumentId));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) =>
        r.symbol.toLowerCase().includes(q)
        || r.market.toLowerCase().includes(q)
        || r.signal.toLowerCase().includes(q)
        || (r.note && r.note.toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [signals, market, signalFilter, search, watchlistOnly, watchlistIds]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareRows(a, b, sort.key, sort.dir, livePrices)),
    [filtered, sort, livePrices],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: signals.length, 'STRONG-BUY': 0, BUY: 0, HOLD: 0, SELL: 0, 'STRONG-SELL': 0 };
    signals.forEach((r) => { if (c[r.signal] != null) c[r.signal]++; });
    return c;
  }, [signals]);

  const top = filtered.filter((r) => !r.error && ['BUY', 'STRONG-BUY', 'SELL', 'STRONG-SELL'].includes(r.signal))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

  const onRefresh = async () => {
    setLoading(true);
    await triggerRefresh('fast');
  };

  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) => (
      prev.key === key
        ? { ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'symbol' || key === 'market' ? 'asc' : 'desc' }
    ));
  }, []);

  const clearFilters = () => {
    setSearch('');
    setMarket('All');
    setSignalFilter('All');
    setWatchlistOnly(false);
    searchRef.current?.focus();
  };

  const hasActiveFilters = search || market !== 'All' || signalFilter !== 'All' || watchlistOnly;
  const tickerItems = signals.filter((r) => !r.error && r.price != null);

  return (
    <>
      <div className="ticker-wrap">
        <div className="ticker-track">
          {[...tickerItems, ...tickerItems].map((r, i) => (
            <span key={i} className="ticker-item">
              <b>{r.symbol}</b>
              <span className="ticker-price">{fmtPrice(livePrices[r.symbol] ?? r.price, r.currency)}</span>
              {r.changePct != null && (
                <span
                  className={`ticker-chg ${r.changePct >= 0 ? 'ticker-up' : 'ticker-down'}`}
                  aria-label={`${r.changePct >= 0 ? 'up' : 'down'} ${Math.abs(r.changePct).toFixed(2)} percent`}
                >
                  <span className="ticker-arrow" aria-hidden>{r.changePct >= 0 ? '▲' : '▼'}</span>
                  {Math.abs(r.changePct).toFixed(2)}%
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="status-bar">
        <span className={`health-${health.status}`}>
          {health.status.toUpperCase()}{health.stale ? ` (${health.stale} stale)` : ''}{health.errors ? ` (${health.errors} errors)` : ''}
        </span>
        <div className="status-bar-actions">
          {progress && <span className="progress-text">{progress}</span>}
          <button type="button" onClick={onRefresh} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button>
        </div>
      </div>

      <section
        className={`hero ${top ? 'hero-clickable' : ''}`}
        onClick={() => top && openChart(top)}
        onKeyDown={(e) => top && (e.key === 'Enter' || e.key === ' ') && openChart(top)}
        role={top ? 'button' : undefined}
        tabIndex={top ? 0 : undefined}
      >
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8 }}>Top opportunity</div>
        {top ? (
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700 }}>{top.symbol}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{top.market}</div>
            </div>
            <span className={`pill pill-${signalClass(top.signal)}`}>{top.signal}</span>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700 }}>{top.confidence}%</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 400 }}>{top.note}</div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-faint)' }}>Market's flat — nothing clears the confidence bar.</div>
        )}
      </section>

      <section className="metrics">
        {(['All', 'STRONG-BUY', 'BUY', 'HOLD', 'SELL', 'STRONG-SELL'] as const).map((s) => (
          <button key={s} type="button" className={`metric-tile ${signalFilter === s ? 'active' : ''}`} onClick={() => setSignalFilter(s)}>
            <span className="num">{counts[s] ?? 0}</span>
            <span className="lbl">{s === 'All' ? 'Tracked' : s}</span>
          </button>
        ))}
      </section>

      <section className="signals-panel panel">
        <div className="signals-toolbar">
          <div className="signals-search-wrap">
            <span className="search-icon" aria-hidden>⌕</span>
            <input
              ref={searchRef}
              className="signals-search"
              placeholder="Search symbol, market, signal, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">×</button>
            )}
          </div>
          <div className="market-chips">
            {['All', 'Crypto', 'Stocks', 'Forex', 'Commodities', 'MutualFunds'].map((m) => (
              <button key={m} type="button" className={`chip ${market === m ? 'active' : ''}`} onClick={() => setMarket(m)}>{m}</button>
            ))}
          </div>
          <label className="watchlist-toggle">
            <input type="checkbox" checked={watchlistOnly} onChange={(e) => setWatchlistOnly(e.target.checked)} />
            Watchlist only
          </label>
        </div>

        <div className="signals-meta">
          <span>
            Showing <strong>{sorted.length}</strong> of {signals.length}
            {hasActiveFilters && (
              <button type="button" className="link-btn" onClick={clearFilters}>Clear filters</button>
            )}
          </span>
          <span className="sort-hint">
            Sorted by <strong>{SORTABLE.find((c) => c.key === sort.key)?.label ?? sort.key}</strong>
            {' '}{sort.dir === 'asc' ? '↑' : '↓'}
          </span>
        </div>

        <div className="table-wrap signals-table-wrap thin-scrollbar signals-table-desktop">
          <table className="signals-table">
            <thead>
              <tr>
                {SORTABLE.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`sortable-th ${sort.key === col.key ? 'sorted' : ''} align-${col.align || 'left'}`}
                    aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    tabIndex={0}
                    onClick={() => toggleSort(col.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleSort(col.key);
                      }
                    }}
                  >
                    <span className="th-inner">
                      {col.label}
                      <span className="sort-arrow" aria-hidden>
                        {sort.key === col.key ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </span>
                  </th>
                ))}
                <th className="notes-col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={8}>
                    <div className="empty-state">
                      <span>No instruments match your filters</span>
                      {hasActiveFilters && (
                        <button type="button" className="chip" onClick={clearFilters}>Reset filters</button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : sorted.map((r) => (
                <tr
                  key={r.symbol}
                  className={`clickable-row ${r.error ? 'row-error' : r.stale ? 'row-stale' : ''}`}
                  onClick={() => openChart(r)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openChart(r)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open chart for ${r.symbol}`}
                >
                  <td className="symbol-cell">
                    <span className="symbol-link">{r.symbol}</span>
                    {sentimentTrends[r.symbol.replace(/\.(NS|US)$/i, '')] != null && sentimentTrends[r.symbol.replace(/\.(NS|US)$/i, '')] !== 0 && (
                      <span className={`sentiment-trend-chip ${sentimentTrends[r.symbol.replace(/\.(NS|US)$/i, '')]! > 0 ? 'trend-bull' : 'trend-bear'}`}>
                        {sentimentTrends[r.symbol.replace(/\.(NS|US)$/i, '')]! > 0 ? '▲' : '▼'}
                      </span>
                    )}
                    {r.stale && <span className="stale-badge">STALE</span>}
                  </td>
                  <td>
                    <span className={`mkt-badge mkt-${r.market.toLowerCase()}`} title={r.market}>
                      {marketAbbrev(r.market)}
                    </span>
                  </td>
                  <td className="num-cell">
                    <span className="price-val">{fmtPrice(livePrices[r.symbol] ?? r.price, r.currency)}</span>
                    {r.changePct != null && (
                      <span className={`chg-pill ${r.changePct >= 0 ? 'chg-up' : 'chg-down'}`}>
                        {r.changePct >= 0 ? '▲' : '▼'} {Math.abs(r.changePct).toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="align-center">
                    <span className={`pill pill-${signalClass(r.signal)}`}>{r.signal}</span>
                  </td>
                  <td className="num-cell">
                    {r.confidence != null ? (
                      <div className="conf-cell">
                        <span className="conf-val">{r.confidence}%</span>
                        <div className="conf-bar" aria-hidden>
                          <div className="conf-fill" style={{ width: `${r.confidence}%` }} />
                        </div>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="num-cell">
                    {r.rsi != null ? (
                      <span className={`rsi-val ${r.rsi > 70 ? 'rsi-hot' : r.rsi < 30 ? 'rsi-cold' : ''}`}>
                        {r.rsi.toFixed(1)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="notes-cell" title={r.note}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="signals-card-list thin-scrollbar signals-cards-mobile">
          {sorted.length === 0 ? (
            <div className="empty-state">
              <span>No instruments match your filters</span>
              {hasActiveFilters && (
                <button type="button" className="chip" onClick={clearFilters}>Reset filters</button>
              )}
            </div>
          ) : sorted.map((r) => (
            <SignalInstrumentCard
              key={r.symbol}
              row={r}
              livePrice={livePrices[r.symbol]}
              sentimentTrend={sentimentTrends[r.symbol.replace(/\.(NS|US)$/i, '')]}
              onOpen={openChart}
            />
          ))}
        </div>
      </section>

      <footer className="footer">
        Sources: Binance · CoinGecko · Yahoo · Stooq · Frankfurter · ExchangeRate.host · mfapi.in · Finnhub · Twelve Data · FMP · EODHD · Marketstack · StockData (free tier only).
        Not financial advice.
      </footer>
    </>
  );
}
