'use client';

import Link from 'next/link';

import AccountShell from './AccountShell';
import OrderCard from './OrderCard';
import { useCustomerOrders } from '@/hooks/useCustomerOrders';
import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';
import { orderDeliveryState } from '@/lib/customerOrderView.mjs';
import { CORREOS_TRACKING_URL, hasTrackingNumber } from '@/lib/correosTracking.mjs';

export default function AccountOverviewPage() {
  const [lang] = useStorefrontLang();
  const { user, loading: sessionLoading } = useCustomerSession();
  const { orders, loading, error } = useCustomerOrders({ enabled: Boolean(user), limit: 5 });
  const isEn = lang === 'en';

  const inTransit = orders.filter((order) => orderDeliveryState(order) === 'shipped');

  return (
    <AccountShell title={{ en: 'My Account', es: 'Mi Cuenta' }}>
      {inTransit.length > 0 ? (
        <div className="account-card">
          <h2>{isEn ? 'On the way' : 'En camino'}</h2>
          {inTransit.map((order) => (
            <div key={order.id} className="account-order-meta" style={{ marginBottom: 6 }}>
              <strong>{order.order_number}</strong>
              {' — '}
              <span className="account-tracking">{order.tracking_number}</span>
              {hasTrackingNumber(order.tracking_number) ? (
                <>
                  {' '}
                  <a
                    className="account-track-link"
                    href={CORREOS_TRACKING_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {isEn ? 'Track on Correos ↗' : 'Rastrear en Correos ↗'}
                  </a>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="account-card">
        <h2>{isEn ? 'Recent orders' : 'Pedidos recientes'}</h2>

        {sessionLoading || loading ? (
          <p className="account-muted">{isEn ? 'Loading…' : 'Cargando…'}</p>
        ) : error ? (
          <p className="account-muted">
            {isEn
              ? 'We could not load your orders just now. Please try again shortly.'
              : 'No pudimos cargar sus pedidos en este momento. Inténtelo de nuevo en unos minutos.'}
          </p>
        ) : orders.length === 0 ? (
          <div className="account-empty">
            <p>
              {isEn
                ? 'No orders on this account yet.'
                : 'Aún no hay pedidos en esta cuenta.'}
            </p>
            <p className="account-muted" style={{ marginTop: 8 }}>
              {isEn
                ? 'Orders you placed as a guest appear here automatically when they were placed with this email address.'
                : 'Los pedidos que hizo como invitado aparecen aquí automáticamente si los realizó con este correo.'}
            </p>
            <Link href={`/catalog?lang=${lang}`} className="account-btn-secondary" style={{ marginTop: 14 }}>
              {isEn ? 'Browse the catalog' : 'Ver el catálogo'}
            </Link>
          </div>
        ) : (
          <>
            {orders.map((order) => <OrderCard key={order.id} order={order} lang={lang} />)}
            <p style={{ marginTop: 14, marginBottom: 0 }}>
              <Link href="/account/orders" className="account-btn-secondary">
                {isEn ? 'See all orders' : 'Ver todos los pedidos'}
              </Link>
            </p>
          </>
        )}
      </div>
    </AccountShell>
  );
}
