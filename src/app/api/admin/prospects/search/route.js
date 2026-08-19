import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { MAX_SEARCH_AREA_DEGREES, normalizeSearchBbox } from '@/lib/prospectMap.mjs';
import {
  buildProspectSearchQuery,
  dedupeAndRankProspects,
  expandAnchoredTagPattern,
  isRetryableOverpassStatus,
  normalizeOpenStreetMapPlace,
  normalizeOverpassElement,
  overpassEndpoints,
  prospectSearchProfile,
  searchCacheTtlMs,
} from '@/lib/prospects.mjs';

export const dynamic = 'force-dynamic';
// Worst case is a geocode and a named-place lookup serialized behind the 1 req/s
// Nominatim throttle, racing a country-wide Overpass query.
export const maxDuration = 60;

const DEFAULT_NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Overpass gets a shared budget rather than a per-attempt one: three mirrors
// each allowed the full 27s would overrun this route's 60s maxDuration and
// return nothing at all, which is worse than the degradation it is fixing.
const OVERPASS_TOTAL_BUDGET_MS = 40_000;
const OVERPASS_ATTEMPT_TIMEOUT_MS = 27_000;
const OVERPASS_MIN_ATTEMPT_MS = 6_000;
const searchCache = new Map();
let nominatimQueue = Promise.resolve();

function cacheGet(key) {
  const cached = searchCache.get(key);
  if (!cached || Date.now() - cached.createdAt > cached.ttl) {
    searchCache.delete(key);
    return null;
  }
  return cached.value;
}

function cacheSet(key, value, ttl) {
  if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, { createdAt: Date.now(), value, ttl });
}

async function nominatimSearch(q, limit = 20, bbox = null) {
  const url = new URL(process.env.NOMINATIM_BASE_URL || DEFAULT_NOMINATIM_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('extratags', '1');
  url.searchParams.set('namedetails', '1');
  url.searchParams.set('dedupe', '1');
  url.searchParams.set('limit', String(limit));
  // A map-area search means "what is in front of me", so the named-place half
  // is confined to the same rectangle the category half already uses.
  if (bbox) {
    url.searchParams.set('viewbox', [bbox.west, bbox.north, bbox.east, bbox.south].join(','));
    url.searchParams.set('bounded', '1');
  }

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
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  return {
    bbox: validBounds ? { south: bounds[0], north: bounds[1], west: bounds[2], east: bounds[3] } : null,
    center: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : validBounds
        ? { latitude: (bounds[0] + bounds[1]) / 2, longitude: (bounds[2] + bounds[3]) / 2 }
        : null,
    countryCode: String(place.address?.country_code || '').toUpperCase(),
    country: place.address?.country || null,
    city: place.address?.city || place.address?.town || place.address?.village || null,
    region: place.address?.state || null,
    displayName: place.display_name || null,
    isCountry: place.addresstype === 'country',
  };
}

/** A map rectangle already is the search area, so no geocode is needed. */
function bboxContext(bbox) {
  return {
    bbox,
    center: {
      latitude: (bbox.south + bbox.north) / 2,
      longitude: (bbox.west + bbox.east) / 2,
    },
    countryCode: '',
    country: null,
    city: null,
    region: null,
    // Deliberately null: normalizeOverpassElement folds displayName into each
    // result's address, and "Iron House Gym, the visible map area" is not an
    // address. The human label for the area is applied to the events instead.
    displayName: null,
    isCountry: false,
  };
}

const bboxCacheKey = (bbox) => (bbox
  ? [bbox.south, bbox.west, bbox.north, bbox.east].map((value) => value.toFixed(3)).join(',')
  : '');

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
  // One indexed exact-match clause per literal value; see expandAnchoredTagPattern.
  const clauses = profile.tagFilters.flatMap(([key, pattern]) => {
    const literals = expandAnchoredTagPattern(pattern);
    return literals
      ? literals.map((value) => `nwr["${key}"="${value}"]${scope};`)
      : [`nwr["${key}"~"${pattern}"]${scope};`];
  });
  const controlledPattern = profile.tagFilters.length ? profile.namePattern : escapeOverpassRegex(profile.namePattern);
  const bboxArea = context.bbox
    ? Math.abs((context.bbox.north - context.bbox.south) * (context.bbox.east - context.bbox.west))
    : Infinity;
  // Country-wide regex scans are expensive on shared Overpass infrastructure.
  // Indexed category tags provide broad country coverage; name matching remains
  // enabled for the much smaller city/region bounding boxes.
  if (controlledPattern && !useCountryArea && bboxArea <= MAX_SEARCH_AREA_DEGREES) clauses.push(`nwr["name"~"${controlledPattern}",i]${scope};`);
  if (!clauses.length) return null;
  // Declared generously on purpose. The same query that came back 504 under
  // [timeout:22] succeeded in 11s under a larger one — Overpass uses the
  // declared budget to schedule, so asking for too little gets you rejected
  // rather than served quickly. Our own client abort is the real ceiling.
  return `[out:json][timeout:40];${prelude}(${clauses.join('')});out tags center 80;`;
}

async function overpassAttempt(endpoint, query, timeoutMs) {
  const response = await fetch(endpoint, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'CostaPeptidesProspector/1.0',
    },
    body: new URLSearchParams({ data: query }),
  });
  if (!response.ok) {
    const error = new Error(`Overpass returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/**
 * Runs the category query against each mirror until one answers.
 *
 * Only the last failure is thrown, because that is what the caller reports and
 * an earlier mirror's rate limit says nothing useful about why the search has
 * no category results.
 */
async function overpassSearch(profile, context) {
  const query = buildOverpassQuery(profile, context);
  if (!query) return [];

  const endpoints = overpassEndpoints(process.env.OVERPASS_BASE_URL);
  const deadline = Date.now() + OVERPASS_TOTAL_BUDGET_MS;
  let lastError = new Error('Overpass was not reachable');

  for (const [index, endpoint] of endpoints.entries()) {
    const remaining = deadline - Date.now();
    if (remaining < OVERPASS_MIN_ATTEMPT_MS) break;

    try {
      const payload = await overpassAttempt(endpoint, query, Math.min(remaining, OVERPASS_ATTEMPT_TIMEOUT_MS));
      if (index > 0) console.warn(`[Prospector Search] Overpass answered from fallback mirror ${endpoint}`);
      return (payload.elements || [])
        .map((element) => normalizeOverpassElement(element, context))
        .filter((prospect) => prospect.organization_name && prospect.latitude != null && prospect.longitude != null);
    } catch (error) {
      lastError = error;
      // A rejected query is rejected everywhere; only endpoint-level problems
      // are worth another mirror.
      const worthRetrying = error.status === undefined || isRetryableOverpassStatus(error.status);
      console.warn(`[Prospector Search] Overpass mirror ${endpoint} failed:`, error.message);
      if (!worthRetrying) break;
    }
  }

  throw lastError;
}

/**
 * Runs a search, yielding each half of it as soon as that half is ready.
 *
 * The two halves have very different latencies: named places come back in a
 * second or two, while a category query can legitimately spend forty seconds
 * walking three Overpass mirrors. Waiting for both before showing anything
 * meant the operator watched a spinner for the worst case of every search,
 * including the ones where usable results already existed. Yielding turns that
 * into a list that fills in.
 */
async function* streamOpenStreetMapSearch(query, location, bbox) {
  const textQuery = buildProspectSearchQuery(query, location);
  const cacheKey = `${textQuery.toLowerCase()}|${bboxCacheKey(bbox)}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    yield { type: 'complete', ...cached, cached: true };
    return;
  }

  const profile = prospectSearchProfile(query);
  const warnings = [];
  let context = bbox ? bboxContext(bbox) : null;

  if (!context && location) {
    try {
      const locationMatches = await nominatimSearch(location, 1);
      context = locationContext(locationMatches[0]);
      if (!context) warnings.push('Location could not be resolved precisely; showing fallback matches.');
    } catch (error) {
      console.warn('[Prospector Search] Location lookup failed:', error.message);
      warnings.push('Location lookup was limited; showing fallback matches.');
    }
  }

  const provider = context ? 'OpenStreetMap + Overpass' : 'OpenStreetMap';
  const locationResolved = context?.displayName || (bbox ? 'the visible map area' : null);
  yield {
    type: 'meta',
    query: textQuery,
    provider,
    locationResolved,
    searchCenter: context?.center || null,
    // The client uses this to decide whether a second wave is still coming.
    categorySearch: Boolean(context),
  };

  const namedPlaces = nominatimSearch(textQuery, 30, context?.bbox || null);
  const categoryPlaces = context ? overpassSearch(profile, context) : Promise.resolve([]);
  // Nothing may observe a rejection later than its `await` below, or Node kills
  // the process for an unhandled rejection while Overpass is still running.
  namedPlaces.catch(() => {});
  categoryPlaces.catch(() => {});

  let directProspects = [];
  try {
    directProspects = (await namedPlaces)
      .filter((item) => item.type !== 'parking')
      .map(normalizeOpenStreetMapPlace);
    if (directProspects.length) {
      yield {
        type: 'partial',
        stage: 'named_places',
        prospects: dedupeAndRankProspects(directProspects, query, 80),
      };
    }
  } catch (error) {
    console.warn('[Prospector Search] Named-place search failed:', error.message);
    warnings.push('Named-place fallback was unavailable.');
  }

  let overpassProspects = [];
  try {
    overpassProspects = await categoryPlaces;
  } catch (error) {
    console.warn('[Prospector Search] POI search failed on every mirror:', error.message);
    // Country-wide scans are the shape mirrors refuse, and narrowing the area
    // is a fix the operator can apply now — so say that instead of "try later".
    warnings.push(context?.isCountry
      ? 'Category search is rate-limited for country-wide scans; showing named-place matches. Search a city or province for the full results.'
      : 'Category search was unavailable on every mirror; showing named-place matches. Try again in a minute.');
  }

  const result = {
    prospects: dedupeAndRankProspects([...overpassProspects, ...directProspects], query, 80),
    query: textQuery,
    cached: false,
    provider,
    locationResolved,
    searchCenter: context?.center || null,
    warnings,
  };
  cacheSet(cacheKey, result, searchCacheTtlMs(warnings));
  yield { type: 'complete', ...result };
}

/**
 * Newline-delimited JSON rather than SSE.
 *
 * The client reads this with a plain `fetch` and a stream reader, and NDJSON
 * needs no event framing to parse one object per line — SSE's `data:` prefixes
 * would only be overhead for a response nothing subscribes to twice.
 */
function ndjsonStream(events) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        const timeout = error?.name === 'TimeoutError';
        console.error('[Prospector Search] Failed:', error.message);
        // The status line is long gone by now, so a failure has to travel
        // in-band or the client sees a truncated stream and no reason for it.
        controller.enqueue(encoder.encode(`${JSON.stringify({
          type: 'error',
          error: timeout
            ? 'Business search timed out. Try a more specific city or region.'
            : 'Unable to search businesses right now.',
        })}\n`));
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const query = String(body.query || '').trim().slice(0, 180);
  const location = String(body.location || '').trim().slice(0, 120);
  if (query.length < 2) {
    return NextResponse.json({ error: 'Enter a business type or keyword' }, { status: 400 });
  }

  const bbox = normalizeSearchBbox(body.bbox);
  if (body.bbox && !bbox) {
    return NextResponse.json({ error: 'That map area is too large or not a valid rectangle. Zoom in and try again.' }, { status: 400 });
  }

  return new Response(ndjsonStream(streamOpenStreetMapSearch(query, location, bbox)), {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
