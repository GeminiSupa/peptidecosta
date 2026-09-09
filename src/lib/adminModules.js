// Relative rather than the '@/lib' alias so tests/ can import this module
// directly under `node --test`, which does not resolve jsconfig paths.
import {
  SUB_USER_TAB_IDS,
  isActiveProfile,
  isSubUser,
} from './subUserTier.mjs';

export const ADMIN_MODULES = [
  { id: 'home', label: 'Today (Home)', title: 'Today', group: 'Overview', alwaysAvailable: true },
  { id: 'orders', label: 'Orders', title: 'Orders', group: 'Core Operations' },
  // Orders a sales agent has handed off to be packed. Superadmin-only for now
  // because Omer is the only one packing — widen this the day someone else
  // does too.
  { id: 'fulfillment', label: 'Fulfillment', title: 'Fulfillment', group: 'Core Operations' },
  { id: 'live_chat', label: 'Live Chat', title: 'Live Chat', group: 'Core Operations' },
  // Leads sits directly under Live Chat: chats are where leads now come from,
  // so the two are worked together.
  { id: 'leads', label: 'Leads', title: 'Leads', group: 'Core Operations' },
  { id: 'prospects', label: 'Prospector', title: 'Prospector', group: 'Sales & Marketing' },
  { id: 'carts', label: 'Carts', title: 'Carts', group: 'Sales & Marketing' },
  { id: 'spreadsheet', label: 'Products', title: 'Products', group: 'Core Operations', superadminOnly: true },
  { id: 'customers', label: 'Customers', title: 'Customers', group: 'Core Operations' },
  { id: 'inquiries', label: 'Inquiries', title: 'Inquiries', group: 'Core Operations' },
  { id: 'share', label: 'Share Links', title: 'Share Links', group: 'Sales & Marketing' },
  { id: 'reviews', label: 'Reviews', title: 'Reviews', group: 'Sales & Marketing' },
  { id: 'facebook', label: 'FB Alerts', title: 'Facebook Alerts', group: 'Sales & Marketing', hiddenFromNav: true },
  // Permission-gated rather than always-available. The Facebook inbox carries
  // customer conversations, and this tab was reachable by every active staff
  // profile whatever their permissions said — including an outside affiliate
  // given a login purely to watch their own commission.
  //
  // The API half was already written and already dead: adminApiPermissions maps
  // /api/messenger and /api/facebook to this key, but resolveAdminTabAccess
  // short-circuited to true for every staff member, so the rule never refused
  // anybody. Dropping the flag switches the tab and those routes on together.
  { id: 'messenger', label: 'Facebook Inbox', title: 'Facebook Inbox', group: 'Sales & Marketing' },
  { id: 'marketing', label: 'Marketing Studio', title: 'Marketing Studio', group: 'Sales & Marketing' },
  { id: 'affiliates', label: 'Affiliates', title: 'Affiliates & Promo Codes', group: 'Sales & Marketing' },
  { id: 'deals', label: 'Deal of the Week', title: 'Deal of the Week', group: 'Sales & Marketing' },
  { id: 'my_qr', label: 'My QR & Scans', title: 'My QR & Scans', group: 'Sales & Marketing', alwaysAvailable: true },
  // Every staff member recruits and tracks their own sub-users here — no
  // permission to tick first. The owner still gates the thing that costs money,
  // which is approval: an invite earns nobody anything until it is approved.
  //
  // alwaysAvailable is safe against the two-level cap because the tier check in
  // resolveAdminTabAccess runs BEFORE this flag is consulted, so a sub-user
  // still cannot reach My Team and still has no invite button.
  { id: 'my_team', label: 'My Team (Sub-Users)', title: 'My Team', group: 'Sales & Marketing', alwaysAvailable: true },
  { id: 'broadcasts', label: 'One-Time Announcements', title: 'One-Time Announcements', group: 'Sales & Marketing' },
  { id: 'analytics', label: 'Analytics', title: 'Analytics & Attribution', group: 'Analytics & Content' },
  { id: 'cms', label: 'CMS', title: 'CMS Drafts & Preview', group: 'Analytics & Content' },
  // The marketing site at peptidescostarica.net, rebuilt in the separate
  // peptidecostarica-website repo. Read-only status today: it links out and
  // reports what has been built. It is the seat the CMS editor takes over when
  // the site_cms_* tables land, so the nav entry and permission key exist from
  // the start and staff access does not have to be reassigned later.
  { id: 'website', label: 'Website', title: 'Marketing Website', group: 'Analytics & Content' },
  { id: 'whatsapp_ai', label: 'Sales WhatsApp', title: 'Sales WhatsApp', group: 'System & AI' },
  { id: 'wa_session', label: 'WhatsApp Device', title: 'WhatsApp Device', group: 'System & AI' },
  { id: 'team', label: 'Team Management', title: 'Team Management', group: 'System & AI', superadminOnly: true },
  // Sandbox card payments. The panel and its route existed for a while with
  // nothing mounting them, so there was no way to reach it from the dashboard.
  { id: 'payment_test', label: 'Payment Test', title: 'Payment Test (Sandbox)', group: 'System & AI', superadminOnly: true },
  // Permission-gated for the same reason as messenger: internal staff talk is
  // not something a login handed to an outside partner should open by default.
  //
  // Hiding the tab is only half of it. TeamChat.js reads team_messages straight
  // from the browser client, so the row-level policy is what actually decides
  // who can read the thread — see restrict-messenger-team-chat-access.sql.
  { id: 'team_chat', label: 'Team Chat', title: 'Team Chat', group: 'System & AI' },
  // A sub-user's entire dashboard: this plus my_qr, and nothing else.
  // Deliberately NOT hiddenFromNav — the mobile "More" sheet is built from
  // ADMIN_NAV_GROUPS, which drops hidden modules, and hiding this one left a
  // sub-user on a phone with no way back to their own earnings screen. Staff
  // never see it regardless, because resolveAdminTabAccess gates it by tier.
  { id: 'my_earnings', label: 'My Earnings', title: 'My Earnings', group: 'Overview', subUserOnly: true },
];

export const ASSIGNABLE_ADMIN_MODULES = ADMIN_MODULES.filter(
  (module) => !module.alwaysAvailable && !module.superadminOnly && !module.subUserOnly
);

export const ASSIGNABLE_ADMIN_MODULE_IDS = new Set(
  ASSIGNABLE_ADMIN_MODULES.map((module) => module.id)
);

export const ADMIN_TAB_IDS = new Set(ADMIN_MODULES.map((module) => module.id));

export const ADMIN_TAB_TITLES = Object.fromEntries(
  ADMIN_MODULES.map((module) => [module.id, module.title])
);

export const ADMIN_MODULE_LABELS = Object.fromEntries(
  ADMIN_MODULES.map((module) => [module.id, module.label])
);

export const ADMIN_NAV_GROUPS = ['Overview', 'Core Operations', 'Sales & Marketing', 'Analytics & Content', 'System & AI']
  .map((title) => ({
    title,
    tabs: ADMIN_MODULES.filter((module) => module.group === title && !module.hiddenFromNav).map((module) => module.id),
  }));

export const SUPERADMIN_ONLY_TAB_IDS = new Set(
  ADMIN_MODULES.filter((module) => module.superadminOnly).map((module) => module.id)
);

export const ALWAYS_AVAILABLE_TAB_IDS = new Set(
  ADMIN_MODULES.filter((module) => module.alwaysAvailable).map((module) => module.id)
);

export const SUB_USER_ONLY_TAB_IDS = new Set(
  ADMIN_MODULES.filter((module) => module.subUserOnly).map((module) => module.id)
);

// Re-exported so callers have one import for tab access questions.
export { SUB_USER_TAB_IDS };

export function resolveAdminTabAccess(tabId, profile) {
  if (!profile || !ADMIN_TAB_IDS.has(tabId)) return false;

  // A pending or suspended account reaches nothing at all. Checked before
  // everything else so an approval that has not happened yet cannot be
  // sidestepped by an alwaysAvailable tab.
  if (!isActiveProfile(profile)) return false;

  // Sub-users get a closed allow-list, and this must stay ahead of the
  // ALWAYS_AVAILABLE branch below — home, messenger (Facebook Inbox), my_qr
  // and team_chat are alwaysAvailable, so checking that first would drop a new
  // sub-user straight into the Facebook inbox and internal team chat.
  //
  // The list also has no 'my_team', which is the UI half of the two-level cap:
  // a sub-user has no invite button to find.
  if (isSubUser(profile)) return SUB_USER_TAB_IDS.has(tabId);

  if (ALWAYS_AVAILABLE_TAB_IDS.has(tabId)) return true;
  if (SUPERADMIN_ONLY_TAB_IDS.has(tabId)) return Boolean(profile.is_superadmin);

  // my_earnings is the sub-user screen; staff and superadmins read the same
  // numbers on Today/My Pay.
  if (SUB_USER_ONLY_TAB_IDS.has(tabId)) return false;

  if (profile.is_superadmin) return true;

  return Array.isArray(profile.permissions) && profile.permissions.includes(tabId);
}

export function getDefaultAdminTab(profile) {
  if (!profile) return 'home';
  if (isSubUser(profile)) return 'my_earnings';
  if (profile.is_superadmin) return 'home';
  if (Array.isArray(profile.permissions) && profile.permissions.includes('home')) return 'home';
  const firstAllowedPermission = Array.isArray(profile.permissions)
    ? profile.permissions.find((tabId) => resolveAdminTabAccess(tabId, profile))
    : null;
  return firstAllowedPermission || 'home';
}
