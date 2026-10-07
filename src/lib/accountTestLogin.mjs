// One staff test account that can sign in without an email code.
//
// The switch is ACCOUNT_TEST_LOGIN=true on the server. Anything else, including
// the variable being missing, keeps the route closed. The address is fixed so
// the button cannot be pointed at a real customer's inbox.

export const ACCOUNT_TEST_EMAIL = 'account-test@peptidescostarica.net';

export function isAccountTestLoginEnabled(value, environment = {}) {
  const switchedOn = String(value ?? '').trim().toLowerCase() === 'true';
  if (!switchedOn) return false;

  // This endpoint returns a real Supabase session without proving mailbox
  // ownership. It is useful for local QA and isolated preview deployments, but
  // it must never become a production back door because somebody left the
  // feature flag enabled. Vercel runs previews with NODE_ENV=production, so its
  // more precise deployment environment wins when it is available.
  const vercelEnv = String(
    environment.vercelEnv ?? process.env.VERCEL_ENV ?? '',
  ).trim().toLowerCase();
  if (vercelEnv) return vercelEnv !== 'production';

  const nodeEnv = String(
    environment.nodeEnv ?? process.env.NODE_ENV ?? '',
  ).trim().toLowerCase();
  return nodeEnv !== 'production';
}

export function isAccountTestEmail(email) {
  return String(email ?? '').trim().toLowerCase() === ACCOUNT_TEST_EMAIL;
}
