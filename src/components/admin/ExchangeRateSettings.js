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
          : `Saved. Back on Automatic: the shop uses today's market rate (${money(data.effectiveRate)} per $1).`)
        + (data.syncWarning ? ` ${data.syncWarning}` : ''),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const current = Number(info?.effectiveRate) > 0 ? Number(info.effectiveRate) : null;
  const isManual = info?.mode === 'manual';
  const unchanged = info
    && mode === info.mode
    && (mode === 'api' || Number(manualRate) === Number(info.manualRate));
  const optionStyle = (selected) => ({
    display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
    border: `1px solid ${selected ? 'rgba(96, 165, 250, 0.45)' : 'rgba(255, 255, 255, 0.06)'}`,
    background: selected ? 'rgba(59, 130, 246, 0.08)' : 'rgba(0, 0, 0, 0.2)',
  });
  const optionTitle = { display: 'block', fontSize: '0.84rem', fontWeight: 700, color: '#e2e8f0' };
  const optionHint = { display: 'block', fontSize: '0.74rem', color: '#64748b', lineHeight: 1.45, marginTop: '2px' };

  return (
    <section
      id="exchange-rate-settings"
      className="dashboard-section"
      aria-labelledby="exchange-rate-settings-title"
    >
      <div className="dashboard-section-heading-row">
        <h3 id="exchange-rate-settings-title" className="dashboard-section-title">Exchange rate (USD → CRC)</h3>
        {info && (
          <span
            className="dashboard-section-count"
            style={isManual ? { color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.35)' } : undefined}
          >
            {isManual ? 'Manual' : 'Automatic'}
          </span>
        )}
      </div>

      <div
        className="dashboard-health-card"
        style={{ display: 'grid', gap: '12px', alignItems: 'stretch' }}
      >
        <div>
          <div className="dashboard-health-title" style={{ fontSize: '1.05rem' }}>
            {info ? <>$1 = {money(current)}</> : 'Loading…'}
          </div>
          {info && (
            <div className="dashboard-health-copy">
              {isManual
                ? `Set by hand${info.manualSetBy ? ` by ${info.manualSetBy}` : ''}${info.manualSetAt ? ` on ${formatCrInstant(info.manualSetAt)}` : ''}. The automatic rate is being ignored.`
                : 'Automatic: the market rate, refreshed once a day.'}
              {' '}Today&apos;s market rate: {money(info.apiRate)}{info.apiRateIsLive ? '' : ' (last one received)'}.
              {' '}This one rate is used everywhere the shop turns dollars into colones: catalog prices, checkout, order edits and reports.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: '8px' }} role="radiogroup" aria-label="Exchange rate source">
          <label style={optionStyle(mode === 'api')}>
            <input type="radio" name="exchange-rate-mode" checked={mode === 'api'} onChange={() => setMode('api')} disabled={saving} style={{ marginTop: '3px' }} />
            <span>
              <span style={optionTitle}>Automatic</span>
              <span style={optionHint}>Follow the daily market rate. Recommended.</span>
            </span>
          </label>
          <label style={optionStyle(mode === 'manual')}>
            <input type="radio" name="exchange-rate-mode" checked={mode === 'manual'} onChange={() => setMode('manual')} disabled={saving} style={{ marginTop: '3px' }} />
            <span>
              <span style={optionTitle}>Manual</span>
              <span style={optionHint}>Use a fixed rate I enter. It stays until someone switches back to Automatic.</span>
            </span>
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
              style={{ width: '130px' }}
              aria-label="Manual colones per US dollar"
            />
            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
              More than 5% away from today&apos;s market rate asks you to confirm.
            </span>
          </label>
        )}

        {error && <p role="alert" style={{ margin: 0, color: '#fca5a5', fontSize: '0.82rem' }}>{error}</p>}
        {notice && <p role="status" style={{ margin: 0, color: '#86efac', fontSize: '0.82rem' }}>{notice}</p>}

        <div>
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => save(false)} disabled={saving || !info || unchanged}>
            {saving ? 'Saving…' : 'Save exchange rate'}
          </button>
        </div>
      </div>
    </section>
  );
}
