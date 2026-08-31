'use client';

import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import LeadFormTrap, { useLeadFormTrap } from '@/components/LeadFormTrap';
import { isDiallablePhone } from '@/lib/leadContact.mjs';

const COPY = {
  es: {
    title: 'Obtenga más información',
    intro: 'Déjenos sus datos y un asesor se comunicará con usted.',
    name: 'Nombre',
    email: 'Correo electrónico',
    phone: 'Teléfono (para WhatsApp o SMS)',
    submit: 'Solicitar Información',
    sending: 'Enviando...',
    successTitle: '¡Gracias!',
    successText: 'Hemos recibido sus datos. Un asesor le contactará muy pronto.',
    errName: 'Por favor escriba su nombre.',
    errContact: 'Escriba un correo o un teléfono para poder responderle.',
    errEmail: 'Ese correo no parece válido. Revise que tenga un solo @ y un dominio.',
    errPhone: 'Ese teléfono no parece válido. Escriba el número completo, con al menos 8 dígitos.',
    errSave: 'No pudimos enviar sus datos. Intente de nuevo.',
  },
  en: {
    title: 'Get more information',
    intro: 'Leave your details and an advisor will reach out to you.',
    name: 'Name',
    email: 'Email address',
    phone: 'Phone (for WhatsApp or SMS)',
    submit: 'Request Information',
    sending: 'Sending...',
    successTitle: 'Thank you!',
    successText: 'We got your details. An advisor will contact you shortly.',
    errName: 'Please enter your name.',
    errContact: 'Add an email or a phone number so we can reply.',
    errEmail: 'That email does not look right. Check for a single @ and a domain.',
    errPhone: 'That phone number does not look right. Enter the full number, at least 8 digits.',
    errSave: 'We could not send your details. Please try again.',
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdWordsLeadForm({ 
  lang = 'es', 
  source = 'adwords_landing',
  className = ''
}) {
  const copy = COPY[lang === 'en' ? 'en' : 'es'];
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // This form is embedded in a page rather than opened, so the clock starts
  // when it mounts and there is nothing to reset it on.
  const { trapRef, trapFields } = useLeadFormTrap();

  const update = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    if (error) setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (sending) return;

    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();

    if (!name) { setError(copy.errName); return; }
    if (!email && !phone) { setError(copy.errContact); return; }
    if (email && !EMAIL_RE.test(email)) { setError(copy.errEmail); return; }
    if (phone && !isDiallablePhone(phone)) { setError(copy.errPhone); return; }

    setSending(true);
    try {
      const response = await fetch('/api/leads/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, language: lang, source, ...trapFields() }),
      });
      if (!response.ok) throw new Error('save_failed');
      setSent(true);
    } catch {
      setError(copy.errSave);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className={`clone-lead-success ${className}`} style={{ padding: '2rem', textAlign: 'center', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <span className="clone-lead-tick" aria-hidden="true" style={{ display: 'inline-flex', justifyContent: 'center', marginBottom: '1rem', color: '#10b981' }}>
          <Check size={32} />
        </span>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{copy.successTitle}</h2>
        <p style={{ color: '#4b5563' }}>{copy.successText}</p>
      </div>
    );
  }

  return (
    <div className={`adwords-lead-form ${className}`} style={{ padding: '2rem', background: '#ffffff', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <LeadFormTrap inputRef={trapRef} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>{copy.title}</h2>
        <p style={{ color: '#4b5563', margin: '0 0 1rem 0' }}>{copy.intro}</p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: '500' }}>
          <span>{copy.name}</span>
          <input 
            value={form.name} 
            onChange={update('name')} 
            autoComplete="name"
            style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #d1d5db', width: '100%' }}
          />
        </label>
        
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: '500' }}>
          <span>{copy.email}</span>
          <input 
            value={form.email} 
            onChange={update('email')} 
            type="email" 
            inputMode="email" 
            autoComplete="email"
            style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #d1d5db', width: '100%' }}
          />
        </label>
        
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: '500' }}>
          <span>{copy.phone}</span>
          <input 
            value={form.phone} 
            onChange={update('phone')} 
            type="tel" 
            inputMode="tel" 
            autoComplete="tel"
            style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #d1d5db', width: '100%' }}
          />
        </label>

        {error && <p role="alert" style={{ color: '#ef4444', fontSize: '0.875rem', margin: 0 }}>{error}</p>}

        <button 
          type="submit" 
          disabled={sending}
          style={{ 
            marginTop: '1rem',
            padding: '0.75rem 1.5rem', 
            background: '#2563eb', 
            color: 'white', 
            fontWeight: 'bold', 
            borderRadius: '4px', 
            border: 'none',
            cursor: sending ? 'not-allowed' : 'pointer',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.5rem',
            opacity: sending ? 0.7 : 1
          }}
        >
          {sending ? <><Loader2 size={16} className="clone-lead-spin" /> {copy.sending}</> : copy.submit}
        </button>
      </form>
    </div>
  );
}
