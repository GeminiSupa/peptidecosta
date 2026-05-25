"use client";

import React, { useState, useEffect } from 'react';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function ExitIntentPopup() {
  const [isVisible, setIsVisible] = useState(false);
  const [hasShown, setHasShown] = useState(false);
  const [lang, setLang] = useState('es');
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  useEffect(() => {
    if (isAdmin) return;

    // Check if we've already shown the popup in this session
    const shown = sessionStorage.getItem('exitIntentShown');
    if (shown) {
      setHasShown(true);
      return;
    }

    const handleMouseOut = (e) => {
      if (e.clientY < 50 && e.relatedTarget === null && !hasShown) {
        setIsVisible(true);
        setHasShown(true);
        sessionStorage.setItem('exitIntentShown', 'true');
        setLang(localStorage.getItem('lang') || 'es');
      }
    };

    document.addEventListener('mouseout', handleMouseOut);

    return () => {
      document.removeEventListener('mouseout', handleMouseOut);
    };
  }, [hasShown, isAdmin]);

  if (isAdmin || !isVisible) return null;

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
          padding: '24px 24px 32px 24px',
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
            background: '#ff6b00',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '10px',
            fontWeight: 'bold',
            textDecoration: 'none',
            fontSize: '0.95rem',
            transition: 'transform 0.2s ease, background 0.2s ease',
            boxShadow: '0 4px 10px rgba(255, 107, 0, 0.3)'
          }}
          onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = '#e05e00'; }}
          onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = '#ff6b00'; }}
        >
          {lang === 'en' ? 'Finish Your Order' : 'Terminar tu Orden'} <ArrowRight size={18} />
        </Link>

        <div style={{ marginTop: '20px' }}>
          <a
            href="https://wa.me/50684046973"
            onClick={(e) => {
              e.preventDefault();
              window.open(buildWhatsAppLink('50684046973', lang === 'en' ? 'Hi! I have a question about my order.' : '¡Hola! Tengo algunas preguntas.'), '_blank');
            }}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#22c55e',
              fontSize: '0.85rem',
              fontWeight: '600',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => { 
              e.currentTarget.style.color = '#15803d'; 
              e.currentTarget.style.textDecoration = 'underline'; 
            }}
            onMouseOut={(e) => { 
              e.currentTarget.style.color = '#22c55e'; 
              e.currentTarget.style.textDecoration = 'none'; 
            }}
          >
            <svg 
              viewBox="0 0 24 24" 
              width="20" 
              height="20" 
              style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="12" fill="#22c55e"/>
              <path fillRule="evenodd" clipRule="evenodd" d="M12.022 17.502c1.025 0 2.02-.276 2.894-.799l2.072.544-.553-2.021a5.459 5.459 0 0 0 .848-2.909c0-3.023-2.46-5.483-5.483-5.483-3.024 0-5.484 2.46-5.484 5.483 0 1.293.45 2.507 1.22 3.477l-.547 2.003 2.051-.537a5.46 5.46 0 0 0 2.482.642Zm2.883-4.227c-.097-.049-.577-.285-.666-.317-.089-.033-.154-.049-.22.049-.064.097-.251.317-.308.382-.057.065-.114.073-.211.024-.097-.049-.41-.151-.781-.482-.289-.258-.485-.577-.542-.675-.057-.097-.006-.15.043-.198.043-.044.097-.114.146-.17.049-.058.065-.098.097-.163.033-.065.017-.122-.008-.17-.024-.05-.22-.529-.301-.724-.08-.193-.167-.167-.23-.17-.058-.003-.127-.003-.195-.003-.069 0-.179.026-.273.13-.093.106-.357.35-.357.854 0 .504.366.992.417 1.057.051.065.72 1.1 1.745 1.545.244.106.435.17.583.217.246.078.47.067.646.04.197-.028.577-.235.658-.463.081-.227.081-.422.057-.463-.024-.04-.089-.065-.186-.114Z" fill="white"/>
            </svg>
            <span>
              {lang === 'en' ? 'Or Chat With Us on WhatsApp' : 'O chatea con nosotros por WhatsApp'}
            </span>
          </a>
        </div>
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
