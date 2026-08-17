'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { getCustomerSupabase } from '@/lib/customerSupabase';
import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';
import { useAccountAccess } from '@/hooks/useAccountAccess';
import ComingSoon from '../ComingSoon';
import '../account.css';

const RESEND_SECONDS = 60;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [lang, setLang] = useStorefrontLang();
  const { session, loading: sessionLoading } = useCustomerSession();
  const { allowed, checking } = useAccountAccess();
  const isEn = lang === 'en';

  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeInputRef = useRef(null);

  // Where to land after signing in. Only same-site paths are honoured, so a
  // crafted ?next=https://elsewhere cannot turn the login form into an open
  // redirect.
  const rawNext = searchParams.get('next') || '/account';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/account';

  useEffect(() => {
    if (checking || !allowed) return;
    if (!sessionLoading && session) router.replace(next);
  }, [checking, allowed, session, sessionLoading, next, router]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus();
  }, [step]);

  const requestCode = async (event) => {
    event?.preventDefault();
    setError('');
    setBusy(true);

    try {
      const res = await fetch('/api/account/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || (isEn ? 'Could not send the code.' : 'No se pudo enviar el código.'));
        return;
      }

      setStep('code');
      setCooldown(RESEND_SECONDS);
    } catch {
      setError(isEn
        ? 'Connection problem. Please try again.'
        : 'Problema de conexión. Inténtelo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    const supabase = getCustomerSupabase();
    if (!supabase) {
      setError(isEn ? 'Sign-in is unavailable.' : 'El acceso no está disponible.');
      setBusy(false);
      return;
    }

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: 'email',
      });

      if (verifyError || !data?.session) {
        setError(isEn
          ? 'That code is not right, or it has expired. Please request a new one.'
          : 'Ese código no es correcto o ya venció. Solicite uno nuevo.');
        return;
      }

      // Attach any guest orders placed with this address. Runs on every sign-in,
      // so orders placed as a guest after the account existed still find their
      // way home. A failure here must not block the login — the dashboard simply
      // shows fewer orders until the next sign-in retries it.
      try {
        await fetch('/api/account/claim-orders', {
          method: 'POST',
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
      } catch {
        // Non-fatal by design.
      }

      router.replace(next);
    } catch {
      setError(isEn
        ? 'Connection problem. Please try again.'
        : 'Problema de conexión. Inténtelo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  // Render nothing until the launch gate has decided, so the sign-in form never
  // flashes up before the coming-soon notice replaces it.
  if (checking) return null;
  if (!allowed) return <ComingSoon />;

  return (
    <div className="account-auth">
      <div className="account-auth-card">
        <div className="account-auth-langs">
          <button
            type="button"
            className={lang === 'es' ? 'is-active' : ''}
            onClick={() => setLang('es')}
          >
            ES
          </button>
          <button
            type="button"
            className={lang === 'en' ? 'is-active' : ''}
            onClick={() => setLang('en')}
          >
            EN
          </button>
        </div>

        <h1>{isEn ? 'My Account' : 'Mi Cuenta'}</h1>

        {step === 'email' ? (
          <>
            <p className="account-auth-lead">
              {isEn
                ? 'Enter your email and we will send you a six-digit sign-in code. No password needed.'
                : 'Ingrese su correo y le enviaremos un código de seis dígitos para entrar. No necesita contraseña.'}
            </p>

            <form onSubmit={requestCode}>
              <label htmlFor="account-email">
                {isEn ? 'Email address' : 'Correo electrónico'}
              </label>
              <input
                id="account-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={isEn ? 'you@example.com' : 'usted@ejemplo.com'}
              />

              {error ? <p className="account-auth-error">{error}</p> : null}

              <button type="submit" className="account-btn-primary" disabled={busy || !email}>
                {busy
                  ? (isEn ? 'Sending…' : 'Enviando…')
                  : (isEn ? 'Send me a code' : 'Enviarme un código')}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="account-auth-lead">
              {isEn
                ? <>We sent a six-digit code to <strong>{email}</strong>. It expires in a few minutes.</>
                : <>Enviamos un código de seis dígitos a <strong>{email}</strong>. Vence en unos minutos.</>}
            </p>

            <form onSubmit={verifyCode}>
              <label htmlFor="account-code">
                {isEn ? 'Six-digit code' : 'Código de seis dígitos'}
              </label>
              <input
                id="account-code"
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                className="account-code-input"
                placeholder="000000"
              />

              {error ? <p className="account-auth-error">{error}</p> : null}

              <button
                type="submit"
                className="account-btn-primary"
                disabled={busy || code.length < 6}
              >
                {busy
                  ? (isEn ? 'Checking…' : 'Verificando…')
                  : (isEn ? 'Sign in' : 'Entrar')}
              </button>
            </form>

            <div className="account-auth-actions">
              <button
                type="button"
                className="account-btn-link"
                disabled={cooldown > 0 || busy}
                onClick={requestCode}
              >
                {cooldown > 0
                  ? (isEn ? `Resend in ${cooldown}s` : `Reenviar en ${cooldown}s`)
                  : (isEn ? 'Resend code' : 'Reenviar código')}
              </button>
              <button
                type="button"
                className="account-btn-link"
                onClick={() => { setStep('email'); setCode(''); setError(''); }}
              >
                {isEn ? 'Use a different email' : 'Usar otro correo'}
              </button>
            </div>
          </>
        )}

        <p className="account-auth-foot">
          <Link href={`/catalog?lang=${lang}`}>
            {isEn ? '← Back to the catalog' : '← Volver al catálogo'}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function AccountLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
