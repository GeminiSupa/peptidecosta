import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = supabaseUrl && supabaseAnonKey;

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

const isStaleAuthError = (error) => {
  const msg = error?.message || '';
  return (
    msg.includes('Refresh Token Not Found') ||
    msg.includes('invalid_grant') ||
    msg.includes('Invalid Refresh Token')
  );
};

const isBenignSupabaseAuthNoise = (value) => {
  const msg = typeof value === 'string' ? value : value?.message || String(value || '');
  if (typeof msg !== 'string') return false;
  return (
    isStaleAuthError({ message: msg }) ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError when attempting to fetch resource') ||
    msg.includes('Load failed')
  );
};

const clearSupabaseAuthStorage = () => {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('sb-'))
    .forEach((k) => localStorage.removeItem(k));
};

// Auto-clear stale tokens so the console error doesn't repeat every page load
if (supabase && typeof window !== 'undefined') {
  // Suppress known Supabase auth noise (stale tokens, offline refresh attempts)
  const _originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    const msg = args[0]?.message || args[0] || '';
    if (
      isBenignSupabaseAuthNoise(msg) || 
      (typeof msg === 'string' && msg.includes('bis_skin_checked'))
    ) {
      return;
    }
    _originalConsoleError(...args);
  };

  // First-load check: clear any stale tokens immediately
  supabase.auth
    .getSession()
    .then(({ error }) => {
      if (error && isStaleAuthError(error)) {
        clearSupabaseAuthStorage();
        supabase.auth.signOut().catch(() => {});
      }
    })
    .catch(() => {
      // Network unreachable (ad blocker, offline, etc.) — ignore on first load
    });

  // Runtime listener: handle background token refresh failures
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return;
    if (event === 'TOKEN_REFRESH_FAILED' || (event === 'SIGNED_OUT' && !session)) {
      clearSupabaseAuthStorage();
    }
  });
}

