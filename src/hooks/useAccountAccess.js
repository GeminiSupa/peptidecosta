'use client';

import { useEffect, useState } from 'react';

import {
  PREVIEW_PARAM,
  PREVIEW_STORAGE_KEY,
  isAccountsLive,
  resolveAccountAccess,
} from '@/lib/accountPreview.mjs';

/**
 * Whether to render the account area or the coming-soon notice.
 *
 * `checking` starts true so a gated page never flashes the real dashboard (or
 * the notice) before the answer is known. Arriving with ?account_preview=true
 * persists the grant, so the parameter only has to be used once per browser.
 */
export function useAccountAccess() {
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const live = isAccountsLive(process.env.NEXT_PUBLIC_ACCOUNTS_LIVE);

    let paramValue = null;
    let stored = null;
    try {
      paramValue = new URLSearchParams(window.location.search).get(PREVIEW_PARAM);
      stored = localStorage.getItem(PREVIEW_STORAGE_KEY);
    } catch {
      // Storage blocked (private browsing): the parameter still works for this
      // page load, it just will not persist to the next one.
    }

    const access = resolveAccountAccess({ live, paramValue, stored });

    if (access && !live) {
      try {
        localStorage.setItem(PREVIEW_STORAGE_KEY, 'true');
      } catch {
        // See above — a non-persisted preview is still a usable one.
      }
    }

    setAllowed(access);
    setChecking(false);
  }, []);

  return { allowed, checking };
}
