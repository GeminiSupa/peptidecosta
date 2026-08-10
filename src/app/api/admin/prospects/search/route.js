import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { buildProspectSearchQuery, normalizeOpenStreetMapPlace } from '@/lib/prospects.mjs';

export const dynamic = 'force-dynamic';

const DEFAULT_NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const CACHE_TTL_MS = 10 * 60 * 1000;
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
  if (searchCache.size >= 100) {
    const oldest = searchCache.keys().next().value;
    searchCache.delete(oldest);
  }
  searchCache.set(key, { createdAt: Date.now(), value });
}

async function searchOpenStreetMap(query, location) {
  const textQuery = buildProspectSearchQuery(query, location);
  const cached = cacheGet(textQuery.toLowerCase());
  if (cached) return { prospects: cached, query: textQuery, cached: true };

  const url = new URL(process.env.NOMINATIM_BASE_URL || DEFAULT_NOMINATIM_URL);
  url.searchParams.set('q', textQuery);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('extratags', '1');
  url.searchParams.set('namedetails', '1');
  url.searchParams.set('dedupe', '1');
  url.searchParams.set('limit', '20');

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peptidescostarica.com';
  const requestOpenStreetMap = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1050));
    return fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'es,en;q=0.8',
        'User-Agent': `CostaPeptidesProspector/1.0 (${siteUrl})`,
      },
    });
  };
  const responsePromise = nominatimQueue.then(requestOpenStreetMap, requestOpenStreetMap);
  nominatimQueue = responsePromise.then(() => undefined, () => undefined);
  const response = await responsePromise;
  if (!response.ok) {
    console.error('[Prospector Search] OpenStreetMap error:', response.status);
    throw new Error('OpenStreetMap search is temporarily unavailable');
  }

  const payload = await response.json();
  const prospects = Array.isArray(payload)
    ? payload
        .filter((item) => item.type !== 'parking')
        .map(normalizeOpenStreetMapPlace)
        .filter((item) => item.organization_name)
        .sort((a, b) => b.fit_score - a.fit_score)
    : [];
  cacheSet(textQuery.toLowerCase(), prospects);
  return { prospects, query: textQuery, cached: false };
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

    const result = await searchOpenStreetMap(query, location);
    return NextResponse.json({ ...result, provider: 'OpenStreetMap' });
  } catch (error) {
    const timeout = error?.name === 'TimeoutError';
    console.error('[Prospector Search] Failed:', error.message);
    return NextResponse.json({
      error: timeout ? 'Business search timed out. Try again.' : 'Unable to search businesses right now.',
    }, { status: timeout ? 504 : 502 });
  }
}
