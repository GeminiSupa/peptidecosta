"use client";

import Link from 'next/link';
import { Check, PackageCheck, ShieldCheck } from 'lucide-react';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import { useBulkWholesaleCampaign, useBulkWholesaleVariant } from '@/hooks/useBulkWholesaleCampaign';
import { bulkWholesaleCatalogHref } from '@/lib/bulkWholesaleCampaign.mjs';
import { StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import MobileActionBar from '@/components/MobileActionBar';
import styles from './bulk-discounts.module.css';
import '../landing.css';

export default function BulkDiscountsPage() {
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_bulk_discounts');
  const { links } = useBusinessLinks();
  const campaign = useBulkWholesaleCampaign();
  const variant = useBulkWholesaleVariant();
  const en = lang === 'en';
  const parsedFeatured = Number.parseInt(pageSettings.featuredTierIndex, 10);
  const featuredIndex = Number.isNaN(parsedFeatured) ? 1 : parsedFeatured;
  const catalogHref = bulkWholesaleCatalogHref({ lang, variant, active: campaign.active });
  // The deal's banner text is written for a one-line ticker. Used as this
  // page's title it filled four lines at 72px, so the title is always short.
  const heroTitle = en
    ? `${campaign.discountPct}% off when you mix ${campaign.minUnits}+ vials`
    : `${campaign.discountPct}% de descuento al combinar ${campaign.minUnits}+ viales`;

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} />
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{en ? 'Bulk wholesale peptides' : 'Péptidos al por mayor'}</p>
          <h1>{campaign.active ? heroTitle : localized(pageSettings, 'heroTitle', lang)}</h1>
          <p className={styles.lead}>{campaign.active
            ? (en ? `Mix and match any ${campaign.minUnits} or more qualifying vials from the selected products below and save ${campaign.discountPct}%.` : `Combina ${campaign.minUnits} o más viales elegibles de los productos seleccionados y ahorra un ${campaign.discountPct}%.`)
            : localized(pageSettings, 'heroText', lang)}</p>
          {campaign.active && <>
            <div className={styles.live}>{en ? 'Live now · Applied automatically—no code needed' : 'Disponible ahora · Se aplica automáticamente—sin código'}</div>
            <div className={styles.facts}>
              <span><strong>{campaign.discountPct}%</strong>{en ? ' off' : ' desc.'}</span><span><strong>{campaign.minUnits}+</strong>{en ? ' selected vials' : ' viales seleccionados'}</span><span><strong>{campaign.products.length}</strong>{en ? ' eligible products' : ' productos elegibles'}</span>
            </div>
          </>}
          <Link className={styles.cta} href={catalogHref}>{campaign.active ? (en ? `Build my ${campaign.minUnits}-vial order` : `Armar mi pedido de ${campaign.minUnits} viales`) : localized(pageSettings, 'ctaButton', lang)}</Link>
        </section>

        {campaign.active && <section className={styles.details}>
          <div><h2>{en ? 'How the offer works' : 'Cómo funciona la oferta'}</h2><ul className={styles.rules}>
            <li><Check />{en ? `Choose ${campaign.minUnits}+ qualifying vials in any combination.` : `Elige ${campaign.minUnits}+ viales elegibles en cualquier combinación.`}</li>
            <li><Check />{en ? `The ${campaign.discountPct}% discount applies automatically; only eligible vials are discounted.` : `El ${campaign.discountPct}% de descuento se aplica automáticamente; solo se descuentan los viales elegibles.`}</li>
            <li><ShieldCheck />{en ? 'This offer does not combine with promo codes or automatic volume discounts.' : 'Esta oferta no se combina con códigos promocionales ni descuentos automáticos por volumen.'}</li>
            <li><PackageCheck />{en ? 'Stock is limited. Availability is subject to confirmation and quantities may be limited.' : 'El inventario es limitado. La disponibilidad está sujeta a confirmación y las cantidades pueden limitarse.'}</li>
          </ul></div>
          <div><h2>{en ? 'Eligible products' : 'Productos elegibles'}</h2><div className={styles.products}>{campaign.products.map((product) => <Link key={product} href={bulkWholesaleCatalogHref({ lang, variant, product, active: campaign.active })}><Check aria-hidden="true" />{product}</Link>)}</div></div>
        </section>}

        <section className={styles.evergreen}>
          <div className={styles.sectionHead}><h2>{en ? 'Ongoing volume pricing' : 'Precios permanentes por volumen'}</h2><p>{en ? 'Our standard catalog tiers remain available when this special offer does not apply.' : 'Los niveles estándar del catálogo siguen disponibles cuando esta oferta especial no aplica.'}</p></div>
          <div className={styles.tiers}>{(pageSettings.tiers || []).map((tier, index) => <div key={`${tier.labelEn}-${index}`} className={index === featuredIndex ? styles.featuredTier : styles.tier}><h3>{localized(tier, 'label', lang)}</h3><strong>{localized(tier, 'value', lang)}</strong><p>{localized(tier, 'text', lang)}</p></div>)}</div>        </section>
      </main>
      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
