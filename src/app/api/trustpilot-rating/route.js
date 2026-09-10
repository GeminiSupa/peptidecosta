import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Cache result for 6 hours so we don't hit Trustpilot on every page load.
export const revalidate = 21600;

const TRUSTPILOT_URL = 'https://www.trustpilot.com/review/peptidescostarica.net';

// Fallback values used if the fetch or parse fails for any reason.
const FALLBACK = { rating: '4.6', reviewCount: 11 };

/**
 * Fetch the live Trustpilot rating by parsing the __NEXT_DATA__ blob that
 * Trustpilot embeds in their SSR page. This is the same JSON the browser
 * hydrates from — it is stable and contains the TrustScore and review count.
 *
 * We cache for 6 hours (revalidate=21600) so a single edge request serves
 * thousands of visitors without triggering rate-limits.
 */
async function fetchLiveTrustpilotRating() {
  const response = await fetch(TRUSTPILOT_URL, {
    headers: {
      // Mimic a real browser so Cloudflare does not immediately block us.
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    next: { revalidate: 21600 },
  });

  if (!response.ok) {
    throw new Error(`Trustpilot returned ${response.status}`);
  }

  const html = await response.text();

  // Extract the __NEXT_DATA__ JSON blob.
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    // Fallback: try a simple regex on the HTML directly.
    const scoreMatch = html.match(/"trustScore"\s*:\s*"?([\d.]+)"?/);
    const countMatch = html.match(/"numberOfReviews"\s*:\s*(\d+)/);
    if (scoreMatch) {
      return {
        rating: scoreMatch[1],
        reviewCount: countMatch ? parseInt(countMatch[1], 10) : FALLBACK.reviewCount,
      };
    }
    throw new Error('__NEXT_DATA__ not found in Trustpilot page');
  }

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new Error('Failed to parse __NEXT_DATA__ JSON');
  }

  // The path varies slightly across Trustpilot's deployments.
  // Walk the tree to find the businessUnit / trustScore nodes.
  const props = data?.props?.pageProps;

  // Try several known paths where TrustScore lives.
  const score =
    props?.businessUnit?.trustScore
    ?? props?.businessUnit?.score?.trustScore
    ?? props?.filters?.businessUnit?.trustScore
    ?? searchDeep(data, 'trustScore');

  const count =
    props?.businessUnit?.numberOfReviews?.total
    ?? props?.businessUnit?.numberOfReviews
    ?? props?.filters?.businessUnit?.numberOfReviews?.total
    ?? searchDeep(data, 'numberOfReviews');

  if (!score) throw new Error('TrustScore not found in __NEXT_DATA__');

  const rating = typeof score === 'number' ? score.toFixed(1) : String(score);
  const reviewCount = typeof count === 'number' ? count : (parseInt(count, 10) || FALLBACK.reviewCount);

  return { rating, reviewCount };
}

/**
 * Breadth-first search for a scalar value by key name.
 * Trustpilot's JSON nesting depth changes between deployments so we search
 * rather than hardcode a fixed path.
 */
function searchDeep(obj, key, maxDepth = 8) {
  if (!obj || typeof obj !== 'object' || maxDepth === 0) return undefined;
  if (key in obj) return obj[key];
  for (const child of Object.values(obj)) {
    const found = searchDeep(child, key, maxDepth - 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

export async function GET() {
  try {
    const { rating, reviewCount } = await fetchLiveTrustpilotRating();
    return NextResponse.json(
      { rating, reviewCount, source: 'live' },
      {
        headers: {
          // Also tell the browser / CDN to cache this for 6 hours.
          'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600',
        },
      },
    );
  } catch (err) {
    console.error('[trustpilot-rating] Fetch failed, returning fallback:', err.message);
    return NextResponse.json(
      { ...FALLBACK, source: 'fallback' },
      {
        status: 200,
        headers: {
          // Short cache on fallback so next request retries sooner.
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      },
    );
  }
}
