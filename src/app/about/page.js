"use client";

import Link from 'next/link';
import { ArrowUpRight, CheckCircle, MessageCircle, ShieldCheck, Truck } from 'lucide-react';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import { StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import TrustFlowBand from '@/components/TrustFlowBand';
import MobileActionBar from '@/components/MobileActionBar';
import { openContactForm } from '@/lib/contactForm';
import '../landing.css';
import './about.css';

const PROCESS_ICONS = [ShieldCheck, CheckCircle, Truck];

export default function AboutPage() {
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_about');
  const { links } = useBusinessLinks();

  const principles = pageSettings.principles || [];

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
              <div className="about-hero-points" aria-label={lang === 'en' ? 'Peptides Costa Rica trust points' : 'Puntos de confianza de Peptides Costa Rica'}>
                {principles.slice(0, 3).map((principle, index) => (
                  <span key={`${principle.labelEn}-${index}`}><CheckCircle size={15} /> {localized(principle, 'label', lang)}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <TrustFlowBand lang={lang} compact />

        <section className="about-proof-band">
          <div className="container about-proof-grid">
            <div>
              <p className="about-section-number">{localized(pageSettings, 'proofKicker', lang)}</p>
              <h2>{localized(pageSettings, 'proofTitle', lang)}</h2>
            </div>
            <p>{localized(pageSettings, 'proofText', lang)}</p>
          </div>
        </section>

        <section className="about-story container">
          <div className="about-story-copy">
            <p className="about-section-number">01</p>
            <h2>{localized(pageSettings, 'originTitle', lang)}</h2>
            <p>{localized(pageSettings, 'originText', lang)}</p>
          </div>
          <aside className="about-founders" aria-label={localized(pageSettings, 'originTitle', lang)}>
            {(pageSettings.founders || []).map((founder, index) => (
              <div className="about-founder" key={`${founder.name}-${index}`}>
                <span>{founder.initials}</span>
                <div><strong>{founder.name}</strong><small>{localized(founder, 'role', lang)}</small></div>
              </div>
            ))}
          </aside>
        </section>

        <blockquote className="about-quote">
          <div className="container">
            <span>“</span>{localized(pageSettings, 'quote', lang)}
            <cite>{pageSettings.quoteAuthor}</cite>
          </div>
        </blockquote>

        <section className="about-chapters container">
          <article>
            <p className="about-section-number">02</p>
            <h2>{localized(pageSettings, 'problemTitle', lang)}</h2>
            <p>{localized(pageSettings, 'problemText', lang)}</p>
          </article>
          <article>
            <p className="about-section-number">03</p>
            <h2>{localized(pageSettings, 'todayTitle', lang)}</h2>
            <p>{localized(pageSettings, 'todayText', lang)}</p>
          </article>
        </section>

        <section className="about-process">
          <div className="container">
            <div className="about-process-header">
              <p className="about-section-number">04</p>
              <h2>{localized(pageSettings, 'processTitle', lang)}</h2>
            </div>
            <div className="about-process-grid">
              {(pageSettings.process || []).map((step, index) => {
                const Icon = PROCESS_ICONS[index] || ShieldCheck;
                return (
                  <article key={`${step.titleEn}-${index}`}>
                    <Icon size={24} strokeWidth={1.8} />
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <h3>{localized(step, 'title', lang)}</h3>
                    <p>{localized(step, 'text', lang)}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="about-principles container" aria-label={lang === 'en' ? 'How we work' : 'Cómo trabajamos'}>
          {principles.map((principle, index) => (
            <div key={`${principle.labelEn}-${index}`}>
              <span>0{index + 1}</span>
              <p>{localized(principle, 'label', lang)}</p>
            </div>
          ))}
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
