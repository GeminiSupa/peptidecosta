"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { Sun, Moon, ArrowRight, ArrowUpRight } from 'lucide-react';

export default function AboutPage() {
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
            <img src="/logo.png" alt="Peptides Costa Rica" className="logo-img-custom" style={{ maxHeight: '34px', width: 'auto', borderRadius: '4px' }} />
          </Link>

          <nav className="lp-nav">
            <Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'Catalog' : 'Catálogo'}</Link>
            <Link href={`/blog?lang=${lang}`}>{lang === 'en' ? 'Blog' : 'Blog'}</Link>
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
                <button onClick={() => handleLang('en')} className={lang === 'en' ? 'active' : ''}>EN</button>
              </div>
            </div>
            <Link href={`/catalog?lang=${lang}`} className="lp-nav-cta">
              {lang === 'en' ? 'Shop Now' : 'Comprar'} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <main style={{ paddingTop: '120px', paddingBottom: '80px' }}>
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '24px', color: 'var(--text-main)' }}>
            {lang === 'en' ? 'About Peptides Costa Rica' : 'Sobre Peptides Costa Rica'}
          </h1>
          <div style={{ fontSize: '1.1rem', lineHeight: '1.8', color: 'var(--text-muted)' }}>
            <p style={{ marginBottom: '24px' }}>
              {lang === 'en' 
                ? 'Welcome to Peptides Costa Rica, your local source for premium peptides, offering high-quality, research-grade peptide products with reliable delivery.' 
                : 'Bienvenidos a Peptides Costa Rica, su fuente local de péptidos premium, ofreciendo productos de grado investigativo de alta calidad con entrega confiable.'}
            </p>
            <p style={{ marginBottom: '24px' }}>
              {lang === 'en'
                ? 'More people are interested in peptides for performance, recovery, metabolism, weight management, and longevity. Getting them from international suppliers often leads to delays, uncertainty, and unnecessary customs hassles.'
                : 'Más personas están interesadas en los péptidos para el rendimiento, la recuperación, el metabolismo y la longevidad. Obtenerlos de proveedores internacionales a menudo conlleva demoras, incertidumbre y problemas aduanales.'}
            </p>
            <h2 style={{ fontSize: '2rem', fontWeight: '700', marginTop: '40px', marginBottom: '16px', color: 'var(--text-main)' }}>
              {lang === 'en' ? 'We do things differently' : 'Hacemos las cosas diferente'}
            </h2>
            <p style={{ marginBottom: '24px' }}>
              {lang === 'en'
                ? 'At Peptides Costa Rica, we serve customers exclusively within Costa Rica. We offer clear pricing, bulk discounts, direct communication, and reliable local service.'
                : 'En Peptides Costa Rica, servimos exclusivamente a clientes dentro de Costa Rica. Ofrecemos precios claros, descuentos por volumen y un servicio local confiable.'}
            </p>
            <ul style={{ listStyleType: 'disc', paddingLeft: '24px', marginBottom: '32px' }}>
              <li>{lang === 'en' ? 'Verified Quality (COA Tested)' : 'Calidad Verificada (Pruebas COA)'}</li>
              <li>{lang === 'en' ? 'Transparent Pricing' : 'Precios Transparentes'}</li>
              <li>{lang === 'en' ? 'Local Reliability (No Customs Issues)' : 'Confiabilidad Local (Sin Problemas Aduanales)'}</li>
            </ul>
            <Link href={`/catalog?lang=${lang}`} className="btn-hero-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              {lang === 'en' ? 'Browse All Products' : 'Ver Todos los Productos'} <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </main>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="footer" style={{ marginTop: 0 }}>
        <div className="container">
          <img src="/logo.png" alt="Logo" style={{ height: '36px', marginBottom: '16px', opacity: 0.95, borderRadius: '8px' }} />
          <p>{lang === 'en' ? 'Peptides Costa Rica offers premium, research backed peptides with trusted quality.' : 'Peptides Costa Rica ofrece péptidos premium respaldados por ciencia, con calidad garantizada.'}</p>
          <div className="footer-links" style={{ marginBottom: '24px' }}>
            <Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'Shop Catalog' : 'Catálogo'}</Link>
            <a href="mailto:info@peptidescostarica.net">info@peptidescostarica.net</a>
            <a href="tel:+50684046973">CR: +506 8404-6973</a>
            <Link href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '500' }}>
              {lang === 'en' ? 'Admin Portal' : 'Portal de Admin'}
            </Link>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} Peptides Costa Rica. {lang === 'en' ? 'All rights reserved. For research purposes only.' : 'Todos los derechos reservados. Solo para fines de investigación.'}
          </div>
        </div>
      </footer>
    </div>
  );
}
