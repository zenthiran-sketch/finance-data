import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchNewsFeed, type TopStock } from '../api';

interface FeedEvent {
  id: string;
  title?: string;
  summary?: string;
  url?: string;
  source: string;
  eventType: string;
  ts: string;
  sentiment?: number;
}

type FeedFilter = 'all' | 'news' | 'social';

const SOURCE_LABELS: Record<string, string> = {
  bloomberg: 'Bloomberg',
  cnbc: 'CNBC',
  yahoo: 'Yahoo',
  cnn: 'CNN',
  marketwatch: 'MarketWatch',
  'marketwatch-markets': 'MarketWatch',
  reuters: 'Reuters',
  ft: 'FT',
  gdelt: 'GDELT',
  finnhub: 'Finnhub',
};

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function sourceLabel(id: string) {
  if (SOURCE_LABELS[id]) return SOURCE_LABELS[id];
  if (id.startsWith('reddit-')) return `r/${id.replace('reddit-', '')}`;
  return id;
}

function rankClass(rank: number) {
  if (rank === 1) return 'rank-gold';
  if (rank === 2) return 'rank-silver';
  if (rank === 3) return 'rank-bronze';
  return '';
}

function NewsSkeleton() {
  return (
    <div className="news-page-layout" aria-hidden>
      <div className="news-panel news-panel-stocks">
        <div className="news-skeleton-block" style={{ height: 28, width: '60%' }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="news-skeleton-row" />
        ))}
      </div>
      <div className="news-panel news-panel-feed">
        <div className="news-skeleton-block" style={{ height: 28, width: '40%' }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="news-skeleton-card" />
        ))}
      </div>
    </div>
  );
}

export default function NewsPage() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [topStocks, setTopStocks] = useState<TopStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const data = await fetchNewsFeed(40);
      setEvents(data.events || []);
      setTopStocks(data.topStocks || []);
      setLastUpdated(new Date());
    } catch {
      setError('Could not load news feed. Check that the server is running.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.eventType === filter);
  }, [events, filter]);

  const newsCount = events.filter((e) => e.eventType === 'news').length;
  const socialCount = events.filter((e) => e.eventType === 'social').length;

  return (
    <div className="news-page">
      <header className="news-hero">
        <div className="news-hero-text">
          <p className="news-hero-eyebrow">Live market intelligence</p>
          <h1 className="news-hero-title">News &amp; Top Stocks</h1>
          <p className="news-hero-desc">
            Headlines from Bloomberg, CNBC, Yahoo, Reddit and more — ranked by social buzz.
          </p>
        </div>
        <div className="news-hero-actions">
          <button
            type="button"
            className="news-refresh-btn"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            aria-label="Refresh news feed"
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
          {lastUpdated && (
            <span className="news-updated" aria-live="polite">
              Updated {formatRelativeTime(lastUpdated.toISOString())}
            </span>
          )}
        </div>
      </header>

      {!loading && (
        <div className="news-stats" role="group" aria-label="Feed statistics">
          <div className="news-stat-tile">
            <span className="news-stat-num">{topStocks.length}</span>
            <span className="news-stat-lbl">Top tickers</span>
          </div>
          <div className="news-stat-tile">
            <span className="news-stat-num">{newsCount}</span>
            <span className="news-stat-lbl">Headlines</span>
          </div>
          <div className="news-stat-tile">
            <span className="news-stat-num">{socialCount}</span>
            <span className="news-stat-lbl">Social posts</span>
          </div>
        </div>
      )}

      {error && (
        <div className="news-error" role="alert">
          {error}
          <button type="button" className="news-retry-btn" onClick={() => load()}>Try again</button>
        </div>
      )}

      {loading && <NewsSkeleton />}

      {!loading && !error && (
        <div className="news-page-layout">
          <aside className="news-panel news-panel-stocks" aria-labelledby="top-stocks-heading">
            <div className="news-panel-head">
              <h2 id="top-stocks-heading" className="news-panel-title">
                <span className="news-panel-icon" aria-hidden>◆</span>
                Top Rated Stocks
              </h2>
              <p className="news-panel-desc">Reddit mentions, WSB buzz &amp; headline cashtags</p>
            </div>

            {topStocks.length === 0 ? (
              <div className="news-empty-state">
                <span className="news-empty-icon" aria-hidden>📊</span>
                <p>No rankings yet</p>
                <span className="news-empty-hint">Collectors run every 6 hours</span>
              </div>
            ) : (
              <ol className="top-stocks-list" aria-label="Top rated stocks by buzz">
                {topStocks.map((t) => (
                  <li key={t.symbol} className={`top-stock-card ${rankClass(t.rank)}`}>
                    <span className={`top-stock-rank ${rankClass(t.rank)}`} aria-label={`Rank ${t.rank}`}>
                      {t.rank}
                    </span>
                    <div className="top-stock-body">
                      <Link
                        to={`/chart/${encodeURIComponent(t.symbol)}`}
                        className="top-stock-symbol"
                        aria-label={`View chart for ${t.symbol}, rank ${t.rank}`}
                      >
                        {t.symbol}
                      </Link>
                      <span className="top-stock-meta">
                        <span>{t.mentions.toLocaleString()} mentions</span>
                        {t.sentiment !== 0 && (
                          <span className={t.sentiment >= 0 ? 'chg-up' : 'chg-down'}>
                            {t.sentiment > 0 ? '+' : ''}{t.sentiment.toFixed(2)} sent.
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="top-stock-score" title="Buzz score">
                      <span className="top-stock-score-val">{Math.round(t.score)}</span>
                      <span className="top-stock-score-lbl">buzz</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </aside>

          <section className="news-panel news-panel-feed" aria-labelledby="headlines-heading">
            <div className="news-panel-head news-panel-head-row">
              <div>
                <h2 id="headlines-heading" className="news-panel-title">
                  <span className="news-panel-icon" aria-hidden>◇</span>
                  Latest Headlines
                </h2>
                <p className="news-panel-desc">{filteredEvents.length} items shown</p>
              </div>
              <div className="news-filter-chips" role="tablist" aria-label="Filter headlines">
                {(['all', 'news', 'social'] as FeedFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filter === f}
                    className={`news-filter-chip ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'news' ? 'News' : 'Social'}
                  </button>
                ))}
              </div>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="news-empty-state">
                <span className="news-empty-icon" aria-hidden>📰</span>
                <p>No headlines in this category</p>
                <span className="news-empty-hint">Try &quot;All&quot; or wait for the next collector run</span>
              </div>
            ) : (
              <div className="news-feed-list" role="feed" aria-labelledby="headlines-heading">
                {filteredEvents.map((item) => (
                  <article key={item.id} className="news-feed-card">
                    <div className="news-feed-card-top">
                      <span className={`news-source-badge source-${item.source.split('-')[0]}`}>
                        {sourceLabel(item.source)}
                      </span>
                      <span className={`news-type-pill news-type-${item.eventType}`}>
                        {item.eventType}
                      </span>
                      <time className="news-feed-time" dateTime={item.ts} title={item.ts}>
                        {formatRelativeTime(item.ts)}
                      </time>
                      {item.sentiment != null && item.sentiment !== 0 && (
                        <span
                          className={`news-sentiment-pill ${item.sentiment >= 0 ? 'sent-bull' : 'sent-bear'}`}
                          aria-label={`Sentiment ${item.sentiment.toFixed(2)}`}
                        >
                          {item.sentiment > 0 ? '+' : ''}{item.sentiment.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="news-feed-title"
                      >
                        {item.title}
                        <span className="news-external" aria-hidden> ↗</span>
                      </a>
                    ) : (
                      <h3 className="news-feed-title news-feed-title-plain">{item.title}</h3>
                    )}
                    {item.summary && (
                      <p className="news-feed-summary">{item.summary}</p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
