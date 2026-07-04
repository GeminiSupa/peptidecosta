export const ADMIN_MODULES = [
  { id: 'home', label: 'Today (Home)', title: 'Today', group: 'Overview', alwaysAvailable: true },
  { id: 'spreadsheet', label: 'Products', title: 'Products', group: 'Core Operations' },
  { id: 'orders', label: 'Orders', title: 'Orders', group: 'Core Operations' },
  { id: 'customers', label: 'Customers', title: 'Customers', group: 'Core Operations' },
  { id: 'inquiries', label: 'Inquiries', title: 'Inquiries', group: 'Core Operations' },
  { id: 'leads', label: 'Leads', title: 'Leads', group: 'Core Operations' },
  { id: 'carts', label: 'Abandoned Carts', title: 'Abandoned Carts', group: 'Sales & Marketing' },
  { id: 'share', label: 'Share Links', title: 'Share Links', group: 'Sales & Marketing' },
  { id: 'reviews', label: 'Reviews', title: 'Reviews', group: 'Sales & Marketing' },
  { id: 'facebook', label: 'FB Alerts', title: 'FB Alerts', group: 'Sales & Marketing' },
  { id: 'messenger', label: 'Facebook', title: 'Facebook', group: 'Sales & Marketing', alwaysAvailable: true },
  { id: 'marketing', label: 'Marketing Studio', title: 'Marketing Studio', group: 'Sales & Marketing' },
  { id: 'affiliates', label: 'Affiliates & Promotions', title: 'Affiliates', group: 'Sales & Marketing' },
  { id: 'broadcasts', label: 'Broadcasts', title: 'Broadcasts', group: 'Sales & Marketing' },
  { id: 'analytics', label: 'Analytics', title: 'Analytics & Conversions', group: 'Analytics & Content' },
  { id: 'cms', label: 'Content (CMS)', title: 'CMS Editor', group: 'Analytics & Content' },
  { id: 'whatsapp_ai', label: 'Sales WhatsApp', title: 'Sales WhatsApp', group: 'System & AI' },
  { id: 'wa_session', label: 'WA Session (2nd Device)', title: 'WA Session (2nd Device)', group: 'System & AI' },
  { id: 'team', label: 'Team Management', title: 'Team Management', group: 'System & AI', superadminOnly: true },
  { id: 'team_chat', label: 'Team Chat', title: 'Team Chat', group: 'System & AI', alwaysAvailable: true },
];

export const ASSIGNABLE_ADMIN_MODULES = ADMIN_MODULES.filter(
  (module) => !module.alwaysAvailable && !module.superadminOnly
);

export const ADMIN_TAB_IDS = new Set(ADMIN_MODULES.map((module) => module.id));

export const ADMIN_TAB_TITLES = Object.fromEntries(
  ADMIN_MODULES.map((module) => [module.id, module.title])
);

export const ADMIN_NAV_GROUPS = ['Overview', 'Core Operations', 'Sales & Marketing', 'Analytics & Content', 'System & AI']
  .map((title) => ({
    title,
    tabs: ADMIN_MODULES.filter((module) => module.group === title).map((module) => module.id),
  }));

export const SUPERADMIN_ONLY_TAB_IDS = new Set(
  ADMIN_MODULES.filter((module) => module.superadminOnly).map((module) => module.id)
);

export const ALWAYS_AVAILABLE_TAB_IDS = new Set(
  ADMIN_MODULES.filter((module) => module.alwaysAvailable).map((module) => module.id)
);
