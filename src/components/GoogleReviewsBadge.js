"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { safeLocalStorage } from '@/lib/storage';
import { reviewBadgeConfig } from '@/lib/googleCustomerReviews.mjs';

/**
 * Google's seller-rating badge, floating in the bottom-left corner.
 *
 * The companion to GoogleCustomerReviews.js: that one asks a customer who has
 * just paid whether Google may survey them, this one shows the rating those
 * surveys add up to. Nothing here depends on an order, so it runs site-wide.
 *
 * Google's published snippet hangs the call off `merchantWidgetScript`'s load
 * event, which needs the <script> tag to exist in the markup with that exact
 * id. next/script owns the tag instead and tells us when it is ready, which
 * gets to the same place without depending on how React happened to render.
 *
 * Where it does *not* appear is handled two different ways, because there are
 * two different problems. Refusing to render <Script> keeps Google's file off
 * the admin dashboard entirely. Once the widget has drawn itself, though, it
 * is Google's element in <body> and unmounting our <Script> does not take it
 * away — so a class on <body> hides it, on the same pattern MobileActionBar
 * already uses to lift the chat launcher.
 */

// Whether the widget has been started in this document. Module scope rather
// than a ref, because it describes the page and not the component: navigating
// admin → storefront remounts this, and next/script — the file already cached
// — reports ready a second time.
//
// Google's script does refuse a second render on its own; it throws "Store
// widget iFrame already exists" rather than drawing two badges. This flag is
// so that never happens in the first place, instead of throwing on every
// remount and leaving the catch below to explain away a non-problem.
let started = false;

const HIDDEN_CLASS = 'hide-reviews-badge';

/**
 * The language the visitor is reading the site in, resolved the way every page
 * here resolves it: an explicit ?lang wins, then the stored choice, then
 * Spanish.
 *
 * Read once, when the widget starts. Switching language re-navigates but does
 * not remount the badge, so it keeps the language it opened with until the
 * next full load — a stale word in a corner panel, against the cost of tearing
 * down and re-injecting a third-party iframe on every toggle.
 */
function currentLanguage() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    return fromUrl || safeLocalStorage.getItem('lang') || 'es';
  } catch {
    return 'es';
  }
}

export default function GoogleReviewsBadge() {
  const pathname = usePathname();

  // Not over the admin dashboard, which is staff-facing and has no use for a
  // shopper trust signal, and not inside /embed, which renders in a customer's
  // iframe where anything position:fixed anchors itself to their page rather
  // than ours. The same two exclusions ChatWidget makes, for the same reasons.
  const hidden = Boolean(pathname?.startsWith('/admin') || pathname?.startsWith('/embed'));

  useEffect(() => {
    document.body.classList.toggle(HIDDEN_CLASS, hidden);
    return () => document.body.classList.remove(HIDDEN_CLASS);
  }, [hidden]);

  // Cheap and deterministic — no browser state — so it is safe to decide this
  // during render and skip the network request altogether when the badge is
  // switched off.
  if (hidden || !reviewBadgeConfig()) return null;

  return (
    <Script
      id="merchantWidgetScript"
      src="https://www.gstatic.com/shopping/merchant/merchantwidget.js"
      strategy="lazyOnload"
      onReady={() => {
        if (started) return;
        const config = reviewBadgeConfig({ language: currentLanguage() });
        if (!config) return;
        try {
          window.merchantwidget?.start(config);
          started = true;
        } catch (error) {
          // A badge is the least important thing on any page it appears on.
          // Whatever went wrong inside Google's script, the page keeps working.
          console.warn('[Google Customer Reviews] Badge did not start:', error?.message);
        }
      }}
    />
  );
}
