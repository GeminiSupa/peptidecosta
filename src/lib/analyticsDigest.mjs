/**
 * The weekly analytics digest.
 *
 * The best analytics screen is one nobody has to remember to open. This turns
 * the same figures the tab shows into an email, so the week arrives rather than
 * being fetched.
 *
 * Deliberately pure: the route gathers the data and sends the mail, and
 * everything about what the digest says and how it reads is decided here, where
 * it can be tested without a database or an SMTP server.
 */

import { periodDelta } from './analyticsDashboard.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

export const formatUsd = (value) => `$${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const formatCount = (value) => Number(value || 0).toLocaleString('en-US');

/**
 * A change, written the way it should be read aloud.
 *
 * "up 12.4%" beats "+12.4%" in a sentence, and growth from nothing is "new"
 * rather than an infinite percentage nobody can scale.
 */
export function describeDelta(delta) {
  if (!delta) return { text: 'no comparison', direction: 'flat' };
  if (delta.isNew) return { text: 'new this week', direction: 'up' };
  if (delta.direction === 'flat' || delta.percent === null) return { text: 'unchanged', direction: 'flat' };
  const word = delta.direction === 'up' ? 'up' : 'down';
  return { text: `${word} ${Math.abs(delta.percent)}%`, direction: delta.direction };
}

/**
 * Turn a week and the week before it into the lines of a digest.
 *
 * `goodWhenDown` marks the rows where a fall is the good news — abandoned cart
 * value and opt-outs — so the email can colour them without a reader having to
 * remember which way each one runs.
 */
export function buildAnalyticsDigest({ current = {}, previous = {}, listHealth = {}, topCampaign = null, topProducts = [] } = {}) {
  const rows = [
    {
      key: 'revenue',
      label: 'Revenue',
      value: formatUsd(current.revenueUsd),
      delta: describeDelta(periodDelta(current.revenueUsd, previous.revenueUsd)),
      detail: `${formatCount(current.orders)} completed ${Number(current.orders) === 1 ? 'order' : 'orders'}`,
    },
    {
      key: 'aov',
      label: 'Average order value',
      value: formatUsd(current.aovUsd),
      delta: describeDelta(periodDelta(current.aovUsd, previous.aovUsd)),
      detail: 'Net of refunds',
    },
    {
      key: 'conversion',
      label: 'Conversion rate',
      value: `${round2(current.conversionRate)}%`,
      delta: describeDelta(periodDelta(current.conversionRate, previous.conversionRate)),
      detail: `${formatCount(current.visitors)} sessions`,
    },
    {
      key: 'carts',
      label: 'Left in abandoned carts',
      value: formatUsd(current.abandonedUsd),
      delta: describeDelta(periodDelta(current.abandonedUsd, previous.abandonedUsd)),
      detail: `${formatCount(current.abandonedCarts)} open`,
      goodWhenDown: true,
    },
  ];

  const list = {
    joined: Number(listHealth.added || 0),
    left: Number(listHealth.optedOut || 0),
    net: Number(listHealth.added || 0) - Number(listHealth.optedOut || 0),
    subscribed: Number(listHealth.subscribed || 0),
  };

  return {
    rows,
    list,
    topCampaign,
    topProducts: (topProducts || []).slice(0, 3),
    // The one line worth reading if nothing else is.
    headline: headlineFor(rows[0], current),
  };
}

function headlineFor(revenueRow, current) {
  if (Number(current.orders || 0) === 0) {
    return 'No orders were completed last week.';
  }
  const { text } = revenueRow.delta;
  if (text === 'no comparison') return `${revenueRow.value} from ${formatCount(current.orders)} orders.`;
  if (text === 'unchanged') return `${revenueRow.value}, level with the week before.`;
  if (text === 'new this week') return `${revenueRow.value} — the first week with sales.`;
  return `${revenueRow.value}, ${text} on the week before.`;
}

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const DIRECTION_COLOUR = { up: '#15803d', down: '#b91c1c', flat: '#64748b' };
const ARROW = { up: '▲', down: '▼', flat: '■' };

/**
 * The digest as an email.
 *
 * Table layout and inline styles on purpose: this has to survive Gmail and
 * Outlook, neither of which can be relied on for grid, flex, or a stylesheet.
 * Direction is carried by a word and an arrow as well as by colour.
 */
export function renderAnalyticsDigestEmail(digest, { rangeLabel = 'last week', dashboardUrl = '' } = {}) {
  const row = ({ label, value, delta, detail, goodWhenDown }) => {
    const good = delta.direction === 'flat' ? 'flat' : (delta.direction === 'up') !== Boolean(goodWhenDown) ? 'up' : 'down';
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">${escapeHtml(label)}</div>
          <div style="font-size:22px;font-weight:700;color:#0f172a;">${escapeHtml(value)}</div>
          <div style="font-size:12px;color:#64748b;">${escapeHtml(detail)}</div>
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #e2e8f0;white-space:nowrap;vertical-align:bottom;">
          <span style="font-size:13px;font-weight:700;color:${DIRECTION_COLOUR[good]};">${ARROW[delta.direction]} ${escapeHtml(delta.text)}</span>
        </td>
      </tr>`;
  };

  const campaign = digest.topCampaign
    ? `<p style="margin:18px 0 0;font-size:14px;color:#334155;">Best campaign: <strong>${escapeHtml(digest.topCampaign.name)}</strong> — ${escapeHtml(formatUsd(digest.topCampaign.revenueUsd))} from ${formatCount(digest.topCampaign.orders)} ${Number(digest.topCampaign.orders) === 1 ? 'order' : 'orders'}.</p>`
    : '<p style="margin:18px 0 0;font-size:14px;color:#64748b;">No campaign earned an order last week.</p>';

  const products = digest.topProducts.length > 0
    ? `<p style="margin:10px 0 0;font-size:14px;color:#334155;">Most viewed: ${digest.topProducts.map((product) => escapeHtml(product.name)).join(', ')}.</p>`
    : '';

  const listLine = digest.list.subscribed > 0 || digest.list.joined > 0
    ? `<p style="margin:10px 0 0;font-size:14px;color:#334155;">List: <strong>${formatCount(digest.list.joined)}</strong> joined, <strong>${formatCount(digest.list.left)}</strong> left, ${digest.list.net >= 0 ? 'net +' : 'net '}${formatCount(digest.list.net)} — now ${formatCount(digest.list.subscribed)} subscribed.</p>`
    : '';

  const link = dashboardUrl
    ? `<p style="margin:22px 0 0;"><a href="${escapeHtml(dashboardUrl)}" style="color:#0369a1;font-size:14px;">Open the analytics tab</a></p>`
    : '';

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
    <tr><td>
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Costa Peptides · ${escapeHtml(rangeLabel)}</div>
      <h1 style="margin:6px 0 2px;font-size:19px;color:#0f172a;">${escapeHtml(digest.headline)}</h1>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
        ${digest.rows.map(row).join('')}
      </table>
      ${campaign}
      ${products}
      ${listLine}
      ${link}
      <p style="margin:22px 0 0;font-size:11px;color:#94a3b8;">Revenue is net of refunds, the same figure the analytics tab shows.</p>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    digest.headline,
    '',
    ...digest.rows.map((entry) => `${entry.label}: ${entry.value} (${entry.delta.text}) — ${entry.detail}`),
    '',
    digest.topCampaign
      ? `Best campaign: ${digest.topCampaign.name} — ${formatUsd(digest.topCampaign.revenueUsd)} from ${digest.topCampaign.orders} orders.`
      : 'No campaign earned an order last week.',
    `List: ${digest.list.joined} joined, ${digest.list.left} left, net ${digest.list.net}.`,
  ].join('\n');

  return {
    subject: `Costa Peptides weekly: ${digest.headline}`,
    html,
    text,
  };
}
