"use client";

import Link from 'next/link';
import { MapPin, Truck } from 'lucide-react';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import { StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import MobileActionBar from '@/components/MobileActionBar';
import '../landing.css';

export default function ServiceLocationsPage() {
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_service_locations');
  const { links } = useBusinessLinks();

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} />

      <main style={{ paddingTop: '48px', paddingBottom: '80px' }}>
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ background: 'rgba(0, 39, 102, 0.1)', color: 'var(--text-primary)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <MapPin size={40} />
          </div>
          <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>
            {localized(pageSettings, 'heroTitle', lang)}
          </h1>
          <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '48px', lineHeight: '1.6' }}>
            {localized(pageSettings, 'heroText', lang)}
          </p>

          <div style={{ background: 'var(--card-bg)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'left', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Truck color="#C8530C" />
              {localized(pageSettings, 'coverageTitle', lang)}
            </h2>
            <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              {(pageSettings.provinces || []).map((province, index) => (
                <li key={`${province.labelEn}-${index}`} style={{ background: 'var(--background)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: '600' }}>
                  📍 {localized(province, 'label', lang)}
                </li>
              ))}
            </ul>
            <p style={{ marginTop: '24px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              {localized(pageSettings, 'courierText', lang)}
            </p>
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
