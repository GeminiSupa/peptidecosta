/**
 * What an edit is allowed to do to a campaign's status.
 *
 * The builder autosaves every few seconds and every save carries
 * `scheduled_at` — null when the campaign is set to send immediately. The PUT
 * handler acted on that unconditionally, so each save rewrote status to
 * 'draft'. Opening a campaign that had already been sent therefore un-sent it:
 * the report lost its sent date, and deliverCampaign()'s "already sent" guard,
 * which reads exactly this column, stopped protecting it against a re-send.
 *
 * Scheduling only means something before a campaign goes out. Once it has, the
 * status is a record of what happened and an edit must not walk it backwards.
 * Content stays editable at any stage — fixing a typo on a sent campaign is
 * reasonable; silently marking it unsent is not.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

/** Statuses a campaign can still be scheduled or unscheduled from. */
export const PRE_SEND_STATUSES = ['draft', 'scheduled'];

const PRE_SEND = new Set(PRE_SEND_STATUSES);

/** A campaign with no status yet has not been sent; treat it as a draft. */
export function isPreSendStatus(status) {
  return PRE_SEND.has(String(status ?? '').trim().toLowerCase() || 'draft');
}

/**
 * The status/schedule half of an update, given what the campaign is now.
 *
 * @param {string} currentStatus the campaign's stored status
 * @param {string|null|undefined} scheduledAt the requested send time;
 *        `undefined` means the caller did not mention scheduling at all
 * @returns {{scheduled_for?: string|null, status?: string}} fields to merge
 *          into the update — empty when the status must be left alone
 */
export function planScheduleUpdate(currentStatus, scheduledAt) {
  if (scheduledAt === undefined) return {};
  if (!isPreSendStatus(currentStatus)) return {};

  return {
    scheduled_for: scheduledAt || null,
    status: scheduledAt ? 'scheduled' : 'draft',
  };
}
