"use client";
import React, { useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

export default function NewsletterSignup({ lang = 'es' }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');

  const t = {
    en: {
      title: 'Get restock alerts',
      desc: 'We’ll email you when sold-out products return or a new COA is published.',
      placeholder: 'Email address',
      btn: 'Notify me',
      loading: 'Saving...',
      success: 'You’re on the alert list.',
      privacy: 'Usually 1–2 emails per month. Unsubscribe anytime.',
      error: 'An error occurred. Please try again.',
      invalid: 'Please enter a valid email.',
      exists: 'This email is already subscribed.'
    },
    es: {
      title: 'Recibe alertas de inventario',
      desc: 'Te avisamos cuando regrese un producto agotado o publiquemos un nuevo COA.',
      placeholder: 'Correo electrónico',
      btn: 'Avísenme',
      loading: 'Guardando...',
      success: 'Ya estás en la lista de alertas.',
      privacy: 'Normalmente 1–2 correos al mes. Cancela cuando quieras.',
      error: 'Ocurrió un error. Por favor intenta de nuevo.',
      invalid: 'Por favor ingresa un correo válido.',
      exists: 'Este correo ya está suscrito.'
    }
  };

  const text = t[lang] || t['es'];

  const validateEmail = (e) => {
    return String(e).toLowerCase().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      setStatus('error');
      setMessage(text.invalid);
      return;
    }

    setStatus('loading');

    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setStatus('error');
          setMessage(text.exists);
        } else {
          throw new Error(data.error || 'Failed to subscribe');
        }
      } else {
        setStatus('success');
        setEmail('');
      }
    } catch (err) {
      console.error('Newsletter error:', err);
      setStatus('error');
      setMessage(text.error);
    }
  };

  return (
    <div className="nl-container">
      <div className="nl-text-block">
        <h3 className="nl-title">{text.title}</h3>
        <p className="nl-desc">{text.desc}</p>
      </div>

      <div className="nl-form-block">
        {status === 'success' ? (
          <div className="nl-success" role="status">
            <CheckCircle size={20} /> {text.success}
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="nl-form">
              <label className="sr-only" htmlFor="newsletter-email">{text.placeholder}</label>
              <input
                id="newsletter-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') setStatus('idle');
                }}
                placeholder={text.placeholder}
                disabled={status === 'loading'}
                className="nl-input"
                aria-describedby="newsletter-note newsletter-error"
                required
              />
              <button type="submit" disabled={status === 'loading'} className="nl-button">
                {status === 'loading' ? text.loading : text.btn}
              </button>
            </div>
            {status === 'error' && (
              <div id="newsletter-error" className="nl-error" role="alert">
                <AlertCircle size={14} /> {message}
              </div>
            )}
            <p id="newsletter-note" className="nl-note">{text.privacy}</p>
          </form>
        )}
      </div>
    </div>
  );
}
