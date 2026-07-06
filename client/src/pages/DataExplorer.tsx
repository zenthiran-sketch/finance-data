import { useEffect, useState } from 'react';
import { fetchTimeseriesCatalog, fetchBars } from '../api';

export default function DataExplorer() {
  const [catalog, setCatalog] = useState<Array<{ instrumentId: string; count: number; minTs: string; maxTs: string }>>([]);
  const [selected, setSelected] = useState('');
  const [bars, setBars] = useState<Array<{ ts: string; close: number; volume: number }>>([]);

  useEffect(() => {
    fetchTimeseriesCatalog().then(setCatalog);
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetchBars(selected).then(setBars);
  }, [selected]);

  const exportCsv = () => {
    const csv = ['ts,close,volume', ...bars.map((b) => `${b.ts},${b.close},${b.volume}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bars-${selected}.csv`;
    a.click();
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 14, color: 'var(--text-dim)', margin: '0 0 12px' }}>Data Explorer — stored time series</h2>
      <div className="two-panel">
        <div className="panel">
          <h2>Datasets</h2>
          <div className="table-wrap">
          <table>
            <thead><tr><th>Instrument</th><th>Rows</th><th>Range</th></tr></thead>
            <tbody>
              {catalog.map((c) => (
                <tr key={c.instrumentId} style={{ cursor: 'pointer', background: selected === c.instrumentId ? 'var(--panel-2)' : undefined }} onClick={() => setSelected(c.instrumentId)}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{c.instrumentId.slice(0, 8)}…</td>
                  <td>{c.count}</td>
                  <td style={{ fontSize: 11 }}>{c.minTs} → {c.maxTs}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <div className="panel">
          <h2>Preview {selected ? `(${bars.length} bars)` : ''}</h2>
          {selected && <button type="button" onClick={exportCsv} style={{ marginBottom: 8 }}>Export CSV</button>}
          <div className="table-wrap" style={{ maxHeight: 400, overflow: 'auto' }}>
            <table>
              <thead><tr><th>Date</th><th>Close</th><th>Volume</th></tr></thead>
              <tbody>
                {bars.slice(-50).map((b) => (
                  <tr key={b.ts}><td>{b.ts}</td><td>{b.close}</td><td>{b.volume}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
