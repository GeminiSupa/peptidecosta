"use client";

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { safeLocalStorage as localStorage } from '@/lib/storage';

// Minimal, public post-payment confirmation page. It is intentionally generic
// and grants nothing (no coupon, no referral, no order data) so it is safe to
// use as the redirect target for third-party hosted payment links, where we
// cannot verify from the URL alone that the visitor actually paid. The
// authoritative record of a payment lives in the processor dashboard, not here.
function OrderReceivedContent() {
  const [lang, setLang] = useState('es');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlLang = params.get('lang');
      if (urlLang === 'en' || urlLang === 'es') {
        setLang(urlLang);
      } else {
        const storedLang = localStorage.getItem('lang');
        if (storedLang === 'en' || storedLang === 'es') setLang(storedLang);
      }
    }
  }, []);

  const t = {
    en: {
      title: 'Thank You for Your Order',
      body: 'We have received your order and are working on it. We will be in touch with you soon.',
      note: 'Please expect slower response times on weekends and outside working hours.',
      button: 'Return to Catalog',
    },
    es: {
      title: 'Gracias por su Pedido',
      body: 'Hemos recibido su pedido y ya estamos trabajando en él. Nos pondremos en contacto con usted pronto.',
      note: 'Por favor, espere tiempos de respuesta más lentos los fines de semana y fuera del horario laboral.',
      button: 'Volver al Catálogo',
    },
  }[lang];

  if (!mounted) return null;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'linear-gradient(160deg, #f8fafc 0%, #eef2f7 100%)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        background: '#ffffff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
        padding: '40px 32px',
        textAlign: 'center',
      }}>
        <div style={{
          width: '72px',
          height: '72px',
          margin: '0 auto 20px',
          borderRadius: '50%',
          background: 'rgba(5, 150, 105, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <CheckCircle2 size={40} color="#059669" strokeWidth={2.2} />
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 12px', letterSpacing: '-0.5px' }}>
          {t.title}
        </h1>

        <p style={{ fontSize: '1rem', color: '#334155', lineHeight: 1.6, margin: '0 0 16px' }}>
          {t.body}
        </p>

        <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 28px' }}>
          {t.note}
        </p>

        <Link
          href={`/catalog?lang=${lang}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: '#059669',
            color: '#ffffff',
            textDecoration: 'none',
            padding: '13px 26px',
            borderRadius: '12px',
            fontWeight: 700,
            fontSize: '0.95rem',
            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
          }}
        >
          <ArrowLeft size={18} />
          {t.button}
        </Link>
      </div>
    </div>
  );
}

export default function OrderReceivedPage() {
  return (
    <Suspense fallback={null}>
      <OrderReceivedContent />
    </Suspense>
  );
}
