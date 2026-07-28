"use client";

import Link from 'next/link';
import { FlaskConical, Search, CheckCircle } from 'lucide-react';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import { StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import MobileActionBar from '@/components/MobileActionBar';
import '../landing.css';

export default function CoaDatabasePage() {
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_coa_database');
  const { links } = useBusinessLinks();

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} />

      <main style={{ paddingTop: '48px', paddingBottom: '80px' }}>
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ background: 'rgba(0, 39, 102, 0.1)', color: 'var(--text-primary)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <FlaskConical size={40} />
          </div>
          <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>
            {localized(pageSettings, 'heroTitle', lang)}
          </h1>
          <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '48px', lineHeight: '1.6' }}>
            {localized(pageSettings, 'heroText', lang)}
          </p>

          <div style={{ background: 'var(--card-bg)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'left', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Search color="#C8530C" />
              {localized(pageSettings, 'howTitle', lang)}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(pageSettings.points || []).map((point, index) => (
                <div key={`${point.titleEn}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <CheckCircle size={20} color="#25D366" style={{ marginTop: '4px' }} />
                  <div>
                    <h4 style={{ fontWeight: 'bold' }}>{localized(point, 'title', lang)}</h4>
                    <p style={{ color: 'var(--text-muted)' }}>{localized(point, 'text', lang)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Link href={`/catalog?lang=${lang}`} className="btn-hero-primary" style={{ display: 'inline-flex' }}>
            {localized(pageSettings, 'ctaButton', lang)}
          </Link>
        </div>
      </main>

      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
