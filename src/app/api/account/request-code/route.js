import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { rateLimit } from '@/lib/rateLimit.mjs';
import { normalizeEmail } from '@/lib/customerAccount.mjs';

// Step one of customer login: send a six-digit code.
//
// The code itself is issued and verified by Supabase Auth; this route exists to
// put a gate in front of it. Two things have to happen before Supabase is asked
// to create anything:
//
//   1. The address is checked against order_claim_blocklist. Staff addresses and
//      placeholders sit on dozens of other people's orders, so they must not be
//      able to hold a customer account at all — blocking only the claim would
//      leave the account standing for a later rule change or a hand-made
//      correction to hand the history over anyway.
//   2. Repeat attempts are throttled, so the login form cannot be used to mail-
//      bomb a stranger's inbox.
//
// Verification happens in the browser (supabase.auth.verifyOtp) so the session
// lands in the customer client's own storage.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function message(isEn, en, es) {
  return isEn ? en : es;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const isEn = String(body?.lang || '').toLowerCase().startsWith('en');
  const email = normalizeEmail(body?.email);

  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      {
        error: message(
          isEn,
          'Please enter a valid email address.',
          'Por favor ingrese un correo electrónico válido.',
        ),
      },
      { status: 400 },
    );
  }

  // Best-effort only. This limiter is a per-instance Map, so on serverless it
  // catches bursts that land on one warm instance and nothing more. The real
  // throttle is Supabase Auth's own per-address cooldown, which is enforced
  // centrally and cannot be sidestepped by spreading requests across instances.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(`account-code-ip:${ip}`, 10) || !rateLimit(`account-code-email:${email}`, 5)) {
    return NextResponse.json(
      {
        error: message(
          isEn,
          'Too many attempts. Please wait a few minutes and try again.',
          'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.',
        ),
      },
      { status: 429 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: blocked } = await admin
      .from('order_claim_blocklist')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (blocked) {
      return NextResponse.json(
        {
          error: message(
            isEn,
            'This email is linked to orders placed for several different customers, so it cannot be used for an account. Please contact us and we will set one up for you.',
            'Este correo está vinculado a pedidos de varios clientes distintos, por lo que no puede usarse para una cuenta. Contáctenos y le ayudamos a crearla.',
          ),
        },
        { status: 403 },
      );
    }
  } catch (error) {
    // A blocklist lookup that fails must not become an open door.
    console.error('[account/request-code] blocklist lookup failed:', error);
    return NextResponse.json(
      {
        error: message(
          isEn,
          'We could not start the sign-in right now. Please try again shortly.',
          'No pudimos iniciar el acceso en este momento. Inténtelo de nuevo en unos minutos.',
        ),
      },
      { status: 503 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    console.error('[account/request-code] signInWithOtp failed:', error.message);
    const throttled = error.status === 429 || /rate|seconds/i.test(error.message || '');
    return NextResponse.json(
      {
        error: throttled
          ? message(
            isEn,
            'A code was just sent. Please wait a moment before asking for another.',
            'Acabamos de enviar un código. Espere un momento antes de pedir otro.',
          )
          : message(
            isEn,
            'We could not send the code. Please check the address and try again.',
            'No pudimos enviar el código. Verifique la dirección e inténtelo de nuevo.',
          ),
      },
      { status: throttled ? 429 : 502 },
    );
  }

  return NextResponse.json({ ok: true, email });
}
