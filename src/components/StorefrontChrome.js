"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, Menu, Search, ShoppingBag, Sparkles, X } from 'lucide-react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { buildWhatsAppLink, logWhatsAppSource } from '@/lib/whatsapp';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { DEFAULT_LANDING_PAGE_SETTINGS } from '@/lib/landingContent';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

function parseBannerText(text = '') {
  return text.replace(/\{\{usd_(\d+)\}\}/g, (_, amount) => `$${amount}`);
}

export function CatalogPromoBanner({ lang = 'es', settings, className = '', forceActive = false }) {
  const { links } = useBusinessLinks();
  const [promoBanners, setPromoBanners] = useState([]);
  const suffix = lang === 'en' ? 'En' : 'Es';
  const active = forceActive || (settings?.catalogBannerActive ?? DEFAULT_LANDING_PAGE_SETTINGS.catalogBannerActive);

  useEffect(() => {
    let cancelled = false;

    async function loadBanners() {
      if (!isSupabaseConfigured || !supabase) return;
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('id', 'announcement_banners')
        .maybeSingle();
      if (cancelled || !Array.isArray(data?.value)) return;
      setPromoBanners(data.value.filter((banner) => banner?.isActive));
    }

    loadBanners().catch((err) => console.error('Promo banner load failed:', err));
    return () => { cancelled = true; };
  }, []);

  if (!active) return null;

  const activeImageBanner = promoBanners.find((banner) => (
    banner?.imageUrl || banner?.image_url || banner?.bannerImageUrl
  ));
  const activeText = promoBanners
    .map((banner) => banner?.[`text${suffix}`] || banner?.textEn || banner?.textEs || banner?.text)
    .filter(Boolean)
    .map(parseBannerText)
    .join(' • ');

  const imageUrl = activeImageBanner?.imageUrl
    || activeImageBanner?.image_url
    || activeImageBanner?.bannerImageUrl
    || settings?.catalogBannerImageUrl
    || DEFAULT_LANDING_PAGE_SETTINGS.catalogBannerImageUrl;
  const alt = activeImageBanner?.[`alt${suffix}`]
    || activeImageBanner?.alt
    || settings?.[`catalogBannerAlt${suffix}`]
    || DEFAULT_LANDING_PAGE_SETTINGS[`catalogBannerAlt${suffix}`];
  const rawHref = activeImageBanner?.href
    || activeImageBanner?.url
    || activeImageBanner?.link
    || settings?.catalogBannerUrl
    || DEFAULT_LANDING_PAGE_SETTINGS.catalogBannerUrl;

  const href = (() => {
    if (rawHref === 'whatsapp') return buildWhatsAppLink(links.whatsappNumber);
    if (rawHref.startsWith('http') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:') || rawHref.startsWith('#')) {
      return rawHref;
    }
    const separator = rawHref.includes('?') ? '&' : '?';
    return `${rawHref}${separator}lang=${lang}`;
  })();

  if (activeText && !activeImageBanner) {
    return (
      <a className={`catalog-promo-text-banner ${className}`.trim()} href={href}>
        <Sparkles size={16} />
        <span>{activeText}</span>
      </a>
    );
  }

  return (
    <a className={`catalog-promo-image-banner ${className}`.trim()} href={href}>
      <img src={imageUrl} alt={alt} />
    </a>
  );
}

export function StorefrontHeader({ lang, onLanguage, settings, active = '' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { links } = useBusinessLinks();

  const openWhatsApp = (source) => {
    logWhatsAppSource(source);
    localStorage.setItem('whatsapp_source', source);
    window.open(buildWhatsAppLink(links.whatsappNumber), '_blank');
  };

  const submitSearch = (event) => {
    event.preventDefault();
    const search = query.trim();
    window.location.href = search
      ? `/catalog?search=${encodeURIComponent(search)}&lang=${lang}`
      : `/catalog?lang=${lang}`;
  };

  const navItems = [
    { id: 'story', label: lang === 'en' ? 'About' : 'Nosotros', href: `/our-story?lang=${lang}` },
    { id: 'catalog', label: lang === 'en' ? 'Shop by Product' : 'Comprar por producto', href: `/catalog?lang=${lang}` },
    { id: 'catalog', label: lang === 'en' ? 'Shop by Category' : 'Comprar por categoría', href: `/catalog?lang=${lang}` },
    { id: 'info', label: 'Info Center', href: `/info-center?lang=${lang}` },
    { id: 'affiliate', label: lang === 'en' ? 'Affiliate Program' : 'Afiliados', href: `/affiliate-program?lang=${lang}` },
  ];

  return (
    <header className="clone-site-header">
        <div className="clone-topbar">
          <div className="clone-shell clone-topbar-inner is-contact-only">
            <div>
              <a href={`mailto:${links.supportEmail}`}><Mail size={14} /> Contact Us</a>
              <button type="button" onClick={() => openWhatsApp('header_cr')}>CR: {links.whatsappDisplay}</button>
              <a href={`tel:+${links.apiWhatsAppNumber || '18314715559'}`}>US: {links.apiWhatsAppDisplay || '+1 (831) 471-5559'}</a>
            </div>
          </div>
        </div>

        <div className="clone-nav-wrap">
          <div className="clone-shell clone-nav">
            <Link href="/" className="clone-logo" aria-label="Peptides Costa Rica home">
              <img src="/logo.webp" alt="Peptides Costa Rica" className="logo-img-custom" />
            </Link>

            <button
              type="button"
              className="clone-menu-toggle"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>

            <nav className={`clone-nav-links${menuOpen ? ' is-open' : ''}`}>
              {navItems.map((item, index) => (
                <Link
                  key={`${item.href}-${index}`}
                  href={item.href}
                  className={active && item.id === active ? 'is-active' : ''}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <form className="clone-search" onSubmit={submitSearch}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={lang === 'en' ? 'Search Peptide Products Or Information' : 'Buscar productos o información'}
              />
              <button type="submit" aria-label="Search"><Search size={18} /></button>
            </form>

            <div className="clone-nav-actions">
              <button type="button" onClick={() => onLanguage(lang === 'en' ? 'es' : 'en')}>
                {lang === 'en' ? 'ES' : 'EN'}
              </button>
              <Link href={`/catalog?lang=${lang}`} aria-label="Cart"><ShoppingBag size={18} /><span>0</span></Link>
            </div>
          </div>
        </div>
        <CatalogPromoBanner lang={lang} settings={settings} className="catalog-promo-image-banner--header clone-shell" forceActive />
    </header>
  );
}

export function StorefrontBulkBand({ lang, settings }) {
  const { links } = useBusinessLinks();
  const suffix = lang === 'en' ? 'En' : 'Es';
  const openWhatsApp = () => {
    logWhatsAppSource('bulk_cta');
    localStorage.setItem('whatsapp_source', 'bulk_cta');
    window.open(buildWhatsAppLink(links.whatsappNumber), '_blank');
  };

  return (
    <section className="clone-bulk">
      <div className="clone-shell clone-bulk-inner">
        <div>
          <h2>{settings?.[`bulkTitle${suffix}`]}</h2>
          <p>{settings?.[`bulkText${suffix}`]}</p>
        </div>
        <button type="button" onClick={openWhatsApp}>{settings?.[`bulkButton${suffix}`]}</button>
      </div>
    </section>
  );
}

export function StorefrontFooter({ lang, settings, categories = [] }) {
  const { links } = useBusinessLinks();
  const suffix = lang === 'en' ? 'En' : 'Es';
  const withLang = (href = '/') => {
    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return href;
    const separator = href.includes('?') ? '&' : '?';
    return `${href}${separator}lang=${lang}`;
  };
  const quickLinks = Array.isArray(settings?.footerQuickLinks) ? settings.footerQuickLinks : [];
  const footerCategoryLinks = Array.isArray(settings?.footerCategoryLinks) ? settings.footerCategoryLinks : [];
  const categoryList = categories.length
    ? categories.slice(0, 5)
    : ['Peptides For Weight Loss', 'Peptides For Muscle Growth', 'Peptides For Anti Aging', 'Peptides For Healing'];
  const reviewLinks = [
    { id: 'trustpilot', label: 'Trustpilot', score: '4.2', logo: '★', href: links.trustpilotUrl || 'https://www.trustpilot.com/review/peptidescostarica.net' },
    { id: 'google', label: 'Google', score: '5.0', logo: 'G', href: links.googleReviewUrl || links.googleMapsUrl },
    { id: 'facebook', label: 'Facebook', score: '5.0', logo: 'f', href: links.facebookReviewUrl || links.facebookUrl || 'https://www.facebook.com/Peptidescostaricaresearch/reviews' },
  ];

  const openWhatsApp = () => {
    logWhatsAppSource('footer_cr');
    localStorage.setItem('whatsapp_source', 'footer_cr');
    window.open(buildWhatsAppLink(links.whatsappNumber), '_blank');
  };

  return (
    <footer className="clone-footer">
      <div className="clone-shell clone-footer-grid">
        <div>
          <img src="/logo.webp" alt="Peptides Costa Rica" className="logo-img-custom" />
          <p>{settings?.[`footerDescription${suffix}`]}</p>
          <strong>{lang === 'en' ? 'Legal Notice:' : 'Aviso legal:'}</strong>
          <p>{settings?.[`legalNotice${suffix}`]}</p>
        </div>
        <div>
          <h3>Quick Links</h3>
          {(quickLinks.length ? quickLinks : DEFAULT_QUICK_LINKS).map((item, index) => (
            <Link key={`${item.href}-${index}`} href={withLang(item.href)}>
              {item[`label${suffix}`] || item.labelEn}
            </Link>
          ))}
        </div>
        <div>
          <h3>Shop By Categories</h3>
          {footerCategoryLinks.length ? footerCategoryLinks.map((item, index) => (
            <Link key={`${item.href}-${index}`} href={withLang(item.href)}>
              {item[`label${suffix}`] || item.labelEn}
            </Link>
          )) : categoryList.map((category) => (
            <Link key={category} href={`/catalog?category=${encodeURIComponent(category)}&lang=${lang}`}>{category}</Link>
          ))}
        </div>
        <div>
          <h3>Contact Us</h3>
          <a href={`mailto:${links.supportEmail}`}>{links.supportEmail}</a>
          <button type="button" onClick={openWhatsApp}>CR {links.whatsappDisplay}</button>
          <a href={`tel:+${links.apiWhatsAppNumber || '18314715559'}`}>US {links.apiWhatsAppDisplay || '+1 (831) 471-5559'}</a>
          {links.googleMapsUrl && <a href={links.googleMapsUrl} target="_blank" rel="noopener noreferrer">Open in Maps</a>}
          <div className="clone-review-row">
            {reviewLinks.map((review) => review.href ? (
              <a
                key={review.label}
                href={review.href}
                target="_blank"
                rel="noopener noreferrer"
                className="clone-review-card"
                aria-label={`${review.label} reviews rated ${review.score}`}
              >
                <span className={`clone-review-logo clone-review-logo--${review.id}`}>{review.logo}</span>
                <span className="clone-review-copy">
                  <em>{review.label}</em>
                  <strong>{review.score}</strong>
                </span>
              </a>
            ) : (
              <span key={review.label} className="clone-review-card">
                <span className={`clone-review-logo clone-review-logo--${review.id}`}>{review.logo}</span>
                <span className="clone-review-copy">
                  <em>{review.label}</em>
                  <strong>{review.score}</strong>
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="clone-copyright">Copyright © 2026 Peptides Costa Rica, All Rights Reserved.</div>
    </footer>
  );
}

const DEFAULT_QUICK_LINKS = [
  { labelEn: 'Home', labelEs: 'Inicio', href: '/' },
  { labelEn: 'About us', labelEs: 'Nosotros', href: '/our-story' },
  { labelEn: 'Bulk Discounts', labelEs: 'Descuentos por volumen', href: '/bulk-discounts' },
  { labelEn: 'FAQ', labelEs: 'Preguntas frecuentes', href: '/faq' },
  { labelEn: 'Blog', labelEs: 'Blog', href: '/blog' },
];
