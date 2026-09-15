'use client';

import React, { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { formatCrInstant } from '@/lib/crTime.mjs';

const money = (rate) => (Number(rate) > 0 ? `₡${Number(rate).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—');

/**
 * Superadmin switch: follow the API rate, or set USD -> CRC by hand.
 * The server refuses anyone else; this box is only mounted for superadmins.
 */
export default function ExchangeRateSettings({ onChanged }) {
  const [info, setInfo] = useState(null);
  const [mode, setMode] = useState('api');
  const [manualRate, setManualRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const apply = (data) => {
    setInfo(data);
    setMode(data.mode);
    const suggested = data.manualRate || data.apiRate;
    setManualRate(suggested ? String(Math.round(Number(suggested) * 100) / 100) : '');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await adminFetch('/api/admin/exchange-rate');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load the exchange rate setting.');
        if (!cancelled) apply(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async (confirmed = false) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await adminFetch('/api/admin/exchange-rate', {
        method: 'PUT',
        body: JSON.stringify({ mode, manualRate: mode === 'manual' ? manualRate : undefined, confirmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.code === 'needs_confirmation') {
        setSaving(false);
        if (window.confirm(data.error)) await save(true);
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Could not save the exchange rate.');
      apply(data);
      onChanged?.(data);
      setNotice(
        (data.mode === 'manual'
          ? `Saved. The whole shop now uses ${money(data.effectiveRate)} per $1.`
          : `Saved. The shop follows the API again (${money(data.effectiveRate)} per $1).`)
        + (data.syncWarning ? ` ${data.syncWarning}` : ''),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const radioStyle = { display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.85rem', color: '#e2e8f0', cursor: 'pointer' };

  return (
    <section
      aria-labelledby="exchange-rate-settings-title"
      style={{
        border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: '10px', padding: '14px 16px',
        marginBottom: '16px', background: 'rgba(15, 23, 42, 0.5)', display: 'grid', gap: '10px',
      }}
    >
      <div>
        <h4 id="exchange-rate-settings-title" style={{ margin: 0, fontSize: '0.95rem' }}>Exchange rate (USD → CRC)</h4>
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
          {info
            ? <>
                Shop is using <strong style={{ color: '#e2e8f0' }}>{money(info.effectiveRate)}</strong> per $1
                {info.mode === 'manual'
                  ? ` — set by hand${info.manualSetBy ? ` by ${info.manualSetBy}` : ''}${info.manualSetAt ? ` on ${formatCrInstant(info.manualSetAt)}` : ''}.`
                  : ' from the API (updates once a day).'}
                {' '}Today&apos;s API rate: {money(info.apiRate)}{info.apiRateIsLive ? '' : ' (last saved)'}.
              </>
            : 'Loading…'}
        </p>
      </div>

      <div style={{ display: 'grid', gap: '6px' }} role="radiogroup" aria-label="Exchange rate source">
        <label style={radioStyle}>
          <input type="radio" name="exchange-rate-mode" checked={mode === 'api'} onChange={() => setMode('api')} disabled={saving} />
          <span>Follow the API</span>
        </label>
        <label style={radioStyle}>
          <input type="radio" name="exchange-rate-mode" checked={mode === 'manual'} onChange={() => setMode('manual')} disabled={saving} />
          <span>Set it myself — the API is ignored until I switch back</span>
        </label>
      </div>

      {mode === 'manual' && (
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.85rem', color: '#cbd5e1' }}>
          $1 = ₡
          <input
            className="admin-input"
            type="number"
            inputMode="decimal"
            min="300"
            max="800"
            step="0.01"
            value={manualRate}
            onChange={(event) => setManualRate(event.target.value)}
            disabled={saving}
            style={{ width: '120px' }}
            aria-label="Manual colones per US dollar"
          />
        </label>
      )}

      {error && <p role="alert" style={{ margin: 0, color: '#fca5a5', fontSize: '0.82rem' }}>{error}</p>}
      {notice && <p role="status" style={{ margin: 0, color: '#86efac', fontSize: '0.82rem' }}>{notice}</p>}

      <div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => save(false)} disabled={saving || !info}>
          {saving ? 'Saving…' : 'Save exchange rate'}
        </button>
      </div>
    </section>
  );
}
