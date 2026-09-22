"use client";

import Link from 'next/link';
import { BadgePercent, Clock3, Gift, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useBulkWholesaleCampaign } from '@/hooks/useBulkWholesaleCampaign';
import { dealCountdownParts } from '@/lib/bulkWholesaleCampaign.mjs';
import styles from './BulkWholesaleSpotlight.module.css';

export default function BulkWholesaleSpotlight({ lang = 'es', compact = false }) {
  const campaign = useBulkWholesaleCampaign();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!campaign.validUntil) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [campaign.validUntil]);

  const countdown = dealCountdownParts(campaign.validUntil, now);
  if (!campaign.active || countdown?.expired) return null;

  const en = lang === 'en';
  const href = `/deal-of-the-week?lang=${en ? 'en' : 'es'}`;
  const offersDeal = campaign.pricingMode === 'offers';
  const offerSummaries = en ? campaign.summariesEn : campaign.summariesEs;
  const compactHeadline = offersDeal
    ? offerSummaries.join(' • ')
    : (en
      ? `${campaign.discountPct}% off ${campaign.minUnits}+ selected vials`
      : `${campaign.discountPct}% de descuento en ${campaign.minUnits}+ viales seleccionados`);

  // One slim line for the catalog, where the full card pushed the products
  // below the fold.
  if (compact) {
    return (
      <Link className={styles.strip} href={href}>
        <span className={styles.stripBrand}>
          <span className={styles.stripIcon} aria-hidden="true"><Zap size={17} strokeWidth={2.5} fill="currentColor" /></span>
          <span>
            <strong>{en ? 'Deal of the Week' : 'Oferta de la Semana'}</strong>
            <small>{en ? 'No code needed' : 'Sin código'}</small>
          </span>
        </span>
        <span className={styles.stripCopy}>
          {offersDeal
            ? offerSummaries.map((summary) => {
              const freeOffer = /\b(free|gratis)\b/i.test(summary);
              const OfferIcon = freeOffer ? Gift : BadgePercent;
              return (
                <span className={`${styles.offerLine}${freeOffer ? ` ${styles.freeOffer}` : ''}`} key={summary}>
                  <OfferIcon size={15} aria-hidden="true" />
                  <strong>{summary}</strong>
                </span>
              );
            })
            : (
              <span className={styles.offerLine}>
                <BadgePercent size={15} aria-hidden="true" />
                <strong>{compactHeadline}</strong>
              </span>
            )}
        </span>
        <span className={styles.stripActions}>
          <span className={styles.stripMore}>{en ? 'See the offer →' : 'Ver la oferta →'}</span>
          {countdown && (
            <span
              className={styles.countdown}
              role="timer"
              aria-live="off"
              aria-label={en
                ? `${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes and ${countdown.seconds} seconds remaining`
                : `Quedan ${countdown.days} días, ${countdown.hours} horas, ${countdown.minutes} minutos y ${countdown.seconds} segundos`}
            >
              <small><Clock3 size={13} aria-hidden="true" />{en ? 'Ends in' : 'Termina en'}</small>
              <span className={styles.countdownUnits} aria-hidden="true">
                <span><b>{countdown.days}</b><em>d</em></span>
                <span><b>{String(countdown.hours).padStart(2, '0')}</b><em>h</em></span>
                <span><b>{String(countdown.minutes).padStart(2, '0')}</b><em>m</em></span>
                <span><b>{String(countdown.seconds).padStart(2, '0')}</b><em>s</em></span>
              </span>
            </span>
          )}
        </span>
      </Link>
    );
  }
  return (
    <section className={styles.spotlight} aria-label={en ? 'Deal of the Week' : 'Oferta de la Semana'}>
      <div>
        <p className={styles.eyebrow}>{en ? 'Deal of the Week' : 'Oferta de la Semana'}</p>
        <h2>{offersDeal
          ? (en ? 'Two ways to save this week' : 'Dos formas de ahorrar esta semana')
          : compactHeadline}</h2>
        <p>
          {offersDeal
            ? offerSummaries.join(' • ')
            : en
            ? `Mix and match across ${campaign.products.length} selected products. One bulk price—no discount stacking.`
            : `Combina entre ${campaign.products.length} productos seleccionados. Un solo precio mayorista, sin acumular descuentos.`}
        </p>
      </div>
      <Link className={styles.action} href={`/deal-of-the-week?lang=${en ? 'en' : 'es'}`}>
        {en ? 'See this week\'s deal' : 'Ver la oferta de la semana'}
      </Link>
    </section>
  );
}
