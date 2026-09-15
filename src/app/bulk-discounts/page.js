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
  const variant = useBulkWholesaleVariant(campaign.settings.abTestEnabled);
  const en = lang === 'en';
  const parsedFeatured = Number.parseInt(pageSettings.featuredTierIndex, 10);
  const featuredIndex = Number.isNaN(parsedFeatured) ? 1 : parsedFeatured;
  const catalogHref = bulkWholesaleCatalogHref({ lang, variant, active: campaign.active, code: campaign.code });
  const copy = campaign.settings;
  const heroTitle = variant === 'b' ? (en ? copy.titleBEn : copy.titleBEs) : (en ? copy.titleAEn : copy.titleAEs);

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} />
      <main className={styles.main}>
        {(campaign.loading || campaign.configured) ? <>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{en ? copy.eyebrowEn : copy.eyebrowEs}</p>
          <h1>{heroTitle}</h1>
          <p className={styles.lead}>{en ? copy.leadEn : copy.leadEs}</p>
          <div className={campaign.active ? styles.live : styles.paused}>
            {campaign.loading ? (en ? 'Checking offer availability…' : 'Verificando disponibilidad…') : campaign.active ? (en ? `Live now · Use code ${campaign.code}` : `Disponible ahora · Usa el código ${campaign.code}`) : (en ? 'Offer currently paused' : 'Oferta pausada actualmente')}
          </div>
          <div className={styles.facts}>
            <span><strong>{campaign.discountPct}%</strong>{en ? ' off' : ' desc.'}</span><span><strong>{campaign.minUnits}+</strong>{en ? ' selected vials' : ' viales seleccionados'}</span><span><strong>{campaign.products.length}</strong>{en ? ' eligible products' : ' productos elegibles'}</span>
          </div>
          <Link className={styles.cta} href={catalogHref}>{campaign.active ? (en ? copy.ctaEn : copy.ctaEs) : (en ? 'Browse the current catalog' : 'Ver el catálogo actual')}</Link>
        </section>

        <section className={styles.details}>
          <div><h2>{en ? 'How the offer works' : 'Cómo funciona la oferta'}</h2><ul className={styles.rules}>
            <li><Check />{en ? `Choose ${campaign.minUnits}+ qualifying vials in any combination.` : `Elige ${campaign.minUnits}+ viales elegibles en cualquier combinación.`}</li>
            <li><Check />{en ? `Apply ${campaign.code}; only eligible vials receive ${campaign.discountPct}% off.` : `Aplica ${campaign.code}; solo los viales elegibles reciben ${campaign.discountPct}% de descuento.`}</li>
            <li><ShieldCheck />{en ? 'This offer does not combine with other promo codes, automatic volume discounts, or Deal-of-the-Week markdowns.' : 'Esta oferta no se combina con otros códigos, descuentos automáticos por volumen ni rebajas de la Oferta de la Semana.'}</li>
            <li><PackageCheck />{en ? copy.stockDisclaimerEn : copy.stockDisclaimerEs}</li>
          </ul></div>
          <div><h2>{en ? 'Eligible products' : 'Productos elegibles'}</h2><div className={styles.products}>{campaign.products.map((product) => <Link key={product} href={bulkWholesaleCatalogHref({ lang, variant, product, active: campaign.active, code: campaign.code })}>{product}</Link>)}</div></div>
        </section>
        </> : <section className={styles.hero}>
          <p className={styles.eyebrow}>{en ? 'Volume pricing' : 'Precios por volumen'}</p>
          <h1>{localized(pageSettings, 'heroTitle', lang)}</h1>
          <p className={styles.lead}>{localized(pageSettings, 'heroText', lang)}</p>
          <Link className={styles.cta} href={`/catalog?lang=${lang}`}>{localized(pageSettings, 'ctaButton', lang)}</Link>
        </section>}

        <section className={styles.evergreen}>
          <div className={styles.sectionHead}><h2>{en ? 'Ongoing volume pricing' : 'Precios permanentes por volumen'}</h2><p>{en ? 'Our standard catalog tiers remain available when this special offer does not apply.' : 'Los niveles estándar del catálogo siguen disponibles cuando esta oferta especial no aplica.'}</p></div>
          <div className={styles.tiers}>{(pageSettings.tiers || []).map((tier, index) => <div key={`${tier.labelEn}-${index}`} className={index === featuredIndex ? styles.featuredTier : styles.tier}><h3>{localized(tier, 'label', lang)}</h3><strong>{localized(tier, 'value', lang)}</strong><p>{localized(tier, 'text', lang)}</p></div>)}</div>
          <div className={styles.terms}><h2><ShieldCheck />{localized(pageSettings, 'termsTitle', lang)}</h2><ul>{(pageSettings.terms || []).map((term, index) => <li key={`${term.labelEn}-${index}`}>{localized(term, 'label', lang)}</li>)}</ul></div>
        </section>
      </main>
      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
