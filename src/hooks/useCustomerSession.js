'use client';

import { useCallback, useEffect, useState } from 'react';

import { getCustomerSupabase, isCustomerAuthConfigured } from '@/lib/customerSupabase';

/**
 * The signed-in customer, tracked live.
 *
 * `loading` starts true and only ever goes false once — pages must not decide
 * to redirect to /account/login before the session has been read out of
 * storage, or a refresh on a signed-in page bounces the customer to the login
 * form and back.
 */
export function useCustomerSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getCustomerSupabase();
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data?.session || null);
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession || null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getCustomerSupabase();
    if (supabase) await supabase.auth.signOut();
    setSession(null);
  }, []);

  return {
    session,
    user: session?.user || null,
    accessToken: session?.access_token || null,
    loading,
    configured: isCustomerAuthConfigured,
    signOut,
  };
}

/**
 * Storefront language.
 *
 * Mirrors how the catalog resolves it — `?lang=` wins, then the visitor's saved
 * choice, then Spanish — so navigating from the catalog into the account keeps
 * the language the customer was already reading in.
 */
export function useStorefrontLang() {
  const [lang, setLang] = useState('es');

  useEffect(() => {
    try {
      const fromQuery = new URLSearchParams(window.location.search).get('lang');
      const stored = localStorage.getItem('lang');
      const resolved = fromQuery || stored || 'es';
      setLang(resolved === 'en' ? 'en' : 'es');
    } catch {
      setLang('es');
    }
  }, []);

  const changeLang = useCallback((next) => {
    const resolved = next === 'en' ? 'en' : 'es';
    setLang(resolved);
    try {
      localStorage.setItem('lang', resolved);
    } catch {
      // Private browsing with storage disabled — the in-memory choice still holds.
    }
  }, []);

  return [lang, changeLang];
}
