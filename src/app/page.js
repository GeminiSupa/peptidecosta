"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  FlaskConical,
} from 'lucide-react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { buildWhatsAppLink, logWhatsAppSource } from '@/lib/whatsapp';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import ContactLeadModal from '@/components/ContactLeadModal';
import MobileActionBar from '@/components/MobileActionBar';
import PressBand from '@/components/PressBand';
import { StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import {
  DEFAULT_LANDING_PAGE_SETTINGS,
  mergeLandingPageSettings,
} from '@/lib/landingContent';
import './landing.css';

const USER_SELECTED_LANG_KEY = 'lang_user_selected';

// Shown until the live categories load, and used to build ?category= links, so
// these must match the category values stored on products.
const CATEGORY_FALLBACKS = [
  'Weight Loss & Metabolism',
  'Performance & Hormones',
  'Anti-Aging & Longevity',
  'Recovery & Healing',
  'Cognitive & Mood',
  'Sexual Health',
  'Skin & Hair',
  'Sleep',
];

const FALLBACK_PRODUCTS = [
  {
    product: 'BPC-157 10mg',
    category: 'Recovery & Healing',
    price_usd: '$44.97',
    price_crc: '₡22,500',
    status: 'In Stock',
    image_url: '/modern_3d_vial_hero.png',
  },
  {
    product: 'Retatrutide 10mg',
    category: 'Weight Loss & Metabolism',
    price_usd: '$115.00',
    price_crc: '₡58,000',
    status: 'In Stock',
    image_url: '/vial_costarica_hero.png',
  },
  {
    product: 'Semaglutide 5mg',
    category: 'Weight Loss & Metabolism',
    price_usd: '$84.50',
    price_crc: '₡42,500',
    status: 'In Stock',
    image_url: '/hero_peptide_vial.png',
  },
  {
    product: 'GHK-Cu 50mg',
    category: 'Skin & Hair',
    price_usd: '$64.00',
    price_crc: '₡32,000',
    status: 'In Stock',
    image_url: '/peptide_molecular_3d.png',
  },
];

function copy(settings, key, lang) {
  return settings[`${key}${lang === 'en' ? 'En' : 'Es'}`] || settings[`${key}En`] || '';
}

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12.031 2a9.992 9.992 0 0 0-8.675 14.901L2 22l5.256-1.378A9.972 9.972 0 0 0 12.03 22c5.523 0 10-4.477 10-10S17.554 2 12.03 2Zm5.535 14.288c-.247.697-1.218 1.282-1.687 1.332-.469.052-.937.28-3.007-.582-2.483-1.034-4.045-3.565-4.168-3.73-.124-.165-1.007-1.34-1.007-2.555 0-1.217.638-1.815.865-2.062.227-.247.495-.309.66-.309.165 0 .33.003.475.01.155.007.361-.059.567.433.206.495.701 1.71.763 1.834.062.124.103.268.02.433-.082.165-.124.268-.247.412-.124.144-.262.32-.375.43-.124.124-.253.258-.108.505.144.248.643 1.056 1.382 1.713.953.847 1.753 1.109 2.001 1.233.247.124.392.103.536-.062.144-.165.619-.722.784-.969.165-.247.33-.206.557-.124.227.082 1.443.68 1.691.804.247.124.412.185.474.289.062.103.062.597-.186 1.294Z" />
    </svg>
  );
}

function ProductCard({ product, lang }) {
  const price = lang === 'en'
    ? product.price_usd
    : product.price_crc || product.price_usd;
  const original = lang === 'en'
    ? product.original_price_usd
    : product.original_price_crc || product.original_price_usd;
  const isSale = original && original !== price;

  return (
    <article className="clone-product-card">
      {isSale && <span className="clone-sale-badge">{lang === 'en' ? 'Sale' : 'Oferta'}</span>}
      <Link href={`/catalog?product=${encodeURIComponent(product.product)}&lang=${lang}`} className="clone-product-media">
        {product.image_url ? (
          <img src={product.image_url} alt={product.product} loading="lazy" decoding="async" />
        ) : (
          <FlaskConical size={46} strokeWidth={1.4} />
        )}
      </Link>
      <div className="clone-product-copy">
        <small>{product.category || (lang === 'en' ? 'Research peptide' : 'Péptido de investigación')}</small>
        <h3>{product.product}</h3>
        <div className="clone-product-price">
          {isSale && <span>{original}</span>}
          <strong>{price}</strong>
        </div>
        <Link href={`/catalog?product=${encodeURIComponent(product.product)}&lang=${lang}`}>
          {lang === 'en' ? 'Add to Cart' : 'Agregar'} <ArrowRight size={13} />
        </Link>
      </div>
    </article>
  );
}

export default function LandingPage() {
  const [lang, setLang] = useState('es');
  const [settings, setSettings] = useState(DEFAULT_LANDING_PAGE_SETTINGS);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(CATEGORY_FALLBACKS);
  const [heroChoice, setHeroChoice] = useState('');
  const [openFaq, setOpenFaq] = useState(0);
  const { links } = useBusinessLinks();

  const categoryChips = useMemo(() => {
    const unique = [...new Set(categories.filter(Boolean))];
    return unique.length ? unique.slice(0, 8) : CATEGORY_FALLBACKS;
  }, [categories]);

  useEffect(() => {
    const selectedLang = localStorage.getItem(USER_SELECTED_LANG_KEY) === 'true'
      ? localStorage.getItem('lang') || 'es'
      : 'es';
    setLang(selectedLang);
  }, []);

  useEffect(() => {
    async function load() {
      if (!isSupabaseConfigured || !supabase) return;

      const [{ data: productRows }, { data: settingRows }] = await Promise.all([
        supabase
          .from('products')
          .select('product, price_usd, price_crc, original_price_usd, original_price_crc, status, image_url, category')
          .eq('status', 'In Stock')
          .order('priority', { ascending: true })
          .limit(8),
        supabase
          .from('site_settings')
          .select('value')
          .eq('id', 'landing_page')
          .maybeSingle(),
      ]);

      const nextProducts = productRows?.length ? productRows : FALLBACK_PRODUCTS;
      if (nextProducts.length) {
        setProducts(nextProducts);
        setCategories([...new Set(nextProducts.map((p) => p.category).filter(Boolean))]);
      }

      if (settingRows?.value) {
        setSettings(mergeLandingPageSettings(settingRows.value));
      }
    }

    load().catch((err) => console.error('Landing page load failed:', err));
  }, []);

  const setLanguage = (nextLang) => {
    setLang(nextLang);
    localStorage.setItem('lang', nextLang);
    localStorage.setItem(USER_SELECTED_LANG_KEY, 'true');
  };

  const openWhatsApp = (source) => {
    logWhatsAppSource(source);
    localStorage.setItem('whatsapp_source', source);
    window.open(buildWhatsAppLink(links.whatsappNumber, null, lang), '_blank');
  };

  // The two storefront CTAs now collect a lead instead of handing the visitor
  // to WhatsApp. `leadSource` keeps which button was used, so the CRM note
  // still shows whether it came from the hero or the bulk section.
  const [leadSource, setLeadSource] = useState('');
  const openContactForm = (source) => setLeadSource(source);

  const resolvePageHref = (href = '/catalog') => {
    if (!href) return `/catalog?lang=${lang}`;
    if (href === 'whatsapp') return buildWhatsAppLink(links.whatsappNumber, null, lang);
    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
      return href;
    }
    const separator = href.includes('?') ? '&' : '?';
    return `${href}${separator}lang=${lang}`;
  };

  const openHeroOption = (event) => {
    const href = event.target.value;
    setHeroChoice(href);
    if (!href) return;
    if (href === 'contact') {
      openContactForm('hero_dropdown');
      setHeroChoice('');
      return;
    }
    if (href === 'whatsapp') {
      openWhatsApp('hero_dropdown');
      return;
    }
    const separator = href.includes('?') ? '&' : '?';
    window.location.href = href.startsWith('http') ? href : `${href}${separator}lang=${lang}`;
  };

  return (
    <div className="clone-home">
      {/* Shared with every other storefront page — the landing page used to
          carry its own copy of this header, which is how its nav drifted. */}
      <StorefrontHeader lang={lang} onLanguage={setLanguage} settings={settings} />

      <main id="main-content">
        {/* StorefrontHeader already renders the promo banner. */}
        <section className="clone-hero clone-shell">
          <div className="clone-hero-copy">
            <span className="clone-red-label">{copy(settings, 'heroKicker', lang)}</span>
            <h1>{copy(settings, 'heroTitle', lang)}</h1>
            <p className="clone-hero-lead">{copy(settings, 'heroSub', lang)}</p>
            <p>{copy(settings, 'heroText', lang)}</p>
            <div className="clone-proof-row">
              {(lang === 'en'
                ? ['Verified Quality', 'Transparent Pricing', 'Local Reliability']
                : ['Calidad verificada', 'Precios claros', 'Confiabilidad local']
              ).map((item) => (
                <span key={item}><Check size={15} /> {item}</span>
              ))}
            </div>
            <div className="clone-hero-actions">
              <Link href={`/catalog?lang=${lang}`}>{copy(settings, 'primaryCta', lang)} <ArrowUpRight size={16} /></Link>
              <button type="button" onClick={() => openContactForm('hero')}>{copy(settings, 'secondaryCta', lang)}</button>
            </div>
            <label className="clone-hero-dropdown">
              <span>{copy(settings, 'heroDropdownLabel', lang)}</span>
              <select value={heroChoice} onChange={openHeroOption}>
                <option value="">{copy(settings, 'heroDropdownPlaceholder', lang)}</option>
                {(settings.heroDropdownOptions || []).map((option, index) => (
                  <option key={`${option.href}-${index}`} value={option.href}>
                    {copy(option, 'label', lang)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="clone-hero-media">
            <img src={settings.heroImageUrl || '/catalog-promo-banner.webp'} alt="Peptides Costa Rica products" />
          </div>
        </section>

        <div className="clone-shell">
          <PressBand lang={lang} settings={settings} variant="landing" />
        </div>

        <section className="clone-section clone-shell">
          <div className="clone-section-head">
            <h2>{copy(settings, 'differenceTitle', lang)}</h2>
            <p>{copy(settings, 'differenceText', lang)}</p>
          </div>
          <div className="clone-difference-grid">
            {settings.differenceCards.map((card, index) => (
              <article key={`${card.titleEn}-${index}`}>
                <h3>{copy(card, 'title', lang)}</h3>
                <p>{copy(card, 'text', lang)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="clone-section clone-shell">
          <div className="clone-section-head clone-section-head-row">
            <div>
              <h2>{lang === 'en' ? 'Shop By Category' : 'Comprar por categoría'}</h2>
              <p>{lang === 'en' ? 'Browse by the product areas customers ask about most.' : 'Explora las áreas de producto más consultadas.'}</p>
            </div>
            <Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'View all' : 'Ver todo'} <ArrowRight size={15} /></Link>
          </div>
          <div className="clone-category-chips">
            {categoryChips.map((category) => (
              <Link key={category} href={`/catalog?category=${encodeURIComponent(category)}&lang=${lang}`}>
                {category}
              </Link>
            ))}
          </div>
          <div className="clone-products-grid">
            {(products.length ? products.slice(0, 4) : FALLBACK_PRODUCTS).map((product) => (
              <ProductCard key={product.product} product={product} lang={lang} />
            ))}
          </div>
        </section>

        <section className="clone-section clone-shell">
          <div className="clone-section-head">
            <h2>{copy(settings, 'offerTitle', lang)}</h2>
            <p>{copy(settings, 'offerText', lang)}</p>
          </div>
          <div className="clone-offer-grid">
            {settings.offerCards.map((card, index) => (
              <article key={`${card.titleEn}-${index}`}>
                <span>{index + 1}</span>
                <h3>{copy(card, 'title', lang)}</h3>
                <p>{copy(card, 'text', lang)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="clone-audience">
          <div className="clone-shell clone-audience-grid">
            <div>
              <h2>{copy(settings, 'audienceTitle', lang)}</h2>
              <p>{copy(settings, 'audienceText', lang)}</p>
              <div className="clone-audience-list">
                {settings.audienceItems.map((item, index) => (
                  <article key={`${item.titleEn}-${index}`}>
                    <h3>{copy(item, 'title', lang)}</h3>
                    <p>{copy(item, 'text', lang)}</p>
                  </article>
                ))}
              </div>
            </div>
            <div className="clone-audience-images">
              <img src="/vials_group_costarica.png" alt="Peptides Costa Rica vial group" />
              <img src="/modern_3d_vials_group.png" alt="Peptide vial collection" />
            </div>
          </div>
        </section>

        <section className="clone-proof">
          <div className="clone-shell clone-proof-grid">
            <div>
              <span>{lang === 'en' ? 'CUSTOMER EXPERIENCES' : 'EXPERIENCIAS DE CLIENTES'}</span>
              <h2>{copy(settings, 'proofTitle', lang)}</h2>
              <p>{copy(settings, 'proofText', lang)}</p>
            </div>
            <img src={settings.proofImageUrl || '/customer_transformation.webp'} alt="Customer experience" />
          </div>
        </section>

        <section className="clone-section clone-shell clone-quality">
          <div>
            <h2>{copy(settings, 'qualityTitle', lang)}</h2>
            <p>{copy(settings, 'qualityText', lang)}</p>
          </div>
          <div className="clone-quality-cards">
            {(lang === 'en'
              ? ['Lab-tested product access', 'Local Costa Rica support', 'Transparent product information']
              : ['Acceso a productos verificados', 'Soporte local en Costa Rica', 'Información transparente']
            ).map((item) => (
              <article key={item}><Check size={17} /> {item}</article>
            ))}
          </div>
        </section>

        <section className="clone-section clone-shell clone-faq">
          <div className="clone-section-head">
            <span className="clone-red-label">{lang === 'en' ? 'FAQ' : 'FAQ'}</span>
            <h2>{copy(settings, 'faqTitle', lang)}</h2>
          </div>
          <div className="clone-faq-list">
            {settings.faqItems.map((item, index) => (
              <article key={`${item.qEn}-${index}`} className={openFaq === index ? 'is-open' : ''}>
                <button type="button" onClick={() => setOpenFaq(openFaq === index ? null : index)}>
                  {lang === 'en' ? item.qEn : item.qEs}
                  {openFaq === index ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <p>{lang === 'en' ? item.aEn : item.aEs}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="clone-bulk">
          <div className="clone-shell clone-bulk-inner">
            <div>
              <h2>{copy(settings, 'bulkTitle', lang)}</h2>
              <p>{copy(settings, 'bulkText', lang)}</p>
            </div>
            <button type="button" onClick={() => openContactForm('bulk_cta')}>{copy(settings, 'bulkButton', lang)}</button>
          </div>
        </section>
      </main>

      <StorefrontFooter lang={lang} settings={settings} categories={categoryChips} />

      <MobileActionBar lang={lang} onContact={() => openContactForm('mobile_sticky')} />

      <ContactLeadModal
        open={Boolean(leadSource)}
        onClose={() => setLeadSource('')}
        lang={lang}
        source={leadSource}
      />
    </div>
  );
}
