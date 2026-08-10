const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const INTERNATIONAL_PHONE_PATTERN = /(?:(?:\+|00)\d{1,3}[\s().-]*)?(?:\d[\s().-]*){7,14}\d/g;

// Digit runs on a business page are far more often a tax ID, an order number or
// a price range than a phone number, and a wrong number here gets dialled.
// A candidate has to look like a phone before it is treated as one.
const GROUPED_PHONE_PATTERN = /^\d{2,4}(?:[\s.\-()]{1,3}\d{2,4}){1,5}$/;
const NUMBER_RANGE_PATTERN = /\d\s+-\s+\d/;
const PHONE_CONTEXT_PATTERN = /(tel|phone|whatsapp|whats\s?app|m[oó]vil|mobile|celular|cel\b|tel[eé]fono|fono|call us|ll[aá]ma|contact)/i;

// Website builders, error trackers and doc placeholders publish addresses that
// belong to the vendor, not to the business being prospected.
const PLATFORM_EMAIL_DOMAINS = [
  'wixpress.com', 'wix.com', 'squarespace.com', 'godaddy.com', 'wordpress.com',
  'wordpress.org', 'shopify.com', 'weebly.com', 'jimdo.com', 'webflow.com',
  'sentry.io', 'sentry-next.wixpress.com', 'schema.org', 'w3.org',
  'example.com', 'example.org', 'example.net', 'domain.com', 'yourdomain.com',
  'yoursite.com', 'company.com', 'email.com', 'sentry.wixpress.com',
];
const UNREACHABLE_LOCAL_PARTS = /^(?:no-?reply|do-?not-?reply|mailer-daemon|bounce|postmaster|abuse|dmarc|privacy)/i;
const ROLE_LOCAL_PARTS = /^(?:info|contact|contacto|hello|hola|ventas|sales|office|oficina|reception|recepcion|team|equipo|admin|hi|mail)/i;

const unique = (values, limit = 10) => [...new Set(values.filter(Boolean))].slice(0, limit);

/** One entry per actual number, whichever formatting was published first. */
export const dedupePhoneDigits = (values, limit = 10) => {
  const seen = new Set();
  const out = [];
  for (const value of values.filter(Boolean)) {
    const digits = String(value).replace(/\D/g, '');
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
};

const registrableHost = (hostname) => String(hostname || '').toLowerCase().replace(/^www\./, '');

/**
 * mailto: hrefs and schema.org fields routinely carry a subject or body along
 * with the address ("info@x.cr?subject=i have a question").
 */
export function sanitizePublishedEmail(value) {
  const address = String(value || '')
    .replace(/^mailto:/i, '')
    .split(/[?&#\s]/)[0]
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address) ? address : null;
}

/** Collapse the same profile published with and without a trailing slash. */
function normalizeProfileUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    const path = url.pathname.replace(/\/+$/, '');
    if (!path) return null;
    return `${url.protocol}//${url.hostname.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

function isUsableEmail(email) {
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email)) return false;
  const domain = email.split('@')[1] || '';
  return !PLATFORM_EMAIL_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

/** Rank published addresses so the prospect's own inbox wins over stray ones. */
export function rankEmails(emails, pageUrl) {
  let pageHost = '';
  try {
    pageHost = registrableHost(new URL(pageUrl).hostname);
  } catch {
    pageHost = '';
  }
  const score = (email) => {
    const [localPart, domain = ''] = email.split('@');
    let value = 0;
    if (pageHost && (domain === pageHost || domain.endsWith(`.${pageHost}`) || pageHost.endsWith(`.${domain}`))) value += 100;
    if (ROLE_LOCAL_PARTS.test(localPart)) value += 20;
    if (UNREACHABLE_LOCAL_PARTS.test(localPart)) value -= 60;
    return value;
  };
  return emails
    .map((email, index) => ({ email, index, score: score(email) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.email);
}

function textPhoneCandidates(visibleText) {
  const found = [];
  for (const match of visibleText.matchAll(INTERNATIONAL_PHONE_PATTERN)) {
    const candidate = match[0].trim();
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) continue;
    if (NUMBER_RANGE_PATTERN.test(candidate)) continue;

    if (/^(?:\+|00)/.test(candidate)) {
      found.push(candidate);
      continue;
    }
    if (GROUPED_PHONE_PATTERN.test(candidate)) {
      found.push(candidate);
      continue;
    }
    // A bare digit run only counts when the surrounding copy calls it a phone.
    const lead = visibleText.slice(Math.max(0, match.index - 40), match.index);
    if (digits.length <= 12 && PHONE_CONTEXT_PATTERN.test(lead)) found.push(candidate);
  }
  return found;
}

function decodeBasicEntities(value) {
  return String(value || '')
    .replace(/&#64;|&commat;/gi, '@')
    .replace(/&#46;|&period;/gi, '.')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function normalizePhone(value) {
  const raw = decodeBasicEntities(value).replace(/^tel:/i, '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.length === 11 && digits.startsWith('506')) return `+506 ${digits.slice(3, 7)} ${digits.slice(7)}`;
  return raw.startsWith('+') || raw.startsWith('00') ? `+${digits.replace(/^00/, '')}` : digits;
}

/**
 * Cloudflare rewrites published addresses to a hex blob to defeat scrapers.
 * The first byte is the XOR key for the rest, so the address the business chose
 * to publish is still recoverable without guessing anything.
 */
export function decodeCloudflareEmail(hex) {
  const value = String(hex || '').trim().toLowerCase();
  if (!/^[0-9a-f]{6,}$/.test(value) || value.length % 2) return null;
  const key = parseInt(value.slice(0, 2), 16);
  let decoded = '';
  for (let index = 2; index < value.length; index += 2) {
    decoded += String.fromCharCode(parseInt(value.slice(index, index + 2), 16) ^ key);
  }
  // Cloudflare also encodes the full mailto target, so the decoded value can
  // carry a ?subject= tail with the spaces still percent-escaped.
  return sanitizePublishedEmail(decoded);
}

/** Undo the "info (at) example (dot) com" spelling businesses use publicly. */
export function deobfuscateEmailText(text) {
  return String(text || '')
    .replace(/\s*[[({<]\s*(?:at|arroba)\s*[\])}>]\s*/gi, '@')
    .replace(/\s+(?:at|arroba)\s+/gi, '@')
    .replace(/\s*[[({<]\s*(?:dot|punto)\s*[\])}>]\s*/gi, '.')
    .replace(/\s+(?:dot|punto)\s+/gi, '.');
}

/**
 * Click-to-chat links a business publishes on its own site. Group invites
 * (chat.whatsapp.com) and vanity short links carry no number, so they are
 * skipped rather than half-parsed.
 */
export function extractWhatsAppNumbers(html) {
  const found = [];
  const push = (raw) => {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) found.push(`+${digits}`);
  };
  for (const match of html.matchAll(/(?:https?:)?\/\/(?:www\.)?wa\.me\/(\+?\d[\d\s-]*)/gi)) push(match[1]);
  for (const match of html.matchAll(/(?:api|web)\.whatsapp\.com\/send[^"'\s]*?[?&]phone=(\+?[\d%2B\s-]+)/gi)) {
    push(decodeURIComponent(match[1]));
  }
  for (const match of html.matchAll(/whatsapp:\/\/send[^"'\s]*?[?&]phone=(\+?[\d%2B\s-]+)/gi)) {
    push(decodeURIComponent(match[1]));
  }
  return unique(found, 5);
}

/**
 * schema.org LocalBusiness/Organization blocks. This is the cleanest contact
 * data on a modern site and it lives inside <script>, so it has to be read
 * before the tag stripper runs.
 */
export function extractStructuredContacts(html) {
  const emails = [];
  const phones = [];
  const profiles = [];
  // schema.org values are routinely arrays ("sameAs": [...]), so the key has to
  // travel with the recursion or every array member loses its meaning.
  const collect = (key, value) => {
    if (key === 'email') emails.push(sanitizePublishedEmail(value));
    if (key === 'telephone' || key === 'faxnumber') phones.push(value.trim());
    if (key === 'sameas' || key === 'url') profiles.push(normalizeProfileUrl(value));
  };
  const walk = (node, depth = 0, key = '') => {
    if (!node || depth > 8) return;
    if (typeof node === 'string') {
      if (key) collect(key, node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry) => walk(entry, depth + 1, key));
      return;
    }
    if (typeof node !== 'object') return;
    for (const [childKey, value] of Object.entries(node)) {
      walk(value, depth + 1, childKey.toLowerCase());
    }
  };
  for (const match of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(match[1].trim()));
    } catch {
      // Hand-written JSON-LD is frequently malformed; skip the block.
    }
  }
  return { emails: unique(emails, 8), phones: unique(phones, 8), profiles: unique(profiles, 12) };
}

/** Public social profiles the business links from its own pages. */
export function extractSocialProfiles(html, pageUrl) {
  const profiles = [];
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1], pageUrl);
      const host = url.hostname.replace(/^www\./, '').toLowerCase();
      if (!/^(instagram\.com|facebook\.com|fb\.com|m\.facebook\.com)$/.test(host)) continue;
      if (/^\/(sharer|share|plugins|tr|dialog)/i.test(url.pathname)) continue;
      profiles.push(normalizeProfileUrl(url.toString()));
    } catch {
      // Ignore malformed links found in third-party HTML.
    }
  }
  return unique(profiles, 8);
}

export function htmlToVisibleText(html) {
  return decodeBasicEntities(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractPublishedContacts(html, pageUrl) {
  const decoded = decodeBasicEntities(html);
  // Structured data and obfuscated addresses have to be read from the raw
  // markup, before <script> and tag stripping throw them away.
  const structured = extractStructuredContacts(decoded);
  const whatsappNumbers = extractWhatsAppNumbers(decoded);
  const socialProfiles = extractSocialProfiles(decoded, pageUrl);
  const cloudflareEmails = [
    ...[...decoded.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)].map((match) => match[1]),
    ...[...decoded.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)].map((match) => match[1]),
  ].map(decodeCloudflareEmail).filter(Boolean);
  const visibleText = deobfuscateEmailText(htmlToVisibleText(decoded));

  const mailtoEmails = [...decoded.matchAll(/href\s*=\s*["']mailto:([^"'\s]+)/gi)]
    .map((match) => sanitizePublishedEmail(decodeURIComponent(match[1])))
    .filter((email) => email && isUsableEmail(email));
  const textEmails = (visibleText.match(EMAIL_PATTERN) || [])
    .map((email) => email.toLowerCase())
    .filter(isUsableEmail);
  // Explicitly published first: mailto, then schema.org, then Cloudflare, then
  // whatever the body copy happens to contain.
  const publishedEmails = unique([
    ...mailtoEmails,
    ...structured.emails.filter((email) => email && isUsableEmail(email)),
    ...cloudflareEmails.filter(isUsableEmail),
  ], 8);
  const emails = rankEmails(unique([...publishedEmails, ...textEmails], 8), pageUrl);

  // The same number is routinely published as "+506 8935 2112" in a tel: link
  // and "+50689352112" in a wa.me link. Dedupe on digits, not on formatting.
  const telPhones = dedupePhoneDigits([
    ...[...decoded.matchAll(/href\s*=\s*["'](tel:[^"']+)/gi)].map((match) => normalizePhone(match[1])),
    ...structured.phones.map(normalizePhone),
  ], 8);
  const textPhones = textPhoneCandidates(visibleText).map(normalizePhone);
  const phones = dedupePhoneDigits([...telPhones, ...whatsappNumbers, ...textPhones], 8);

  const contactLinks = [];
  const linkedinUrls = [];
  for (const match of decoded.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], pageUrl);
      if (/(^|\.)linkedin\.com$/i.test(url.hostname) && /^\/in\//i.test(url.pathname)) {
        linkedinUrls.push(url.toString().split('?')[0]);
        continue;
      }
      if (url.origin !== new URL(pageUrl).origin) continue;
      if (!/(contact|contacto|about|nosotros|equipo|team|staff|leadership|founder|director|doctor|provider)/i.test(`${url.pathname}${url.search}`)) continue;
      contactLinks.push(url.toString());
    } catch {
      // Ignore malformed links found in third-party HTML.
    }
  }

  return {
    emails,
    phones,
    whatsappNumbers,
    socialProfiles: unique([...socialProfiles, ...structured.profiles.filter((url) => /instagram\.com|facebook\.com/i.test(url))], 8),
    // Contacts the page marked up as contacts. Only these justify treating the
    // business as reachable; a regex hit in body copy does not.
    linkedEmails: publishedEmails,
    linkedPhones: dedupePhoneDigits([...telPhones, ...whatsappNumbers], 8),
    linkedinUrls: unique(linkedinUrls, 20),
    contactLinks: unique(contactLinks, 6),
    visibleText,
  };
}

export function isPublicNetworkAddress(address) {
  const value = String(address || '').toLowerCase();
  if (!value) return false;
  if (value === '::' || value === '::1') return false;
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return false;
  if (value.startsWith('ff')) return false;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped || (/^\d+\.\d+\.\d+\.\d+$/.test(value) ? value : null);
  if (!ipv4) return true;

  const parts = ipv4.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return !(
    a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && [0, 168].includes(b))
    || (a === 198 && [18, 19].includes(b))
    || a >= 224
  );
}
