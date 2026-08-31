import {
  CHANNEL_PERMISSION_BASIS,
  CHANNEL_PERMISSION_STATUSES,
  PROSPECT_PERMISSION_CHANNELS,
  channelPermissionFields,
  summarizeChannelPermissions,
} from './prospectPermissions.mjs';
import { whatsappDialableNumber } from './prospectPhone.mjs';
import {
  CATEGORY_TIER_POINTS,
  PROSPECT_CATEGORY_TIERS,
  categoryTier,
} from './prospectCategories.mjs';

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

const CHANNEL_PERMISSION_FIELD_NAMES = PROSPECT_PERMISSION_CHANNELS.flatMap((channel) => {
  const fields = channelPermissionFields(channel);
  return Object.values(fields);
});

const clean = (value, limit = 500) => String(value ?? '').trim().slice(0, limit);

export function prospectSearchTerm(value) {
  const query = clean(value, 180);
  const lower = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  // Pharmacies and veterinary practices come first: they are the categories
  // most worth selling to and, until this list grew, the only way to search for
  // one was a raw name match with no tag filter behind it — which on OSM finds
  // almost nothing. Both are among the best-mapped tags there is.
  if (/(pharmac|farmacia|drogueria|botica)/.test(lower)) return 'pharmacy';
  if (/(veterinar|animal hospital|mascota)/.test(lower)) return 'veterinary';
  if (/(distribuidora|distributor|importadora|importer|mayorista|wholesale)/.test(lower)) return 'distributor';
  if (/(supplement|suplemento|nutraceutic)/.test(lower)) return 'supplements';
  if (/(dermatolog|plastic surgery|cirugia plastica)/.test(lower)) return 'dermatology';
  if (/(laborator|research lab)/.test(lower)) return 'laboratory';
  if (/(nutrition|diet)/.test(lower)) return 'nutritionist';
  if (/(recovery|sports medicine|sports clinic)/.test(lower)) return 'sports clinic';
  if (/(aesthetic|estetica|cosmetic|beauty|belleza)/.test(lower)) return 'aesthetic clinic';
  if (/(gym|fitness|personal train|gimnasio|crossfit)/.test(lower)) return 'gym';
  if (/(wellness|spa|bienestar)/.test(lower)) return 'wellness';
  if (/(hospital|medical cent|centro medico)/.test(lower)) return 'medical center';
  // Last of the medical profiles on purpose. It is the broadest — a great many
  // Costa Rican businesses are simply "Clínica <name>" — so anything more
  // specific has to get its answer before this line is reached. "laboratorio
  // clínico" and "sports clinic" both contain "clinic" and are not clinics.
  if (/(clinic|clinica|doctor|medico)/.test(lower)) return 'clinic';
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
  // amenity=pharmacy is one of the most consistently mapped tags in OSM, so
  // this profile finds real coverage rather than whatever happens to have the
  // word in its name. shop=chemist catches the drugstore that sells without a
  // dispensary; shop=medical_supply catches the supplier beside it.
  if (lower === 'pharmacy') return {
    term,
    namePattern: 'farmacia|pharmac|drogueria|droguería|botica',
    tagFilters: [
      ['amenity', '^pharmacy$'],
      ['healthcare', '^pharmacy$'],
      ['shop', '^(chemist|medical_supply)$'],
    ],
  };
  if (lower === 'veterinary') return {
    term,
    namePattern: 'veterinar|mascota|animal',
    tagFilters: [['amenity', '^veterinary$'], ['healthcare', '^veterinary$'], ['shop', '^pet$']],
  };
  // Wholesalers and importers are mapped as trade or wholesale rather than
  // retail, and are the businesses that buy by the case.
  if (lower === 'distributor') return {
    term,
    namePattern: 'distribuidora|distributor|importadora|mayorista|wholesale',
    tagFilters: [['shop', '^(wholesale|trade)$'], ['office', '^(company|wholesale)$']],
  };
  if (lower === 'supplements') return {
    term,
    namePattern: 'suplemento|supplement|nutraceutic|vitamina',
    tagFilters: [['shop', '^(nutrition_supplements|health_food|herbalist)$']],
  };
  if (lower === 'dermatology') return {
    term,
    namePattern: 'dermatolog|cirugia plastica|cirugía plástica|plastic surgery',
    tagFilters: [['healthcare', '^(dermatology|plastic_surgery)$'], ['healthcare:speciality', 'dermatology']],
  };
  if (lower === 'medical center') return {
    term,
    namePattern: 'hospital|centro medico|centro médico|medical cent',
    tagFilters: [['amenity', '^hospital$'], ['healthcare', '^(hospital|centre)$']],
  };
  // The broadest of the medical profiles, so it sits last among them: a great
  // many Costa Rican businesses are simply "Clínica <name>".
  if (lower === 'clinic') return {
    term,
    namePattern: 'clinica|clínica|clinic|consultorio',
    tagFilters: [['amenity', '^(clinic|doctors)$'], ['healthcare', '^(clinic|doctor|centre)$']],
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

/**
 * Whether a WhatsApp permission can be verified against a number we could
 * actually dial. It asks the same question the send gate asks, so evidence
 * cannot be recorded for a number outreach would then refuse.
 */
export function hasUsableProspectWhatsAppIdentity(prospect = {}) {
  const candidates = [
    ...(Array.isArray(prospect.whatsapp_numbers) ? prospect.whatsapp_numbers : []),
    prospect.phone,
  ];
  return candidates.some((candidate) => whatsappDialableNumber(candidate, prospect.country));
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
  // The businesses that actually resell, which this list was missing entirely.
  // A directory calls them "pharmacy" and a Costa Rican shopfront calls itself
  // "Farmacia La Bomba" or "Droguería Intermed", and neither contained any
  // fragment above, so the best prospects in the country scored 5 out of 100.
  'pharmacy', 'farmacia', 'pharmaceutic', 'farmaceutic', 'drogueria', 'apothecary',
  'distributor', 'distribuidora', 'importer', 'importadora', 'wholesale',
  'veterinar', 'animal hospital', 'pet clinic',
  'biotech', 'biomedic', 'nutraceutical', 'supplement', 'suplemento',
  'dermatolog', 'surgery', 'cirugia', 'medicine', 'medicina', 'longevity', 'hormone',
  'skincare', 'skin care',
];

/**
 * Flattens `Fitness_Centre` and `fitness centre` onto the same string.
 *
 * Accents are folded first, which they were not before. Stripping non-letters
 * from "Cl\u00ednica Est\u00e9tica" turned the \u00ed and \u00e9 into spaces and left
 * "cl nica est tica", so the 'clinica' fragment below never matched a clinic
 * that spelled its own name correctly — in a market where nearly all of them
 * do. Same for "Drogu\u00eder\u00eda" and "Farmac\u00e9utica".
 */
function flattenCategory(value) {
  return clean(value, 240)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
 * Scores commercial fit only. Contact details, permission, and ownership are
 * operational readiness signals and must never change this number.
 */
export function scoreProspect(prospect = {}) {
  let score = 5;
  const reasons = [];

  // A row carrying a controlled key is scored by what it actually is. Tier 5 is
  // worth the 45 that every target category used to score, so gyms and clinics
  // keep exactly the number they had and only the tiers above them move — a
  // rescore can lift a prospect, never demote one.
  const tier = categoryTier(prospect.category);
  if (tier) {
    score += CATEGORY_TIER_POINTS[tier];
    reasons.push(`${PROSPECT_CATEGORY_TIERS[tier].label} (tier ${tier})`);
  } else if (matchesTargetCategory(prospect)) {
    // Everything discovered from a directory, which never carries a key.
    score += 45;
    reasons.push('Target business category');
  }
  if (prospect.website_url || prospect.websiteUri) {
    score += 10;
    reasons.push('Established web presence');
  }
  if (prospect.city || prospect.region || prospect.formatted_address || prospect.formattedAddress) {
    score += 10;
    reasons.push('Business location identified');
  }
  if (['operational', 'open', 'active'].includes(clean(prospect.business_status, 80).toLowerCase())) {
    score += 5;
    reasons.push('Business reported active');
  }
  if (Number(prospect.rating) >= 4.3) {
    score += 10;
    reasons.push('Strong public rating');
  }
  if (Number(prospect.user_rating_count || prospect.userRatingCount) >= 20) {
    score += 15;
    reasons.push('Established review volume');
  }

  return { score: Math.min(100, score), reasons: reasons.slice(0, 6) };
}

/**
 * Score bands, shared by the list chip and the legend that explains it.
 *
 * These labels describe commercial fit, never permission to contact.
 */
export const PROSPECT_SCORE_BANDS = [
  { tone: 'high', min: 70, label: 'Strong fit', hint: 'Target category with strong public business signals.' },
  { tone: 'medium', min: 45, label: 'Promising fit', hint: 'Likely relevant, but the business evidence is still limited.' },
  { tone: 'low', min: 0, label: 'Weak evidence', hint: 'Not enough evidence yet to establish commercial fit.' },
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
    latitude: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? latitude : null,
    longitude: Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? longitude : null,
    google_maps_url: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`
      : null,
    rating: null,
    user_rating_count: null,
    business_status: null,
    whatsapp_numbers: whatsapp,
    // Directory contact tags are useful discovery data, but they do not prove
    // which outreach channel may lawfully be used. Website enrichment or a
    // human verification records that evidence later.
    contact_permission_status: 'unknown',
    email_permission_status: 'unknown',
    whatsapp_permission_status: 'unknown',
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
  const legacyGlobalOptOut = input.contact_permission_status === 'do_not_contact' || status === 'do_not_contact';
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
    latitude: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? latitude : null,
    longitude: Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? longitude : null,
    google_maps_url: normalizeOptionalUrl(input.google_maps_url),
    rating: Number.isFinite(rating) ? rating : null,
    user_rating_count: Number.isFinite(reviewCount) ? Math.max(0, Math.round(reviewCount)) : null,
    business_status: clean(input.business_status, 80) || null,
    status: legacyGlobalOptOut ? 'do_not_contact' : status,
    contact_permission_status: 'unknown',
    contact_source_url: normalizeOptionalUrl(input.contact_source_url),
    enriched_at: input.enriched_at || null,
    people: normalizeProspectPeople(input.people),
    linkedin_urls: normalizeLinkedInProfileUrls(input.linkedin_urls),
    whatsapp_numbers: normalizeWhatsAppNumbers(input.whatsapp_numbers || []),
    // Ownership is assigned only through the atomic claim action. Accepting an
    // owner from create/rediscovery input bypasses that invariant and lets a
    // caller assign work to an arbitrary teammate.
    owner_email: null,
    notes: clean(input.notes, 5000) || '',
    next_follow_up_at: normalizeOptionalProspectDate(input.next_follow_up_at),
  };
  for (const channel of PROSPECT_PERMISSION_CHANNELS) {
    const fields = channelPermissionFields(channel);
    const channelStatus = legacyGlobalOptOut
      ? 'do_not_contact'
      : (CHANNEL_PERMISSION_STATUSES.includes(input[fields.status]) ? input[fields.status] : 'unknown');
    const expectedBasis = CHANNEL_PERMISSION_BASIS[channelStatus] || null;
    normalized[fields.status] = channelStatus;
    normalized[fields.basis] = expectedBasis;
    normalized[fields.sourceUrl] = normalizeOptionalUrl(input[fields.sourceUrl]);
    normalized[fields.evidence] = clean(input[fields.evidence], 1000) || null;
    normalized[fields.verifiedAt] = normalizeOptionalProspectDate(input[fields.verifiedAt]);
    normalized[fields.verifiedBy] = null;
    if (channelStatus === 'unknown') {
      normalized[fields.sourceUrl] = null;
      normalized[fields.evidence] = null;
      normalized[fields.verifiedAt] = null;
    }
  }
  normalized.contact_permission_status = summarizeChannelPermissions(normalized);
  const scored = scoreProspect(normalized);
  // Fit is derived server-side; a browser cannot promote a lead by supplying
  // its own score or reasons.
  normalized.fit_score = scored.score;
  normalized.fit_reasons = scored.reasons;
  return normalized;
}

/** Normalize an optional client-supplied date without letting Invalid Date reach Postgres. */
export function normalizeOptionalProspectDate(value) {
  if (value === '' || value == null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Human-readable validation for write APIs; normalization alone must not hide bad input. */
export function prospectInputError(input = {}) {
  const website = String(input.website_url || '').trim();
  if (website && !normalizeOptionalUrl(website)) return 'Enter a valid website URL';

  const hasLatitude = input.latitude !== '' && input.latitude != null;
  const hasLongitude = input.longitude !== '' && input.longitude != null;
  if (hasLatitude !== hasLongitude) return 'Enter both latitude and longitude, or leave both blank';
  if (hasLatitude) {
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return 'Latitude must be between -90 and 90';
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return 'Longitude must be between -180 and 180';
  }

  if (input.next_follow_up_at && !normalizeOptionalProspectDate(input.next_follow_up_at)) {
    return 'Enter a valid follow-up date';
  }

  for (const channel of PROSPECT_PERMISSION_CHANNELS) {
    const fields = channelPermissionFields(channel);
    const status = CHANNEL_PERMISSION_STATUSES.includes(input[fields.status])
      ? input[fields.status]
      : 'unknown';
    const source = String(input[fields.sourceUrl] || '').trim();
    const evidence = String(input[fields.evidence] || '').trim();
    if (source && !normalizeOptionalUrl(source)) return `Enter a valid ${channel} evidence URL`;
    if (status === 'business_contact' && !source) {
      return `A source URL is required to verify the published ${channel} contact`;
    }
    if (status === 'consented' && !source && !evidence) {
      return `Record where or how ${channel} consent was received`;
    }
    if (['business_contact', 'consented'].includes(status)) {
      if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(input.email, 240))) {
        return 'Add a valid work email before verifying email permission';
      }
      if (channel === 'whatsapp' && !hasUsableProspectWhatsAppIdentity(input)) {
        return 'Add a usable WhatsApp number before verifying WhatsApp permission';
      }
    }
  }
  return null;
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

  for (const channel of PROSPECT_PERMISSION_CHANNELS) {
    const fields = channelPermissionFields(channel);
    const existingStatus = CHANNEL_PERMISSION_STATUSES.includes(existing[fields.status])
      ? existing[fields.status]
      : (existing.contact_permission_status === 'do_not_contact' || existing.status === 'do_not_contact'
          ? 'do_not_contact'
          : 'unknown');
    const incomingStatus = CHANNEL_PERMISSION_STATUSES.includes(incoming[fields.status])
      ? incoming[fields.status]
      : 'unknown';
    const status = upgradeContactPermission(existingStatus, incomingStatus);
    const incomingWon = status === incomingStatus && PERMISSION_RANK[incomingStatus] > PERMISSION_RANK[existingStatus];
    merged[fields.status] = status;
    for (const field of [fields.basis, fields.sourceUrl, fields.evidence, fields.verifiedAt, fields.verifiedBy]) {
      merged[field] = incomingWon ? (incoming[field] || existing[field] || null) : (existing[field] || null);
    }
  }

  merged.contact_permission_status = summarizeChannelPermissions(merged);
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
    || (['42703', 'PGRST204'].includes(code) && [
      'contact_source_url', 'enriched_at', 'people', 'linkedin_urls', 'whatsapp_numbers',
      ...CHANNEL_PERMISSION_FIELD_NAMES,
    ].some((column) => message.includes(column)))
    || (message.includes('sales_prospects') && (message.includes('does not exist') || message.includes('schema cache')));
}
