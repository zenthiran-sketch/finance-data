import { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import WatchlistPage from './pages/Watchlist';
import ApiKeysSettings from './pages/ApiKeysSettings';
import DataExplorer from './pages/DataExplorer';
import BacktestPage from './pages/Backtest';
import ChartPage from './pages/ChartPage';
import NewsPage from './pages/NewsPage';

const NAV = [
  { to: '/', label: 'Dashboard', match: (p: string) => p === '/' },
  { to: '/chart', label: 'Charts', match: (p: string) => p.startsWith('/chart') },
  { to: '/news', label: 'News', match: (p: string) => p === '/news' },
  { to: '/watchlist', label: 'Watchlist', match: (p: string) => p === '/watchlist' },
  { to: '/data', label: 'Data', match: (p: string) => p === '/data' },
  { to: '/settings/api-keys', label: 'API Keys', match: (p: string) => p.startsWith('/settings') },
];

export default function App() {
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <Link to="/" className="brand-link">
            <div className="brand">SIGNAL<span className="slash">://</span>TERMINAL</div>
            <div className="brand-sub">Crypto · NSE · FX · Mutual Funds</div>
          </Link>
        </div>
        <button
          type="button"
          className="nav-toggle"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span /><span /><span />
        </button>
        <nav className={`nav ${menuOpen ? 'open' : ''}`}>
          {NAV.map(({ to, label, match }) => (
            <Link
              key={to}
              to={to}
              className={match(loc.pathname) ? 'active' : ''}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chart" element={<ChartPage />} />
          <Route path="/chart/:symbol" element={<ChartPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/data" element={<DataExplorer />} />
          <Route path="/settings/api-keys" element={<ApiKeysSettings />} />
          <Route path="/backtest/:symbol" element={<BacktestPage />} />
        </Routes>
      </main>
    </div>
  );
}
