'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const VISITOR_COOKIE = 'pcr_visitor_id';
const SESSION_KEY = 'pcr_analytics_session_id';

const randomId = (prefix) => {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
};

const readCookie = (name) => document.cookie
  .split(';')
  .map((part) => part.trim())
  .find((part) => part.startsWith(`${name}=`))
  ?.slice(name.length + 1) || '';

const getVisitorId = () => {
  const existing = readCookie(VISITOR_COOKIE) || localStorage.getItem(VISITOR_COOKIE);
  if (existing) return existing;
  const created = randomId('visitor');
  const sharedDomain = location.hostname === 'peptidescostarica.net' || location.hostname.endsWith('.peptidescostarica.net');
  document.cookie = `${VISITOR_COOKIE}=${encodeURIComponent(created)}; Max-Age=31536000; Path=/; SameSite=Lax${sharedDomain ? '; Domain=.peptidescostarica.net; Secure' : ''}`;
  localStorage.setItem(VISITOR_COOKIE, created);
  return created;
};

const getSessionId = () => {
  const existing = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem('cart_session_id');
  if (existing) {
    sessionStorage.setItem(SESSION_KEY, existing);
    return existing;
  }
  const created = randomId('session');
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
};

const cartItemCount = () => {
  try {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    return Array.isArray(cart) ? cart.reduce((sum, item) => sum + (Number(item?.qty) || 1), 0) : 0;
  } catch {
    return 0;
  }
};

const contactHint = () => {
  const lead = localStorage.getItem('catalog_lead_contact') || '';
  return {
    email: localStorage.getItem('checkout_customer_email') || (lead.includes('@') ? lead : ''),
    phone: localStorage.getItem('checkout_customer_phone') || (!lead.includes('@') ? lead : ''),
  };
};

const locationHint = () => {
  try {
    return JSON.parse(localStorage.getItem('pcr_analytics_location') || '{}');
  } catch {
    return {};
  }
};

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const base = {
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      hostname: location.hostname,
      path: `${location.pathname}${location.search}`,
      pageTitle: document.title,
      referrer: document.referrer,
      utmSource: params.get('utm_source') || localStorage.getItem('lead_utm_source') || '',
      utmMedium: params.get('utm_medium') || localStorage.getItem('lead_utm_medium') || '',
      utmCampaign: params.get('utm_campaign') || localStorage.getItem('lead_utm_campaign') || '',
      gclid: params.get('gclid') || '',
      fbclid: params.get('fbclid') || '',
    };
    const send = (eventType) => fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ...base, eventType, contact: contactHint(), location: locationHint(), cartItems: cartItemCount() }),
    }).catch(() => {});

    send('page_view');
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') send('heartbeat');
    }, 15000);
    return () => clearInterval(heartbeat);
  }, [pathname]);

  return null;
}
