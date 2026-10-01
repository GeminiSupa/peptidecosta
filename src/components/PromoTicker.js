"use client";

import { Sparkles } from 'lucide-react';
import { normalizeBannerCopy, sanitizeBannerHref } from '@/lib/bannerText';

export default function PromoTicker({ active = true, text = '', href = '', className = '', lang = 'es' }) {
  const normalized = normalizeBannerCopy(text);
  const cleanText = normalized.text;
  const tickerHref = sanitizeBannerHref(href || normalized.href);

  if (!active || !cleanText) return null;

  const textLength = cleanText.length || 100;
  // Two copies when the sentence is already wider than a phone. Six copies
  // when it is short, so the bar never shows an empty gap. Speed stays
  // about the same either way, fast enough to see it move.
  const copies = textLength > 80 ? 2 : 6;
  const duration = Math.max(12, Math.round((textLength * copies) / 14));
  const ItemTag = tickerHref ? 'a' : 'div';
  const linkProps = tickerHref
    ? {
      href: tickerHref,
      ...(tickerHref.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
    }
    : {};

  return (
    <div className={`promo-banner-global ${className}`.trim()}>
      <div className="promo-banner-ticker">
        <div
          className="promo-banner-track"
          style={{ animationDuration: `${duration}s`, animationPlayState: 'running' }}
        >
          {[...Array(copies)].map((_, i) => (
            <ItemTag key={i} className="promo-banner-text" style={{ padding: '0 20px' }} {...linkProps}>
              <Sparkles size={14} className="promo-icon" />
              <span>{cleanText}</span>
            </ItemTag>
          ))}
        </div>
      </div>
    </div>
  );
}
