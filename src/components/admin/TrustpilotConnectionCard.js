'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/adminApi';

/**
 * Is Trustpilot actually receiving our invitations?
 *
 * The old BCC path made the invitation inseparable from the customer receipt.
 * SMTP acceptance proved only that the submission server accepted both
 * recipients, not that Trustpilot received or processed its copy. The app's
 * records, Trustpilot's overview and its broken invitation analytics currently
 * contradict one another, so this card exposes the active method and address.
 *
 * So the address lives here, in the open, next to a button that sends one real
 * message through the real path and tells you exactly where to look for it.
 */

const card = {
  background: '#0e1626',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '16px',
};

const muted = { fontSize: '0.78rem', color: '#64748b', lineHeight: 1.55 };

const input = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: '#0b1220',
  color: '#f8fafc',
  fontSize: '0.92rem',
};

const SOURCE_LABEL = {
  panel: 'set here, on this screen',
  env: 'coming from the TRUSTPILOT_AFS_BCC server setting, which nobody can read back',
  default: 'the built-in fallback, because nothing has been set',
};

export default function TrustpilotConnectionCard({ settings, onChange, effective }) {
  const [testTo, setTestTo] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const inUse = effective?.trustpilotBcc || '';
  const source = effective?.trustpilotBccSource || 'default';

  const sendTest = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await adminFetch('/api/admin/reviews/trustpilot-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'The test could not be sent');
      setResult({ tone: body.bccAccepted ? 'ok' : 'error', ...body });
    } catch (err) {
      setResult({ tone: 'error', message: err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={card}>
      <h3 style={{ color: '#f8fafc', fontSize: '1rem', margin: '0 0 6px' }}>Is Trustpilot receiving us?</h3>
      <p style={{ ...muted, marginTop: 0, marginBottom: '16px' }}>
        A Trustpilot invitation starts when this address receives the order data, either in its own
        small trigger email or as a hidden copy of the customer receipt. Copy the address from
        Trustpilot&apos;s home page, under <em>&ldquo;This is your unique Trustpilot email address&rdquo;</em>,
        and check it matches what is in use below.
      </p>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Trustpilot invitation address
        </label>
        <input
          type="email"
          style={input}
          placeholder={inUse || 'yourdomain.com+xxxxxxxx@invite.trustpilot.com'}
          value={settings?.trustpilotAfsBcc ?? ''}
          onChange={(e) => onChange('trustpilotAfsBcc', e.target.value)}
        />
        <div style={{ ...muted, marginTop: '6px' }}>
          In use right now: <code style={{ color: '#2dd4bf', fontSize: '0.8rem' }}>{inUse || 'nothing'}</code>
          {' — '}{SOURCE_LABEL[source]}.
          {source !== 'panel' && ' Paste it above and save to take control of it here.'}
          {' '}Only an <code>@invite.trustpilot.com</code> address is accepted — anything else would
          be sent a silent copy of every customer receipt.
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          How Trustpilot is told about an order
        </label>
        <select
          style={{ ...input, cursor: 'pointer' }}
          value={settings?.trustpilotDeliveryMode ?? 'trigger'}
          onChange={(e) => onChange('trustpilotDeliveryMode', e.target.value)}
        >
          <option value="trigger">Separate email to Trustpilot (recommended)</option>
          <option value="bcc">Copy Trustpilot on the customer&apos;s receipt</option>
        </select>
        <div style={{ ...muted, marginTop: '6px' }}>
          Trustpilot accepts both, and only one may be used at a time — each one that arrives
          counts as an invitation against your monthly allowance.
          {' '}<strong style={{ color: '#94a3b8' }}>Separate email</strong> sends Trustpilot its own
          small message right after the customer&apos;s receipt. It is the recommended one because
          its SMTP result is recorded separately, while a hidden copy on the receipt cannot be told
          apart from the receipt itself. SMTP acceptance still does not prove Trustpilot processed
          the invitation. This mode also keeps Trustpilot&apos;s hidden data block out of the customer&apos;s
          email.
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Send a test invitation
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <input
            type="email"
            style={{ ...input, flex: '1 1 260px', width: 'auto' }}
            placeholder="your own email address"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
          <button
            type="button"
            onClick={sendTest}
            disabled={sending || !testTo.trim()}
            style={{
              padding: '9px 18px', fontSize: '0.88rem', borderRadius: '8px', fontWeight: 700,
              background: (sending || !testTo.trim()) ? 'rgba(148,163,184,0.12)' : 'rgba(56,189,248,0.12)',
              border: `1px solid ${(sending || !testTo.trim()) ? 'rgba(255,255,255,0.1)' : 'rgba(56,189,248,0.35)'}`,
              color: (sending || !testTo.trim()) ? '#64748b' : '#38bdf8',
              cursor: (sending || !testTo.trim()) ? 'default' : 'pointer',
            }}
          >
            {sending ? 'Sending…' : 'Send test'}
          </button>
        </div>
        <div style={{ ...muted, marginTop: '8px' }}>
          Sends one real trigger by the selected path. Separate-email mode uses the low-volume
          Rackspace business mailbox; BCC mode uses the Elastic customer-receipt path.
          Use a team inbox, never a customer&apos;s — Trustpilot will genuinely invite whoever you
          put here.
        </div>

        {result && (
          <div style={{
            marginTop: '12px',
            background: result.tone === 'ok' ? 'rgba(74,222,128,0.07)' : 'rgba(248,113,113,0.07)',
            border: `1px solid ${result.tone === 'ok' ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
            borderRadius: '8px',
            padding: '12px 14px',
            fontSize: '0.85rem',
            color: result.tone === 'ok' ? '#bbf7d0' : '#fecaca',
            lineHeight: 1.6,
          }}>
            {result.message}
            {result.reference && (
              <div style={{ marginTop: '8px', color: '#94a3b8', fontSize: '0.8rem' }}>
                Reference <strong style={{ color: '#e2e8f0' }}>{result.reference}</strong> · sent from {result.from} via {result.smtpHost}
                {' · '}{result.method === 'trigger' ? 'sent directly to' : 'copied to'} {result.bcc}
                {result.rejected?.length ? ` · refused: ${result.rejected.join(', ')}` : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
