"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Mail, CheckCircle, ArrowRight, AlertCircle } from 'lucide-react';

export default function NewsletterSignup({ lang = 'es' }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');

  const t = {
    en: {
      title: 'Join Our Research Community',
      desc: 'Get exclusive updates, early access to new peptides, and special discounts.',
      placeholder: 'Enter your email address',
      btn: 'Subscribe',
      loading: 'Subscribing...',
      success: 'Thank you for subscribing!',
      error: 'An error occurred. Please try again.',
      invalid: 'Please enter a valid email.',
      exists: 'This email is already subscribed.'
    },
    es: {
      title: 'Únete a Nuestra Comunidad',
      desc: 'Recibe actualizaciones exclusivas, acceso anticipado a nuevos péptidos y descuentos especiales.',
      placeholder: 'Ingresa tu correo electrónico',
      btn: 'Suscribirme',
      loading: 'Suscribiendo...',
      success: '¡Gracias por suscribirte!',
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
      if (!supabase) throw new Error('Supabase not configured');
      
      const { error } = await supabase
        .from('email_subscribers')
        .insert([{ email, source: 'newsletter_form' }]);

      if (error) {
        if (error.code === '23505') { // Unique violation
          setStatus('error');
          setMessage(text.exists);
        } else {
          throw error;
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
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5 }}
      >
        <div className="nl-wrapper">
          
          <div className="nl-text-block">
            <h3 className="nl-title">
              {text.title}
            </h3>
            <p className="nl-desc">
              {text.desc}
            </p>
          </div>

          <div className="nl-form-block">
            <AnimatePresence mode="wait">
              {status === 'success' ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="nl-success"
                >
                  <CheckCircle size={22} />
                  {text.success}
                </motion.div>
              ) : (
                <motion.form 
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={handleSubmit} 
                >
                  <div className="nl-form">
                    <div className="nl-input-wrapper">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (status === 'error') setStatus('idle');
                        }}
                        placeholder={text.placeholder}
                        disabled={status === 'loading'}
                        className="nl-input"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={status === 'loading'}
                      className="nl-button"
                    >
                      {status === 'loading' ? (
                        <span style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>{text.loading}</span>
                      ) : (
                        <>
                          {text.btn}
                          <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </div>
                  
                  {status === 'error' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="nl-error"
                    >
                      <AlertCircle size={14} />
                      {message}
                    </motion.div>
                  )}
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
