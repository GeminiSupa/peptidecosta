const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const COSTA_RICA_PHONE_PATTERN = /(?:\+?506[\s().-]*)?[24678]\d{3}[\s().-]*\d{4}/g;

const unique = (values, limit = 10) => [...new Set(values.filter(Boolean))].slice(0, limit);

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
  if (digits.length === 8) return `+506 ${digits.slice(0, 4)} ${digits.slice(4)}`;
  if (digits.length === 11 && digits.startsWith('506')) return `+506 ${digits.slice(3, 7)} ${digits.slice(7)}`;
  return null;
}

export function extractPublishedContacts(html, pageUrl) {
  const decoded = decodeBasicEntities(html);
  const withoutNoise = decoded
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ');
  const visibleText = withoutNoise.replace(/<[^>]+>/g, ' ');

  const mailtoEmails = [...decoded.matchAll(/href\s*=\s*["']mailto:([^?"'#\s]+)/gi)]
    .map((match) => decodeURIComponent(match[1]).toLowerCase());
  const textEmails = visibleText.match(EMAIL_PATTERN)?.map((email) => email.toLowerCase()) || [];
  const emails = unique([...mailtoEmails, ...textEmails]
    .filter((email) => !/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email)), 8);

  const telPhones = [...decoded.matchAll(/href\s*=\s*["'](tel:[^"']+)/gi)]
    .map((match) => normalizePhone(match[1]));
  const textPhones = (visibleText.match(COSTA_RICA_PHONE_PATTERN) || []).map(normalizePhone);
  const phones = unique([...telPhones, ...textPhones], 8);

  const contactLinks = [];
  for (const match of decoded.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], pageUrl);
      if (url.origin !== new URL(pageUrl).origin) continue;
      if (!/(contact|contacto|about|nosotros|equipo|team)/i.test(`${url.pathname}${url.search}`)) continue;
      contactLinks.push(url.toString());
    } catch {
      // Ignore malformed links found in third-party HTML.
    }
  }

  return { emails, phones, contactLinks: unique(contactLinks, 4) };
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
