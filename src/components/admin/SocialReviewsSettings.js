'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';

/**
 * The Social Reviews tab: how review requests are sent, editable without a
 * deploy.
 *
 * Product reviews (the other sub-tab) are testimonials customers wrote on the
 * site and need moderating. This is the opposite job — the outbound side, where
 * asking too often or on the wrong site costs goodwill — so the two are kept
 * apart rather than crowded into one screen.
 *
 * Values save through /api/admin/review-settings, which normalises before
 * writing. Anything typed here that would break sending is corrected on save
 * and reflected back, rather than accepted and quietly misbehaving later.
 */

/** Statuses an order can be in. Multi-select: asking on "Shipped" is legitimate. */
const ORDER_STATUSES = [
  'Order Complete',
  'Completed',
  'Shipped',
  'Processing',
  'Paid',
  'Pending',
];

const card = {
  background: '#0e1626',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '16px',
};

const label = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#94a3b8',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const input = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: '#0b1220',
  color: '#f8fafc',
  fontSize: '0.92rem',
};

const hint = { fontSize: '0.78rem', color: '#64748b', marginTop: '6px', lineHeight: 1.5 };

function Field({ title, help, children }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={label}>{title}</label>
      {children}
      {help ? <div style={hint}>{help}</div> : null}
    </div>
  );
}

export default function SocialReviewsSettings() {
  const [settings, setSettings] = useState(null);
  const [effectiveLinks, setEffectiveLinks] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Plain language, shown next to the button. Never an alert().
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/review-settings');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not load the review settings');
      setSettings(data.settings);
      setEffectiveLinks(data.effectiveLinks || {});
      setNotice(null);
    } catch (err) {
      setNotice({ tone: 'error', text: `Could not load the settings: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (key, value) => setSettings((s) => ({ ...s, [key]: value }));

  const toggleStatus = (status) => {
    const current = settings.triggerStatuses || [];
    set('triggerStatuses', current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status]);
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await adminFetch('/api/admin/review-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not save');
      // Show what was actually stored, not what was typed: the server clamps
      // out-of-range numbers and drops links that are not links.
      setSettings(data.settings);
      setNotice({ tone: 'ok', text: 'Saved. New requests use these settings from now on.' });
    } catch (err) {
      setNotice({ tone: 'error', text: `Could not save: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ ...card, textAlign: 'center', color: '#94a3b8' }}>Loading review settings…</div>;
  }
  if (!settings) {
    return (
      <div style={{ ...card, textAlign: 'center', color: '#fca5a5' }}>
        {notice?.text || 'The review settings could not be loaded.'}
        <div style={{ marginTop: '12px' }}>
          <button className="admin-btn" onClick={load} style={{ padding: '6px 14px', cursor: 'pointer' }}>Try again</button>
        </div>
      </div>
    );
  }

  const googleShare = 100 - settings.trustpilotSharePct;

  return (
    <div className="admin-orders-tab">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0 }}>Social Review Requests</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {notice ? (
            <span style={{ fontSize: '0.85rem', color: notice.tone === 'ok' ? '#4ade80' : '#fca5a5' }}>
              {notice.text}
            </span>
          ) : null}
          <button
            className="admin-btn"
            onClick={save}
            disabled={saving}
            style={{
              padding: '8px 18px', fontSize: '0.88rem', borderRadius: '8px', fontWeight: 700,
              background: saving ? 'rgba(148,163,184,0.2)' : 'rgba(74, 222, 128, 0.12)',
              border: '1px solid rgba(74, 222, 128, 0.3)', color: '#4ade80',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>

      {/* ── When a request is sent ─────────────────────────────────────── */}
      <div style={card}>
        <h3 style={{ color: '#f8fafc', fontSize: '1rem', margin: '0 0 16px' }}>When to ask</h3>

        <Field
          title="Order statuses that trigger a request"
          help="An order is only asked about once it reaches one of these. Most shops use Order Complete."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {ORDER_STATUSES.map((status) => {
              const on = (settings.triggerStatuses || []).includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  style={{
                    padding: '7px 14px', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600,
                    cursor: 'pointer',
                    background: on ? 'rgba(56, 189, 248, 0.14)' : 'rgba(148,163,184,0.08)',
                    border: `1px solid ${on ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color: on ? '#38bdf8' : '#94a3b8',
                  }}
                >
                  {on ? '✓ ' : ''}{status}
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          title="Wait before asking (days)"
          help="Counted from when the order reached one of the statuses above. Trustpilot runs on its own delay, set in the Trustpilot dashboard."
        >
          <input
            type="number" min="0" max="365" style={input}
            value={settings.waitDays}
            onChange={(e) => set('waitDays', e.target.value)}
          />
        </Field>

        <Field
          title="Gap before asking the same customer again (days)"
          help="Stops a repeat buyer being asked on every order. They are asked at most once in this window, whatever they buy."
        >
          <input
            type="number" min="0" max="3650" style={input}
            value={settings.reaskAfterDays}
            onChange={(e) => set('reaskAfterDays', e.target.value)}
          />
        </Field>

        <Field
          title="Requests before a customer is left alone"
          help="Someone who never clicks is asked this many times, then flagged as having ignored them and never asked again. Customers who click are not counted here."
        >
          <input
            type="number" min="1" max="10" style={input}
            value={settings.maxAsksWithoutClick}
            onChange={(e) => set('maxAsksWithoutClick', e.target.value)}
          />
        </Field>
      </div>

      {/* ── Which site ─────────────────────────────────────────────────── */}
      <div style={card}>
        <h3 style={{ color: '#f8fafc', fontSize: '1rem', margin: '0 0 16px' }}>Which site they are asked for</h3>

        <Field
          title={`Split: ${settings.trustpilotSharePct}% Trustpilot, ${googleShare}% Google + Facebook`}
          help="Each customer is asked for one site only, never both. New customers are divided by this ratio."
        >
          <input
            type="range" min="0" max="100" step="5"
            value={settings.trustpilotSharePct}
            onChange={(e) => set('trustpilotSharePct', Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
            <span>All Google + Facebook</span>
            <span>All Trustpilot</span>
          </div>
        </Field>

        <Field
          title="Trustpilot invitations per month"
          help="Trustpilot's plan caps how many invitations it will deliver. Past this number everyone goes to Google and Facebook instead, and it resets on the 1st. Set 0 to stop using Trustpilot."
        >
          <input
            type="number" min="0" style={input}
            value={settings.trustpilotMonthlyCap}
            onChange={(e) => set('trustpilotMonthlyCap', e.target.value)}
          />
        </Field>
      </div>

      {/* ── Links ──────────────────────────────────────────────────────── */}
      <div style={card}>
        <h3 style={{ color: '#f8fafc', fontSize: '1rem', margin: '0 0 6px' }}>Review links</h3>
        <p style={{ ...hint, marginTop: 0, marginBottom: '16px' }}>
          Leave blank to use the links set in Business Links. A Google link should open the
          rating form (g.page/r/…/review), not the map listing, or customers have to hunt for
          the review button themselves.
        </p>

        <Field title="Google review link" help={effectiveLinks.google ? `Currently using: ${effectiveLinks.google}` : null}>
          <input
            type="url" style={input} placeholder={effectiveLinks.google || 'https://g.page/r/…/review'}
            value={settings.googleReviewUrl}
            onChange={(e) => set('googleReviewUrl', e.target.value)}
          />
        </Field>

        <Field title="Facebook review link" help={effectiveLinks.facebook ? `Currently using: ${effectiveLinks.facebook}` : null}>
          <input
            type="url" style={input} placeholder={effectiveLinks.facebook || 'https://www.facebook.com/…/reviews'}
            value={settings.facebookReviewUrl}
            onChange={(e) => set('facebookReviewUrl', e.target.value)}
          />
        </Field>

        <Field
          title="Trustpilot review link"
          help="Only used for the storefront badge. Trustpilot's invitation email is sent by Trustpilot with their own link, which cannot be changed here."
        >
          <input
            type="url" style={input} placeholder={effectiveLinks.trustpilot || 'https://www.trustpilot.com/review/…'}
            value={settings.trustpilotReviewUrl}
            onChange={(e) => set('trustpilotReviewUrl', e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}
