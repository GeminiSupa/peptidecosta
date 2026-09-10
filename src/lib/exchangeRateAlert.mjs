/**
 * Tell somebody when the USD/CRC feed has been down long enough to matter.
 *
 * The storefront prices in colones off a rate fetched from an outside provider.
 * When every provider is unreachable the site does not stop working — it keeps
 * charging the last rate that was actually verified, which is the right thing
 * to do for a customer mid-checkout and the wrong thing to do quietly for a
 * week. The rate drifts, the shop under- or over-charges by a little more each
 * day, and nothing on the site looks broken.
 *
 * So the failure has to leave the machine. After two days on one frozen number
 * this mails the owner, once a day, until the feed comes back.
 *
 * Deliberately not a hard stop: refusing to price the shop because a currency
 * API is down would cost far more than a slightly stale rate.
 */

import nodemailer from 'nodemailer';

import { getTransactionalSmtpConfig, readEnv } from './transactionalSmtp.js';

/** How stale the rate has to be before anyone is woken up. */
export const EXCHANGE_RATE_ALERT_AFTER_MS = 48 * 60 * 60 * 1000;

/** One mail a day. The feed being down is not news twice before lunch. */
export const EXCHANGE_RATE_ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const EXCHANGE_RATE_ALERT_SETTING_ID = 'exchange_rate_alert';

export const EXCHANGE_RATE_ALERT_RECIPIENT = 'omerforce@gmail.com';

export function exchangeRateAlertSubject(ageMs) {
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  return `IMPORTANT: USD/CRC exchange rate has not updated in ${days} day${days === 1 ? '' : 's'}`;
}

export function exchangeRateAlertBody({ rate, updatedAt, ageMs, source }) {
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  return [
    'The USD to CRC exchange rate feed is not answering.',
    '',
    `Last good rate:   ₡${rate} per USD`,
    `Last updated:     ${updatedAt || 'unknown'} (${hours} hours ago)`,
    `Last good source: ${source || 'unknown'}`,
    '',
    'The shop is still open and is still pricing in colones. It is using the',
    'last rate above, which is the last one a provider actually confirmed. It',
    'is NOT using a hardcoded number.',
    '',
    'What this means: colón prices are frozen at that rate and will drift',
    'further from the real rate every day until the feed returns.',
    '',
    'What to check:',
    '  1. Is the CurrencyFreaks API key still valid and the account in credit?',
    '     (CURRENCYFREAKS_API_KEY)',
    '  2. Is the keyless backup provider reachable?',
    '',
    'This email repeats once a day while the feed stays down.',
  ].join('\n');
}

/**
 * Whether enough time has passed to send again.
 *
 * Split out so the decision can be tested without a mail server, and so a
 * failure to record a send can never turn into a mail loop: an unreadable
 * marker is treated as "already sent recently".
 */
export function shouldSendExchangeRateAlert({ ageMs, lastAlertAt, now = Date.now() }) {
  if (!Number.isFinite(ageMs) || ageMs < EXCHANGE_RATE_ALERT_AFTER_MS) return false;
  if (!lastAlertAt) return true;
  const previous = Date.parse(lastAlertAt);
  if (!Number.isFinite(previous)) return false;
  return now - previous >= EXCHANGE_RATE_ALERT_INTERVAL_MS;
}

/**
 * Send the alert if it is due. Never throws: this runs inside the pricing path,
 * and a checkout must not fail because a warning email could not be sent.
 */
export async function maybeAlertStaleExchangeRate(supabase, stale, {
  createTransport = (config) => nodemailer.createTransport(config),
  now = Date.now(),
} = {}) {
  try {
    if (!supabase || !stale) return { sent: false, reason: 'nothing-to-report' };

    const { data: marker } = await supabase
      .from('site_settings')
      .select('value')
      .eq('id', EXCHANGE_RATE_ALERT_SETTING_ID)
      .maybeSingle();

    if (!shouldSendExchangeRateAlert({
      ageMs: stale.ageMs,
      lastAlertAt: marker?.value?.last_alert_at || null,
      now,
    })) {
      return { sent: false, reason: 'not-due' };
    }

    const smtp = getTransactionalSmtpConfig();
    if (!smtp.configured) return { sent: false, reason: 'smtp-not-configured' };

    const fromEmail = readEnv('ORDER_NOTIFICATION_FROM_EMAIL') || smtp.user;
    const transporter = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    await transporter.sendMail({
      from: readEnv('ORDER_NOTIFICATION_FROM') || `Peptides Costa Rica <${fromEmail}>`,
      to: EXCHANGE_RATE_ALERT_RECIPIENT,
      subject: exchangeRateAlertSubject(stale.ageMs),
      text: exchangeRateAlertBody(stale),
    });

    // Written after the send, so a send that failed is retried on the next
    // request rather than suppressed for a day by a marker nothing earned.
    await supabase.from('site_settings').upsert({
      id: EXCHANGE_RATE_ALERT_SETTING_ID,
      value: {
        last_alert_at: new Date(now).toISOString(),
        rate: stale.rate,
        rate_updated_at: stale.updatedAt || null,
      },
      updated_at: new Date(now).toISOString(),
    });

    return { sent: true };
  } catch (err) {
    console.error('[exchange-rate] Stale-rate alert failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}
