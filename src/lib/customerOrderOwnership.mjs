export class CustomerSessionError extends Error {
  constructor(message = 'Invalid customer session') {
    super(message);
    this.name = 'CustomerSessionError';
    this.status = 401;
  }
}

export function readBearerToken(authorizationHeader) {
  const header = String(authorizationHeader || '').trim();
  if (!header) return null;

  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new CustomerSessionError('Malformed customer authorization header');
  return match[1];
}

export async function resolveCustomerOrderOwner(authClient, authorizationHeader) {
  const token = readBearerToken(authorizationHeader);
  if (!token) return null;

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw new CustomerSessionError('Customer session is expired or invalid');
  }

  return {
    id: data.user.id,
    email: String(data.user.email || '').trim().toLowerCase() || null,
  };
}

// Ownership is server-derived. A browser may never choose a user id for an
// order, even when the submitted id happens to match its current session.
export function applyCustomerOrderOwnership(submittedOrder, customerUserId) {
  const { customer_user_id: _untrustedCustomerUserId, ...order } = submittedOrder || {};
  return customerUserId ? { ...order, customer_user_id: customerUserId } : order;
}

