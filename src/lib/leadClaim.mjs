import { emailKey, phoneKey } from './agentAttribution.mjs';

export function normalizeLeadIdentities({ email, phone } = {}) {
  const normalizedEmail = emailKey(email);
  const normalizedPhone = phoneKey(phone);
  return [
    normalizedEmail ? { identity_type: 'email', identity_value: normalizedEmail } : null,
    normalizedPhone ? { identity_type: 'phone', identity_value: normalizedPhone } : null,
  ].filter(Boolean);
}

export function leadActorName(profile, fallbackEmail = '') {
  return String(profile?.name || profile?.email || fallbackEmail || '').trim();
}

export function decideClaimOwner({
  existingOwner = '',
  historicalOwner = '',
  actorOwner = '',
  requestedOwner = '',
  isSuperadmin = false,
} = {}) {
  const existing = String(existingOwner || '').trim();
  const historical = String(historicalOwner || '').trim();
  const actor = String(actorOwner || '').trim();
  const requested = String(requestedOwner || '').trim();

  if (existing) return { owner: existing, source: 'existing', canClaim: false };
  if (historical) return { owner: historical, source: 'order_history', canClaim: false };

  return {
    owner: isSuperadmin && requested ? requested : actor,
    source: 'first_claim',
    canClaim: true,
  };
}

export function mayTransferLead({
  currentOwner = '',
  historicalOwner = '',
  targetOwner = '',
  actorOwner = '',
  isSuperadmin = false,
} = {}) {
  const current = String(currentOwner || '').trim();
  const historical = String(historicalOwner || '').trim();
  const target = String(targetOwner || '').trim();
  const actor = String(actorOwner || '').trim();

  if (isSuperadmin) {
    const effectiveOwner = current || historical;
    return { allowed: true, requiresReason: Boolean(effectiveOwner && effectiveOwner !== target) };
  }
  if (current || historical) return { allowed: false, reason: 'owned' };
  if (!actor || target !== actor) return { allowed: false, reason: 'self_only' };
  return { allowed: true, requiresReason: false };
}
