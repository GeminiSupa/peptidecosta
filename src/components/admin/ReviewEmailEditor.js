'use client';

import { useMemo, useState } from 'react';
import { BUTTONS_PLACEHOLDER, buildReviewRequestEmail } from '@/lib/reviewRequestEmail.mjs';

/**
 * The review email, edited in the Social Reviews tab.
 *
 * Two languages, because the send picks by the order's currency and a shop
 * that edits one and forgets the other would quietly send half its customers
 * the old wording.
 *
 * The preview is rendered by the same function that builds the real email, so
 * it cannot drift from what actually goes out. It runs here in the browser
 * rather than through the server because that function is pure — the only
 * things it needs are the copy and the destinations.
 */

const card = {
  background: '#0e1626',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '16px',
};

const label = {
  display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8',
  marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em',
};

const input = {
  width: '100%', padding: '9px 12px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.12)', background: '#0b1220',
  color: '#f8fafc', fontSize: '0.92rem',
};

const textarea = {
  ...input,
  minHeight: '260px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.82rem',
  lineHeight: 1.5,
  resize: 'vertical',
};

const hint = { fontSize: '0.78rem', color: '#64748b', marginTop: '6px', lineHeight: 1.55 };

const LANGS = [
  { id: 'es', label: 'Spanish', subjectKey: 'emailSubjectEs', bodyKey: 'emailBodyEs' },
  { id: 'en', label: 'English', subjectKey: 'emailSubjectEn', bodyKey: 'emailBodyEn' },
];

/** Stand-in links, so the preview looks like a real send without one. */
const SAMPLE_DESTINATIONS = {
  google: 'https://example.com/click/google',
  facebook: 'https://example.com/click/facebook',
  trustpilot: '',
};

export default function ReviewEmailEditor({ settings, onChange }) {
  const [lang, setLang] = useState('es');
  const [showPreview, setShowPreview] = useState(true);

  const active = LANGS.find((l) => l.id === lang);
  const body = settings[active.bodyKey] || '';
  const subject = settings[active.subjectKey] || '';
  const usingBuiltIn = !body.trim();
  const missingButtons = Boolean(body.trim()) && !body.includes(BUTTONS_PLACEHOLDER);

  const preview = useMemo(() => {
    try {
      return buildReviewRequestEmail({
        customerName: 'Ana',
        lang,
        destinations: SAMPLE_DESTINATIONS,
        template: { subject, body: missingButtons ? '' : body },
      });
    } catch (err) {
      return { subject: '', html: `<p style="color:#b91c1c">This template could not be rendered: ${err.message}</p>` };
    }
  }, [lang, subject, body, missingButtons]);

  const startFromBuiltIn = () => {
    // Gives them the real default as a starting point rather than a blank box,
    // which is the difference between editing and writing an email from
    // scratch in HTML.
    const built = buildReviewRequestEmail({
      customerName: '{{name}}',
      lang,
      destinations: SAMPLE_DESTINATIONS,
    });
    const withPlaceholder = built.html.replace(
      /<div style="margin:22px 0;text-align:center;">[\s\S]*?<\/div>\s*<\/div>/,
      `${BUTTONS_PLACEHOLDER}\n        </div>`,
    );
    onChange(active.bodyKey, withPlaceholder.trim());
    onChange(active.subjectKey, built.subject);
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ color: '#f8fafc', fontSize: '1rem', margin: 0 }}>The review email</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLang(l.id)}
              style={{
                padding: '6px 14px', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                background: lang === l.id ? 'rgba(56, 189, 248, 0.14)' : 'rgba(148,163,184,0.08)',
                border: `1px solid ${lang === l.id ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: lang === l.id ? '#38bdf8' : '#94a3b8',
              }}
            >
              {l.label}
              {(settings[l.bodyKey] || '').trim() ? '' : ' (default)'}
            </button>
          ))}
        </div>
      </div>

      <p style={{ ...hint, marginTop: 0, marginBottom: '16px' }}>
        Leave both boxes empty to keep the built-in wording — that is what every request has
        used so far. Spanish is sent to orders in colones, English to orders in dollars.
      </p>

      <div style={{ marginBottom: '16px' }}>
        <label style={label}>Subject ({active.label})</label>
        <input
          type="text"
          style={input}
          value={subject}
          placeholder={preview.subject}
          onChange={(e) => onChange(active.subjectKey, e.target.value)}
        />
        <div style={hint}>Blank uses the built-in subject, shown greyed out above.</div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label style={label}>Body HTML ({active.label})</label>
          {usingBuiltIn && (
            <button
              type="button"
              onClick={startFromBuiltIn}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', borderRadius: 6, padding: '3px 10px', fontSize: '0.76rem', cursor: 'pointer', marginBottom: 6 }}
            >
              Start from the current email
            </button>
          )}
        </div>
        <textarea
          style={{ ...textarea, borderColor: missingButtons ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.12)' }}
          value={body}
          placeholder="Leave empty to use the built-in email."
          onChange={(e) => onChange(active.bodyKey, e.target.value)}
        />
        <div style={hint}>
          Placeholders: <code style={{ color: '#7dd3fc' }}>{'{{name}}'}</code> the customer&apos;s first name,{' '}
          <code style={{ color: '#7dd3fc' }}>{BUTTONS_PLACEHOLDER}</code> the review buttons,{' '}
          <code style={{ color: '#7dd3fc' }}>{'{{logo}}'}</code> the logo image URL.
        </div>
        {missingButtons && (
          <div style={{ color: '#fca5a5', fontSize: '0.83rem', marginTop: '8px', lineHeight: 1.5 }}>
            This will not save: the body must contain {BUTTONS_PLACEHOLDER}. That is where the
            review buttons go, and each one carries its own tracking link — without it the email
            would arrive with nothing to click. The preview below shows the built-in email until
            you add it.
          </div>
        )}
      </div>

      <div style={{ marginTop: '18px' }}>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8', borderRadius: 8, padding: '5px 12px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
        >
          {showPreview ? 'Hide preview' : 'Show preview'}
        </button>

        {showPreview && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ ...hint, marginBottom: '6px' }}>
              Exactly what a customer receives, built by the same code that sends it. The two
              buttons here point at example links; the real ones carry the click tracking.
            </div>
            <div style={{ background: '#ffffff', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <iframe
                title={`Review email preview (${active.label})`}
                srcDoc={preview.html}
                style={{ width: '100%', height: '520px', border: 0, background: '#fff' }}
                sandbox=""
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
