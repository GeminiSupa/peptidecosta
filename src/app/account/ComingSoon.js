'use client';

import Link from 'next/link';

import { useStorefrontLang } from '@/hooks/useCustomerSession';
import './account.css';

/**
 * What a customer sees until accounts are launched.
 *
 * Deliberately says what is coming rather than apologising for what is
 * missing — someone who clicked "My Account" wants to know whether it is worth
 * coming back for, and the honest answer is yes.
 */
export default function ComingSoon() {
  const [lang, setLang] = useStorefrontLang();
  const isEn = lang === 'en';

  return (
    <div className="account-auth">
      <div className="account-auth-card">
        <div className="account-auth-langs">
          <button type="button" className={lang === 'es' ? 'is-active' : ''} onClick={() => setLang('es')}>ES</button>
          <button type="button" className={lang === 'en' ? 'is-active' : ''} onClick={() => setLang('en')}>EN</button>
        </div>

        <div style={{ textAlign: 'center', fontSize: '2.4rem', lineHeight: 1, marginBottom: 10 }} aria-hidden="true">
          🔬
        </div>

        <h1>{isEn ? 'Accounts are coming soon' : 'Las cuentas llegan pronto'}</h1>

        <p className="account-auth-lead">
          {isEn
            ? 'We are putting the finishing touches on customer accounts. Soon you will be able to sign in and see everything in one place.'
            : 'Estamos dando los últimos toques a las cuentas de cliente. Pronto podrá iniciar sesión y ver todo en un solo lugar.'}
        </p>

        <ul style={{ margin: '0 0 22px', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
          {[
            { en: 'Every order you have placed, including past ones', es: 'Todos sus pedidos, incluidos los anteriores' },
            { en: 'Shipment tracking numbers', es: 'Números de seguimiento de sus envíos' },
            { en: 'Reorder in one tap, always at current prices', es: 'Vuelva a pedir con un toque, siempre al precio actual' },
            { en: 'Saved addresses so checkout fills itself in', es: 'Direcciones guardadas para completar el checkout solo' },
          ].map((item) => (
            <li
              key={item.en}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.9rem', color: 'var(--text-muted)' }}
            >
              <span aria-hidden="true" style={{ color: 'var(--cta)', fontWeight: 700 }}>✓</span>
              <span>{isEn ? item.en : item.es}</span>
            </li>
          ))}
        </ul>

        <p className="account-auth-lead" style={{ marginBottom: 18, fontSize: '0.85rem' }}>
          {isEn
            ? 'In the meantime, nothing changes — order as you always have and we will keep looking after you on WhatsApp.'
            : 'Mientras tanto, nada cambia: pida como siempre y seguimos atendiéndole por WhatsApp.'}
        </p>

        <Link href={`/catalog?lang=${lang}`} style={{ textDecoration: 'none' }}>
          <button type="button" className="account-btn-primary">
            {isEn ? 'Back to the catalog' : 'Volver al catálogo'}
          </button>
        </Link>
      </div>
    </div>
  );
}
