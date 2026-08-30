"use client";

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { safeSessionStorage } from '@/lib/storage';
import {
  GCR_MERCHANT_ID,
  GCR_STORAGE_KEY,
  reviewOptInPayload,
} from '@/lib/googleCustomerReviews.mjs';

/**
 * Google's survey opt-in badge, shown once on the order confirmation page.
 *
 * Google's own snippet hangs a `renderOptIn` function off `window` and asks
 * platform.js to call it via `?onload=`. That only works if the global exists
 * before the script runs, which is a race React gives no clean way to win. The
 * callback form below does the same work with no global and no ordering
 * assumption: next/script tells us when the library is ready, and we call it.
 *
 * The order details come from a one-shot record checkout leaves in session
 * storage. It is read and cleared here so a refresh — or a customer who
 * bookmarks the confirmation page — does not ask Google about the same order
 * twice, and so an email address does not sit in storage longer than the one
 * page that needs it.
 */
export default function GoogleCustomerReviews() {
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    const raw = safeSessionStorage.getItem(GCR_STORAGE_KEY);
    if (!raw) return;
    safeSessionStorage.removeItem(GCR_STORAGE_KEY);

    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      return;
    }
    // Null when the order cannot support the ask — a missing order number, no
    // email. Google would reject it silently, so we simply do not ask.
    setPayload(reviewOptInPayload(record, GCR_MERCHANT_ID));
  }, []);

  if (!payload) return null;

  return (
    <Script
      id="google-customer-reviews"
      src="https://apis.google.com/js/platform.js"
      strategy="afterInteractive"
      onLoad={() => {
        window.gapi?.load('surveyoptin', () => {
          try {
            window.gapi.surveyoptin.render(payload);
          } catch (error) {
            // A badge that fails to draw must never take the confirmation page
            // with it. The customer has already paid; this is the least
            // important thing on the screen.
            console.warn('[Google Customer Reviews] Opt-in did not render:', error?.message);
          }
        });
      }}
    />
  );
}
