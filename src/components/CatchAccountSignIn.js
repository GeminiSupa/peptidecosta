'use client';

import { useEffect } from 'react';

import { getCustomerSupabase } from '@/lib/customerSupabase';

const ACCEPTED = new Set(['magiclink', 'signup', 'email']);

/**
 * A Supabase sign-in link drops the session in the address bar and opens the
 * catalog. The account pages keep their own login, so that session is ignored
 * and the person looks signed out. If the link is still in the address bar,
 * store it as the customer login and open the account.
 */
export default function CatchAccountSignIn() {
  useEffect(() => {
    const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    if (!raw || !raw.includes('access_token=')) return;

    const params = new URLSearchParams(raw);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = String(params.get('type') || '').toLowerCase();
    if (!accessToken || !refreshToken || !ACCEPTED.has(type)) return;
    if (window.location.pathname.startsWith('/admin')) return;

    const supabase = getCustomerSupabase();
    if (!supabase) return;

    let cancelled = false;
    supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    }).then(async ({ error }) => {
      if (cancelled || error) return;
      try {
        await fetch('/api/account/claim-orders', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        // The next sign-in tries again.
      }
      if (cancelled) return;
      window.location.replace('/account');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
