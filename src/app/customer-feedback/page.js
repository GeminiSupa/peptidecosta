"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { Sun, Moon, ArrowRight, MessageSquareQuote } from 'lucide-react';

export default function CustomerFeedbackPage() {
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

  const TESTIMONIALS = [
    { name: 'Carlos M.', location: 'San José', text_en: 'They have always delivered high-quality products that have significantly improved our research findings.', text_es: 'Siempre han entregado productos de alta calidad que han mejorado significativamente nuestros resultados de investigación.' },
    { name: 'Ana R.', location: 'Heredia', text_en: 'The level of customer support and technical advice we receive from their team is unmatched.', text_es: 'El nivel de atención al cliente y asesoramiento técnico que recibimos de su equipo es inigualable.' },
    { name: 'Rodrigo V.', location: 'Cartago', text_en: 'From custom synthesis to tailored solutions, Peptides Costa Rica has been a critical partner in our innovation journey.', text_es: 'Desde la síntesis personalizada hasta soluciones a medida, Peptides Costa Rica ha sido un socio crítico en nuestro viaje de innovación.' },
    { name: 'Dr. Mendez', location: 'Alajuela', text_en: 'Timely delivery and seamless ordering experience helped us meet our project deadlines with ease.', text_es: 'La entrega oportuna y la experiencia de pedido sin problemas nos ayudaron a cumplir con los plazos de nuestro proyecto con facilidad.' }
  ];

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
        <div className="container" style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ background: 'rgba(0, 39, 102, 0.1)', color: 'var(--text-primary)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <MessageSquareQuote size={40} />
          </div>
          <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>
            {lang === 'en' ? 'Customer Success Stories' : 'Historias de Éxito'}
          </h1>
          <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '48px', lineHeight: '1.6', maxWidth: '800px', margin: '0 auto 48px' }}>
            {lang === 'en' 
              ? 'We take pride in the trust and loyalty of our customers. Numerous individuals and researchers across Costa Rica have experienced transformative results with our peptide products.' 
              : 'Nos enorgullecemos de la confianza y lealtad de nuestros clientes. Numerosos individuos e investigadores en Costa Rica han experimentado resultados transformadores.'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', textAlign: 'left' }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{ background: 'var(--card-bg)', padding: '32px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <div style={{ color: '#F59E0B', marginBottom: '16px', fontSize: '1.2rem' }}>★★★★★</div>
                <p style={{ fontSize: '1.1rem', fontStyle: 'italic', color: 'var(--text-main)', marginBottom: '24px', lineHeight: '1.6' }}>
                  "{lang === 'en' ? t.text_en : t.text_es}"
                </p>
                <div>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t.name}</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t.location}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="footer" style={{ marginTop: 0 }}>
        <div className="container">
          <img src="/logo.png" alt="Logo" style={{ height: '36px', marginBottom: '16px', opacity: 0.95, borderRadius: '8px' }} />
          <div className="footer-links" style={{ marginBottom: '24px' }}>
            <Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'Shop Catalog' : 'Catálogo'}</Link>
            <a href="mailto:info@peptidescostarica.net">info@peptidescostarica.net</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
