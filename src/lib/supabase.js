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
  // Check if session has a failed/stale refresh token
  supabase.auth.getSession().then(({ error }) => {
    if (error && (
      error.message.includes('Refresh Token Not Found') || 
      error.message.includes('invalid_grant') || 
      error.message.includes('Invalid Refresh Token')
    )) {
      console.warn("Supabase: Stale refresh token detected. Clearing auth storage.");
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-'))
        .forEach(k => localStorage.removeItem(k));
      supabase.auth.signOut().catch(() => {});
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return;
    if (event === 'SIGNED_OUT' || !session) {
      // Wipe any stale sb- keys from localStorage
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-'))
        .forEach(k => localStorage.removeItem(k));
    }
  });
}
