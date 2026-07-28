"use client";

import Link from 'next/link';
import { ArrowUpRight, Check } from 'lucide-react';
import MobileActionBar from '@/components/MobileActionBar';
import { StorefrontBulkBand, StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent, localized } from '@/hooks/usePublicPageContent';
import '../landing.css';

export default function OurStoryPage() {
  const { lang, setLang, landingSettings, pageSettings } = usePublicPageContent('page_our_story');
  const { links } = useBusinessLinks();

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} active="story" />

      <main>
        <section className="clone-story-hero">
          <div className="clone-shell">
            <h1>{localized(pageSettings, 'heroTitle', lang)}</h1>
            <p>{localized(pageSettings, 'heroText', lang)}</p>
          </div>
        </section>

        <section className="clone-story-stack clone-shell">
          {(pageSettings.sections || []).map((section, index) => (
            <article key={`${section.titleEn}-${index}`} className={index % 2 ? 'is-flipped' : ''}>
              <div className="clone-story-image">
                <img src={section.imageUrl || '/vials_group_costarica.png'} alt={localized(section, 'title', lang)} />
              </div>
              <div>
                <span>0{index + 1}</span>
                <h2>{localized(section, 'title', lang)}</h2>
                <p>{localized(section, 'text', lang)}</p>
                {index === 3 && (
                  <ul>
                    {(pageSettings.checklist || []).map((item) => (
                      <li key={item.labelEn}><Check size={15} /> {localized(item, 'label', lang)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </section>

        <section className="clone-story-tools">
          <div className="clone-shell clone-story-tools-grid">
            <img src={pageSettings.toolsImageUrl || '/science_lab_about.webp'} alt="Peptides Costa Rica research support" />
            <div>
              <h2>{localized(pageSettings, 'toolsTitle', lang)}</h2>
              <p>{localized(pageSettings, 'toolsText', lang)}</p>
              <Link href={`/catalog?lang=${lang}`}>{localized(pageSettings, 'ctaTitle', lang)} <ArrowUpRight size={16} /></Link>
            </div>
          </div>
        </section>
      </main>

      <StorefrontBulkBand lang={lang} settings={landingSettings} />
      <StorefrontFooter lang={lang} settings={landingSettings} />
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
