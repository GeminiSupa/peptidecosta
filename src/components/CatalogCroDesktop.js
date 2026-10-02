"use client";

import { useEffect, useState } from 'react';
import { BadgePercent, Check, Star } from 'lucide-react';
import { useBulkWholesaleCampaign } from '@/hooks/useBulkWholesaleCampaign';
import { dealCountdownParts } from '@/lib/bulkWholesaleCampaign.mjs';
import { STANDARD_FIVE_PLUS_PCT, tenPlusDiscountPct } from '@/lib/bulkDeal.mjs';
import { DEFAULT_LANDING_PAGE_SETTINGS } from '@/lib/landingContent';
import styles from './CatalogCroDesktop.module.css';

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

export function CatalogCroHero({ lang = 'es', rating = '', settings, onClaim }) {
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
  const score = rating ? String(rating) : '';

  return (
    <section className={styles.hero} aria-label={en ? 'Deal of the Week' : 'Oferta de la Semana'}>
      <div className={styles.copy}>
        {score && (
          <div className={styles.scores} aria-label={en ? 'Review score' : 'Puntaje'}>
            <span><Star size={14} fill="#111" aria-hidden="true" /> {score}</span>
          </div>
        )}
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
  const cells = [
    products && { value: products, label: en ? 'Peptide products' : 'Productos' },
    rating && { value: String(rating), label: en ? 'Average rating' : 'Calificación', star: true },
    { value: '≥98%', label: en ? 'Purity on the certificate' : 'Pureza en el certificado' },
    { value: '$200', label: en ? 'Free shipping from' : 'Envío gratis desde' },
  ].filter(Boolean);

  return (
    <section className={styles.stats} aria-label={en ? 'Store facts' : 'Datos de la tienda'}>
      <p>{en ? 'Trusted by researchers' : 'La confianza de los investigadores'}</p>
      <div>
        {cells.map((cell) => (
          <article key={cell.label}>
            <strong>{cell.value}{cell.star ? ' ★' : ''}</strong>
            <span>{cell.label}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
