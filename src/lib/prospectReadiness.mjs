import { canContactProspect } from './prospectOutreach.mjs';
import { scoreProspect } from './prospects.mjs';

export const PROSPECT_READINESS_CHANNELS = ['email', 'whatsapp'];

function channelState(prospect, channel) {
  const result = canContactProspect(prospect, channel);
  if (result.allowed) {
    return {
      status: 'ready',
      label: 'Ready',
      reason: '',
      identity: result.identity,
      basis: result.basis,
    };
  }

  const channelStatus = prospect?.[`${channel}_permission_status`];
  const blocked = prospect?.status === 'do_not_contact'
    || prospect?.contact_permission_status === 'do_not_contact'
    || channelStatus === 'do_not_contact';
  return {
    status: blocked ? 'blocked' : 'needs_verification',
    label: blocked ? 'Blocked' : 'Needs verification',
    reason: result.reason,
    identity: null,
    basis: null,
  };
}

/**
 * Computes operational outreach readiness independently from commercial fit.
 * It deliberately delegates to the same gate used by draft and send routes so
 * the list cannot advertise a channel as ready when the server would reject it.
 */
export function prospectContactReadiness(prospect = {}) {
  const channels = Object.fromEntries(
    PROSPECT_READINESS_CHANNELS.map((channel) => [channel, channelState(prospect, channel)]),
  );
  const readyChannels = PROSPECT_READINESS_CHANNELS.filter(
    (channel) => channels[channel].status === 'ready',
  );
  const status = readyChannels.length
    ? 'ready'
    : (PROSPECT_READINESS_CHANNELS.every((channel) => channels[channel].status === 'blocked')
        ? 'blocked'
        : 'needs_verification');

  return { status, readyChannels, channels };
}

export function matchesProspectReadiness(prospect = {}, filter = 'any') {
  if (filter === 'any') return true;
  const readiness = prospectContactReadiness(prospect);
  if (filter === 'any_ready') return readiness.status === 'ready';
  if (filter === 'email_ready') return readiness.channels.email.status === 'ready';
  if (filter === 'whatsapp_ready') return readiness.channels.whatsapp.status === 'ready';
  if (filter === 'needs_verification') return readiness.status === 'needs_verification';
  if (filter === 'blocked') return readiness.status === 'blocked';
  return true;
}

/** Recompute all derived fields before returning a prospect to a client. */
export function presentProspect(prospect) {
  if (!prospect) return prospect;
  const fit = scoreProspect(prospect);
  const readiness = prospectContactReadiness(prospect);
  return {
    ...prospect,
    fit_score: fit.score,
    fit_reasons: fit.reasons,
    contact_readiness: readiness.status,
    contact_ready_channels: readiness.readyChannels,
    channel_readiness: readiness.channels,
  };
}
