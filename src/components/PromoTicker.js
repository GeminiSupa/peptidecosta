"use client";

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { normalizeBannerCopy, sanitizeBannerHref } from '@/lib/bannerText';

export default function PromoTicker({ active = true, text = '', href = '', className = '', lang = 'es' }) {
  const [paused, setPaused] = useState(true);
  const normalized = normalizeBannerCopy(text);
  const cleanText = normalized.text;
  const tickerHref = sanitizeBannerHref(href || normalized.href);

  if (!active || !cleanText) return null;

  const textLength = cleanText.length || 100;
  const duration = Math.max(36, Math.round(textLength * (80 / 140)));
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
          style={paused
            ? { animation: 'none' }
            : { animationDuration: `${duration}s`, animationPlayState: 'running' }}
        >
          {[...Array(6)].map((_, i) => (
            <ItemTag key={i} className="promo-banner-text" style={{ padding: '0 20px' }} {...linkProps}>
              <Sparkles size={14} className="promo-icon" />
              <span>{cleanText}</span>
            </ItemTag>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="promo-banner-pause"
        aria-pressed={paused}
        aria-label={paused
          ? (lang === 'en' ? 'Play announcement ticker' : 'Reproducir anuncio')
          : (lang === 'en' ? 'Pause announcement ticker' : 'Pausar anuncio')}
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? (lang === 'en' ? 'Play' : 'Reproducir') : (lang === 'en' ? 'Pause' : 'Pausar')}
      </button>
    </div>
  );
}
