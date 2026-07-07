"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { Sun, Moon, ArrowRight, Shield } from 'lucide-react';

export default function PrivacyPolicyPage() {
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
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ background: 'rgba(0, 39, 102, 0.1)', color: 'var(--text-primary)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Shield size={40} />
            </div>
            <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>
              {lang === 'en' ? 'Privacy Policy' : 'Política de Privacidad'}
            </h1>
          </div>

          <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)', lineHeight: '1.8' }}>
            <p style={{ marginBottom: '24px' }}>
              {lang === 'en' 
                ? 'At Peptides Costa Rica, we prioritize the privacy and security of your personal data. This privacy policy explains how we collect, use, and protect your information when you interact with our website and catalog.' 
                : 'En Peptides Costa Rica, priorizamos la privacidad y seguridad de sus datos personales. Esta política de privacidad explica cómo recopilamos, usamos y protegemos su información cuando interactúa con nuestro sitio web.'}
            </p>

            <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--text-main)', marginTop: '40px', marginBottom: '16px' }}>
              {lang === 'en' ? 'Information We Collect' : 'Información que Recopilamos'}
            </h2>
            <p style={{ marginBottom: '24px' }}>
              {lang === 'en' 
                ? 'We only collect information necessary to process your orders and provide customer support. This includes your name, shipping address, contact details (such as email or WhatsApp number), and encrypted payment processing data.' 
                : 'Solo recopilamos la información necesaria para procesar sus pedidos y brindar soporte. Esto incluye su nombre, dirección de envío, detalles de contacto (correo electrónico o WhatsApp) y datos de pago cifrados.'}
            </p>

            <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--text-main)', marginTop: '40px', marginBottom: '16px' }}>
              {lang === 'en' ? 'How We Use Your Data' : 'Cómo Usamos sus Datos'}
            </h2>
            <ul style={{ listStyleType: 'disc', paddingLeft: '24px', marginBottom: '24px' }}>
              <li>{lang === 'en' ? 'To fulfill and securely ship your orders within Costa Rica.' : 'Para procesar y enviar sus pedidos de forma segura.'}</li>
              <li>{lang === 'en' ? 'To communicate order statuses and tracking information.' : 'Para comunicar el estado de los pedidos y la información de seguimiento.'}</li>
              <li>{lang === 'en' ? 'To improve our catalog experience through anonymous analytics.' : 'Para mejorar nuestra experiencia en el catálogo mediante análisis anónimos.'}</li>
            </ul>

            <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--text-main)', marginTop: '40px', marginBottom: '16px' }}>
              {lang === 'en' ? 'Data Protection' : 'Protección de Datos'}
            </h2>
            <p style={{ marginBottom: '24px' }}>
              {lang === 'en' 
                ? 'We do not sell, trade, or transfer your personal information to outside parties. Your data is protected by industry-standard encryption protocols during checkout.' 
                : 'No vendemos ni transferimos su información personal a terceros. Sus datos están protegidos mediante protocolos de cifrado estándar de la industria.'}
            </p>
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
