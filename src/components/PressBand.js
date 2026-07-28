"use client";

import { ArrowUpRight } from 'lucide-react';
import { DEFAULT_LANDING_PAGE_SETTINGS } from '@/lib/landingContent';

/**
 * "As seen in" strip. Renders one link per outlet in settings.pressItems, so
 * adding coverage is a CMS edit rather than a code change.
 *
 * variant="catalog" is the compact band that sits in the catalog header.
 * variant="landing" is the wider band on the home page.
 */
export default function PressBand({ lang = 'es', settings, variant = 'catalog' }) {
  const isEn = lang === 'en';
  const suffix = isEn ? 'En' : 'Es';

  if (settings && settings.pressActive === false) return null;

  const items = (Array.isArray(settings?.pressItems) && settings.pressItems.length
    ? settings.pressItems
    : DEFAULT_LANDING_PAGE_SETTINGS.pressItems
  ).filter((item) => item?.url && item?.outlet);

  if (!items.length) return null;

  const label = isEn ? 'As seen in' : 'Visto en';
  const cta = settings?.[`pressCta${suffix}`] || DEFAULT_LANDING_PAGE_SETTINGS[`pressCta${suffix}`];

  return (
    <div className={`press-band press-band--multi ${variant === 'landing' ? 'landing-press-band' : 'catalog-press-band'}`}>
      <span className="press-band-label">{label}</span>

      <div className="press-band-outlets">
        {items.map((item, index) => (
          <a
            key={`${item.url}-${index}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="press-band-outlet"
            aria-label={`${label} ${item.outlet}`}
            title={item[`title${suffix}`] || item.outlet}
          >
            {item.logoUrl ? (
              <img src={item.logoUrl} alt={item.outlet} className="press-band-logo" />
            ) : (
              <span className="press-band-wordmark">{item.outlet}</span>
            )}
            {/* One CTA per outlet reads as repetition once there are two, and
                each logo is already the link. */}
            {variant === 'landing' && items.length === 1 && (
              <em className="landing-press-cta">{cta} <ArrowUpRight size={14} /></em>
            )}
          </a>
        ))}
      </div>

      {/* With two or more outlets the quote only ever renders as an ellipsis,
          so it is dropped in favour of giving each logo room. */}
      {variant === 'catalog' && items.length === 1 && items[0]?.[`quote${suffix}`] && (
        <span className="press-band-quote">{items[0][`quote${suffix}`]}</span>
      )}
    </div>
  );
}
