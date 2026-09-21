export const BIN_ENTITY_TYPES = ['order', 'lead', 'cart', 'inquiry'];

export const BIN_RESTORE_TABLES = {
  order: 'orders',
  lead: 'catalog_leads',
  cart: 'abandoned_carts',
  inquiry: 'customer_inquiries',
};

export function isKnownBinEntity(entityType) {
  return BIN_ENTITY_TYPES.includes(String(entityType || ''));
}

export function isMissingBinTable(error) {
  const message = String(error?.message || error || '');
  const code = String(error?.code || '');
  return code === '42P01'
    || /relation .*admin_bin/i.test(message)
    || (message.includes('admin_bin') && /does not exist|schema cache/i.test(message));
}

function firstLine(value, limit = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function summarizeBinItem(entityType, row = {}) {
  if (entityType === 'order') {
    const number = row.order_number ? `#${row.order_number}` : 'Order';
    const name = firstLine(row.customer_name);
    const status = firstLine(row.status);
    return [number, name, status].filter(Boolean).join(' · ');
  }
  if (entityType === 'lead') {
    const name = firstLine(row.name) || 'Lead';
    const contact = firstLine(row.phone || row.email || row.contact_value);
    const status = firstLine(row.status);
    return [name, contact, status].filter(Boolean).join(' · ');
  }
  if (entityType === 'cart') {
    const name = firstLine(row.customer_name) || 'Abandoned cart';
    const contact = firstLine(row.customer_phone || row.customer_email);
    const status = firstLine(row.status);
    return [name, contact, status].filter(Boolean).join(' · ');
  }
  if (entityType === 'inquiry') {
    const name = firstLine(row.name) || 'Inquiry';
    const contact = firstLine(row.email || row.phone);
    const preview = firstLine(row.message, 48);
    return [name, contact, preview && `"${preview}"`].filter(Boolean).join(' · ');
  }
  return firstLine(row.id) || 'Deleted item';
}

export function buildBinRecord({ entityType, row, deletedBy, extras = null }) {
  const type = String(entityType || '').trim();
  if (!isKnownBinEntity(type)) {
    throw new Error(`Unknown bin entity: ${type || '(empty)'}`);
  }
  if (!row || typeof row !== 'object') {
    throw new Error('A row snapshot is required before something can go in the bin');
  }
  const entityId = String(row.id || row.session_id || '').trim();
  if (!entityId) {
    throw new Error('The snapshot has no id to restore against');
  }
  return {
    entity_type: type,
    entity_id: entityId,
    summary: summarizeBinItem(type, row),
    payload: {
      table: BIN_RESTORE_TABLES[type],
      row,
      extras: extras || null,
    },
    deleted_by: deletedBy ? String(deletedBy) : null,
  };
}

export async function stashInBin(supabase, { entityType, rows, deletedBy, extras = null }) {
  const list = (Array.isArray(rows) ? rows : [rows]).filter(Boolean);
  if (list.length === 0) return { ok: true, count: 0, ids: [] };

  const records = list.map((row) => buildBinRecord({ entityType, row, deletedBy, extras }));
  const { data, error } = await supabase.from('admin_bin').insert(records).select('id');
  if (error) {
    if (isMissingBinTable(error)) {
      console.warn('[admin-bin] admin_bin is not installed; delete continues without a restore copy. Run add-admin-bin.sql.');
      return { ok: true, skipped: true, count: 0, ids: [] };
    }
    return { ok: false, error };
  }
  return { ok: true, count: data?.length || 0, ids: (data || []).map((entry) => entry.id) };
}

export function restoreTarget(item) {
  const type = item?.entity_type;
  const table = item?.payload?.table || BIN_RESTORE_TABLES[type];
  const row = item?.payload?.row;
  if (!isKnownBinEntity(type) || !table || !row || typeof row !== 'object') {
    return null;
  }
  return { table, row, entityType: type };
}
