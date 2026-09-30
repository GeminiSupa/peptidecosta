// The six-digit sign-in code for a customer account.
//
// Supabase's own login email is a "Sign in" link. That link opens the catalog
// and does not open the account, because the account pages do not read a
// session out of the address bar. So this shop sends the code itself, and the
// message has the digits only — no link.

export function isMissingAuthUser(error) {
  const message = `${error?.message || ''} ${error?.code || ''}`;
  return /not found|does not exist|no user|user_not_found/i.test(message);
}

export function signInCodeFromLink(link) {
  const code = String(link?.properties?.email_otp || '').trim();
  // Supabase's code length is a project setting. This shop's is 8. Accept the
  // range Supabase allows so a longer code is not thrown away as "not sent".
  return /^\d{6,10}$/.test(code) ? code : null;
}

export function verifyTypeFromLink(link) {
  const type = String(link?.properties?.verification_type || '').toLowerCase();
  if (type === 'signup' || type === 'magiclink') return type;
  return null;
}

export function buildSignInCodeEmail(code) {
  const safe = String(code || '').trim();
  if (!/^\d{6,10}$/.test(safe)) {
    throw new Error('Sign-in code must be 6 to 10 digits');
  }

  const subject = 'Su código para entrar a su cuenta';
  const text = [
    'Su código para entrar a su cuenta es:',
    '',
    safe,
    '',
    'Escríbalo en la página de su cuenta. Vence en unos minutos y solo sirve una vez.',
    'Si usted no lo pidió, ignore este correo.',
    '',
    'Your sign-in code is above. Type it on the account page. There is no link to click.',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:24px;background:#F4F6F9;font-family:Arial,sans-serif;color:#0F172A;">
  <div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;">
    <p style="margin:0 0 8px;font-size:16px;">Su código para entrar a su cuenta es:</p>
    <p style="margin:0 0 16px;font-size:28px;letter-spacing:4px;font-weight:700;color:#002766;">${safe}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">Escríbalo en la página de su cuenta. Vence en unos minutos y solo sirve una vez.</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Si usted no lo pidió, ignore este correo.</p>
    <p style="margin:0;font-size:13px;color:#64748B;">Your sign-in code is above. Type it on the account page. There is no link to click.</p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
