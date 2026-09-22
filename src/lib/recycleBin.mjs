/**
 * The Bin: deleting anything from the admin puts it here first.
 *
 * Nothing a person deletes leaves the database straight away any more. The row
 * is copied into `deleted_records` whole, then removed from its own table, and
 * it sits in the Bin until it is either restored or ages out. A superadmin sets
 * how long that is, from the top of the Bin tab.
 *
 * Why a snapshot table rather than a `deleted_at` column on all 25 tables:
 * every read in the app would have needed `.is('deleted_at', null)` bolted on,
 * and the one query somebody forgot would quietly show deleted orders to a
 * customer. A snapshot leaves every existing query alone — a deleted row is
 * still genuinely gone from `orders`, it just also exists in the Bin.
 *
 * Machine housekeeping does NOT come here. A cart cleared the moment it turns
 * into an order, WhatsApp session keys rotating, a half-written lead rolled
 * back after a failed create — those are bookkeeping, not decisions, and
 * routing them here would bury the one order somebody actually needs back under
 * hundreds of rows a week. Only a person clicking Delete reaches this module.
 *
 * Free of `@/` imports so tests/ can load it under `node --test`.
 */

export const RECYCLE_BIN_SETTINGS_ID = 'recycle_bin';

/** Retention choices offered in the Bin tab. `null` days means never purge. */
export const RETENTION_CHOICES = [7, 14, 30, 60, 90, 180, 365];
export const DEFAULT_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every table a person can delete from, and how to describe a row once it is
 * out of its own table and sitting in the Bin as loose JSON.
 *
 * `labelFields` is a priority list, not a template: the first field present on
 * the row wins, and the second adds context if it is there. It has to work
 * against a row nobody can re-query, which is why the label is built and stored
 * at delete time rather than looked up when the Bin is opened.
 *
 * `children` names rows that must travel with the parent, or a restore brings
 * back an order with no items in it. Those are removed by the database's own
 * cascade, so the Bin has to hold its own copy to put them back.
 */
// Two deletes are deliberately NOT here:
//
//  * admin_profiles (Team Management). Removing a team member deletes their
//    Supabase auth user and the profile follows by cascade. Restoring the
//    profile alone would put back a row with no login behind it — a team member
//    who appears in every dropdown and cannot sign in. Re-inviting them is the
//    real undo, so the Bin does not pretend otherwise.
//
//  * customer_addresses. A customer deletes their own saved address from their
//    account page, which is not an admin action and has no admin session to
//    check — it needs a customer-side route of its own before it can be binned.
export const BIN_TABLES = {
  orders: {
    type: 'Order',
    permission: 'orders',
    labelFields: ['order_number', 'customer_name', 'customer_email'],
    // No children: an order's lines live in its own items column, and there is
    // no order_items table (listing one made every order delete fail).
  },
  products: {
    type: 'Product',
    permission: 'spreadsheet',
    labelFields: ['name', 'slug'],
  },
  product_reviews: {
    type: 'Review',
    permission: 'reviews',
    labelFields: ['reviewer_name', 'product_name', 'title'],
  },
  blogs: {
    type: 'Blog post',
    permission: 'cms',
    labelFields: ['title', 'slug'],
  },
  promo_codes: {
    type: 'Promo code',
    permission: 'affiliates',
    labelFields: ['code', 'description'],
  },
  affiliates: {
    type: 'Affiliate',
    permission: 'affiliates',
    labelFields: ['name', 'email', 'referral_code'],
    // Deleting an affiliate takes their promo codes with it, so the codes have
    // to be in the snapshot — otherwise a restore gives back an affiliate
    // whose codes have silently stopped working.
    children: [{ table: 'promo_codes', foreignKey: 'affiliate_id' }],
  },
  catalog_leads: {
    type: 'Lead',
    permission: 'leads',
    labelFields: ['name', 'phone', 'email'],
  },
  customer_inquiries: {
    type: 'Inquiry',
    permission: 'inquiries',
    labelFields: ['name', 'subject', 'email'],
  },
  abandoned_carts: {
    type: 'Abandoned cart',
    permission: 'carts',
    labelFields: ['customer_name', 'customer_phone', 'customer_email'],
    // The Carts tab selects rows by session_id, not by primary key, so the
    // delete has to be allowed to match on it. Allow-listed rather than taken
    // from the request, or a caller could name any column it liked.
    altIdColumns: ['session_id'],
  },
  email_campaigns: {
    type: 'Email campaign',
    permission: 'marketing',
    labelFields: ['name', 'subject'],
  },
  email_templates: {
    type: 'Campaign template',
    permission: 'marketing',
    labelFields: ['name', 'subject'],
  },
  scheduled_broadcasts: {
    type: 'Scheduled broadcast',
    permission: 'broadcasts',
    labelFields: ['name', 'title', 'message'],
  },
  marketing_journeys: {
    type: 'Journey',
    permission: 'marketing',
    labelFields: ['name', 'description'],
  },
  email_subscribers: {
    type: 'Subscriber',
    permission: 'marketing',
    labelFields: ['email', 'name'],
  },
  sales_prospects: {
    type: 'Prospect',
    permission: 'prospects',
    labelFields: ['name', 'company', 'phone'],
  },
  commission_payouts: {
    type: 'Commission payout',
    permission: 'affiliates',
    labelFields: ['affiliate_name', 'period_label', 'period_start'],
  },
  notification_recipients: {
    type: 'Notification recipient',
    permission: 'team',
    labelFields: ['name', 'email', 'phone'],
  },
  crm_customer_profiles: {
    type: 'Customer profile',
    permission: 'customers',
    labelFields: ['customer_name', 'customer_phone', 'customer_email'],
  },
  facebook_notifications: {
    type: 'Facebook alert',
    permission: 'facebook',
    labelFields: ['title', 'message'],
  },
  whatsapp_conversations: {
    type: 'WhatsApp conversation',
    permission: 'whatsapp_ai',
    labelFields: ['contact_name', 'phone', 'wa_id'],
  },
  live_chat_conversations: {
    type: 'Live chat',
    permission: 'live_chat',
    labelFields: ['visitor_name', 'visitor_email', 'id'],
    children: [{ table: 'live_chat_messages', foreignKey: 'conversation_id' }],
  },
};

/** Is this a table the Bin knows how to hold and restore? */
export function isBinnableTable(table) {
  return Object.prototype.hasOwnProperty.call(BIN_TABLES, String(table || ''));
}

/**
 * PostgREST does not send Postgres's 42P01 when the Bin table is missing —
 * it sends PGRST205 / "schema cache". The list used to treat that as a generic
 * failure and show "Could not read the Bin" instead of asking for the SQL.
 */
export function isMissingDeletedRecordsTable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');
  return code === '42P01'
    || code === 'PGRST205'
    || (/deleted_records/i.test(message) && /does not exist|schema cache|could not find/i.test(message));
}

export const DELETED_RECORDS_MIGRATION_HINT =
  'The Bin table does not exist yet. Run add-recycle-bin.sql in the Supabase SQL editor, then refresh this tab.';

export function binTableConfig(table) {
  return BIN_TABLES[String(table || '')] || null;
}

/** Child tables that must be snapshotted alongside the parent row. */
export function childTablesFor(table) {
  return binTableConfig(table)?.children || [];
}

/**
 * A one-line description of a row, built while the row is still readable.
 *
 * Trimmed to 120 characters because a scheduled broadcast's label falls back to
 * its whole message body, and an untrimmed one turns the Bin list into a wall.
 */
export function describeRecord(table, row) {
  const config = binTableConfig(table);
  const fields = config?.labelFields || ['name', 'title', 'email', 'id'];
  const parts = [];

  for (const field of fields) {
    const value = row?.[field];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (!text || parts.includes(text)) continue;
    parts.push(text);
    if (parts.length === 2) break;
  }

  if (parts.length === 0) {
    const fallback = row?.id ? `#${row.id}` : 'Untitled record';
    return fallback.slice(0, 120);
  }
  return parts.join(' — ').slice(0, 120);
}

/** The friendly noun shown in the Bin's Type column. */
export function recordTypeFor(table) {
  return binTableConfig(table)?.type || String(table || 'Record');
}

/** The admin module a binned row belongs to, for the permission check. */
export function permissionFor(table) {
  return binTableConfig(table)?.permission || null;
}

/**
 * Which tables a given person may see in the Bin.
 *
 * The Bin is one list holding rows out of every module, so without this a
 * sales agent with `leads` would open it and read the customer names, phone
 * numbers and addresses copied out of every deleted order — data the Orders tab
 * already keeps from them. An item is visible only to someone who could have
 * seen it before it was deleted.
 *
 * `canAccess` is passed in rather than imported so this module stays pure and
 * loadable under `node --test`; the routes hand it resolveAdminTabAccess.
 */
export function visibleTablesFor(canAccess) {
  return Object.keys(BIN_TABLES).filter((table) => {
    const permission = permissionFor(table);
    return permission ? Boolean(canAccess(permission)) : false;
  });
}

/**
 * Which column a delete may match on for this table.
 *
 * Always the primary key, plus anything the table's own screen selects by.
 * A request naming anything else is refused rather than passed to the query
 * builder — the column name goes straight into the delete, so it cannot come
 * from the browser unchecked.
 */
export function allowedIdColumns(table) {
  const config = binTableConfig(table);
  if (!config) return [];
  return ['id', ...(config.altIdColumns || [])];
}

export function isAllowedIdColumn(table, column) {
  return allowedIdColumns(table).includes(String(column || 'id'));
}

/** Can this person restore or erase this particular entry? */
export function canTouchEntry(entry, canAccess) {
  const permission = permissionFor(entry?.source_table);
  return permission ? Boolean(canAccess(permission)) : false;
}

/**
 * Read the stored retention setting.
 *
 * A missing or damaged row reads as the 30-day default rather than as "never",
 * so a setting nobody has touched still clears itself out. `days: null` means
 * never purge, and is only ever reached by someone choosing it explicitly.
 */
export function readRetention(value) {
  const hasKey = Boolean(value) && Object.prototype.hasOwnProperty.call(value, 'retention_days');
  const raw = value?.retention_days;

  if (hasKey && raw === null) {
    return {
      days: null,
      neverPurge: true,
      updatedAt: value?.updated_at || null,
      updatedBy: value?.updated_by || null,
    };
  }

  const days = Number(raw);
  const valid = Number.isFinite(days) && days > 0;
  return {
    days: valid ? Math.floor(days) : DEFAULT_RETENTION_DAYS,
    neverPurge: false,
    updatedAt: value?.updated_at || null,
    updatedBy: value?.updated_by || null,
  };
}

/**
 * Check a retention a superadmin picked.
 *
 * Anything under a day is refused: "0 days" reads as "off" to the person
 * choosing it, but would mean every delete is erased by the next purge run —
 * the exact opposite of what the Bin is for.
 */
export function validateRetention(input) {
  if (input === null || input === 'never') {
    return { ok: true, days: null, neverPurge: true };
  }

  const days = typeof input === 'string' ? Number(input.trim()) : Number(input);
  if (!Number.isFinite(days) || !Number.isInteger(days)) {
    return { ok: false, error: 'Pick a whole number of days.' };
  }
  if (days < 1) {
    return { ok: false, error: 'The Bin has to keep things for at least one day.' };
  }
  if (days > 3650) {
    return { ok: false, error: 'Ten years is the longest the Bin will hold anything.' };
  }
  return { ok: true, days, neverPurge: false };
}

/**
 * When an entry is due to be erased.
 *
 * Worked out from `deleted_at` every time rather than stamped onto the row at
 * delete time, so changing the setting applies to what is already in the Bin
 * too. Stamping it meant lengthening retention did nothing for the very items
 * the person was lengthening it to protect.
 */
export function purgeDateFor(deletedAt, retention) {
  if (!retention || retention.neverPurge || !retention.days) return null;
  const started = new Date(deletedAt);
  if (Number.isNaN(started.getTime())) return null;
  return new Date(started.getTime() + retention.days * DAY_MS);
}

/**
 * How an entry should read in the Bin list.
 *
 * `daysLeft` is rounded up, so an item with four hours to go says "1 day left"
 * rather than "0 days left" while it is still restorable.
 */
export function summarizeEntry(entry, retention, now = new Date()) {
  const deletedAt = entry?.deleted_at || null;
  const purgeAt = purgeDateFor(deletedAt, retention);
  const restored = Boolean(entry?.restored_at);

  if (!purgeAt) {
    return { purgeAt: null, daysLeft: null, expired: false, restored, neverPurge: true };
  }

  const msLeft = purgeAt.getTime() - new Date(now).getTime();
  return {
    purgeAt,
    daysLeft: Math.max(0, Math.ceil(msLeft / DAY_MS)),
    expired: msLeft <= 0,
    restored,
    neverPurge: false,
  };
}

/** Entries the purge job should erase: past their date, and not already restored. */
export function selectExpired(entries, retention, now = new Date()) {
  if (!retention || retention.neverPurge || !retention.days) return [];
  return (entries || []).filter((entry) => {
    if (entry?.restored_at) return false;
    return summarizeEntry(entry, retention, now).expired;
  });
}
