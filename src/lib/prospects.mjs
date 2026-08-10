export const PROSPECT_STATUSES = [
  'discovered',
  'review',
  'qualified',
  'contacted',
  'responded',
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

export function scoreProspect(prospect = {}) {
  let score = 15;
  const reasons = [];
  const targetTypes = new Set([
    'gym',
    'fitness_center',
    'personal_trainer',
    'wellness_center',
    'nutritionist',
    'sports_medicine_clinic',
    'medical_clinic',
    'health_consultant',
    'spa',
  ]);

  const primaryType = clean(prospect.primary_type || prospect.primaryType || prospect.category, 120).toLowerCase();
  if ([...targetTypes].some((type) => primaryType.includes(type))) {
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
  if (Number(prospect.rating) >= 4.3) {
    score += 10;
    reasons.push('Strong public rating');
  }
  if (Number(prospect.user_rating_count || prospect.userRatingCount) >= 20) {
    score += 10;
    reasons.push('Established review volume');
  }
  if (prospect.city || prospect.region || prospect.formatted_address || prospect.formattedAddress) {
    score += 5;
    reasons.push('Location identified');
  }

  return { score: Math.min(100, score), reasons: reasons.slice(0, 4) };
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
  const phone = tags.phone || tags['contact:phone'] || place.phone;
  const email = tags.email || tags['contact:email'] || place.email;
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  const category = clean(
    tags.healthcare || tags.leisure || tags.amenity || tags.office || place.type || place.category,
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
    contact_permission_status: email || phone ? 'business_contact' : 'unknown',
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
    country: clean(input.country || 'Costa Rica', 140) || 'Costa Rica',
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

export function isProspectsTableMissing(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01'
    || code === 'PGRST205'
    || (['42703', 'PGRST204'].includes(code) && (message.includes('contact_source_url') || message.includes('enriched_at') || message.includes('people') || message.includes('linkedin_urls')))
    || (message.includes('sales_prospects') && (message.includes('does not exist') || message.includes('schema cache')));
}
