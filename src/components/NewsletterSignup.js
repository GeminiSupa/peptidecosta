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
        .from('newsletter_subscribers')
        .insert([{ email, source: 'website_footer' }]);

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
    <div className="w-full">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5 }}
        className="w-full"
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 sm:gap-12 text-left">
          
          <div className="flex-1 text-center md:text-left">
            <h3 className="text-2xl sm:text-3xl font-black text-white mb-2 tracking-tight font-montserrat">
              {text.title}
            </h3>
            <p className="text-sm sm:text-base text-white/70 max-w-md mx-auto md:mx-0">
              {text.desc}
            </p>
          </div>

          <div className="flex-1 w-full max-w-md">
            <AnimatePresence mode="wait">
              {status === 'success' ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-2 text-white font-bold bg-emerald-500 py-4 px-6 rounded-2xl shadow-[0_4px_20px_rgba(16,185,129,0.3)]"
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
                  className="w-full relative"
                >
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (status === 'error') setStatus('idle');
                        }}
                        placeholder={text.placeholder}
                        disabled={status === 'loading'}
                        className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:bg-white/10 transition-all disabled:opacity-50 text-base shadow-inner"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={status === 'loading'}
                      className="w-full sm:w-auto px-6 py-4 bg-[var(--accent)] hover:opacity-90 text-white rounded-xl font-bold transition-all shadow-[0_4px_14px_rgba(200,83,12,0.4)] flex items-center justify-center gap-2 disabled:opacity-70 text-base"
                    >
                      {status === 'loading' ? (
                        <span className="inline-block animate-pulse">{text.loading}</span>
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
                      className="absolute -bottom-7 left-0 w-full flex items-center justify-center gap-1.5 text-red-400 text-sm mt-2 font-medium"
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
