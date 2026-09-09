'use client';

import React from 'react';
import { Wrench } from 'lucide-react';
import { areCardPaymentsPausedForClient } from '@/lib/cardPaymentsPaused.mjs';

// Build-time constant, read once. See src/lib/cardPaymentsPaused.mjs for why
// client code must use the spelled-out reader rather than a dynamic lookup.
const CARD_PAYMENTS_PAUSED = areCardPaymentsPausedForClient();

/**
 * Tells staff that card payments are switched off, and why their buttons are
 * refusing.
 *
 * Without this, the pause looks like a bug from the inside. "Copy card payment
 * link" starts returning an error, customers start asking why the card option
 * has gone, and the only person who knows it was deliberate is whoever set the
 * environment variable. Somebody then spends an afternoon debugging a working
 * system — or worse, quietly turns the pause off to make the error go away.
 *
 * Renders nothing at all when payments are running, so it can sit permanently
 * in the admin layout with no cost.
 *
 * `compact` is the inline version for a single panel; the default is the
 * page-wide banner.
 */
export default function CardPaymentsPausedBanner({ compact = false }) {
  if (!CARD_PAYMENTS_PAUSED) return null;

  return (
    <div className={`admin-card-paused-banner${compact ? ' compact' : ''}`} role="status">
      <span className="admin-card-paused-banner__icon" aria-hidden="true">
        <Wrench size={compact ? 14 : 18} />
      </span>
      <div className="admin-card-paused-banner__body">
        <strong>Card payments are paused for maintenance</strong>
        <p>
          Customers cannot pay by card on the website, and card payment links
          cannot be created or used. Take orders by WhatsApp, SINPE or bank
          transfer until this is switched back on. Nothing has been charged to
          any customer while the pause is in place.
        </p>
      </div>
    </div>
  );
}
