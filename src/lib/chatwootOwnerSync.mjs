/**
 * Make the CRM owner follow whoever is actually working the chat in Chatwoot.
 *
 * Google Ads chats are handed to Chatwoot deliberately unassigned, and Chatwoot
 * gives them to an agent itself. Until now nothing told the CRM who that was:
 * the column meant to carry it is written by a Chatwoot webhook that has never
 * fired on this account - every lead has a null `chatwoot_last_event_at`. So a
 * lead could read "Dani" in the CRM while Kattia answered every message, and
 * the commission followed the name in the CRM.
 *
 * This closes that by reading Chatwoot rather than waiting to be called, so it
 * needs nothing configured inside Chatwoot.
 *
 * What it will not do:
 *  - touch a lead whose chat Chatwoot shows as unassigned. Nobody has taken it,
 *    so there is nothing truer than what the CRM already says.
 *  - hand a lead to an address that is not an active internal agent. An
 *    affiliate login sits in admin_profiles like anyone else, and a Chatwoot
 *    seat could belong to someone outside the business.
 *  - touch a conversation it did not actually see in this run.
 */

import { isActiveProfile, isInternalStaff } from './subUserTier.mjs';

const lower = (value) => String(value ?? '').trim().toLowerCase();

/**
 * Build the CRM agent name for each Chatwoot login, skipping anyone who must
 * not be given a lead.
 */
export function ownerNameByChatwootEmail(profiles) {
  const map = new Map();
  for (const profile of profiles || []) {
    const email = lower(profile?.email);
    const name = String(profile?.name || profile?.email || '').trim();
    if (!email || !name) continue;
    if (!isInternalStaff(profile) || !isActiveProfile(profile)) continue;
    map.set(email, name.slice(0, 160));
  }
  return map;
}

/**
 * Decide what to change. Pure, so the rules can be tested without Chatwoot or
 * the database.
 *
 * `assignees` is { [conversationId]: { name, email } } as Chatwoot reports it.
 */
export function planChatwootOwnerUpdates({ leads = [], assignees = {}, profiles = [] } = {}) {
  const ownerByEmail = ownerNameByChatwootEmail(profiles);
  const updates = [];
  const skipped = { unassigned: 0, notSeen: 0, alreadyCorrect: 0, unknownAgent: [] };

  for (const lead of leads) {
    const conversationId = lead?.chatwoot_conversation_id;
    if (!conversationId) continue;

    const live = assignees[String(conversationId)];
    if (!live) { skipped.notSeen += 1; continue; }

    const email = lower(live.email);
    if (!email) { skipped.unassigned += 1; continue; }

    const ownerName = ownerByEmail.get(email);
    if (!ownerName) {
      // Worth surfacing rather than swallowing: a Chatwoot seat with no active
      // internal profile means somebody is working leads the CRM cannot credit.
      skipped.unknownAgent.push(email);
      continue;
    }

    if (lower(lead.sales_agent) === lower(ownerName)) {
      skipped.alreadyCorrect += 1;
      continue;
    }

    updates.push({
      id: lead.id,
      from: lead.sales_agent || null,
      to: ownerName,
      email,
      conversationId,
    });
  }

  return { updates, skipped };
}

/** The columns one update writes. */
export function chatwootOwnerColumns(update, at = new Date().toISOString()) {
  return {
    sales_agent: update.to,
    chatwoot_assignee_name: update.to,
    chatwoot_assignee_email: update.email,
    ownership_updated_at: at,
    // Says in the row itself why the owner changed, so a reassignment nobody
    // remembers making can be traced back to Chatwoot rather than to a person.
    ownership_updated_by: 'system:chatwoot_sync',
  };
}
