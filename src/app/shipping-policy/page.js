"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { Sun, Moon, ArrowRight, Package } from 'lucide-react';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';

export default function ShippingPolicyPage() {
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
                <button onClick={() => handleLang('en')} className={lang === 'en' ? 'active' : ''}>ENG</button>
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
              <Package size={40} />
            </div>
            <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>
              {lang === 'en' ? 'Shipping Policy' : 'Política de Envíos'}
            </h1>
          </div>

          <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)', lineHeight: '1.8' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--text-main)', marginTop: '40px', marginBottom: '16px' }}>
              {lang === 'en' ? 'Processing Time' : 'Tiempo de Procesamiento'}
            </h2>
            <p style={{ marginBottom: '24px' }}>
              {lang === 'en' 
                ? 'All orders are processed within 24 hours of payment confirmation. Orders placed on weekends or holidays will be processed on the following business day.' 
                : 'Todos los pedidos se procesan dentro de las 24 horas posteriores a la confirmación del pago. Los pedidos realizados en fines de semana o feriados se procesarán el siguiente día hábil.'}
            </p>

            <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--text-main)', marginTop: '40px', marginBottom: '16px' }}>
              {lang === 'en' ? 'Shipping Methods & Delivery Times' : 'Métodos de Envío y Tiempos de Entrega'}
            </h2>
            <p style={{ marginBottom: '24px' }}>
              {lang === 'en' 
                ? 'We utilize trusted local couriers (Correos de Costa Rica, Moovin) to ensure your package arrives securely. Standard delivery takes 1-3 business days depending on your location within Costa Rica.' 
                : 'Utilizamos mensajeros locales de confianza (Correos de Costa Rica, Moovin) para asegurar que su paquete llegue de forma segura. La entrega estándar toma 1-3 días hábiles dependiendo de su ubicación en Costa Rica.'}
            </p>

            <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--text-main)', marginTop: '40px', marginBottom: '16px' }}>
              {lang === 'en' ? 'Packaging' : 'Embalaje'}
            </h2>
            <p style={{ marginBottom: '24px' }}>
              {lang === 'en' 
                ? 'Peptides are sensitive to heat and light. We take extraordinary care to securely package your vials in discrete, protective materials to maintain their integrity during transit.' 
                : 'Los péptidos son sensibles al calor y la luz. Tomamos medidas extraordinarias para empacar de forma segura sus viales en materiales discretos y protectores para mantener su integridad durante el tránsito.'}
            </p>
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
            <a href={`mailto:${links.supportEmail}`}>{links.supportEmail}</a>
            <a href={`tel:+${links.whatsappNumber}`}>CR: {links.whatsappDisplay}</a>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <strong>Legal Notice:</strong> Products offered by Peptides Costa Rica are intended strictly for laboratory research use only. They are not approved or licensed by the FDA for the prevention, diagnosis, treatment, or cure of any disease. Information on this website is for educational purposes only and should not be considered medical or legal advice. Not for human or veterinary use.
          </div>
        </div>
      </footer>
    </div>
  );
}
