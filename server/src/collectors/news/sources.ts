/** Busy financial pages + subreddits — market-wide ingestion only (no per-symbol API calls). */

export const RSS_FEEDS = [
  { id: 'bloomberg', name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss' },
  { id: 'cnbc', name: 'CNBC Top News', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { id: 'yahoo', name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
  { id: 'cnn', name: 'CNN Business', url: 'http://rss.cnn.com/rss/money_latest.rss' },
  { id: 'marketwatch', name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
  { id: 'marketwatch-markets', name: 'MarketWatch Markets', url: 'https://feeds.marketwatch.com/marketwatch/marketpulse/' },
  { id: 'reuters', name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews' },
  { id: 'ft', name: 'Financial Times', url: 'https://www.ft.com/rss/home' },
] as const;

export const GDELT_GAL_RSS = 'http://data.gdeltproject.org/gdeltv3/gal/feed.rss';

/** High-traffic investing subreddits (public JSON + OAuth). */
export const REDDIT_SUBREDDITS = [
  'wallstreetbets',
  'stocks',
  'investing',
  'StockMarket',
  'options',
  'Daytrading',
  'SecurityAnalysis',
  'pennystocks',
  'wallstreetbetsOG',
  'ValueInvesting',
] as const;

export const APEWISDOM_FILTERS = [
  'all-stocks',
  'wallstreetbets',
  'stocks',
  'investing',
] as const;
