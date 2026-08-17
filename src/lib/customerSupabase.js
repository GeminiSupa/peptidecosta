'use client';

import { createClient } from '@supabase/supabase-js';

// Storefront customers and dashboard staff are both Supabase Auth users on the
// same project, so they would share one persisted session if they shared one
// client. The shared client in src/lib/supabase.js already holds the staff
// session under the default storage key; signing a customer in through it would
// overwrite whatever admin session the browser was holding, and vice versa.
//
// A second client with its own storage key keeps the two independent: a staff
// member can be signed into /admin and /account at the same time, and a
// customer signing out never disturbs the dashboard.
const CUSTOMER_STORAGE_KEY = 'sb-customer-auth-token';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isCustomerAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client = null;

/**
 * The browser client that holds the customer session.
 *
 * Created lazily so importing this module during a server render never touches
 * localStorage.
 */
export function getCustomerSupabase() {
  if (!isCustomerAuthConfigured) return null;
  if (client) return client;

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: CUSTOMER_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      // Login is a six-digit code typed back into the form, not a link that
      // lands on the site carrying tokens in the URL fragment.
      detectSessionInUrl: false,
    },
  });

  return client;
}

/** Current access token, or null when signed out. Used to authorize API calls. */
export async function getCustomerAccessToken() {
  const supabase = getCustomerSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}
