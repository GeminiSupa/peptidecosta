import { resolveAdminTabAccess } from './adminModules.js';

const rules = [
  { pattern: /^\/api\/admin\/analytics-dashboard$/, permissions: ['analytics'] },
  { pattern: /^\/api\/admin\/abandoned-carts(?:\/|$)/, permissions: ['carts'] },
  { pattern: /^\/api\/abandoned-cart-whatsapp$/, permissions: ['carts'] },
  { pattern: /^\/api\/admin\/automations(?:\/|$)/, permissions: ['marketing'] },
  { pattern: /^\/api\/admin\/banners(?:\/|$)/, permissions: ['broadcasts'] },
  { pattern: /^\/api\/admin\/broadcast(?:\/|$)/, permissions: ['broadcasts'] },
  { pattern: /^\/api\/admin\/broadcasts(?:\/|$)/, permissions: ['broadcasts'] },
  { pattern: /^\/api\/whatsapp\/broadcast$/, permissions: ['customers', 'broadcasts'] },
  { pattern: /^\/api\/admin\/campaigns(?:\/|$)/, permissions: ['marketing'] },
  { pattern: /^\/api\/admin\/campaign-templates(?:\/|$)/, permissions: ['marketing'] },
  { pattern: /^\/api\/admin\/subscribers(?:\/|$)/, permissions: ['marketing'] },
  { pattern: /^\/api\/admin\/journeys(?:\/|$)/, permissions: ['marketing'] },
  { pattern: /^\/api\/admin\/marketing-(?:intelligence|safety|segments)(?:\/|$)/, permissions: ['marketing'] },
  { pattern: /^\/api\/admin\/prospects(?:\/|$)/, permissions: ['prospects'] },
  { pattern: /^\/api\/admin\/crm(?:\/|$)/, permissions: ['customers'] },
  { pattern: /^\/api\/admin\/customer-timeline$/, permissions: ['customers'] },
  { pattern: /^\/api\/admin\/deals(?:\/|$)/, permissions: ['deals'] },
  { pattern: /^\/api\/admin\/inquiries(?:\/|$)/, permissions: ['inquiries'] },
  { pattern: /^\/api\/admin\/live-chat(?:\/|$)/, permissions: ['live_chat'] },
  { pattern: /^\/api\/admin\/leads(?:\/|$)/, permissions: ['leads'] },
  { pattern: /^\/api\/admin\/orders(?:\/|$)/, permissions: ['orders'] },
  { pattern: /^\/api\/order-shipped-notification$/, permissions: ['orders'] },
  { pattern: /^\/api\/admin\/products(?:\/|$)/, permissions: ['spreadsheet'] },
  { pattern: /^\/api\/admin\/promo(?:\/|$)/, permissions: ['affiliates', 'broadcasts', 'deals'] },
  { pattern: /^\/api\/admin\/referral-stats$/, permissions: ['affiliates'] },
  { pattern: /^\/api\/admin\/sub-users(?:\/|$)/, permissions: ['my_team'] },
  { pattern: /^\/api\/admin\/notification-recipients(?:\/|$)/, permissions: ['team'] },
  { pattern: /^\/api\/admin\/whatsapp-analytics$/, permissions: ['whatsapp_ai'] },
  { pattern: /^\/api\/admin\/whatsapp-channels(?:\/|$)/, permissions: ['whatsapp_ai'] },
  { pattern: /^\/api\/admin\/whatsapp-conversations(?:\/|$)/, permissions: ['whatsapp_ai', 'wa_session'] },
  { pattern: /^\/api\/admin\/whatsapp-session(?:\/|$)/, permissions: ['wa_session'] },
  { pattern: /^\/api\/messenger(?:\/|$)/, permissions: ['messenger'] },
  { pattern: /^\/api\/facebook(?:\/|$)/, permissions: ['messenger'] },
  { pattern: /^\/api\/admin\/send-email$/, permissions: ['leads', 'customers', 'inquiries', 'marketing'] },
  { pattern: /^\/api\/whatsapp\/send$/, permissions: ['orders', 'carts', 'customers', 'leads', 'whatsapp_ai'] },
  { pattern: /^\/api\/whatsapp\/welcome$/, permissions: ['team', 'my_team'] },
];

export function adminPermissionsForPath(pathname = '') {
  const match = rules.find((rule) => rule.pattern.test(pathname));
  return match?.permissions || [];
}

export function profileHasAnyAdminPermission(profile, permissions = []) {
  const required = Array.isArray(permissions) ? permissions.filter(Boolean) : [permissions].filter(Boolean);
  if (required.length === 0) return true;
  return required.some((permission) => resolveAdminTabAccess(permission, profile));
}
