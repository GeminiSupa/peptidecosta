'use client';

import { useEffect, useRef } from 'react';
import { safeSessionStorage } from '@/lib/storage';
import {
  SA_STORAGE_KEY,
  shopperApprovedScriptUrl,
  shopperApprovedValues,
} from '@/lib/shopperApproved.mjs';

/**
 * Shopper Approved's survey, after a purchase.
 *
 * The site id and survey token are passed in from the server. This file does
 * not read them from the environment and does not contain them. Their script
 * reads `window.sa_values` the moment it loads, so that object is set first.
 *
 * The order details come from a one-shot record checkout leaves in session
 * storage. It is read and cleared here so a refresh does not ask again, and
 * so the email does not sit in storage after this page.
 */
export default function ShopperApprovedSurvey({ siteId, token }) {
  // Kept across the development double-run. The record is cleared from storage
  // on the first run, and a second run in the same page view must still be
  // able to load the survey.
  const recordRef = useRef(null);

  useEffect(() => {
    if (!recordRef.current) {
      const raw = safeSessionStorage.getItem(SA_STORAGE_KEY);
      if (!raw) return;
      safeSessionStorage.removeItem(SA_STORAGE_KEY);
      try {
        recordRef.current = JSON.parse(raw);
      } catch {
        return;
      }
    }

    const values = shopperApprovedValues({ siteId, token, record: recordRef.current });
    const src = shopperApprovedScriptUrl(values?.site);
    if (!values || !src) return;

    window.sa_values = values;
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [siteId, token]);

  return null;
}
