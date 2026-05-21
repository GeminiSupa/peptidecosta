"use client";

import React, { useState, useEffect } from 'react';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function ExitIntentPopup() {
  const [isVisible, setIsVisible] = useState(false);
  const [hasShown, setHasShown] = useState(false);
  const [lang, setLang] = useState('es');

  useEffect(() => {
    // Check if we've already shown the popup in this session
    const shown = sessionStorage.getItem('exitIntentShown');
    if (shown) {
      setHasShown(true);
      return;
    }

    const handleMouseLeave = (e) => {
      if (e.clientY <= 0 && !hasShown) {
        setIsVisible(true);
        setHasShown(true);
        sessionStorage.setItem('exitIntentShown', 'true');
        setLang(localStorage.getItem('lang') || 'es');
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [hasShown]);

  if (!isVisible) return null;

  return (
    <div 
      className="exit-intent-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.3s ease-out forwards'
      }}
    >
      <div 
        className="exit-intent-modal"
        style={{
          background: 'var(--bg-card)',
          borderTop: '6px solid #d21f24',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '360px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          position: 'relative',
          animation: 'slideUpBounce 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
          textAlign: 'center',
          color: 'var(--text-main)'
        }}
      >
        <button 
          onClick={() => setIsVisible(false)}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'var(--bg-secondary)',
            border: 'none',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.1)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
        >
          <X size={16} />
        </button>

        <img 
          src="/logo.png" 
          alt="Logo" 
          style={{ 
            height: '40px', 
            objectFit: 'contain', 
            margin: '0 auto 16px auto',
            display: 'block' 
          }} 
        />

        <h2 style={{ fontSize: '1.3rem', fontWeight: '800', marginBottom: '8px', color: '#002766' }}>
          {lang === 'en' ? 'Wait! Before you go...' : '¡Espera! Antes de irte...'}
        </h2>
        
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '20px' }}>
          {lang === 'en' 
            ? "Don't forget to complete your order today. We offer the highest purity and fastest local delivery."
            : "No olvides completar tu orden hoy. Ofrecemos la más alta pureza y la entrega local más rápida."}
        </p>

        <Link 
          href="/catalog" 
          onClick={() => setIsVisible(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: '#002766',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '10px',
            fontWeight: 'bold',
            textDecoration: 'none',
            fontSize: '0.95rem',
            transition: 'transform 0.2s ease, background 0.2s ease',
            boxShadow: '0 4px 10px rgba(0, 39, 102, 0.3)'
          }}
          onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = '#001a40'; }}
          onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = '#002766'; }}
        >
          {lang === 'en' ? 'Finish Your Order' : 'Terminar tu Orden'} <ArrowRight size={18} />
        </Link>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUpBounce {
          from { opacity: 0; transform: translateY(40px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}} />
    </div>
  );
}
