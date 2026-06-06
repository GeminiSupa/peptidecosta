"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { Sun, Moon, ArrowRight, MessageCircle, Mail, MapPin } from 'lucide-react';
import { buildWhatsAppLink } from '@/lib/whatsapp';

export default function ContactPage() {
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
            <Link href={`/about`}>{lang === 'en' ? 'About' : 'Nosotros'}</Link>
            <Link href="/faq">{lang === 'en' ? 'FAQ' : 'Preguntas'}</Link>
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
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>
            {lang === 'en' ? 'Contact Us' : 'Contáctanos'}
          </h1>
          <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '48px' }}>
            {lang === 'en' 
              ? 'Have questions about our peptides or need help with your order? Reach out directly.' 
              : '¿Tienes preguntas sobre nuestros péptidos o necesitas ayuda con tu pedido? Escríbenos.'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>
            
            {/* WhatsApp Card */}
            <div style={{ background: 'var(--card-bg)', padding: '40px 24px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ background: '#25D36615', color: '#25D366', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                <MessageCircle size={32} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>WhatsApp</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                {lang === 'en' ? 'Fastest response time. Available for support and ordering.' : 'Respuesta más rápida. Disponible para soporte y pedidos.'}
              </p>
              <a 
                href="https://wa.me/50684046973" 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(buildWhatsAppLink('50684046973'), '_blank');
                }}
                className="btn-hero-primary" 
                style={{ background: '#25D366', width: '100%' }}
              >
                {lang === 'en' ? 'Chat Now' : 'Chatear Ahora'}
              </a>
            </div>

            {/* Email Card */}
            <div style={{ background: 'var(--card-bg)', padding: '40px 24px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ background: 'rgba(0, 39, 102, 0.1)', color: '#002766', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                <Mail size={32} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>Email</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                {lang === 'en' ? 'For bulk inquiries or general questions.' : 'Para consultas por volumen o preguntas generales.'}
              </p>
              <a href="mailto:info@peptidescostarica.net" className="btn-outline" style={{ width: '100%' }}>
                info@peptidescostarica.net
              </a>
            </div>

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
