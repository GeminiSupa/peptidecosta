"use client";

import { Sparkles } from 'lucide-react';

export default function PromoTicker({ active = true, text = '' }) {
  if (!active || !text) return null;

  const textLength = text.length || 100;
  const duration = Math.max(36, Math.round(textLength * (80 / 140)));

  return (
    <div className="promo-banner-global">
      <div className="promo-banner-ticker">
        <div className="promo-banner-track" style={{ animationDuration: `${duration}s` }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="promo-banner-text" style={{ padding: '0 20px' }}>
              <Sparkles size={14} className="promo-icon" />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
