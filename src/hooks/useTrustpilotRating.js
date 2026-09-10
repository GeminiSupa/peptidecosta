'use client';

import { useEffect, useState } from 'react';
import { TRUSTPILOT_RATING, TRUSTPILOT_REVIEW_COUNT } from '@/lib/businessLinks';

const CACHE_KEY = 'pcr_trustpilot_rating';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Returns the live Trustpilot rating and review count fetched from our own
 * /api/trustpilot-rating proxy (which scrapes Trustpilot server-side and
 * caches for 6 hours). Falls back to the hardcoded constants in businessLinks
 * while the fetch is in flight or if it fails.
 *
 * The result is also stored in sessionStorage so repeat visits within the
 * same session never make a second round-trip.
 */
export function useTrustpilotRating() {
  const [rating, setRating] = useState(TRUSTPILOT_RATING);
  const [reviewCount, setReviewCount] = useState(TRUSTPILOT_REVIEW_COUNT);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Check sessionStorage first to avoid a network round-trip on every
      // component mount within the same browser session.
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { rating: r, reviewCount: c, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL_MS) {
            if (!cancelled) {
              setRating(r);
              setReviewCount(c);
            }
            return;
          }
        }
      } catch {
        // sessionStorage may be blocked in private mode — that is fine.
      }

      try {
        const res = await fetch('/api/trustpilot-rating', { next: { revalidate: 21600 } });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.rating) {
          setRating(String(data.rating));
          setReviewCount(Number(data.reviewCount) || TRUSTPILOT_REVIEW_COUNT);
          try {
            sessionStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ rating: data.rating, reviewCount: data.reviewCount, timestamp: Date.now() }),
            );
          } catch {
            // Ignore storage errors.
          }
        }
      } catch (err) {
        console.warn('[useTrustpilotRating] Could not fetch live rating:', err.message);
        // Silent fallback — the hardcoded defaults from useState remain.
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { rating, reviewCount };
}
