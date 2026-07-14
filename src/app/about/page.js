"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight, CheckCircle, MessageCircle, ShieldCheck, Truck } from 'lucide-react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import PromoTicker from '@/components/PromoTicker';
import TrustFlowBand from '@/components/TrustFlowBand';
import MobileActionBar from '@/components/MobileActionBar';
import '../landing.css';
import './about.css';

const COPY = {
  en: {
    eyebrow: 'JOEY, SEAN, AND A LOCAL IDEA',
    title: 'This started in fight gyms, not a boardroom.',
    intro: 'Joey Webster and Sean McCully have spent more than 15 years living, training, and building community in Costa Rica. Peptides Costa Rica grew out of a problem they kept running into themselves: getting reliable research products locally was unnecessarily difficult.',
    originTitle: 'Two longtime training partners',
    origin: 'Sean is a world champion in Muay Thai and kickboxing, an early MMA pioneer, and the founder of LA Boxing. He now runs McCully’s Fight Club in Costa Rica. Joey is a former wrestling champion who continued training in boxing, Muay Thai, and MMA after moving from California to Costa Rica.',
    quote: 'We wanted to know what was actually available, see the documentation, and talk to someone nearby. So we built the local option we had been looking for.',
    problemTitle: 'The problem was practical',
    problem: 'International orders meant long waits, customs uncertainty, unclear stock, and very little communication when something went wrong. The answer was not another complicated storefront. It was inventory already in Costa Rica, clear batch information, and direct conversation.',
    todayTitle: 'What we do today',
    today: 'We serve customers within Costa Rica. We publish current products and prices, make available batch documentation, coordinate local delivery, and answer questions directly in Spanish or English. We would rather give a clear answer than make an oversized promise.',
    joeyRole: 'Wrestling champion & fighter',
    seanRole: 'Combat sports pioneer & coach',
    principles: ['Stock already in Costa Rica', 'COA documentation available', 'Direct support from real people', 'Clear pricing before you order'],
    ctaTitle: 'See what is currently available.',
    ctaText: 'Browse the catalog or send us a message if you want to ask something first.',
    catalog: 'View the catalog',
    contact: 'Ask on WhatsApp',
    promo: 'Volume Discount: Buy 5+ vials get 15% off, buy 10+ vials get 20% off! Mix & match allowed. Free shipping on qualifying orders.',
    proofKicker: 'LOCAL MODEL',
    proofTitle: 'Built for the local reality',
    proofText: 'This is not an anonymous overseas storefront. It is a Costa Rica business built around availability, documentation, and direct communication.',
    processTitle: 'How the local model works',
    process: [
      ['Visible stock', 'See what is currently available before you spend time asking.'],
      ['Batch clarity', 'Review COA and product details from the catalog flow.'],
      ['Direct coordination', 'Ask questions and coordinate delivery with a real person.'],
    ],
  },
  es: {
    eyebrow: 'JOEY, SEAN Y UNA IDEA LOCAL',
    title: 'Esto comenzó en gimnasios de combate, no en una sala de juntas.',
    intro: 'Joey Webster y Sean McCully llevan más de 15 años viviendo, entrenando y formando comunidad en Costa Rica. Peptides Costa Rica nació de un problema que ellos mismos encontraban una y otra vez: conseguir productos de investigación confiables localmente era innecesariamente difícil.',
    originTitle: 'Dos compañeros de entrenamiento de muchos años',
    origin: 'Sean es campeón mundial de Muay Thai y kickboxing, pionero del MMA y fundador de LA Boxing. Hoy dirige McCully’s Fight Club en Costa Rica. Joey fue campeón de lucha y continuó entrenando boxeo, Muay Thai y MMA después de mudarse de California a Costa Rica.',
    quote: 'Queríamos saber qué había realmente disponible, ver la documentación y hablar con alguien cercano. Así que creamos la opción local que nosotros mismos buscábamos.',
    problemTitle: 'El problema era práctico',
    problem: 'Los pedidos internacionales implicaban largas esperas, incertidumbre en aduanas, inventario poco claro y casi ninguna comunicación cuando algo salía mal. La respuesta no era otra tienda complicada. Era tener inventario en Costa Rica, información clara de cada lote y conversación directa.',
    todayTitle: 'Lo que hacemos hoy',
    today: 'Atendemos clientes dentro de Costa Rica. Publicamos productos y precios actuales, facilitamos la documentación de los lotes, coordinamos la entrega local y respondemos directamente en español o inglés. Preferimos dar una respuesta clara antes que hacer una promesa exagerada.',
    joeyRole: 'Campeón de lucha y peleador',
    seanRole: 'Pionero y entrenador de deportes de combate',
    principles: ['Inventario ya en Costa Rica', 'Documentación COA disponible', 'Atención directa de personas reales', 'Precios claros antes de ordenar'],
    ctaTitle: 'Mira lo que está disponible ahora.',
    ctaText: 'Explora el catálogo o escríbenos si prefieres preguntar algo primero.',
    catalog: 'Ver el catálogo',
    contact: 'Preguntar por WhatsApp',
    promo: 'Descuento por Volumen: compra 5+ viales y recibe 15%, compra 10+ y recibe 20%. Puedes combinar productos. Envío gratis en pedidos calificados.',
    proofKicker: 'MODELO LOCAL',
    proofTitle: 'Creado para la realidad local',
    proofText: 'Esto no es una tienda anónima del exterior. Es un negocio en Costa Rica basado en disponibilidad, documentación y comunicación directa.',
    processTitle: 'Cómo funciona el modelo local',
    process: [
      ['Inventario visible', 'Revisa qué está disponible antes de perder tiempo preguntando.'],
      ['Claridad de lote', 'Consulta COA y detalles del producto desde el flujo del catálogo.'],
      ['Coordinación directa', 'Haz preguntas y coordina la entrega con una persona real.'],
    ],
  },
};

export default function AboutPage() {
  const { links } = useBusinessLinks();
  const [lang, setLang] = useState('es');
  const [scrolled, setScrolled] = useState(false);
  const t = COPY[lang];

  useEffect(() => {
    const requestedLang = new URLSearchParams(window.location.search).get('lang');
    const savedLang = localStorage.getItem('lang') || 'es';
    const initialLang = requestedLang === 'en' || requestedLang === 'es' ? requestedLang : savedLang;
    const frame = requestAnimationFrame(() => setLang(initialLang));
    localStorage.setItem('lang', initialLang);
    document.documentElement.lang = initialLang;
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); };
  }, []);

  const handleLang = (nextLang) => {
    setLang(nextLang);
    localStorage.setItem('lang', nextLang);
    document.documentElement.lang = nextLang;
    window.history.replaceState(null, '', `${window.location.pathname}?lang=${nextLang}`);
  };

  return (
    <div className="landing-layout about-page">
      <PromoTicker text={t.promo} />

      <header className={`lp-header${scrolled ? ' lp-header--scrolled' : ''}`}>
        <div className="lp-header-inner">
          <Link href="/" className="lp-logo"><Image src="/logo.webp" alt="Peptides Costa Rica" width={416} height={205} className="logo-img-custom" priority /></Link>
          <nav className="lp-nav about-nav">
            <Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'Catalog' : 'Catálogo'}</Link>
            <Link href={`/about?lang=${lang}`}>{lang === 'en' ? 'About Us' : 'Sobre Nosotros'}</Link>
            <Link href={`/blog?lang=${lang}`}>Blog</Link>
            <Link href={`/contact?lang=${lang}`}>{lang === 'en' ? 'Contact' : 'Contacto'}</Link>
          </nav>
          <div className="lp-header-actions">
            <div className="lang-selector">
              <button onClick={() => handleLang('es')} className={lang === 'es' ? 'active' : ''}>ES</button>
              <button onClick={() => handleLang('en')} className={lang === 'en' ? 'active' : ''}>ENG</button>
            </div>
            <Link href={`/catalog?lang=${lang}`} className="lp-nav-cta">{lang === 'en' ? 'Shop' : 'Tienda'} <ArrowRight size={15} /></Link>
          </div>
        </div>
      </header>

      <main>
        <section className="about-hero">
          <div className="container about-hero-grid">
            <div className="about-hero-copy">
              <p className="about-eyebrow">{t.eyebrow}</p>
              <h1>{t.title}</h1>
              <p className="about-intro">{t.intro}</p>
              <div className="about-hero-points" aria-label={lang === 'en' ? 'Peptides Costa Rica trust points' : 'Puntos de confianza de Peptides Costa Rica'}>
                {t.principles.slice(0, 3).map((principle) => (
                  <span key={principle}><CheckCircle size={15} /> {principle}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <TrustFlowBand lang={lang} compact />

        <section className="about-proof-band">
          <div className="container about-proof-grid">
            <div>
              <p className="about-section-number">{t.proofKicker}</p>
              <h2>{t.proofTitle}</h2>
            </div>
            <p>{t.proofText}</p>
          </div>
        </section>

        <section className="about-story container">
          <div className="about-story-copy">
            <p className="about-section-number">01</p>
            <h2>{t.originTitle}</h2>
            <p>{t.origin}</p>
          </div>
          <aside className="about-founders" aria-label={t.originTitle}>
            <div className="about-founder"><span>JW</span><div><strong>Joey Webster</strong><small>{t.joeyRole}</small></div></div>
            <div className="about-founder"><span>SM</span><div><strong>Sean McCully</strong><small>{t.seanRole}</small></div></div>
          </aside>
        </section>

        <blockquote className="about-quote"><div className="container"><span>“</span>{t.quote}<cite>— Joey & Sean</cite></div></blockquote>

        <section className="about-chapters container">
          <article><p className="about-section-number">02</p><h2>{t.problemTitle}</h2><p>{t.problem}</p></article>
          <article><p className="about-section-number">03</p><h2>{t.todayTitle}</h2><p>{t.today}</p></article>
        </section>

        <section className="about-process">
          <div className="container">
            <div className="about-process-header">
              <p className="about-section-number">04</p>
              <h2>{t.processTitle}</h2>
            </div>
            <div className="about-process-grid">
              {t.process.map(([title, text], index) => {
                const Icon = index === 0 ? ShieldCheck : index === 1 ? CheckCircle : Truck;
                return (
                  <article key={title}>
                    <Icon size={24} strokeWidth={1.8} />
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="about-principles container" aria-label={lang === 'en' ? 'How we work' : 'Cómo trabajamos'}>
          {t.principles.map((principle, index) => <div key={principle}><span>0{index + 1}</span><p>{principle}</p></div>)}
        </section>

        <section className="about-cta">
          <div className="container about-cta-inner">
            <div><h2>{t.ctaTitle}</h2><p>{t.ctaText}</p></div>
            <div className="about-cta-actions">
              <Link href={`/catalog?lang=${lang}`} className="about-primary">{t.catalog} <ArrowUpRight size={17} /></Link>
              <a href={`https://wa.me/${links.whatsappNumber}`} className="about-secondary" target="_blank" rel="noopener noreferrer"><MessageCircle size={17} /> {t.contact}</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="about-footer"><div className="container">© {new Date().getFullYear()} Peptides Costa Rica · {lang === 'en' ? 'For research use only.' : 'Solo para fines de investigación.'}</div></footer>

      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
