"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BadgePercent, Gift, Star, Truck, ShieldCheck, FlaskConical, Users } from 'lucide-react';
import PressBand from '@/components/PressBand';
import { useBulkWholesaleCampaign } from '@/hooks/useBulkWholesaleCampaign';
import { dealCountdownParts } from '@/lib/bulkWholesaleCampaign.mjs';
import { FREE_SHIPPING_USD_THRESHOLD } from '@/lib/pricing';
import { getFacebookReviewUrl, getTrustpilotReviewUrl } from '@/lib/businessLinks';
import styles from './CatalogHero.module.css';

/**
 * The offer-first top of the catalog.
 *
 * It replaces the old order of things — review badges, press band and a large
 * decorative vial photo before any product or price. The CRO review asked for
 * the commercial offer to lead and the social proof to sit inside it as
 * support, so ratings and press are rendered here at a supporting size.
 *
 * The deal it describes is the WEEKLY deal (/api/deals/bulk-wholesale reads
 * getLiveDeal, which is weekly-only), so the countdown and the "Deal of the
 * Week" wording always belong to the same row. A flash sale is a different
 * deal with a different end time and is not described here.
 *
 * The card is the weekly deal and nothing else. It is not drawn when no weekly
 * deal is live, and the Deal of the Week tab can switch it off even then.
 * Offer lines come from the offers created in that tab.
 */
export default function CatalogHero({ lang = 'es', links = {}, trustpilotRating = '4.7', settings }) {
  const en = lang === 'en';
  const campaign = useBulkWholesaleCampaign();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!campaign.validUntil) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [campaign.validUntil]);

  const countdown = dealCountdownParts(campaign.validUntil, now);
  const dealLive = Boolean(campaign.active) && !countdown?.expired;
  const offerSummaries = (en ? campaign.summariesEn : campaign.summariesEs) || [];
  const thresholdHeadline = en
    ? `${campaign.discountPct}% off ${campaign.minUnits}+ selected vials`
    : `${campaign.discountPct}% de descuento en ${campaign.minUnits}+ viales seleccionados`;
  const lines = campaign.pricingMode === 'offers' ? offerSummaries : [thresholdHeadline];
  const headline = en ? 'Deal of the Week' : 'Oferta de la Semana';

  // Hidden until a weekly deal is live, and hidden when the admin switch is off.
  // While the deal is still loading, stay hidden so the everyday volume lines
  // never flash in its place.
  if (!dealLive || campaign.cardEnabled === false) return null;

  const benefits = [
    { icon: Truck, text: en ? `Free shipping over $${FREE_SHIPPING_USD_THRESHOLD}` : `Envío gratis sobre $${FREE_SHIPPING_USD_THRESHOLD}` },
    { icon: Users, text: en ? '+3,400 verified researchers' : '+3,400 investigadores verificados' },
    { icon: FlaskConical, text: en ? 'Research grade, verified purity' : 'Grado investigación, pureza verificada' },
    { icon: ShieldCheck, text: en ? 'Lab-tested and certified' : 'Probado y certificado en laboratorio' },
  ];

  const ratings = [
    { key: 'trustpilot', label: 'Trustpilot', score: trustpilotRating, href: getTrustpilotReviewUrl(lang, links), color: '#00b67a' },
    { key: 'google', label: 'Google', score: '5.0', href: links.googleReviewUrl || links.googleMapsUrl, color: '#FBBC05' },
    { key: 'facebook', label: 'Facebook', score: '5.0', href: getFacebookReviewUrl(links), color: '#1877F2' },
  ].filter((item) => Boolean(item.href));

  return (
    <section className={`catalog-hero-wrap ${styles.wrap}`} aria-label={headline}>
      <div className={`container ${styles.card}`}>
        <div className={styles.copy}>
          <div className={styles.ratings}>
            {ratings.map((item) => (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.rating}
                aria-label={`${item.label} ${item.score} ${en ? 'out of 5' : 'de 5'}`}
              >
                <Star size={13} fill={item.color} color={item.color} aria-hidden="true" />
                <b>{item.score}</b>
                <span>{item.label}</span>
              </a>
            ))}
          </div>

          <h2 className={styles.headline}>{headline}</h2>

          <ul className={styles.offers}>
            {lines.map((line) => {
              const freeOffer = /\b(free|gratis)\b/i.test(line);
              const OfferIcon = freeOffer ? Gift : BadgePercent;
              return (
                <li key={line}>
                  <OfferIcon size={17} aria-hidden="true" />
                  <span>{line}</span>
                </li>
              );
            })}
          </ul>

          <p className={styles.noCode}>
            {en ? 'Mix and match allowed. No promo code needed.' : 'Combina como quieras. Sin código promocional.'}
          </p>

          <div className={styles.actions}>
            <Link
              className={styles.cta}
              href={dealLive ? `/deal-of-the-week?lang=${en ? 'en' : 'es'}` : '#catalog-products'}
            >
              {dealLive ? (en ? 'Claim offer' : 'Aprovechar oferta') : (en ? 'Shop peptides' : 'Ver péptidos')}
            </Link>
            {dealLive && countdown && (
              <span
                className={styles.countdown}
                role="timer"
                aria-live="off"
                aria-label={en
                  ? `${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes and ${countdown.seconds} seconds remaining`
                  : `Quedan ${countdown.days} días, ${countdown.hours} horas, ${countdown.minutes} minutos y ${countdown.seconds} segundos`}
              >
                {countdown.days > 0 && (
                  <span><b>{countdown.days}</b><em>{en ? 'days' : 'días'}</em></span>
                )}
                <span><b>{String(countdown.hours).padStart(2, '0')}</b><em>{en ? 'hrs' : 'hrs'}</em></span>
                <span><b>{String(countdown.minutes).padStart(2, '0')}</b><em>min</em></span>
                <span><b>{String(countdown.seconds).padStart(2, '0')}</b><em>seg</em></span>
              </span>
            )}
          </div>
        </div>

        <div className={styles.aside}>
          <img
            className={styles.vials}
            src="/catalog-promo-banner.webp"
            alt={en ? 'Peptides Costa Rica product vials' : 'Viales de Peptides Costa Rica'}
          />
          <PressBand lang={lang} settings={settings} variant="catalog" />
        </div>
      </div>

      <div className={`container ${styles.benefits}`}>
        {benefits.map(({ icon: Icon, text }) => (
          <span key={text} className={styles.benefit}>
            <Icon size={15} aria-hidden="true" />
            {text}
          </span>
        ))}
      </div>
    </section>
  );
}
