/**
 * Who may change who owns an order.
 *
 * The owner on an order (orders.sales_agent) decides who is paid for the sale.
 * Until this existed, any staff member could pick any name from the owner
 * dropdown on any order, paid or not. On 14 Sep 2026 a completed manual order
 * for a customer Dani had closed three times before was re-credited to a
 * different agent that way, and a 90-day look back found 33 orders whose owner
 * had been changed back and forth by staff.
 *
 * The rules, as the owner set them:
 *
 *  1. A returning customer belongs to the agent who first closed them, for as
 *     long as that agent is still on the team. Staff cannot take them.
 *  2. A new customer is fair game: anyone may claim an unowned order for
 *     themselves, but only while it is still waiting for payment.
 *  3. Every other change needs a superadmin. Staff send a request with a
 *     reason; a superadmin approves or rejects it. A superadmin changing an
 *     owner directly must give a reason when it replaces someone.
 *
 * Deliberately free of `@/` imports so tests/ can load it under `node --test`.
 */

import { isAwaitingPayment } from './orderAwaitingPayment.mjs';
import { isActiveProfile } from './subUserTier.mjs';

export const OWNER_REASON_MIN = 5;
export const OWNER_REASON_MAX = 500;

const text = (value) => String(value ?? '').trim();

export function sameOwner(left, right) {
  return text(left).toLowerCase() === text(right).toLowerCase();
}

export function cleanReason(value) {
  return text(value).slice(0, OWNER_REASON_MAX);
}

/** The name written to orders.sales_agent for this person. */
export function profileOwnerName(profile) {
  return text(profile?.name || profile?.email);
}

/**
 * The ways one person is written on an order: their name, their email, and
 * the part of the email before the @. Mirrors agentMatchKeys in agentOrders.js,
 * which cannot be imported here.
 */
function profileKeys(profile) {
  const keys = new Set();
  const name = text(profile?.name).toLowerCase();
  const email = text(profile?.email).toLowerCase();
  if (name) keys.add(name);
  if (email) {
    keys.add(email);
    const local = email.split('@')[0];
    if (local) keys.add(local);
  }
  return keys;
}

/**
 * The active team member an owner string refers to, or null.
 *
 * "Still works for us" means an active profile. Superadmins count — Dani sells
 * too, and her customers need the same protection. Someone suspended or
 * removed no longer holds their customers, so those become fair game again.
 */
export function findActiveProfile(profiles, owner) {
  const key = text(owner).toLowerCase();
  if (!key) return null;
  return (Array.isArray(profiles) ? profiles : [])
    .find((profile) => isActiveProfile(profile) && profileKeys(profile).has(key)) || null;
}

/**
 * Decide one owner change.
 *
 * @param currentOwner  orders.sales_agent as it is now
 * @param customerOwner the agent who owns this customer from earlier closed
 *                      orders and is still on the team, or '' for a new one
 * @param targetOwner   the owner being asked for ('' = unassigned)
 * @param actorOwner    the person asking, as their owner name
 * @returns {{ outcome: 'unchanged'|'apply'|'needs_approval'|'refused', message?: string, code?: string }}
 */
export function decideOwnerChange({
  currentOwner = '',
  customerOwner = '',
  targetOwner = '',
  actorOwner = '',
  isSuperadmin = false,
  status = '',
  reason = '',
} = {}) {
  const current = text(currentOwner);
  const target = text(targetOwner);
  const customer = text(customerOwner);

  if (sameOwner(current, target)) return { outcome: 'unchanged' };

  if (isSuperadmin) {
    if (current && cleanReason(reason).length < OWNER_REASON_MIN) {
      return {
        outcome: 'refused',
        code: 'reason_required',
        message: `Type a short reason for moving this order from ${current} to ${target || 'Unassigned'}. It is saved in the order timeline.`,
      };
    }
    return { outcome: 'apply' };
  }

  if (current) {
    return {
      outcome: 'needs_approval',
      code: 'needs_approval',
      message: `This order belongs to ${current}. Use "Request owner change" and a superadmin will review it.`,
    };
  }
  if (!target || !sameOwner(target, actorOwner)) {
    return {
      outcome: 'needs_approval',
      code: 'needs_approval',
      message: 'You can only claim an order for yourself. To give it to someone else, use "Request owner change".',
    };
  }
  if (customer && !sameOwner(customer, actorOwner)) {
    return {
      outcome: 'needs_approval',
      code: 'needs_approval',
      message: `This customer already belongs to ${customer} from earlier orders. If that is wrong, use "Request owner change".`,
    };
  }
  if (!isAwaitingPayment(status)) {
    return {
      outcome: 'needs_approval',
      code: 'needs_approval',
      message: 'This order is already paid, so it can no longer be claimed. Use "Request owner change" and a superadmin will review it.',
    };
  }
  return { outcome: 'apply' };
}

/**
 * Who owns a manual order when it is created.
 *
 * A superadmin must say: an agent, or an explicit "house sale" with nobody
 * credited. Leaving it blank is how the 14 Sep order sat unowned for two days
 * until someone else took it.
 *
 * Staff are credited themselves — unless the customer already belongs to a
 * colleague, in which case the colleague keeps them and the note says so.
 */
export function resolveManualOrderOwner({
  isSuperadmin = false,
  requestedOwner = '',
  houseSale = false,
  customerOwner = '',
  actorOwner = '',
} = {}) {
  if (isSuperadmin) {
    const requested = text(requestedOwner);
    if (requested) return { owner: requested, fromHistory: false, houseSale: false };
    if (houseSale) return { owner: null, fromHistory: false, houseSale: true };
    return { error: 'Choose who owns this sale, or pick "No agent (house sale)".' };
  }

  const customer = text(customerOwner);
  if (customer && !sameOwner(customer, actorOwner)) {
    return {
      owner: customer,
      fromHistory: true,
      houseSale: false,
      note: `This customer already belongs to ${customer}, so the order was credited to ${customer}. If that is wrong, open the order and use "Request owner change".`,
    };
  }
  return { owner: text(actorOwner) || null, fromHistory: false, houseSale: false };
}
