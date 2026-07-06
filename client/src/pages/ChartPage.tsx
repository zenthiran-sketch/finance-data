import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import type { SignalRow } from '@signal-terminal/shared';
import PriceChart from '../components/PriceChart';
import NewsSentimentPanel from '../components/NewsSentimentPanel';
import { fetchBacktest, fetchSignal, fetchInstruments } from '../api';

type Range = '1M' | '3M' | '6M' | '1Y' | '2Y' | 'ALL';

interface ChartNavState {
  signal?: SignalRow;
  livePrice?: number;
}

const RANGES: Range[] = ['1M', '3M', '6M', '1Y', '2Y', 'ALL'];

function rangeToDate(range: Range): string | undefined {
  if (range === 'ALL') return undefined;
  const d = new Date();
  const days: Record<Range, number> = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730, 'ALL': 0 };
  d.setDate(d.getDate() - days[range]);
  return d.toISOString().slice(0, 10);
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

function fmtPrice(v: number | null | undefined, currency: string) {
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

function mergeSignal(base: SignalRow | null, livePrice?: number): SignalRow | null {
  if (!base) return null;
  if (livePrice == null) return base;
  return { ...base, price: livePrice };
}

function useChartHeight() {
  const [height, setHeight] = useState(480);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setHeight(w < 600 ? 280 : w < 900 ? 360 : w < 1200 ? 420 : 480);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return height;
}

export default function ChartPage() {
  const { symbol: paramSymbol } = useParams<{ symbol?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state as ChartNavState | null) ?? {};
  const chartHeight = useChartHeight();

  const [symbol, setSymbol] = useState(paramSymbol || '');
  const [range, setRange] = useState<Range>('1Y');
  const [search, setSearch] = useState('');
  const [catalog, setCatalog] = useState<Array<{ symbol: string; name: string; market: string }>>([]);
  const [signal, setSignal] = useState<SignalRow | null>(
    () => mergeSignal(navState.signal ?? null, navState.livePrice),
  );
  const [data, setData] = useState<{
    bars: Array<{ ts: string; open?: number; high?: number; low?: number; close: number; volume?: number | null }>;
    signals: Array<{ computedAt: string; signal: string; confidence: number }>;
  }>({ bars: [], signals: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!paramSymbol) return;
    setSymbol(paramSymbol);
    if (navState.signal?.symbol === paramSymbol) {
      setSignal(mergeSignal(navState.signal, navState.livePrice));
    }
  }, [paramSymbol, navState.signal, navState.livePrice]);

  useEffect(() => {
    if (!search || search.length < 1) { setCatalog([]); return; }
    const t = setTimeout(() => {
      fetchInstruments({ search, page: 1 }).then((r) => setCatalog(r.items || []));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (sym: string) => {
    if (!sym) return;
    setLoading(true);
    setError('');
    try {
      const from = rangeToDate(range);
      const [bt, sig] = await Promise.all([
        fetchBacktest(sym, from),
        fetchSignal(sym).catch(() => null),
      ]);
      setData(bt);
      if (sig) setSignal(sig);
      if (!bt.bars?.length) setError('No price history for this symbol in the selected range');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (symbol) load(symbol);
  }, [symbol, load]);

  const displayPrice = signal?.price;
  const stats = useMemo(() => {
    if (data.bars.length === 0) return null;
    const closes = data.bars.map((b) => b.close);
    const first = closes[0];
    const last = closes[closes.length - 1];
    const high = Math.max(...closes);
    const low = Math.min(...closes);
    const change = ((last - first) / first) * 100;
    return { first, last, high, low, change, count: data.bars.length };
  }, [data.bars]);

  const selectSymbol = (sym: string) => {
    setSymbol(sym);
    setSearch('');
    setCatalog([]);
    navigate(`/chart/${encodeURIComponent(sym)}`);
  };

  return (
    <div className="chart-page">
      <header className="chart-hero">
        <div className="chart-hero-main">
          {symbol ? (
            <>
              <div className="chart-hero-symbol-row">
                <h1 className="chart-hero-symbol">{symbol}</h1>
                {signal && (
                  <span className={`pill pill-${signalClass(signal.signal)}`}>{signal.signal}</span>
                )}
                {signal?.stale && <span className="stale-badge">STALE</span>}
                {signal?.error && <span className="pill pill-error">ERROR</span>}
              </div>
              {signal && (
                <div className="chart-hero-meta">
                  <span className={`mkt-badge mkt-${signal.market.toLowerCase()}`} title={signal.market}>
                    {marketAbbrev(signal.market)}
                  </span>
                  <span className="chart-hero-price">{fmtPrice(displayPrice, signal.currency)}</span>
                  {signal.changePct != null && (
                    <span className={`chart-hero-chg ${signal.changePct >= 0 ? 'ticker-up' : 'ticker-down'}`}>
                      <span aria-hidden>{signal.changePct >= 0 ? '▲' : '▼'}</span>
                      {Math.abs(signal.changePct).toFixed(2)}%
                    </span>
                  )}
                  {signal.confidence != null && (
                    <span className="chart-hero-conf">{signal.confidence}% confidence</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="chart-hero-eyebrow">Price &amp; signals</p>
              <h1 className="chart-hero-symbol">Chart Explorer</h1>
              <p className="chart-hero-desc">Search a symbol to view OHLC history, signals, and related news.</p>
            </>
          )}
        </div>

        <div className="chart-search-wrap">
          <label htmlFor="chart-symbol-search" className="visually-hidden">Search symbol</label>
          <input
            id="chart-symbol-search"
            className="chart-search-input"
            type="search"
            placeholder="Search symbol…"
            value={search || symbol}
            onChange={(e) => { setSearch(e.target.value); if (!e.target.value && !paramSymbol) setSymbol(''); }}
            onFocus={() => { if (symbol && !search) setSearch(''); }}
            autoComplete="off"
            spellCheck={false}
          />
          {catalog.length > 0 && (
            <ul className="chart-search-dropdown" role="listbox" aria-label="Symbol results">
              {catalog.map((inst) => (
                <li key={inst.symbol} role="option">
                  <button type="button" onClick={() => selectSymbol(inst.symbol)}>
                    <strong>{inst.symbol}</strong>
                    <span>{inst.market} · {inst.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {stats && (
        <div className="chart-ohlc-tiles" role="group" aria-label="Period statistics">
          <div className="chart-ohlc-tile">
            <span className="chart-ohlc-lbl">Open</span>
            <span className="chart-ohlc-val">{stats.first.toFixed(2)}</span>
          </div>
          <div className="chart-ohlc-tile">
            <span className="chart-ohlc-lbl">High</span>
            <span className="chart-ohlc-val chart-ohlc-high">{stats.high.toFixed(2)}</span>
          </div>
          <div className="chart-ohlc-tile">
            <span className="chart-ohlc-lbl">Low</span>
            <span className="chart-ohlc-val chart-ohlc-low">{stats.low.toFixed(2)}</span>
          </div>
          <div className="chart-ohlc-tile">
            <span className="chart-ohlc-lbl">Close</span>
            <span className="chart-ohlc-val">{stats.last.toFixed(2)}</span>
          </div>
          <div className="chart-ohlc-tile">
            <span className="chart-ohlc-lbl">Change</span>
            <span className={`chart-ohlc-val ${stats.change >= 0 ? 'chg-up' : 'chg-down'}`}>
              {stats.change >= 0 ? '+' : ''}{stats.change.toFixed(2)}%
            </span>
          </div>
          <div className="chart-ohlc-tile">
            <span className="chart-ohlc-lbl">Bars</span>
            <span className="chart-ohlc-val">{stats.count}</span>
          </div>
        </div>
      )}

      <div className="chart-toolbar">
        <div className="chart-range-chips" role="radiogroup" aria-label="Chart time range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={range === r}
              className={`chart-range-chip ${range === r ? 'active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <Link to="/" className="chart-back-link">← Dashboard</Link>
      </div>

      <section className="chart-main-panel panel" aria-label="Price chart">
        {loading && <div className="chart-loading" role="status">Loading chart…</div>}
        {error && (
          <div className="chart-error" role="alert">
            {error}
            <button type="button" className="chart-retry-btn" onClick={() => load(symbol)}>Retry</button>
          </div>
        )}
        {!loading && !error && symbol && data.bars.length > 0 && (
          <PriceChart bars={data.bars} signals={data.signals} height={chartHeight} />
        )}
        {!loading && !error && symbol && data.bars.length === 0 && (
          <div className="chart-empty">No price history for this range</div>
        )}
        {!loading && !symbol && (
          <div className="chart-empty">Search or select a symbol to begin</div>
        )}
      </section>

      {symbol && (
        <div className="chart-bottom-grid">
          <section className="chart-side-panel panel" aria-labelledby="chart-details-heading">
            <div className="chart-panel-head">
              <h2 id="chart-details-heading" className="chart-panel-title">
                <span className="chart-panel-icon" aria-hidden>◆</span>
                Instrument details
              </h2>
            </div>

            {signal ? (
              <>
                {signal.note && (
                  <p className="chart-signal-note">{signal.note}</p>
                )}

                <div className="chart-detail-grid">
                  <div className="chart-detail-item">
                    <span className="chart-detail-lbl">Market</span>
                    <span className="chart-detail-val">{signal.market}</span>
                  </div>
                  <div className="chart-detail-item">
                    <span className="chart-detail-lbl">Currency</span>
                    <span className="chart-detail-val">{signal.currency}</span>
                  </div>
                  <div className="chart-detail-item">
                    <span className="chart-detail-lbl">RSI (14)</span>
                    <span className={`chart-detail-val ${signal.rsi != null && signal.rsi > 70 ? 'rsi-hot' : signal.rsi != null && signal.rsi < 30 ? 'rsi-cold' : ''}`}>
                      {signal.rsi?.toFixed(1) ?? '—'}
                    </span>
                  </div>
                  <div className="chart-detail-item">
                    <span className="chart-detail-lbl">Vol mult</span>
                    <span className="chart-detail-val">{signal.volMult?.toFixed(2) ?? '—'}</span>
                  </div>
                  <div className="chart-detail-item">
                    <span className="chart-detail-lbl">Stop loss</span>
                    <span className="chart-detail-val">{fmtPrice(signal.sl, signal.currency)}</span>
                  </div>
                  <div className="chart-detail-item">
                    <span className="chart-detail-lbl">Take profit</span>
                    <span className="chart-detail-val">{fmtPrice(signal.tp, signal.currency)}</span>
                  </div>
                  <div className="chart-detail-item">
                    <span className="chart-detail-lbl">Risk / reward</span>
                    <span className="chart-detail-val">{signal.rr ?? '—'}</span>
                  </div>
                  {signal.confidence != null && (
                    <div className="chart-detail-item">
                      <span className="chart-detail-lbl">Confidence</span>
                      <div className="chart-conf-wrap">
                        <span className="chart-detail-val">{signal.confidence}%</span>
                        <div className="conf-bar conf-bar-wide" role="progressbar" aria-valuenow={signal.confidence} aria-valuemin={0} aria-valuemax={100}>
                          <div className="conf-fill" style={{ width: `${signal.confidence}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <h3 className="chart-subheading">Signal history</h3>
                <div className="chart-history-list" role="list" aria-label="Recent signals">
                  {data.signals.slice(-10).reverse().map((s) => (
                    <div key={s.computedAt} className="chart-history-row" role="listitem">
                      <time dateTime={s.computedAt}>{s.computedAt.slice(0, 10)}</time>
                      <span className={`pill pill-${signalClass(s.signal)}`}>{s.signal}</span>
                      <span className="chart-history-conf">{s.confidence}%</span>
                    </div>
                  ))}
                  {data.signals.length === 0 && (
                    <p className="chart-history-empty">No signal history yet</p>
                  )}
                </div>

                <Link to={`/backtest/${encodeURIComponent(symbol)}`} className="chart-link-back">
                  View backtest details →
                </Link>
              </>
            ) : (
              <p className="chart-history-empty">Loading instrument data…</p>
            )}
          </section>

          <section className="chart-side-panel panel chart-news-section" aria-labelledby="chart-news-heading">
            <NewsSentimentPanel symbol={symbol} />
          </section>
        </div>
      )}
    </div>
  );
}
