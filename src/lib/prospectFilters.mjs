const EARTH_RADIUS_KM = 6371.0088;

const finiteCoordinate = (value) => {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function prospectCoordinates(prospect = {}) {
  const latitude = finiteCoordinate(prospect.latitude);
  const longitude = finiteCoordinate(prospect.longitude);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function distanceKmBetween(left, right) {
  const a = prospectCoordinates(left);
  const b = prospectCoordinates(right);
  if (!a || !b) return null;

  const radians = (degrees) => degrees * (Math.PI / 180);
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function matchesProspectSearch(prospect = {}, value = '') {
  const search = String(value || '').trim().toLowerCase();
  if (!search) return true;

  const haystack = [
    prospect.organization_name,
    prospect.category,
    prospect.city,
    prospect.region,
    prospect.country,
    prospect.phone,
    prospect.email,
    prospect.owner_email,
  ].filter(Boolean).join(' ').toLowerCase();
  if (haystack.includes(search)) return true;

  const digits = normalizePhoneDigits(search);
  return digits.length >= 4 && normalizePhoneDigits(prospect.phone).includes(digits);
}

export function hasProspectContact(prospect = {}, kind = 'any') {
  const whatsapp = Array.isArray(prospect.whatsapp_numbers) && prospect.whatsapp_numbers.length > 0;
  const checks = {
    phone: Boolean(prospect.phone),
    email: Boolean(prospect.email),
    whatsapp,
    website: Boolean(prospect.website_url),
    reachable: Boolean(prospect.phone || prospect.email || whatsapp),
    missing_phone: !prospect.phone,
    missing_email: !prospect.email,
    no_website: !prospect.website_url,
    not_enriched: !prospect.enriched_at,
  };
  return kind === 'any' ? true : Boolean(checks[kind]);
}

export function resolvedDistanceLimit(choice, customValue) {
  if (!choice) return null;
  const value = choice === 'custom' ? Number(customValue) : Number(choice);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(1000, value);
}

export function filterDiscoveryProspects(prospects = [], {
  center = null,
  contact = 'any',
  distanceKm = null,
  excludeSaved = false,
  isSaved = () => false,
  minRating = 0,
  minReviews = 0,
  minScore = 0,
  sortBy = 'relevance',
} = {}) {
  const rows = prospects.filter((prospect) => {
    if (excludeSaved && isSaved(prospect)) return false;
    if (!hasProspectContact(prospect, contact)) return false;
    if (Number(prospect.fit_score || 0) < Number(minScore || 0)) return false;
    if (Number(prospect.rating || 0) < Number(minRating || 0)) return false;
    if (Number(prospect.user_rating_count || 0) < Number(minReviews || 0)) return false;
    if (distanceKm != null) {
      const distance = distanceKmBetween(center, prospect);
      if (distance == null || distance > distanceKm) return false;
    }
    return true;
  });

  const byName = (a, b) => String(a.organization_name || '').localeCompare(String(b.organization_name || ''));
  const sorters = {
    distance: (a, b) => (distanceKmBetween(center, a) ?? Infinity) - (distanceKmBetween(center, b) ?? Infinity) || byName(a, b),
    rating: (a, b) => Number(b.rating || 0) - Number(a.rating || 0) || byName(a, b),
    score: (a, b) => Number(b.fit_score || 0) - Number(a.fit_score || 0) || byName(a, b),
  };
  return sorters[sortBy] ? [...rows].sort(sorters[sortBy]) : rows;
}

export function chunkProspects(items = [], size = 100) {
  const safeSize = Math.max(1, Math.floor(Number(size) || 1));
  const chunks = [];
  for (let index = 0; index < items.length; index += safeSize) chunks.push(items.slice(index, index + safeSize));
  return chunks;
}
