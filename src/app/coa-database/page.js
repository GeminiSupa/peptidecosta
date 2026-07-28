"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { Sun, Moon, ArrowRight, FlaskConical, Search, CheckCircle } from 'lucide-react';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { CatalogPromoBanner } from '@/components/StorefrontChrome';
import MobileActionBar from '@/components/MobileActionBar';

export default function CoaDatabasePage() {
  const { links } = useBusinessLinks();
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('es');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const savedLang = localStorage.getItem('lang') || 'es';
    setTheme(savedTheme);
    setLang(savedLang);
    document.documentElement.setAttribute('data-theme', savedTheme);

    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleTheme = (t) => {
    setTheme(t);
    localStorage.setItem('theme', t);
    document.documentElement.setAttribute('data-theme', t);
  };

  const handleLang = (l) => {
    setLang(l);
    localStorage.setItem('lang', l);
  };

  return (
    <div className="landing-layout min-h-screen">
      {/* ── HEADER ────────────────────────────────────────── */}
      <header className={`lp-header${scrolled ? ' lp-header--scrolled' : ''}`}>
        <div className="lp-header-inner">
          <Link href="/" className="lp-logo">
            <img src="/logo.png" alt="Peptides Costa Rica" className="logo-img-custom" style={{ maxHeight: '40px', width: 'auto', borderRadius: '8px' }} />
          </Link>

          <nav className="lp-nav">
            <Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'Catalog' : 'Catálogo'}</Link>
            <Link href={`/about`}>{lang === 'en' ? 'About' : 'Nosotros'}</Link>
            <Link href="/contact">{lang === 'en' ? 'Contact' : 'Contacto'}</Link>
          </nav>

          <div className="lp-header-actions">
            <div className="lp-controls">
              <div className="theme-toggle">
                <button onClick={() => handleTheme('light')} className={theme === 'light' ? 'active' : ''} title="Light"><Sun size={14} strokeWidth={2.5} /></button>
                <button onClick={() => handleTheme('dark')} className={theme === 'dark' ? 'active' : ''} title="Dark"><Moon size={14} strokeWidth={2.5} /></button>
              </div>
              <div className="lang-selector">
                <button onClick={() => handleLang('es')} className={lang === 'es' ? 'active' : ''}>ES</button>
                <button onClick={() => handleLang('en')} className={lang === 'en' ? 'active' : ''}>ENG</button>
              </div>
            </div>
            <Link href={`/catalog?lang=${lang}`} className="lp-nav-cta">
              {lang === 'en' ? 'Shop Now' : 'Comprar'} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <CatalogPromoBanner lang={lang} className="catalog-promo-image-banner--legacy" forceActive />

      <main style={{ paddingTop: '48px', paddingBottom: '80px' }}>
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ background: 'rgba(0, 39, 102, 0.1)', color: 'var(--text-primary)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <FlaskConical size={40} />
          </div>
          <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>
            {lang === 'en' ? 'COA Database' : 'Base de Datos COA'}
          </h1>
          <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '48px', lineHeight: '1.6' }}>
            {lang === 'en' 
              ? 'Transparency is our priority. Every peptide we distribute comes with an independent, third-party Certificate of Analysis (COA) guaranteeing ≥98% purity.' 
              : 'La transparencia es nuestra prioridad. Cada péptido que distribuimos incluye un Certificado de Análisis (COA) independiente que garantiza ≥98% de pureza.'}
          </p>

          <div style={{ background: 'var(--card-bg)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'left', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Search color="#C8530C" />
              {lang === 'en' ? 'How to view lab results' : 'Cómo ver los resultados de laboratorio'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <CheckCircle size={20} color="#25D366" style={{ marginTop: '4px' }} />
                <div>
                  <h4 style={{ fontWeight: 'bold' }}>{lang === 'en' ? 'Integrated in the Catalog' : 'Integrado en el Catálogo'}</h4>
                  <p style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'We have moved all COA documents directly to the product pages for easier access.' : 'Hemos movido todos los documentos COA directamente a las páginas de producto para un acceso más fácil.'}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <CheckCircle size={20} color="#25D366" style={{ marginTop: '4px' }} />
                <div>
                  <h4 style={{ fontWeight: 'bold' }}>{lang === 'en' ? 'View PDF Instantly' : 'Ver PDF Instantáneamente'}</h4>
                  <p style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Simply open any product in our catalog and click the "View COA" button to download or inspect the PDF certificate.' : 'Simplemente abre cualquier producto en nuestro catálogo y haz clic en el botón "Ver COA" para inspeccionar el certificado PDF.'}</p>
                </div>
              </div>
            </div>
          </div>

          <Link href={`/catalog?lang=${lang}`} className="btn-hero-primary" style={{ display: 'inline-flex' }}>
            {lang === 'en' ? 'Browse Products & View COAs' : 'Explorar Productos y Ver COAs'}
          </Link>
        </div>
      </main>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="footer" style={{ marginTop: 0 }}>
        <div className="container">
          <img src="/logo.png" alt="Logo" style={{ height: '36px', marginBottom: '16px', opacity: 0.95, borderRadius: '8px' }} />
          <p>{lang === 'en' ? 'Peptides Costa Rica offers premium, research backed peptides with trusted quality.' : 'Peptides Costa Rica ofrece péptidos premium respaldados por ciencia, con calidad garantizada.'}</p>
          <div className="footer-links" style={{ marginBottom: '24px' }}>
            <Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'Shop Catalog' : 'Catálogo'}</Link>
            <a href={`mailto:${links.supportEmail}`}>{links.supportEmail}</a>
            <a href={`tel:+${links.whatsappNumber}`}>CR: {links.whatsappDisplay}</a>
            <Link href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '500' }}>
              {lang === 'en' ? 'Admin Portal' : 'Portal de Admin'}
            </Link>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} Peptides Costa Rica. {lang === 'en' ? 'All rights reserved. For research purposes only.' : 'Todos los derechos reservados. Solo para fines de investigación.'}
          </div>
        </div>
      </footer>
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
