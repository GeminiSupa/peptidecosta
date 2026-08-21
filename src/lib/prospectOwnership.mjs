/** Normalize the legacy email-based owner key until ownership moves to user IDs. */
export function normalizeProspectOwnerEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 240);
}

export function prospectOwnerState(ownerEmail, currentEmail) {
  const owner = normalizeProspectOwnerEmail(ownerEmail);
  const current = normalizeProspectOwnerEmail(currentEmail);
  if (!owner) return 'unassigned';
  if (current && owner === current) return 'mine';
  return 'other';
}

/** Short enough for a list chip; the full address remains available as a title. */
export function prospectOwnerLabel(ownerEmail, currentEmail, { compact = false } = {}) {
  const owner = normalizeProspectOwnerEmail(ownerEmail);
  const state = prospectOwnerState(owner, currentEmail);
  if (state === 'unassigned') return 'Unassigned';
  if (state === 'mine') return 'You';
  if (!compact) return owner;
  return owner.split('@')[0] || owner;
}
