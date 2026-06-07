import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cbanvzipzfmllexraiei.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiYW52emlwemZtbGxleHJhaWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5OTA2MTAsImV4cCI6MjA5NDU2NjYxMH0.mPpEUZJ5m1cI0Ds-NlE7_EUB41oroPyvD1thnikthQc';

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

// Auto-clear stale tokens so the console error doesn't repeat every page load
if (supabase && typeof window !== 'undefined') {
  // Suppress only the specific "Refresh Token Not Found" console error from Supabase internals
  const _originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    const msg = args[0]?.message || args[0] || '';
    if (
      typeof msg === 'string' &&
      (msg.includes('Invalid Refresh Token') || msg.includes('Refresh Token Not Found'))
    ) {
      return; // Silently swallow this specific error
    }
    _originalConsoleError(...args);
  };

  // First-load check: clear any stale tokens immediately
  supabase.auth.getSession().then(({ error }) => {
    if (error && (
      error.message.includes('Refresh Token Not Found') ||
      error.message.includes('invalid_grant') ||
      error.message.includes('Invalid Refresh Token')
    )) {
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-'))
        .forEach(k => localStorage.removeItem(k));
      supabase.auth.signOut().catch(() => {});
    }
  });

  // Runtime listener: handle background token refresh failures
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return;
    if (
      event === 'TOKEN_REFRESH_FAILED' ||
      event === 'SIGNED_OUT' ||
      !session
    ) {
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-'))
        .forEach(k => localStorage.removeItem(k));
    }
  });
}

