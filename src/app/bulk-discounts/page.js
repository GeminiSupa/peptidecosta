"use client";

import Link from 'next/link';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import { StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import MobileActionBar from '@/components/MobileActionBar';
import styles from './bulk-discounts.module.css';
import '../landing.css';

export default function BulkDiscountsPage() {
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_bulk_discounts');
  const { links } = useBusinessLinks();
  const en = lang === 'en';
  const parsedFeatured = Number.parseInt(pageSettings.featuredTierIndex, 10);
  const featuredIndex = Number.isNaN(parsedFeatured) ? 1 : parsedFeatured;
  const catalogHref = `/catalog?lang=${en ? 'en' : 'es'}&gate=skip`;

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} />
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{en ? 'Everyday prices' : 'Precios de siempre'}</p>
          <h1>{localized(pageSettings, 'heroTitle', lang)}</h1>
          <p className={styles.lead}>{localized(pageSettings, 'heroText', lang)}</p>
          <Link className={styles.cta} href={catalogHref}>{localized(pageSettings, 'ctaButton', lang)}</Link>
          <p style={{ margin: '16px 0 0' }}>
            <Link href={`/deal-of-the-week?lang=${en ? 'en' : 'es'}`} style={{ color: '#b64b08', fontWeight: 800 }}>
              {en ? 'This week\'s offer is on the Deal of the Week page' : 'La oferta de esta semana está en Oferta de la Semana'}
            </Link>
          </p>
        </section>

        <section className={styles.evergreen}>
          <div className={styles.sectionHead}>
            <h2>{en ? 'Volume pricing' : 'Precios por volumen'}</h2>
            <p>{en ? 'These discounts apply automatically in the cart when you reach the vial count. You can mix products.' : 'Estos descuentos se aplican solos en el carrito al llegar a la cantidad de viales. Puedes mezclar productos.'}</p>
          </div>
          <div className={styles.tiers}>{(pageSettings.tiers || []).map((tier, index) => <div key={`${tier.labelEn}-${index}`} className={index === featuredIndex ? styles.featuredTier : styles.tier}><h3>{localized(tier, 'label', lang)}</h3><strong>{localized(tier, 'value', lang)}</strong><p>{localized(tier, 'text', lang)}</p></div>)}</div>
        </section>
      </main>
      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
