// The sign-in code and the welcome note for a customer account.
//
// Supabase's own login email is a "Sign in" link. That link opens the catalog
// and does not open the account. This shop sends the code itself. The message
// is in the language the person picked, shows the logo, and has no link.

import { ORDER_EMAIL_LOGO_SRC } from './orderEmailBranding.mjs';

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

const ACCOUNT_URL = 'https://catalog.peptidescostarica.net/account';

function emailShell({ lang, title, subtitle, body }) {
  const isEn = lang === 'en';
  return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'es'}">
<body style="margin:0;padding:24px;background:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0f172a;padding:28px 24px;text-align:center;">
      <img src="${ORDER_EMAIL_LOGO_SRC}" alt="Peptides Costa Rica" width="96" height="82" style="display:block;width:96px;height:82px;margin:0 auto 10px;border-radius:12px;">
      <div style="color:#ffffff;font-size:13px;font-weight:800;letter-spacing:1.2px;">PEPTIDES COSTA RICA</div>
      <h1 style="color:#ffffff;font-size:22px;font-weight:800;margin:12px 0 6px;">${title}</h1>
      <p style="color:#e2e8f0;font-size:14px;margin:0;line-height:1.5;">${subtitle}</p>
    </div>
    <div style="padding:28px 24px;">
      ${body}
    </div>
  </div>
</body>
</html>`;
}

export function buildSignInCodeEmail(code, lang = 'es') {
  const safe = String(code || '').trim();
  if (!/^\d{6,10}$/.test(safe)) {
    throw new Error('Sign-in code must be 6 to 10 digits');
  }

  const isEn = lang === 'en';
  const subject = isEn
    ? 'Your Peptides Costa Rica sign-in code'
    : 'Su código para entrar a su cuenta';
  const title = isEn ? 'Your sign-in code' : 'Su código de acceso';
  const subtitle = isEn
    ? 'Type this on the account page. It expires in a few minutes.'
    : 'Escríbalo en la página de su cuenta. Vence en unos minutos.';
  const note = isEn
    ? 'There is no link to click. If you did not ask for this code, ignore this email.'
    : 'No hay ningún enlace para tocar. Si usted no lo pidió, ignore este correo.';
  const text = [title, '', safe, '', subtitle, note].join('\n');
  const html = emailShell({
    lang: isEn ? 'en' : 'es',
    title,
    subtitle,
    body: `
      <p style="margin:0 0 8px;font-size:15px;">${isEn ? 'Your code' : 'Su código'}</p>
      <p style="margin:0 0 18px;font-size:32px;letter-spacing:6px;font-weight:800;color:#002766;text-align:center;">${safe}</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#64748B;">${note}</p>
    `,
  });

  return { subject, text, html };
}

export function buildAccountWelcomeEmail({ name, lang = 'es' } = {}) {
  const isEn = lang === 'en';
  const who = String(name || '').replace(/[<>&]/g, '').trim();
  const hello = who
    ? (isEn ? `Hello ${who},` : `Hola ${who},`)
    : (isEn ? 'Hello,' : 'Hola,');
  const subject = isEn
    ? 'Your Peptides Costa Rica account is ready'
    : 'Su cuenta de Peptides Costa Rica está lista';
  const accountUrl = `${ACCOUNT_URL}?lang=${isEn ? 'en' : 'es'}`;
  const text = [
    hello,
    '',
    isEn
      ? 'Your account is ready. Any order placed with this email shows up there.'
      : 'Su cuenta está lista. Cualquier pedido hecho con este correo aparece ahí.',
    '',
    isEn
      ? 'You can buy again from your phone and see the photo of what you ordered. The address you type at checkout is saved for next time.'
      : 'Puede comprar de nuevo desde el teléfono y ver la foto de lo que pidió. La dirección que escribe en el checkout queda guardada para la próxima.',
    '',
    accountUrl,
  ].join('\n');
  const html = emailShell({
    lang: isEn ? 'en' : 'es',
    title: isEn ? 'Your account is ready' : 'Su cuenta está lista',
    subtitle: isEn
      ? 'Orders, buy again, and your shipping address, in one place.'
      : 'Pedidos, comprar de nuevo y su dirección de envío, en un solo lugar.',
    body: `
      <p style="margin:0 0 12px;font-size:16px;">${hello}</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">${isEn
        ? 'Any order placed with this email shows up in your account.'
        : 'Cualquier pedido hecho con este correo aparece en su cuenta.'}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">${isEn
        ? 'You can buy again from your phone and see the product photo. The address you type at checkout is saved for the next order.'
        : 'Puede comprar de nuevo desde el teléfono y ver la foto del producto. La dirección que escribe en el checkout queda guardada para el próximo pedido.'}</p>
      <p style="margin:0;text-align:center;">
        <a href="${accountUrl}" style="display:inline-block;background:#BF4F0B;color:#ffffff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:12px;">${isEn ? 'Open my account' : 'Abrir mi cuenta'}</a>
      </p>
    `,
  });

  return { subject, text, html };
}
