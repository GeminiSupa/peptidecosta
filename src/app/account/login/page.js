'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';

import { getCustomerSupabase } from '@/lib/customerSupabase';
import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';
import { useAccountAccess } from '@/hooks/useAccountAccess';
import { ACCOUNT_TURNSTILE_ACTION, safeAccountNext } from '@/lib/accountLogin.mjs';
import { isDummyTurnstileKey } from '@/lib/turnstileKey.mjs';
import ComingSoon from '../ComingSoon';
import '../account.css';

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
const showTurnstile = Boolean(turnstileSiteKey) && !isDummyTurnstileKey(turnstileSiteKey);

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
  const [verifyType, setVerifyType] = useState('magiclink');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [testLoginEnabled, setTestLoginEnabled] = useState(false);
  const codeInputRef = useRef(null);
  const turnstileRef = useRef(null);

  // Where to land after signing in. Only same-site paths are honoured, so a
  // crafted ?next=https://elsewhere cannot turn the login form into an open
  // redirect.
  const next = safeAccountNext(searchParams.get('next'));

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

  useEffect(() => {
    let active = true;
    fetch('/api/account/test-login')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.enabled) setTestLoginEnabled(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const signInAsTestAccount = async () => {
    setError('');
    setBusy(true);

    const supabase = getCustomerSupabase();
    if (!supabase) {
      setError(isEn ? 'Sign-in is unavailable.' : 'El acceso no está disponible.');
      setBusy(false);
      return;
    }

    try {
      const res = await fetch('/api/account/test-login', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.access_token || !data?.refresh_token) {
        setError(data?.error || (isEn ? 'The test account could not be opened.' : 'No se pudo abrir la cuenta de prueba.'));
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessionError) {
        setError(isEn ? 'The test account could not be opened.' : 'No se pudo abrir la cuenta de prueba.');
        return;
      }

      try {
        await fetch('/api/account/claim-orders', {
          method: 'POST',
          headers: {
          Authorization: `Bearer ${data.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lang }),
        });
      } catch {
        // Non-fatal, same as a normal sign-in.
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

  const requestCode = async (event) => {
    event?.preventDefault();
    setError('');
    setBusy(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const res = await fetch('/api/account/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, lang, turnstileToken }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const serverError = isEn ? data?.errorEn : data?.errorEs;
        setError(serverError || data?.error || (isEn ? 'Could not send the code.' : 'No se pudo enviar el código.'));
        if (showTurnstile) {
          setTurnstileToken('');
          turnstileRef.current?.reset?.();
        }
        return;
      }

      setEmail(normalizedEmail);
      setStep('code');
      setVerifyType(data?.verifyType === 'signup' ? 'signup' : 'magiclink');
      setCooldown(RESEND_SECONDS);
      setTurnstileToken('');
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
        type: verifyType === 'signup' ? 'signup' : 'magiclink',
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
          headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lang }),
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
  if (checking) {
    return (
      <div className="account-auth account-auth-loading" role="status" aria-live="polite">
        <span className="account-spinner" aria-hidden="true" />
        <span>{isEn ? 'Opening your account…' : 'Abriendo su cuenta…'}</span>
      </div>
    );
  }
  if (!allowed) return <ComingSoon />;

  const securityCheck = showTurnstile ? (
    <div className="account-turnstile">
      <Turnstile
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        onSuccess={(token) => setTurnstileToken(token)}
        onExpire={() => setTurnstileToken('')}
        onError={() => setTurnstileToken('')}
        options={{
          action: ACCOUNT_TURNSTILE_ACTION,
          theme: 'auto',
          appearance: 'interaction-only',
          refreshExpired: 'auto',
        }}
      />
    </div>
  ) : null;

  return (
    <div className="account-auth">
      <div className="account-auth-card">
        <div className="account-auth-topline">
          <Link href={`/catalog?lang=${lang}`} className="account-auth-brand" aria-label="Peptides Costa Rica">
            <span aria-hidden="true">PC</span>
            <strong>Peptides Costa Rica</strong>
          </Link>
          <div className="account-auth-langs" role="group" aria-label={isEn ? 'Language' : 'Idioma'}>
          <button
            type="button"
            className={lang === 'es' ? 'is-active' : ''}
            onClick={() => setLang('es')}
            aria-pressed={lang === 'es'}
          >
            ES
          </button>
          <button
            type="button"
            className={lang === 'en' ? 'is-active' : ''}
            onClick={() => setLang('en')}
            aria-pressed={lang === 'en'}
          >
            EN
          </button>
          </div>
        </div>

        <p className="account-auth-eyebrow">{isEn ? 'Private customer access' : 'Acceso privado de clientes'}</p>
        <h1>{isEn ? 'My Account' : 'Mi Cuenta'}</h1>

        <div className="account-auth-progress" aria-label={isEn ? 'Sign-in progress' : 'Progreso de acceso'}>
          <span className="is-active" aria-hidden="true">1</span>
          <i aria-hidden="true" />
          <span className={step === 'code' ? 'is-active' : ''} aria-hidden="true">2</span>
          <small>{step === 'email' ? (isEn ? 'Your email' : 'Su correo') : (isEn ? 'Check your inbox' : 'Revise su correo')}</small>
        </div>

        {step === 'email' ? (
          <>
            <p className="account-auth-lead">
              {isEn
                ? 'Enter the email used for your orders. We will send a one-time code—no password to remember.'
                : 'Ingrese el correo usado en sus pedidos. Le enviaremos un código de un solo uso; no necesita recordar una contraseña.'}
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
                name="email"
                required
                value={email}
                onChange={(event) => { setEmail(event.target.value); setError(''); }}
                placeholder={isEn ? 'you@example.com' : 'usted@ejemplo.com'}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'account-auth-error' : 'account-auth-privacy'}
              />

              {error ? <p id="account-auth-error" className="account-auth-error" role="alert">{error}</p> : null}

              {securityCheck}

              <button type="submit" className="account-btn-primary" disabled={busy || !email || (showTurnstile && !turnstileToken)}>
                <span>{busy ? null : (isEn ? 'Continue securely' : 'Continuar de forma segura')}</span>
                {busy
                  ? (isEn ? 'Sending…' : 'Enviando…')
                  : <span aria-hidden="true">→</span>}
              </button>
              <p id="account-auth-privacy" className="account-auth-privacy">
                <span aria-hidden="true">✓</span>
                {isEn
                  ? 'We only use this to verify your account and match your own orders.'
                  : 'Solo usamos este correo para verificar su cuenta y vincular sus propios pedidos.'}
              </p>
            </form>
          </>
        ) : (
          <>
            <p className="account-auth-lead">
              {isEn
                ? <>Enter the code sent to <strong>{email}</strong>. It expires in a few minutes.</>
                : <>Ingrese el código enviado a <strong>{email}</strong>. Vence en unos minutos.</>}
            </p>

            <form onSubmit={verifyCode}>
              <label htmlFor="account-code">
                {isEn ? 'Code from the email' : 'Código del correo'}
              </label>
              <input
                id="account-code"
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={10}
                required
                value={code}
                onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                className="account-code-input"
                placeholder="000000"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'account-auth-error' : undefined}
              />

              {error ? <p id="account-auth-error" className="account-auth-error" role="alert">{error}</p> : null}

              <button
                type="submit"
                className="account-btn-primary"
                disabled={busy || code.length < 6}
              >
                <span>{busy ? null : (isEn ? 'Open my account' : 'Abrir mi cuenta')}</span>
                {busy
                  ? (isEn ? 'Checking…' : 'Verificando…')
                  : <span aria-hidden="true">→</span>}
              </button>
            </form>

            {securityCheck}

            <div className="account-auth-actions">
              <button
                type="button"
                className="account-btn-link"
                disabled={cooldown > 0 || busy || (showTurnstile && !turnstileToken)}
                onClick={requestCode}
              >
                {cooldown > 0
                  ? (isEn ? `Resend in ${cooldown}s` : `Reenviar en ${cooldown}s`)
                  : (isEn ? 'Resend code' : 'Reenviar código')}
              </button>
              <button
                type="button"
                className="account-btn-link"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError('');
                  setTurnstileToken('');
                }}
              >
                {isEn ? 'Use a different email' : 'Usar otro correo'}
              </button>
            </div>
          </>
        )}

        {testLoginEnabled ? (
          <div className="account-test-login">
            <button
              type="button"
              className="account-btn-secondary"
              disabled={busy}
              onClick={signInAsTestAccount}
            >
              {busy
                ? (isEn ? 'Opening…' : 'Abriendo…')
                : (isEn ? 'Sign in to the test account' : 'Entrar a la cuenta de prueba')}
            </button>
            <p className="account-muted">
              {isEn
                ? 'No email code. This button is only here while the test switch is on.'
                : 'Sin código de correo. Este botón solo aparece mientras el interruptor de prueba está activo.'}
            </p>
          </div>
        ) : null}

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
    <Suspense fallback={(
      <div className="account-auth account-auth-loading" role="status">
        <span className="account-spinner" aria-hidden="true" />
      </div>
    )}>
      <LoginForm />
    </Suspense>
  );
}
