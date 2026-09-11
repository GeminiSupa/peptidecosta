'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { safeLocalStorage } from '@/lib/storage';

/**
 * Copy in both languages. The processor's condition was that the notice appears
 * in the language the visitor is browsing in — an English-only gate on a site
 * that serves Costa Rica and defaults to Spanish does not meet that, and is
 * arguably worse than no gate at all, because the visitor agrees to a sentence
 * they were never given a chance to read.
 */
const COPY = {
  en: {
    title: 'Research Use Only | 21+ to Enter',
    introLead: 'By selecting ',
    introStrong: '"Yes, I Agree,"',
    introTail: ' you confirm that you are at least 21 years old and acknowledge the following:',
    points: [
      'Products are supplied strictly for laboratory research and are not intended for human or animal consumption, treatment, or personal use.',
      'You understand that research materials require appropriate knowledge, facilities, and handling precautions.',
      'You agree to follow applicable laws and the product-specific handling and safety information.',
      'Peptides Costa Rica reserves the right to decline or cancel orders where human or animal use is suspected.',
    ],
    agree: 'Yes, I Agree',
    disagree: 'No, I Disagree',
    declinedTitle: 'Access Not Granted',
    declinedText: 'You have declined the research-use terms, so this site cannot be shown to you. You may now close this window.',
  },
  es: {
    title: 'Solo para investigación | Mayores de 21 años',
    introLead: 'Al seleccionar ',
    introStrong: '"Sí, acepto"',
    introTail: ', usted confirma que tiene al menos 21 años y reconoce lo siguiente:',
    points: [
      'Los productos se suministran estrictamente para investigación de laboratorio y no están destinados al consumo, tratamiento ni uso personal humano o animal.',
      'Usted entiende que los materiales de investigación requieren conocimientos, instalaciones y precauciones de manejo adecuados.',
      'Usted acepta cumplir las leyes aplicables y la información de manejo y seguridad propia de cada producto.',
      'Peptides Costa Rica se reserva el derecho de rechazar o cancelar pedidos cuando se sospeche uso humano o animal.',
    ],
    agree: 'Sí, acepto',
    disagree: 'No, no acepto',
    declinedTitle: 'Acceso No Concedido',
    declinedText: 'Usted no aceptó los términos de uso exclusivo para investigación, por lo que no podemos mostrarle este sitio. Puede cerrar esta ventana.',
  },
};

/** ?lang= wins, then a previous choice, then the browser's own language. */
function resolveLang() {
  try {
    const requested = new URLSearchParams(window.location.search).get('lang');
    if (requested === 'en' || requested === 'es') return requested;
  } catch (e) {
    // Malformed query string — fall through to the stored choice.
  }

  const saved = safeLocalStorage.getItem('lang');
  if (saved === 'en' || saved === 'es') return saved;

  // The processor asked for the browsing language, and for a first-time visitor
  // with nothing stored this is the only signal there is. Spanish stays the
  // default, matching the rest of the site.
  const nav = typeof navigator !== 'undefined' ? String(navigator.language || '') : '';
  return nav.toLowerCase().startsWith('en') ? 'en' : 'es';
}

export default function EntryDisclaimer() {
  const [accepted, setAccepted] = useState(true); // Default to true to prevent hydration flash
  const [declined, setDeclined] = useState(false);
  const [lang, setLang] = useState('es');
  const pathname = usePathname() || '';

  // Admin is staff, already behind a login. /embed is the catalog iframed into
  // the WordPress site, which carries its own gate on the parent page — a second
  // one inside the frame gates a box a few hundred pixels tall, and on decline
  // it used to navigate the iframe to Google, which refuses to be framed and
  // left a broken rectangle sitting on someone else's page.
  const isExemptRoute = pathname.startsWith('/admin') || pathname.startsWith('/embed');

  useEffect(() => {
    if (isExemptRoute) return;

    setLang(resolveLang());

    const hasAccepted = safeLocalStorage.getItem('compliance_accepted') === 'true';

    if (!hasAccepted) {
      setAccepted(false);
      document.body.style.overflow = 'hidden';
    }

    // Ensure we always clean up the scroll lock if the component unmounts
    return () => {
      document.body.style.overflow = '';
    };
  }, [isExemptRoute]);

  if (isExemptRoute || accepted) {
    return null;
  }

  const t = COPY[lang] || COPY.es;

  const handleAgree = () => {
    safeLocalStorage.setItem('compliance_accepted', 'true');
    setAccepted(true);
    document.body.style.overflow = '';
  };

  // Deliberately not a redirect. Sending the tab somewhere else is something an
  // embedded frame cannot do, and a visitor who declines has not asked to be
  // taken anywhere — they have asked not to come in. The overlay stays up and
  // says so, which leaves the site behind it unreachable either way.
  const handleDisagree = () => setDeclined(true);

  return (
    <div
      className="entry-disclaimer-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      lang={lang}
    >
      <div className="entry-disclaimer-modal">
        {declined ? (
          <>
            <h2 id="disclaimer-title" className="entry-disclaimer-title">{t.declinedTitle}</h2>
            <p className="entry-disclaimer-text">{t.declinedText}</p>
          </>
        ) : (
          <>
            <h2 id="disclaimer-title" className="entry-disclaimer-title">{t.title}</h2>

            <p className="entry-disclaimer-text">
              {t.introLead}<strong>{t.introStrong}</strong>{t.introTail}
            </p>

            <ul className="entry-disclaimer-list">
              {t.points.map((point) => <li key={point}>{point}</li>)}
            </ul>

            <div className="entry-disclaimer-actions">
              <button type="button" className="entry-btn-disagree" onClick={handleDisagree}>
                {t.disagree}
              </button>
              <button type="button" className="entry-btn-agree" onClick={handleAgree}>
                {t.agree}
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .entry-disclaimer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background-color: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 2147483647; /* Maximum possible z-index to stay above everything */
          display: flex;
          align-items: flex-start; /* Allows scrolling if modal is taller than viewport */
          justify-content: center;
          padding: 40px 20px;
          overflow-y: auto;
          overscroll-behavior: contain;
        }

        .entry-disclaimer-modal {
          background-color: #ffffff;
          border-radius: 12px;
          max-width: 600px;
          width: 100%;
          padding: 36px 32px;
          margin: auto; /* Centers perfectly when smaller than viewport, scrolls nicely when bigger */
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          border: 2px solid #e2e8f0;
          animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .entry-disclaimer-title {
          margin: 0 0 20px 0;
          font-size: 1.5rem;
          font-weight: 800;
          color: #b91c1c;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-family: var(--font-montserrat), sans-serif;
          word-break: break-word;
        }

        .entry-disclaimer-text {
          font-size: 1rem;
          color: #334155;
          margin-bottom: 16px;
          line-height: 1.5;
          font-family: var(--font-inter), sans-serif;
          word-break: break-word;
        }

        .entry-disclaimer-list {
          margin: 0 0 28px 0;
          padding-left: 24px;
          color: #475569;
          font-size: 0.95rem;
          line-height: 1.6;
          font-family: var(--font-inter), sans-serif;
        }

        .entry-disclaimer-list li {
          margin-bottom: 12px;
          word-break: break-word;
        }
        .entry-disclaimer-list li:last-child {
          margin-bottom: 0;
        }

        .entry-disclaimer-actions {
          display: flex;
          gap: 16px;
          justify-content: center;
        }

        .entry-btn-agree, .entry-btn-disagree {
          padding: 14px 24px;
          font-size: 1rem;
          font-weight: 700;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          flex: 1;
          max-width: 200px;
          font-family: var(--font-montserrat), sans-serif;
        }

        .entry-btn-agree {
          background-color: #16a34a;
          color: white;
          box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.2);
        }

        .entry-btn-agree:hover {
          background-color: #15803d;
          transform: translateY(-2px);
          box-shadow: 0 6px 8px -1px rgba(22, 163, 74, 0.3);
        }

        .entry-btn-disagree {
          background-color: #f1f5f9;
          color: #64748b;
          border: 1px solid #cbd5e1;
        }

        .entry-btn-disagree:hover {
          background-color: #e2e8f0;
          color: #475569;
        }

        @keyframes slideUpFade {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 480px) {
          .entry-disclaimer-overlay {
            padding: 20px 16px;
          }

          .entry-disclaimer-modal {
            padding: 28px 20px;
          }

          .entry-disclaimer-title {
            font-size: 1.25rem;
          }

          .entry-disclaimer-actions {
            flex-direction: column-reverse;
            gap: 12px;
          }

          .entry-btn-agree, .entry-btn-disagree {
            max-width: 100%;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
