'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';
import { getCustomerAccessToken } from '@/lib/customerSupabase';
import { useAccountAccess } from '@/hooks/useAccountAccess';
import ComingSoon from './ComingSoon';
import './account.css';

const TABS = [
  { href: '/account', es: 'Inicio', en: 'Home', icon: 'home' },
  { href: '/account/orders', es: 'Pedidos', en: 'Orders', icon: 'box' },
  { href: '/account/addresses', es: 'Envío', en: 'Ship', icon: 'pin' },
  { href: '/account/profile', es: 'Tú', en: 'You', icon: 'user' },
];

function tabActive(pathname, href) {
  if (href === '/account') return pathname === '/account';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TabIcon({ name }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (name === 'box') {
    return (
      <svg {...common}>
        <path d="M21 8l-9-5-9 5 9 5 9-5z" />
        <path d="M3 8v8l9 5 9-5V8" />
        <path d="M12 13v8" />
      </svg>
    );
  }
  if (name === 'pin') {
    return (
      <svg {...common}>
        <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }
  if (name === 'user') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M7 10.5V20h10v-9.5" />
    </svg>
  );
}

/**
 * Phone shopping chrome for the signed-in customer.
 *
 * The guard only decides what to render. What they can read is still the
 * database rule that limits orders to their own login.
 */
export default function AccountShell({ children, title }) {
  const router = useRouter();
  const pathname = usePathname();
  const [lang] = useStorefrontLang();
  const { user, loading, configured, signOut } = useCustomerSession();
  const { allowed, checking } = useAccountAccess();
  const isEn = lang === 'en';

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    getCustomerAccessToken().then((token) => {
      if (!active || !token) return null;
      return fetch('/api/account/claim-orders', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lang }),
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [user, lang]);

  useEffect(() => {
    if (checking || !allowed) return;
    if (loading || user) return;
    const next = encodeURIComponent(pathname || '/account');
    router.replace(`/account/login?next=${next}`);
  }, [checking, allowed, loading, user, pathname, router]);

  if (checking) return null;
  if (!allowed) return <ComingSoon />;

  if (!configured) {
    return (
      <div className="account-page">
        <div className="account-card account-empty">
          {isEn ? 'Accounts are not available right now.' : 'Las cuentas no están disponibles en este momento.'}
        </div>
      </div>
    );
  }

  if (loading || !user) {
    return (
      <div className="account-page">
        <div className="account-card account-empty">{isEn ? 'Loading…' : 'Cargando…'}</div>
      </div>
    );
  }

  return (
    <div className="account-page">
      <header className="account-header">
        <Link href={`/catalog?lang=${lang}`} className="account-header-shop">
          {isEn ? 'Catalog' : 'Catálogo'}
        </Link>
        <h1>{title ? (isEn ? title.en : title.es) : (isEn ? 'Shop' : 'Tienda')}</h1>
        <button
          type="button"
          className="account-header-out"
          onClick={async () => { await signOut(); router.replace('/account/login'); }}
        >
          {isEn ? 'Out' : 'Salir'}
        </button>
      </header>

      {children}

      <nav className="account-tabbar" aria-label={isEn ? 'Account' : 'Cuenta'}>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={tabActive(pathname, tab.href) ? 'is-active' : ''}
          >
            <TabIcon name={tab.icon} />
            <span>{isEn ? tab.en : tab.es}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
