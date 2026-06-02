"use client";

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowLeft, ShieldAlert, Sparkles, Send, Calendar } from 'lucide-react';
import { safeLocalStorage as localStorage } from '@/lib/storage';

function ThankYouContent() {
  const [lang, setLang] = useState('es');
  const [mounted, setMounted] = useState(false);
  const [reviewClicked, setReviewClicked] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);

  useEffect(() => {
    setMounted(true);
    // 1. Detect language from URL parameter
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlLang = params.get('lang');
      if (urlLang === 'en' || urlLang === 'es') {
        setLang(urlLang);
      } else {
        // 2. Fallback to localStorage
        const storedLang = localStorage.getItem('lang');
        if (storedLang === 'en' || storedLang === 'es') {
          setLang(storedLang);
        }
      }
    }
  }, []);

  const translations = {
    en: {
      title: "Order Received",
      status: "Successful Transaction",
      body1: "Your order has been received, thank you. We will be contacting you soon. Please expect slower response times on weekends or non working hours.",
      body2: "THANK YOU FOR YOUR BUSINESS, WE APPRECIATE IT!!!!!",
      button: "Return to Catalog",
      notice: "Conversion goal tracked successfully",
      reviewTitle: "⭐ Support Our Research, Get 15% Off!",
      reviewBody: "Share your experience with Peptides Costa Rica. Leave us a 5-star Google Review and instantly unlock a 15% discount code for your next order.",
      reviewButton: "Write Google Review",
      reviewReveal: "🎉 Thank you! Use coupon code COSTA15 on your next order.",
      referralTitle: "🧬 Ambassador Referral Program",
      referralBody: "Share Peptides Costa Rica with a research colleague. If they buy, you both get a free Bacteriostatic Water added to your next package!",
      referralCopy: "Copy Referral Link",
      referralCopied: "Copied!",
      referralWhatsapp: "Share on WhatsApp"
    },
    es: {
      title: "Orden Recibida",
      status: "Transacción Exitosa",
      body1: "Su pedido ha sido recibido, gracias. Nos pondremos en contacto con usted pronto. Por favor, espere tiempos de respuesta más lentos los fines de semana u horas no laborables.",
      body2: "¡¡¡¡¡MUCHAS GRACIAS POR SU COMPRA, APRECIAMOS ENORMEMENTE SU PREFERENCIA!!!!!",
      button: "Volver al Catálogo",
      notice: "Meta de conversión registrada exitosamente",
      reviewTitle: "⭐ Apoye Nuestra Investigación, ¡Reciba 15% Off!",
      reviewBody: "Comparta su experiencia con Péptidos Costa Rica. Déjenos una reseña de 5 estrellas en Google Maps e inmediatamente desbloqueará un código de 15% de descuento para su próxima orden.",
      reviewButton: "Escribir Reseña en Google",
      reviewReveal: "🎉 ¡Muchas gracias! Utilice el cupón COSTA15 en su próxima orden.",
      referralTitle: "🧬 Programa de Embajadores",
      referralBody: "Comparta Péptidos Costa Rica con un colega de investigación. Si realiza su compra, ¡ambos recibirán un Agua Bacteriostática gratis en su próximo pedido!",
      referralCopy: "Copiar Enlace de Referido",
      referralCopied: "¡Copiado!",
      referralWhatsapp: "Compartir por WhatsApp"
    }
  };

  const t = translations[lang] || translations.es;

  if (!mounted) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#090d16',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        fontFamily: 'var(--font-inter), sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(56, 189, 248, 0.1)',
            borderTopColor: '#38bdf8',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}} />
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#070a13',
      color: '#e2e8f0',
      fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Immersive Organic Glow/Mesh Blobs */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, rgba(0,0,0,0) 70%)',
        top: '-10%',
        left: '-10%',
        zIndex: 0,
        pointerEvents: 'none',
        animation: 'pulseGlow 8s ease-in-out infinite alternate'
      }} />
      <div style={{
        position: 'absolute',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(56, 189, 248, 0.1) 0%, rgba(0,0,0,0) 70%)',
        bottom: '-10%',
        right: '-10%',
        zIndex: 0,
        pointerEvents: 'none',
        animation: 'pulseGlow 12s ease-in-out infinite alternate-reverse'
      }} />

      {/* Embedded Animations Style Block */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulseGlow {
          0% { transform: scale(1) translate(0, 0); opacity: 0.8; }
          100% { transform: scale(1.15) translate(30px, 20px); opacity: 1; }
        }
        @keyframes checkPop {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes subtleUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes floatEffect {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
          100% { transform: translateY(0px); }
        }
        .animate-check {
          animation: checkPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .animate-card {
          animation: subtleUp 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .btn-hover {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .btn-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px -5px rgba(56, 189, 248, 0.3);
          border-color: rgba(56, 189, 248, 0.5) !important;
          background: rgba(56, 189, 248, 0.15) !important;
        }
      `}} />

      {/* Main Container Card */}
      <div 
        className="animate-card"
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.75) 0%, rgba(15, 23, 42, 0.85) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '40px 32px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* Glowing Science Header */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: 'rgba(56, 189, 248, 0.05)',
          border: '1px solid rgba(56, 189, 248, 0.15)',
          borderRadius: '20px',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          color: '#38bdf8',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          marginBottom: '32px'
        }}>
          <Sparkles size={12} /> 🧬 {t.status}
        </div>

        {/* Dynamic Glowing Success Checkmark */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '28px'
        }}>
          <div 
            className="animate-check"
            style={{
              position: 'relative',
              width: '84px',
              height: '84px',
              background: 'radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.02) 100%)',
              border: '2px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(34, 197, 94, 0.15)'
            }}
          >
            <CheckCircle2 size={44} style={{ color: '#22c55e' }} />
          </div>
        </div>

        {/* Heading */}
        <h1 style={{
          fontFamily: 'var(--font-montserrat), sans-serif',
          fontSize: '2.25rem',
          fontWeight: '900',
          letterSpacing: '-1px',
          background: 'linear-gradient(135deg, #ffffff 30%, #a5b4fc 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '20px',
          lineHeight: '1.15'
        }}>
          {t.title}
        </h1>

        {/* Divider */}
        <div style={{
          height: '1px',
          background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0) 100%)',
          marginBottom: '24px'
        }} />

        {/* Primary Message */}
        <p style={{
          fontSize: '1.05rem',
          lineHeight: '1.6',
          color: '#cbd5e1',
          marginBottom: '32px',
          textAlign: 'center',
          fontWeight: '400'
        }}>
          {t.body1}
        </p>

        {/* Callout Card (Requested in emphasized CAPS) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(56, 189, 248, 0.03) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.25)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '28px',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
        }}>
          <p style={{
            fontSize: '0.9rem',
            lineHeight: '1.5',
            fontWeight: '900',
            letterSpacing: '1px',
            color: '#c084fc',
            margin: 0,
            textTransform: 'uppercase'
          }}>
            {t.body2}
          </p>
        </div>

        {/* GROWTH LOOPS SECTION */}
        {(() => {
          const handleCopyLink = () => {
            const refLink = `https://catalog.peptidescostarica.net/catalog?lang=${lang}&utm_source=referral`;
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
              navigator.clipboard.writeText(refLink);
            }
            setCopiedReferral(true);
            setTimeout(() => setCopiedReferral(false), 2000);
          };

          const getReferralWhatsappLink = () => {
            const text = lang === 'en' 
              ? `Hi! I highly recommend Peptides Costa Rica for certified research peptides (≥98% HPLC purity) and fast shipping. Check out their catalog: https://catalog.peptidescostarica.net/catalog?lang=en&utm_source=referral`
              : `¡Hola! Te recomiendo este proveedor de péptidos en Costa Rica. Cuentan con pureza certificada de laboratorio (≥98% HPLC) y entrega local rápida. Puedes ver su catálogo aquí: https://catalog.peptidescostarica.net/catalog?lang=es&utm_source=referral`;
            return `https://wa.me/?text=${encodeURIComponent(text)}`;
          };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px', textAlign: 'left' }}>
              {/* Card 1: Google Reviews */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)'
              }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {t.reviewTitle}
                </h4>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
                  {t.reviewBody}
                </p>
                
                {!reviewClicked ? (
                  <a 
                    href="https://maps.app.goo.gl/RtDYM6HJz1Qwdkip7" 
                    target="_blank" 
                    rel="noreferrer" 
                    onClick={() => setReviewClicked(true)}
                    style={{ textDecoration: 'none' }}
                  >
                    <button style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#070a13',
                      fontWeight: 'bold',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 15px rgba(251, 191, 36, 0.2)'
                    }}>
                      {t.reviewButton}
                    </button>
                  </a>
                ) : (
                  <div style={{
                    background: 'rgba(34, 197, 94, 0.06)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    fontSize: '0.8rem',
                    color: '#4ade80',
                    fontWeight: 'bold',
                    textAlign: 'center'
                  }}>
                    {t.reviewReveal}
                  </div>
                )}
              </div>

              {/* Card 2: Ambassador Referrals */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)'
              }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {t.referralTitle}
                </h4>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
                  {t.referralBody}
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button 
                    onClick={handleCopyLink}
                    style={{
                      padding: '10px 16px',
                      background: 'rgba(56, 189, 248, 0.06)',
                      border: '1px solid rgba(56, 189, 248, 0.2)',
                      borderRadius: '10px',
                      color: '#38bdf8',
                      fontWeight: 'bold',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    {copiedReferral ? t.referralCopied : t.referralCopy}
                  </button>
                  
                  <a 
                    href={getReferralWhatsappLink()}
                    target="_blank" 
                    rel="noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    <button style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'rgba(34, 197, 94, 0.06)',
                      border: '1px solid rgba(34, 197, 94, 0.2)',
                      borderRadius: '10px',
                      color: '#4ade80',
                      fontWeight: 'bold',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}>
                      <Send size={12} /> {t.referralWhatsapp}
                    </button>
                  </a>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Button & Notice */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}>
          <Link href="/catalog" style={{ textDecoration: 'none', width: '100%' }}>
            <button 
              className="btn-hover"
              style={{
                width: '100%',
                padding: '14px 28px',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '12px',
                color: '#38bdf8',
                fontWeight: '800',
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                outline: 'none'
              }}
            >
              <ArrowLeft size={16} /> {t.button}
            </button>
          </Link>
          
          <span style={{
            fontSize: '0.7rem',
            color: '#475569',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            fontWeight: '600'
          }}>
            ✓ {t.notice}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#070a13', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(56, 189, 248, 0.1)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <ThankYouContent />
    </Suspense>
  );
}
