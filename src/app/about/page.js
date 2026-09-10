"use client";

import Link from 'next/link';
import { ArrowUpRight, MessageCircle } from 'lucide-react';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import { StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import MobileActionBar from '@/components/MobileActionBar';
import { openContactForm } from '@/lib/contactForm';
import '../landing.css';
import './about.css';

export default function AboutPage() {
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_about');
  const { links } = useBusinessLinks();

  return (
    <div className="clone-home about-page">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} active="story" />

      <main>
        <section className="about-hero">
          <div className="container about-hero-grid">
            <div className="about-hero-copy">
              <p className="about-eyebrow">{localized(pageSettings, 'heroKicker', lang)}</p>
              <h1>{localized(pageSettings, 'heroTitle', lang)}</h1>
              <p className="about-intro">{localized(pageSettings, 'heroText', lang)}</p>
            </div>
          </div>
        </section>

        <section className="about-chapters container" style={{ marginTop: '4rem', marginBottom: '4rem' }}>
          <article style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '1rem', color: '#1e293b' }}>{localized(pageSettings, 'backgroundTitle', lang)}</h2>
            <p style={{ whiteSpace: 'pre-wrap', color: '#475569', fontSize: '1.1rem', lineHeight: '1.7' }}>{localized(pageSettings, 'backgroundText', lang)}</p>
          </article>
          
          <article style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '1rem', color: '#1e293b' }}>{localized(pageSettings, 'startedTitle', lang)}</h2>
            <p style={{ whiteSpace: 'pre-wrap', color: '#475569', fontSize: '1.1rem', lineHeight: '1.7' }}>{localized(pageSettings, 'startedText', lang)}</p>
          </article>

          <article style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '1rem', color: '#1e293b' }}>{localized(pageSettings, 'approachTitle', lang)}</h2>
            <p style={{ whiteSpace: 'pre-wrap', color: '#475569', fontSize: '1.1rem', lineHeight: '1.7' }}>{localized(pageSettings, 'approachText', lang)}</p>
          </article>

          <article style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '1rem', color: '#1e293b' }}>{localized(pageSettings, 'aheadTitle', lang)}</h2>
            <p style={{ whiteSpace: 'pre-wrap', color: '#475569', fontSize: '1.1rem', lineHeight: '1.7' }}>{localized(pageSettings, 'aheadText', lang)}</p>
          </article>
        </section>

        <section className="about-cta">
          <div className="container about-cta-inner">
            <div>
              <h2>{localized(pageSettings, 'ctaTitle', lang)}</h2>
              <p>{localized(pageSettings, 'ctaText', lang)}</p>
            </div>
            <div className="about-cta-actions">
              <Link href={`/catalog?lang=${lang}`} className="about-primary">
                {localized(pageSettings, 'ctaButton', lang)} <ArrowUpRight size={17} />
              </Link>
              <button type="button" className="about-secondary" onClick={() => openContactForm('about_cta')}>
                <MessageCircle size={17} /> {localized(pageSettings, 'contactButton', lang)}
              </button>
            </div>
          </div>
        </section>
      </main>

      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
