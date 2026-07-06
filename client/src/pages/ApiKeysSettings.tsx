import { useEffect, useState } from 'react';
import { fetchCredentials, fetchProviders, saveCredential, deleteCredential } from '../api';

interface Credential {
  id: string;
  providerId: string;
  label: string;
  keyHint: string;
  status: string;
  pipelines: string[];
  headroom: number;
}

interface Provider {
  id: string;
  name: string;
  signupUrl?: string;
  limits: Record<string, number>;
  pipelines: string[];
  requiresKey: boolean;
}

function formatLimits(limits: Record<string, number>) {
  const parts: string[] = [];
  if (limits.perMinute) parts.push(`${limits.perMinute}/min`);
  if (limits.perDay) parts.push(`${limits.perDay}/day`);
  if (limits.perMonth) parts.push(`${limits.perMonth}/mo`);
  return parts.length ? parts.join(' · ') : 'No published limits';
}

function statusClass(status: string) {
  if (status === 'active') return 'status-active';
  if (status === 'invalid') return 'status-invalid';
  if (status === 'rate_limited') return 'status-limited';
  return 'status-unknown';
}

function headroomPct(headroom: number, limits: Record<string, number>) {
  const cap = limits.perMinute ?? limits.perDay ?? limits.perMonth ?? 100;
  return Math.min(100, Math.round((headroom / cap) * 100));
}

export default function ApiKeysSettings() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState({ providerId: 'finnhub', label: '', apiKey: '', apiSecret: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    const [c, p] = await Promise.all([fetchCredentials(), fetchProviders()]);
    setCreds(c);
    const keyed = p.filter((x: Provider) => x.requiresKey);
    setProviders(keyed);
    if (keyed.length && !keyed.find((x: Provider) => x.id === form.providerId)) {
      setForm((f) => ({ ...f, providerId: keyed[0].id }));
    }
  };

  useEffect(() => { load(); }, []);

  const onSave = async () => {
    if (!form.apiKey.trim()) {
      setError('API key is required');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const provider = providers.find((p) => p.id === form.providerId);
      await saveCredential({
        providerId: form.providerId,
        label: form.label.trim() || `${provider?.name ?? 'Key'} ${creds.filter((c) => c.providerId === form.providerId).length + 1}`,
        apiKey: form.apiKey.trim(),
        apiSecret: form.apiSecret.trim() || undefined,
        pipelines: provider?.pipelines || [],
      });
      setForm((f) => ({ ...f, apiKey: '', apiSecret: '', label: '' }));
      setSuccess('Key validated and saved');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save key');
    } finally {
      setSaving(false);
    }
  };

  const selectedProvider = providers.find((p) => p.id === form.providerId);
  const activeCount = creds.filter((c) => c.status === 'active').length;

  return (
    <div className="api-keys-page">
      <header className="api-keys-header">
        <div>
          <h1 className="api-keys-title">API Keys</h1>
          <p className="api-keys-subtitle">
            Free-tier providers only. Keys are encrypted at rest and rotated automatically under rate limits.
          </p>
        </div>
        <div className="api-keys-summary">
          <div className="summary-tile">
            <span className="summary-num">{creds.length}</span>
            <span className="summary-lbl">Keys saved</span>
          </div>
          <div className="summary-tile">
            <span className="summary-num">{activeCount}</span>
            <span className="summary-lbl">Active</span>
          </div>
          <div className="summary-tile">
            <span className="summary-num">{providers.length}</span>
            <span className="summary-lbl">Providers</span>
          </div>
        </div>
      </header>

      <section className="panel api-keys-form-panel">
        <h2>Add new key</h2>
        <div className="api-form-grid">
          <label className="form-field">
            <span className="form-label">Provider</span>
            <select
              className="form-input"
              value={form.providerId}
              onChange={(e) => setForm({ ...form, providerId: e.target.value })}
            >
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Label</span>
            <input
              className="form-input"
              placeholder="e.g. Finnhub account 2"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </label>
          <label className="form-field form-field-wide">
            <span className="form-label">API Key</span>
            <input
              className="form-input"
              type="password"
              placeholder="Paste your API key"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="form-field form-field-wide">
            <span className="form-label">API Secret <span className="form-optional">(optional)</span></span>
            <input
              className="form-input"
              type="password"
              placeholder="Only if required by provider"
              value={form.apiSecret}
              onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
              autoComplete="off"
            />
          </label>
        </div>
        {selectedProvider && (
          <div className="form-provider-hint">
            <span>{formatLimits(selectedProvider.limits)}</span>
            {selectedProvider.signupUrl && (
              <a href={selectedProvider.signupUrl} target="_blank" rel="noreferrer">Get free key →</a>
            )}
          </div>
        )}
        {error && <div className="form-alert form-alert-error">{error}</div>}
        {success && <div className="form-alert form-alert-success">{success}</div>}
        <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Testing…' : 'Test & Save'}
        </button>
      </section>

      <section className="api-providers-grid">
        {providers.map((p) => {
          const pCreds = creds.filter((c) => c.providerId === p.id);
          return (
            <article key={p.id} className="provider-card-v2">
              <div className="provider-card-head">
                <div>
                  <h3 className="provider-name">{p.name}</h3>
                  <p className="provider-limits">{formatLimits(p.limits)}</p>
                </div>
                {p.signupUrl && (
                  <a className="provider-signup" href={p.signupUrl} target="_blank" rel="noreferrer">
                    Sign up
                  </a>
                )}
              </div>

              <div className="provider-pipelines">
                {p.pipelines.map((pipe) => (
                  <span key={pipe} className="pipeline-chip">{pipe.replace('prices-', '').replace(/-/g, ' ')}</span>
                ))}
              </div>

              {pCreds.length === 0 ? (
                <div className="provider-empty">No keys configured</div>
              ) : (
                <ul className="credential-list">
                  {pCreds.map((c) => {
                    const pct = headroomPct(c.headroom, p.limits);
                    return (
                      <li key={c.id} className="credential-item">
                        <div className="credential-main">
                          <div className="credential-top">
                            <span className="credential-label">{c.label}</span>
                            <span className={`status-badge ${statusClass(c.status)}`}>{c.status}</span>
                          </div>
                          <div className="credential-meta">
                            <span className="credential-hint">••••{c.keyHint}</span>
                            <span className="credential-headroom-label">{c.headroom} req headroom</span>
                          </div>
                          <div className="conf-bar" aria-hidden>
                            <div
                              className={`conf-fill ${pct < 25 ? 'headroom-low' : ''}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn-ghost btn-delete"
                          onClick={async () => { await deleteCredential(c.id); load(); }}
                          aria-label={`Delete ${c.label}`}
                        >
                          Delete
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
