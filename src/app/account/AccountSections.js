'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { useCustomerOrders } from '@/hooks/useCustomerOrders';
import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';
import { getCustomerAccessToken, getCustomerSupabase } from '@/lib/customerSupabase';
import { buildWhatsAppLink } from '@/lib/whatsappLink.mjs';
import { DEFAULT_BUSINESS_LINKS } from '@/lib/businessLinks';
import {
  isCatalogOutOfStock,
  orderNotifications,
  purchasedProductNames,
  toggleFavorite,
} from '@/lib/accountExtras.mjs';
import ProductFace from './ProductFace';

function favoriteKey(userId) {
  return `account-favorites:${userId || 'signed-out'}`;
}

function readFavorites(userId) {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(favoriteKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function sendRequest(body) {
  const token = await getCustomerAccessToken();
  if (!token) return { ok: false };
  const response = await fetch('/api/account/requests', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, error: data.error || '' };
}

function useRequests() {
  const { user } = useCustomerSession();
  const [rows, setRows] = useState([]);

  const reload = () => {
    if (!user) return;
    getCustomerAccessToken().then((token) => {
      if (!token) return null;
      return fetch('/api/account/requests', {
        headers: { Authorization: `Bearer ${token}` },
      });
    }).then((response) => (response && response.ok ? response.json() : null))
      .then((data) => setRows(data?.requests || []))
      .catch(() => setRows([]));
  };

  useEffect(() => { reload(); }, [user]);

  return { rows, reload };
}

export function RewardsSection() {
  const [lang] = useStorefrontLang();
  const { user } = useCustomerSession();
  const isEn = lang === 'en';
  const [lines, setLines] = useState([]);

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
        if (!active) return;
        const saved = [];
        for (const order of data?.orders || []) {
          for (const line of order.lines || []) saved.push(`${order.orderNumber}: ${line}`);
        }
        setLines(saved);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [user, lang]);

  return (
    <>
      <div className="account-feature-intro">
        <span className="account-feature-icon" aria-hidden="true">%</span>
        <div>
          <h2>{isEn ? 'Your savings' : 'Sus ahorros'}</h2>
          <p>
            {isEn
              ? 'Discounts, weekly deals and volume savings from your recent orders appear here.'
              : 'Aquí aparecen los descuentos, ofertas semanales y ahorros por volumen de sus pedidos recientes.'}
          </p>
        </div>
      </div>
      {lines.length > 0 ? (
        <>
          <h2 className="shop-section-title">{isEn ? 'Savings already on your orders' : 'Ahorros que ya tuvo en sus pedidos'}</h2>
          <ul className="account-plain-list">
            {lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </>
      ) : (
        <div className="account-empty-state">
          <strong>{isEn ? 'No savings to show yet' : 'Aún no hay ahorros para mostrar'}</strong>
          <span>{isEn ? 'Eligible savings are applied automatically at checkout.' : 'Los ahorros elegibles se aplican automáticamente en el checkout.'}</span>
          <Link href={`/catalog?lang=${lang}`} className="account-btn-secondary">
            {isEn ? 'Browse current offers' : 'Ver ofertas actuales'}
          </Link>
        </div>
      )}
    </>
  );
}

export function FavoritesSection() {
  const [lang] = useStorefrontLang();
  const { user } = useCustomerSession();
  const { orders } = useCustomerOrders({ enabled: Boolean(user) });
  const isEn = lang === 'en';
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    setSaved(readFavorites(user?.id));
  }, [user?.id]);

  const toggle = (name) => {
    const next = toggleFavorite(saved, name);
    setSaved(next);
    if (user?.id) window.localStorage.setItem(favoriteKey(user.id), JSON.stringify(next));
  };

  const bought = purchasedProductNames(orders);

  return (
    <>
      <h2 className="shop-section-title">{isEn ? 'Saved' : 'Guardados'}</h2>
      {saved.length === 0 ? (
        <p className="account-muted">
          {isEn ? 'Products you save will appear here.' : 'Los productos que guarde aparecerán aquí.'}
        </p>
      ) : (
        <ul className="account-plain-list">
          {saved.map((name) => (
            <li key={name}>
              <ProductFace name={name} />
              <span>{name}</span>
              <button type="button" className="account-btn-link" onClick={() => toggle(name)}>
                {isEn ? 'Remove' : 'Quitar'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2 className="shop-section-title">{isEn ? 'From your orders' : 'De sus pedidos'}</h2>
      {bought.length === 0 ? <p className="account-muted" /> : (
        <ul className="account-plain-list">
          {bought.map((name) => (
            <li key={name}>
              <ProductFace name={name} />
              <span>{name}</span>
              <button type="button" className="account-btn-link" onClick={() => toggle(name)}>
                {saved.some((item) => item.toLowerCase() === name.toLowerCase())
                  ? (isEn ? 'Saved' : 'Guardado')
                  : (isEn ? 'Save' : 'Guardar')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function NotificationsSection() {
  const [lang] = useStorefrontLang();
  const { user } = useCustomerSession();
  const { orders, loading } = useCustomerOrders({ enabled: Boolean(user) });
  const isEn = lang === 'en';
  const notes = orderNotifications(orders, lang);

  if (loading) return <p className="account-muted">{isEn ? 'Loading…' : 'Cargando…'}</p>;
  if (notes.length === 0) {
    return (
      <div className="account-empty-state">
        <strong>{isEn ? 'You are all caught up' : 'Está al día'}</strong>
        <span>{isEn ? 'Order updates will appear here.' : 'Las novedades de sus pedidos aparecerán aquí.'}</span>
      </div>
    );
  }

  return (
    <ul className="account-plain-list">
      {notes.map((note) => <li key={note.id}>{note.text}</li>)}
    </ul>
  );
}

const TOPICS = [
  { id: 'order', en: 'Order issue', es: 'Problema con un pedido' },
  { id: 'shipping', en: 'Shipping issue', es: 'Problema de envío' },
  { id: 'payment', en: 'Payment issue', es: 'Problema de pago' },
  { id: 'product', en: 'Product question', es: 'Pregunta sobre un producto' },
  { id: 'other', en: 'Other', es: 'Otro' },
];

export function HelpSection() {
  const [lang] = useStorefrontLang();
  const isEn = lang === 'en';
  const { rows, reload } = useRequests();
  const [topic, setTopic] = useState('order');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const whatsapp = buildWhatsAppLink(DEFAULT_BUSINESS_LINKS.whatsappNumber, null, lang);
  const helpRows = rows.filter((row) => String(row.subject || '').startsWith('Account:'));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const result = await sendRequest({ kind: 'help', topic, message });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.error || (isEn ? 'Could not send that.' : 'No se pudo enviar.'));
      return;
    }
    setMessage('');
    setNotice(isEn ? 'Sent.' : 'Enviado.');
    reload();
  };

  return (
    <>
      <div className="account-help-actions">
        <a className="account-btn-primary" href={whatsapp} target="_blank" rel="noopener noreferrer">
          {isEn ? 'WhatsApp us' : 'WhatsApp'}
        </a>
      </div>
      <h2 className="shop-section-title">{isEn ? 'Previous conversations' : 'Conversaciones anteriores'}</h2>
      {helpRows.length === 0 ? (
        <p className="account-muted">{isEn ? 'No previous requests.' : 'No hay solicitudes anteriores.'}</p>
      ) : (
        <ul className="account-plain-list">
          {helpRows.map((row) => (
            <li key={row.id}>
              <strong>{row.subject}</strong>
              <span>{row.message}</span>
              {row.admin_reply ? <span>{row.admin_reply}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <h2 className="shop-section-title">{isEn ? 'Report something' : 'Reportar algo'}</h2>
      <form className="shop-order" onSubmit={submit}>
        <label htmlFor="help-topic">{isEn ? 'What is it about?' : '¿De qué se trata?'}</label>
        <select id="help-topic" value={topic} onChange={(event) => setTopic(event.target.value)}>
          {TOPICS.map((item) => (
            <option key={item.id} value={item.id}>{isEn ? item.en : item.es}</option>
          ))}
        </select>
        <label htmlFor="help-message">{isEn ? 'Message' : 'Mensaje'}</label>
        <textarea id="help-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={4} required />
        {notice ? <p className="account-muted">{notice}</p> : null}
        <button type="submit" className="account-btn-primary" disabled={busy}>
          {busy ? (isEn ? 'Sending…' : 'Enviando…') : (isEn ? 'Send' : 'Enviar')}
        </button>
      </form>
    </>
  );
}

export function ReferralSection() {
  const [lang] = useStorefrontLang();
  const isEn = lang === 'en';
  return (
    <div className="account-empty-state">
      <strong>{isEn ? 'Referrals are coming soon' : 'Los referidos estarán disponibles pronto'}</strong>
      <span>
        {isEn
          ? 'We are preparing a simple way to share the research catalog and track rewards.'
          : 'Estamos preparando una forma sencilla de compartir el catálogo de investigación y consultar recompensas.'}
      </span>
    </div>
  );
}

export function StockSection() {
  const [lang] = useStorefrontLang();
  const isEn = lang === 'en';
  const { rows, reload } = useRequests();
  const [products, setProducts] = useState([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const supabase = getCustomerSupabase();
    if (!supabase) return undefined;
    let active = true;
    supabase.from('products').select('product, status').then(({ data }) => {
      if (!active) return;
      setProducts((data || []).filter((row) => isCatalogOutOfStock(row.status) && row.product));
    });
    return () => { active = false; };
  }, []);

  const watch = async (product) => {
    setNotice('');
    const result = await sendRequest({
      kind: 'stock',
      product,
      message: isEn ? `Please tell me when ${product} is back.` : `Avíseme cuando ${product} vuelva a estar disponible.`,
    });
    setNotice(result.ok
      ? (isEn ? 'Saved.' : 'Guardado.')
      : (result.error || (isEn ? 'Could not save that.' : 'No se pudo guardar.')));
    if (result.ok) reload();
  };

  const watched = rows.filter((row) => String(row.subject || '').startsWith('Back in stock:'));

  return (
    <>
      <h2 className="shop-section-title">{isEn ? 'Out of stock' : 'Agotados'}</h2>
      {products.length === 0 ? (
        <p className="account-muted">{isEn ? 'Everything is currently available.' : 'Actualmente todo está disponible.'}</p>
      ) : (
        <ul className="account-plain-list">
          {products.map((row) => (
            <li key={row.product}>
              <ProductFace name={row.product} />
              <span>{row.product}</span>
              <button type="button" className="account-btn-link" onClick={() => watch(row.product)}>
                {isEn ? 'Tell me' : 'Avíseme'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2 className="shop-section-title">{isEn ? 'Your alerts' : 'Sus avisos'}</h2>
      {watched.length === 0 ? (
        <p className="account-muted">{isEn ? 'You are not watching any products.' : 'No está siguiendo ningún producto.'}</p>
      ) : (
        <ul className="account-plain-list">
          {watched.map((row) => <li key={row.id}>{row.subject.replace('Back in stock: ', '')}</li>)}
        </ul>
      )}
      {notice ? <p className="account-muted">{notice}</p> : null}
    </>
  );
}

export function LearnSection() {
  const [lang] = useStorefrontLang();
  const isEn = lang === 'en';
  const links = [
    { href: `/info-center?lang=${lang}`, en: 'Info center', es: 'Centro de información' },
    { href: `/faq?lang=${lang}`, en: 'Questions', es: 'Preguntas' },
    { href: `/blog?lang=${lang}`, en: 'Articles', es: 'Artículos' },
    { href: `/coa-database?lang=${lang}`, en: 'Lab papers', es: 'Papeles de laboratorio' },
  ];
  return (
    <div className="account-menu">
      {links.map((item) => (
        <Link key={item.href} href={item.href}>{isEn ? item.en : item.es}</Link>
      ))}
    </div>
  );
}

export function AppSection() {
  const [lang] = useStorefrontLang();
  const isEn = lang === 'en';
  return (
    <div className="account-empty-state">
      <strong>{isEn ? 'The mobile app is coming soon' : 'La aplicación móvil estará disponible pronto'}</strong>
      <span>
        {isEn
          ? 'For now, this account is designed to work like an app in your phone browser.'
          : 'Por ahora, esta cuenta está diseñada para funcionar como una aplicación en el navegador de su teléfono.'}
      </span>
    </div>
  );
}

export const ACCOUNT_LINKS = [
  { href: '/account/rewards', en: 'Savings', es: 'Ahorros' },
  { href: '/account/favorites', en: 'Favorites', es: 'Favoritos' },
  { href: '/account/notifications', en: 'Notifications', es: 'Avisos' },
  { href: '/account/help', en: 'Help', es: 'Ayuda' },
  { href: '/account/stock', en: 'Back in stock', es: 'Cuando haya stock' },
  { href: '/account/learn', en: 'Learn', es: 'Aprender' },
];
