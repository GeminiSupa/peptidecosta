export const PROSPECT_STATUSES = [
  'discovered',
  'review',
  'qualified',
  'contacted',
  'responded',
  'meeting_booked',
  'partner',
  'won',
  'lost',
  'do_not_contact',
];

export const PROSPECT_STATUS_LABELS = {
  discovered: 'Discovered',
  review: 'Needs review',
  qualified: 'Qualified',
  contacted: 'Contacted',
  responded: 'Responded',
  meeting_booked: 'Meeting booked',
  partner: 'Partner',
  won: 'Won',
  lost: 'Lost',
  do_not_contact: 'Do not contact',
};

export const CONTACT_PERMISSION_STATUSES = [
  'unknown',
  'business_contact',
  'consented',
  'do_not_contact',
];

const PEOPLE_VERIFICATION_STATUSES = new Set([
  'published',
  'published_domain_valid',
  'unverified',
]);

// Permission is a claim about a person, so rediscovery may raise it but never
// lower it. A recorded consent or an opt-out outranks anything a later website
// scan infers.
const PERMISSION_RANK = {
  unknown: 0,
  business_contact: 1,
  consented: 2,
  do_not_contact: 3,
};

/** Columns a re-discovery is allowed to refresh from the source directory. */
const DISCOVERY_FIELDS = [
  'source_provider', 'source_external_id', 'organization_name', 'category',
  'website_url', 'formatted_address', 'city', 'region', 'country',
  'latitude', 'longitude', 'google_maps_url', 'rating', 'user_rating_count',
  'business_status',
];

/** Columns owned by the sales workflow, never touched by a re-discovery. */
const PIPELINE_FIELDS = ['status', 'owner_email', 'next_follow_up_at', 'last_contacted_at'];

const clean = (value, limit = 500) => String(value ?? '').trim().slice(0, limit);

export function prospectSearchTerm(value) {
  const query = clean(value, 180);
  const lower = query.toLowerCase();
  if (/(gym|fitness|personal train)/.test(lower)) return 'gym';
  if (/(wellness|spa)/.test(lower)) return 'wellness';
  if (/(nutrition|diet)/.test(lower)) return 'nutritionist';
  if (/(recovery|sports medicine|sports clinic)/.test(lower)) return 'sports clinic';
  if (/(aesthetic|est[eé]tica)/.test(lower)) return 'aesthetic clinic';
  if (/(laborator|research lab)/.test(lower)) return 'laboratory';
  return query;
}

export function prospectSearchProfile(value) {
  const term = prospectSearchTerm(value);
  const lower = term.toLowerCase();
  if (lower === 'gym') return {
    term,
    namePattern: 'gym|fitness|health club|crossfit',
    tagFilters: [
      ['leisure', '^fitness_centre$'],
      ['sport', '^(fitness|bodybuilding|weightlifting)$'],
    ],
  };
  if (lower === 'wellness') return {
    term,
    namePattern: 'wellness|wellbeing|spa|health centre|health center',
    tagFilters: [['leisure', '^spa$'], ['healthcare', '^alternative$']],
  };
  if (lower === 'nutritionist') return {
    term,
    namePattern: 'nutrition|dietitian|dietician',
    tagFilters: [['healthcare', '^(dietitian|nutrition_counselling)$'], ['office', '^(dietitian|nutritionist)$']],
  };
  if (lower === 'sports clinic') return {
    term,
    namePattern: 'sports medicine|sports clinic|physio|recovery',
    tagFilters: [['healthcare', '^(physiotherapist|clinic|sports_medicine)$']],
  };
  if (lower === 'aesthetic clinic') return {
    term,
    namePattern: 'aesthetic|esthetic|cosmetic|beauty clinic',
    tagFilters: [['shop', '^beauty$'], ['healthcare', '^(clinic|aesthetic_medicine)$']],
  };
  if (lower === 'laboratory') return {
    term,
    namePattern: 'laboratory|laboratorio|research lab',
    tagFilters: [['amenity', '^laboratory$'], ['healthcare', '^laboratory$'], ['office', '^research$']],
  };
  return { term, namePattern: term, tagFilters: [] };
}

export function buildProspectSearchQuery(query, location) {
  return [prospectSearchTerm(query), clean(location, 120)].filter(Boolean).join(', ');
}

export function normalizeOptionalUrl(value) {
  const raw = clean(value, 1000);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeProspectPeople(people) {
  if (!Array.isArray(people)) return [];
  return people.slice(0, 30).map((person) => {
    const confidence = Number(person?.confidence);
    const verification = clean(person?.verification_status, 40);
    return {
      full_name: clean(person?.full_name, 180) || 'Public business contact',
      job_title: clean(person?.job_title, 180) || null,
      email: clean(person?.email, 240).toLowerCase() || null,
      phone: clean(person?.phone, 80) || null,
      linkedin_url: normalizeOptionalUrl(person?.linkedin_url),
      source_url: normalizeOptionalUrl(person?.source_url),
      evidence: clean(person?.evidence, 500) || null,
      verification_status: PEOPLE_VERIFICATION_STATUSES.has(verification) ? verification : 'unverified',
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 50,
    };
  }).filter((person) => person.full_name && (person.job_title || person.email || person.phone || person.linkedin_url));
}

export function normalizeWhatsAppNumbers(values) {
  const source = Array.isArray(values) ? values : [values];
  return [...new Set(source.flatMap((value) => String(value ?? '')
    .split(/[;,]/)
    .map((entry) => entry.replace(/\D/g, ''))
    .filter((digits) => digits.length >= 8 && digits.length <= 15)
    .map((digits) => `+${digits}`)))].slice(0, 5);
}

export function normalizeLinkedInProfileUrls(urls) {
  if (!Array.isArray(urls)) return [];
  return [...new Set(urls.map(normalizeOptionalUrl).filter((value) => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return /(^|\.)linkedin\.com$/i.test(url.hostname) && /^\/in\//i.test(url.pathname);
    } catch {
      return false;
    }
  }))].slice(0, 30);
}

/**
 * Category words that mean "this is someone we sell to".
 *
 * Held as spaced lowercase fragments and compared against a equally flattened
 * category, because the same business arrives spelled three different ways:
 * Google says `sports_medicine_clinic`, OpenStreetMap says `fitness_centre`,
 * and normalizeOpenStreetMapPlace strips the underscores again for display. A
 * fragment list survives all three; an exact-value list matched none of them.
 */
const TARGET_CATEGORY_STEMS = [
  'gym', 'gimnasio', 'fitness', 'health club', 'crossfit', 'personal trainer',
  'wellness', 'wellbeing', 'spa',
  'nutrition', 'dietitian', 'dietician',
  'physio', 'rehabilitation', 'sports medicine', 'sports clinic',
  'clinic', 'clinica', 'doctor', 'medical', 'health centre', 'health center', 'health consultant',
  'aesthetic', 'esthetic', 'cosmetic', 'beauty',
  'laboratory', 'laboratorio', 'research',
];

/** Flattens `Fitness_Centre` and `fitness centre` onto the same string. */
function flattenCategory(value) {
  return clean(value, 240).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function matchesTargetCategory(prospect = {}) {
  const category = flattenCategory(prospect.primary_type || prospect.primaryType || prospect.category);
  if (category && TARGET_CATEGORY_STEMS.some((stem) => category.includes(stem))) return true;
  // A directory entry with a thin category can still be unmistakable by name —
  // "Gimnasio Olimpo" is a gym whether or not anyone tagged it as one.
  const name = flattenCategory(prospect.organization_name || prospect.displayName?.text);
  return Boolean(name) && TARGET_CATEGORY_STEMS.some((stem) => name.includes(stem));
}

/**
 * Scores how much work a prospect still needs before it can be sold to.
 *
 * The weights are chosen so a fully worked prospect — right category, website,
 * phone, published work email, a named decision-maker, and an established
 * contact permission — reaches exactly 100 without any Google Places data.
 * Ratings and review counts stay in the model for the Google shape, but they
 * are worth 5 apiece instead of 10, because OpenStreetMap never supplies them
 * and the previous weighting quietly made 20 of the 100 points unreachable for
 * every prospect the app can actually discover.
 */
export function scoreProspect(prospect = {}) {
  let score = 10;
  const reasons = [];

  if (matchesTargetCategory(prospect)) {
    score += 20;
    reasons.push('Target business category');
  }
  if (prospect.website_url || prospect.websiteUri) {
    score += 15;
    reasons.push('Active business website');
  }
  if (prospect.phone || prospect.internationalPhoneNumber || prospect.nationalPhoneNumber) {
    score += 10;
    reasons.push('Public business phone');
  }
  if (prospect.email) {
    score += 15;
    reasons.push('Work email available');
  }
  if (Array.isArray(prospect.people) && prospect.people.length) {
    score += 15;
    reasons.push('Named decision-maker on file');
  }
  if (['business_contact', 'consented'].includes(prospect.contact_permission_status)) {
    score += 10;
    reasons.push('Contact permission established');
  }
  if (prospect.city || prospect.region || prospect.formatted_address || prospect.formattedAddress) {
    score += 5;
    reasons.push('Location identified');
  }
  if (Number(prospect.rating) >= 4.3) {
    score += 5;
    reasons.push('Strong public rating');
  }
  if (Number(prospect.user_rating_count || prospect.userRatingCount) >= 20) {
    score += 5;
    reasons.push('Established review volume');
  }

  return { score: Math.min(100, score), reasons: reasons.slice(0, 5) };
}

/**
 * Score bands, shared by the list chip and the legend that explains it.
 *
 * A band is only meaningful against the scale above: 70 is a prospect with a
 * verified way in, 45 is one worth enriching, below that is a directory entry.
 */
export const PROSPECT_SCORE_BANDS = [
  { tone: 'high', min: 70, label: 'Ready to contact', hint: 'Category match plus a verified contact route.' },
  { tone: 'medium', min: 45, label: 'Worth enriching', hint: 'Right kind of business, contact details still missing.' },
  { tone: 'low', min: 0, label: 'Thin record', hint: 'Little more than a name and a location so far.' },
];

export function prospectScoreTone(score) {
  return PROSPECT_SCORE_BANDS.find((band) => Number(score || 0) >= band.min)?.tone || 'low';
}

export function normalizeGooglePlace(place = {}) {
  const scored = scoreProspect(place);
  return {
    source_provider: 'google_places',
    source_external_id: clean(place.id, 255) || null,
    organization_name: clean(place.displayName?.text || place.displayName || 'Unnamed business', 240),
    category: clean(place.primaryType || place.primaryTypeDisplayName?.text, 160) || null,
    website_url: normalizeOptionalUrl(place.websiteUri),
    phone: clean(place.internationalPhoneNumber || place.nationalPhoneNumber, 80) || null,
    formatted_address: clean(place.formattedAddress, 500) || null,
    latitude: Number.isFinite(Number(place.location?.latitude)) ? Number(place.location.latitude) : null,
    longitude: Number.isFinite(Number(place.location?.longitude)) ? Number(place.location.longitude) : null,
    google_maps_url: normalizeOptionalUrl(place.googleMapsUri),
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    user_rating_count: Number.isFinite(Number(place.userRatingCount)) ? Number(place.userRatingCount) : null,
    business_status: clean(place.businessStatus, 80) || null,
    fit_score: scored.score,
    fit_reasons: scored.reasons,
  };
}

export function normalizeOpenStreetMapPlace(place = {}) {
  const tags = place.extratags || {};
  const address = place.address || {};
  const website = tags.website || tags['contact:website'] || place.website;
  const phone = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || tags.mobile || place.phone;
  const email = tags.email || tags['contact:email'] || place.email;
  // Mappers record click-to-chat numbers separately from the landline.
  const whatsapp = normalizeWhatsAppNumbers([tags['contact:whatsapp'], tags.whatsapp, place.whatsapp]);
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  // Same precedence Overpass results already use, so a beauty salon or a
  // sport=fitness studio arriving straight from Nominatim is categorised the
  // way the identical POI would be through the category query.
  const category = clean(
    tags.healthcare || tags.leisure || tags.amenity || tags.office
      || tags.shop || tags.sport || place.type || place.category,
    160,
  ).replaceAll('_', ' ');
  const normalized = {
    source_provider: 'openstreetmap',
    source_external_id: clean(
      place.osm_type && place.osm_id ? `${place.osm_type}:${place.osm_id}` : place.place_id,
      255,
    ) || null,
    organization_name: clean(
      place.namedetails?.name || place.name || String(place.display_name || '').split(',')[0] || 'Unnamed business',
      240,
    ),
    category: category || null,
    website_url: normalizeOptionalUrl(website),
    phone: clean(phone, 80) || null,
    email: clean(email, 240).toLowerCase() || null,
    formatted_address: clean(place.display_name, 500) || null,
    city: clean(address.city || address.town || address.village || address.municipality || address.county, 140) || null,
    region: clean(address.state || address.region, 140) || null,
    country: clean(address.country || place.country, 140) || null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    google_maps_url: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`
      : null,
    rating: null,
    user_rating_count: null,
    business_status: null,
    whatsapp_numbers: whatsapp,
    contact_permission_status: email || phone || whatsapp.length ? 'business_contact' : 'unknown',
  };
  const scored = scoreProspect(normalized);
  normalized.fit_score = scored.score;
  normalized.fit_reasons = scored.reasons;
  return normalized;
}

export function normalizeOverpassElement(element = {}, context = {}) {
  const tags = element.tags || {};
  const latitude = Number(element.lat ?? element.center?.lat);
  const longitude = Number(element.lon ?? element.center?.lon);
  const address = {
    city: tags['addr:city:en'] || tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || context.city,
    state: tags['addr:state'] || tags['addr:province'] || context.region,
    country: context.country || tags['addr:country'],
  };
  const streetAddress = [
    tags['addr:housenumber'], tags['addr:street'], address.city, address.state, address.country,
  ].filter(Boolean).join(', ');
  return normalizeOpenStreetMapPlace({
    osm_type: element.type,
    osm_id: element.id,
    lat: latitude,
    lon: longitude,
    name: tags['name:en'] || tags.name || tags.brand || tags.operator,
    display_name: streetAddress || [tags.name, context.displayName].filter(Boolean).join(', '),
    type: tags.healthcare || tags.leisure || tags.amenity || tags.office || tags.shop || tags.sport,
    category: tags.healthcare ? 'healthcare' : tags.leisure ? 'leisure' : tags.amenity ? 'amenity' : null,
    address,
    extratags: tags,
    country: context.country,
  });
}

export function dedupeAndRankProspects(prospects, query, limit = 80) {
  const term = prospectSearchTerm(query).toLowerCase();
  const tokens = term.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2);
  const byKey = new Map();
  for (const prospect of Array.isArray(prospects) ? prospects : []) {
    if (!prospect?.organization_name || prospect.organization_name === 'Unnamed business') continue;
    const coordinates = Number.isFinite(Number(prospect.latitude)) && Number.isFinite(Number(prospect.longitude))
      ? `${Number(prospect.latitude).toFixed(4)}:${Number(prospect.longitude).toFixed(4)}`
      : '';
    const key = prospect.source_external_id
      || `${prospect.organization_name.toLowerCase().replace(/\W+/g, '')}:${coordinates}`;
    const haystack = `${prospect.organization_name} ${prospect.category || ''}`.toLowerCase();
    const relevance = tokens.reduce((score, token) => score + (haystack.includes(token) ? 12 : 0), 0)
      + (prospect.website_url ? 8 : 0)
      + (prospect.phone ? 6 : 0)
      + (prospect.email ? 8 : 0)
      + Number(prospect.fit_score || 0);
    const candidate = { ...prospect, search_relevance: relevance };
    const existing = byKey.get(key);
    if (!existing || candidate.search_relevance > existing.search_relevance) byKey.set(key, candidate);
  }
  return [...byKey.values()]
    .sort((a, b) => b.search_relevance - a.search_relevance || a.organization_name.localeCompare(b.organization_name))
    .slice(0, Math.max(1, Math.min(100, limit)));
}

export function normalizeProspectInput(input = {}) {
  const sourceProvider = clean(input.source_provider || 'manual', 80) || 'manual';
  const status = PROSPECT_STATUSES.includes(input.status) ? input.status : 'discovered';
  const permission = CONTACT_PERMISSION_STATUSES.includes(input.contact_permission_status)
    ? input.contact_permission_status
    : 'unknown';
  const latitude = input.latitude === '' || input.latitude == null ? null : Number(input.latitude);
  const longitude = input.longitude === '' || input.longitude == null ? null : Number(input.longitude);
  const rating = input.rating === '' || input.rating == null ? null : Number(input.rating);
  const reviewCount = input.user_rating_count === '' || input.user_rating_count == null
    ? null
    : Number(input.user_rating_count);
  const normalized = {
    source_provider: sourceProvider,
    source_external_id: clean(input.source_external_id, 255) || null,
    organization_name: clean(input.organization_name, 240),
    category: clean(input.category, 160) || null,
    website_url: normalizeOptionalUrl(input.website_url),
    phone: clean(input.phone, 80) || null,
    email: clean(input.email, 240).toLowerCase() || null,
    formatted_address: clean(input.formatted_address, 500) || null,
    city: clean(input.city, 140) || null,
    region: clean(input.region, 140) || null,
    country: clean(input.country, 140) || null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    google_maps_url: normalizeOptionalUrl(input.google_maps_url),
    rating: Number.isFinite(rating) ? rating : null,
    user_rating_count: Number.isFinite(reviewCount) ? Math.max(0, Math.round(reviewCount)) : null,
    business_status: clean(input.business_status, 80) || null,
    status,
    contact_permission_status: permission,
    contact_source_url: normalizeOptionalUrl(input.contact_source_url),
    enriched_at: input.enriched_at || null,
    people: normalizeProspectPeople(input.people),
    linkedin_urls: normalizeLinkedInProfileUrls(input.linkedin_urls),
    whatsapp_numbers: normalizeWhatsAppNumbers(input.whatsapp_numbers || []),
    owner_email: clean(input.owner_email, 240).toLowerCase() || null,
    notes: clean(input.notes, 5000) || '',
    next_follow_up_at: input.next_follow_up_at || null,
  };
  const scored = scoreProspect(normalized);
  normalized.fit_score = Number.isFinite(Number(input.fit_score))
    ? Math.max(0, Math.min(100, Math.round(Number(input.fit_score))))
    : scored.score;
  normalized.fit_reasons = Array.isArray(input.fit_reasons)
    ? input.fit_reasons.map((reason) => clean(reason, 200)).filter(Boolean).slice(0, 6)
    : scored.reasons;
  return normalized;
}

export function upgradeContactPermission(existing, incoming) {
  const current = CONTACT_PERMISSION_STATUSES.includes(existing) ? existing : 'unknown';
  const next = CONTACT_PERMISSION_STATUSES.includes(incoming) ? incoming : 'unknown';
  return PERMISSION_RANK[next] > PERMISSION_RANK[current] ? next : current;
}

/**
 * Fold a freshly discovered record into one already in the pipeline.
 *
 * Saving the same business twice used to run a full-row UPDATE from a raw
 * search result, which reset status, notes, owner, follow-up date and enriched
 * people back to their defaults. Directory details refresh; everything a person
 * typed or decided survives.
 */
export function mergeRediscoveredProspect(existing = {}, incoming = {}) {
  const merged = { ...existing };

  for (const field of DISCOVERY_FIELDS) {
    if (incoming[field] != null && incoming[field] !== '') merged[field] = incoming[field];
  }
  for (const field of PIPELINE_FIELDS) {
    merged[field] = existing[field] ?? null;
  }

  // Curated contact details win; a rediscovery only fills the blanks.
  merged.email = existing.email || incoming.email || null;
  merged.phone = existing.phone || incoming.phone || null;
  merged.notes = clean(existing.notes, 5000) || clean(incoming.notes, 5000) || '';

  // Enrichment results are additive: keep whatever the newer scan actually found.
  merged.people = incoming.people?.length ? incoming.people : existing.people || [];
  merged.linkedin_urls = incoming.linkedin_urls?.length ? incoming.linkedin_urls : existing.linkedin_urls || [];
  merged.whatsapp_numbers = normalizeWhatsAppNumbers([
    ...(existing.whatsapp_numbers || []),
    ...(incoming.whatsapp_numbers || []),
  ]);
  merged.contact_source_url = incoming.contact_source_url || existing.contact_source_url || null;
  merged.enriched_at = incoming.enriched_at || existing.enriched_at || null;

  merged.contact_permission_status = upgradeContactPermission(
    existing.contact_permission_status,
    incoming.contact_permission_status,
  );
  if (merged.contact_permission_status === 'do_not_contact') merged.status = 'do_not_contact';

  const scored = scoreProspect(merged);
  merged.fit_score = scored.score;
  merged.fit_reasons = scored.reasons;
  return merged;
}

const ANCHORED_LITERAL = /^\^([a-z0-9_]+)\$$/i;
const ANCHORED_ALTERNATION = /^\^\(([a-z0-9_]+(?:\|[a-z0-9_]+)*)\)\$$/i;

/**
 * Turns `^fitness_centre$` into `['fitness_centre']` so the query can use an
 * exact tag match instead of a regex one.
 *
 * This is the difference between a country-wide search working and not
 * working. Overpass answers `["leisure"="fitness_centre"]` from an index in
 * about a second; the equivalent `["leisure"~"^fitness_centre$"]` is a scan
 * that ran past the declared timeout and came back 504 on every mirror. Every
 * pattern in prospectSearchProfile is an anchored literal or alternation, so
 * all of them take the fast path — patterns that are not stay on regex.
 *
 * @returns {string[]|null} literal values, or null when regex is still needed
 */
export function expandAnchoredTagPattern(pattern) {
  const raw = String(pattern || '').trim();
  const literal = ANCHORED_LITERAL.exec(raw);
  if (literal) return [literal[1]];

  const alternation = ANCHORED_ALTERNATION.exec(raw);
  if (!alternation) return null;
  const values = alternation[1].split('|').map((value) => value.trim()).filter(Boolean);
  return values.length ? values : null;
}

/**
 * Public Overpass mirrors, tried in order.
 *
 * A country-wide area scan is the expensive query shape, and the flagship
 * endpoint answers it with HTTP 429 whenever its slots are full — which is
 * most of the time. The category half of a search was being dropped for a
 * reason that has nothing to do with the search itself, so a failure now moves
 * to the next mirror instead of degrading the result.
 */
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export function overpassEndpoints(configuredUrl) {
  const configured = String(configuredUrl || '').trim();
  const ordered = configured ? [configured, ...OVERPASS_MIRRORS] : [...OVERPASS_MIRRORS];
  return [...new Set(ordered)];
}

/**
 * Whether another mirror is worth trying.
 *
 * Rate limits and gateway timeouts are properties of the endpoint, so a
 * different one may well answer. A 400 means the query itself is malformed and
 * every mirror will reject it identically — retrying that is pure latency.
 */
export function isRetryableOverpassStatus(status) {
  return [429, 500, 502, 503, 504].includes(Number(status));
}

export const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
export const DEGRADED_SEARCH_CACHE_TTL_MS = 45 * 1000;

/**
 * A degraded result is still cached, but only briefly.
 *
 * Caching it for the full fifteen minutes meant pressing Search again replayed
 * the failure without retrying anything, so a transient rate limit looked
 * permanent. Not caching it at all would let an impatient operator hammer the
 * mirror that just rate-limited us. Forty-five seconds does neither.
 */
export function searchCacheTtlMs(warnings = []) {
  return warnings.length ? DEGRADED_SEARCH_CACHE_TTL_MS : SEARCH_CACHE_TTL_MS;
}

export function isProspectsTableMissing(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01'
    || code === 'PGRST205'
    || (['42703', 'PGRST204'].includes(code) && ['contact_source_url', 'enriched_at', 'people', 'linkedin_urls', 'whatsapp_numbers'].some((column) => message.includes(column)))
    || (message.includes('sales_prospects') && (message.includes('does not exist') || message.includes('schema cache')));
}
