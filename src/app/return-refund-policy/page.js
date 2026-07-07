"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { Sun, Moon, ArrowRight, RefreshCcw } from 'lucide-react';

export default function ReturnPolicyPage() {
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
              <RefreshCcw size={40} />
            </div>
            <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>
              {lang === 'en' ? 'Returns & Refunds' : 'Devoluciones y Reembolsos'}
            </h1>
          </div>

          <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)', lineHeight: '1.8' }}>
            <p style={{ marginBottom: '24px', fontWeight: 'bold' }}>
              {lang === 'en' 
                ? 'Due to the sensitive and perishable nature of research peptides, we maintain a strict non-returnable policy for all products.' 
                : 'Debido a la naturaleza sensible y perecedera de los péptidos de investigación, mantenemos una política estricta de no devolución para todos los productos.'}
            </p>

            <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--text-main)', marginTop: '40px', marginBottom: '16px' }}>
              {lang === 'en' ? 'Damaged or Incorrect Items' : 'Artículos Dañados o Incorrectos'}
            </h2>
            <p style={{ marginBottom: '24px' }}>
              {lang === 'en' 
                ? 'If you receive a damaged vial or an incorrect item, please contact our support team via WhatsApp or email within 48 hours of delivery. We will require photographic evidence of the damaged or incorrect package. Upon verification, we will issue a replacement at no additional cost.' 
                : 'Si recibe un vial dañado o un artículo incorrecto, comuníquese con nuestro equipo de soporte a través de WhatsApp o correo electrónico dentro de las 48 horas posteriores a la entrega. Requeriremos evidencia fotográfica. Tras la verificación, emitiremos un reemplazo sin costo adicional.'}
            </p>

            <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--text-main)', marginTop: '40px', marginBottom: '16px' }}>
              {lang === 'en' ? 'Order Cancellations' : 'Cancelaciones de Pedidos'}
            </h2>
            <p style={{ marginBottom: '24px' }}>
              {lang === 'en' 
                ? 'Order modifications or cancellations are only possible if the order has not yet been processed for shipping. Once a package has been handed over to the courier, we cannot cancel or refund the order.' 
                : 'Las modificaciones o cancelaciones de pedidos solo son posibles si el pedido aún no ha sido procesado para su envío. Una vez que el paquete ha sido entregado al mensajero, no podemos cancelar ni reembolsar el pedido.'}
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
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <strong>Legal Notice:</strong> Products offered by Peptides Costa Rica are intended strictly for laboratory research use only. Not for human or veterinary use.
          </div>
        </div>
      </footer>
    </div>
  );
}
