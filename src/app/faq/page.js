"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import { StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import MobileActionBar from '@/components/MobileActionBar';
import '../landing.css';

export default function FAQPage() {
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_faq');
  const { links } = useBusinessLinks();
  const [openFaq, setOpenFaq] = useState(null);

  // Answers may reference the business WhatsApp number, which is not CMS content.
  const withWhatsApp = (text = '') => text.replace(/\{\{whatsapp\}\}/g, links.whatsappDisplay || '');

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} />

      <main style={{ paddingTop: '48px', paddingBottom: '80px' }}>
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '40px', color: 'var(--text-main)', textAlign: 'center' }}>
            {localized(pageSettings, 'heroTitle', lang)}
          </h1>

          <div className="lp-faq-list">
            {(pageSettings.faqItems || []).map((faq, i) => (
              <div key={`${faq.qEn}-${i}`} className={`lp-faq-item${openFaq === i ? ' open' : ''}`}>
                <button
                  className="lp-faq-question"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{localized(faq, 'q', lang)}</span>
                  {openFaq === i ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <div className="lp-faq-answer">
                  <p>{withWhatsApp(localized(faq, 'a', lang))}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '60px', textAlign: 'center', padding: '40px', background: 'var(--card-bg)', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>{localized(pageSettings, 'ctaTitle', lang)}</h3>
            <p style={{ marginBottom: '24px', color: 'var(--text-muted)' }}>
              {localized(pageSettings, 'ctaText', lang)}
            </p>
            <Link href={`/contact?lang=${lang}`} className="btn-hero-primary" style={{ display: 'inline-flex' }}>
              {localized(pageSettings, 'ctaButton', lang)}
            </Link>
          </div>
        </div>
      </main>

      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={buildWhatsAppLink(links.whatsappNumber, null, lang)} />
    </div>
  );
}
