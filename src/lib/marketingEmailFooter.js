import { LIVE_SITE_URL } from '@/lib/publicUrl';

export const MARKETING_FOOTER_MARKER = 'data-costa-email-footer';

const PLACEHOLDERS = {
  currentYear: '[CURRENT_YEAR]',
  preferencesUrl: '[PREFERENCES_URL]',
  unsubscribeUrl: '[UNSUBSCRIBE_URL]',
  viewEmailUrl: '[VIEW_EMAIL_URL]',
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function footerValues(options = {}) {
  const domain = String(options.domain || LIVE_SITE_URL).replace(/\/+$/, '');
  const unsubscribeUrl = options.unsubscribeUrl || `${domain}/unsubscribe`;
  return {
    currentYear: options.currentYear || new Date().getFullYear(),
    preferencesUrl: options.preferencesUrl || unsubscribeUrl,
    unsubscribeUrl,
    viewEmailUrl: options.viewEmailUrl || domain,
  };
}

export function buildMarketingEmailFooterHtml(options = {}) {
  const values = footerValues(options);
  return `
    <div ${MARKETING_FOOTER_MARKER}="true" style="background:#f4f4f5;border-top:1px solid #d4d4d8;padding:34px 20px;text-align:center;font-family:Arial,Helvetica,sans-serif;color:#3f4f46;font-size:13px;line-height:1.55;">
      <p style="margin:0 0 16px;">
        <a href="${escapeHtml(values.viewEmailUrl)}" style="color:#000000;text-decoration:underline;">View email in browser</a>
      </p>
      <p style="margin:0 0 14px;color:#4f6f62;">
        Copyright &copy; ${escapeHtml(values.currentYear)} Peptides Costa Rica. All Rights Reserved.
      </p>
      <p style="margin:0 0 16px;color:#111827;">
        Peptides Costa Rica<br>
        San Jose, Costa Rica
      </p>
      <p style="margin:0;">
        <a href="${escapeHtml(values.preferencesUrl)}" style="color:#000000;text-decoration:underline;">update your preferences</a>
        <span style="color:#111827;"> or </span>
        <a href="${escapeHtml(values.unsubscribeUrl)}" style="color:#000000;text-decoration:underline;">unsubscribe</a>
      </p>
    </div>
  `;
}

export function buildMarketingEmailFooterTemplateHtml() {
  return buildMarketingEmailFooterHtml({
    currentYear: PLACEHOLDERS.currentYear,
    preferencesUrl: PLACEHOLDERS.preferencesUrl,
    unsubscribeUrl: PLACEHOLDERS.unsubscribeUrl,
    viewEmailUrl: PLACEHOLDERS.viewEmailUrl,
  });
}

export function applyMarketingEmailFooter(html, options = {}) {
  const values = footerValues(options);
  const withResolvedPlaceholders = String(html || '')
    .replaceAll(PLACEHOLDERS.currentYear, escapeHtml(values.currentYear))
    .replaceAll(PLACEHOLDERS.preferencesUrl, escapeHtml(values.preferencesUrl))
    .replaceAll(PLACEHOLDERS.unsubscribeUrl, escapeHtml(values.unsubscribeUrl))
    .replaceAll(PLACEHOLDERS.viewEmailUrl, escapeHtml(values.viewEmailUrl));

  if (withResolvedPlaceholders.includes(MARKETING_FOOTER_MARKER)) {
    return withResolvedPlaceholders;
  }

  const footer = buildMarketingEmailFooterHtml(values);
  if (/<\/body>/i.test(withResolvedPlaceholders)) {
    return withResolvedPlaceholders.replace(/<\/body>/i, `${footer}</body>`);
  }

  return `${withResolvedPlaceholders}${footer}`;
}
