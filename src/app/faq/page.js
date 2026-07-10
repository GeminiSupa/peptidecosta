"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { Sun, Moon, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import PromoTicker from '@/components/PromoTicker';

export default function FAQPage() {
  const { links } = useBusinessLinks();
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('es');
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

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

  const faqs = [
    {
      q: lang === 'en' ? 'Are your peptides research grade?' : '¿Sus péptidos son de grado investigación?',
      a: lang === 'en' 
        ? 'Yes. All peptides are HPLC-tested and come with a Certificate of Analysis (COA) from independent labs, guaranteeing ≥98% purity.' 
        : 'Sí. Todos los péptidos son probados por HPLC y vienen con un Certificado de Análisis (COA) de laboratorios independientes, garantizando ≥98% de pureza.'
    },
    {
      q: lang === 'en' ? 'How do I pay?' : '¿Cómo puedo pagar?',
      a: lang === 'en' 
        ? 'We accept SINPE Móvil (CRC), credit/debit cards (Visa, Mastercard) and PayPal (USD). All payments are handled securely through our encrypted checkout.' 
        : 'Aceptamos SINPE Móvil (CRC), tarjetas de crédito/débito (Visa, Mastercard) y PayPal (USD). Todos los pagos son procesados de forma segura.'
    },
    {
      q: lang === 'en' ? 'How fast is delivery?' : '¿Qué tan rápido es el envío?',
      a: lang === 'en' 
        ? 'We ship within 24–48 hours of payment confirmation. Delivery to most areas of Costa Rica takes 1–3 business days.' 
        : 'Enviamos en 24–48 horas tras la confirmación del pago. La entrega en la mayoría de provincias tarda 1–3 días hábiles.'
    },
    {
      q: lang === 'en' ? 'Do you include reconstitution supplies?' : '¿Incluyen suministros de reconstitución?',
      a: lang === 'en' 
        ? 'Yes! We provide complimentary bacteriostatic water with every order — no need to add it to your cart. You can also find syringes in the Reconstitution Supply category.' 
        : 'Sí. Proporcionamos agua bacteriostática de cortesía con cada pedido — no es necesario agregarla al carrito. También puede encontrar jeringas en la categoría Suministros de Reconstitución.'
    },
    {
      q: lang === 'en' ? 'Can I order via WhatsApp?' : '¿Puedo pedir por WhatsApp?',
      a: lang === 'en' 
        ? `Absolutely. Message us on WhatsApp (${links.whatsappDisplay}) and we will walk you through your order.` 
        : `Por supuesto. Escríbenos al WhatsApp (${links.whatsappDisplay}) y te guiamos con tu pedido.`
    }
  ];

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
          <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '40px', color: 'var(--text-main)', textAlign: 'center' }}>
            {lang === 'en' ? 'Frequently Asked Questions' : 'Preguntas Frecuentes'}
          </h1>
          
          <div className="lp-faq-list">
            {faqs.map((faq, i) => (
              <div key={i} className={`lp-faq-item${openFaq === i ? ' open' : ''}`}>
                <button
                  className="lp-faq-question"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{faq.q}</span>
                  {openFaq === i ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <div className="lp-faq-answer">
                  <p>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '60px', textAlign: 'center', padding: '40px', background: 'var(--card-bg)', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>{lang === 'en' ? 'Still have questions?' : '¿Aún tienes preguntas?'}</h3>
            <p style={{ marginBottom: '24px', color: 'var(--text-muted)' }}>
              {lang === 'en' ? 'Our support team is ready to help you.' : 'Nuestro equipo de soporte está listo para ayudarte.'}
            </p>
            <Link href="/contact" className="btn-hero-primary" style={{ display: 'inline-flex' }}>
              {lang === 'en' ? 'Contact Us' : 'Contáctanos'}
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
