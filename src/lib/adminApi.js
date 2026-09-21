import { supabase } from '@/lib/supabase';

/** Attach the current Supabase session token to admin API requests. */
export async function getAdminAuthHeaders(extraHeaders = {}) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('Not authenticated');
  }

  return {
    ...extraHeaders,
    Authorization: `Bearer ${token}`,
  };
}

/** Authenticated fetch wrapper for /api/admin/* routes. */
export async function adminFetch(url, options = {}) {
  const headers = await getAdminAuthHeaders(options.headers || {});
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (hasBody && !isFormData && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, { ...options, headers });
}

/**
 * Delete something from the dashboard by moving it to the Bin.
 *
 * Use this instead of `supabase.from(table).delete()` in any admin screen. A
 * browser delete cannot write the Bin snapshot — `deleted_records` is
 * service-role only — so going direct is what makes a record unrecoverable.
 *
 * Throws with the server's own wording on failure, so call sites can surface
 * the reason (a foreign key still pointing at the row, usually) rather than a
 * generic "could not delete".
 */
export async function deleteToBin(table, ids, { reason = null, idColumn = 'id' } = {}) {
  const response = await adminFetch('/api/admin/recycle-bin/delete', {
    method: 'POST',
    body: JSON.stringify({ table, ids: Array.isArray(ids) ? ids : [ids], reason, idColumn }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Could not delete that.');
  }
  return data;
}
