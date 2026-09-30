// One staff test account that can sign in without an email code.
//
// The switch is ACCOUNT_TEST_LOGIN=true on the server. Anything else, including
// the variable being missing, keeps the route closed. The address is fixed so
// the button cannot be pointed at a real customer's inbox.

export const ACCOUNT_TEST_EMAIL = 'account-test@peptidescostarica.net';

export function isAccountTestLoginEnabled(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

export function isAccountTestEmail(email) {
  return String(email ?? '').trim().toLowerCase() === ACCOUNT_TEST_EMAIL;
}
