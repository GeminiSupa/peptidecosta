"use client";

import { useEffect, useState } from 'react';
import { BadgePercent, Check } from 'lucide-react';
import { useBulkWholesaleCampaign } from '@/hooks/useBulkWholesaleCampaign';
import { dealCountdownParts } from '@/lib/bulkWholesaleCampaign.mjs';
import { STANDARD_FIVE_PLUS_PCT, tenPlusDiscountPct } from '@/lib/bulkDeal.mjs';
import { DEFAULT_LANDING_PAGE_SETTINGS } from '@/lib/landingContent';
import { FACEBOOK_REVIEW_URL, GOOGLE_REVIEW_URL, TRUSTPILOT_RATING, getFacebookReviewUrl, getTrustpilotReviewUrl } from '@/lib/businessLinks';
import styles from './CatalogCroDesktop.module.css';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6c-.3 1.4-1 2.5-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8C3.9 20.5 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.7 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.1H2.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.1 4.9l3.6-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1C17.5 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 7.1l3.6 2.8C6.6 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

function TrustpilotMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#00b67a" />
      <path fill="#fff" d="M12 4.6l2.1 6.2h6.5l-5.3 3.8 2 6.2L12 17l-5.3 3.8 2-6.2-5.3-3.8h6.5z" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path fill="#fff" d="M13.4 19.5v-6.1h2.1l.3-2.4h-2.4V9.4c0-.7.2-1.2 1.2-1.2h1.3V6.1c-.2 0-1-.1-1.9-.1-1.9 0-3.1 1.1-3.1 3.2V11H8.8v2.4h2.1v6.1h2.5z" />
    </svg>
  );
}

function standingLines(lang) {
  const en = lang === 'en';
  const ten = tenPlusDiscountPct();
  return [
    en
      ? `Buy 5+ vials, save ${STANDARD_FIVE_PLUS_PCT}%`
      : `5+ viales, ${STANDARD_FIVE_PLUS_PCT}% de descuento`,
    en
      ? `Buy 10+ vials, save ${ten}%`
      : `10+ viales, ${ten}% de descuento`,
  ];
}

function offerLines(lang, campaign) {
  const live = campaign.active
    ? ((lang === 'en' ? campaign.summariesEn : campaign.summariesEs) || []).filter(Boolean)
    : [];
  // A live deal already states its own 5+ and 10+ rules. Adding the standing
  // 15% beside "20% off at 5 vials" would show two discounts for one order.
  if (live.length) return live.slice(0, 4);
  return standingLines(lang);
}

export function CatalogCroTicker({ lang = 'es' }) {
  const campaign = useBulkWholesaleCampaign();
  const en = lang === 'en';
  const ten = tenPlusDiscountPct();
  const live = campaign.active
    ? ((en ? campaign.summariesEn : campaign.summariesEs) || []).filter(Boolean)
    : [];
  const parts = live.length
    ? [...live]
    : [
      en ? `${STANDARD_FIVE_PLUS_PCT}% OFF 5+ Vials` : `${STANDARD_FIVE_PLUS_PCT}% en 5+ viales`,
      en ? `${ten}% OFF 10+ Vials` : `${ten}% en 10+ viales`,
      en ? 'Mix & Match Allowed' : 'Se pueden combinar',
    ];
  parts.push(en ? 'Free Shipping Over $200' : 'Envío gratis sobre $200');
  parts.push(en ? 'No Promo Code Needed' : 'Sin código de promoción');
  const line = parts.join('   •   ');
  // Long enough to read, short enough that the line is obviously moving.
  const duration = Math.max(16, Math.min(36, Math.round(line.length / 6)));

  return (
    <div className={styles.ticker}>
      <div className={styles.track} style={{ animationDuration: `${duration}s` }}>
        <p>{line}</p>
        <p aria-hidden="true">{line}</p>
      </div>
    </div>
  );
}

export function CatalogCroHero({ lang = 'es', rating = '', settings, links = {}, onClaim }) {
  const campaign = useBulkWholesaleCampaign();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!campaign.validUntil) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [campaign.validUntil]);

  const en = lang === 'en';
  const countdown = campaign.active ? dealCountdownParts(campaign.validUntil, now) : null;
  const showClock = countdown && !countdown.expired;
  const lines = offerLines(lang, campaign);
  const pressItems = (Array.isArray(settings?.pressItems) && settings.pressItems.length
    ? settings.pressItems
    : DEFAULT_LANDING_PAGE_SETTINGS.pressItems
  ).filter((item) => item?.outlet);
  const press = settings?.pressActive === false
    ? null
    : (pressItems.find((item) => /tico times/i.test(item.outlet || '')) || pressItems[0]);
  const quote = en ? '"Serving Quality peptide products"' : '"Productos de péptidos de calidad"';
  const score = rating ? String(rating) : TRUSTPILOT_RATING;
  const googleHref = links.googleReviewUrl || links.googleMapsUrl || GOOGLE_REVIEW_URL;
  const trustpilotHref = getTrustpilotReviewUrl(lang, links);
  const facebookHref = getFacebookReviewUrl(links) || FACEBOOK_REVIEW_URL;

  return (
    <section className={styles.hero} aria-label={en ? 'Deal of the Week' : 'Oferta de la Semana'}>
      <div className={styles.copy}>
        <h2>{campaign.active
          ? (en ? 'Deal of the Week' : 'Oferta de la Semana')
          : (en ? 'Save more as you add vials' : 'Ahorra más al agregar viales')}</h2>
        <ul>
          {lines.map((line) => (
            <li key={line}>
              <BadgePercent size={18} aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
          <li className={styles.note}>
            {en ? 'The best saving is applied. These do not combine.' : 'Se aplica el mayor ahorro. No se combinan.'}
          </li>
        </ul>
        <div className={styles.scores} aria-label={en ? 'Review scores' : 'Puntajes'}>
          <a href={googleHref} target="_blank" rel="noopener noreferrer">
            <GoogleMark />
            <span>5.0</span>
          </a>
          <a href={trustpilotHref} target="_blank" rel="noopener noreferrer">
            <TrustpilotMark />
            <span>{score}</span>
          </a>
          <a href={facebookHref} target="_blank" rel="noopener noreferrer">
            <FacebookMark />
            <span>5.0</span>
          </a>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.claim} onClick={onClaim}>
            {en ? 'Claim offer' : 'Tomar la oferta'}
          </button>
          {showClock && (
            <div className={styles.clock} role="timer">
              {countdown.days > 0 && (
                <span><b>{String(countdown.days).padStart(2, '0')}</b><small>{en ? 'Days' : 'Días'}</small></span>
              )}
              <span><b>{String(countdown.hours).padStart(2, '0')}</b><small>{en ? 'Hrs' : 'Hrs'}</small></span>
              <span><b>{String(countdown.minutes).padStart(2, '0')}</b><small>{en ? 'Min' : 'Min'}</small></span>
              {countdown.days < 1 && (
                <span><b>{String(countdown.seconds).padStart(2, '0')}</b><small>{en ? 'Sec' : 'Seg'}</small></span>
              )}
            </div>
          )}
        </div>
        <p className={styles.proof}>
          <span className={styles.faces} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {en
            ? '244 researchers started using our products last week alone.'
            : '244 investigadores empezaron a usar nuestros productos solo la semana pasada.'}
        </p>
      </div>
      <div className={styles.visual}>
        <img src="/figma/catalog-hero-vials.png" alt="" />
        {press && (
          <a className={styles.press} href={press.url} target="_blank" rel="noopener noreferrer">
            <small>{en ? 'As seen in' : 'Visto en'}</small>
            <img src={press.logoUrl || '/tico-times-logo.png'} alt={press.outlet} />
            {quote && <em>{quote}</em>}
          </a>
        )}
      </div>
    </section>
  );
}

export function CatalogCroTrust({ lang = 'es' }) {
  const en = lang === 'en';
  const items = en
    ? ['Free shipping over $200', 'Lab-tested batches', 'Research grade. Verified purity', 'Certificate of analysis']
    : ['Envío gratis sobre $200', 'Lotes analizados en laboratorio', 'Grado de investigación. Pureza verificada', 'Certificado de análisis'];
  return (
    <ul className={styles.trust}>
      {items.map((item) => (
        <li key={item}><Check size={16} aria-hidden="true" /> {item}</li>
      ))}
    </ul>
  );
}

export function CatalogCroStats({ lang = 'es', productCount = 0, rating = '' }) {
  const en = lang === 'en';
  const products = Number(productCount) > 0 ? `${productCount}+` : '';
  const bits = [
    products && (en ? `${products} products` : `${products} productos`),
    rating && `${rating}★`,
    en ? '≥98% purity' : '≥98% pureza',
    en ? 'Free shipping from $200' : 'Envío gratis desde $200',
  ].filter(Boolean);

  return (
    <p className="catalog-inline-facts">
      {bits.join(' · ')}
    </p>
  );
}
