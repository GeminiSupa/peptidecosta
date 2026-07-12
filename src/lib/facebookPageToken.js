// Resolves a usable Facebook **Page** access token.
//
// FACEBOOK_PAGE_ACCESS_TOKEN may hold either a real Page token OR a System
// User / User token that manages the Page. Page endpoints (publishing, Messenger
// send, comment replies) require a *Page* token, and a System User token triggers
// Meta error #210. This helper transparently exchanges whatever token is
// configured for the correct Page token and caches it, so the same env var works
// no matter which token type was pasted in.

const GRAPH = 'https://graph.facebook.com/v21.0';
const TTL_MS = 30 * 60 * 1000; // re-resolve every 30 min

// Module-level cache (persists across requests in a warm serverless instance).
let _cache = { token: null, at: 0 };

function pageId() {
  return process.env.FACEBOOK_PAGE_ID || process.env.MESSENGER_PAGE_ID || '';
}

/**
 * Return a working Page access token, or null if nothing is configured.
 * @param {{ force?: boolean }} [opts] force=true bypasses the cache (use after a 190/210 error)
 */
export async function getPageAccessToken(opts = {}) {
  const raw = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!raw) return null;

  if (!opts.force && _cache.token && Date.now() - _cache.at < TTL_MS) {
    return _cache.token;
  }

  const pid = pageId();

  // Preferred: ask Graph for this Page's token using whatever token we hold.
  // Works whether `raw` is a System User token, a User token, or already a Page
  // token (a Page token reading its own access_token returns itself).
  if (pid) {
    try {
      const res = await fetch(`${GRAPH}/${pid}?fields=access_token&access_token=${raw}`);
      const data = await res.json();
      if (data && data.access_token) {
        _cache = { token: data.access_token, at: Date.now() };
        return data.access_token;
      }
    } catch { /* fall through */ }
  }

  // Fallback: enumerate managed Pages and pick ours (or the first one).
  try {
    const res = await fetch(`${GRAPH}/me/accounts?fields=id,access_token&access_token=${raw}`);
    const data = await res.json();
    const list = (data && data.data) || [];
    const match = pid ? list.find((p) => p.id === pid) : list[0];
    if (match && match.access_token) {
      _cache = { token: match.access_token, at: Date.now() };
      return match.access_token;
    }
  } catch { /* fall through */ }

  // Last resort: assume the configured token is already a usable Page token.
  _cache = { token: raw, at: Date.now() };
  return raw;
}

/** Clear the cached Page token (e.g. after Meta returns 190/210). */
export function clearPageTokenCache() {
  _cache = { token: null, at: 0 };
}

export function isFacebookConfigured() {
  return Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
}
