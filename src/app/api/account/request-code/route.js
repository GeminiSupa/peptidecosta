import { randomBytes } from 'node:crypto';

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { rateLimit } from '@/lib/rateLimit.mjs';
import { normalizeEmail } from '@/lib/customerAccount.mjs';
import { getOrderMailSettings } from '@/lib/transactionalSmtp';
import {
  buildSignInCodeEmail,
  isMissingAuthUser,
  signInCodeFromLink,
  verifyTypeFromLink,
} from '@/lib/accountSignInCode.mjs';
import { getOrderEmailLogoAttachment } from '@/lib/orderEmailBranding.mjs';
import { isDummyTurnstileKey } from '@/lib/turnstileKey.mjs';

// Step one of customer login: email a six-digit code.
//
// Supabase Auth still creates the code. We do not let Supabase send it. Its
// default message is a "Sign in" link that opens the catalog and leaves the
// person signed out. The shop mail sends the digits, and the person types
// them back into the account page.
//
// Two things have to happen before a code is created:
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
  return { error: isEn ? en : es, errorEn: en, errorEs: es };
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
  const turnstileToken = body?.turnstileToken;

  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      message(
        isEn,
        'Please enter a valid email address.',
        'Por favor ingrese un correo electrónico válido.',
      ),
      { status: 400 },
    );
  }

  // Only a real Cloudflare key is checked. The published dummy key draws a
  // "For testing only" box on the live sign-in page, so it is ignored.
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY || '';
  const checkTurnstile = !isDummyTurnstileKey(turnstileSecret);
  if (checkTurnstile && !turnstileToken) {
    return NextResponse.json(
      message(
        isEn,
        'Please complete the security check.',
        'Por favor complete el control de seguridad.',
      ),
      { status: 400 },
    );
  }

  if (checkTurnstile) try {
    const cfFormData = new URLSearchParams();
    cfFormData.append('secret', turnstileSecret);
    cfFormData.append('response', turnstileToken);
    
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (ip) {
      cfFormData.append('remoteip', ip);
    }

    const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: cfFormData,
    });
    
    const cfData = await cfRes.json();
    if (!cfData.success) {
      return NextResponse.json(
        message(
          isEn,
          'Security check failed. Please try again.',
          'El control de seguridad falló. Inténtelo de nuevo.',
        ),
        { status: 400 },
      );
    }
  } catch (error) {
    console.error('[account/request-code] Turnstile verification failed:', error);
    return NextResponse.json(
      message(
        isEn,
        'Security check failed. Please try again.',
        'El control de seguridad falló. Inténtelo de nuevo.',
      ),
      { status: 500 },
    );
  }

  // Best-effort only. This limiter is a per-instance Map, so on serverless it
  // catches bursts that land on one warm instance and nothing more. The real
  // throttle is Supabase Auth's own per-address cooldown, which is enforced
  // centrally and cannot be sidestepped by spreading requests across instances.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(`account-code-ip:${ip}`, 10) || !rateLimit(`account-code-email:${email}`, 5)) {
    return NextResponse.json(
      message(
        isEn,
        'Too many attempts. Please wait a few minutes and try again.',
        'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.',
      ),
      { status: 429 },
    );
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
        message(
          isEn,
          'This email is linked to orders placed for several different customers, so it cannot be used for an account. Please contact us and we will set one up for you.',
          'Este correo está vinculado a pedidos de varios clientes distintos, por lo que no puede usarse para una cuenta. Contáctenos y le ayudamos a crearla.',
        ),
        { status: 403 },
      );
    }
  } catch (error) {
    // A blocklist lookup that fails must not become an open door.
    console.error('[account/request-code] blocklist lookup failed:', error);
    return NextResponse.json(
      message(
        isEn,
        'We could not start the sign-in right now. Please try again shortly.',
        'No pudimos iniciar el acceso en este momento. Inténtelo de nuevo en unos minutos.',
      ),
      { status: 503 },
    );
  }

  let link;
  try {
    const admin = getSupabaseAdmin();
    link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error && isMissingAuthUser(link.error)) {
      // First visit. A signup code creates the login. The password is never
      // shown or stored by us; the person signs in with the six digits.
      link = await admin.auth.admin.generateLink({
        type: 'signup',
        email,
        password: randomBytes(24).toString('base64url'),
      });
    }
  } catch (error) {
    console.error('[account/request-code] could not create a code:', error?.message || error);
    return NextResponse.json(
      message(
        isEn,
        'We could not send the code. Please try again shortly.',
        'No pudimos enviar el código. Inténtelo de nuevo en unos minutos.',
      ),
      { status: 503 },
    );
  }

  if (link?.error) {
    console.error('[account/request-code] generateLink failed:', link.error.message);
    const throttled = link.error.status === 429 || /rate|seconds/i.test(link.error.message || '');
    return NextResponse.json(
      throttled
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
      { status: throttled ? 429 : 502 },
    );
  }

  const code = signInCodeFromLink(link.data);
  const verifyType = verifyTypeFromLink(link.data);
  if (!code || !verifyType) {
    console.error('[account/request-code] login link did not include a code');
    return NextResponse.json(
      message(
        isEn,
        'We could not send the code. Please try again shortly.',
        'No pudimos enviar el código. Inténtelo de nuevo en unos minutos.',
      ),
      { status: 502 },
    );
  }

  const { smtp, from } = getOrderMailSettings();
  if (!smtp.configured) {
    console.error('[account/request-code] order mail is not configured');
    return NextResponse.json(
      message(
        isEn,
        'We could not send the code. Please try again shortly.',
        'No pudimos enviar el código. Inténtelo de nuevo en unos minutos.',
      ),
      { status: 503 },
    );
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    const letter = buildSignInCodeEmail(code, isEn ? 'en' : 'es');
    await transporter.sendMail({
      from,
      to: email,
      subject: letter.subject,
      text: letter.text,
      html: letter.html,
      attachments: [getOrderEmailLogoAttachment()],
    });
  } catch (error) {
    console.error('[account/request-code] mail failed:', error?.message || error);
    return NextResponse.json(
      message(
        isEn,
        'We could not send the code. Please try again shortly.',
        'No pudimos enviar el código. Inténtelo de nuevo en unos minutos.',
      ),
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, email, verifyType });
}
