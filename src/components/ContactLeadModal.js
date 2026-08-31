'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import LeadFormTrap, { useLeadFormTrap } from '@/components/LeadFormTrap';
import { isDiallablePhone } from '@/lib/leadContact.mjs';

// The storefront "Contáctenos" dialog. It replaced the WhatsApp CTAs, so this
// is the path for a visitor who wants a person rather than a checkout. It
// writes straight into the CRM Leads tab via /api/leads/contact.

const COPY = {
  es: {
    title: 'Contáctenos',
    intro: 'Déjenos sus datos y un asesor le escribirá.',
    name: 'Nombre',
    email: 'Correo electrónico',
    phone: 'Teléfono (para WhatsApp o SMS)',
    submit: 'Enviar',
    sending: 'Enviando...',
    close: 'Cerrar',
    successTitle: '¡Gracias!',
    successText: 'Recibimos sus datos. Un asesor le contactará pronto.',
    done: 'Listo',
    errName: 'Por favor escriba su nombre.',
    errContact: 'Escriba un correo o un teléfono para poder responderle.',
    errEmail: 'Ese correo no parece válido. Revise que tenga un solo @ y un dominio.',
    errPhone: 'Ese teléfono no parece válido. Escriba el número completo, con al menos 8 dígitos.',
    errSave: 'No pudimos enviar sus datos. Intente de nuevo.',
  },
  en: {
    title: 'Contact Us',
    intro: 'Leave your details and an advisor will reach out.',
    name: 'Name',
    email: 'Email address',
    phone: 'Phone (for WhatsApp or SMS)',
    submit: 'Send',
    sending: 'Sending...',
    close: 'Close',
    successTitle: 'Thank you!',
    successText: 'We got your details. An advisor will contact you shortly.',
    done: 'Done',
    errName: 'Please enter your name.',
    errContact: 'Add an email or a phone number so we can reply.',
    errEmail: 'That email does not look right. Check for a single @ and a domain.',
    errPhone: 'That phone number does not look right. Enter the full number, at least 8 digits.',
    errSave: 'We could not send your details. Please try again.',
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactLeadModal({ open, onClose, lang = 'es', source = 'contact_form' }) {
  const copy = COPY[lang === 'en' ? 'en' : 'es'];
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const nameRef = useRef(null);
  const dialogRef = useRef(null);
  // Reset on `open` for the same reason the fields below are: the dialog is
  // mounted for the whole session, so the clock has to start when the visitor
  // opens it rather than when the page loaded.
  const { trapRef, trapFields } = useLeadFormTrap(open);

  // Reset on each fresh open so a previous success screen never greets the
  // next visitor who clicks the button.
  useEffect(() => {
    if (!open) return;
    setForm({ name: '', email: '', phone: '' });
    setError('');
    setSent(false);
    setSending(false);
    const timer = setTimeout(() => nameRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);

  // Escape closes, and the page behind must not scroll while the sheet is up
  // on a phone.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    // The scrolling element here is <html>, not <body>, so locking the body
    // alone left the page scrolling away behind the open dialog. Both are set,
    // and both are restored to whatever they were rather than to ''.
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousPadding = root.style.paddingRight;
    // Hiding the overflow also removes the scrollbar, which widens the page and
    // makes everything behind the dialog jump sideways. Holding that width back
    // as padding keeps the page still while the dialog is open.
    const scrollbar = window.innerWidth - root.clientWidth;
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
      root.style.paddingRight = previousPadding;
    };
  }, [open, onClose]);

  if (!open) return null;

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

    if (!name) { setError(copy.errName); nameRef.current?.focus(); return; }
    if (!email && !phone) { setError(copy.errContact); return; }
    if (email && !EMAIL_RE.test(email)) { setError(copy.errEmail); return; }
    // Catches the typo while the visitor is still here to fix it, and stops a
    // number nobody can ring from becoming a lead's only contact point.
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

  return (
    <div
      className="clone-lead-backdrop"
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the backdrop closes, so
        // dragging a selection out of a field cannot dismiss the form.
        if (event.target === dialogRef.current?.parentElement) onClose?.();
      }}
    >
      <div
        className="clone-lead-card"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clone-lead-title"
      >
        <button type="button" className="clone-lead-close" onClick={onClose} aria-label={copy.close}>
          <X size={18} />
        </button>

        {sent ? (
          <div className="clone-lead-success">
            <span className="clone-lead-tick" aria-hidden="true"><Check size={22} /></span>
            <h2 id="clone-lead-title">{copy.successTitle}</h2>
            <p>{copy.successText}</p>
            <button type="button" className="clone-lead-submit" onClick={onClose}>{copy.done}</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <LeadFormTrap inputRef={trapRef} />
            <h2 id="clone-lead-title">{copy.title}</h2>
            <p className="clone-lead-intro">{copy.intro}</p>

            <label className="clone-lead-field">
              <span>{copy.name}</span>
              <input ref={nameRef} value={form.name} onChange={update('name')} autoComplete="name" />
            </label>
            <label className="clone-lead-field">
              <span>{copy.email}</span>
              <input value={form.email} onChange={update('email')} type="email" inputMode="email" autoComplete="email" />
            </label>
            <label className="clone-lead-field">
              <span>{copy.phone}</span>
              <input value={form.phone} onChange={update('phone')} type="tel" inputMode="tel" autoComplete="tel" />
            </label>

            {error && <p className="clone-lead-error" role="alert">{error}</p>}

            <button type="submit" className="clone-lead-submit" disabled={sending}>
              {sending ? <><Loader2 size={16} className="clone-lead-spin" /> {copy.sending}</> : copy.submit}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
