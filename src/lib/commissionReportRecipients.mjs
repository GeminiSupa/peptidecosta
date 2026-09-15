import { stripOwnerAddress } from './orderEmailAddressing.mjs';

const splitEmails = (value = '') => String(value || '')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);

const emailKey = (value) => String(value || '').trim().toLowerCase();

const isActive = (profile) => {
  const status = String(profile?.status || '').trim().toLowerCase();
  return status !== 'pending' && status !== 'suspended';
};

/**
 * Build the visible audience for commission summaries and approved-report CCs.
 *
 * Active superadmins are included from the team records, so granting that role
 * is enough to give a sales manager oversight. A configured address belonging
 * to a known regular agent is deliberately removed: a stale environment value
 * must not let one employee receive everybody else's pay information.
 * Unknown configured addresses are retained for shared operational inboxes.
 */
export function buildCommissionAdminRecipients(profiles = [], configured = '') {
  const profileByEmail = new Map(
    (profiles || [])
      .filter((profile) => emailKey(profile?.email))
      .map((profile) => [emailKey(profile.email), profile])
  );

  const recipients = splitEmails(configured).filter((email) => {
    const profile = profileByEmail.get(emailKey(email));
    return !profile || (profile.is_superadmin === true && isActive(profile));
  });

  for (const profile of profiles || []) {
    if (profile?.is_superadmin === true && isActive(profile) && emailKey(profile.email)) {
      recipients.push(profile.email.trim());
    }
  }

  const seen = new Set();
  const unique = recipients.filter((email) => {
    const key = emailKey(email);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return stripOwnerAddress(unique);
}
