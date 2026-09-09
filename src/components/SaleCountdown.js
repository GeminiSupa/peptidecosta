'use client';

import { useEffect, useState } from 'react';
import {
  countdownLabel,
  countdownParts,
  countdownTickMs,
  formatCountdown,
  shouldShowCountdown,
} from '@/lib/saleCountdown.mjs';

/**
 * The live "ends in" strip that sits inside an announcement banner.
 *
 * Renders nothing at all unless SALE_COUNTDOWN_ENABLED is on AND the banner
 * opted in AND its end time is still in the future — shouldShowCountdown holds
 * all four conditions, so this component has no opinion of its own about
 * whether the feature is live.
 *
 * The first paint is deliberately empty. Server and client would otherwise
 * render two different clocks and React would report a hydration mismatch, so
 * the countdown only appears once mounted in the browser.
 */
export default function SaleCountdown({ banner, lang = 'es', variant = 'inline' }) {
  const [now, setNow] = useState(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  useEffect(() => {
    if (!now) return undefined;
    const parts = countdownParts(banner?.countdownEndsAt, now);
    const tick = countdownTickMs(parts);
    if (!tick) return undefined;
    // Re-read the clock rather than adding the interval to it, so a tab that
    // was backgrounded catches up instead of drifting slowly behind.
    const id = setInterval(() => setNow(new Date()), tick);
    return () => clearInterval(id);
  }, [now, banner?.countdownEndsAt]);

  if (!now) return null;
  if (!shouldShowCountdown(banner, now)) return null;

  const parts = countdownParts(banner?.countdownEndsAt, now);
  const clock = formatCountdown(parts);
  const label = countdownLabel(parts, lang);
  if (!clock) return null;

  const urgent = parts.urgent;
  const isBlock = variant === 'block';

  return (
    <span
      className={`sale-countdown${urgent ? ' is-urgent' : ''}${isBlock ? ' is-block' : ''}`}
      // A screen reader should hear this once, not on every tick.
      aria-live="off"
      aria-label={`${label} ${clock}`}
    >
      <span className="sale-countdown-label">{label}</span>
      <span className="sale-countdown-clock">{clock}</span>
    </span>
  );
}
