"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { ArrowRight, MessageCircle, Mail, Send, CheckCircle, User, AtSign, FileText, Loader2 } from 'lucide-react';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { CatalogPromoBanner } from '@/components/StorefrontChrome';
import MobileActionBar from '@/components/MobileActionBar';
import './contact.css';

export default function ContactPage() {
  const { links } = useBusinessLinks();
  const [lang, setLang] = useState('es');
  const [scrolled, setScrolled] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const requestedLang = new URLSearchParams(window.location.search).get('lang');
    const savedLang = localStorage.getItem('lang') || 'es';
    const initialLang = requestedLang === 'en' || requestedLang === 'es' ? requestedLang : savedLang;
    const frame = requestAnimationFrame(() => setLang(initialLang));
    localStorage.setItem('lang', initialLang);
    document.documentElement.lang = initialLang;

    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); };
  }, []);

  const handleLang = (l) => {
    setLang(l);
    localStorage.setItem('lang', l);
    document.documentElement.lang = l;
    window.history.replaceState(null, '', `${window.location.pathname}?lang=${l}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    
    if (!formName.trim() || !formEmail.trim() || !formMessage.trim()) {
      setFormError(lang === 'en' ? 'Please fill in all required fields.' : 'Por favor completa todos los campos requeridos.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formEmail.trim())) {
      setFormError(lang === 'en' ? 'Please enter a valid email address.' : 'Por favor ingresa un correo electrónico válido.');
      return;
    }

    setFormLoading(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim(),
          subject: formSubject.trim() || null,
          message: formMessage.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFormSuccess(true);
        setFormName(''); setFormEmail(''); setFormSubject(''); setFormMessage('');
      } else {
        setFormError(data.error || (lang === 'en' ? 'Something went wrong. Please try again.' : 'Algo salió mal. Inténtalo de nuevo.'));
      }
    } catch (err) {
      setFormError(lang === 'en' ? 'Connection error. Please try again.' : 'Error de conexión. Inténtalo de nuevo.');
    } finally {
      setFormLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '14px 16px', paddingLeft: '44px',
    background: 'var(--card-bg)', border: '1px solid var(--border-color)',
    borderRadius: '12px', color: 'var(--text-main)', fontSize: '14px',
    outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit', boxSizing: 'border-box'
  };

  const inputIconStyle = {
    position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
    color: 'var(--text-muted)', pointerEvents: 'none'
  };

  const labelStyle = {
    display: 'block', fontSize: '13px', fontWeight: '600',
    color: 'var(--text-main)', marginBottom: '6px', textAlign: 'left'
  };

  return (
    <div className="landing-layout min-h-screen contact-page">
      <header className={`lp-header${scrolled ? ' lp-header--scrolled' : ''}`}>
        <div className="lp-header-inner">
          <Link href="/" className="lp-logo">
            <Image src="/logo.webp" alt="Peptides Costa Rica" width={240} height={202} priority className="logo-img-custom" style={{ maxHeight: '40px', width: 'auto', borderRadius: '8px' }} />
          </Link>

          <nav className="lp-nav contact-nav" aria-label="Main navigation">
            <Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'Catalog' : 'Catálogo'}</Link>
            <Link href={`/about?lang=${lang}`}>{lang === 'en' ? 'About Us' : 'Sobre Nosotros'}</Link>
            <Link href={`/blog?lang=${lang}`}>Blog</Link>
            <Link href={`/contact?lang=${lang}`} className="active">{lang === 'en' ? 'Contact' : 'Contacto'}</Link>
          </nav>

          <div className="lp-header-actions">
            <div className="lang-selector">
              <button onClick={() => handleLang('es')} className={lang === 'es' ? 'active' : ''}>ES</button>
              <button onClick={() => handleLang('en')} className={lang === 'en' ? 'active' : ''}>ENG</button>
            </div>
            <Link href={`/catalog?lang=${lang}`} className="lp-nav-cta">
              {lang === 'en' ? 'Catalog' : 'Catálogo'} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <CatalogPromoBanner lang={lang} className="catalog-promo-image-banner--legacy" forceActive />

      <main className="contact-main">
        <div className="container contact-content">
          <div className="contact-hero">
            <span className="contact-kicker">{lang === 'en' ? 'DIRECT SUPPORT' : 'SOPORTE DIRECTO'}</span>
            <h1>
              {lang === 'en' ? 'Contact Peptides Costa Rica' : 'Contacta Peptides Costa Rica'}
            </h1>
            <p>
              {lang === 'en' 
                ? 'Ask about current availability, COA documentation, local delivery, or an existing order. We respond in English or Spanish.'
                : 'Pregunta por disponibilidad, documentación COA, entrega local o un pedido existente. Respondemos en español o inglés.'}
            </p>
            <div className="contact-hero-points">
              <span><CheckCircle size={15} /> {lang === 'en' ? 'Real human support' : 'Atención humana'}</span>
              <span><CheckCircle size={15} /> {lang === 'en' ? 'Local Costa Rica delivery' : 'Entrega local en Costa Rica'}</span>
              <span><CheckCircle size={15} /> {lang === 'en' ? 'COA questions welcome' : 'Consultas COA bienvenidas'}</span>
            </div>
          </div>

          <div className="contact-form-card" style={{
            background: 'var(--card-bg)', borderRadius: '20px',
            border: '1px solid var(--border-color)', padding: '40px 32px',
            marginBottom: '40px', boxShadow: '0 8px 32px rgba(0,0,0,0.06)'
          }}>
            {formSuccess ? (
              <div role="status" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{
                  width: '72px', height: '72px', borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.12)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
                  animation: 'fadeInUp 0.5s ease'
                }}>
                  <CheckCircle size={36} color="#10b981" />
                </div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '12px' }}>
                  {lang === 'en' ? 'Message Sent!' : '¡Mensaje Enviado!'}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '15px', maxWidth: '400px', margin: '0 auto 28px', lineHeight: '1.6' }}>
                  {lang === 'en' 
                    ? 'Thank you for reaching out. Our team will review your message and reply to your email shortly.' 
                    : 'Gracias por comunicarte. Nuestro equipo revisará tu mensaje y responderá a tu correo pronto.'}
                </p>
                <button 
                  onClick={() => setFormSuccess(false)}
                  className="contact-button contact-button--primary"
                  style={{ background: '#f58220' }}
                >
                  {lang === 'en' ? 'Send Another Message' : 'Enviar Otro Mensaje'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '20px' }}>
                  {/* Name Field */}
                  <div>
                    <label htmlFor="contact-name" style={labelStyle}>
                      {lang === 'en' ? 'Full Name' : 'Nombre Completo'} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={inputIconStyle}><User size={16} /></span>
                      <input
                        id="contact-name" autoComplete="name"
                        type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                        placeholder={lang === 'en' ? 'John Doe' : 'Juan Pérez'}
                        style={inputStyle} required
                        onFocus={(e) => { e.target.style.borderColor = '#f58220'; e.target.style.boxShadow = '0 0 0 3px rgba(245,130,32,0.12)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                      />
                    </div>
                  </div>

                  {/* Email Field */}
                  <div>
                    <label htmlFor="contact-email" style={labelStyle}>
                      {lang === 'en' ? 'Email Address' : 'Correo Electrónico'} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={inputIconStyle}><AtSign size={16} /></span>
                      <input
                        id="contact-email" autoComplete="email"
                        type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                        placeholder={lang === 'en' ? 'you@example.com' : 'tu@correo.com'}
                        style={inputStyle} required
                        onFocus={(e) => { e.target.style.borderColor = '#f58220'; e.target.style.boxShadow = '0 0 0 3px rgba(245,130,32,0.12)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                      />
                    </div>
                  </div>
                </div>

                {/* Subject Field */}
                <div>
                  <label htmlFor="contact-subject" style={labelStyle}>
                    {lang === 'en' ? 'Subject (Optional)' : 'Asunto (Opcional)'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={inputIconStyle}><FileText size={16} /></span>
                    <input
                      id="contact-subject"
                      type="text" value={formSubject} onChange={(e) => setFormSubject(e.target.value)}
                      placeholder={lang === 'en' ? 'e.g. Question about BPC-157' : 'ej. Pregunta sobre BPC-157'}
                      style={inputStyle}
                      onFocus={(e) => { e.target.style.borderColor = '#f58220'; e.target.style.boxShadow = '0 0 0 3px rgba(245,130,32,0.12)'; }}
                      onBlur={(e) => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                    />
                  </div>
                </div>

                {/* Message Field */}
                <div>
                  <label htmlFor="contact-message" style={labelStyle}>
                    {lang === 'en' ? 'Your Message' : 'Tu Mensaje'} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    value={formMessage} onChange={(e) => setFormMessage(e.target.value)}
                    placeholder={lang === 'en' 
                      ? 'Tell us how we can help you...' 
                      : 'Cuéntanos cómo podemos ayudarte...'}
                    required rows={5}
                    style={{
                      ...inputStyle, paddingLeft: '16px', minHeight: '140px', resize: 'vertical', lineHeight: '1.6'
                    }}
                    onFocus={(e) => { e.target.style.borderColor = '#f58220'; e.target.style.boxShadow = '0 0 0 3px rgba(245,130,32,0.12)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>

                {/* Error */}
                {formError && (
                  <div role="alert" style={{
                    background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '10px', padding: '12px 16px', color: '#f87171', fontSize: '13px', fontWeight: '600'
                  }}>
                    {formError}
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit" disabled={formLoading}
                  className="contact-button contact-button--primary"
                  style={{
                    background: '#f58220',
                    width: '100%', padding: '16px', fontSize: '15px', fontWeight: '700',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    borderRadius: '12px', border: 'none', color: '#fff', cursor: formLoading ? 'wait' : 'pointer',
                    opacity: formLoading ? 0.7 : 1, transition: 'all 0.2s'
                  }}
                >
                  {formLoading ? (
                    <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> {lang === 'en' ? 'Sending...' : 'Enviando...'}</>
                  ) : (
                    <><Send size={18} /> {lang === 'en' ? 'Send Message' : 'Enviar Mensaje'}</>
                  )}
                </button>
              </form>
            )}
          </div>

          <div className="contact-direct-label">
            <span>{lang === 'en' ? 'FAST OPTIONS' : 'OPCIONES RÁPIDAS'}</span>
            <h2>{lang === 'en' ? 'Reach us directly' : 'Contáctanos directamente'}</h2>
          </div>

          <div className="contact-direct-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>
            
            <div className="contact-method-card contact-method-card--whatsapp" style={{ background: 'var(--card-bg)', padding: '40px 24px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ background: '#25D36615', color: '#25D366', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                <MessageCircle size={32} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>WhatsApp</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                {lang === 'en' ? 'Fastest response time. Available for support and ordering.' : 'Respuesta más rápida. Disponible para soporte y pedidos.'}
              </p>
              <a 
                href={`https://wa.me/${links.whatsappNumber}`} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(buildWhatsAppLink(links.whatsappNumber), '_blank');
                }}
                className="contact-button contact-button--wa"
                style={{ background: '#25D366', width: '100%' }}
              >
                <MessageCircle size={17} /> {lang === 'en' ? 'Chat on WhatsApp' : 'Chatear por WhatsApp'}
              </a>
            </div>

            <div className="contact-method-card" style={{ background: 'var(--card-bg)', padding: '40px 24px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ background: 'rgba(0, 39, 102, 0.1)', color: 'var(--text-primary)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                <Mail size={32} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>Email</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                {lang === 'en' ? 'For bulk inquiries or general questions.' : 'Para consultas por volumen o preguntas generales.'}
              </p>
              <a href={`mailto:${links.supportEmail}`} className="contact-button contact-button--secondary" style={{ width: '100%' }}>
                <Mail size={17} /> {lang === 'en' ? 'Email Us' : 'Enviar Email'}
              </a>
            </div>

          </div>
        </div>
      </main>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="footer" style={{ marginTop: 0 }}>
        <div className="container">
          <Image src="/logo.webp" alt="Peptides Costa Rica" width={416} height={205} style={{ width: 'auto', height: '36px', marginBottom: '16px', opacity: 0.95, borderRadius: '8px' }} />
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
      <MobileActionBar lang={lang} whatsappHref={buildWhatsAppLink(links.whatsappNumber)} />
    </div>
  );
}
