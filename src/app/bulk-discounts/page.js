"use client";

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import { StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import MobileActionBar from '@/components/MobileActionBar';
import '../landing.css';

export default function BulkDiscountsPage() {
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_bulk_discounts');
  const { links } = useBusinessLinks();

  // Saved from a text input, so it arrives as a string (or blank).
  const parsedFeatured = Number.parseInt(pageSettings.featuredTierIndex, 10);
  const featuredIndex = Number.isNaN(parsedFeatured) ? 1 : parsedFeatured;

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} />

      <main style={{ paddingTop: '48px', paddingBottom: '80px' }}>
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>
              {localized(pageSettings, 'heroTitle', lang)}
            </h1>
            <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>
              {localized(pageSettings, 'heroText', lang)}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '48px' }}>
            {(pageSettings.tiers || []).map((tier, index) => {
              const isFeatured = index === featuredIndex;
              return (
                <div
                  key={`${tier.labelEn}-${index}`}
                  style={{
                    background: 'var(--card-bg)', padding: '32px', borderRadius: '16px', textAlign: 'center',
                    border: isFeatured ? '2px solid var(--text-primary)' : '1px solid var(--border-color)',
                    ...(isFeatured ? { transform: 'scale(1.05)', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' } : {}),
                  }}
                >
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{localized(tier, 'label', lang)}</h3>
                  <div style={{ fontSize: '2.5rem', fontWeight: '800', color: isFeatured ? 'var(--text-primary)' : '#C8530C', marginBottom: '16px' }}>
                    {localized(tier, 'value', lang)}
                  </div>
                  <p style={{ color: 'var(--text-muted)' }}>{localized(tier, 'text', lang)}</p>
                </div>
              );
            })}
          </div>

          <div style={{ background: 'var(--background-alt)', padding: '40px', borderRadius: '16px', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '1.8rem', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldCheck color="#C8530C" />
              {localized(pageSettings, 'termsTitle', lang)}
            </h2>
            <ul style={{ listStyleType: 'disc', paddingLeft: '24px', lineHeight: '1.8', color: 'var(--text-muted)' }}>
              {(pageSettings.terms || []).map((term, index) => (
                <li key={`${term.labelEn}-${index}`}>{localized(term, 'label', lang)}</li>
              ))}
            </ul>
          </div>

          <div style={{ textAlign: 'center' }}>
            <Link href={`/catalog?lang=${lang}`} className="btn-hero-primary" style={{ display: 'inline-flex' }}>
              {localized(pageSettings, 'ctaButton', lang)}
            </Link>
          </div>
        </div>
      </main>

      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
