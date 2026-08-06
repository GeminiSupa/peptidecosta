"use client";

import Link from 'next/link';
import { ArrowRight, Handshake, MessageCircle } from 'lucide-react';
import MobileActionBar from '@/components/MobileActionBar';
import { openContactForm } from '@/lib/contactForm';
import { StorefrontBulkBand, StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import '../landing.css';

export default function AffiliateProgramPage() {
  const { links } = useBusinessLinks();
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_affiliate_program');
  const whatsappHref = `https://wa.me/${links.whatsappNumber}`;

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} active="affiliate" />

      <main>
        <section className="clone-affiliate-hero clone-shell">
          <div>
            <span>{localized(pageSettings, 'heroKicker', lang)}</span>
            <h1>{localized(pageSettings, 'heroTitle', lang)}</h1>
            <p>{localized(pageSettings, 'heroText', lang)}</p>
            <div>
              <button type="button" onClick={() => openContactForm('affiliate_apply')}>{localized(pageSettings, 'primaryButton', lang)} <ArrowRight size={16} /></button>
              <button type="button" onClick={() => openContactForm('affiliate_contact')}><MessageCircle size={16} /> {localized(pageSettings, 'secondaryButton', lang)}</button>
            </div>
          </div>
          <img src={pageSettings.heroImageUrl || '/science_lab_about.webp'} alt="Affiliate program partner support" />
        </section>

        <section className="clone-page-section clone-shell">
          <div className="clone-section-head">
            <h2>{localized(pageSettings, 'audienceTitle', lang)}</h2>
          </div>
          <div className="clone-affiliate-card-grid">
            {(pageSettings.audienceCards || []).map((card, index) => (
              <article key={`${card.titleEn}-${index}`}>
                <Handshake size={22} />
                <h3>{localized(card, 'title', lang)}</h3>
                <p>{localized(card, 'text', lang)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="clone-page-section clone-shell">
          <div className="clone-section-head">
            <h2>{localized(pageSettings, 'benefitsTitle', lang)}</h2>
          </div>
          <div className="clone-affiliate-benefits">
            {(pageSettings.benefits || []).map((benefit, index) => (
              <article key={`${benefit.titleEn}-${index}`}>
                <span>{index + 1}</span>
                <h3>{localized(benefit, 'title', lang)}</h3>
                <p>{localized(benefit, 'text', lang)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="clone-page-section clone-shell clone-affiliate-faq">
          <h2>{localized(pageSettings, 'faqTitle', lang)}</h2>
          {(pageSettings.faqItems || []).map((item) => (
            <article key={item.qEn}>
              <h3>{lang === 'en' ? item.qEn : item.qEs}</h3>
              <p>{lang === 'en' ? item.aEn : item.aEs}</p>
            </article>
          ))}
          <div className="clone-affiliate-talk">
            <h2>{localized(pageSettings, 'talkTitle', lang)}</h2>
            <p>{localized(pageSettings, 'talkText', lang)}</p>
            <button type="button" onClick={() => openContactForm('affiliate_talk')}>
              {lang === 'en' ? 'Contact Us' : 'Contáctenos'}
            </button>
          </div>
        </section>
      </main>

      <StorefrontBulkBand lang={lang} settings={landingSettings} />
      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={whatsappHref} />
    </div>
  );
}
