import { PROSPECT_STATUSES } from './prospects.mjs';

export const PIPELINE_PAGE_SIZE = 50;
export const CLOSED_PROSPECT_STATUSES = ['won', 'lost', 'do_not_contact'];

const CONTACT_FILTERS = new Set([
  'any', 'reachable', 'phone', 'email', 'whatsapp', 'website',
  'missing_phone', 'missing_email', 'no_website', 'not_enriched',
]);
const OWNER_FILTERS = new Set(['any', 'mine', 'unassigned']);
const FOLLOW_UP_FILTERS = new Set(['any', 'due', 'unscheduled']);
const READINESS_FILTERS = new Set([
  'any', 'any_ready', 'email_ready', 'whatsapp_ready', 'needs_verification', 'blocked',
]);
const SOURCE_FILTERS = new Set(['any', 'openstreetmap', 'google_places', 'manual']);
const ACTIVITY_FILTERS = new Set(['any', 'contacted', 'never']);
const SORTS = new Set(['recent', 'score', 'followup', 'name']);

const choice = (params, name, values, fallback) => {
  const value = String(params.get(name) || '').trim();
  return values.has(value) ? value : fallback;
};

/** Parse the public GET query into a small, bounded pipeline query contract. */
export function parseProspectPipelineParams(params) {
  const rawStatus = String(params.get('status') || 'active').trim();
  const status = ['active', 'all', 'due', ...PROSPECT_STATUSES].includes(rawStatus)
    ? rawStatus
    : 'active';
  const rawLimit = Math.floor(Number(params.get('limit')) || PIPELINE_PAGE_SIZE);
  const limit = Math.max(1, Math.min(100, rawLimit));
  const offset = Math.max(0, Math.floor(Number(params.get('offset')) || 0));
  const minScore = Math.max(0, Math.min(100, Math.floor(Number(params.get('minScore')) || 0)));

  return {
    search: String(params.get('search') || '').trim().slice(0, 120),
    status,
    sort: choice(params, 'sort', SORTS, 'recent'),
    contact: choice(params, 'contact', CONTACT_FILTERS, 'any'),
    owner: choice(params, 'owner', OWNER_FILTERS, 'any'),
    followUp: choice(params, 'followUp', FOLLOW_UP_FILTERS, 'any'),
    readiness: choice(params, 'readiness', READINESS_FILTERS, 'any'),
    source: choice(params, 'source', SOURCE_FILTERS, 'any'),
    activity: choice(params, 'activity', ACTIVITY_FILTERS, 'any'),
    minScore,
    limit,
    offset,
  };
}

/** Keep PostgREST boolean syntax out of a user-supplied search fragment. */
export function safeProspectSearchTerm(value) {
  return String(value || '').replace(/[,%()*'"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Apply every filter before range(), so database counts and rows agree. */
export function applyProspectPipelineFilters(query, filters, currentEmail, nowIso = new Date().toISOString()) {
  let next = query;
  if (filters.status === 'active') next = next.not('status', 'in', `(${CLOSED_PROSPECT_STATUSES.join(',')})`);
  else if (filters.status === 'due') {
    next = next.not('status', 'in', `(${CLOSED_PROSPECT_STATUSES.join(',')})`).lte('next_follow_up_at', nowIso);
  } else if (filters.status !== 'all') next = next.eq('status', filters.status);

  if (filters.owner === 'mine' && currentEmail) next = next.eq('owner_email', currentEmail);
  if (filters.owner === 'unassigned') next = next.is('owner_email', null);
  if (filters.followUp === 'due') next = next.not('status', 'in', `(${CLOSED_PROSPECT_STATUSES.join(',')})`).lte('next_follow_up_at', nowIso);
  if (filters.followUp === 'unscheduled') next = next.is('next_follow_up_at', null);
  if (filters.minScore) next = next.gte('fit_score', filters.minScore);
  if (filters.source !== 'any') next = next.eq('source_provider', filters.source);
  if (filters.activity === 'contacted') next = next.not('last_contacted_at', 'is', null);
  if (filters.activity === 'never') next = next.is('last_contacted_at', null);

  const contactFilters = {
    reachable: (value) => value.or('phone.not.is.null,email.not.is.null,whatsapp_numbers.neq.[]'),
    phone: (value) => value.not('phone', 'is', null),
    email: (value) => value.not('email', 'is', null),
    whatsapp: (value) => value.not('whatsapp_numbers', 'eq', '[]'),
    website: (value) => value.not('website_url', 'is', null),
    missing_phone: (value) => value.is('phone', null),
    missing_email: (value) => value.is('email', null),
    no_website: (value) => value.is('website_url', null),
    not_enriched: (value) => value.is('enriched_at', null),
  };
  if (contactFilters[filters.contact]) next = contactFilters[filters.contact](next);

  if (filters.readiness === 'email_ready') {
    next = next.not('email', 'is', null).in('email_permission_status', ['business_contact', 'consented']);
  } else if (filters.readiness === 'whatsapp_ready') {
    next = next.in('whatsapp_permission_status', ['business_contact', 'consented'])
      .or('phone.not.is.null,whatsapp_numbers.neq.[]');
  } else if (filters.readiness === 'any_ready') {
    next = next.or('and(email.not.is.null,email_permission_status.in.(business_contact,consented)),and(phone.not.is.null,whatsapp_permission_status.in.(business_contact,consented)),and(whatsapp_numbers.neq.[],whatsapp_permission_status.in.(business_contact,consented))');
  } else if (filters.readiness === 'needs_verification') {
    next = next.or('and(email.not.is.null,email_permission_status.eq.unknown),and(phone.not.is.null,whatsapp_permission_status.eq.unknown),and(whatsapp_numbers.neq.[],whatsapp_permission_status.eq.unknown)');
  } else if (filters.readiness === 'blocked') {
    next = next.or('status.eq.do_not_contact,contact_permission_status.eq.do_not_contact,and(email_permission_status.eq.do_not_contact,whatsapp_permission_status.eq.do_not_contact)');
  }

  const search = safeProspectSearchTerm(filters.search);
  if (search) {
    const pattern = `*${search}*`;
    const searchConditions = [
      `organization_name.ilike.${pattern}`,
      `category.ilike.${pattern}`,
      `city.ilike.${pattern}`,
      `region.ilike.${pattern}`,
      `country.ilike.${pattern}`,
      `phone.ilike.${pattern}`,
      `email.ilike.${pattern}`,
      `owner_email.ilike.${pattern}`,
    ];
    // Operators commonly paste phone numbers without the spaces, dashes, or
    // parentheses stored by a directory. Interleave wildcards so a digits-only
    // search keeps matching the formatted database value after filtering moved
    // from the browser to PostgREST.
    const phoneDigits = search.replace(/\D/g, '').slice(0, 24);
    if (phoneDigits.length >= 4) {
      searchConditions.push(`phone.ilike.*${phoneDigits.split('').join('*')}*`);
    }
    next = next.or(searchConditions.join(','));
  }

  const sorts = {
    recent: ['updated_at', false],
    score: ['fit_score', false],
    followup: ['next_follow_up_at', true],
    name: ['organization_name', true],
  };
  const [column, ascending] = sorts[filters.sort] || sorts.recent;
  // Stable tie-breaking prevents rows with the same score/date/name from
  // moving between pages while the operator clicks Previous and Next.
  return next
    .order(column, { ascending, nullsFirst: false })
    .order('id', { ascending: true });
}
