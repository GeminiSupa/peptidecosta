'use client';

import Link from 'next/link';

import AccountShell from '../AccountShell';
import OrderCard from '../OrderCard';
import { useCustomerOrders } from '@/hooks/useCustomerOrders';
import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';

export default function AccountOrdersPage() {
  const [lang] = useStorefrontLang();
  const { user } = useCustomerSession();
  const { orders, loading, error } = useCustomerOrders({ enabled: Boolean(user) });
  const isEn = lang === 'en';

  return (
    <AccountShell title={{ en: 'My orders', es: 'Mis pedidos' }}>
      <div className="account-card">
        {loading ? (
          <p className="account-muted">{isEn ? 'Loading…' : 'Cargando…'}</p>
        ) : error ? (
          <p className="account-muted">
            {isEn
              ? 'We could not load your orders just now. Please try again shortly.'
              : 'No pudimos cargar sus pedidos en este momento. Inténtelo de nuevo en unos minutos.'}
          </p>
        ) : orders.length === 0 ? (
          <div className="account-empty">
            <p>{isEn ? 'No orders yet.' : 'Aún no hay pedidos.'}</p>
            <Link href={`/catalog?lang=${lang}`} className="account-btn-secondary" style={{ marginTop: 14 }}>
              {isEn ? 'Browse the catalog' : 'Ver el catálogo'}
            </Link>
          </div>
        ) : (
          orders.map((order) => <OrderCard key={order.id} order={order} lang={lang} />)
        )}
      </div>
    </AccountShell>
  );
}
