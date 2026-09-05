'use client';

import { useCallback, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';

/**
 * "Ask for review" on a completed order.
 *
 * Two steps on purpose. The first picks the site, because the whole review
 * system is built on asking one person about one site. The second exists
 * because the customer is usually ALREADY queued to be asked automatically in a
 * couple of days — sending now replaces that rather than adding to it, and
 * someone clicking this button deserves to know that before it goes.
 *
 * Trustpilot is not offered: those invitations are triggered by a BCC on the
 * order-complete email and sent by Trustpilot on their own schedule, so there
 * is nothing to fire on demand.
 */

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.72)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: '20px',
};

const dialog = {
  background: '#0e1626', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '440px',
  boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
};

const choice = (on) => ({
  display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
  padding: '13px 16px', marginBottom: '10px', borderRadius: '10px',
  fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left',
  background: on ? 'rgba(56, 189, 248, 0.14)' : 'rgba(148,163,184,0.06)',
  border: `1px solid ${on ? 'rgba(56,189,248,0.45)' : 'rgba(255,255,255,0.08)'}`,
  color: on ? '#38bdf8' : '#cbd5e1',
});

const btn = (tone) => ({
  padding: '9px 18px', borderRadius: '8px', fontSize: '0.88rem', fontWeight: 700,
  cursor: 'pointer', border: '1px solid',
  ...(tone === 'primary'
    ? { background: 'rgba(74, 222, 128, 0.12)', borderColor: 'rgba(74, 222, 128, 0.35)', color: '#4ade80' }
    : { background: 'rgba(148,163,184,0.08)', borderColor: 'rgba(255,255,255,0.1)', color: '#94a3b8' }),
});

const PLATFORMS = [
  { id: 'google', label: 'Google', note: 'Opens the star rating form' },
  { id: 'facebook', label: 'Facebook', note: 'Opens your reviews page' },
];

export default function AskForReviewButton({ order, onDone }) {
  const [step, setStep] = useState(null); // null | 'choose' | 'confirm' | 'done'
  const [picked, setPicked] = useState(['google', 'facebook']);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = useCallback(async () => {
    setError('');
    setStep('choose');
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/reviews/send?orderId=${encodeURIComponent(order.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not check this order');
      setInfo(data);
      // Default to what the rules would have offered: if they already clicked
      // Google, this opens with Facebook ticked and Google not.
      if (data.suggested?.length) setPicked(data.suggested);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [order.id]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/reviews/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, platforms: picked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not send');
      setStep('done');
      if (onDone) onDone(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => { setStep(null); setInfo(null); setError(''); };

  const clickedBefore = (info?.history || []).filter((h) => h.clicked);

  return (
    <>
      <button
        type="button"
        onClick={open}
        style={{
          padding: '6px 14px', fontSize: '0.82rem', fontWeight: 700, borderRadius: '8px',
          cursor: 'pointer', background: 'rgba(250, 204, 21, 0.1)',
          border: '1px solid rgba(250, 204, 21, 0.28)', color: '#facc15',
        }}
      >
        ★ Ask for review
      </button>

      {step === 'choose' && (
        <div style={overlay} onClick={close}>
          <div style={dialog} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', color: '#f8fafc', fontSize: '1.05rem' }}>Ask for a review</h3>
            <p style={{ margin: '0 0 18px', color: '#94a3b8', fontSize: '0.85rem' }}>
              {order.order_number} · {info?.customerEmail || order.customer_email || 'no email on this order'}
            </p>

            {busy && !info ? (
              <div style={{ color: '#94a3b8', padding: '20px 0' }}>Checking this customer…</div>
            ) : (
              <>
                {clickedBefore.length > 0 && (
                  <div style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '0.83rem', color: '#7dd3fc' }}>
                    This customer already clicked {clickedBefore.map((h) => h.clicked).join(' and ')} before.
                    They have probably reviewed there.
                  </div>
                )}

                {info?.alreadyAsked && (
                  <div style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.22)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '0.83rem', color: '#fde68a' }}>
                    A review request has already been sent for this order.
                  </div>
                )}

                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Which site?
                </div>

                {PLATFORMS.map((p) => (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)} style={choice(picked.includes(p.id))}>
                    <span style={{ fontSize: '1rem' }}>{picked.includes(p.id) ? '☑' : '☐'}</span>
                    <span>
                      {p.label}
                      <span style={{ display: 'block', fontSize: '0.76rem', fontWeight: 400, opacity: 0.75 }}>{p.note}</span>
                    </span>
                  </button>
                ))}

                {error && <div style={{ color: '#fca5a5', fontSize: '0.83rem', margin: '10px 0' }}>{error}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                  <button type="button" style={btn()} onClick={close}>Cancel</button>
                  <button
                    type="button"
                    style={{ ...btn('primary'), opacity: picked.length ? 1 : 0.5, cursor: picked.length ? 'pointer' : 'default' }}
                    disabled={!picked.length || !info?.canSend}
                    onClick={() => setStep('confirm')}
                  >
                    Continue
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div style={overlay} onClick={close}>
          <div style={dialog} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', color: '#f8fafc', fontSize: '1.05rem' }}>Send it now?</h3>

            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 14px' }}>
              {info?.queuedAutomatically
                ? `This customer is already due to be asked automatically in about ${info.waitDays} day${info.waitDays === 1 ? '' : 's'}.`
                : 'This customer is not queued for an automatic request.'}
            </p>

            <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6, margin: '0 0 18px' }}>
              Sending now <strong style={{ color: '#e2e8f0' }}>replaces</strong> that — they will not get a second one.
              They will be asked for <strong style={{ color: '#e2e8f0' }}>{picked.join(' and ')}</strong>.
            </p>

            {error && <div style={{ color: '#fca5a5', fontSize: '0.83rem', marginBottom: '12px' }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" style={btn()} onClick={() => setStep('choose')} disabled={busy}>Back</button>
              <button type="button" style={btn('primary')} onClick={send} disabled={busy}>
                {busy ? 'Sending…' : 'Send now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={overlay} onClick={close}>
          <div style={dialog} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px', color: '#4ade80', fontSize: '1.05rem' }}>Review request sent</h3>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 18px' }}>
              Sent to {info?.customerEmail}. If they click, it will show against this customer.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" style={btn('primary')} onClick={close}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
