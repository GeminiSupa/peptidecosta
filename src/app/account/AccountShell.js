'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';
import { useAccountAccess } from '@/hooks/useAccountAccess';
import ComingSoon from './ComingSoon';
import './account.css';

const TABS = [
  { href: '/account', es: 'Resumen', en: 'Overview' },
  { href: '/account/orders', es: 'Mis pedidos', en: 'My orders' },
  { href: '/account/addresses', es: 'Direcciones', en: 'Addresses' },
  { href: '/account/profile', es: 'Perfil', en: 'Profile' },
];

/**
 * Shared chrome and sign-in guard for every signed-in account page.
 *
 * The guard is a convenience, not the security boundary — it only decides what
 * to render. What a customer can actually read is decided by RLS on the
 * database: orders_customer_read_own restricts orders to
 * customer_user_id = auth.uid(), so a forged client state shows an empty
 * dashboard rather than someone else's history.
 */
export default function AccountShell({ children, title }) {
  const router = useRouter();
  const pathname = usePathname();
  const [lang] = useStorefrontLang();
  const { user, loading, configured, signOut } = useCustomerSession();
  const { allowed, checking } = useAccountAccess();
  const isEn = lang === 'en';

  useEffect(() => {
    // Hold the redirect while the launch gate is undecided, or a gated visitor
    // gets bounced to the login route before the coming-soon notice can render.
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
      <div className="account-header">
        <div>
          <h1>{title ? (isEn ? title.en : title.es) : (isEn ? 'My Account' : 'Mi Cuenta')}</h1>
          <div className="account-greeting">{user.email}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href={`/catalog?lang=${lang}`} className="account-btn-secondary">
            {isEn ? 'Shop' : 'Comprar'}
          </Link>
          <button
            type="button"
            className="account-btn-secondary"
            onClick={async () => { await signOut(); router.replace('/account/login'); }}
          >
            {isEn ? 'Sign out' : 'Cerrar sesión'}
          </button>
        </div>
      </div>

      <nav className="account-nav">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={pathname === tab.href ? 'is-active' : ''}
          >
            {isEn ? tab.en : tab.es}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
