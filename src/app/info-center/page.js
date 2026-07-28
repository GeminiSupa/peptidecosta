"use client";

import Link from 'next/link';
import { ArrowRight, BookOpen, Search } from 'lucide-react';
import MobileActionBar from '@/components/MobileActionBar';
import { StorefrontBulkBand, StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import '../landing.css';

export default function InfoCenterPage() {
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_info_center');
  const { links } = useBusinessLinks();
  const withLang = (href = '/blog') => {
    if (href.startsWith('http') || href.startsWith('#')) return href;
    const separator = href.includes('?') ? '&' : '?';
    return `${href}${separator}lang=${lang}`;
  };

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} active="info" />

      <main>
        <section className="clone-page-hero clone-info-hero clone-shell">
          <span>{localized(pageSettings, 'heroKicker', lang)}</span>
          <h1>{localized(pageSettings, 'heroTitle', lang)}</h1>
          <p>{localized(pageSettings, 'heroText', lang)}</p>
          <form className="clone-info-search" action="/catalog">
            <Search size={18} />
            <input name="search" placeholder={localized(pageSettings, 'searchPlaceholder', lang)} />
            <input type="hidden" name="lang" value={lang} />
          </form>
          <div className="clone-info-pills">
            {(pageSettings.quickLinks || []).map((item, index) => (
              <Link key={`${item.href}-${index}`} href={withLang(item.href)}>
                {localized(item, 'label', lang)}
              </Link>
            ))}
          </div>
        </section>

        <section className="clone-page-section clone-shell">
          <div className="clone-page-section-head">
            <h2>{localized(pageSettings, 'startTitle', lang)}</h2>
            <small>{lang === 'en' ? 'For first-time buyers' : 'Para compradores nuevos'}</small>
          </div>
          <div className="clone-start-grid">
            {(pageSettings.steps || []).map((step, index) => (
              <Link key={`${step.titleEn}-${index}`} href={`/blog?lang=${lang}`} className={`clone-start-card tone-${index + 1}`}>
                <span>STEP {index + 1}</span>
                <h3>{localized(step, 'title', lang)}</h3>
                <p>{localized(step, 'text', lang)}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="clone-page-section clone-shell">
          <div className="clone-page-section-head">
            <h2>{lang === 'en' ? 'Browse by topic' : 'Explorar por tema'}</h2>
            <small>{(pageSettings.topics || []).length} {lang === 'en' ? 'categories' : 'categorías'}</small>
          </div>
          <div className="clone-topic-grid">
            {(pageSettings.topics || []).map((topic, index) => (
              <article key={`${topic.titleEn}-${index}`}>
                <BookOpen size={18} />
                <h3>{localized(topic, 'title', lang)}</h3>
                <p>{localized(topic, 'text', lang)}</p>
                <Link href={`/blog?lang=${lang}`}>{lang === 'en' ? 'More articles' : 'Más artículos'} <ArrowRight size={13} /></Link>
              </article>
            ))}
          </div>
        </section>

        <section id="coa-library" className="clone-page-section clone-shell">
          <div className="clone-page-section-head">
            <h2>{localized(pageSettings, 'coaTitle', lang)}</h2>
            <small>{(pageSettings.coaLinks || []).length} COA</small>
          </div>
          <p className="clone-section-intro">{localized(pageSettings, 'coaText', lang)}</p>
          <div className="clone-coa-grid">
            {(pageSettings.coaLinks || []).map((item, index) => (
              <a key={`${item.href}-${index}`} href={withLang(item.href)}>
                {localized(item, 'label', lang)} <ArrowRight size={14} />
              </a>
            ))}
          </div>
        </section>

        <section className="clone-help-strip clone-shell">
          <div>
            <h2>{localized(pageSettings, 'ctaTitle', lang)}</h2>
            <p>{localized(pageSettings, 'ctaText', lang)}</p>
          </div>
          <div>
            <Link href={`/contact?lang=${lang}`}>{lang === 'en' ? 'Contact us' : 'Contactar'}</Link>
            <Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'Call Now' : 'Ver catálogo'}</Link>
          </div>
        </section>
      </main>

      <StorefrontBulkBand lang={lang} settings={landingSettings} />
      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
