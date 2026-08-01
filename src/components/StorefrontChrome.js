"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Menu, Search, ShoppingBag, X } from 'lucide-react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { buildWhatsAppLink, logWhatsAppSource } from '@/lib/whatsapp';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { getTrustpilotReviewUrl, isExternalHttpUrl } from '@/lib/businessLinks';
import { DEFAULT_LANDING_PAGE_SETTINGS } from '@/lib/landingContent';
import { normalizeBannerCopy, replaceUsdPlaceholders, sanitizeBannerHref } from '@/lib/bannerText';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import PromoTicker from '@/components/PromoTicker';

function parseBannerText(text = '') {
  return replaceUsdPlaceholders(text, (amount) => `$${amount}`);
}

function textTickerClassName(className = '') {
  return className
    .split(/\s+/)
    .filter((name) => name && !name.startsWith('catalog-promo-image-banner') && name !== 'clone-shell')
    .join(' ');
}

export function CatalogPromoBanner({ lang = 'es', settings, className = '', forceActive = false, mode = 'auto' }) {
  const { links } = useBusinessLinks();
  const [promoBanners, setPromoBanners] = useState([]);
  const suffix = lang === 'en' ? 'En' : 'Es';
  const active = forceActive || (settings?.catalogBannerActive ?? DEFAULT_LANDING_PAGE_SETTINGS.catalogBannerActive);
  const textOnly = mode === 'ticker';

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

  const activeImageBanner = textOnly ? null : promoBanners.find((banner) => (
    banner?.imageUrl || banner?.image_url || banner?.bannerImageUrl
  ));
  const settingsTickerText = (settings?.bannerActive ?? DEFAULT_LANDING_PAGE_SETTINGS.bannerActive)
    ? (settings?.[`bannerText${suffix}`] || '')
    : '';
  const activeTextItems = promoBanners
    .map((banner) => banner?.[`text${suffix}`] || banner?.textEn || banner?.textEs || banner?.text)
    .concat(settingsTickerText)
    .filter(Boolean)
    .map(parseBannerText)
    .map(normalizeBannerCopy)
    .filter((item) => item.text);
  const activeText = activeTextItems.map((item) => item.text).join(' • ');
  const activeTextHref = activeTextItems.find((item) => item.href)?.href || '';

  const imageUrl = activeImageBanner?.imageUrl
    || activeImageBanner?.image_url
    || activeImageBanner?.bannerImageUrl
    || settings?.catalogBannerImageUrl
    || DEFAULT_LANDING_PAGE_SETTINGS.catalogBannerImageUrl;
  const alt = activeImageBanner?.[`alt${suffix}`]
    || activeImageBanner?.alt
    || settings?.[`catalogBannerAlt${suffix}`]
    || DEFAULT_LANDING_PAGE_SETTINGS[`catalogBannerAlt${suffix}`];
  const rawHref = activeImageBanner
    ? (activeImageBanner?.href
      || activeImageBanner?.url
      || activeImageBanner?.link
      || settings?.catalogBannerUrl
      || DEFAULT_LANDING_PAGE_SETTINGS.catalogBannerUrl)
    : (activeTextHref
      || settings?.catalogBannerUrl
      || DEFAULT_LANDING_PAGE_SETTINGS.catalogBannerUrl);

  const href = (() => {
    if (rawHref === 'whatsapp') return buildWhatsAppLink(links.whatsappNumber);
    const safeHref = sanitizeBannerHref(rawHref);
    if (!safeHref) return `/catalog?lang=${lang}`;
    if (safeHref.startsWith('http') || safeHref.startsWith('mailto:') || safeHref.startsWith('tel:') || safeHref.startsWith('#')) {
      return safeHref;
    }
    const separator = safeHref.includes('?') ? '&' : '?';
    return `${safeHref}${separator}lang=${lang}`;
  })();

  const externalLinkProps = isExternalHttpUrl(href)
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};

  if (activeText && !activeImageBanner) {
    return <PromoTicker active text={activeText} href={href} className={textTickerClassName(className)} />;
  }

  if (textOnly) return null;

  return (
    <a className={`catalog-promo-image-banner ${className}`.trim()} href={href} {...externalLinkProps}>
      <img src={imageUrl} alt={alt} />
    </a>
  );
}

/** Total vials in the cart the catalog persists to localStorage. */
function readCartCount() {
  try {
    const raw = localStorage.getItem('cart');
    const items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => sum + Number(item?.qty || 0), 0);
  } catch {
    return 0;
  }
}

export function StorefrontHeader({ lang, onLanguage, settings, active = '' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cartCount, setCartCount] = useState(0);

  // The cart only changes on the catalog page, so re-reading on mount, on focus
  // and on cross-tab writes is enough to keep this honest. Reading in an effect
  // rather than in initial state keeps the server and client markup identical.
  useEffect(() => {
    const sync = () => setCartCount(readCartCount());
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    const search = query.trim();
    window.location.href = search
      ? `/catalog?search=${encodeURIComponent(search)}&lang=${lang}`
      : `/catalog?lang=${lang}`;
  };

  const withLangParam = (href = '/') => {
    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return href;
    const separator = href.includes('?') ? '&' : '?';
    return `${href}${separator}lang=${lang}`;
  };

  // Categories for the "Shop by Category" menu. Editable in the CMS alongside
  // the footer's category column, and shared with it so the two cannot drift.
  const categoryLinks = Array.isArray(settings?.footerCategoryLinks) && settings.footerCategoryLinks.length
    ? settings.footerCategoryLinks
    : DEFAULT_LANDING_PAGE_SETTINGS.footerCategoryLinks;

  // Every entry needs a distinct id — two items sharing one made the active
  // state highlight both at once.
  const navItems = [
    { id: 'story', label: lang === 'en' ? 'About' : 'Nosotros', href: `/about?lang=${lang}` },
    { id: 'catalog', label: lang === 'en' ? 'Shop by Product' : 'Comprar por producto', href: `/catalog?lang=${lang}` },
    { id: 'categories', label: lang === 'en' ? 'Shop by Category' : 'Comprar por categoría', children: categoryLinks },
    { id: 'info', label: lang === 'en' ? 'Info Center' : 'Centro de información', href: `/info-center?lang=${lang}` },
    // Bulk Discounts and FAQ live in the footer: a sixth item overflows the bar
    // and pushes the search box and cart off screen.
    { id: 'affiliate', label: lang === 'en' ? 'Affiliate Program' : 'Afiliados', href: `/affiliate-program?lang=${lang}` },
  ];

  return (
    <header className="clone-site-header">
        <div className="clone-topbar">
          <CatalogPromoBanner lang={lang} settings={settings} className="clone-topbar-ticker" forceActive mode="ticker" />
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
              {navItems.map((item) => (item.children ? (
                <div
                  key={item.id}
                  className={`clone-nav-group${categoriesOpen ? ' is-open' : ''}`}
                  onMouseEnter={() => setCategoriesOpen(true)}
                  onMouseLeave={() => setCategoriesOpen(false)}
                >
                  <button
                    type="button"
                    className={active === item.id ? 'is-active' : ''}
                    aria-expanded={categoriesOpen}
                    onClick={() => setCategoriesOpen((value) => !value)}
                  >
                    {item.label} <ChevronDown size={14} />
                  </button>
                  <div className="clone-nav-dropdown">
                    {item.children.map((child, childIndex) => (
                      <Link
                        key={`${child.href}-${childIndex}`}
                        href={withLangParam(child.href)}
                        onClick={() => { setCategoriesOpen(false); setMenuOpen(false); }}
                      >
                        {child[`label${lang === 'en' ? 'En' : 'Es'}`] || child.labelEn}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  key={item.id}
                  href={item.href}
                  className={active && item.id === active ? 'is-active' : ''}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              )))}
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
              <Link
                href={`/catalog?lang=${lang}`}
                aria-label={lang === 'en' ? `Cart, ${cartCount} items` : `Carrito, ${cartCount} artículos`}
              >
                <ShoppingBag size={18} /><span>{cartCount}</span>
              </Link>
            </div>
          </div>
        </div>
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
    // Fallback only — must match real product categories so the links filter.
    : ['Weight Loss & Metabolism', 'Performance & Hormones', 'Anti-Aging & Longevity', 'Recovery & Healing'];
  const reviewLinks = [
    { id: 'trustpilot', label: 'Trustpilot', score: '4.2', logo: '★', href: getTrustpilotReviewUrl(lang, links) },
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
      <div className="clone-copyright">
        Copyright © {new Date().getFullYear()} Peptides Costa Rica, All Rights Reserved.
        {/* The policy pages were previously linked only from a dead component,
            leaving them unreachable from anywhere on the site. */}
        <span className="clone-legal-links">
          {LEGAL_LINKS.map((item) => (
            <Link key={item.href} href={withLang(item.href)}>
              {item[`label${suffix}`] || item.labelEn}
            </Link>
          ))}
        </span>
        <Link href="/admin" className="clone-admin-link" title="Admin Dashboard">
          {lang === 'en' ? 'Admin Portal' : 'Portal de Admin'}
        </Link>
      </div>
    </footer>
  );
}

const LEGAL_LINKS = [
  { labelEn: 'Privacy Policy', labelEs: 'Privacidad', href: '/privacy-policy' },
  { labelEn: 'Shipping Policy', labelEs: 'Envíos', href: '/shipping-policy' },
  { labelEn: 'Returns & Refunds', labelEs: 'Devoluciones', href: '/return-refund-policy' },
];

const DEFAULT_QUICK_LINKS = [
  { labelEn: 'Home', labelEs: 'Inicio', href: '/' },
  { labelEn: 'About us', labelEs: 'Nosotros', href: '/about' },
  { labelEn: 'Bulk Discounts', labelEs: 'Descuentos por volumen', href: '/bulk-discounts' },
  { labelEn: 'FAQ', labelEs: 'Preguntas frecuentes', href: '/faq' },
  { labelEn: 'Blog', labelEs: 'Blog', href: '/blog' },
];
