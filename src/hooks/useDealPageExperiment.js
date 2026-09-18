"use client";

import { useCallback, useEffect, useState } from 'react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import {
  DEAL_PAGE_SEEN_KEY,
  DEAL_PAGE_VARIANT_KEY,
  experimentOrderTag,
  pickVariant,
} from '@/lib/dealPageExperiment.mjs';

// The site-wide tracker's own ids, so a deal-page visitor is the same visitor
// Analytics already knows. See AnalyticsTracker.js.
const VISITOR_COOKIE = 'pcr_visitor_id';
const SESSION_KEY = 'pcr_analytics_session_id';
const OWN_VISITOR_KEY = 'dow_visitor_id';

function readVisitorId() {
  try {
    const cookie = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${VISITOR_COOKIE}=`));
    if (cookie) return decodeURIComponent(cookie.slice(VISITOR_COOKIE.length + 1));
  } catch {
    // Cookies blocked.
  }
  const shared = localStorage.getItem(VISITOR_COOKIE);
  if (shared) return shared;
  let own = localStorage.getItem(OWN_VISITOR_KEY);
  if (!own) {
    own = `visitor_${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    localStorage.setItem(OWN_VISITOR_KEY, own);
  }
  return own;
}

function readSessionId() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Sent with a checkout so the order is credited to the page version this
 * shopper saw — or null when they have not seen the deal page in 14 days.
 */
export function readDealPageOrderTag() {
  try {
    const tag = experimentOrderTag({
      variant: localStorage.getItem(DEAL_PAGE_VARIANT_KEY),
      seenAt: localStorage.getItem(DEAL_PAGE_SEEN_KEY),
    });
    return tag ? { ...tag, visitorId: readVisitorId() } : null;
  } catch {
    return null;
  }
}

export function useDealPageExperiment() {
  const [variant, setVariant] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chosen = pickVariant({
      requested: params.get('variant'),
      stored: localStorage.getItem(DEAL_PAGE_VARIANT_KEY),
    });
    localStorage.setItem(DEAL_PAGE_VARIANT_KEY, chosen);
    setVariant(chosen);
  }, []);

  const track = useCallback((event, extra = {}) => {
    if (!variant) return;
    localStorage.setItem(DEAL_PAGE_SEEN_KEY, String(Date.now()));
    fetch('/api/deal-page/ab-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ variant, event, visitorId: readVisitorId(), sessionId: readSessionId(), ...extra }),
    }).catch(() => {});
  }, [variant]);

  return { variant, track };
}
