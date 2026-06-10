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
  if (hasBody && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, { ...options, headers });
}
