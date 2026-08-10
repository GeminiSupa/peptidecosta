import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import {
  buildProspectSearchQuery,
  dedupeAndRankProspects,
  normalizeOpenStreetMapPlace,
  normalizeOverpassElement,
  prospectSearchProfile,
} from '@/lib/prospects.mjs';

export const dynamic = 'force-dynamic';

const DEFAULT_NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const CACHE_TTL_MS = 15 * 60 * 1000;
const searchCache = new Map();
let nominatimQueue = Promise.resolve();

function cacheGet(key) {
  const cached = searchCache.get(key);
  if (!cached || Date.now() - cached.createdAt > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return cached.value;
}

function cacheSet(key, value) {
  if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, { createdAt: Date.now(), value });
}

async function nominatimSearch(q, limit = 20) {
  const url = new URL(process.env.NOMINATIM_BASE_URL || DEFAULT_NOMINATIM_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('extratags', '1');
  url.searchParams.set('namedetails', '1');
  url.searchParams.set('dedupe', '1');
  url.searchParams.set('limit', String(limit));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peptidescostarica.com';
  const run = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1050));
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en,es;q=0.8',
        'User-Agent': `CostaPeptidesProspector/1.0 (${siteUrl})`,
      },
    });
    if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
  };
  const responsePromise = nominatimQueue.then(run, run);
  nominatimQueue = responsePromise.then(() => undefined, () => undefined);
  return responsePromise;
}

function locationContext(place) {
  if (!place) return null;
  const bounds = (place.boundingbox || []).map(Number);
  const validBounds = bounds.length === 4 && bounds.every(Number.isFinite);
  return {
    bbox: validBounds ? { south: bounds[0], north: bounds[1], west: bounds[2], east: bounds[3] } : null,
    countryCode: String(place.address?.country_code || '').toUpperCase(),
    country: place.address?.country || null,
    city: place.address?.city || place.address?.town || place.address?.village || null,
    region: place.address?.state || null,
    displayName: place.display_name || null,
    isCountry: place.addresstype === 'country',
  };
}

function escapeOverpassRegex(value) {
  return String(value || '').replace(/[\\"\n\r]/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
}

function buildOverpassQuery(profile, context) {
  if (!context?.bbox && !(context?.isCountry && context.countryCode)) return null;
  const useCountryArea = context.isCountry && /^[A-Z]{2}$/.test(context.countryCode);
  const scope = useCountryArea
    ? '(area.searchArea)'
    : `(${context.bbox.south},${context.bbox.west},${context.bbox.north},${context.bbox.east})`;
  const prelude = useCountryArea
    ? `area["ISO3166-1"="${context.countryCode}"][admin_level=2]->.searchArea;`
    : '';
  const clauses = profile.tagFilters.map(([key, pattern]) => `nwr["${key}"~"${pattern}"]${scope};`);
  const controlledPattern = profile.tagFilters.length ? profile.namePattern : escapeOverpassRegex(profile.namePattern);
  const bboxArea = context.bbox
    ? Math.abs((context.bbox.north - context.bbox.south) * (context.bbox.east - context.bbox.west))
    : Infinity;
  // Country-wide regex scans are expensive on shared Overpass infrastructure.
  // Indexed category tags provide broad country coverage; name matching remains
  // enabled for the much smaller city/region bounding boxes.
  if (controlledPattern && !useCountryArea && bboxArea <= 12) clauses.push(`nwr["name"~"${controlledPattern}",i]${scope};`);
  if (!clauses.length) return null;
  return `[out:json][timeout:22];${prelude}(${clauses.join('')});out tags center 80;`;
}

async function overpassSearch(profile, context) {
  const query = buildOverpassQuery(profile, context);
  if (!query) return [];
  const response = await fetch(process.env.OVERPASS_BASE_URL || DEFAULT_OVERPASS_URL, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(27_000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'CostaPeptidesProspector/1.0',
    },
    body: new URLSearchParams({ data: query }),
  });
  if (!response.ok) throw new Error(`Overpass returned HTTP ${response.status}`);
  const payload = await response.json();
  return (payload.elements || [])
    .map((element) => normalizeOverpassElement(element, context))
    .filter((prospect) => prospect.organization_name && prospect.latitude != null && prospect.longitude != null);
}

async function searchOpenStreetMap(query, location) {
  const textQuery = buildProspectSearchQuery(query, location);
  const cacheKey = textQuery.toLowerCase();
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, cached: true };

  const profile = prospectSearchProfile(query);
  let context = null;
  const warnings = [];
  if (location) {
    try {
      const locationMatches = await nominatimSearch(location, 1);
      context = locationContext(locationMatches[0]);
      if (!context) warnings.push('Location could not be resolved precisely; showing fallback matches.');
    } catch (error) {
      console.warn('[Prospector Search] Location lookup failed:', error.message);
      warnings.push('Location lookup was limited; showing fallback matches.');
    }
  }

  const tasks = [nominatimSearch(textQuery, 30)];
  if (context) tasks.push(overpassSearch(profile, context));
  const results = await Promise.allSettled(tasks);
  const directPlaces = results[0].status === 'fulfilled' ? results[0].value : [];
  const directProspects = directPlaces
    .filter((item) => item.type !== 'parking')
    .map(normalizeOpenStreetMapPlace);
  const overpassProspects = results[1]?.status === 'fulfilled' ? results[1].value : [];
  if (results[0].status === 'rejected') warnings.push('Named-place fallback was unavailable.');
  if (results[1]?.status === 'rejected') {
    console.warn('[Prospector Search] POI search failed:', results[1].reason?.message);
    warnings.push('Expanded category search was temporarily unavailable; showing named-place matches.');
  }

  const prospects = dedupeAndRankProspects([...overpassProspects, ...directProspects], query, 80);
  const result = {
    prospects,
    query: textQuery,
    cached: false,
    provider: context ? 'OpenStreetMap + Overpass' : 'OpenStreetMap',
    locationResolved: context?.displayName || null,
    warnings,
  };
  cacheSet(cacheKey, result);
  return result;
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const query = String(body.query || '').trim().slice(0, 180);
    const location = String(body.location || '').trim().slice(0, 120);
    if (query.length < 2) {
      return NextResponse.json({ error: 'Enter a business type or keyword' }, { status: 400 });
    }
    return NextResponse.json(await searchOpenStreetMap(query, location));
  } catch (error) {
    const timeout = error?.name === 'TimeoutError';
    console.error('[Prospector Search] Failed:', error.message);
    return NextResponse.json({
      error: timeout ? 'Business search timed out. Try a more specific city or region.' : 'Unable to search businesses right now.',
    }, { status: timeout ? 504 : 502 });
  }
}
