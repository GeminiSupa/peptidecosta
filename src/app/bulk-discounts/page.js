"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { Sun, Moon, ArrowRight, Percent, Package, ShieldCheck } from 'lucide-react';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import PromoTicker from '@/components/PromoTicker';

export default function BulkDiscountsPage() {
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
      <PromoTicker text={lang === 'en'
        ? 'Volume Discount: Buy 5+ vials get 15% off, buy 10+ vials get 20% off! Mix & match allowed.'
        : 'Descuento por Volumen: compra 5+ viales y recibe 15%, compra 10+ y recibe 20%. Puedes combinar productos.'}
      />

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
        <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>
              {lang === 'en' ? 'Bulk Discounts' : 'Descuentos por Volumen'}
            </h1>
            <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>
              {lang === 'en' 
                ? 'Save more when you buy in larger quantities for your research needs.' 
                : 'Ahorra más al comprar en grandes cantidades para tus necesidades de investigación.'}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '48px' }}>
            <div style={{ background: 'var(--card-bg)', padding: '32px', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>5+ Vials</h3>
              <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#C8530C', marginBottom: '16px' }}>10% OFF</div>
              <p style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Automatic discount at checkout.' : 'Descuento automático en caja.'}</p>
            </div>
            <div style={{ background: 'var(--card-bg)', padding: '32px', borderRadius: '16px', border: '2px solid var(--text-primary)', textAlign: 'center', transform: 'scale(1.05)', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>10+ Vials</h3>
              <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '16px' }}>15% OFF</div>
              <p style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Best value for active researchers.' : 'Mejor valor para investigadores activos.'}</p>
            </div>
            <div style={{ background: 'var(--card-bg)', padding: '32px', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>25+ Vials</h3>
              <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#C8530C', marginBottom: '16px' }}>Contact Us</div>
              <p style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Custom wholesale pricing available.' : 'Precios mayoristas personalizados.'}</p>
            </div>
          </div>

          <div style={{ background: 'var(--background-alt)', padding: '40px', borderRadius: '16px', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '1.8rem', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldCheck color="#C8530C" />
              {lang === 'en' ? 'Wholesale Terms' : 'Términos Mayoristas'}
            </h2>
            <ul style={{ listStyleType: 'disc', paddingLeft: '24px', lineHeight: '1.8', color: 'var(--text-muted)' }}>
              <li>{lang === 'en' ? 'Discounts apply automatically in the catalog cart when thresholds are met.' : 'Los descuentos se aplican automáticamente en el carrito del catálogo.'}</li>
              <li>{lang === 'en' ? 'You can mix and match different peptides to reach the required vial count.' : 'Puedes combinar diferentes péptidos para alcanzar la cantidad requerida.'}</li>
              <li>{lang === 'en' ? 'All bulk orders still include complimentary BAC water and priority local shipping.' : 'Todos los pedidos al por mayor incluyen agua BAC gratis y envío local prioritario.'}</li>
            </ul>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <Link href={`/catalog?lang=${lang}`} className="btn-hero-primary" style={{ display: 'inline-flex' }}>
              {lang === 'en' ? 'Start Shopping' : 'Comenzar a Comprar'}
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
    </div>
  );
}
