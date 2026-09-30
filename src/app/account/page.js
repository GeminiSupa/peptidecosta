'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import AccountShell from './AccountShell';
import OrderCard from './OrderCard';
import { useCustomerOrders } from '@/hooks/useCustomerOrders';
import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';
import { getCustomerAccessToken, getCustomerSupabase } from '@/lib/customerSupabase';
import { latestPaidOrder, refillCountdown } from '@/lib/accountHome.mjs';
import { orderDeliveryState, orderItems } from '@/lib/customerOrderView.mjs';
import { isGiftLine } from '@/lib/bacWater.mjs';
import { stashReorder } from '@/lib/reorderHandoff';
import { CORREOS_TRACKING_URL, hasTrackingNumber } from '@/lib/correosTracking.mjs';

function addressLine(address) {
  if (!address) return '';
  return [address.detailed_address, address.district, address.canton, address.province]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
}

function buyAgainProducts(orders) {
  const source = latestPaidOrder(orders) || orders.find((order) => orderItems(order).some((item) => !isGiftLine(item) && item?.product));
  if (!source) return [];
  const seen = new Set();
  const rows = [];
  for (const item of orderItems(source)) {
    if (isGiftLine(item) || !item?.product) continue;
    const key = String(item.product).trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ product: item.product, qty: item.qty || 1 });
    if (rows.length >= 4) break;
  }
  return rows;
}

export default function AccountOverviewPage() {
  const router = useRouter();
  const [lang] = useStorefrontLang();
  const { user, loading: sessionLoading } = useCustomerSession();
  const { orders, loading, error } = useCustomerOrders({ enabled: Boolean(user), limit: 80 });
  const isEn = lang === 'en';
  const [profile, setProfile] = useState(null);
  const [defaultAddress, setDefaultAddress] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [bonuses, setBonuses] = useState([]);

  useEffect(() => {
    const supabase = getCustomerSupabase();
    if (!supabase || !user) return undefined;

    let active = true;
    setDetailsLoading(true);

    Promise.all([
      supabase
        .from('customer_profiles')
        .select('display_name, phone, locale, account_kind, organization_name')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('customer_addresses')
        .select('recipient_name, phone, detailed_address, district, canton, province, is_default')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(async ([profileResult, addressResult]) => {
      if (!active) return null;
      let nextProfile = profileResult.data || null;
      if (profileResult.error && /account_kind|organization_name|schema cache/i.test(profileResult.error.message || '')) {
        const basic = await supabase
          .from('customer_profiles')
          .select('display_name, phone, locale')
          .eq('user_id', user.id)
          .maybeSingle();
        nextProfile = basic.data || null;
      }
      if (!active) return null;
      setProfile(nextProfile);
      setDefaultAddress(addressResult.data || null);
      return null;
    }).catch(() => null).finally(() => {
      if (active) setDetailsLoading(false);
    });

    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    getCustomerAccessToken().then((token) => {
      if (!active || !token) return null;
      return fetch(`/api/account/bonuses?lang=${lang}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }).then((response) => (response && response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.orders) setBonuses(data.orders);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [user, lang]);

  const inTransit = orders.filter((order) => orderDeliveryState(order) === 'shipped');
  const recentOrders = orders.slice(0, 3);
  const countdown = refillCountdown(orders);
  const again = buyAgainProducts(orders);

  const displayName = String(profile?.display_name || '').trim();
  const savedAddress = addressLine(defaultAddress);
  const organization = String(profile?.organization_name || '').trim();
  const needsQuestions = !detailsLoading && !profile?.account_kind;

  const buyOne = (item) => {
    if (stashReorder({ items: [{ product: item.product, qty: item.qty }] })) {
      router.push(`/catalog?reorder=1&lang=${lang}`);
    }
  };

  const firstName = displayName.split(/\s+/)[0] || '';
  const shipped = inTransit[0];

  return (
    <AccountShell title={{ en: 'Shop', es: 'Tienda' }}>
      {!detailsLoading ? (
        <p className="account-hello">
          <strong>
            {firstName
              ? (isEn ? `Hi, ${firstName}` : `Hola, ${firstName}`)
              : (isEn ? 'Your shop' : 'Su tienda')}
          </strong>
          <span className="account-muted">
            {organization || (isEn ? 'Research catalog' : 'Catálogo de investigación')}
          </span>
        </p>
      ) : (
        <p className="account-hello"><strong>{isEn ? 'Your shop' : 'Su tienda'}</strong></p>
      )}

      {needsQuestions ? (
        <Link href="/account/profile" className="account-nudge">
          {isEn ? 'Add your lab name' : 'Agregue el nombre de su laboratorio'}
          <span>{isEn ? 'So this account is ready for the next order' : 'Para que esta cuenta quede lista para el próximo pedido'}</span>
        </Link>
      ) : null}

      {countdown?.ready ? (
        again[0] ? (
          <button type="button" className="account-nudge" onClick={() => buyOne(again[0])}>
            {isEn ? 'Time to restock' : 'Hora de reponer'}
            <span>{isEn ? `Buy ${again[0].product} again` : `Comprar ${again[0].product} de nuevo`}</span>
          </button>
        ) : (
          <Link href={`/catalog?lang=${lang}`} className="account-nudge">
            {isEn ? 'Time to restock' : 'Hora de reponer'}
            <span>{isEn ? 'Open the catalog' : 'Abrir el catálogo'}</span>
          </Link>
        )
      ) : null}

      {shipped ? (
        <a
          className="account-nudge"
          href={hasTrackingNumber(shipped.tracking_number) ? CORREOS_TRACKING_URL : `/account/orders/${encodeURIComponent(shipped.order_number)}`}
          target={hasTrackingNumber(shipped.tracking_number) ? '_blank' : undefined}
          rel="noopener noreferrer"
        >
          {isEn ? 'A package is on the way' : 'Un paquete va en camino'}
          <span>{shipped.order_number}{shipped.tracking_number ? ` · ${shipped.tracking_number}` : ''}</span>
        </a>
      ) : null}

      <h2 className="shop-section-title">{isEn ? 'Buy again' : 'Comprar de nuevo'}</h2>
      {sessionLoading || loading || detailsLoading ? (
        <p className="account-muted">{isEn ? 'Loading…' : 'Cargando…'}</p>
      ) : again.length === 0 ? (
        <div className="shop-order">
          <p style={{ marginTop: 0 }}>
            {isEn ? 'Nothing to reorder yet.' : 'Aún no hay nada para volver a pedir.'}
          </p>
          <Link href={`/catalog?lang=${lang}`} className="account-btn-primary">
            {isEn ? 'Browse the catalog' : 'Ver el catálogo'}
          </Link>
        </div>
      ) : (
        <div className="shop-order" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {again.map((item) => (
            <div className="shop-buy-row" key={item.product}>
              <span className="shop-thumb">{String(item.product).trim().charAt(0).toUpperCase()}</span>
              <span className="shop-buy-copy">
                <strong>{item.product}</strong>
                <span className="account-muted">× {item.qty}</span>
              </span>
              <button type="button" className="account-btn-secondary" onClick={() => buyOne(item)}>
                {isEn ? 'Add' : 'Agregar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {!detailsLoading && savedAddress ? (
        <p className="account-muted" style={{ marginTop: 10 }}>
          {isEn ? 'Ships to ' : 'Envío a '}
          {savedAddress}
          {' · '}
          <Link href="/account/addresses">{isEn ? 'Change' : 'Cambiar'}</Link>
        </p>
      ) : null}
      {!detailsLoading && !savedAddress ? (
        <p className="account-muted" style={{ marginTop: 10 }}>
          <Link href="/account/addresses">{isEn ? 'Add a shipping address' : 'Agregar dirección de envío'}</Link>
        </p>
      ) : null}

      {bonuses.length > 0 ? (
        <>
          <h2 className="shop-section-title">{isEn ? 'Savings on recent orders' : 'Ahorros en pedidos recientes'}</h2>
          <div className="shop-order">
            {bonuses.slice(0, 3).map((bonus) => (
              <div key={bonus.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <strong>{bonus.orderNumber}</strong>
                <ul className="account-reorder-lines">
                  {bonus.lines.map((line, index) => <li key={`${bonus.id}-${index}`}>{line}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {!loading && !error && orders.length > 0 ? (
        <>
          <h2 className="shop-section-title">{isEn ? 'Recent orders' : 'Pedidos recientes'}</h2>
          {recentOrders.map((order) => <OrderCard key={order.id} order={order} lang={lang} />)}
          <Link href="/account/orders" className="account-btn-secondary" style={{ display: 'block', textAlign: 'center' }}>
            {isEn ? 'See all orders' : 'Ver todos los pedidos'}
          </Link>
        </>
      ) : null}

      {error ? (
        <p className="account-muted">
          {isEn
            ? 'We could not load your orders just now. Please try again shortly.'
            : 'No pudimos cargar sus pedidos en este momento. Inténtelo de nuevo en unos minutos.'}
        </p>
      ) : null}
    </AccountShell>
  );
}
