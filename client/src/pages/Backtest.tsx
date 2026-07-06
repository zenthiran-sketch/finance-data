import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import PriceChart from '../components/PriceChart';
import { fetchBacktest } from '../api';

export default function BacktestPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const [data, setData] = useState<{
    bars: Array<{ ts: string; open?: number; high?: number; low?: number; close: number; volume?: number | null }>;
    signals: Array<{ computedAt: string; signal: string; confidence: number }>;
  }>({ bars: [], signals: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    fetchBacktest(symbol).then(setData).finally(() => setLoading(false));
  }, [symbol]);

  return (
    <div className="chart-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            <span className="symbol-name">Backtest: {symbol}</span>
          </div>
          <div className="page-subtitle">
            <Link to={`/chart/${encodeURIComponent(symbol || '')}`}>Open full chart →</Link>
          </div>
        </div>
      </div>

      <div className="panel chart-main" style={{ marginBottom: 16 }}>
        {loading ? <div className="chart-empty" style={{ height: 300 }}>Loading…</div> : (
          <PriceChart bars={data.bars} signals={data.signals} height={300} />
        )}
      </div>

      <div className="panel">
        <h2>Signal History</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Signal</th><th>Confidence</th></tr></thead>
            <tbody>
              {data.signals.slice(-20).reverse().map((s) => (
                <tr key={s.computedAt}><td>{s.computedAt.slice(0, 10)}</td><td>{s.signal}</td><td>{s.confidence}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
