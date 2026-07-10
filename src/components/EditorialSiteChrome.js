"use client";

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import PromoTicker from '@/components/PromoTicker';
import TrustFlowBand from '@/components/TrustFlowBand';

export function EditorialHeader({ lang, onLanguage }) {
  return <>
    <PromoTicker text={lang === 'en'
      ? 'Volume Discount: Buy 5+ vials get 15% off, buy 10+ vials get 20% off! Mix & match allowed.'
      : 'Descuento por Volumen: compra 5+ viales y recibe 15%, compra 10+ y recibe 20%. Puedes combinar productos.'}
    />
    <header className="editorial-header">
      <div className="editorial-header-inner">
        <Link href="/" className="editorial-logo"><img src="/logo.webp" alt="Peptides Costa Rica"/></Link>
        <nav className="editorial-nav" aria-label="Main navigation">
          <Link href="/about">{lang === 'en' ? 'About' : 'Nosotros'}</Link>
          <Link href="/catalog">{lang === 'en' ? 'Shop by product' : 'Productos'}</Link>
          <Link href="/blog">{lang === 'en' ? 'Info center' : 'Centro de información'}</Link>
        </nav>
        <div className="editorial-actions">
          <div className="editorial-language" aria-label="Language">
            <button onClick={() => onLanguage('es')} className={lang === 'es' ? 'active' : ''}>ES</button>
            <button onClick={() => onLanguage('en')} className={lang === 'en' ? 'active' : ''}>EN</button>
          </div>
          <Link href="/catalog" className="editorial-shop" aria-label={lang === 'en' ? 'Open catalog' : 'Abrir catálogo'}><ArrowRight size={18}/></Link>
        </div>
      </div>
    </header>
    <TrustFlowBand lang={lang} compact />
  </>;
}

export function EditorialFooter({ lang }) {
  return <footer className="editorial-footer">
    <div className="editorial-footer-cta">
      <span>{lang === 'en' ? 'RESEARCH-GRADE COLLECTION' : 'COLECCIÓN DE GRADO INVESTIGACIÓN'}</span>
      <h2>{lang === 'en' ? 'Premium peptides. Local reliability.' : 'Péptidos premium. Confianza local.'}</h2>
      <Link href="/catalog">{lang === 'en' ? 'Browse the collection' : 'Explorar la colección'} <ArrowRight size={17}/></Link>
    </div>
    <div className="editorial-footer-grid">
      <div><img src="/logo.webp" alt="Peptides Costa Rica"/><p>{lang === 'en' ? 'Premium research products with clear documentation and dependable service throughout Costa Rica.' : 'Productos premium de investigación con documentación clara y servicio confiable en Costa Rica.'}</p></div>
      <div><h3>{lang === 'en' ? 'Explore' : 'Explorar'}</h3><Link href="/catalog">{lang === 'en' ? 'Products' : 'Productos'}</Link><Link href="/blog">Blog</Link><Link href="/about">{lang === 'en' ? 'About us' : 'Nosotros'}</Link></div>
      <div><h3>{lang === 'en' ? 'Support' : 'Soporte'}</h3><Link href="/contact">{lang === 'en' ? 'Contact' : 'Contacto'}</Link><Link href="/shipping-policy">{lang === 'en' ? 'Shipping' : 'Envíos'}</Link><Link href="/privacy-policy">{lang === 'en' ? 'Privacy' : 'Privacidad'}</Link></div>
    </div>
    <div className="editorial-legal">© {new Date().getFullYear()} Peptides Costa Rica · {lang === 'en' ? 'For laboratory research use only.' : 'Solo para uso de investigación de laboratorio.'}</div>
  </footer>;
}
