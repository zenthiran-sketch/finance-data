import { useCallback, useEffect, useState } from 'react';
import { fetchNews, fetchSentiment, scrapeSymbolNews } from '../api';

interface NewsEvent {
  id: string;
  title?: string;
  summary?: string;
  url?: string;
  sentiment?: number;
  source: string;
  eventType: string;
  ts: string;
}

interface SentimentData {
  composite: number | null;
  sentimentTrend: number | null;
  delta24h: number | null;
  trendConfidence: number | null;
  metrics: Array<{ key: string; value: number; ts: string; source: string }>;
}

const SOURCE_LABELS: Record<string, string> = {
  bloomberg: 'Bloomberg',
  cnbc: 'CNBC',
  yahoo: 'Yahoo',
  cnn: 'CNN',
  marketwatch: 'MarketWatch',
  finnhub: 'Finnhub',
  stockdata: 'StockData',
  gdelt: 'GDELT',
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

function sentimentLabel(v: number | null | undefined) {
  if (v == null) return 'Neutral';
  if (v > 0.3) return 'Bullish';
  if (v < -0.3) return 'Bearish';
  return 'Neutral';
}

function sentimentColor(v: number | null | undefined) {
  if (v == null) return 'var(--text-faint)';
  if (v > 0.3) return 'var(--buy)';
  if (v < -0.3) return 'var(--sell)';
  return 'var(--accent)';
}

function trendLabel(trend: number | null | undefined) {
  if (trend == null || trend === 0) return null;
  return trend > 0 ? 'Newly bullish' : 'Newly bearish';
}

function NewsSkeleton() {
  return (
    <div className="chart-news-skeleton" aria-hidden>
      <div className="wl-skeleton-block" style={{ height: 80, marginBottom: 12 }} />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="wl-skeleton-card" style={{ height: 72, marginBottom: 8 }} />
      ))}
    </div>
  );
}

export default function NewsSentimentPanel({ symbol }: { symbol: string }) {
  const [news, setNews] = useState<NewsEvent[]>([]);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeMessage, setScrapeMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'news' | 'social'>('all');

  const load = useCallback(async (silent = false) => {
    if (!symbol) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [n, s] = await Promise.all([
        fetchNews(symbol, 25).catch(() => []),
        fetchSentiment(symbol).catch(() => null),
      ]);
      setNews(Array.isArray(n) ? n : []);
      setSentiment(s);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setScrapeMessage(null); }, [symbol]);

  const handleScrape = useCallback(async () => {
    if (!symbol) return;
    setScraping(true);
    setScrapeMessage(null);
    try {
      const result = await scrapeSymbolNews(symbol);
      if (result.message) {
        setScrapeMessage(result.message);
      } else if (result.total > 0) {
        const newsCount = result.finnhub + result.stockdata + result.newsSentiment;
        const parts: string[] = [];
        if (newsCount > 0) parts.push(`${newsCount} news`);
        if (result.social > 0) parts.push(`${result.social} social`);
        setScrapeMessage(`Fetched ${parts.join(' and ')} — sentiment updated.`);
      }
      await load(true);
    } catch {
      setScrapeMessage('Failed to fetch news. Check API keys in Settings.');
    } finally {
      setScraping(false);
    }
  }, [symbol, load]);

  const score = sentiment?.composite ?? sentiment?.metrics.find((m) => m.key === 'sentiment_score')?.value;
  const trendText = trendLabel(sentiment?.sentimentTrend ?? null);

  const filtered = filter === 'all'
    ? news
    : news.filter((e) => e.eventType === filter);

  return (
    <div className="chart-news-panel">
      <div className="chart-panel-head chart-panel-head-row">
        <div>
          <h2 id="chart-news-heading" className="chart-panel-title">
            <span className="chart-panel-icon" aria-hidden>◇</span>
            News for {symbol}
          </h2>
          <p className="chart-panel-desc">
            Headlines and social sentiment for this symbol from keyed sources and Reddit
          </p>
        </div>
        <div className="chart-panel-actions">
          <button
            type="button"
            className="chart-scrape-btn"
            onClick={handleScrape}
            disabled={loading || refreshing || scraping}
            aria-busy={scraping}
          >
            {scraping ? 'Fetching…' : 'Fetch news & social'}
          </button>
          <button
            type="button"
            className="chart-refresh-btn"
            onClick={() => load(true)}
            disabled={loading || refreshing || scraping}
            aria-label="Refresh news"
          >
            {refreshing ? '…' : '↻'}
          </button>
        </div>
      </div>

      {scrapeMessage && (
        <p className="chart-scrape-message" role="status">{scrapeMessage}</p>
      )}

      {loading ? (
        <NewsSkeleton />
      ) : (
        <>
          <div className="chart-sentiment-tile" role="status" aria-label="Sentiment summary">
            <div className="chart-sentiment-score" style={{ color: sentimentColor(score) }}>
              {score != null ? `${score > 0 ? '+' : ''}${score.toFixed(2)}` : '—'}
            </div>
            <div className="chart-sentiment-label" style={{ color: sentimentColor(score) }}>
              {sentimentLabel(score)}
            </div>
            {trendText && (
              <div className={`sentiment-trend-badge ${sentiment?.sentimentTrend! > 0 ? 'trend-bull' : 'trend-bear'}`}>
                {sentiment?.sentimentTrend! > 0 ? '▲' : '▼'} {trendText}
                {sentiment?.delta24h != null && (
                  <span className="trend-delta-inline">
                    {' '}({sentiment.delta24h >= 0 ? '+' : ''}{sentiment.delta24h.toFixed(2)} 24h)
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="news-filter-chips" role="tablist" aria-label="Filter headlines">
            {(['all', 'news', 'social'] as const).map((f) => (
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

          {filtered.length === 0 ? (
            <div className="news-empty-state chart-news-empty">
              <span className="news-empty-icon" aria-hidden>📰</span>
              <p>No headlines for {symbol} yet</p>
              <span className="news-empty-hint">
                Market-wide collectors run every 15 minutes, or click Fetch news & social to pull headlines and Reddit sentiment now.
              </span>
            </div>
          ) : (
            <div className="news-feed-list chart-news-feed" role="feed" aria-labelledby="chart-news-heading">
              {filtered.map((item) => (
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
        </>
      )}
    </div>
  );
}
